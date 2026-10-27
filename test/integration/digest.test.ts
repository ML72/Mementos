import request from 'supertest';
import mongoose from 'mongoose';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import app from '../../src/server/index';
import { User, Note } from '../../src/server/models';
import { DigestService, MemoryMailer, setMailer } from '../../src/server/service';
import { nextDigestAt } from '../../src/server/service/internal/digest';
import { unsubscribeUrl } from '../../src/server/config';
import { EMAIL } from '../../src/server/settings';
import { registerVerified } from '../helpers/auth';

const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/mementos_test_digest';
const DAY = 24 * 3600 * 1000;
const SUBJECT = 'Your weekly Mementos digest';

const mailer = new MemoryMailer();
const digestService = new DigestService();

describe('Weekly digest', () => {
    const throttle = EMAIL.DIGEST.THROTTLE_MS;

    beforeAll(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        await mongoose.connect(TEST_MONGO_URI);
        setMailer(mailer);
        EMAIL.DIGEST.THROTTLE_MS = 0;
    });

    afterAll(async () => {
        EMAIL.DIGEST.THROTTLE_MS = throttle;
        setMailer(null);
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.dropDatabase();
            await mongoose.connection.close();
        }
    });

    beforeEach(async () => {
        await User.deleteMany({});
        await Note.deleteMany({});
        mailer.reset();
    });

    // --- helpers -----------------------------------------------------------
    const register = (email: string, fullName = 'Test User') => registerVerified(email, 'password123', fullName);
    const dbUser = async (email: string) => (await User.findOne({ 'login.email': email }).lean()) as any;
    const idOf = async (email: string) => (await dbUser(email))._id.toString();
    const setEmailSettings = (email: string, fields: Record<string, unknown>) => User.updateOne(
        { 'login.email': email },
        { $set: Object.fromEntries(Object.entries(fields).map(([key, value]) => [`settings.email.${key}`, value])) }
    );
    /** As if this user's slot had just passed. */
    const makeDue = (email: string) => setEmailSettings(email, { nextDigestAt: new Date(Date.now() - 60 * 1000) });
    const digests = (email: string) => mailer.to(email).filter(m => m.subject === SUBJECT);
    const createNote = (token: string, body: any) => request(app).post('/api/notes').set('x-auth-token', token).send(body);
    const follow = (token: string, id: string) => request(app).post(`/api/users/${id}/follow`).set('x-auth-token', token).send();
    const getSettings = (token: string) => request(app).get('/api/users/settings').set('x-auth-token', token);
    const putSettings = (token: string, body: any) => request(app).put('/api/users/settings').set('x-auth-token', token).send(body);
    // -----------------------------------------------------------------------

    describe('Scheduling', () => {
        it('puts a new account on the weekday it was created, at 12AM UTC, without mailing it', async () => {
            await register('new@example.com');
            const now = new Date();

            expect(await digestService.run(now)).toMatchObject({ success: true, sent: 0, rescheduled: 1 });
            expect(digests('new@example.com')).toHaveLength(0);

            const user = await dbUser('new@example.com');
            const day = new Date(user.dateCreated).getUTCDay();
            const next = new Date(user.settings.email.nextDigestAt);
            expect(user.settings.email.digestDay).toBe(day);
            expect(next).toEqual(nextDigestAt(day, now));
            // Created today, so the first digest comes on this weekday next week.
            expect(next.getTime() - now.getTime()).toBeGreaterThan(6 * DAY);
            expect(next.getTime() - now.getTime()).toBeLessThanOrEqual(7 * DAY);
        });
    });

    describe('Sending', () => {
        it('mails a due user the reminder first, then their own and followed notes, with an unsubscribe header', async () => {
            const reader = await register('reader@example.com', 'Reader');
            const friend = await register('friend@example.com', 'Friend <Name>');
            await createNote(reader, { subject: 'My own <b>note</b>', content: 'Mine' });
            await createNote(friend, { subject: 'Their note', content: 'Theirs' });
            await follow(reader, await idOf('friend@example.com'));
            await makeDue('reader@example.com');
            mailer.reset();

            const now = new Date();
            expect(await digestService.run(now)).toMatchObject({ success: true, sent: 1, failed: 0 });
            expect(digests('friend@example.com')).toHaveLength(0); // not due: just scheduled

            const [mail] = digests('reader@example.com');
            expect(mail.html.indexOf('Write this week')).toBeLessThan(mail.html.indexOf('Notes to review'));
            expect(mail.html).toContain('My own &lt;b&gt;note&lt;/b&gt;');
            expect(mail.html).toContain('Your note');
            expect(mail.html).toContain('Their note');
            expect(mail.html).toContain('Friend &lt;Name&gt;');

            const email = (await dbUser('reader@example.com')).settings.email;
            expect(mail.headers!['List-Unsubscribe']).toBe(`<${unsubscribeUrl(email.unsubscribeToken)}>`);
            expect(mail.headers!['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
            expect(new Date(email.lastDigestSentAt)).toEqual(now);
            expect(new Date(email.nextDigestAt)).toEqual(nextDigestAt(email.digestDay, now, now));
        });

        it('leaves the feed alone: no note counts as reviewed or seen', async () => {
            const token = await register('quiet@example.com');
            const noteId = (await createNote(token, { subject: 'Review me', content: 'c' })).body._id;
            await makeDue('quiet@example.com');

            await digestService.run(new Date());
            expect(digests('quiet@example.com')[0].html).toContain('Review me');

            const note = await Note.findById(noteId).lean() as any;
            expect(note.review.reviewCount).toBe(0);
            expect(note.review.lastReviewedAt).toBeNull();
            expect((await dbUser('quiet@example.com')).feed.recentlySeen).toHaveLength(0);
        });

        it('mails nobody twice, whether runs overlap or run again', async () => {
            await register('once@example.com');
            await makeDue('once@example.com');
            mailer.reset();

            // Distinct clocks, as on separate instances: identical writes would hide a missing claim.
            const now = new Date();
            const results = await Promise.all([0, 1, 2].map(ms => digestService.run(new Date(now.getTime() + ms))));
            expect(results.reduce((sent, r) => sent + r.sent, 0)).toBe(1);
            expect((await digestService.run(new Date(now.getTime() + 3600 * 1000))).sent).toBe(0);
            expect(digests('once@example.com')).toHaveLength(1);
        });

        it('skips unverified and undeliverable addresses and opted-out users, moving the first two to their next slot', async () => {
            await request(app).post('/api/users').send({ email: 'unverified@example.com', password: 'password123', fullName: 'U' });
            await register('bounced@example.com');
            await register('off@example.com');
            await setEmailSettings('bounced@example.com', { deliveryStatus: 'bounced' });
            await setEmailSettings('off@example.com', { weeklyDigest: false });
            for (const email of ['unverified@example.com', 'bounced@example.com', 'off@example.com']) await makeDue(email);
            mailer.reset();

            const now = new Date();
            expect((await digestService.run(now)).sent).toBe(0);
            expect(mailer.sent).toHaveLength(0);
            for (const email of ['unverified@example.com', 'bounced@example.com']) {
                expect(new Date((await dbUser(email)).settings.email.nextDigestAt).getTime()).toBeGreaterThan(now.getTime());
            }
        });

        it('keeps digests 6 days apart even when a slot says otherwise', async () => {
            await register('gap@example.com');
            const now = new Date();
            const lastSentAt = new Date(now.getTime() - 2 * DAY);
            await setEmailSettings('gap@example.com', { lastDigestSentAt: lastSentAt, nextDigestAt: new Date(now.getTime() - 60 * 1000) });
            mailer.reset();

            expect(await digestService.run(now)).toMatchObject({ sent: 0, rescheduled: 1 });
            const next = new Date((await dbUser('gap@example.com')).settings.email.nextDigestAt);
            expect(next.getTime() - lastSentAt.getTime()).toBeGreaterThanOrEqual(6 * DAY);
            expect(digests('gap@example.com')).toHaveLength(0);
        });

        it('hands the slot back when sending fails on our side, and the next run retries', async () => {
            await register('flaky@example.com');
            await makeDue('flaky@example.com');
            const slot = (await dbUser('flaky@example.com')).settings.email.nextDigestAt;

            mailer.failAddresses.set('flaky@example.com', 'transient');
            expect(await digestService.run(new Date())).toMatchObject({ sent: 0, failed: 1 });
            const email = (await dbUser('flaky@example.com')).settings.email;
            expect(email.nextDigestAt).toEqual(slot);
            expect(email.lastDigestSentAt).toBeNull();

            mailer.failAddresses.clear();
            expect((await digestService.run(new Date())).sent).toBe(1);
            expect(digests('flaky@example.com')).toHaveLength(1);
        });

        it('does not retry an address the mail server refused', async () => {
            await register('refused@example.com');
            await makeDue('refused@example.com');

            mailer.failAddresses.set('refused@example.com', 'hard');
            const now = new Date();
            expect(await digestService.run(now)).toMatchObject({ sent: 0, failed: 1 });
            mailer.failAddresses.clear();
            expect((await digestService.run(new Date(now.getTime() + 3600 * 1000))).sent).toBe(0);
            expect(new Date((await dbUser('refused@example.com')).settings.email.nextDigestAt).getTime()).toBeGreaterThan(now.getTime());
        });

        it('still sends the reminder when there is nothing to review', async () => {
            await register('blank@example.com');
            await makeDue('blank@example.com');
            await digestService.run(new Date());
            expect(digests('blank@example.com')[0].html).toContain('Nothing to review yet');
        });
    });

    describe('GET/PUT /api/users/settings', () => {
        it('shows the switch, the day and the next digest, and never the unsubscribe token', async () => {
            const token = await register('settings@example.com');
            const res = await getSettings(token);
            expect(res.statusCode).toBe(200);
            expect(Object.keys(res.body).sort()).toEqual(['digestDay', 'nextDigestAt', 'weeklyDigest']);

            const user = await dbUser('settings@example.com');
            expect(res.body.weeklyDigest).toBe(true);
            expect(res.body.digestDay).toBe(new Date(user.dateCreated).getUTCDay());
            // Not scheduled by the job yet, so this is the slot it will pick.
            expect(new Date(res.body.nextDigestAt).getUTCDay()).toBe(res.body.digestDay);
            expect(res.body.nextDigestAt).toMatch(/T00:00:00\.000Z$/);

            const secret = user.settings.email.unsubscribeToken;
            expect(JSON.stringify(res.body)).not.toContain(secret);
            expect(JSON.stringify((await request(app).get('/api/auth').set('x-auth-token', token)).body)).not.toContain(secret);
        });

        it('moves the next digest to the chosen day', async () => {
            const token = await register('move@example.com');
            const before = Date.now();
            const day = (new Date().getUTCDay() + 3) % 7;

            const res = await putSettings(token, { digestDay: day });
            expect(res.statusCode).toBe(200);
            expect(res.body.digestDay).toBe(day);
            const next = new Date(res.body.nextDigestAt);
            expect(next.getUTCDay()).toBe(day);
            expect(res.body.nextDigestAt).toMatch(/T00:00:00\.000Z$/);
            expect(next.getTime()).toBeGreaterThan(before);
            expect(next.getTime() - before).toBeLessThanOrEqual(7 * DAY);
            expect((await getSettings(token)).body).toEqual(res.body);
        });

        it('skips a week rather than send two digests within 6 days', async () => {
            const token = await register('near@example.com');
            const now = Date.now();
            await setEmailSettings('near@example.com', { lastDigestSentAt: new Date(now - 2 * DAY) });

            // Tomorrow would be about 3 days after the last digest.
            const tomorrow = new Date(now + DAY);
            const res = await putSettings(token, { digestDay: tomorrow.getUTCDay() });
            const tomorrowMidnight = Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate());
            expect(new Date(res.body.nextDigestAt).getTime()).toBe(tomorrowMidnight + 7 * DAY);
        });

        it('clears the schedule when the digest is turned off, and sets a new one when it comes back on', async () => {
            const token = await register('toggle@example.com');
            await digestService.run(new Date());

            const off = await putSettings(token, { weeklyDigest: false });
            expect(off.body).toMatchObject({ weeklyDigest: false, nextDigestAt: null });
            expect((await dbUser('toggle@example.com')).settings.email.nextDigestAt).toBeNull();

            const on = await putSettings(token, { weeklyDigest: true });
            expect(on.body.weeklyDigest).toBe(true);
            expect(new Date(on.body.nextDigestAt).getTime()).toBeGreaterThan(Date.now());
        });

        it('accepts only a boolean switch and a whole day from 0 to 6', async () => {
            const token = await register('strict@example.com');
            for (const body of [
                { digestDay: 7 }, { digestDay: -1 }, { digestDay: 2.5 }, { digestDay: '3' }, { digestDay: [3] },
                { weeklyDigest: 'false' }, { weeklyDigest: [false] }, { weeklyDigest: null }
            ]) {
                expect((await putSettings(token, body)).statusCode).toBe(400);
            }
            expect((await getSettings(token)).body.weeklyDigest).toBe(true);
            expect((await request(app).get('/api/users/settings')).statusCode).toBe(401);
        });
    });

    describe('Unsubscribe links', () => {
        const tokenOf = async (email: string) => (await dbUser(email)).settings.email.unsubscribeToken as string;

        it('only asks on GET: the page holds a form, and nothing changes', async () => {
            await register('ask@example.com');
            const token = await tokenOf('ask@example.com');

            const res = await request(app).get(`/api/email/unsubscribe?token=${token}`);
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toMatch(/text\/html/);
            expect(res.text).toContain(`<form method="post" action="/api/email/unsubscribe?token=${token}"`);
            expect((await dbUser('ask@example.com')).settings.email.weeklyDigest).toBe(true);
        });

        it('unsubscribes on POST, as a mail client\'s one-click button sends it, and answers alike for unknown tokens', async () => {
            await register('leave@example.com');
            await digestService.run(new Date());
            const token = await tokenOf('leave@example.com');

            const res = await request(app).post(`/api/email/unsubscribe?token=${token}`)
                .type('form').send('List-Unsubscribe=One-Click');
            expect(res.statusCode).toBe(200);
            const email = (await dbUser('leave@example.com')).settings.email;
            expect(email.weeklyDigest).toBe(false);
            expect(email.nextDigestAt).toBeNull();
            expect(email.deliveryStatus).toBe('active'); // consent only

            const again = await request(app).post(`/api/email/unsubscribe?token=${token}`);
            const unknown = await request(app).post(`/api/email/unsubscribe?token=${'x'.repeat(43)}`);
            for (const other of [again, unknown]) {
                expect(other.statusCode).toBe(200);
                expect(other.text).toBe(res.text);
            }
        });

        it('turns away a malformed link', async () => {
            expect((await request(app).get('/api/email/unsubscribe')).statusCode).toBe(400);
            expect((await request(app).post('/api/email/unsubscribe?token=short')).statusCode).toBe(400);
            expect((await request(app).post('/api/email/unsubscribe?token=a&token=b')).statusCode).toBe(400);
        });

        it('works from a real digest, and no digest follows', async () => {
            await register('loop@example.com');
            await makeDue('loop@example.com');
            await digestService.run(new Date());

            const header = digests('loop@example.com')[0].headers!['List-Unsubscribe'];
            const path = header.slice(1, -1).replace(EMAIL.APP_URL, '');
            expect((await request(app).post(path).type('form').send('List-Unsubscribe=One-Click')).statusCode).toBe(200);

            await setEmailSettings('loop@example.com', { lastDigestSentAt: new Date(Date.now() - 8 * DAY), nextDigestAt: new Date(Date.now() - 60 * 1000) });
            expect((await digestService.run(new Date())).sent).toBe(0);
            expect(digests('loop@example.com')).toHaveLength(1);
        });
    });
});

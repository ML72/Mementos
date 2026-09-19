import request from 'supertest';
import mongoose from 'mongoose';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import app from '../../src/server/index';
import { User, Note } from '../../src/server/models';
import { MemoryMailer, setMailer, SendFailure } from '../../src/server/mail';
import { AuthService, DigestService, INVALID_RESET_CODE } from '../../src/server/service';
import { EMAIL } from '../../src/server/settings';
import { emailCodeLimiter } from '../../src/server/middleware';
import { registerVerified } from '../helpers/auth';

const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/mementos_test_email';

const mailer = new MemoryMailer();
const authService = new AuthService();

/** Poll until `predicate` holds — forgot-password answers before it sends, so tests wait for the mail. */
const waitFor = async (predicate: () => boolean, timeoutMs = 3000): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
        await new Promise(r => setTimeout(r, 10));
    }
};

const codeFrom = (subject: string): string => {
    const match = subject.match(/^(\d{6}) is your/);
    if (!match) throw new Error(`No code in subject: ${subject}`);
    return match[1];
};

describe('Password reset and weekly digest', () => {
    beforeAll(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        await mongoose.connect(TEST_MONGO_URI);
        await User.syncIndexes();
        setMailer(mailer);
    });

    afterAll(async () => {
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
        // The per-IP limiter is process-wide; every test starts with a clean budget.
        await emailCodeLimiter.resetKey('::ffff:127.0.0.1');
        await emailCodeLimiter.resetKey('127.0.0.1');
    });

    // --- helpers -----------------------------------------------------------
    /** A verified, signed-in user, with the verification email from sign-up cleared away. */
    const register = async (email: string, password = 'password123', fullName = 'Test User') => {
        const token = await registerVerified(email, password, fullName);
        for (let i = mailer.sent.length - 1; i >= 0; i--) {
            if (mailer.sent[i].to.toLowerCase() === email.toLowerCase()) mailer.sent.splice(i, 1);
        }
        return token;
    };
    const login = (email: string, password: string) =>
        request(app).post('/api/auth').send({ email, password });
    const forgot = (email: string) =>
        request(app).post('/api/auth/forgot-password').send({ email });
    const reset = (email: string, code: string, password: string) =>
        request(app).post('/api/auth/reset-password').send({ email, code, password });
    const me = (token: string) => request(app).get('/api/auth').set('x-auth-token', token);
    const dbUser = async (email: string) => (await User.findOne({ 'login.email': email.toLowerCase() }).lean()) as any;

    /** Request a code and read it back out of the captured email. */
    const obtainCode = async (email: string): Promise<string> => {
        const before = mailer.to(email).length;
        const res = await forgot(email);
        expect(res.statusCode).toBe(200);
        await waitFor(() => mailer.to(email).length > before);
        const mail = mailer.to(email)[before];
        return codeFrom(mail.subject);
    };

    // -----------------------------------------------------------------------

    describe('POST /api/auth/forgot-password', () => {
        it('answers identically for a registered and an unregistered address, and only mails the former', async () => {
            await register('known@example.com');

            const known = await forgot('known@example.com');
            const unknown = await forgot('nobody@example.com');

            expect(known.statusCode).toBe(200);
            expect(unknown.statusCode).toBe(200);
            expect(known.body).toEqual(unknown.body);

            await waitFor(() => mailer.to('known@example.com').length === 1);
            // Give the unknown-address path a moment to (not) send anything.
            await new Promise(r => setTimeout(r, 50));
            expect(mailer.to('nobody@example.com')).toHaveLength(0);
        });

        it('rejects a malformed email with a validation error', async () => {
            const res = await forgot('not-an-email');
            expect(res.statusCode).toBe(400);
            expect(res.body.errors[0].msg).toBe('Please enter a valid email');
        });

        it('emails a 6-digit code and stores only its hash, with an expiry', async () => {
            await register('code@example.com');
            const code = await obtainCode('code@example.com');
            expect(code).toMatch(/^\d{6}$/);

            const mail = mailer.to('code@example.com')[0];
            expect(mail.text).toContain(code);
            expect(mail.html).toContain(code);

            const user = await dbUser('code@example.com');
            expect(user.passwordReset.codeHash).toMatch(/^[0-9a-f]{64}$/);
            expect(user.passwordReset.codeHash).not.toContain(code);
            expect(user.passwordReset.attempts).toBe(0);
            expect(user.passwordReset.sendCount).toBe(1);
            expect(new Date(user.passwordReset.expiresAt).getTime())
                .toBeGreaterThan(Date.now() + (EMAIL.PASSWORD_RESET.EXPIRY_MINUTES - 1) * 60 * 1000);
        });

        it('finds the account when the request uses different casing than the stored address', async () => {
            await register('case.reset@example.com');
            const res = await forgot('Case.Reset@EXAMPLE.com');
            expect(res.statusCode).toBe(200);
            await waitFor(() => mailer.to('case.reset@example.com').length === 1);
        });

        it('does not resend within the cooldown', async () => {
            await register('cool@example.com');
            await obtainCode('cool@example.com');

            const res = await forgot('cool@example.com');
            expect(res.statusCode).toBe(200);
            await new Promise(r => setTimeout(r, 100));
            expect(mailer.to('cool@example.com')).toHaveLength(1);
        });

        it('resends once the cooldown has passed, counting against the window', async () => {
            await register('again@example.com');
            await obtainCode('again@example.com');
            await User.updateOne({ 'login.email': 'again@example.com' }, {
                $set: { 'passwordReset.lastSentAt': new Date(Date.now() - (EMAIL.PASSWORD_RESET.RESEND_COOLDOWN_SECONDS + 1) * 1000) }
            });

            await obtainCode('again@example.com');
            expect(mailer.to('again@example.com')).toHaveLength(2);
            const user = await dbUser('again@example.com');
            expect(user.passwordReset.sendCount).toBe(2);
        });

        it('stops sending once the per-window cap is reached, and starts a fresh window later', async () => {
            await register('cap@example.com');
            const past = new Date(Date.now() - (EMAIL.PASSWORD_RESET.RESEND_COOLDOWN_SECONDS + 1) * 1000);

            for (let i = 0; i < EMAIL.PASSWORD_RESET.MAX_SENDS_PER_WINDOW; i++) {
                await obtainCode('cap@example.com');
                await User.updateOne({ 'login.email': 'cap@example.com' }, { $set: { 'passwordReset.lastSentAt': past } });
            }
            expect(mailer.to('cap@example.com')).toHaveLength(EMAIL.PASSWORD_RESET.MAX_SENDS_PER_WINDOW);

            // Sixth request in the window: generic 200, nothing sent.
            const res = await forgot('cap@example.com');
            expect(res.statusCode).toBe(200);
            await new Promise(r => setTimeout(r, 100));
            expect(mailer.to('cap@example.com')).toHaveLength(EMAIL.PASSWORD_RESET.MAX_SENDS_PER_WINDOW);

            // Window expires: counter resets and sending resumes.
            await User.updateOne({ 'login.email': 'cap@example.com' }, {
                $set: { 'passwordReset.sendWindowStartedAt': new Date(Date.now() - (EMAIL.PASSWORD_RESET.SEND_WINDOW_MINUTES + 1) * 60 * 1000) }
            });
            await obtainCode('cap@example.com');
            const user = await dbUser('cap@example.com');
            expect(user.passwordReset.sendCount).toBe(1);
        });

        it('never lets concurrent requests exceed the window cap', async () => {
            await register('burst@example.com');
            // Wide open: no cooldown, no window.
            const results = await Promise.all(
                Array.from({ length: 25 }, () => authService.requestPasswordReset('burst@example.com'))
            );
            const sent = results.filter(r => r.sent).length;
            expect(sent).toBe(1); // cooldown admits exactly one
            expect(mailer.to('burst@example.com')).toHaveLength(1);
            const user = await dbUser('burst@example.com');
            expect(user.passwordReset.sendCount).toBe(1);
        });

        it('records a hard bounce on the account when the reset email is rejected', async () => {
            await register('bounce@example.com');
            mailer.failAddresses.set('bounce@example.com', 'hard');

            const result = await authService.requestPasswordReset('bounce@example.com');
            expect(result.sent).toBe(false);
            expect(result.reason).toBe('send-failed');

            const user = await dbUser('bounce@example.com');
            expect(user.settings.email.deliveryStatus).toBe('bounced');
            expect(user.settings.email.lastBounceAt).toBeTruthy();
        });

        it('still attempts the reset email for a bounced address (transactional mail is exempt)', async () => {
            await register('exempt@example.com');
            await User.updateOne({ 'login.email': 'exempt@example.com' }, { $set: { 'settings.email.deliveryStatus': 'bounced' } });
            const result = await authService.requestPasswordReset('exempt@example.com');
            expect(result.sent).toBe(true);
        });
    });

    describe('POST /api/auth/reset-password', () => {
        it('sets the new password, rejects the old one, and returns the same message for every failure', async () => {
            await register('flow@example.com', 'oldpassword1');
            const code = await obtainCode('flow@example.com');

            const bad = await reset('flow@example.com', code === '000000' ? '000001' : '000000', 'newpassword1');
            expect(bad.statusCode).toBe(400);
            expect(bad.body.errors[0].msg).toBe(INVALID_RESET_CODE);

            const ok = await reset('flow@example.com', code, 'newpassword1');
            expect(ok.statusCode).toBe(200);

            expect((await login('flow@example.com', 'oldpassword1')).statusCode).toBe(400);
            expect((await login('flow@example.com', 'newpassword1')).statusCode).toBe(200);

            const user = await dbUser('flow@example.com');
            expect(user.passwordReset.codeHash).toBeNull();
            expect(user.passwordReset.expiresAt).toBeNull();
            expect(user.passwordReset.attempts).toBe(0);
            // Issuance bookkeeping survives a completed reset — it rate-limits the endpoint.
            expect(user.passwordReset.sendCount).toBe(1);
            expect(user.passwordReset.lastSentAt).toBeTruthy();
        });

        it('signs existing sessions out and lets a fresh login in', async () => {
            const oldToken = await register('sessions@example.com', 'oldpassword1');
            expect((await me(oldToken)).statusCode).toBe(200);

            const code = await obtainCode('sessions@example.com');
            // Make sure the reset lands in a later second than the old token's iat.
            await new Promise(r => setTimeout(r, 1100));
            expect((await reset('sessions@example.com', code, 'newpassword1')).statusCode).toBe(200);

            const rejected = await me(oldToken);
            expect(rejected.statusCode).toBe(401);
            expect(rejected.body.is_token_invalid).toBe(true);

            const fresh = await login('sessions@example.com', 'newpassword1');
            expect((await me(fresh.body.token)).statusCode).toBe(200);
        });

        it('lets an unverified account in: redeeming a code proves control of the mailbox', async () => {
            await request(app).post('/api/users').send({ email: 'stuck@example.com', password: 'password123', fullName: 'Stuck' });
            mailer.reset();
            expect((await login('stuck@example.com', 'password123')).statusCode).toBe(403);

            const code = await obtainCode('stuck@example.com');
            expect((await reset('stuck@example.com', code, 'newpassword1')).statusCode).toBe(200);
            expect((await dbUser('stuck@example.com')).login.verified).toBe(true);
            expect((await login('stuck@example.com', 'newpassword1')).statusCode).toBe(200);
        });

        it('accepts a code exactly once', async () => {
            await register('once@example.com');
            const code = await obtainCode('once@example.com');
            expect((await reset('once@example.com', code, 'newpassword1')).statusCode).toBe(200);
            const again = await reset('once@example.com', code, 'anotherpassword1');
            expect(again.statusCode).toBe(400);
            expect(again.body.errors[0].msg).toBe(INVALID_RESET_CODE);
            expect((await login('once@example.com', 'newpassword1')).statusCode).toBe(200);
        });

        it('lets only one of several concurrent redemptions of the same code succeed', async () => {
            await register('race@example.com');
            const code = await obtainCode('race@example.com');

            // Up to MAX_ATTEMPTS in flight at once (a double-submit is the realistic case). Every
            // request counts as an attempt before comparing, so more than that would lock the code.
            const results = await Promise.all(
                Array.from({ length: EMAIL.PASSWORD_RESET.MAX_ATTEMPTS }, (_, i) =>
                    authService.resetPassword('race@example.com', code, `racepassword${i}`))
            );
            expect(results.filter(r => r.success)).toHaveLength(1);
            const winner = results.findIndex(r => r.success);
            expect((await login('race@example.com', `racepassword${winner}`)).statusCode).toBe(200);
        });

        it('rejects an expired code and clears it', async () => {
            await register('expired@example.com');
            const code = await obtainCode('expired@example.com');
            await User.updateOne({ 'login.email': 'expired@example.com' }, { $set: { 'passwordReset.expiresAt': new Date(Date.now() - 1000) } });

            const res = await reset('expired@example.com', code, 'newpassword1');
            expect(res.statusCode).toBe(400);
            expect(res.body.errors[0].msg).toBe(INVALID_RESET_CODE);
            const user = await dbUser('expired@example.com');
            expect(user.passwordReset.codeHash).toBeNull();
        });

        it('locks the code after MAX_ATTEMPTS wrong guesses, even if the next guess is right', async () => {
            await register('guess@example.com');
            const code = await obtainCode('guess@example.com');
            const wrong = code === '111111' ? '222222' : '111111';

            for (let i = 0; i < EMAIL.PASSWORD_RESET.MAX_ATTEMPTS; i++) {
                expect((await reset('guess@example.com', wrong, 'newpassword1')).statusCode).toBe(400);
            }
            const user = await dbUser('guess@example.com');
            expect(user.passwordReset.attempts).toBe(EMAIL.PASSWORD_RESET.MAX_ATTEMPTS);

            const late = await reset('guess@example.com', code, 'newpassword1');
            expect(late.statusCode).toBe(400);
            expect((await dbUser('guess@example.com')).passwordReset.codeHash).toBeNull();
            expect((await login('guess@example.com', 'password123')).statusCode).toBe(200);
        });

        it('allows exactly MAX_ATTEMPTS guesses: the last permitted one still succeeds', async () => {
            await register('edge@example.com');
            const code = await obtainCode('edge@example.com');
            const wrong = code === '111111' ? '222222' : '111111';
            for (let i = 0; i < EMAIL.PASSWORD_RESET.MAX_ATTEMPTS - 1; i++) {
                await reset('edge@example.com', wrong, 'newpassword1');
            }
            expect((await reset('edge@example.com', code, 'newpassword1')).statusCode).toBe(200);
        });

        it('counts concurrent wrong guesses atomically', async () => {
            await register('atomic@example.com');
            const code = await obtainCode('atomic@example.com');
            const wrong = code === '111111' ? '222222' : '111111';

            await Promise.all(Array.from({ length: 4 }, () => authService.resetPassword('atomic@example.com', wrong, 'newpassword1')));
            expect((await dbUser('atomic@example.com')).passwordReset.attempts).toBe(4);

            // Guess #5 is the last permitted one.
            expect((await authService.resetPassword('atomic@example.com', code, 'newpassword1')).success).toBe(true);
        });

        it('fails when no reset is in flight, or for an unknown address', async () => {
            await register('idle@example.com');
            expect((await reset('idle@example.com', '123456', 'newpassword1')).body.errors[0].msg).toBe(INVALID_RESET_CODE);
            expect((await reset('ghost@example.com', '123456', 'newpassword1')).body.errors[0].msg).toBe(INVALID_RESET_CODE);
        });

        it('validates the code shape and the new password length', async () => {
            await register('validate@example.com');
            expect((await reset('validate@example.com', '12345', 'newpassword1')).statusCode).toBe(400);
            expect((await reset('validate@example.com', 'abcdef', 'newpassword1')).statusCode).toBe(400);
            expect((await reset('validate@example.com', '123456', 'short')).statusCode).toBe(400);
            expect((await request(app).post('/api/auth/reset-password').send({ email: 'validate@example.com' })).statusCode).toBe(400);
        });

        it('rate-limits a single client across the two public endpoints', async () => {
            const limit = EMAIL.CODE_IP_LIMIT.MAX_REQUESTS;
            for (let i = 0; i < limit; i++) {
                expect((await forgot(`spray${i}@example.com`)).statusCode).toBe(200);
            }
            const blocked = await reset('anyone@example.com', '123456', 'newpassword1');
            expect(blocked.statusCode).toBe(429);
            expect(blocked.body.errors[0].msg).toMatch(/Too many requests/);
        });
    });

    describe('privateAccess and passwordChangedAt', () => {
        it('rejects a token for an account that no longer exists', async () => {
            const token = await register('gone@example.com');
            await User.deleteOne({ 'login.email': 'gone@example.com' });
            const res = await me(token);
            expect(res.statusCode).toBe(401);
            expect(res.body.is_token_invalid).toBe(true);
        });

        it('keeps a token minted in the same second as the password change valid', async () => {
            // Registration stamps passwordChangedAt and mints the token back to back.
            const token = await register('samesecond@example.com');
            expect((await me(token)).statusCode).toBe(200);
        });

        it('accepts a token for an account that predates the field (falls back to dateCreated)', async () => {
            const token = await register('legacy@example.com');
            await User.collection.updateOne({ 'login.email': 'legacy@example.com' }, { $unset: { 'login.passwordChangedAt': '' } });
            expect((await me(token)).statusCode).toBe(200);
        });
    });

    describe('User settings', () => {
        it('reads and writes the weekly digest preference', async () => {
            const token = await register('prefs@example.com');
            const initial = await request(app).get('/api/users/settings').set('x-auth-token', token);
            expect(initial.statusCode).toBe(200);
            expect(initial.body).toEqual({ weeklyDigest: true });

            const off = await request(app).put('/api/users/settings').set('x-auth-token', token).send({ weeklyDigest: false });
            expect(off.statusCode).toBe(200);
            expect(off.body).toEqual({ weeklyDigest: false });
            expect((await dbUser('prefs@example.com')).settings.email.weeklyDigest).toBe(false);

            const on = await request(app).put('/api/users/settings').set('x-auth-token', token).send({ weeklyDigest: true });
            expect(on.body).toEqual({ weeklyDigest: true });
        });

        it('rejects a non-boolean preference and ignores unknown fields', async () => {
            const token = await register('strict@example.com');
            const bad = await request(app).put('/api/users/settings').set('x-auth-token', token).send({ weeklyDigest: 'no' });
            expect(bad.statusCode).toBe(400);

            const res = await request(app).put('/api/users/settings').set('x-auth-token', token)
                .send({ unsubscribeToken: 'attacker', deliveryStatus: 'active' });
            expect(res.statusCode).toBe(200);
            const user = await dbUser('strict@example.com');
            expect(user.settings.email.unsubscribeToken).not.toBe('attacker');
        });

        it('never exposes the unsubscribe token or reset state through the API', async () => {
            const token = await register('leak@example.com');
            const settings = await request(app).get('/api/users/settings').set('x-auth-token', token);
            expect(JSON.stringify(settings.body)).not.toContain('unsubscribeToken');

            const profile = await me(token);
            expect(profile.body.settings?.email?.unsubscribeToken).toBeUndefined();
            expect(profile.body.passwordReset).toBeUndefined();
            expect(profile.body.login.password).toBeUndefined();
        });

        it('requires authentication', async () => {
            expect((await request(app).get('/api/users/settings')).statusCode).toBe(401);
            expect((await request(app).put('/api/users/settings').send({ weeklyDigest: false })).statusCode).toBe(401);
        });
    });

    describe('Unsubscribe endpoint', () => {
        it('GET shows a confirmation page and does not unsubscribe by itself', async () => {
            await register('unsub.get@example.com');
            const token = (await dbUser('unsub.get@example.com')).settings.email.unsubscribeToken;

            const res = await request(app).get('/api/email/unsubscribe').query({ token });
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toMatch(/text\/html/);
            expect(res.text).toContain('method="post"');
            expect((await dbUser('unsub.get@example.com')).settings.email.weeklyDigest).toBe(true);
        });

        it('POST withdraws consent and leaves delivery status alone', async () => {
            await register('unsub.post@example.com');
            await User.updateOne({ 'login.email': 'unsub.post@example.com' }, { $set: { 'settings.email.deliveryStatus': 'bounced' } });
            const token = (await dbUser('unsub.post@example.com')).settings.email.unsubscribeToken;

            const res = await request(app).post('/api/email/unsubscribe').query({ token })
                .type('form').send('List-Unsubscribe=One-Click');
            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('unsubscribed');

            const user = await dbUser('unsub.post@example.com');
            expect(user.settings.email.weeklyDigest).toBe(false);
            expect(user.settings.email.deliveryStatus).toBe('bounced');
        });

        it('responds 200 with the same page for an unknown token (no token oracle)', async () => {
            await register('oracle@example.com');
            const token = (await dbUser('oracle@example.com')).settings.email.unsubscribeToken;
            const real = await request(app).post('/api/email/unsubscribe').query({ token });
            const fake = await request(app).post('/api/email/unsubscribe').query({ token: 'x'.repeat(43) });
            expect(fake.statusCode).toBe(200);
            expect(fake.text).toBe(real.text);
        });

        it('rejects a link with no token as malformed', async () => {
            expect((await request(app).get('/api/email/unsubscribe')).statusCode).toBe(400);
            expect((await request(app).post('/api/email/unsubscribe')).statusCode).toBe(400);
        });

        it('does not let a query-operator object act as a wildcard token', async () => {
            await register('inject@example.com');
            const res = await request(app).post('/api/email/unsubscribe?token[$ne]=x');
            expect(res.statusCode).toBe(400);
            expect((await dbUser('inject@example.com')).settings.email.weeklyDigest).toBe(true);
        });
    });

    describe('Weekly digest', () => {
        const digestService = new DigestService();
        const createNote = (token: string, body: any) =>
            request(app).post('/api/notes').set('x-auth-token', token).send(body);
        const follow = (token: string, targetId: string) =>
            request(app).post(`/api/users/${targetId}/follow`).set('x-auth-token', token).send();
        const idOf = async (email: string) => (await dbUser(email))._id.toString();
        const run = () => digestService.run({ throttleMs: 0 });

        it('mails opted-in users their feed once per period, read-only, with one-click unsubscribe headers', async () => {
            const alice = await register('alice@example.com', 'password123', 'Alice <A&B>');
            const bob = await register('bob@example.com', 'password123', 'Bob');
            const bobId = await idOf('bob@example.com');
            await follow(alice, bobId);
            await createNote(alice, { subject: 'My own note <script>alert(1)</script>', content: 'Own content', tags: ['self'] });
            await createNote(bob, { subject: "Bob's note", content: '# Heading\n\nSome **bold** text & more', tags: ['shared', 'x'] });

            const beforeAlice = await dbUser('alice@example.com');
            const beforeNotes = await Note.find({}).lean();

            const result = await run();
            expect(result.success).toBe(true);
            expect(result.sent).toBe(2);
            expect(result.failed).toBe(0);

            const mail = mailer.to('alice@example.com')[0];
            expect(mail.subject).toMatch(/weekly Mementos/);
            expect(mail.html).toContain('Alice &lt;A&amp;B&gt;');
            expect(mail.html).toContain('&lt;script&gt;');
            expect(mail.html).not.toContain('<script>');
            expect(mail.html).toContain('Bob&#39;s note');
            expect(mail.html).toContain('Some bold text &amp; more');
            expect(mail.text).toContain('Some bold text & more');
            expect(mail.html).toContain('Your note');
            expect(mail.html).toContain('By Bob');
            const unsubToken = beforeAlice.settings.email.unsubscribeToken;
            expect(mail.headers?.['List-Unsubscribe']).toBe(`<${EMAIL.APP_URL}/api/email/unsubscribe?token=${encodeURIComponent(unsubToken)}>`);
            expect(mail.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
            expect(mail.text).toContain(unsubToken);

            // Bookkeeping written; feed state untouched (no impressions, no review advance).
            const afterAlice = await dbUser('alice@example.com');
            expect(afterAlice.settings.email.lastDigestSentAt).toBeTruthy();
            expect(afterAlice.feed.recentlySeen).toEqual(beforeAlice.feed.recentlySeen);
            const afterNotes = await Note.find({}).lean();
            expect(afterNotes.map((n: any) => n.review)).toEqual(beforeNotes.map((n: any) => n.review));

            // Idempotent: a second run in the same period mails nobody.
            const again = await run();
            expect(again.sent).toBe(0);
            expect(again.candidates).toBe(0);
            expect(mailer.sent).toHaveLength(2);
        });

        it('never mails an unverified address', async () => {
            const token = await register('unproven@example.com');
            await createNote(token, { subject: 's', content: 'c' });
            await User.updateOne({ 'login.email': 'unproven@example.com' }, { $set: { 'login.verified': false } });
            const result = await run();
            expect(result.candidates).toBe(0);
            expect(mailer.sent).toHaveLength(0);
        });

        it('skips users who opted out, bounced, complained or were suppressed', async () => {
            for (const [email, patch] of [
                ['optout@example.com', { 'settings.email.weeklyDigest': false }],
                ['bounced@example.com', { 'settings.email.deliveryStatus': 'bounced' }],
                ['complained@example.com', { 'settings.email.deliveryStatus': 'complained' }],
                ['suppressed@example.com', { 'settings.email.deliveryStatus': 'suppressed' }]
            ] as const) {
                const token = await register(email);
                await createNote(token, { subject: 's', content: 'c' });
                await User.updateOne({ 'login.email': email }, { $set: patch });
            }
            const keep = await register('keep@example.com');
            await createNote(keep, { subject: 's', content: 'c' });

            const result = await run();
            expect(result.candidates).toBe(1);
            expect(result.sent).toBe(1);
            expect(mailer.sent.map(m => m.to)).toEqual(['keep@example.com']);
        });

        it('reaches an account that predates the email fields once it opts in', async () => {
            const token = await register('legacy@example.com');
            await createNote(token, { subject: 's', content: 'c' });
            // Exactly how the document looks if it was written before the email fields existed.
            await User.updateOne({ 'login.email': 'legacy@example.com' },
                { $unset: { 'settings.email': '', 'login.passwordChangedAt': '' } });
            expect((await run()).candidates).toBe(0);

            // Opting in fills in what the account is missing, including an unsubscribe token.
            const opt = await request(app).put('/api/users/settings').set('x-auth-token', token).send({ weeklyDigest: true });
            expect(opt.statusCode).toBe(200);

            expect((await run()).sent).toBe(1);
            const unsubToken = (await dbUser('legacy@example.com')).settings.email.unsubscribeToken;
            expect(unsubToken).toBeTruthy();
            expect(mailer.to('legacy@example.com')[0].text).toContain(unsubToken);
        });

        it('does not mail (or claim) a user whose feed is empty, so they are retried next run', async () => {
            await register('empty@example.com');
            const result = await run();
            expect(result.empty).toBe(1);
            expect(result.sent).toBe(0);
            expect((await dbUser('empty@example.com')).settings.email.lastDigestSentAt).toBeNull();
        });

        it('mails again once the period has elapsed, but not a few minutes early', async () => {
            const token = await register('period@example.com');
            await createNote(token, { subject: 's', content: 'c' });
            expect((await run()).sent).toBe(1);

            const periodMs = EMAIL.DIGEST.PERIOD_HOURS * 3600 * 1000;
            await User.updateOne({ 'login.email': 'period@example.com' }, { $set: { 'settings.email.lastDigestSentAt': new Date(Date.now() - periodMs + 60_000) } });
            expect((await run()).sent).toBe(0);

            await User.updateOne({ 'login.email': 'period@example.com' }, { $set: { 'settings.email.lastDigestSentAt': new Date(Date.now() - periodMs - 60_000) } });
            expect((await run()).sent).toBe(1);
        });

        it('claims before sending: a failed send costs that period, and a hard bounce is recorded', async () => {
            const token = await register('fail@example.com');
            await createNote(token, { subject: 's', content: 'c' });
            mailer.failAddresses.set('fail@example.com', 'hard');

            const result = await run();
            expect(result.failed).toBe(1);
            expect(result.sent).toBe(0);
            const user = await dbUser('fail@example.com');
            expect(user.settings.email.lastDigestSentAt).toBeTruthy();
            expect(user.settings.email.deliveryStatus).toBe('bounced');

            mailer.failAddresses.clear();
            expect((await run()).candidates).toBe(0);
        });

        it('treats a transient failure as saying nothing about the address', async () => {
            const token = await register('transient@example.com');
            await createNote(token, { subject: 's', content: 'c' });
            mailer.failNextWith = new SendFailure('transient', 'connection refused');

            const result = await run();
            expect(result.failed).toBe(1);
            expect((await dbUser('transient@example.com')).settings.email.deliveryStatus).toBe('active');
        });

        it('mails each user exactly once when two runs overlap (separate instances)', async () => {
            for (let i = 0; i < 12; i++) {
                const token = await register(`multi${i}@example.com`);
                await createNote(token, { subject: `s${i}`, content: 'c' });
            }
            // Two independent services, as two app instances would be.
            const [a, b] = await Promise.all([
                new DigestService().run({ throttleMs: 0 }),
                new DigestService().run({ throttleMs: 0 })
            ]);
            expect(a.sent + b.sent).toBe(12);
            expect(a.alreadyClaimed + b.alreadyClaimed).toBeGreaterThanOrEqual(0);
            const recipients = mailer.sent.map(m => m.to).sort();
            expect(new Set(recipients).size).toBe(12);
            expect(recipients).toHaveLength(12);
        });

        it('refuses to overlap with itself within one process', async () => {
            const token = await register('overlap@example.com');
            await createNote(token, { subject: 's', content: 'c' });
            const [first, second] = await Promise.all([
                digestService.run({ throttleMs: 50 }),
                digestService.run({ throttleMs: 0 })
            ]);
            const outcomes = [first, second];
            expect(outcomes.filter(o => o.success)).toHaveLength(1);
            expect(outcomes.find(o => !o.success)?.error).toMatch(/already in progress/);
        });

        it('caps each digest at NOTE_COUNT notes and honors the throttle', async () => {
            const token = await register('many@example.com');
            for (let i = 0; i < EMAIL.DIGEST.NOTE_COUNT + 5; i++) {
                await createNote(token, { subject: `note ${i}`, content: `content ${i}` });
            }
            const other = await register('other@example.com');
            await createNote(other, { subject: 'x', content: 'y' });

            const started = Date.now();
            const result = await digestService.run({ throttleMs: 150 });
            expect(result.sent).toBe(2);
            expect(Date.now() - started).toBeGreaterThanOrEqual(300);

            const mail = mailer.to('many@example.com')[0];
            const items = (mail.text.match(/^\d+\. /gm) || []).length;
            expect(items).toBe(EMAIL.DIGEST.NOTE_COUNT);
        });
    });
});

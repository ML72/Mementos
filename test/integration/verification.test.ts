import request from 'supertest';
import mongoose from 'mongoose';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import app from '../../src/server/index';
import { User } from '../../src/server/models';
import { MemoryMailer, setMailer } from '../../src/server/mail';
import { AuthService, INVALID_VERIFICATION_CODE } from '../../src/server/service';
import { EMAIL } from '../../src/server/settings';
import { emailCodeLimiter } from '../../src/server/middleware';

const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/mementos_test_verification';
const LIMITS = EMAIL.VERIFICATION;

const mailer = new MemoryMailer();
const authService = new AuthService();

/** resend-verification answers before it sends, so tests poll for the mail. */
const waitFor = async (predicate: () => boolean, timeoutMs = 3000): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
        await new Promise(r => setTimeout(r, 10));
    }
};
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('Email verification', () => {
    beforeAll(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        await mongoose.connect(TEST_MONGO_URI);
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
        mailer.reset();
        EMAIL.VERIFICATION.REQUIRED = true;
        // The per-IP limiter is process-wide; every test starts with a clean budget.
        await emailCodeLimiter.resetKey('::ffff:127.0.0.1');
        await emailCodeLimiter.resetKey('127.0.0.1');
    });

    // --- helpers -----------------------------------------------------------
    const register = (email: string, password = 'password123', fullName = 'Test User') =>
        request(app).post('/api/users').send({ email, password, fullName });
    const login = (email: string, password = 'password123') =>
        request(app).post('/api/auth').send({ email, password });
    const verify = (email: string, code: string) =>
        request(app).post('/api/auth/verify-email').send({ email, code });
    const resend = (email: string) =>
        request(app).post('/api/auth/resend-verification').send({ email });
    const dbUser = async (email: string) => (await User.findOne({ 'login.email': email.toLowerCase() }).lean()) as any;
    const latestCode = (email: string): string => {
        const mails = mailer.to(email);
        const match = mails[mails.length - 1].subject.match(/^(\d{6}) is your/);
        if (!match) throw new Error('No code in subject');
        return match[1];
    };
    const wrongCodeFor = (code: string) => (code === '111111' ? '222222' : '111111');
    const endCooldown = (email: string) => User.updateOne({ 'login.email': email }, {
        $set: { 'emailVerification.lastSentAt': new Date(Date.now() - (LIMITS.RESEND_COOLDOWN_SECONDS + 1) * 1000) }
    });
    // -----------------------------------------------------------------------

    describe('Registration', () => {
        it('emails a code, stores only its hash, and issues no token', async () => {
            const res = await register('new@example.com', 'password123', 'Ann <script>');
            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ verificationRequired: true });

            const mail = mailer.to('new@example.com')[0];
            const code = latestCode('new@example.com');
            expect(mail.text).toContain(code);
            expect(mail.html).toContain(code);
            expect(mail.html).toContain('Ann &lt;script&gt;');
            expect(mail.html).not.toContain('<script>');

            const user = await dbUser('new@example.com');
            expect(user.login.verified).toBe(false);
            expect(user.emailVerification.codeHash).toMatch(/^[0-9a-f]{64}$/);
            expect(user.emailVerification.codeHash).not.toContain(code);
            expect(user.emailVerification.sendCount).toBe(1);
            expect(new Date(user.emailVerification.expiresAt).getTime())
                .toBeGreaterThan(Date.now() + (LIMITS.EXPIRY_MINUTES - 1) * 60 * 1000);
        });

        it('still creates the account when the email cannot be sent; signing in sends another', async () => {
            mailer.failAddresses.set('flaky@example.com', 'transient');
            expect((await register('flaky@example.com')).body).toEqual({ verificationRequired: true });
            expect(await dbUser('flaky@example.com')).toBeTruthy();

            mailer.failAddresses.clear();
            await endCooldown('flaky@example.com');
            expect((await login('flaky@example.com')).statusCode).toBe(403);
            expect(mailer.to('flaky@example.com')).toHaveLength(1);
        });

        it('stores the address lowercased and treats other casings as the same account', async () => {
            await register('  Mixed.Case@Example.COM ');
            expect((await dbUser('mixed.case@example.com')).login.email).toBe('mixed.case@example.com');

            const dup = await register('MIXED.case@example.com');
            expect(dup.statusCode).toBe(400);
            expect(dup.body.errors[0].msg).toBe('User already exists');
        });

        it('returns a token straight away when verification is switched off', async () => {
            EMAIL.VERIFICATION.REQUIRED = false;
            const res = await register('optional@example.com');
            expect(res.body).toHaveProperty('token');
            expect(mailer.sent).toHaveLength(0);
            expect((await login('optional@example.com')).statusCode).toBe(200);
        });
    });

    describe('POST /api/auth/verify-email', () => {
        it('verifies the account and signs it in; the code works exactly once', async () => {
            await register('flow@example.com');
            const code = latestCode('flow@example.com');

            const res = await verify('Flow@Example.com', code);
            expect(res.statusCode).toBe(200);
            const me = await request(app).get('/api/auth').set('x-auth-token', res.body.token);
            expect(me.statusCode).toBe(200);
            expect(me.body.login.verified).toBe(true);
            expect(me.body.emailVerification).toBeUndefined();

            const user = await dbUser('flow@example.com');
            expect(user.emailVerification.codeHash).toBeNull();
            expect(user.emailVerification.attempts).toBe(0);
            expect(user.emailVerification.sendCount).toBe(1); // issuance bookkeeping survives

            const again = await verify('flow@example.com', code);
            expect(again.statusCode).toBe(400);
            expect(again.body.errors[0].msg).toBe(INVALID_VERIFICATION_CODE);
            expect((await login('flow@example.com')).statusCode).toBe(200);
        });

        it('gives every failure the same message', async () => {
            await register('same@example.com');
            const code = latestCode('same@example.com');
            for (const res of [
                await verify('same@example.com', wrongCodeFor(code)),
                await verify('ghost@example.com', '123456')
            ]) {
                expect(res.statusCode).toBe(400);
                expect(res.body.errors[0].msg).toBe(INVALID_VERIFICATION_CODE);
            }
        });

        it('rejects an expired code and clears it', async () => {
            await register('expired@example.com');
            const code = latestCode('expired@example.com');
            await User.updateOne({ 'login.email': 'expired@example.com' }, { $set: { 'emailVerification.expiresAt': new Date(Date.now() - 1000) } });

            expect((await verify('expired@example.com', code)).statusCode).toBe(400);
            const user = await dbUser('expired@example.com');
            expect(user.emailVerification.codeHash).toBeNull();
            expect(user.login.verified).toBe(false);
        });

        it('allows exactly MAX_ATTEMPTS guesses: the last permitted one still succeeds', async () => {
            await register('edge@example.com');
            const code = latestCode('edge@example.com');
            for (let i = 0; i < LIMITS.MAX_ATTEMPTS - 1; i++) {
                expect((await verify('edge@example.com', wrongCodeFor(code))).statusCode).toBe(400);
            }
            expect((await verify('edge@example.com', code)).statusCode).toBe(200);
        });

        it('locks the code after MAX_ATTEMPTS wrong guesses, even if the next guess is right', async () => {
            await register('locked@example.com');
            const code = latestCode('locked@example.com');
            for (let i = 0; i < LIMITS.MAX_ATTEMPTS; i++) {
                await verify('locked@example.com', wrongCodeFor(code));
            }
            expect((await verify('locked@example.com', code)).statusCode).toBe(400);
            const user = await dbUser('locked@example.com');
            expect(user.emailVerification.codeHash).toBeNull();
            expect(user.login.verified).toBe(false);
        });

        it('counts concurrent wrong guesses atomically, and lets one of several concurrent right ones win', async () => {
            await register('atomic@example.com');
            const code = latestCode('atomic@example.com');
            await Promise.all(Array.from({ length: 3 }, () => authService.verifyEmail('atomic@example.com', wrongCodeFor(code))));
            expect((await dbUser('atomic@example.com')).emailVerification.attempts).toBe(3);

            const results = await Promise.all(Array.from({ length: 2 }, () => authService.verifyEmail('atomic@example.com', code)));
            expect(results.filter(r => r.success)).toHaveLength(1);
        });

        it('validates the code shape', async () => {
            await register('shape@example.com');
            expect((await verify('shape@example.com', '12345')).statusCode).toBe(400);
            expect((await verify('shape@example.com', 'abcdef')).statusCode).toBe(400);
            expect((await request(app).post('/api/auth/verify-email').send({ email: 'shape@example.com' })).statusCode).toBe(400);
        });

        it('does not let a query-operator object stand in for the code or email', async () => {
            await register('inject@example.com');
            const res = await request(app).post('/api/auth/verify-email')
                .send({ email: { $ne: '' }, code: { $ne: '' } });
            expect(res.statusCode).toBe(400);
            expect((await dbUser('inject@example.com')).login.verified).toBe(false);
        });
    });

    describe('Signing in before verifying', () => {
        it('is refused with email_unverified, and sends a fresh code once the cooldown allows', async () => {
            await register('early@example.com');

            const first = await login('early@example.com');
            expect(first.statusCode).toBe(403);
            expect(first.body.email_unverified).toBe(true);
            expect(first.body.is_token_invalid).toBe(false);
            expect(first.body.token).toBeUndefined();
            expect(mailer.to('early@example.com')).toHaveLength(1); // still cooling down

            await endCooldown('early@example.com');
            expect((await login('early@example.com')).statusCode).toBe(403);
            expect(mailer.to('early@example.com')).toHaveLength(2);

            const res = await verify('early@example.com', latestCode('early@example.com'));
            expect(res.statusCode).toBe(200);
            expect((await login('early@example.com')).statusCode).toBe(200);
        });

        it('says nothing about verification when the password is wrong', async () => {
            await register('quiet@example.com');
            const res = await login('quiet@example.com', 'wrongpassword');
            expect(res.statusCode).toBe(400);
            expect(res.body.email_unverified).toBeUndefined();
            expect(res.body.errors[0].msg).toBe('Invalid credentials');
        });

        it('covers accounts created before verification existed (no emailVerification subtree)', async () => {
            await register('legacy@example.com');
            await User.collection.updateOne({ 'login.email': 'legacy@example.com' }, { $unset: { emailVerification: '' } });
            mailer.reset();

            expect((await login('legacy@example.com')).statusCode).toBe(403);
            expect(mailer.to('legacy@example.com')).toHaveLength(1);
            expect((await verify('legacy@example.com', latestCode('legacy@example.com'))).statusCode).toBe(200);
        });
    });

    describe('POST /api/auth/resend-verification', () => {
        it('answers identically for unverified, verified and unknown addresses; only the first is mailed', async () => {
            await register('pending@example.com');
            await register('done@example.com');
            await User.updateOne({ 'login.email': 'done@example.com' }, { $set: { 'login.verified': true } });
            await endCooldown('pending@example.com');
            await endCooldown('done@example.com');
            mailer.reset();

            const responses = [await resend('pending@example.com'), await resend('done@example.com'), await resend('nobody@example.com')];
            for (const res of responses) {
                expect(res.statusCode).toBe(200);
                expect(res.body).toEqual(responses[0].body);
            }
            await waitFor(() => mailer.to('pending@example.com').length === 1);
            await pause(50);
            expect(mailer.sent).toHaveLength(1);
        });

        it('replaces the previous code and resets its attempt count', async () => {
            await register('replace@example.com');
            const oldCode = latestCode('replace@example.com');
            await verify('replace@example.com', wrongCodeFor(oldCode));
            await endCooldown('replace@example.com');

            await resend('replace@example.com');
            await waitFor(() => mailer.to('replace@example.com').length === 2);
            const newCode = latestCode('replace@example.com');
            expect((await dbUser('replace@example.com')).emailVerification.attempts).toBe(0);

            if (newCode !== oldCode) {
                expect((await verify('replace@example.com', oldCode)).statusCode).toBe(400);
            }
            expect((await verify('replace@example.com', newCode)).statusCode).toBe(200);
        });

        it('honours the cooldown and the per-window cap, then starts a fresh window', async () => {
            await register('cap@example.com'); // send #1
            expect((await authService.sendVerificationCode('cap@example.com')).reason).toBe('cooldown');

            for (let i = 1; i < LIMITS.MAX_SENDS_PER_WINDOW; i++) {
                await endCooldown('cap@example.com');
                expect((await authService.sendVerificationCode('cap@example.com')).sent).toBe(true);
            }
            await endCooldown('cap@example.com');
            expect((await authService.sendVerificationCode('cap@example.com')).reason).toBe('window-exhausted');
            expect(mailer.to('cap@example.com')).toHaveLength(LIMITS.MAX_SENDS_PER_WINDOW);

            await User.updateOne({ 'login.email': 'cap@example.com' }, {
                $set: { 'emailVerification.sendWindowStartedAt': new Date(Date.now() - (LIMITS.SEND_WINDOW_MINUTES + 1) * 60 * 1000) }
            });
            expect((await authService.sendVerificationCode('cap@example.com')).sent).toBe(true);
            expect((await dbUser('cap@example.com')).emailVerification.sendCount).toBe(1);
        });

        it('sends exactly one email under a burst of concurrent requests', async () => {
            await register('burst@example.com');
            await endCooldown('burst@example.com');
            mailer.reset();

            const results = await Promise.all(Array.from({ length: 25 }, () => authService.sendVerificationCode('burst@example.com')));
            expect(results.filter(r => r.sent)).toHaveLength(1);
            expect(mailer.to('burst@example.com')).toHaveLength(1);
        });

        it('rate-limits a single client across the code endpoints', async () => {
            for (let i = 0; i < EMAIL.CODE_IP_LIMIT.MAX_REQUESTS; i++) {
                expect((await resend(`spray${i}@example.com`)).statusCode).toBe(200);
            }
            const blocked = await verify('anyone@example.com', '123456');
            expect(blocked.statusCode).toBe(429);
            expect(blocked.body.errors[0].msg).toMatch(/Too many requests/);
        });
    });
});

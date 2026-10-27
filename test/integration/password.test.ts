import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import app from '../../src/server/index';
import { User, Note } from '../../src/server/models';
import { AuthService, INVALID_RESET_CODE, WRONG_CURRENT_PASSWORD, MemoryMailer, setMailer } from '../../src/server/service';
import { EMAIL, JWT_SECRET } from '../../src/server/settings';
import { emailCodeLimiter } from '../../src/server/middleware';
import { registerVerified } from '../helpers/auth';

const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/mementos_test_password';
const LIMITS = EMAIL.PASSWORD_RESET;

const mailer = new MemoryMailer();
const authService = new AuthService();

/** forgot-password answers before it sends, so tests poll for the mail. */
const waitFor = async (predicate: () => boolean, timeoutMs = 3000): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
        await new Promise(r => setTimeout(r, 10));
    }
};
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('Password reset and change', () => {
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
        await Note.deleteMany({});
        mailer.reset();
        EMAIL.VERIFICATION.REQUIRED = true;
        // The per-IP limiter is process-wide; every test starts with a clean budget.
        await emailCodeLimiter.resetKey('::ffff:127.0.0.1');
        await emailCodeLimiter.resetKey('127.0.0.1');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // --- helpers -----------------------------------------------------------
    const signUp = (email: string, password = 'password123', fullName = 'Test User') =>
        request(app).post('/api/users').send({ email, password, fullName });
    const login = (email: string, password = 'password123') =>
        request(app).post('/api/auth').send({ email, password });
    const me = (token: string) => request(app).get('/api/auth').set('x-auth-token', token);
    const forgot = (email: string) => request(app).post('/api/auth/forgot-password').send({ email });
    const reset = (email: string, code: string, password = 'brand-new-pass') =>
        request(app).post('/api/auth/reset-password').send({ email, code, password });
    const change = (token: string, currentPassword: string, newPassword: string) =>
        request(app).post('/api/auth/change-password').set('x-auth-token', token).send({ currentPassword, newPassword });
    const dbUser = async (email: string) => (await User.findOne({ 'login.email': email.toLowerCase() }).lean()) as any;
    const resetMails = (email: string) => mailer.to(email).filter(m => /password reset code$/.test(m.subject));
    const latestResetCode = (email: string): string => {
        const mails = resetMails(email);
        const match = mails[mails.length - 1]?.subject.match(/^(\d{6}) is your/);
        if (!match) throw new Error('No reset code mailed');
        return match[1];
    };
    /** Ask for a reset code over HTTP and wait for it to arrive. */
    const requestCode = async (email: string): Promise<string> => {
        const before = resetMails(email).length;
        expect((await forgot(email)).statusCode).toBe(200);
        await waitFor(() => resetMails(email).length > before);
        return latestResetCode(email);
    };
    const wrongCodeFor = (code: string) => (code === '111111' ? '222222' : '111111');
    const expectSignedOut = async (token: string) => {
        const res = await me(token);
        expect(res.statusCode).toBe(401);
        expect(res.body.is_token_invalid).toBe(true);
    };
    // -----------------------------------------------------------------------

    describe('POST /api/auth/forgot-password', () => {
        it('answers identically for verified, unverified and unknown addresses; only real accounts get mail', async () => {
            await registerVerified('known@example.com');
            await signUp('pending@example.com');
            mailer.reset();

            const responses = [await forgot('known@example.com'), await forgot('Pending@Example.com'), await forgot('nobody@example.com')];
            for (const res of responses) {
                expect(res.statusCode).toBe(200);
                expect(res.body).toEqual(responses[0].body);
            }
            await waitFor(() => mailer.sent.length === 2);
            await pause(50);
            expect(resetMails('known@example.com')).toHaveLength(1);
            expect(resetMails('pending@example.com')).toHaveLength(1);
            expect(mailer.to('nobody@example.com')).toHaveLength(0);
        });

        it('stores only a hash of the code, and leaves the account name out of the email', async () => {
            await registerVerified('hash@example.com', 'password123', 'Somebody Else Entirely');
            const code = await requestCode('hash@example.com');

            const user = await dbUser('hash@example.com');
            expect(user.passwordReset.codeHash).toMatch(/^[0-9a-f]{64}$/);
            expect(user.passwordReset.codeHash).not.toContain(code);
            expect(new Date(user.passwordReset.expiresAt).getTime())
                .toBeGreaterThan(Date.now() + (LIMITS.EXPIRY_MINUTES - 1) * 60 * 1000);

            const mail = resetMails('hash@example.com')[0];
            expect(mail.text).toContain(code);
            expect(mail.html).not.toContain('Somebody Else Entirely');
            expect(mail.text).not.toContain('Somebody Else Entirely');
        });

        it('honours the per-account cooldown, and sends exactly one email under a burst', async () => {
            await registerVerified('burst@example.com');
            mailer.reset();

            const results = await Promise.all(Array.from({ length: 25 }, () => authService.sendPasswordResetCode('burst@example.com')));
            expect(results.filter(r => r.sent)).toHaveLength(1);
            expect(resetMails('burst@example.com')).toHaveLength(1);
            expect((await authService.sendPasswordResetCode('burst@example.com')).reason).toBe('cooldown');
        });

        it('shares the per-IP limit with the other code endpoints', async () => {
            for (let i = 0; i < EMAIL.CODE_IP_LIMIT.MAX_REQUESTS; i++) {
                expect((await forgot(`spray${i}@example.com`)).statusCode).toBe(200);
            }
            expect((await reset('anyone@example.com', '123456')).statusCode).toBe(429);
            expect((await request(app).post('/api/auth/resend-verification').send({ email: 'x@example.com' })).statusCode).toBe(429);
        });
    });

    describe('POST /api/auth/reset-password', () => {
        it('sets the new password and signs in; the code works exactly once', async () => {
            await registerVerified('flow@example.com');
            const code = await requestCode('flow@example.com');

            const res = await reset('Flow@Example.com', code, 'brand-new-pass');
            expect(res.statusCode).toBe(200);
            expect((await me(res.body.token)).statusCode).toBe(200);
            expect((await login('flow@example.com')).statusCode).toBe(400);
            expect((await login('flow@example.com', 'brand-new-pass')).statusCode).toBe(200);

            const user = await dbUser('flow@example.com');
            expect(user.passwordReset.codeHash).toBeNull();
            expect(user.passwordReset.sendCount).toBe(1); // issuance bookkeeping survives

            const again = await reset('flow@example.com', code, 'another-pass-1');
            expect(again.statusCode).toBe(400);
            expect(again.body.errors[0].msg).toBe(INVALID_RESET_CODE);
        });

        it('signs out every existing session, including one opened just before the reset', async () => {
            const first = await registerVerified('sessions@example.com');
            const code = await requestCode('sessions@example.com');
            const justBefore = (await login('sessions@example.com')).body.token;
            expect((await me(justBefore)).statusCode).toBe(200);

            const res = await reset('sessions@example.com', code);
            expect(res.statusCode).toBe(200);
            await expectSignedOut(first);
            await expectSignedOut(justBefore);
            expect((await me(res.body.token)).statusCode).toBe(200);
        });

        it('gives every failure the same message', async () => {
            await registerVerified('same@example.com');
            const code = await requestCode('same@example.com');
            for (const res of [
                await reset('same@example.com', wrongCodeFor(code)),
                await reset('ghost@example.com', '123456')
            ]) {
                expect(res.statusCode).toBe(400);
                expect(res.body.errors[0].msg).toBe(INVALID_RESET_CODE);
            }
            expect((await login('same@example.com')).statusCode).toBe(200);
        });

        it('rejects an expired code and clears it', async () => {
            await registerVerified('expired@example.com');
            const code = await requestCode('expired@example.com');
            await User.updateOne({ 'login.email': 'expired@example.com' }, { $set: { 'passwordReset.expiresAt': new Date(Date.now() - 1000) } });

            expect((await reset('expired@example.com', code)).statusCode).toBe(400);
            expect((await dbUser('expired@example.com')).passwordReset.codeHash).toBeNull();
            expect((await login('expired@example.com')).statusCode).toBe(200);
        });

        it('locks the code after MAX_ATTEMPTS wrong guesses, even if the next guess is right', async () => {
            await registerVerified('locked@example.com');
            const code = await requestCode('locked@example.com');
            for (let i = 0; i < LIMITS.MAX_ATTEMPTS; i++) {
                await reset('locked@example.com', wrongCodeFor(code));
            }
            expect((await reset('locked@example.com', code)).statusCode).toBe(400);
            expect((await login('locked@example.com')).statusCode).toBe(200);
        });

        it('checks the new password before spending a guess on the code', async () => {
            await registerVerified('weak@example.com');
            const code = await requestCode('weak@example.com');

            const short = await reset('weak@example.com', code, 'x'.repeat(7));
            expect(short.statusCode).toBe(400);
            expect(short.body.errors[0].msg).toMatch(/^Password must be/);
            expect((await reset('weak@example.com', code, 'x'.repeat(129))).statusCode).toBe(400);
            expect((await dbUser('weak@example.com')).passwordReset.attempts).toBe(0);

            expect((await reset('weak@example.com', code, 'x'.repeat(8))).statusCode).toBe(200);
        });

        it('does not take a verification code, or a query-operator object, for a reset code', async () => {
            await signUp('mixed@example.com');
            const verification = mailer.to('mixed@example.com')[0].subject.match(/^(\d{6})/)![1];
            expect((await reset('mixed@example.com', verification)).statusCode).toBe(400);

            const injected = await request(app).post('/api/auth/reset-password')
                .send({ email: { $ne: '' }, code: { $ne: '' }, password: 'brand-new-pass' });
            expect(injected.statusCode).toBe(400);
            expect((await dbUser('mixed@example.com')).login.verified).toBe(false);
        });
    });

    describe('Someone else registered the address', () => {
        it('lets the owner take over an account they never created, which verifies it', async () => {
            // Verification is on, so the squatter registered but can never sign in.
            await signUp('owner@example.com', 'squatter-pass', 'Not The Owner');
            expect((await login('owner@example.com', 'squatter-pass')).statusCode).toBe(403);

            const code = await requestCode('owner@example.com');
            const res = await reset('owner@example.com', code, 'owners-own-pass');
            expect(res.statusCode).toBe(200);
            expect((await me(res.body.token)).statusCode).toBe(200);

            const user = await dbUser('owner@example.com');
            expect(user.login.verified).toBe(true);
            expect(user.emailVerification.codeHash).toBeNull(); // the squatter's pending code is moot
            expect((await login('owner@example.com', 'squatter-pass')).statusCode).toBe(400);
            expect((await login('owner@example.com', 'owners-own-pass')).statusCode).toBe(200);
        });

        it('kicks out a squatter who is already signed in, for good', async () => {
            // Signed-in squatters exist when verification is off, or on accounts older than it.
            EMAIL.VERIFICATION.REQUIRED = false;
            const fromSignUp = (await signUp('taken@example.com', 'squatter-pass', 'Squatter')).body.token;
            const fromLogin = (await login('taken@example.com', 'squatter-pass')).body.token;
            expect((await me(fromSignUp)).statusCode).toBe(200);

            const code = await requestCode('taken@example.com');
            expect((await reset('taken@example.com', code, 'owners-own-pass')).statusCode).toBe(200);

            await expectSignedOut(fromSignUp);
            await expectSignedOut(fromLogin);
            expect((await change(fromLogin, 'squatter-pass', 'take-it-back-1')).statusCode).toBe(401);
            expect((await login('taken@example.com', 'squatter-pass')).statusCode).toBe(400);
        });
    });

    describe('POST /api/auth/change-password', () => {
        it('changes the password, hands back a fresh token, and signs every other session out', async () => {
            const tokenA = await registerVerified('change@example.com');
            const tokenB = (await login('change@example.com')).body.token;

            const res = await change(tokenA, 'password123', 'next-password-1');
            expect(res.statusCode).toBe(200);
            expect((await me(res.body.token)).statusCode).toBe(200);
            await expectSignedOut(tokenA);
            await expectSignedOut(tokenB);
            expect((await login('change@example.com')).statusCode).toBe(400);
            expect((await login('change@example.com', 'next-password-1')).statusCode).toBe(200);
        });

        it('needs the right current password', async () => {
            const token = await registerVerified('wrong@example.com');
            const res = await change(token, 'not-my-password', 'next-password-1');
            expect(res.statusCode).toBe(400);
            expect(res.body.errors[0].msg).toBe(WRONG_CURRENT_PASSWORD);
            expect((await me(token)).statusCode).toBe(200);
            expect((await login('wrong@example.com')).statusCode).toBe(200);
        });

        it('validates the new password and needs a session', async () => {
            const token = await registerVerified('rules@example.com');
            expect((await change(token, 'password123', 'short')).statusCode).toBe(400);
            expect((await change(token, 'password123', 'x'.repeat(129))).statusCode).toBe(400);
            expect((await request(app).post('/api/auth/change-password')
                .send({ currentPassword: 'password123', newPassword: 'next-password-1' })).statusCode).toBe(401);
        });

        it('cannot undo a reset that lands while it is checking the old password', async () => {
            const token = await registerVerified('race@example.com');
            const code = await requestCode('race@example.com');

            // The squatter's change request has checked the old password when the owner's
            // reset lands; its write must then match nothing.
            const compare = bcrypt.compare.bind(bcrypt);
            jest.spyOn(bcrypt, 'compare').mockImplementationOnce((async (plain: string, hash: string) => {
                const matched = await compare(plain, hash);
                expect((await reset('race@example.com', code, 'owners-own-pass')).statusCode).toBe(200);
                return matched;
            }) as any);

            const res = await change(token, 'password123', 'squatter-again-1');
            expect(res.statusCode).toBe(400);
            expect((await login('race@example.com', 'owners-own-pass')).statusCode).toBe(200);
            expect((await login('race@example.com', 'squatter-again-1')).statusCode).toBe(400);
        });
    });

    describe('Session checks', () => {
        it('rejects a correctly signed token that is not bound to the password', async () => {
            await registerVerified('unbound@example.com');
            const id = (await dbUser('unbound@example.com'))._id.toString();
            await expectSignedOut(jwt.sign({ user: { id } }, JWT_SECRET, { expiresIn: 3600 }));
        });

        it('rejects a token for an account that no longer exists', async () => {
            const token = await registerVerified('gone@example.com');
            await User.deleteOne({ 'login.email': 'gone@example.com' });
            await expectSignedOut(token);
        });

        it('does not sign anyone out when the check fails on our side', async () => {
            const token = await registerVerified('steady@example.com');
            jest.spyOn(User, 'findById').mockImplementationOnce((() => ({
                select: () => ({ lean: () => Promise.reject(new Error('database unavailable')) })
            })) as any);

            const res = await me(token);
            expect(res.statusCode).toBe(500);
            expect(res.body.is_token_invalid).toBe(false);
            expect((await me(token)).statusCode).toBe(200);
        });
    });
});

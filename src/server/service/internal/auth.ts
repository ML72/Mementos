import bcrypt from 'bcryptjs';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { sign } from 'jsonwebtoken';
import { User } from '../../models';
import { EMAIL, JWT_SECRET } from '../../settings';
import { getMailer, renderPasswordResetEmail, SendFailure } from '../../mail';
import EmailService from './email';

export interface AuthenticateUserResult {
    success: boolean;
    token?: string;
    error?: string;
}

export interface GetUserResult {
    success: boolean;
    user?: any;
    error?: string;
}

/**
 * `success` is always true — there is no failure the caller may reveal. `sent`/`reason` say what
 * actually happened, for tests and logs; they must never reach the HTTP response.
 */
export interface RequestPasswordResetResult {
    success: true;
    sent: boolean;
    reason?: 'no-user' | 'cooldown' | 'window-exhausted' | 'raced' | 'send-failed';
}

export interface ResetPasswordResult {
    success: boolean;
    error?: string;
}

/** Same message for every failure so the response never narrates which check failed. */
export const INVALID_RESET_CODE = 'Invalid or expired reset code';

/** Trim + lowercase: the schema does the same on write and on query filters. */
export const normalizeEmail = (email: string): string => String(email ?? '').trim().toLowerCase();

/** Zero-padded numeric code. `crypto.randomInt` is unbiased (no `Math.random`, no `% 10^n`). */
export const generateResetCode = (): string => {
    const length = EMAIL.PASSWORD_RESET.CODE_LENGTH;
    return randomInt(0, 10 ** length).toString().padStart(length, '0');
};

/**
 * HMAC-SHA256 rather than bcrypt: a 6-digit code has only 10^6 candidates, so a bcrypt hash in a
 * leaked database is crackable in hours, while an HMAC is worthless without the server-side
 * secret — and it is cheap enough for an unauthenticated endpoint.
 */
export const hashResetCode = (code: string): string =>
    createHmac('sha256', EMAIL.PASSWORD_RESET_SECRET).update(code).digest('hex');

const codesMatch = (code: string, storedHash: string): boolean => {
    const expected = Buffer.from(hashResetCode(code), 'utf8');
    const actual = Buffer.from(storedHash, 'utf8');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
};

/** Wipe the in-flight code. Issuance counters are deliberately left alone (they rate-limit sends). */
const clearResetCode = (userId: any) => User.updateOne(
    { _id: userId },
    { $set: { 'passwordReset.codeHash': null, 'passwordReset.expiresAt': null, 'passwordReset.attempts': 0 } }
);

class AuthService {
    private readonly emailService = new EmailService();

    async authenticateUser(email: string, password: string): Promise<AuthenticateUserResult> {
        try {
            const user = await User.findOne({ 'login.email': normalizeEmail(email) });
            if (!user) {
                return { success: false, error: 'Invalid credentials' };
            }

            const isMatch = await bcrypt.compare(password, (user as any).login.password);
            if (!isMatch) {
                return { success: false, error: 'Invalid credentials' };
            }

            const payload = { user: { id: user.id } };
            const token = sign(payload, JWT_SECRET, { expiresIn: 259200 }); // 3 days

            return { success: true, token };
        } catch (error: any) {
            console.error('Authentication error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    async getUserById(userId: string): Promise<GetUserResult> {
        try {
            // Never let credential material leave the server: the password hash, the whole
            // passwordReset subtree, and the unsubscribe token (a bearer credential for the
            // one-click unsubscribe endpoint) are all projected out. This is the only place
            // that returns a raw user document; every other read maps to an explicit whitelist.
            const user = await User.findById(userId)
                .select('-login.password -passwordReset -settings.email.unsubscribeToken')
                .lean();
            if (!user) {
                return { success: false, error: 'User not found' };
            }
            return { success: true, user };
        } catch (error: any) {
            console.error('Get user error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    /**
     * Issue a reset code and email it, subject to per-user rate limits. Never fails from the
     * caller's point of view: an unknown address, a cooled-down resend and an exhausted window
     * all look like a successful send, so the endpoint cannot be used to discover which
     * addresses are registered.
     */
    async requestPasswordReset(email: string): Promise<RequestPasswordResetResult> {
        const limits = EMAIL.PASSWORD_RESET;
        try {
            const normalized = normalizeEmail(email);
            const user = await User.findOne({ 'login.email': normalized })
                .select('login.email profile.fullName passwordReset')
                .lean() as any;
            if (!user) {
                return { success: true, sent: false, reason: 'no-user' };
            }

            const now = new Date();
            const nowMs = now.getTime();
            const reset = user.passwordReset || {};
            const cooldownCutoff = new Date(nowMs - limits.RESEND_COOLDOWN_SECONDS * 1000);
            const windowCutoff = new Date(nowMs - limits.SEND_WINDOW_MINUTES * 60 * 1000);

            if (reset.lastSentAt && new Date(reset.lastSentAt) > cooldownCutoff) {
                return { success: true, sent: false, reason: 'cooldown' };
            }

            const windowActive = reset.sendWindowStartedAt && new Date(reset.sendWindowStartedAt) > windowCutoff;
            if (windowActive && (reset.sendCount ?? 0) >= limits.MAX_SENDS_PER_WINDOW) {
                return { success: true, sent: false, reason: 'window-exhausted' };
            }

            const code = generateResetCode();
            const codeFields = {
                'passwordReset.codeHash': hashResetCode(code),
                'passwordReset.expiresAt': new Date(nowMs + limits.EXPIRY_MINUTES * 60 * 1000),
                'passwordReset.attempts': 0,
                'passwordReset.lastSentAt': now
            };
            // The filter repeats the cooldown and window checks, so the write is a compare-and-set:
            // whichever of two concurrent requests lands second matches nothing and sends nothing.
            const notInCooldown = {
                $or: [
                    { 'passwordReset.lastSentAt': null },
                    { 'passwordReset.lastSentAt': { $lte: cooldownCutoff } }
                ]
            };
            const claim = windowActive
                ? await User.updateOne(
                    {
                        _id: user._id,
                        'passwordReset.sendWindowStartedAt': { $gt: windowCutoff },
                        'passwordReset.sendCount': { $lt: limits.MAX_SENDS_PER_WINDOW },
                        ...notInCooldown
                    },
                    { $set: codeFields, $inc: { 'passwordReset.sendCount': 1 } }
                )
                : await User.updateOne(
                    {
                        _id: user._id,
                        $and: [
                            {
                                $or: [
                                    { 'passwordReset.sendWindowStartedAt': null },
                                    { 'passwordReset.sendWindowStartedAt': { $lte: windowCutoff } }
                                ]
                            },
                            notInCooldown
                        ]
                    },
                    { $set: { ...codeFields, 'passwordReset.sendWindowStartedAt': now, 'passwordReset.sendCount': 1 } }
                );
            if (claim.modifiedCount === 0) {
                return { success: true, sent: false, reason: 'raced' };
            }

            try {
                await getMailer().send(renderPasswordResetEmail({
                    to: user.login.email,
                    fullName: user.profile?.fullName || 'there',
                    code
                }));
            } catch (err: any) {
                // Transactional mail is attempted whatever the delivery status says, but a
                // definite rejection is still worth recording for the bulk path.
                if (err instanceof SendFailure) {
                    await this.emailService.recordSendFailure(user.login.email, err.kind);
                }
                console.error('Password reset email failed:', err?.message || err);
                return { success: true, sent: false, reason: 'send-failed' };
            }
            return { success: true, sent: true };
        } catch (error: any) {
            console.error('Request password reset error:', error.message);
            // Still nothing to reveal: the route answers with the generic response either way.
            return { success: true, sent: false, reason: 'send-failed' };
        }
    }

    /**
     * Redeem a reset code. The attempt is counted *before* the code is compared, in the same write
     * that fetches it, so concurrent guesses cannot both observe `attempts = 4` and both proceed.
     * Every failure returns the same message.
     */
    async resetPassword(email: string, code: string, password: string): Promise<ResetPasswordResult> {
        const limits = EMAIL.PASSWORD_RESET;
        try {
            const user = await User.findOneAndUpdate(
                { 'login.email': normalizeEmail(email), 'passwordReset.codeHash': { $ne: null } },
                { $inc: { 'passwordReset.attempts': 1 } },
                { returnDocument: 'after' }
            ).select('passwordReset').lean() as any;

            if (!user) {
                return { success: false, error: INVALID_RESET_CODE };
            }
            const reset = user.passwordReset;
            if (!reset.expiresAt || new Date(reset.expiresAt).getTime() < Date.now()) {
                await clearResetCode(user._id);
                return { success: false, error: INVALID_RESET_CODE };
            }
            if (reset.attempts > limits.MAX_ATTEMPTS) {
                await clearResetCode(user._id);
                return { success: false, error: INVALID_RESET_CODE };
            }
            if (!codesMatch(String(code), reset.codeHash)) {
                return { success: false, error: INVALID_RESET_CODE };
            }

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            // Conditional on the hash still being the one we matched: a second request racing
            // with the same code finds it already cleared and fails, so a code redeems once.
            const result = await User.updateOne(
                { _id: user._id, 'passwordReset.codeHash': reset.codeHash },
                {
                    $set: {
                        'login.password': hashedPassword,
                        'login.passwordChangedAt': new Date(),
                        'passwordReset.codeHash': null,
                        'passwordReset.expiresAt': null,
                        'passwordReset.attempts': 0
                    }
                }
            );
            if (result.modifiedCount === 0) {
                return { success: false, error: INVALID_RESET_CODE };
            }
            return { success: true };
        } catch (error: any) {
            console.error('Reset password error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }
}

export default AuthService;

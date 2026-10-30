import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { sign, verify } from 'jsonwebtoken';
import { User } from '../../models';
import { EMAIL, JWT_SECRET } from '../../settings';
import { renderPasswordResetEmail, renderVerificationEmail } from '../../config';
import { getMailer } from '../external';
import { JWTUser } from '../../../types/express';
import CodeService, { IssueSkipReason } from './codes';

export interface AuthenticateUserResult {
    success: boolean;
    token?: string;
    /** The password was right but the address is unverified; a code has been (re)sent. */
    unverified?: boolean;
    error?: string;
}

export interface GetUserResult {
    success: boolean;
    user?: any;
    error?: string;
}

export interface VerifyTokenResult {
    success: boolean;
    user?: JWTUser;
    /**
     * The token itself is no good (bad signature, expired, password changed since), as opposed
     * to the check failing on our side. Only this should sign the client out.
     */
    invalid?: boolean;
    error?: string;
}

/**
 * `success` is always true — there is no failure the caller may reveal. `sent`/`reason` say what
 * actually happened, for tests and logs; they must never reach the HTTP response.
 */
export interface SendVerificationResult {
    success: true;
    sent: boolean;
    reason?: IssueSkipReason | 'no-user' | 'already-verified' | 'send-failed';
}

/** Same contract as SendVerificationResult. */
export interface SendPasswordResetResult {
    success: true;
    sent: boolean;
    reason?: IssueSkipReason | 'no-user' | 'send-failed';
}

export interface VerifyEmailResult {
    success: boolean;
    token?: string;
    error?: string;
}

/** A reset or change signs the caller in with a fresh token and ends every other session. */
export interface PasswordChangeResult {
    success: boolean;
    token?: string;
    error?: string;
}

/** Same message for every failure so the response never narrates which check failed. */
export const INVALID_VERIFICATION_CODE = 'Invalid or expired verification code';
export const INVALID_RESET_CODE = 'Invalid or expired reset code';
export const EMAIL_UNVERIFIED = 'Please verify your email address. We sent you a code.';
export const WRONG_CURRENT_PASSWORD = 'Current password is incorrect';
/** Why a token was refused, worded for the person it signs out: the client shows it as is. */
export const SESSION_EXPIRED = 'Your session has expired. Please sign in again.';
export const SESSION_REVOKED = 'Your password was changed, so you were signed out. Please sign in with your new password.';

/** Trim + lowercase: the schema does the same on write and on query filters. */
export const normalizeEmail = (email: string): string => String(email ?? '').trim().toLowerCase();

export const hashPassword = async (password: string): Promise<string> =>
    bcrypt.hash(password, await bcrypt.genSalt(10));

/** When the account's password was last set, in ms: the value tokens are bound to. */
export const passwordChangedAtOf = (user: any): number =>
    new Date(user.login.passwordChangedAt).getTime();

/**
 * Binds the token to the password it was issued under: verifyToken refuses it once
 * `passwordChangedAt` moves, which is how a reset or change signs every other session out. An
 * exact match rather than comparing against `iat`, which is in whole seconds: a token issued in
 * the same second as a reset, or by a sign-in that checked the old password just before the
 * reset landed, must still die.
 */
export const signToken = (userId: string, passwordChangedAt: number): string =>
    sign({ user: { id: userId }, passwordChangedAt }, JWT_SECRET, { expiresIn: 259200 }); // 3 days

/**
 * `passwordChangedAtOf` for an account that is being signed in, read lean together with
 * `dateCreated`. Accounts created before tokens were bound to the password have no
 * `passwordChangedAt`, and a token bound to a missing value can never verify, so such an account
 * is given its creation date, written only while the field is still unset. Every sign-in racing
 * here computes that same date and gets a working token; a reset landing in between keeps its own
 * date, and then this token is refused, as it should be: it was issued under the old password.
 */
export const ensurePasswordChangedAt = async (user: any): Promise<number> => {
    if (user.login?.passwordChangedAt) return passwordChangedAtOf(user);
    const assumed = new Date(user.dateCreated ?? 0);
    await User.updateOne(
        { _id: user._id, 'login.passwordChangedAt': null },
        { $set: { 'login.passwordChangedAt': assumed } }
    );
    return assumed.getTime();
};

class AuthService {
    private readonly codeService = new CodeService();

    async authenticateUser(email: string, password: string): Promise<AuthenticateUserResult> {
        try {
            const user = await User.findOne({ 'login.email': normalizeEmail(email) })
                .select('login.password login.verified login.passwordChangedAt dateCreated')
                .lean() as any;
            if (!user) {
                return { success: false, error: 'Invalid credentials' };
            }

            const isMatch = await bcrypt.compare(password, user.login.password);
            if (!isMatch) {
                return { success: false, error: 'Invalid credentials' };
            }

            // Only reached with the right password, so saying "unverified" reveals nothing new.
            if (EMAIL.VERIFICATION.REQUIRED && !user.login.verified) {
                await this.sendVerificationCode(email);
                return { success: false, unverified: true, error: EMAIL_UNVERIFIED };
            }

            // Bound to the password version read together with the hash just checked, so a reset
            // that lands while bcrypt runs still revokes this token.
            return { success: true, token: signToken(user._id.toString(), await ensurePasswordChangedAt(user)) };
        } catch (error: any) {
            console.error('Authentication error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    /**
     * Check a session token: signature and expiry, then that the account still exists and its
     * password hasn't changed since the token was issued. One point lookup per request.
     */
    async verifyToken(token: string): Promise<VerifyTokenResult> {
        const invalid = (error: string): VerifyTokenResult => ({ success: false, invalid: true, error });
        let payload: any;
        try {
            payload = verify(token, JWT_SECRET);
        } catch {
            return invalid(SESSION_EXPIRED);
        }
        const userId = payload?.user?.id;
        if (!mongoose.isValidObjectId(userId) || typeof payload.passwordChangedAt !== 'number') {
            return invalid(SESSION_EXPIRED);
        }

        try {
            const user = await User.findById(userId).select('login.passwordChangedAt').lean();
            if (!user) return invalid(SESSION_EXPIRED);
            if (payload.passwordChangedAt !== passwordChangedAtOf(user)) return invalid(SESSION_REVOKED);
            return { success: true, user: { id: userId } };
        } catch (error: any) {
            console.error('Verify token error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    async getUserById(userId: string): Promise<GetUserResult> {
        try {
            // Never let credential material leave the server: the password hash, both emailed-code
            // subtrees, and the unsubscribe token (a bearer credential) are all projected out.
            // This is the only place that returns a raw user document; every other read maps to
            // an explicit whitelist.
            const user = await User.findById(userId)
                .select('-login.password -emailVerification -passwordReset -settings.email.unsubscribeToken')
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
     * Email a verification code, subject to per-account rate limits. Never fails from the
     * caller's point of view: an unknown address, a verified one and a rate-limited one all look
     * like a successful send.
     */
    async sendVerificationCode(email: string): Promise<SendVerificationResult> {
        try {
            const user = await User.findOne({ 'login.email': normalizeEmail(email) })
                .select('login.email login.verified profile.fullName emailVerification')
                .lean() as any;
            if (!user) return { success: true, sent: false, reason: 'no-user' };
            if (user.login.verified) return { success: true, sent: false, reason: 'already-verified' };

            const issued = await this.codeService.issue(user._id, 'emailVerification', user.emailVerification, EMAIL.VERIFICATION);
            if (!issued.code) return { success: true, sent: false, reason: issued.reason };

            await getMailer().send(renderVerificationEmail({
                to: user.login.email,
                fullName: user.profile?.fullName || 'there',
                code: issued.code
            }));
            return { success: true, sent: true };
        } catch (error: any) {
            console.error('Send verification code error:', error.message);
            return { success: true, sent: false, reason: 'send-failed' };
        }
    }

    /** Redeem a verification code; on success the account is verified and signed in. */
    async verifyEmail(email: string, code: string): Promise<VerifyEmailResult> {
        try {
            const userId = await this.codeService.redeem(
                normalizeEmail(email), 'emailVerification', code, EMAIL.VERIFICATION,
                () => ({ 'login.verified': true })
            );
            if (!userId) {
                return { success: false, error: INVALID_VERIFICATION_CODE };
            }
            const user = await User.findById(userId).select('login.passwordChangedAt dateCreated').lean();
            return { success: true, token: signToken(userId, await ensurePasswordChangedAt(user)) };
        } catch (error: any) {
            console.error('Verify email error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    /**
     * Email a password reset code, with the same rate limits and the same never-fails contract as
     * sendVerificationCode. Unverified accounts get one too: when someone registers with an
     * address that isn't theirs, the reset is how the real owner takes the account over.
     */
    async sendPasswordResetCode(email: string): Promise<SendPasswordResetResult> {
        try {
            const user = await User.findOne({ 'login.email': normalizeEmail(email) })
                .select('login.email passwordReset')
                .lean() as any;
            if (!user) return { success: true, sent: false, reason: 'no-user' };

            const issued = await this.codeService.issue(user._id, 'passwordReset', user.passwordReset, EMAIL.PASSWORD_RESET);
            if (!issued.code) return { success: true, sent: false, reason: issued.reason };

            await getMailer().send(renderPasswordResetEmail({ to: user.login.email, code: issued.code }));
            return { success: true, sent: true };
        } catch (error: any) {
            console.error('Send password reset code error:', error.message);
            return { success: true, sent: false, reason: 'send-failed' };
        }
    }

    /**
     * Redeem a reset code and set a new password. Moving `passwordChangedAt` revokes every
     * token already issued, so whoever else was signed in (a squatter included) is out. The code
     * reached the address's inbox, which also proves the address: the account is verified, and
     * a pending verification code is moot.
     */
    async resetPassword(email: string, code: string, password: string): Promise<PasswordChangeResult> {
        try {
            const changedAt = new Date();
            const userId = await this.codeService.redeem(
                normalizeEmail(email), 'passwordReset', code, EMAIL.PASSWORD_RESET,
                async () => ({
                    'login.password': await hashPassword(password),
                    'login.passwordChangedAt': changedAt,
                    'login.verified': true,
                    'emailVerification.codeHash': null,
                    'emailVerification.expiresAt': null,
                    'emailVerification.attempts': 0
                })
            );
            if (!userId) {
                return { success: false, error: INVALID_RESET_CODE };
            }
            return { success: true, token: signToken(userId, changedAt.getTime()) };
        } catch (error: any) {
            console.error('Reset password error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    /** Change the password of a signed-in user who knows the current one. */
    async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<PasswordChangeResult> {
        try {
            const user = await User.findById(userId).select('login.password').lean() as any;
            if (!user) {
                return { success: false, error: 'User not found' };
            }
            if (!(await bcrypt.compare(currentPassword, user.login.password))) {
                return { success: false, error: WRONG_CURRENT_PASSWORD };
            }

            // Conditional on the hash just checked: if a reset landed while bcrypt ran, this
            // request proved knowledge of a password that no longer exists and must not undo it.
            const changedAt = new Date();
            const result = await User.updateOne(
                { _id: user._id, 'login.password': user.login.password },
                { $set: { 'login.password': await hashPassword(newPassword), 'login.passwordChangedAt': changedAt } }
            );
            if (result.modifiedCount === 0) {
                return { success: false, error: 'Your password was just changed elsewhere. Please sign in again.' };
            }
            return { success: true, token: signToken(userId, changedAt.getTime()) };
        } catch (error: any) {
            console.error('Change password error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }
}

export default AuthService;

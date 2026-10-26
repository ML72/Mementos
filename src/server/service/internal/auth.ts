import bcrypt from 'bcryptjs';
import { sign } from 'jsonwebtoken';
import { User } from '../../models';
import { EMAIL, JWT_SECRET } from '../../settings';
import { renderVerificationEmail } from '../../config';
import { getMailer } from '../external';
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

/**
 * `success` is always true — there is no failure the caller may reveal. `sent`/`reason` say what
 * actually happened, for tests and logs; they must never reach the HTTP response.
 */
export interface SendVerificationResult {
    success: true;
    sent: boolean;
    reason?: IssueSkipReason | 'no-user' | 'already-verified' | 'send-failed';
}

export interface VerifyEmailResult {
    success: boolean;
    token?: string;
    error?: string;
}

/** Same message for every failure so the response never narrates which check failed. */
export const INVALID_VERIFICATION_CODE = 'Invalid or expired verification code';
export const EMAIL_UNVERIFIED = 'Please verify your email address. We sent you a code.';

/** Trim + lowercase: the schema does the same on write and on query filters. */
export const normalizeEmail = (email: string): string => String(email ?? '').trim().toLowerCase();

export const signToken = (userId: string): string =>
    sign({ user: { id: userId } }, JWT_SECRET, { expiresIn: 259200 }); // 3 days

class AuthService {
    private readonly codeService = new CodeService();

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

            // Only reached with the right password, so saying "unverified" reveals nothing new.
            if (EMAIL.VERIFICATION.REQUIRED && !(user as any).login.verified) {
                await this.sendVerificationCode(email);
                return { success: false, unverified: true, error: EMAIL_UNVERIFIED };
            }

            return { success: true, token: signToken(user.id) };
        } catch (error: any) {
            console.error('Authentication error:', error.message);
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
            return { success: true, token: signToken(userId) };
        } catch (error: any) {
            console.error('Verify email error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }
}

export default AuthService;

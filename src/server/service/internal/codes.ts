import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { User } from '../../models';
import { EMAIL } from '../../settings';

/**
 * Emailed one-time codes. One implementation for every flow that mails a short numeric code
 * and later redeems it (email verification today), since the abuse cases are the same: guessing
 * a live code, and using the endpoint to flood an inbox.
 *
 * `path` names the subtree on User holding the state: { codeHash, expiresAt, attempts,
 * lastSentAt, sendCount, sendWindowStartedAt }.
 */
export type CodePath = 'emailVerification';

export interface CodeLimits {
    CODE_LENGTH: number;
    EXPIRY_MINUTES: number;
    MAX_ATTEMPTS: number;
    RESEND_COOLDOWN_SECONDS: number;
    MAX_SENDS_PER_WINDOW: number;
    SEND_WINDOW_MINUTES: number;
}

export type IssueSkipReason = 'cooldown' | 'window-exhausted' | 'raced';

export interface IssueCodeResult {
    code?: string;
    reason?: IssueSkipReason;
}

/** Zero-padded numeric code. `crypto.randomInt` is unbiased (no `Math.random`, no `% 10^n`). */
export const generateCode = (length: number): string =>
    randomInt(0, 10 ** length).toString().padStart(length, '0');

/**
 * HMAC-SHA256 rather than bcrypt: a 6-digit code has only 10^6 candidates, so a bcrypt hash in a
 * leaked database is crackable in hours, while an HMAC is worthless without the server-side
 * secret — and it is cheap enough for an unauthenticated endpoint.
 */
export const hashCode = (code: string): string =>
    createHmac('sha256', EMAIL.CODE_SECRET).update(code).digest('hex');

const codesMatch = (code: string, storedHash: string): boolean => {
    const expected = Buffer.from(hashCode(code), 'utf8');
    const actual = Buffer.from(storedHash, 'utf8');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
};

class CodeService {
    /**
     * Store a fresh code for the user and return it for mailing, unless rate limits say no.
     * `state` is the subtree as just read. The write repeats the cooldown and window checks in
     * its filter, so it is a compare-and-set: of two concurrent requests, the second matches
     * nothing and gets `raced`.
     */
    async issue(userId: any, path: CodePath, state: any, limits: CodeLimits): Promise<IssueCodeResult> {
        const now = new Date();
        const nowMs = now.getTime();
        const current = state || {};
        const cooldownCutoff = new Date(nowMs - limits.RESEND_COOLDOWN_SECONDS * 1000);
        const windowCutoff = new Date(nowMs - limits.SEND_WINDOW_MINUTES * 60 * 1000);

        if (current.lastSentAt && new Date(current.lastSentAt) > cooldownCutoff) {
            return { reason: 'cooldown' };
        }
        const windowActive = current.sendWindowStartedAt && new Date(current.sendWindowStartedAt) > windowCutoff;
        if (windowActive && (current.sendCount ?? 0) >= limits.MAX_SENDS_PER_WINDOW) {
            return { reason: 'window-exhausted' };
        }

        const code = generateCode(limits.CODE_LENGTH);
        const codeFields = {
            [`${path}.codeHash`]: hashCode(code),
            [`${path}.expiresAt`]: new Date(nowMs + limits.EXPIRY_MINUTES * 60 * 1000),
            [`${path}.attempts`]: 0,
            [`${path}.lastSentAt`]: now
        };
        // `{ field: null }` also matches a missing field, so accounts that predate the subtree work.
        const notInCooldown = {
            $or: [{ [`${path}.lastSentAt`]: null }, { [`${path}.lastSentAt`]: { $lte: cooldownCutoff } }]
        };
        const claim = windowActive
            ? await User.updateOne(
                {
                    _id: userId,
                    [`${path}.sendWindowStartedAt`]: { $gt: windowCutoff },
                    [`${path}.sendCount`]: { $lt: limits.MAX_SENDS_PER_WINDOW },
                    ...notInCooldown
                },
                { $set: codeFields, $inc: { [`${path}.sendCount`]: 1 } }
            )
            : await User.updateOne(
                {
                    _id: userId,
                    $and: [
                        {
                            $or: [
                                { [`${path}.sendWindowStartedAt`]: null },
                                { [`${path}.sendWindowStartedAt`]: { $lte: windowCutoff } }
                            ]
                        },
                        notInCooldown
                    ]
                },
                { $set: { ...codeFields, [`${path}.sendWindowStartedAt`]: now, [`${path}.sendCount`]: 1 } }
            );
        return claim.modifiedCount === 0 ? { reason: 'raced' } : { code };
    }

    /**
     * Redeem a code; returns the user's id on success, null on any failure (callers give every
     * failure the same message). The attempt is counted *before* the code is compared, in the
     * same write that fetches it, so concurrent guesses cannot both observe `attempts = 4` and
     * both proceed. `onSuccess` supplies the fields the redemption exists to write; they land in
     * one update together with clearing the code, conditional on the hash still being the one
     * matched — so a code redeems exactly once. Issuance counters are left alone on purpose.
     */
    async redeem(
        email: string,
        path: CodePath,
        code: string,
        limits: CodeLimits,
        onSuccess: () => Promise<Record<string, any>> | Record<string, any>
    ): Promise<string | null> {
        const cleared = { [`${path}.codeHash`]: null, [`${path}.expiresAt`]: null, [`${path}.attempts`]: 0 };

        const user = await User.findOneAndUpdate(
            { 'login.email': email, [`${path}.codeHash`]: { $type: 'string' } },
            { $inc: { [`${path}.attempts`]: 1 } },
            { returnDocument: 'after' }
        ).select(path).lean() as any;
        if (!user) return null;

        const state = user[path];
        const expired = !state.expiresAt || new Date(state.expiresAt).getTime() < Date.now();
        if (expired || state.attempts > limits.MAX_ATTEMPTS) {
            await User.updateOne({ _id: user._id }, { $set: cleared });
            return null;
        }
        if (!codesMatch(String(code), state.codeHash)) return null;

        const result = await User.updateOne(
            { _id: user._id, [`${path}.codeHash`]: state.codeHash },
            { $set: { ...(await onSuccess()), ...cleared } }
        );
        return result.modifiedCount === 0 ? null : user._id.toString();
    }
}

export default CodeService;

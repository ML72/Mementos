import { describe, it, expect } from '@jest/globals';
import { User } from '../../src/server/models';

// Pure schema test — Mongoose applies defaults when a document is constructed, so this needs
// no database. It pins the promise the User schema makes: every account carries the
// email-feature fields from the moment it is created, so features can be written against them
// without guarding each read with a "does this field exist yet?" check.

describe('User schema — email-feature defaults', () => {
    const build = () => new User({
        profile: { fullName: 'Test User' },
        login: { email: 'schema.test@example.com', password: 'a-bcrypt-hash' },
        roles: ['USER']
    }) as any;

    it('stamps login.passwordChangedAt so token invalidation never sees a missing date', () => {
        expect(build().login.passwordChangedAt).toBeInstanceOf(Date);
    });

    it('puts the digest on the weekday (UTC) the account is created on, unscheduled', () => {
        const user = build();
        expect(user.settings.email.digestDay).toBe(new Date().getUTCDay());
        expect(user.settings.email.nextDigestAt).toBeNull();
    });

    it('rejects a digest day outside Sunday (0) to Saturday (6)', () => {
        const user = build();
        user.settings.email.digestDay = 7;
        expect(user.validateSync()?.errors['settings.email.digestDay']).toBeTruthy();
    });

    it('starts passwordReset in the resting "no reset in flight" state', () => {
        const user = build();
        expect(user.passwordReset.codeHash).toBeNull();
        expect(user.passwordReset.expiresAt).toBeNull();
        expect(user.passwordReset.attempts).toBe(0);
        expect(user.passwordReset.lastSentAt).toBeNull();
        expect(user.passwordReset.sendCount).toBe(0);
        expect(user.passwordReset.sendWindowStartedAt).toBeNull();
    });

    it('opts new users into the weekly digest with an explicit true', () => {
        // Explicit rather than absent: the digest query is then a plain equality match,
        // not an "anything that isn't false" special case.
        expect(build().settings.email.weeklyDigest).toBe(true);
    });

    it('treats a new address as deliverable with no send history', () => {
        const email = build().settings.email;
        expect(email.deliveryStatus).toBe('active');
        expect(email.bounceCount).toBe(0);
        expect(email.lastBounceAt).toBeNull();
        expect(email.lastDigestSentAt).toBeNull();
    });

    it('issues a distinct unsubscribe token to every user', () => {
        const tokens = new Set<string>(
            Array.from({ length: 25 }, () => build().settings.email.unsubscribeToken)
        );
        expect(tokens.size).toBe(25);
        // 32 random bytes, base64url, unpadded.
        for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('rejects a delivery status outside the known set', () => {
        const user = build();
        user.settings.email.deliveryStatus = 'not-a-status';
        expect(user.validateSync()?.errors['settings.email.deliveryStatus']).toBeTruthy();
    });

    it('validates cleanly with nothing but the defaults filled in', () => {
        expect(build().validateSync()).toBeUndefined();
    });
});

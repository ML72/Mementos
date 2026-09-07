import mongoose from 'mongoose';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { User } from '../../src/server/models';
import { migrateEmailSchema, findEmailCaseCollisions, countRemaining } from '../../src/server/scripts/migrate_email_schema';

const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/mementos_test_migration';

/** A user document as accounts looked before the email-feature schema landed. */
const legacyUser = (email: string, dateCreated: Date, extra: any = {}) => ({
    login: { email, password: '$2b$10$hash', verified: false },
    roles: ['USER'],
    profile: { fullName: email.split('@')[0], bio: '' },
    following: [],
    followers: [],
    likedNotes: [],
    dateCreated,
    __v: 0,
    ...extra
});

describe('migrate_email_schema', () => {
    beforeAll(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        await mongoose.connect(TEST_MONGO_URI);
        await User.syncIndexes();
    });

    afterAll(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.dropDatabase();
            await mongoose.connection.close();
        }
    });

    beforeEach(async () => {
        await User.deleteMany({});
    });

    const raw = (email: string) => User.collection.findOne({ 'login.email': email }) as Promise<any>;

    it('backfills every reserved field on legacy accounts and leaves new accounts untouched', async () => {
        const created = new Date('2024-03-01T12:00:00Z');
        await User.collection.insertMany([
            legacyUser('old1@example.com', created),
            legacyUser('old2@example.com', new Date('2024-05-01T00:00:00Z'))
        ]);
        await new User({ profile: { fullName: 'New' }, login: { email: 'new@example.com', password: 'x'.repeat(60) }, roles: ['USER'] }).save();
        const newBefore = await raw('new@example.com');

        expect(await countRemaining()).toEqual({ missingUnsubscribeToken: 2, missingPasswordChangedAt: 2, unnormalizedEmails: 0 });

        const lines: string[] = [];
        const report = await migrateEmailSchema({ log: l => lines.push(l) });

        expect(report.collisions).toEqual([]);
        expect(report.passwordChangedAtBackfilled).toBe(2);
        expect(report.passwordResetBackfilled).toBe(2);
        expect(report.emailSettingsBackfilled).toBe(2);
        expect(report.unsubscribeTokensIssued).toBe(2);
        expect(report.remaining).toEqual({ missingUnsubscribeToken: 0, missingPasswordChangedAt: 0, unnormalizedEmails: 0 });
        expect(lines.some(l => l.startsWith('After: 0 missing'))).toBe(true);

        const old1 = await raw('old1@example.com');
        // From the account's own creation date, never "now".
        expect(old1.login.passwordChangedAt.getTime()).toBe(created.getTime());
        expect(old1.passwordReset).toEqual({
            codeHash: null, expiresAt: null, attempts: 0, lastSentAt: null, sendCount: 0, sendWindowStartedAt: null
        });
        expect(old1.settings.email.weeklyDigest).toBe(true);
        expect(old1.settings.email.deliveryStatus).toBe('active');
        expect(old1.settings.email.bounceCount).toBe(0);
        expect(old1.settings.email.lastBounceAt).toBeNull();
        expect(old1.settings.email.lastDigestSentAt).toBeNull();
        expect(old1.settings.email.unsubscribeToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

        const old2 = await raw('old2@example.com');
        expect(old2.settings.email.unsubscribeToken).not.toBe(old1.settings.email.unsubscribeToken);

        expect(await raw('new@example.com')).toEqual(newBefore);
    });

    it('is idempotent', async () => {
        await User.collection.insertOne(legacyUser('once@example.com', new Date('2024-01-01T00:00:00Z')));
        const first = await migrateEmailSchema();
        const after = await raw('once@example.com');
        const second = await migrateEmailSchema();
        expect(second.passwordChangedAtBackfilled).toBe(0);
        expect(second.unsubscribeTokensIssued).toBe(0);
        expect(second.emailSettingsBackfilled).toBe(0);
        expect(await raw('once@example.com')).toEqual(after);
        expect(first.unsubscribeTokensIssued).toBe(1);
    });

    it('fills in only what is missing on a partially-migrated account', async () => {
        await User.collection.insertOne(legacyUser('partial@example.com', new Date('2024-01-01T00:00:00Z'), {
            login: { email: 'partial@example.com', password: 'h', verified: true, passwordChangedAt: new Date('2025-01-01T00:00:00Z') },
            settings: { email: { weeklyDigest: false } }
        }));
        await migrateEmailSchema();
        const doc = await raw('partial@example.com');
        expect(doc.login.passwordChangedAt.getTime()).toBe(new Date('2025-01-01T00:00:00Z').getTime());
        expect(doc.settings.email.weeklyDigest).toBe(false);          // explicit opt-out preserved
        expect(doc.settings.email.deliveryStatus).toBe('active');
        expect(doc.settings.email.unsubscribeToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('lowercases stored addresses when there are no collisions', async () => {
        await User.collection.insertMany([
            legacyUser('Upper@Example.com', new Date()),
            legacyUser(' padded@example.com', new Date())
        ]);
        const report = await migrateEmailSchema();
        expect(report.emailsNormalized).toBe(2);
        expect(await raw('upper@example.com')).toBeTruthy();
        expect(await raw('padded@example.com')).toBeTruthy();
        expect(report.remaining.unnormalizedEmails).toBe(0);
    });

    it('refuses to touch emails while case-only collisions exist, but still backfills everything else', async () => {
        await User.collection.insertMany([
            legacyUser('Bob@example.com', new Date('2024-01-01T00:00:00Z')),
            legacyUser('bob@example.com', new Date('2024-02-01T00:00:00Z')),
            legacyUser('Other@example.com', new Date('2024-03-01T00:00:00Z'))
        ]);
        const collisions = await findEmailCaseCollisions();
        expect(collisions).toHaveLength(1);
        expect(collisions[0].normalized).toBe('bob@example.com');
        expect(collisions[0].accounts.map(a => a.email).sort()).toEqual(['Bob@example.com', 'bob@example.com']);

        const report = await migrateEmailSchema();
        expect(report.collisions).toHaveLength(1);
        expect(report.emailsNormalized).toBe(0);
        expect(await raw('Bob@example.com')).toBeTruthy();
        expect(await raw('Other@example.com')).toBeTruthy();   // untouched too, until the collision is resolved
        expect(report.remaining.unnormalizedEmails).toBe(2);
        // Everything that is not the email itself was still written.
        expect(report.remaining.missingUnsubscribeToken).toBe(0);
        expect(report.remaining.missingPasswordChangedAt).toBe(0);
    });

    it('writes nothing in dry-run mode but reports what it would do', async () => {
        await User.collection.insertOne(legacyUser('Dry@example.com', new Date()));
        const report = await migrateEmailSchema({ dryRun: true });
        expect(report.dryRun).toBe(true);
        expect(report.emailsNormalized).toBe(1);
        expect(report.unsubscribeTokensIssued).toBe(1);
        expect(report.passwordChangedAtBackfilled).toBe(1);
        expect(await countRemaining()).toEqual({ missingUnsubscribeToken: 1, missingPasswordChangedAt: 1, unnormalizedEmails: 1 });
        expect(await raw('Dry@example.com')).toBeTruthy();
    });

    it('issues unique tokens across a large legacy population', async () => {
        await User.collection.insertMany(
            Array.from({ length: 500 }, (_, i) => legacyUser(`bulk${i}@example.com`, new Date()))
        );
        const report = await migrateEmailSchema();
        expect(report.unsubscribeTokensIssued).toBe(500);
        const tokens = await User.collection.distinct('settings.email.unsubscribeToken');
        expect(tokens).toHaveLength(500);
    });
});

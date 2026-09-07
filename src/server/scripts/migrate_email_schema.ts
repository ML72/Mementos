/**
 * One-time backfill for accounts that predate the email-feature schema (docs/EMAIL.md §1).
 *
 *   npx ts-node src/server/scripts/migrate_email_schema.ts            # dev (reads .env / MONGO_URI)
 *   node dist/scripts/migrate_email_schema.js                          # production build
 *   ... --dry-run                                                      # report only, write nothing
 *
 * Mongoose defaults apply only to documents Mongoose writes, so accounts created before the
 * fields existed are missing them. The feature assumes every field is *present* (it checks
 * values, never presence), so those accounts need the defaults written once. Idempotent: every
 * step is a no-op on a document that already has the field.
 *
 * Three things here are not plain defaults:
 *  - `login.email` is lowercased, because it is the identity key for the reset flow. Two
 *    accounts that differ only in case cannot both survive, and choosing which one does is a
 *    human decision — so the script lists such collisions and refuses to touch emails at all.
 *  - `login.passwordChangedAt` comes from each account's own `dateCreated`, never from "now":
 *    stamping now would make every JWT in circulation look older than the password and sign
 *    the whole user base out at once.
 *  - `settings.email.unsubscribeToken` has to be unique per user, so it cannot come from one
 *    updateMany. It is written in a per-document loop; the unique index is the safety net.
 */

import mongoose from 'mongoose';
import { randomBytes } from 'crypto';
import { User } from '../models';
import { MONGO_URI } from '../settings';

export interface EmailCaseCollision {
    normalized: string;
    accounts: { id: string; email: string; dateCreated?: Date }[];
}

export interface MigrationReport {
    dryRun: boolean;
    collisions: EmailCaseCollision[];
    emailsNormalized: number;
    passwordChangedAtBackfilled: number;
    passwordResetBackfilled: number;
    emailSettingsBackfilled: number;
    unsubscribeTokensIssued: number;
    /** Post-run verification: both must be 0 for the migration to be considered complete. */
    remaining: { missingUnsubscribeToken: number; missingPasswordChangedAt: number; unnormalizedEmails: number };
}

const users = () => User.collection;

/** Accounts whose addresses differ only in case (or surrounding whitespace). */
export async function findEmailCaseCollisions(): Promise<EmailCaseCollision[]> {
    const groups = await users().aggregate([
        { $project: { email: '$login.email', dateCreated: 1, normalized: { $toLower: { $trim: { input: '$login.email' } } } } },
        { $group: { _id: '$normalized', accounts: { $push: { id: '$_id', email: '$email', dateCreated: '$dateCreated' } }, n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
        { $sort: { _id: 1 } }
    ]).toArray();
    return groups.map((g: any) => ({
        normalized: g._id,
        accounts: g.accounts.map((a: any) => ({ id: a.id.toString(), email: a.email, dateCreated: a.dateCreated }))
    }));
}

/** How many accounts still lack something the feature relies on. */
export async function countRemaining(): Promise<MigrationReport['remaining']> {
    const [missingUnsubscribeToken, missingPasswordChangedAt, unnormalizedEmails] = await Promise.all([
        users().countDocuments({ 'settings.email.unsubscribeToken': { $not: { $type: 'string' } } }),
        users().countDocuments({ 'login.passwordChangedAt': { $exists: false } }),
        users().countDocuments({ $expr: { $ne: ['$login.email', { $toLower: { $trim: { input: '$login.email' } } }] } })
    ]);
    return { missingUnsubscribeToken, missingPasswordChangedAt, unnormalizedEmails };
}

const newUnsubscribeToken = (): string => randomBytes(32).toString('base64url');

/**
 * Run every step. Uses the raw collection rather than Mongoose documents so nothing here
 * depends on the schema applying defaults — the whole point is to write them explicitly.
 */
export async function migrateEmailSchema(options: { dryRun?: boolean; log?: (line: string) => void } = {}): Promise<MigrationReport> {
    const dryRun = options.dryRun === true;
    const log = options.log ?? (() => undefined);
    const report: MigrationReport = {
        dryRun,
        collisions: [],
        emailsNormalized: 0,
        passwordChangedAtBackfilled: 0,
        passwordResetBackfilled: 0,
        emailSettingsBackfilled: 0,
        unsubscribeTokensIssued: 0,
        remaining: { missingUnsubscribeToken: 0, missingPasswordChangedAt: 0, unnormalizedEmails: 0 }
    };

    const before = await countRemaining();
    log(`Before: ${before.missingUnsubscribeToken} missing unsubscribe token, ${before.missingPasswordChangedAt} missing passwordChangedAt, ${before.unnormalizedEmails} un-normalized emails`);

    // 1. Email case. Refuse to normalize anything while collisions exist: which account wins is
    //    not the script's call. The other steps still run, since they are independent.
    report.collisions = await findEmailCaseCollisions();
    if (report.collisions.length > 0) {
        log(`Found ${report.collisions.length} email case collision(s); leaving login.email untouched until they are resolved:`);
        for (const c of report.collisions) {
            log(`  ${c.normalized}:`);
            for (const a of c.accounts) log(`    ${a.id}  ${a.email}  created ${a.dateCreated?.toISOString() ?? '?'}`);
        }
    } else if (before.unnormalizedEmails > 0) {
        if (!dryRun) {
            const res = await users().updateMany(
                { $expr: { $ne: ['$login.email', { $toLower: { $trim: { input: '$login.email' } } }] } },
                [{ $set: { 'login.email': { $toLower: { $trim: { input: '$login.email' } } } } }]
            );
            report.emailsNormalized = res.modifiedCount;
        } else {
            report.emailsNormalized = before.unnormalizedEmails;
        }
        log(`${dryRun ? 'Would normalize' : 'Normalized'} ${report.emailsNormalized} email address(es)`);
    }

    // 2. passwordChangedAt <- dateCreated (never now; see header).
    {
        const filter = { 'login.passwordChangedAt': { $exists: false } };
        if (!dryRun) {
            const res = await users().updateMany(filter, [
                { $set: { 'login.passwordChangedAt': { $ifNull: ['$login.passwordChangedAt', { $ifNull: ['$dateCreated', '$$NOW'] }] } } }
            ]);
            report.passwordChangedAtBackfilled = res.modifiedCount;
        } else {
            report.passwordChangedAtBackfilled = await users().countDocuments(filter);
        }
        log(`${dryRun ? 'Would backfill' : 'Backfilled'} login.passwordChangedAt on ${report.passwordChangedAtBackfilled} account(s)`);
    }

    // 3. passwordReset resting state.
    {
        const filter = {
            $or: [
                { 'passwordReset.codeHash': { $exists: false } },
                { 'passwordReset.expiresAt': { $exists: false } },
                { 'passwordReset.attempts': { $exists: false } },
                { 'passwordReset.lastSentAt': { $exists: false } },
                { 'passwordReset.sendCount': { $exists: false } },
                { 'passwordReset.sendWindowStartedAt': { $exists: false } }
            ]
        };
        if (!dryRun) {
            const res = await users().updateMany(filter, [{
                $set: {
                    'passwordReset.codeHash': { $ifNull: ['$passwordReset.codeHash', null] },
                    'passwordReset.expiresAt': { $ifNull: ['$passwordReset.expiresAt', null] },
                    'passwordReset.attempts': { $ifNull: ['$passwordReset.attempts', 0] },
                    'passwordReset.lastSentAt': { $ifNull: ['$passwordReset.lastSentAt', null] },
                    'passwordReset.sendCount': { $ifNull: ['$passwordReset.sendCount', 0] },
                    'passwordReset.sendWindowStartedAt': { $ifNull: ['$passwordReset.sendWindowStartedAt', null] }
                }
            }]);
            report.passwordResetBackfilled = res.modifiedCount;
        } else {
            report.passwordResetBackfilled = await users().countDocuments(filter);
        }
        log(`${dryRun ? 'Would backfill' : 'Backfilled'} passwordReset on ${report.passwordResetBackfilled} account(s)`);
    }

    // 4. settings.email defaults (everything except the token, which is per-document below).
    {
        const filter = {
            $or: [
                { 'settings.email.weeklyDigest': { $exists: false } },
                { 'settings.email.deliveryStatus': { $exists: false } },
                { 'settings.email.bounceCount': { $exists: false } },
                { 'settings.email.lastBounceAt': { $exists: false } },
                { 'settings.email.lastDigestSentAt': { $exists: false } }
            ]
        };
        if (!dryRun) {
            const res = await users().updateMany(filter, [{
                $set: {
                    'settings.email.weeklyDigest': { $ifNull: ['$settings.email.weeklyDigest', true] },
                    'settings.email.deliveryStatus': { $ifNull: ['$settings.email.deliveryStatus', 'active'] },
                    'settings.email.bounceCount': { $ifNull: ['$settings.email.bounceCount', 0] },
                    'settings.email.lastBounceAt': { $ifNull: ['$settings.email.lastBounceAt', null] },
                    'settings.email.lastDigestSentAt': { $ifNull: ['$settings.email.lastDigestSentAt', null] }
                }
            }]);
            report.emailSettingsBackfilled = res.modifiedCount;
        } else {
            report.emailSettingsBackfilled = await users().countDocuments(filter);
        }
        log(`${dryRun ? 'Would backfill' : 'Backfilled'} settings.email on ${report.emailSettingsBackfilled} account(s)`);
    }

    // 5. Unsubscribe tokens: unique per user, so one write per document. The filter is repeated
    //    in each update so a concurrent run cannot overwrite a token this one just issued.
    {
        const filter = { 'settings.email.unsubscribeToken': { $not: { $type: 'string' } } };
        if (!dryRun) {
            const cursor = users().find(filter, { projection: { _id: 1 } });
            for await (const doc of cursor) {
                for (let attempt = 0; attempt < 5; attempt++) {
                    try {
                        const res = await users().updateOne(
                            { _id: doc._id, ...filter },
                            { $set: { 'settings.email.unsubscribeToken': newUnsubscribeToken() } }
                        );
                        if (res.modifiedCount > 0) report.unsubscribeTokensIssued++;
                        break;
                    } catch (err: any) {
                        // 11000 = duplicate key. 256 random bits make this astronomically unlikely,
                        // but the index is the safety net and a retry costs nothing.
                        if (err?.code !== 11000 || attempt === 4) throw err;
                    }
                }
            }
        } else {
            report.unsubscribeTokensIssued = await users().countDocuments(filter);
        }
        log(`${dryRun ? 'Would issue' : 'Issued'} ${report.unsubscribeTokensIssued} unsubscribe token(s)`);
    }

    report.remaining = await countRemaining();
    log(`After: ${report.remaining.missingUnsubscribeToken} missing unsubscribe token, ${report.remaining.missingPasswordChangedAt} missing passwordChangedAt, ${report.remaining.unnormalizedEmails} un-normalized emails`);
    return report;
}

async function main(): Promise<void> {
    const dryRun = process.argv.includes('--dry-run');
    console.log(`Connecting to ${MONGO_URI.replace(/\/\/[^@]*@/, '//<credentials>@')}${dryRun ? ' (dry run)' : ''}`);
    await mongoose.connect(MONGO_URI);
    try {
        const report = await migrateEmailSchema({ dryRun, log: line => console.log(line) });
        const incomplete = report.collisions.length > 0
            || report.remaining.missingUnsubscribeToken > 0
            || report.remaining.missingPasswordChangedAt > 0
            || report.remaining.unnormalizedEmails > 0;
        if (dryRun) {
            console.log('Dry run: nothing was written.');
        } else if (incomplete) {
            console.error('Migration INCOMPLETE. Resolve the items above and run again.');
            process.exitCode = 1;
        } else {
            console.log('Migration complete: every account carries the email-feature fields.');
        }
    } finally {
        await mongoose.disconnect();
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
}

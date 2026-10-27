import { User } from '../../models';
import { EMAIL } from '../../settings';
import { renderDigestEmail, DigestNote } from '../../config';
import { getMailer, SendFailure } from '../external';
import FeedService from './feed';

export interface DigestRunResult {
    success: boolean;
    /** Digests accepted by the mail server. */
    sent: number;
    /** Sends that failed. A failure on our side also ends the run; the next run retries it. */
    failed: number;
    /** Users moved on to their next slot without a digest (newly scheduled, or not mailable). */
    rescheduled: number;
    error?: string;
}

type Outcome = 'sent' | 'rejected' | 'retry' | 'rescheduled' | 'raced';

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

// ---------------------------------------------------------------------------
// Pure scheduling helper (exported for unit testing; takes the time explicitly).
// ---------------------------------------------------------------------------

/**
 * When the next digest is due: the first 12AM UTC on `digestDay` strictly after `after`, a week
 * later if that is within MIN_GAP_HOURS of the last digest — so moving the digest day to a
 * nearby day can't mean two emails a few days apart. One week always suffices: slots are a week
 * apart, and the gap is less than that.
 */
export function nextDigestAt(digestDay: number, after: Date, lastSentAt?: Date | null): Date {
    const midnight = Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate());
    let slot = midnight + ((digestDay - after.getUTCDay() + 7) % 7) * DAY_MS;
    if (slot <= after.getTime()) slot += WEEK_MS;
    if (lastSentAt && slot - new Date(lastSentAt).getTime() < EMAIL.DIGEST.MIN_GAP_HOURS * HOUR_MS) {
        slot += WEEK_MS;
    }
    return new Date(slot);
}

const toDigestNote = (note: any, userId: string): DigestNote => {
    const creator = note.creator;
    const own = (creator?._id ?? creator)?.toString() === userId;
    return {
        subject: note.subject,
        content: note.content,
        tags: [...(note.tags || [])],
        authorName: own ? null : (creator?.profile?.fullName || 'Someone you follow')
    };
};

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// DigestService
// ---------------------------------------------------------------------------

class DigestService {
    private readonly feedService = new FeedService();

    /**
     * Send every digest due at `now`, and move everyone else whose slot has passed on to their
     * next one. Safe to run at any time, as often as you like, on any number of app instances at
     * once: a user is claimed with a conditional write before anything is sent, and whoever loses
     * the claim skips them. A run that starts late catches up.
     */
    async run(now: Date = new Date()): Promise<DigestRunResult> {
        const result: DigestRunResult = { success: true, sent: 0, failed: 0, rescheduled: 0 };
        try {
            // Opted in, and never scheduled or past their slot. Every user handled below leaves
            // this set (their slot moves past `now`), so plain re-querying pages through it;
            // `handled` only guards against looping on one that somehow didn't.
            const due = {
                'settings.email.weeklyDigest': true,
                $or: [{ 'settings.email.nextDigestAt': null }, { 'settings.email.nextDigestAt': { $lte: now } }]
            };
            const handled = new Set<string>();
            for (;;) {
                const batch = (await User.find(due)
                    .select('login.email login.verified profile.fullName settings.email')
                    .limit(EMAIL.DIGEST.BATCH_SIZE)
                    .lean())
                    .filter(user => !handled.has(user._id.toString()));
                if (batch.length === 0) return result;

                for (const user of batch) {
                    handled.add(user._id.toString());
                    const outcome = await this.handle(user, now);
                    if (outcome === 'sent') result.sent++;
                    if (outcome === 'rejected' || outcome === 'retry') result.failed++;
                    if (outcome === 'rescheduled') result.rescheduled++;
                    // A failure on our side (mail server down) would fail every send after it.
                    if (outcome === 'retry') return result;
                    if (outcome === 'sent' && EMAIL.DIGEST.THROTTLE_MS > 0) await pause(EMAIL.DIGEST.THROTTLE_MS);
                }
            }
        } catch (error: any) {
            console.error('Digest run error:', error.message);
            return { ...result, success: false, error: 'Server error' };
        }
    }

    private async handle(user: any, now: Date): Promise<Outcome> {
        const email = user.settings.email;
        const slot: Date | null = email.nextDigestAt;
        const lastSentAt: Date | null = email.lastDigestSentAt;
        const tooSoon = lastSentAt !== null &&
            now.getTime() - new Date(lastSentAt).getTime() < EMAIL.DIGEST.MIN_GAP_HOURS * HOUR_MS;
        // Bulk mail only goes to proven addresses: an account someone registered with an address
        // that isn't theirs stays unverified, and its owner never asked for this.
        const mailable = user.login.verified === true && email.deliveryStatus === 'active';

        if (slot === null || tooSoon || !mailable) {
            // No digest now: never scheduled yet, the gap rule (normally already built into the
            // slot), or an address that can't take mail. Moving to the next slot rather than
            // waiting means nobody gets a stale catch-up later, e.g. right after verifying.
            const moved = await User.updateOne(
                { _id: user._id, 'settings.email.nextDigestAt': slot },
                { $set: { 'settings.email.nextDigestAt': nextDigestAt(email.digestDay, now, lastSentAt) } }
            );
            return moved.modifiedCount === 0 ? 'raced' : 'rescheduled';
        }
        return this.deliver(user, now);
    }

    private async deliver(user: any, now: Date): Promise<Outcome> {
        const email = user.settings.email;
        const userId = user._id.toString();
        const next = nextDigestAt(email.digestDay, now, now);

        // The claim: conditional on the slot just read, so of two runs racing for this user (a
        // second app instance, a double-fired timer) exactly one gets past here.
        const claim = await User.updateOne(
            { _id: user._id, 'settings.email.nextDigestAt': email.nextDigestAt },
            { $set: { 'settings.email.lastDigestSentAt': now, 'settings.email.nextDigestAt': next } }
        );
        if (claim.modifiedCount === 0) return 'raced';

        try {
            const feed = await this.feedService.previewFeed(userId, EMAIL.DIGEST.NOTE_COUNT);
            if (!feed.success) throw new Error(feed.error || 'Could not build the feed');

            await getMailer().send(renderDigestEmail({
                to: user.login.email,
                fullName: user.profile?.fullName || 'there',
                notes: (feed.notes || []).map(note => toDigestNote(note, userId)),
                unsubscribeToken: email.unsubscribeToken
            }));
            return 'sent';
        } catch (error: any) {
            if (error instanceof SendFailure && error.kind !== 'transient') {
                // The provider refused the address. Retrying within the hour would only bounce
                // again, so this week's digest stays spent.
                console.error(`DIGEST: digest to user ${userId} rejected (${error.kind}): ${error.message}`);
                return 'rejected';
            }
            // Our side failed (mail server, database): hand the slot back for the next run.
            await User.updateOne(
                { _id: user._id, 'settings.email.lastDigestSentAt': now, 'settings.email.nextDigestAt': next },
                {
                    $set: {
                        'settings.email.lastDigestSentAt': email.lastDigestSentAt,
                        'settings.email.nextDigestAt': email.nextDigestAt
                    }
                }
            );
            console.error(`DIGEST: send failed, retrying next run: ${error.message}`);
            return 'retry';
        }
    }
}

/**
 * Run the digest job now, then a second past the top of every hour (UTC), in this process.
 * Every slot is at 12AM UTC, so the midnight run does the sending; the others catch up after
 * downtime and retry sends that failed on our side. Runs never overlap within a process, and
 * the per-user claim keeps several app instances from mailing anyone twice.
 */
export function startDigestScheduler(): void {
    if (!EMAIL.DIGEST.ENABLED) {
        console.warn('DIGEST: EMAIL_DIGEST_ENABLED is false, so no weekly digests are sent');
        return;
    }
    const service = new DigestService();
    let running = false;

    const tick = async (): Promise<void> => {
        if (running) return;
        running = true;
        try {
            const { sent, failed, rescheduled } = await service.run();
            if (sent || failed || rescheduled) {
                console.log(`DIGEST: sent ${sent}, failed ${failed}, rescheduled ${rescheduled}`);
            }
        } catch (error: any) {
            // run() reports its own failures; this only keeps a surprise from becoming an
            // unhandled rejection, which would take the whole server down.
            console.error('DIGEST: run failed:', error?.message || error);
        } finally {
            running = false;
        }
    };
    const scheduleNextTick = (): void => {
        // The extra second keeps a timer that fires a hair early from landing before midnight.
        const delay = HOUR_MS - (Date.now() % HOUR_MS) + 1000;
        setTimeout(() => { tick().finally(scheduleNextTick); }, delay).unref();
    };

    console.log('DIGEST: weekly digests on, checked at the top of every hour (UTC)');
    tick();
    scheduleNextTick();
}

export default DigestService;

import { User } from '../../models';
import { EMAIL } from '../../settings';
import { getMailer, renderDigestEmail, SendFailure, DigestNote } from '../../mail';
import FeedService from './feed';
import EmailService from './email';

export interface DigestRunOptions {
    /** Injected clock, for tests. */
    now?: Date;
    /** Override the inter-recipient pause (tests pass 0). */
    throttleMs?: number;
}

export interface DigestRunResult {
    success: boolean;
    /** Recipients the query returned. */
    candidates: number;
    /** Digests accepted by the mailer. */
    sent: number;
    /** Skipped because their feed had nothing to show (not claimed; retried next run). */
    empty: number;
    /** Lost the compare-and-set: another instance or an earlier run already took them. */
    alreadyClaimed: number;
    /** Claimed but the send failed; they miss this period. */
    failed: number;
    error?: string;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * The weekly digest: mail each opted-in, deliverable user a read-only snapshot of their feed.
 * Safe to run from several app instances at once and to re-run after a crash — the per-user
 * claim below is an atomic compare-and-set on `lastDigestSentAt`, so nobody is mailed twice for
 * one period and no distributed lock is needed.
 */
class DigestService {
    private running = false;

    constructor(
        private readonly feedService: FeedService = new FeedService(),
        private readonly emailService: EmailService = new EmailService()
    ) {}

    /** The freshness filter: users whose last digest predates `periodStart` (or never had one). */
    static dueFilter(periodStart: Date): any {
        return {
            $or: [
                { 'settings.email.lastDigestSentAt': null },
                { 'settings.email.lastDigestSentAt': { $lt: periodStart } }
            ]
        };
    }

    async run(options: DigestRunOptions = {}): Promise<DigestRunResult> {
        const result: DigestRunResult = { success: true, candidates: 0, sent: 0, empty: 0, alreadyClaimed: 0, failed: 0 };
        if (this.running) {
            return { ...result, success: false, error: 'Digest run already in progress' };
        }
        this.running = true;
        try {
            const now = options.now ?? new Date();
            const throttleMs = options.throttleMs ?? EMAIL.DIGEST.THROTTLE_MS;
            const periodStart = new Date(now.getTime() - EMAIL.DIGEST.PERIOD_HOURS * 3600 * 1000);

            // Three separate conditions on purpose: consent, deliverability, and not already
            // sent this period. A cursor, not find().then(), so memory stays flat however many
            // users there are and the run can be interrupted anywhere.
            const cursor = User.find({
                'settings.email.weeklyDigest': true,
                'settings.email.deliveryStatus': { $nin: ['bounced', 'complained', 'suppressed'] },
                ...DigestService.dueFilter(periodStart)
            })
                .select('_id login.email profile.fullName settings.email.unsubscribeToken')
                .lean()
                .cursor();

            for await (const user of cursor) {
                result.candidates++;
                const outcome = await this.sendDigestTo(user, periodStart, now);
                result[outcome]++;
                if (throttleMs > 0) await sleep(throttleMs);
            }
            return result;
        } catch (error: any) {
            console.error('Digest run error:', error.message);
            return { ...result, success: false, error: 'Server error' };
        } finally {
            this.running = false;
        }
    }

    /**
     * One recipient: preview (read-only), claim, send. The claim happens *before* the send, so a
     * failure after it costs one week's digest rather than risking a duplicate — a missed digest
     * is invisible, a duplicate is a spam-complaint risk for the whole sending domain.
     */
    private async sendDigestTo(user: any, periodStart: Date, now: Date): Promise<'sent' | 'empty' | 'alreadyClaimed' | 'failed'> {
        const feed = await this.feedService.previewFeed(user._id.toString(), EMAIL.DIGEST.NOTE_COUNT);
        const notes = feed.success ? (feed.notes ?? []) : [];
        if (notes.length === 0) {
            return 'empty';
        }

        const claim = await User.updateOne(
            { _id: user._id, ...DigestService.dueFilter(periodStart) },
            { $set: { 'settings.email.lastDigestSentAt': now } }
        );
        if (claim.modifiedCount === 0) {
            return 'alreadyClaimed';
        }

        const digestNotes: DigestNote[] = notes.map((note: any) => {
            const creator = note.creator ?? {};
            const creatorId = (creator._id ?? creator).toString();
            return {
                id: note._id.toString(),
                subject: note.subject,
                content: note.content,
                tags: note.tags ?? [],
                creatorName: creator.profile?.fullName || 'Someone you follow',
                isOwn: creatorId === user._id.toString()
            };
        });

        try {
            await getMailer().send(renderDigestEmail({
                to: user.login.email,
                fullName: user.profile?.fullName || 'there',
                notes: digestNotes,
                unsubscribeToken: user.settings?.email?.unsubscribeToken
            }));
            return 'sent';
        } catch (err: any) {
            if (err instanceof SendFailure) {
                await this.emailService.recordSendFailure(user.login.email, err.kind);
            }
            console.error(`Digest send failed for user ${user._id}:`, err?.message || err);
            return 'failed';
        }
    }
}

export default DigestService;

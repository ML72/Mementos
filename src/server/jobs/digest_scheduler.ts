import cron, { ScheduledTask } from 'node-cron';
import { EMAIL } from '../settings';
import { DigestService } from '../service';

/**
 * Start the weekly digest on its cron schedule. Called once from index.ts (never under
 * NODE_ENV=test). The expression is validated up front and rejected loudly: a malformed one
 * otherwise fails silently, and the digest simply never sends.
 */
export function startDigestScheduler(digestService: DigestService = new DigestService()): ScheduledTask | null {
    const { ENABLED, CRON, TIMEZONE } = EMAIL.DIGEST;

    if (!ENABLED) {
        console.log('Digest scheduler disabled (DIGEST_ENABLED=false).');
        return null;
    }
    if (!cron.validate(CRON)) {
        console.error(`DIGEST_CRON "${CRON}" is not a valid cron expression. The weekly digest will NOT run until it is fixed.`);
        return null;
    }

    try {
        const task = cron.schedule(CRON, async () => {
            const startedAt = Date.now();
            console.log('Digest run starting');
            const result = await digestService.run();
            const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
            if (result.success) {
                console.log(
                    `Digest run finished in ${seconds}s: ${result.sent} sent, ${result.empty} empty, ` +
                    `${result.alreadyClaimed} already claimed, ${result.failed} failed (${result.candidates} candidates)`
                );
            } else {
                console.error(`Digest run failed after ${seconds}s: ${result.error}`);
            }
        }, { timezone: TIMEZONE, noOverlap: true, name: 'weekly-digest' });
        console.log(`Digest scheduled: "${CRON}" (${TIMEZONE})`);
        return task;
    } catch (err: any) {
        // node-cron throws on an unknown timezone, among other things.
        console.error(`Failed to schedule the weekly digest (DIGEST_CRON="${CRON}", DIGEST_TIMEZONE="${TIMEZONE}"): ${err?.message || err}`);
        return null;
    }
}

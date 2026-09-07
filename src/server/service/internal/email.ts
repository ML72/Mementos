import { User } from '../../models';
import { EMAIL } from '../../settings';
import { SendFailureKind } from '../../mail';

/**
 * What a bounce/complaint handler (a provider webhook, or the SMTP rejection inspected at send
 * time) can report about an address. See docs/EMAIL.md §7.
 */
export type DeliveryEvent = 'hard_bounce' | 'soft_bounce' | 'complaint' | 'delivered';

export const DELIVERY_EVENTS: DeliveryEvent[] = ['hard_bounce', 'soft_bounce', 'complaint', 'delivered'];

export interface DeliveryEventResult {
    success: boolean;
    /** Whether an account with that address existed. Internal; not for HTTP responses. */
    matched?: boolean;
    error?: string;
}

/**
 * Delivery health lives on the user as one summary field (`settings.email.deliveryStatus`)
 * plus two soft-bounce counters, so the digest's "may I mail this address?" is one indexed
 * equality match rather than a scan of an event log.
 */
class EmailService {
    async recordDeliveryEvent(email: string, event: DeliveryEvent): Promise<DeliveryEventResult> {
        try {
            const filter: any = { 'login.email': String(email ?? '').trim().toLowerCase() };
            const now = new Date();
            let matched = false;

            switch (event) {
                case 'hard_bounce': {
                    // A complaint is stickier than a bounce: it must not be re-enabled without
                    // explicit re-consent, so a later bounce does not overwrite it.
                    const res = await User.updateOne(
                        { ...filter, 'settings.email.deliveryStatus': { $ne: 'complained' } },
                        { $set: { 'settings.email.deliveryStatus': 'bounced', 'settings.email.lastBounceAt': now } }
                    );
                    matched = res.matchedCount > 0;
                    break;
                }
                case 'complaint': {
                    const res = await User.updateOne(
                        filter,
                        { $set: { 'settings.email.deliveryStatus': 'complained', 'settings.email.lastBounceAt': now } }
                    );
                    matched = res.matchedCount > 0;
                    break;
                }
                case 'soft_bounce': {
                    const res = await User.updateOne(
                        filter,
                        { $inc: { 'settings.email.bounceCount': 1 }, $set: { 'settings.email.lastBounceAt': now } }
                    );
                    matched = res.matchedCount > 0;
                    // Suppress once the *consecutive* count crosses the threshold. Only an active
                    // address is demoted; bounced/complained already stop mail.
                    if (matched) {
                        await User.updateOne(
                            {
                                ...filter,
                                'settings.email.deliveryStatus': 'active',
                                'settings.email.bounceCount': { $gte: EMAIL.DELIVERY.SOFT_BOUNCE_SUPPRESS_THRESHOLD }
                            },
                            { $set: { 'settings.email.deliveryStatus': 'suppressed' } }
                        );
                    }
                    break;
                }
                case 'delivered': {
                    // Soft bounces only mean something consecutively; a delivery resets the run.
                    const res = await User.updateOne(filter, { $set: { 'settings.email.bounceCount': 0 } });
                    matched = res.matchedCount > 0;
                    break;
                }
                default:
                    return { success: false, error: 'Unknown delivery event' };
            }
            return { success: true, matched };
        } catch (error: any) {
            console.error('Record delivery event error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    /** Translate a synchronous SMTP rejection into the matching delivery event (transient = nothing). */
    async recordSendFailure(email: string, kind: SendFailureKind): Promise<DeliveryEventResult> {
        if (kind === 'hard') return this.recordDeliveryEvent(email, 'hard_bounce');
        if (kind === 'soft') return this.recordDeliveryEvent(email, 'soft_bounce');
        return { success: true, matched: false };
    }
}

export default EmailService;

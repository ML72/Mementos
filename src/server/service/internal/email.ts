import { User } from '../../models';
import { SendFailureKind } from '../../mail';

export interface DeliveryEventResult {
    success: boolean;
    /** Whether an account with that address existed. Internal; not for HTTP responses. */
    matched?: boolean;
    error?: string;
}

/**
 * Delivery health. The digest filters on `settings.email.deliveryStatus`, so a rejection has to
 * land there — mailing an address that hard-bounces every week is what wrecks a sending
 * domain's reputation. Written from SMTP rejections; a provider webhook reporting bounces and
 * complaints asynchronously would write the same field.
 */
class EmailService {
    /**
     * Only a hard bounce ("no such mailbox") says anything durable about an address. A soft or
     * transient failure is someone's full mailbox or our own outage, and the digest's weekly
     * cadence is already its own retry.
     */
    async recordSendFailure(email: string, kind: SendFailureKind): Promise<DeliveryEventResult> {
        try {
            if (kind !== 'hard') {
                return { success: true, matched: false };
            }
            const res = await User.updateOne(
                { 'login.email': String(email ?? '').trim().toLowerCase() },
                { $set: { 'settings.email.deliveryStatus': 'bounced', 'settings.email.lastBounceAt': new Date() } }
            );
            return { success: true, matched: res.matchedCount > 0 };
        } catch (error: any) {
            console.error('Record send failure error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }
}

export default EmailService;

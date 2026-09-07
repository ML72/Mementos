/**
 * Email Routes
 *
 * Endpoints reached from outside a browser session: the unsubscribe link in every digest (the
 * reader is in a mail client, so there is no JWT) and the delivery-events webhook a mail
 * provider calls back.
 *
 * Endpoints:
 * - GET  /api/email/unsubscribe?token= - confirmation page for a human-clicked link
 * - POST /api/email/unsubscribe?token= - perform the unsubscribe (RFC 8058 one-click, and the page's form)
 * - POST /api/email/events             - record a bounce/complaint/delivery for an address
 */

import { Request, Response, Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { check, validationResult } from 'express-validator';
import { UserService, EmailService, DELIVERY_EVENTS } from '../service';
import { sendError } from '../util';
import { EMAIL } from '../settings';
import { renderUnsubscribeConfirmPage, renderUnsubscribedPage, renderUnsubscribeInvalidPage } from '../mail';

const router = Router();
const userService = new UserService();
const emailService = new EmailService();

const tokenFrom = (req: Request): string | null => {
    const token = req.query.token;
    return typeof token === 'string' && token.length > 0 ? token : null;
};

// @route GET api/email/unsubscribe
// @desc landing page for the link in a digest. Shows a button that POSTs rather than acting on
//       the GET, so link prefetchers and security scanners cannot unsubscribe anyone.
// @access public
router.get('/unsubscribe', (req: Request, res: Response) => {
    const token = tokenFrom(req);
    res.type('html');
    if (!token) {
        res.status(400).send(renderUnsubscribeInvalidPage());
        return;
    }
    res.send(renderUnsubscribeConfirmPage(token));
});

// @route POST api/email/unsubscribe
// @desc withdraw digest consent for the account holding this token. Responds 200 with the same
//       page whether or not the token matched, so the endpoint is not a token oracle.
// @access public
router.post('/unsubscribe', async (req: Request, res: Response) => {
    const token = tokenFrom(req);
    res.type('html');
    if (!token) {
        res.status(400).send(renderUnsubscribeInvalidPage());
        return;
    }

    try {
        const result = await userService.unsubscribeByToken(token);
        if (!result.success) {
            sendError(res, 500, 'Server Error - Please try again');
            return;
        }
        res.send(renderUnsubscribedPage());
    } catch (err: any) {
        console.error(err.message);
        sendError(res, 500, 'Server Error - Please try again');
    }
});

const webhookAuthorized = (req: Request): boolean => {
    const secret: string = EMAIL.WEBHOOK_SECRET;
    if (!secret) return false;
    const presented = req.header('x-email-webhook-secret') || '';
    const a = Buffer.from(presented, 'utf8');
    const b = Buffer.from(secret, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
};

// @route POST api/email/events
// @desc record a delivery event for an address: { email, event } where event is one of
//       hard_bounce | soft_bounce | complaint | delivered. Provider-specific webhook payloads are
//       expected to be translated to this shape by a small adapter (see docs/EMAIL.md §7).
// @access shared secret (EMAIL_WEBHOOK_SECRET in the x-email-webhook-secret header); disabled when unset
router.post('/events', [
    check('email', 'Please provide a valid email').trim().isEmail().toLowerCase(),
    check('event', `event must be one of: ${DELIVERY_EVENTS.join(', ')}`).isIn(DELIVERY_EVENTS)
], async (req: Request, res: Response) => {
    if (!webhookAuthorized(req)) {
        sendError(res, 401, 'Unauthorized');
        return;
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        sendError(res, 400, errors.array().map(e => e.msg));
        return;
    }

    try {
        const { email, event } = req.body;
        const result = await emailService.recordDeliveryEvent(email, event);
        if (!result.success) {
            sendError(res, 400, result.error || 'Failed to record event');
            return;
        }
        // Same body whether or not the address is registered.
        res.json({ msg: 'Event recorded' });
    } catch (err: any) {
        console.error(err.message);
        sendError(res, 500, 'Server Error - Please try again');
    }
});

export default router;

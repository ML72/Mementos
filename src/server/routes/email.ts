/**
 * Email Routes
 *
 * The unsubscribe link carried by every digest. It is followed from a mail client, so there is
 * no session — the token in the URL is the only credential.
 *
 * Endpoints:
 * - GET  /api/email/unsubscribe?token= - confirmation page for a human-clicked link
 * - POST /api/email/unsubscribe?token= - perform the unsubscribe (RFC 8058 one-click, and the page's form)
 */

import { Request, Response, Router } from 'express';
import { UserService } from '../service';
import { sendError } from '../util';
import { renderUnsubscribeConfirmPage, renderUnsubscribedPage, renderUnsubscribeInvalidPage } from '../mail';

const router = Router();
const userService = new UserService();

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

export default router;

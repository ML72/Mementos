
/**
 * Email Routes
 *
 * Endpoints reached from links inside emails. A person opens these in a browser straight from
 * their mail client, so they answer with HTML pages rather than JSON.
 *
 * Endpoints:
 * - GET /api/email/unsubscribe?token= - Ask before unsubscribing from the weekly digest
 * - POST /api/email/unsubscribe?token= - Unsubscribe (also the target of one-click unsubscribe)
 */

import { Request, Response, Router } from 'express';
import { query, validationResult } from 'express-validator';
import { UserService } from '../service';
import { renderUnsubscribePage } from '../config';

const router = Router();
const userService = new UserService();

// The token is the credential: 32 random bytes, base64url-encoded (see newUnsubscribeToken).
const tokenCheck = query('token').isString().matches(/^[A-Za-z0-9_-]{20,128}$/);

// @route GET api/email/unsubscribe
// @desc confirmation page for a digest's unsubscribe link. Changes nothing: mail scanners and
//       link prefetchers follow GET links, so merely opening one must not unsubscribe anyone.
// @access public (token)
router.get('/unsubscribe', tokenCheck, (req: Request, res: Response) => {
    if (!validationResult(req).isEmpty()) {
        res.status(400).type('html').send(renderUnsubscribePage('invalid'));
        return;
    }
    res.type('html').send(renderUnsubscribePage('confirm', req.query.token as string));
});

// @route POST api/email/unsubscribe
// @desc turn the weekly digest off. Posted by the confirmation page's form, and by mail clients'
//       own unsubscribe buttons (RFC 8058 List-Unsubscribe-Post), which send no JSON body —
//       everything needed is in the URL. Same page whether or not the token matched anyone.
// @access public (token)
router.post('/unsubscribe', tokenCheck, async (req: Request, res: Response) => {
    if (!validationResult(req).isEmpty()) {
        res.status(400).type('html').send(renderUnsubscribePage('invalid'));
        return;
    }

    const token = req.query.token as string;
    const result = await userService.unsubscribe(token);
    if (!result.success) {
        res.status(500).type('html').send(renderUnsubscribePage('error', token));
        return;
    }
    res.type('html').send(renderUnsubscribePage('done'));
});

export default router;

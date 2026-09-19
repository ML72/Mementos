import { rateLimit } from 'express-rate-limit';
import { Request, Response } from 'express';
import { EMAIL } from '../settings';
import { sendError } from '../util';

/**
 * Per-IP limiter for the public emailed-code endpoints. The per-user counters on the
 * account stop a flood aimed at one victim; this stops one client spraying many addresses.
 *
 * `validate.trustProxy` is off because the app sets `trust proxy: true` for Azure's front door,
 * which express-rate-limit warns about (a permissive trust-proxy lets a client spoof its IP).
 * The platform proxy overwrites X-Forwarded-For, so only that warning is switched off.
 */
export const emailCodeLimiter = rateLimit({
    windowMs: EMAIL.CODE_IP_LIMIT.WINDOW_MINUTES * 60 * 1000,
    limit: EMAIL.CODE_IP_LIMIT.MAX_REQUESTS,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: { trustProxy: false },
    handler: (_req: Request, res: Response) => {
        sendError(res, 429, 'Too many requests. Please try again later.');
    }
});

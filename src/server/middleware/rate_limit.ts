import { rateLimit } from 'express-rate-limit';
import { Request, Response } from 'express';
import { EMAIL } from '../settings';
import { sendError } from '../util';

/**
 * Per-IP limiter for the two public password-reset endpoints. The per-user counters on the
 * account (cooldown, sends per window, attempts per code) stop a flood aimed at one victim;
 * this stops one client spraying many addresses or guessing across many accounts.
 *
 * The app sets `trust proxy: true` because it runs behind Azure's front door, which sets
 * X-Forwarded-For; express-rate-limit warns that a permissive trust-proxy lets a client spoof
 * its IP. That is a known trade-off here (the platform proxy overwrites the header), so that
 * one validation is switched off rather than the whole check.
 */
export const passwordResetLimiter = rateLimit({
    windowMs: EMAIL.PASSWORD_RESET.IP_WINDOW_MINUTES * 60 * 1000,
    limit: EMAIL.PASSWORD_RESET.IP_MAX_REQUESTS,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: { trustProxy: false },
    handler: (_req: Request, res: Response) => {
        sendError(res, 429, 'Too many requests. Please try again later.');
    }
});

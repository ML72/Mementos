import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../settings';
import { NextFunction, Request, Response } from 'express';
import { JWTUser } from '../../types/express';
import { User } from '../models';
import { sendError } from '../util';

// Define the JWT payload structure. `iat` (issued-at, whole seconds) is stamped by jsonwebtoken.
interface JWTPayload {
    user: JWTUser;
    iat: number;
}

/**
 * True when the token was issued before the account's password was last changed.
 *
 * JWTs are stateless, so this comparison is the only thing that signs other sessions out
 * after a password reset. `iat` has one-second resolution while `passwordChangedAt` has
 * milliseconds, so a token minted in the same second as the change would look older than it
 * without the one-second grace.
 */
export const issuedBeforePasswordChange = (iatSeconds: number, passwordChangedAt: Date): boolean =>
    iatSeconds * 1000 + 1000 < passwordChangedAt.getTime();

const privateAccess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Get token from header
    const token = req.header('x-auth-token');

    // Check if no token
    if(!token) {
        sendError(res, 401, 'No token, authorization denied', { is_token_invalid: true });
        return;
    }

    // Verify token signature and expiry
    let decoded: JWTPayload;
    try {
        decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch {
        sendError(res, 401, 'Token is not valid', { is_token_invalid: true });
        return;
    }

    // Reject tokens that predate a password change (or belong to a deleted account). This is
    // one `_id` point lookup with a two-field projection per authenticated request — the
    // cheapest query there is — and the alternative leaves a stolen token working everywhere
    // that isn't specially guarded.
    try {
        const user = await User.findById(decoded.user.id).select('login.passwordChangedAt dateCreated').lean();
        if (!user) {
            sendError(res, 401, 'Token is not valid', { is_token_invalid: true });
            return;
        }
        // Accounts written before the field existed are treated as "changed at creation",
        // which is exactly what the migration writes for them.
        const changedAt: Date | undefined = (user as any).login?.passwordChangedAt ?? (user as any).dateCreated;
        if (changedAt && typeof decoded.iat === 'number' && issuedBeforePasswordChange(decoded.iat, new Date(changedAt))) {
            sendError(res, 401, 'Token is not valid', { is_token_invalid: true });
            return;
        }
    } catch (err: any) {
        console.error('Auth lookup error:', err.message);
        sendError(res, 500, 'Server Error - Please try again');
        return;
    }

    req.user = decoded.user;
    next();
}

export { privateAccess };

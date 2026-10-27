import { NextFunction, Request, Response } from 'express';
import { AuthService } from '../service';
import { sendError } from '../util';

const authService = new AuthService();

const privateAccess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Get token from header
    const token = req.header('x-auth-token');

    // Check if no token
    if(!token) {
        sendError(res, 401, 'No token, authorization denied', { is_token_invalid: true });
        return;
    }

    // Verify token, including that the password hasn't changed since it was issued
    const result = await authService.verifyToken(token);
    if (!result.success) {
        // Only a bad token may sign the client out; a failed lookup on our side must not.
        if (result.invalid) {
            sendError(res, 401, result.error || 'Token is not valid', { is_token_invalid: true });
        } else {
            sendError(res, 500, 'Server Error - Please try again');
        }
        return;
    }

    req.user = result.user;
    next();
}

export { privateAccess };

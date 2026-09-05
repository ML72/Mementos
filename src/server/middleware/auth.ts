import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../settings';
import { NextFunction, Request, Response } from 'express';
import { JWTUser } from '../../types/express';
import { sendError } from '../util';

// Define the JWT payload structure
interface JWTPayload {
    user: JWTUser;
}

const privateAccess = (req: Request, res: Response, next: NextFunction): void => {
    // Get token from header
    const token = req.header('x-auth-token');

    // Check if no token
    if(!token) {
        sendError(res, 401, 'No token, authorization denied', { is_token_invalid: true });
        return;
    }

    // Verify token
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
        req.user = decoded.user;
        next();
    } catch {
        sendError(res, 401, 'Token is not valid', { is_token_invalid: true });
        return;
    }
}

export { privateAccess };
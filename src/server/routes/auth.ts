
/**
 * Authentication Routes
 * 
 * This module defines the API endpoints for user authentication and authorization.
 * Handles user login and token-based authentication for accessing protected resources.
 * 
 * Endpoints:
 * - GET /api/auth - Get authenticated user's basic information
 * - POST /api/auth - Authenticate user and get JWT token
 */

import { Request, Response, Router } from 'express';
import { check, validationResult } from 'express-validator';
import { privateAccess } from '../middleware';
import { AuthService } from '../service';
import { sendError } from '../util';

const router = Router();
const authService = new AuthService();

// @route GET api/auth
// @desc get basic user information via token
// @access private
router.get('/', privateAccess, async (req: Request, res: Response) => {
    try {
        const result = await authService.getUserById(req.user!.id);
        
        if (!result.success) {
            sendError(res, 404, result.error || 'User not found');
            return;
        }
        
    res.json(result.user);
    } catch(err: any) {
        console.error(err.message);
        sendError(res, 500, 'Server Error - Please try again');
    }
});


// @route POST api/auth
// @desc authenticate user and get token
// @access public
router.post('/', [
    check('email', 'Please enter a valid email').isEmail(),
    check('password', 'Please enter a password').not().isEmpty()
], async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        sendError(res, 400, errors.array().map(e => e.msg));
        return;
    }

    try {
        const { email, password } = req.body;

        const result = await authService.authenticateUser(email, password);

        if (!result.success) {
            sendError(res, 400, result.error || 'Authentication failed');
            return;
        }

    res.json({ token: result.token });
    } catch(err: any) { 
        console.error(err.message);
        sendError(res, 500, 'Server Error - Please try again');
    }
});

export default router;
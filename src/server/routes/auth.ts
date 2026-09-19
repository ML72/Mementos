
/**
 * Authentication Routes
 * 
 * This module defines the API endpoints for user authentication and authorization.
 * Handles user login and token-based authentication for accessing protected resources.
 * 
 * Endpoints:
 * - GET /api/auth - Get authenticated user's basic information
 * - POST /api/auth - Authenticate user and get JWT token
 * - POST /api/auth/verify-email - Redeem an emailed verification code and get JWT token
 * - POST /api/auth/resend-verification - Email a fresh verification code
 * - POST /api/auth/forgot-password - Email a password reset code
 * - POST /api/auth/reset-password - Redeem a reset code and set a new password
 */

import { Request, Response, Router } from 'express';
import { check, validationResult } from 'express-validator';
import { privateAccess, emailCodeLimiter } from '../middleware';
import { AuthService } from '../service';
import { sendError } from '../util';
import { CONTENT_LIMITS, EMAIL } from '../settings';

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
    check('email', 'Please enter a valid email').trim().isEmail().toLowerCase(),
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
            // `email_unverified` tells the client to show the code-entry page instead of an error.
            if (result.unverified) {
                sendError(res, 403, result.error || 'Email not verified', { email_unverified: true });
                return;
            }
            sendError(res, 400, result.error || 'Authentication failed');
            return;
        }

    res.json({ token: result.token });
    } catch(err: any) { 
        console.error(err.message);
        sendError(res, 500, 'Server Error - Please try again');
    }
});

// @route POST api/auth/verify-email
// @desc redeem an emailed verification code; verifies the account and signs it in
// @access public
router.post('/verify-email', emailCodeLimiter, [
    check('email', 'Please enter a valid email').trim().isEmail().toLowerCase(),
    check('code', `Verification code must be ${EMAIL.VERIFICATION.CODE_LENGTH} digits`)
        .isString()
        .trim()
        .matches(new RegExp(`^\\d{${EMAIL.VERIFICATION.CODE_LENGTH}}$`))
], async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        sendError(res, 400, errors.array().map(e => e.msg));
        return;
    }

    try {
        const { email, code } = req.body;
        const result = await authService.verifyEmail(email, code);

        if (!result.success) {
            sendError(res, 400, result.error || 'Verification failed');
            return;
        }

        res.json({ token: result.token });
    } catch(err: any) {
        console.error(err.message);
        sendError(res, 500, 'Server Error - Please try again');
    }
});

// @route POST api/auth/resend-verification
// @desc email a fresh verification code. Identical response for every outcome (unknown address,
//       already verified, rate-limited, sent), so it cannot be used to probe for accounts.
// @access public
router.post('/resend-verification', emailCodeLimiter, [
    check('email', 'Please enter a valid email').trim().isEmail().toLowerCase()
], async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        sendError(res, 400, errors.array().map(e => e.msg));
        return;
    }

    // Respond before doing the work, so timing does not distinguish the outcomes either.
    res.json({ msg: 'If that account needs verifying, a new code has been sent.' });
    await authService.sendVerificationCode(req.body.email);
});

// Identical for every outcome (unknown address, cooldown, cap reached, sent), so the endpoint
// cannot be used to discover which addresses are registered.
const FORGOT_PASSWORD_RESPONSE = { msg: 'If an account exists for that email, a reset code has been sent.' };

// @route POST api/auth/forgot-password
// @desc email a password reset code
// @access public
router.post('/forgot-password', emailCodeLimiter, [
    check('email', 'Please enter a valid email').trim().isEmail().toLowerCase()
], async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        sendError(res, 400, errors.array().map(e => e.msg));
        return;
    }

    // Respond *before* doing the work. The generic message hides what happened, but not how
    // long it took: a registered address does a lookup, a write and an SMTP round-trip while an
    // unknown one returns at once. Answering first makes the two indistinguishable.
    res.json(FORGOT_PASSWORD_RESPONSE);

    try {
        await authService.requestPasswordReset(req.body.email);
    } catch(err: any) {
        // The service never throws; this is belt and braces. Nothing can be sent at this point.
        console.error(err.message);
    }
});

// @route POST api/auth/reset-password
// @desc redeem a reset code and set a new password; signs every existing session out
// @access public
router.post('/reset-password', emailCodeLimiter, [
    check('email', 'Please enter a valid email').trim().isEmail().toLowerCase(),
    check('code', `Reset code must be ${EMAIL.PASSWORD_RESET.CODE_LENGTH} digits`)
        .isString()
        .trim()
        .matches(new RegExp(`^\\d{${EMAIL.PASSWORD_RESET.CODE_LENGTH}}$`)),
    check('password', `Password must be between ${CONTENT_LIMITS.USER.PASSWORD_MIN_LENGTH} and ${CONTENT_LIMITS.USER.PASSWORD_MAX_LENGTH} characters long`)
        .isString()
        .isLength({ min: CONTENT_LIMITS.USER.PASSWORD_MIN_LENGTH, max: CONTENT_LIMITS.USER.PASSWORD_MAX_LENGTH })
], async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        sendError(res, 400, errors.array().map(e => e.msg));
        return;
    }

    try {
        const { email, code, password } = req.body;
        const result = await authService.resetPassword(email, code, password);

        if (!result.success) {
            sendError(res, 400, result.error || 'Password reset failed');
            return;
        }

        res.json({ msg: 'Password updated. Please sign in with your new password.' });
    } catch(err: any) {
        console.error(err.message);
        sendError(res, 500, 'Server Error - Please try again');
    }
});

export default router;
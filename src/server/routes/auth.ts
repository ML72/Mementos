
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
 * - POST /api/auth/reset-password - Redeem a reset code, set a new password and get JWT token
 * - POST /api/auth/change-password - Change the password of the signed-in user and get JWT token
 */

import { Request, Response, Router } from 'express';
import { check, validationResult } from 'express-validator';
import { privateAccess, emailCodeLimiter } from '../middleware';
import { AuthService } from '../service';
import { newPasswordCheck, sendError } from '../util';
import { EMAIL } from '../settings';

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

// @route POST api/auth/forgot-password
// @desc email a password reset code. Identical response for every outcome (unknown address,
//       rate-limited, sent), so it cannot be used to probe for accounts.
// @access public
router.post('/forgot-password', emailCodeLimiter, [
    check('email', 'Please enter a valid email').trim().isEmail().toLowerCase()
], async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        sendError(res, 400, errors.array().map(e => e.msg));
        return;
    }

    // Respond before doing the work, so timing does not distinguish the outcomes either.
    res.json({ msg: 'If an account uses that address, a reset code has been sent to it.' });
    await authService.sendPasswordResetCode(req.body.email);
});

// @route POST api/auth/reset-password
// @desc redeem an emailed reset code and set a new password, then sign in. Every existing
//       session ends, including that of anyone who registered the address without owning it.
// @access public
router.post('/reset-password', emailCodeLimiter, [
    check('email', 'Please enter a valid email').trim().isEmail().toLowerCase(),
    check('code', `Reset code must be ${EMAIL.PASSWORD_RESET.CODE_LENGTH} digits`)
        .isString()
        .trim()
        .matches(new RegExp(`^\\d{${EMAIL.PASSWORD_RESET.CODE_LENGTH}}$`)),
    newPasswordCheck('password')
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

        res.json({ token: result.token });
    } catch(err: any) {
        console.error(err.message);
        sendError(res, 500, 'Server Error - Please try again');
    }
});

// @route POST api/auth/change-password
// @desc change the signed-in user's password; signs every other session out and answers with
//       a fresh token for this one (the one it was called with stops working too)
// @access private
router.post('/change-password', privateAccess, [
    check('currentPassword', 'Please enter your current password').isString().not().isEmpty(),
    newPasswordCheck('newPassword')
], async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        sendError(res, 400, errors.array().map(e => e.msg));
        return;
    }

    try {
        const { currentPassword, newPassword } = req.body;
        const result = await authService.changePassword(req.user!.id, currentPassword, newPassword);

        if (!result.success) {
            sendError(res, 400, result.error || 'Password change failed');
            return;
        }

        res.json({ token: result.token });
    } catch(err: any) {
        console.error(err.message);
        sendError(res, 500, 'Server Error - Please try again');
    }
});

export default router;
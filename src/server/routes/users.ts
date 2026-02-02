import { Request, Response, Router } from 'express';
import { check, validationResult } from 'express-validator';
import { UserService } from '../service';
import { sendError } from '../util';

const router = Router();
const userService = new UserService();

// @route POST api/users
// @desc register user
// @access public
router.post('/', [
    check('email', 'Please enter a valid email').isEmail(),
    check('password', 'Password must be at least 6 characters long').isLength({ min: 6 })
], async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        sendError(res, 400, errors.array().map(e => e.msg));
        return;
    }

    try {
        const { email, password } = req.body;
        const result = await userService.createUser({
            email,
            password
        });

        if (!result.success) {
            sendError(res, 400, result.error || 'Registration failed');
            return;
        }

        res.json({ token: result.token });
    } catch(err: any) { 
        console.error(err.message);
        sendError(res, 500, 'Server Error - Please try again');
    }
});

export default router;

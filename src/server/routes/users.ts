import { Request, Response, Router } from 'express';
import { check, validationResult } from 'express-validator';
import { privateAccess } from '../middleware';
import { UserService } from '../service';
import { sendError } from '../util';

const router = Router();
const userService = new UserService();

// @route POST api/users
// @desc register user
// @access public
router.post('/', [
    check('fullName', 'Please enter your full name').not().isEmpty(),
    check('email', 'Please enter a valid email').isEmail(),
    check('password', 'Password must be at least 6 characters long').isLength({ min: 6 })
], async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        sendError(res, 400, errors.array().map(e => e.msg));
        return;
    }

    try {
        const { email, password, fullName } = req.body;
        const result = await userService.createUser({
            email,
            password,
            fullName
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

// @route POST api/users/:id/follow
// @desc follow a user
// @access private
router.post('/:id/follow', privateAccess, async (req: Request, res: Response) => {
    try {
        const result = await userService.followUser(req.user!.id, req.params.id);
        
        if (!result.success) {
            sendError(res, 400, result.error || 'Failed to follow user');
            return;
        }

        res.json({ msg: 'Successfully followed user' });
    } catch(err: any) {
        console.error(err.message);
        sendError(res, 500, 'Server Error - Please try again');
    }
});

// @route POST api/users/:id/unfollow
// @desc unfollow a user
// @access private
router.post('/:id/unfollow', privateAccess, async (req: Request, res: Response) => {
    try {
        const result = await userService.unfollowUser(req.user!.id, req.params.id);
        
        if (!result.success) {
            sendError(res, 400, result.error || 'Failed to unfollow user');
            return;
        }

        res.json({ msg: 'Successfully unfollowed user' });
    } catch(err: any) {
        console.error(err.message);
        sendError(res, 500, 'Server Error - Please try again');
    }
});

// @route GET api/users/:id/profile
// @desc get a user's profile
// @access private
router.get('/:id/profile', privateAccess, async (req: Request, res: Response) => {
    try {
        const result = await userService.getUserProfile(req.params.id);
        
        if (!result.success) {
            sendError(res, 404, result.error || 'User not found');
            return;
        }

        res.json(result.profile);
    } catch(err: any) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            sendError(res, 404, 'User not found');
            return;
        }
        sendError(res, 500, 'Server Error - Please try again');
    }
});

// @route PUT api/users/profile
// @desc update current user's profile
// @access private
router.put('/profile', privateAccess, [
    check('fullName', 'Name cannot be empty').optional().not().isEmpty(),
    check('bio', 'Bio cannot exceed length').optional().isLength({ max: 500 })
], async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        sendError(res, 400, errors.array().map(e => e.msg));
        return;
    }

    try {
        const { fullName, bio } = req.body;
        const result = await userService.updateProfile(req.user!.id, { fullName, bio });
        
        if (!result.success) {
            sendError(res, 400, result.error || 'Update failed');
            return;
        }

        res.json(result.profile);
    } catch (err: any) {
        console.error(err.message);
        sendError(res, 500, 'Server Error - Please try again');
    }
});

export default router;

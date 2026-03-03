import bcrypt from 'bcryptjs';
import { sign } from 'jsonwebtoken';
import { User } from '../../models';
import { JWT_SECRET } from '../../settings';

export interface CreateUserData {
    email: string;
    password: string;
}

export interface CreateUserResult {
    success: boolean;
    token?: string;
    error?: string;
}

export interface ToggleFollowResult {
    success: boolean;
    error?: string;
}

class UserService {
    async createUser(userData: CreateUserData): Promise<CreateUserResult> {
        try {
            const { email, password } = userData;
            
            let user = await User.findOne({ 'login.email': email });
            if (user) {
                return { success: false, error: 'User already exists' };
            }

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            user = new User({
                login: {
                    email,
                    password: hashedPassword,
                    verified: false
                },
                roles: ['USER']
            });

            await user.save();

            const payload = { user: { id: user.id } };
            const token = sign(payload, JWT_SECRET, { expiresIn: 259200 });

            return { success: true, token };
        } catch (error: any) {
            console.error('Registration error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    async followUser(currentUserId: string, targetUserId: string): Promise<ToggleFollowResult> {
        try {
            if (currentUserId === targetUserId) {
                return { success: false, error: 'Cannot follow yourself' };
            }

            const currentUser = await User.findById(currentUserId);
            const targetUser = await User.findById(targetUserId);

            if (!currentUser || !targetUser) {
                return { success: false, error: 'User not found' };
            }

            if (!currentUser.following.includes(targetUser._id)) {
                currentUser.following.push(targetUser._id);
                await currentUser.save();
            }

            return { success: true };
        } catch (error: any) {
            console.error('Follow user error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    async unfollowUser(currentUserId: string, targetUserId: string): Promise<ToggleFollowResult> {
        try {
            if (currentUserId === targetUserId) {
                return { success: false, error: 'Cannot unfollow yourself' };
            }

            const currentUser = await User.findById(currentUserId);
            
            if (!currentUser) {
                return { success: false, error: 'User not found' };
            }

            currentUser.following = currentUser.following.filter(id => id.toString() !== targetUserId);
            await currentUser.save();

            return { success: true };
        } catch (error: any) {
            console.error('Unfollow user error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }
}
export default UserService;

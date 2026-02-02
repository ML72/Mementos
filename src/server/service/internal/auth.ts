import bcrypt from 'bcryptjs';
import { sign } from 'jsonwebtoken';
import { User } from '../../models';
import { JWT_SECRET } from '../../settings';

export interface AuthenticateUserResult {
    success: boolean;
    token?: string;
    error?: string;
}

export interface GetUserResult {
    success: boolean;
    user?: any;
    error?: string;
}

class AuthService {
    async authenticateUser(email: string, password: string): Promise<AuthenticateUserResult> {
        try {
            const user = await User.findOne({ 'login.email': email });
            if (!user) {
                return { success: false, error: 'Invalid credentials' };
            }

            const isMatch = await bcrypt.compare(password, (user as any).login.password);
            if (!isMatch) {
                return { success: false, error: 'Invalid credentials' };
            }

            const payload = { user: { id: user.id } };
            const token = sign(payload, JWT_SECRET, { expiresIn: 259200 }); // 3 days

            return { success: true, token };
        } catch (error: any) {
            console.error('Authentication error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    async getUserById(userId: string): Promise<GetUserResult> {
        try {
            const user = await User.findById(userId).select('-login.password').lean();
            if (!user) {
                return { success: false, error: 'User not found' };
            }
            return { success: true, user };
        } catch (error: any) {
            console.error('Get user error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }
}
export default AuthService;

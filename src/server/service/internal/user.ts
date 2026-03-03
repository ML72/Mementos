import bcrypt from 'bcryptjs';
import { sign } from 'jsonwebtoken';
import { User } from '../../models';
import { JWT_SECRET } from '../../settings';

export interface CreateUserData {
    email: string;
    password: string;
    fullName: string;
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
            const { email, password, fullName } = userData;

            let user = await User.findOne({ 'login.email': email });
            if (user) {
                return { success: false, error: 'User already exists' };
            }

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            user = new User({
                fullName,
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

            // Using bulkWrite to update both atomically
            await User.bulkWrite([
                {
                    updateOne: {
                        filter: { _id: currentUser._id },
                        update: { $addToSet: { following: targetUser._id } }
                    }
                },
                {
                    updateOne: {
                        filter: { _id: targetUser._id },
                        update: { $addToSet: { followers: currentUser._id } }
                    }
                }
            ]);

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
            const targetUser = await User.findById(targetUserId);
            
            if (!currentUser || !targetUser) {
                return { success: false, error: 'User not found' };
            }

            // Using bulkWrite to update both atomically
            await User.bulkWrite([
                {
                    updateOne: {
                        filter: { _id: currentUser._id },
                        update: { $pull: { following: targetUser._id } }
                    }
                },
                {
                    updateOne: {
                        filter: { _id: targetUser._id },
                        update: { $pull: { followers: currentUser._id } }
                    }
                }
            ]);

            return { success: true };
        } catch (error: any) {
            console.error('Unfollow user error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    async getUserProfile(userId: string): Promise<{ success: boolean, profile?: any, error?: string }> {
        try {
            const user = await User.findById(userId).select('-login.password');
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            return { 
                success: true, 
                profile: {
                    id: user._id,
                    fullName: user.fullName,
                    bio: user.bio,
                    followingCount: user.following.length,
                    followerCount: user.followers.length,
                    following: user.following,
                    followers: user.followers,
                    dateCreated: user.dateCreated
                }
            };
        } catch (error: any) {
            console.error('Get profile error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    async updateProfile(userId: string, data: { fullName?: string; bio?: string }): Promise<{ success: boolean, profile?: any, error?: string }> {
        try {
            const updateFields: any = {};
            if (data.fullName !== undefined) updateFields.fullName = data.fullName;
            if (data.bio !== undefined) updateFields.bio = data.bio;

            const user = await User.findByIdAndUpdate(userId, { $set: updateFields }, { new: true }).select('-login.password');
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            return { 
                success: true, 
                profile: {
                    id: user._id,
                    fullName: user.fullName,
                    bio: user.bio,
                    followingCount: user.following.length,
                    followerCount: user.followers.length,
                    following: user.following,
                    followers: user.followers,
                    dateCreated: user.dateCreated
                }
            };
        } catch (error: any) {
            console.error('Update profile error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }
}
export default UserService;

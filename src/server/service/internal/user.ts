import bcrypt from 'bcryptjs';
import { User, newUnsubscribeToken } from '../../models';
import { EMAIL } from '../../settings';
import AuthService, { signToken } from './auth';

export interface CreateUserData {
    email: string;
    password: string;
    fullName: string;
}

export interface CreateUserResult {
    success: boolean;
    /** Present only when verification is not required; otherwise the token comes from verifying. */
    token?: string;
    verificationRequired?: boolean;
    error?: string;
}

export interface ToggleFollowResult {
    success: boolean;
    error?: string;
}

/** The user-facing subset of `settings`. An explicit whitelist: the unsubscribe token is never in it. */
export interface UserSettings {
    weeklyDigest: boolean;
}

export interface SettingsResult {
    success: boolean;
    settings?: UserSettings;
    error?: string;
}

export interface UnsubscribeResult {
    success: boolean;
    /** Whether the token matched an account. Internal; the HTTP response is the same either way. */
    matched?: boolean;
    error?: string;
}

const toUserSettings = (user: any): UserSettings => ({
    weeklyDigest: user?.settings?.email?.weeklyDigest !== false
});

class UserService {
    private readonly authService = new AuthService();

    async createUser(userData: CreateUserData): Promise<CreateUserResult> {
        try {
            const { email, password, fullName } = userData;

            let user = await User.findOne({ 'login.email': email.trim().toLowerCase() });
            if (user) {
                return { success: false, error: 'User already exists' };
            }

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            user = new User({
                profile: { fullName },
                login: {
                    email,
                    password: hashedPassword,
                    verified: false
                },
                roles: ['USER']
            });

            await user.save();

            if (EMAIL.VERIFICATION.REQUIRED) {
                // No session until the address is proven. A failed send is not fatal: signing in
                // with the right password sends another code.
                await this.authService.sendVerificationCode(email);
                return { success: true, verificationRequired: true };
            }

            return { success: true, token: signToken(user.id) };
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
                    fullName: user.profile?.fullName,
                    bio: user.profile?.bio,
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
            if (data.fullName !== undefined) updateFields['profile.fullName'] = data.fullName;
            if (data.bio !== undefined) updateFields['profile.bio'] = data.bio;

            const user = await User.findByIdAndUpdate(userId, { $set: updateFields }, { new: true }).select('-login.password');
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            return { 
                success: true, 
                profile: {
                    id: user._id,
                    fullName: user.profile?.fullName,
                    bio: user.profile?.bio,
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

    async searchUsers(query: string, page: number, pageSize: number): Promise<{ success: boolean, results?: any[], error?: string }> {
        try {
            const isObjectId = /^[0-9a-fA-F]{24}$/.test(query);
            const results: any[] = [];
            let exactMatchFound = false;
            let exactUser: any = null;

            if (isObjectId) {
                exactUser = await User.findById(query).lean();
                if (exactUser) {
                    exactMatchFound = true;
                }
            }

            let skip = page * pageSize;
            let limit = pageSize;

            // Handle pagination correctly when returning exact match and text matches
            if (exactMatchFound) {
                if (page === 0) {
                    results.push({
                        id: exactUser._id.toString(),
                        fullName: exactUser.profile.fullName,
                        bio: exactUser.profile.bio
                    });
                    limit = pageSize - 1; // Need one less result from text search
                    skip = 0;
                } else {
                    skip = skip - 1; // Since exact match took 1 slot on page 0
                }
            }

            if (limit > 0) {
                // Use MongoDB built-in text search.
                // It will automatically use the text index, perform case-insensitive token matching,
                // and we can sort by text score (which respects our index weights: fullName = 5, bio = 1).
                const textMatchQuery: any = { $text: { $search: query } };
                if (exactMatchFound) {
                    textMatchQuery._id = { $ne: exactUser._id };
                }

                const textMatchResult = await User.find(
                    textMatchQuery,
                    { score: { $meta: 'textScore' } }
                )
                .sort({ score: { $meta: 'textScore' } }) 
                .skip(skip)
                .limit(limit)
                .lean();

                for (const u of textMatchResult) {                     
                    results.push({
                        id: u._id.toString(),
                        fullName: u.profile?.fullName,
                        bio: u.profile?.bio
                    });
                }
            }

            return { success: true, results };
        } catch (error: any) {
            console.error('Search users error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    async getSettings(userId: string): Promise<SettingsResult> {
        try {
            const user = await User.findById(userId).select('settings.email.weeklyDigest').lean();
            if (!user) {
                return { success: false, error: 'User not found' };
            }
            return { success: true, settings: toUserSettings(user) };
        } catch (error: any) {
            console.error('Get settings error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    async updateSettings(userId: string, data: Partial<UserSettings>): Promise<SettingsResult> {
        try {
            // Opting in is the only way an account that predates the email fields can become a
            // digest recipient, and every digest needs a working unsubscribe link. The filter
            // makes this a no-op for everyone else.
            await User.updateOne(
                { _id: userId, 'settings.email.unsubscribeToken': { $not: { $type: 'string' } } },
                { $set: { 'settings.email.unsubscribeToken': newUnsubscribeToken() } }
            );

            const updateFields: any = {};
            if (data.weeklyDigest !== undefined) updateFields['settings.email.weeklyDigest'] = data.weeklyDigest === true;

            const user = await User.findByIdAndUpdate(userId, { $set: updateFields }, { returnDocument: 'after' })
                .select('settings.email.weeklyDigest')
                .lean();
            if (!user) {
                return { success: false, error: 'User not found' };
            }
            return { success: true, settings: toUserSettings(user) };
        } catch (error: any) {
            console.error('Update settings error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    /**
     * One-click unsubscribe. Withdraws consent only — `deliveryStatus` is about the mail system,
     * not the user, and is left alone. Succeeds whether or not the token matched, so the
     * endpoint is not a token oracle.
     */
    async unsubscribeByToken(token: string): Promise<UnsubscribeResult> {
        try {
            if (typeof token !== 'string' || token.length === 0) {
                return { success: true, matched: false };
            }
            const res = await User.updateOne(
                { 'settings.email.unsubscribeToken': token },
                { $set: { 'settings.email.weeklyDigest': false } }
            );
            return { success: true, matched: res.matchedCount > 0 };
        } catch (error: any) {
            console.error('Unsubscribe error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    async getUserFollowing(userId: string): Promise<{ success: boolean, results?: any[], error?: string }> {
        try {
            const user = await User.findById(userId).populate({
                path: 'following',
                select: '_id profile.fullName profile.bio'
            }).lean();
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            const results = (user.following || []).map((u: any) => ({
                id: u._id.toString(),
                fullName: u.profile?.fullName,
                bio: u.profile?.bio
            }));

            return { success: true, results };
        } catch (error: any) {
            console.error('Get following error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    async getUserFollowers(userId: string): Promise<{ success: boolean, results?: any[], error?: string }> {
        try {
            const user = await User.findById(userId).populate({
                path: 'followers',
                select: '_id profile.fullName profile.bio'
            }).lean();
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            const results = (user.followers || []).map((u: any) => ({
                id: u._id.toString(),
                fullName: u.profile?.fullName,
                bio: u.profile?.bio
            }));

            return { success: true, results };
        } catch (error: any) {
            console.error('Get followers error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }
}

export default UserService;

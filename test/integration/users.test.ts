import request from 'supertest';
import mongoose from 'mongoose';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import app from '../../src/server/index';
// @ts-ignore
import { User } from '../../src/server/models';

const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/mementos_test_users';

describe('Users Endpoints Integration', () => {
    
    beforeAll(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        await mongoose.connect(TEST_MONGO_URI);
    });

    afterAll(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.dropDatabase();
            await mongoose.connection.close();
        }
    });

    beforeEach(async () => {
        await User.deleteMany({});
    });

    const createUserAndGetToken = async (email: string, password: string = 'password123') => {
        const res = await request(app)
            .post('/api/users')
            .send({ email, password, fullName: 'Test User' });
        return { token: res.body.token, email };
    };

    const getUserIdFromEmail = async (email: string) => {
        const user = await User.findOne({ 'login.email': email });
        return user?._id.toString();
    };

    describe('POST /api/users/:id/follow & /unfollow', () => {
        it('should allow user to follow and unfollow another user', async () => {
            const { token: user1Token } = await createUserAndGetToken('user1@test.com');
            const { token: user2Token } = await createUserAndGetToken('user2@test.com');

            const user2Id = await getUserIdFromEmail('user2@test.com');

            // Follow user2
            const followRes = await request(app)
                .post(`/api/users/${user2Id}/follow`)
                .set('x-auth-token', user1Token)
                .send();
            
            expect(followRes.statusCode).toEqual(200);
            expect(followRes.body.msg).toBe('Successfully followed user');

            // Verify in DB
            const user1 = await User.findOne({ 'login.email': 'user1@test.com' });
            const user2 = await User.findOne({ 'login.email': 'user2@test.com' });
            expect(user1?.following.map(id => id.toString())).toContain(user2Id);
            expect(user2?.followers.map(id => id.toString())).toContain(user1?._id.toString());

            // Unfollow user2
            const unfollowRes = await request(app)
                .post(`/api/users/${user2Id}/unfollow`)
                .set('x-auth-token', user1Token)
                .send();

            expect(unfollowRes.statusCode).toEqual(200);
            expect(unfollowRes.body.msg).toBe('Successfully unfollowed user');

            // Verify in DB
            const updatedUser1 = await User.findOne({ 'login.email': 'user1@test.com' });
            const updatedUser2 = await User.findOne({ 'login.email': 'user2@test.com' });
            expect(updatedUser1?.following.map(id => id.toString())).not.toContain(user2Id);
            expect(updatedUser2?.followers.map(id => id.toString())).not.toContain(updatedUser1?._id.toString());
        });

        it('should fail if user tries to follow themselves', async () => {
            const { token: user1Token } = await createUserAndGetToken('user1@test.com');
            const user1Id = await getUserIdFromEmail('user1@test.com');

            const followRes = await request(app)
                .post(`/api/users/${user1Id}/follow`)
                .set('x-auth-token', user1Token)
                .send();
            
            expect(followRes.statusCode).toEqual(400);
            expect(followRes.body.errors[0].msg).toEqual('Cannot follow yourself');
        });
    });

    describe('GET /api/users/:id/profile', () => {
        it('should get a user profile with bio, followers, following counts', async () => {
            const { token: user1Token } = await createUserAndGetToken('user1@test.com');
            const { token: user2Token } = await createUserAndGetToken('user2@test.com');
            const user2Id = await getUserIdFromEmail('user2@test.com');

            await User.updateOne({ _id: user2Id }, { bio: 'Hello World!' });

            await request(app)
                .post(`/api/users/${user2Id}/follow`)
                .set('x-auth-token', user1Token)
                .send();

            const profileRes = await request(app)
                .get(`/api/users/${user2Id}/profile`)
                .set('x-auth-token', user1Token)
                .send();

            expect(profileRes.statusCode).toEqual(200);
            expect(profileRes.body.fullName).toBe('Test User');
            expect(profileRes.body.bio).toBe('Hello World!');
            expect(profileRes.body.followerCount).toBe(1);
            expect(profileRes.body.followingCount).toBe(0);
        });
    });

    describe('PUT /api/users/profile', () => {
        it('should update current user profile (name and bio)', async () => {
            const { token: user1Token } = await createUserAndGetToken('update@test.com');
            const user1Id = await getUserIdFromEmail('update@test.com');

            const res = await request(app)
                .put('/api/users/profile')
                .set('x-auth-token', user1Token)
                .send({ fullName: 'Updated Name', bio: 'New Bio' });

            expect(res.statusCode).toEqual(200);
            expect(res.body.fullName).toBe('Updated Name');
            expect(res.body.bio).toBe('New Bio');

            const profileRes = await request(app)
                .get(`/api/users/${user1Id}/profile`)
                .set('x-auth-token', user1Token)
                .send();

            expect(profileRes.statusCode).toEqual(200);
            expect(profileRes.body.fullName).toBe('Updated Name');
            expect(profileRes.body.bio).toBe('New Bio');
        });
    });
});

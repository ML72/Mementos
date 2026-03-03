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
            .send({ email, password });
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
            expect(user1?.following.map(id => id.toString())).toContain(user2Id);

            // Unfollow user2
            const unfollowRes = await request(app)
                .post(`/api/users/${user2Id}/unfollow`)
                .set('x-auth-token', user1Token)
                .send();

            expect(unfollowRes.statusCode).toEqual(200);
            expect(unfollowRes.body.msg).toBe('Successfully unfollowed user');

            // Verify in DB
            const updatedUser1 = await User.findOne({ 'login.email': 'user1@test.com' });
            expect(updatedUser1?.following.map(id => id.toString())).not.toContain(user2Id);
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
});

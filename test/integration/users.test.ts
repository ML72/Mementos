import request from 'supertest';
import mongoose from 'mongoose';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import app from '../../src/server/index';
import { registerVerified } from '../helpers/auth';
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
        return { token: await registerVerified(email, password), email };
    };

    const getUserIdFromEmail = async (email: string) => {
        const user = await User.findOne({ 'login.email': email });
        return user?._id.toString();
    };

    describe('POST /api/users/:id/follow & /unfollow', () => {
        it('should allow user to follow and unfollow another user', async () => {
            const { token: user1Token } = await createUserAndGetToken('user1@test.com');
            await createUserAndGetToken('user2@test.com');

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
            await createUserAndGetToken('user2@test.com');
            const user2Id = await getUserIdFromEmail('user2@test.com');

            await User.updateOne({ _id: user2Id }, { 'profile.bio': 'Hello World!' });

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

    describe('GET /api/users/:id/followers and /following', () => {
        it('should return the correct list of followers and following', async () => {
            const { token: user1Token } = await createUserAndGetToken('user1@test.com');
            const { token: user2Token } = await createUserAndGetToken('user2@test.com');
            const { token: user3Token } = await createUserAndGetToken('user3@test.com');
            
            const user1Id = await getUserIdFromEmail('user1@test.com');
            const user2Id = await getUserIdFromEmail('user2@test.com');
            const user3Id = await getUserIdFromEmail('user3@test.com');

            // Set up followers: User1 follows User2, User3 follows User2
            await request(app).post(`/api/users/${user2Id}/follow`).set('x-auth-token', user1Token);
            await request(app).post(`/api/users/${user2Id}/follow`).set('x-auth-token', user3Token);

            // User1 follows User3
            await request(app).post(`/api/users/${user3Id}/follow`).set('x-auth-token', user1Token);

            // Check User2's followers (should be User1 and User3)
            const followersRes = await request(app).get(`/api/users/${user2Id}/followers`).set('x-auth-token', user2Token);
            expect(followersRes.statusCode).toBe(200);
            expect(followersRes.body.length).toBe(2);
            const followerIds = followersRes.body.map((u: any) => u.id);
            expect(followerIds).toContain(user1Id);
            expect(followerIds).toContain(user3Id);

            // Check User1's following (should be User2 and User3)
            const followingRes = await request(app).get(`/api/users/${user1Id}/following`).set('x-auth-token', user1Token);
            expect(followingRes.statusCode).toBe(200);
            expect(followingRes.body.length).toBe(2);
            const followingIds = followingRes.body.map((u: any) => u.id);
            expect(followingIds).toContain(user2Id);
            expect(followingIds).toContain(user3Id);
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

        it('should say what is too long, and save nothing', async () => {
            const { token } = await createUserAndGetToken('limits@test.com');
            const update = (data: object) => request(app).put('/api/users/profile').set('x-auth-token', token).send(data);

            const longName = await update({ fullName: 'n'.repeat(101) });
            expect(longName.statusCode).toEqual(400);
            expect(longName.body.errors[0].msg).toBe('Name must be at most 100 characters');

            const longBio = await update({ bio: 'b'.repeat(501) });
            expect(longBio.statusCode).toEqual(400);
            expect(longBio.body.errors[0].msg).toBe('Bio must be at most 500 characters');

            const user = await User.findOne({ 'login.email': 'limits@test.com' }).lean() as any;
            expect(user.profile.fullName).toBe('Test User');
            expect(user.profile.bio).toBe('');
            expect((await update({ fullName: 'n'.repeat(100), bio: 'b'.repeat(500) })).statusCode).toEqual(200);
        });
    });

    describe('POST /api/users (Registration)', () => {
        it('should say when the name is too long, instead of failing with a server error', async () => {
            const res = await request(app).post('/api/users')
                .send({ email: 'longname@test.com', password: 'password123', fullName: 'n'.repeat(101) });
            expect(res.statusCode).toEqual(400);
            expect(res.body.errors[0].msg).toBe('Name must be at most 100 characters');
            expect(await User.countDocuments()).toBe(0);
        });

        it('should require a password of 8 to 128 characters, as a reset or change does', async () => {
            const signUp = (password: unknown) => request(app).post('/api/users')
                .send({ email: 'newpassword@test.com', password, fullName: 'Test User' });

            for (const password of ['x'.repeat(7), 'x'.repeat(129), 12345678]) {
                const res = await signUp(password);
                expect(res.statusCode).toEqual(400);
                expect(res.body.errors.map((e: any) => e.msg)).toEqual(['Password must be 8 to 128 characters long']);
            }
            expect(await User.countDocuments()).toBe(0);

            expect((await signUp('x'.repeat(8))).statusCode).toEqual(200);
            expect(await User.countDocuments()).toBe(1);
        });
    });

    describe('GET /api/users/search', () => {
        let token: string;
        
        beforeEach(async () => {
            const res = await createUserAndGetToken('searcher@test.com');
            token = res.token;
            
            // Create some users to search for
            const usersData = [
                { 'login.email': 'test1@test.com', 'login.password': 'password123', profile: { fullName: 'Alice Johnson', bio: 'I love machine learning' } },
                { 'login.email': 'test2@test.com', 'login.password': 'password123', profile: { fullName: 'Alice Smith', bio: 'Database admin' } },
                { 'login.email': 'test3@test.com', 'login.password': 'password123', profile: { fullName: 'Bob Brown', bio: 'Alice is my friend' } },
                { 'login.email': 'test4@test.com', 'login.password': 'password123', profile: { fullName: 'Charlie Davis', bio: 'Nothing much here' } }
            ];
            await User.insertMany(usersData.map((u: any) => new User(u)));
        });

        it('should require query string of at least 5 chars', async () => {
            const res1 = await request(app).get('/api/users/search?query=alic').set('x-auth-token', token);
            expect(res1.statusCode).toBe(400);

            const res2 = await request(app).get('/api/users/search?query=  ali  ').set('x-auth-token', token);
            expect(res2.statusCode).toBe(400);
        });

        it('should match full name partial case insensitive', async () => {
            const res = await request(app).get('/api/users/search?query=alicE ').set('x-auth-token', token);
            expect(res.statusCode).toBe(200);
            expect(res.body.length).toBe(3); // Alice Johnson, Alice Smith, Bob Brown (bio has Alice)

            // Alice Johnson & Alice Smith should be before Bob Brown because full name matches have higher priority
            expect(res.body[0].fullName).toMatch(/Alice/i);
            expect(res.body[1].fullName).toMatch(/Alice/i);
            expect(res.body[2].fullName).toBe('Bob Brown');
        });

        it('should match bio partial case insensitive', async () => {
            const res = await request(app).get('/api/users/search?query=machine').set('x-auth-token', token);
            expect(res.statusCode).toBe(200);
            expect(res.body.length).toBe(1);
            expect(res.body[0].fullName).toBe('Alice Johnson');
        });

        it('should match by exact user ID as top priority', async () => {
            const bob = await User.findOne({ 'profile.fullName': 'Bob Brown' });
            const bobId = bob!._id.toString();

            const res = await request(app).get(`/api/users/search?query=${bobId}`).set('x-auth-token', token);
            expect(res.statusCode).toBe(200);
            expect(res.body.length).toBe(1);
            expect(res.body[0].id).toBe(bobId);
            expect(res.body[0].fullName).toBe('Bob Brown');
        });

        it('should handle pagination', async () => {
            // Need >1 results
            const resPage0 = await request(app).get('/api/users/search?query=alice&pageSize=2&page=0').set('x-auth-token', token);
            expect(resPage0.statusCode).toBe(200);
            expect(resPage0.body.length).toBe(2);

            const resPage1 = await request(app).get('/api/users/search?query=alice&pageSize=2&page=1').set('x-auth-token', token);
            expect(resPage1.statusCode).toBe(200);
            expect(resPage1.body.length).toBe(1);
        });
    });
});

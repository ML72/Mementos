import request from 'supertest';
import mongoose from 'mongoose';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import app from '../../src/server/index';
// @ts-ignore
import { User, Note } from '../../src/server/models';

const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/mementos_test_notes';

describe('Notes Endpoints Integration', () => {
    
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
        await Note.deleteMany({});
    });

    const createUserAndGetToken = async (email: string, password: string = 'password123', fullName: string = 'Test User') => {
        const res = await request(app)
            .post('/api/users')
            .send({ email, password, fullName });
        return { token: res.body.token, email };
    };

    const getUserIdFromEmail = async (email: string) => {
        const user = await User.findOne({ 'login.email': email });
        return user?._id.toString();
    };

    describe('Notes CRUD', () => {
        it('should create, read, update and delete a note', async () => {
            const { token } = await createUserAndGetToken('creator@test.com');
            const userId = await getUserIdFromEmail('creator@test.com');

            // 1. Create
            const createRes = await request(app)
                .post('/api/notes')
                .set('x-auth-token', token)
                .send({
                    subject: 'My Note',
                    content: 'Note contents here',
                    tags: ['tag1']
                });
            
            expect(createRes.statusCode).toEqual(200);
            expect(createRes.body.subject).toBe('My Note');
            expect(createRes.body.content).toBe('Note contents here');
            const noteId = createRes.body._id;

            // 2. Read Single Note
            const readRes = await request(app)
                .get(`/api/notes/${noteId}`)
                .set('x-auth-token', token)
                .send();

            expect(readRes.statusCode).toEqual(200);
            expect(readRes.body._id).toBe(noteId);

            // 3. Update
            const updateRes = await request(app)
                .put(`/api/notes/${noteId}`)
                .set('x-auth-token', token)
                .send({
                    subject: 'Updated Note',
                    content: 'Updated contents',
                    tags: ['tag1', 'tag2']
                });

            expect(updateRes.statusCode).toEqual(200);
            expect(updateRes.body.subject).toBe('Updated Note');
            expect(updateRes.body.tags.length).toBe(2);

            // 4. Delete
            const deleteRes = await request(app)
                .delete(`/api/notes/${noteId}`)
                .set('x-auth-token', token)
                .send();

            expect(deleteRes.statusCode).toEqual(200);
            expect(deleteRes.body.msg).toBe('Note removed');

            // Ensure deleted
            const getDeletedRes = await request(app)
                .get(`/api/notes/${noteId}`)
                .set('x-auth-token', token)
                .send();
            expect(getDeletedRes.statusCode).toEqual(404);
        });

        it('should prevent user from updating or deleting someone else note', async () => {
            const { token: user1Token } = await createUserAndGetToken('user1@test.com');
            const { token: user2Token } = await createUserAndGetToken('user2@test.com');

            // Create note by user1
            const createRes = await request(app)
                .post('/api/notes')
                .set('x-auth-token', user1Token)
                .send({
                    subject: 'User 1 Note',
                    content: 'Content'
                });
            const noteId = createRes.body._id;

            // Update user1's note using user2's token (should fail)
            const updateRes = await request(app)
                .put(`/api/notes/${noteId}`)
                .set('x-auth-token', user2Token)
                .send({
                    subject: 'Hacked Subject'
                });
            expect(updateRes.statusCode).toEqual(400);
            expect(updateRes.body.errors[0].msg).toEqual('User not authorized to update this note');

            // Delete user1's note using user2's token (should fail)
            const deleteRes = await request(app)
                .delete(`/api/notes/${noteId}`)
                .set('x-auth-token', user2Token)
                .send();
            expect(deleteRes.statusCode).toEqual(400);
            expect(deleteRes.body.errors[0].msg).toEqual('User not authorized to delete this note');
        });
    });

    describe('GET /api/notes (Feed)', () => {
        it('should return own notes and followed users notes', async () => {
            const { token: token1 } = await createUserAndGetToken('user1@test.com');
            const { token: token2 } = await createUserAndGetToken('user2@test.com');
            const { token: token3 } = await createUserAndGetToken('user3@test.com');

            const id2 = await getUserIdFromEmail('user2@test.com');

            // Create a note for each user
            await request(app).post('/api/notes').set('x-auth-token', token1).send({ subject: 'u1', content: 'c' });
            await request(app).post('/api/notes').set('x-auth-token', token2).send({ subject: 'u2', content: 'c' });
            await request(app).post('/api/notes').set('x-auth-token', token3).send({ subject: 'u3', content: 'c' });

            // Initially user1 should only see u1
            const feedRes1 = await request(app).get('/api/notes').set('x-auth-token', token1).send();
            expect(feedRes1.body.length).toBe(1);
            expect(feedRes1.body[0].subject).toBe('u1');

            // User1 follows User2
            await request(app).post(`/api/users/${id2}/follow`).set('x-auth-token', token1).send();

            // Now user1 should see u1 and u2 (but not u3)
            const feedRes2 = await request(app).get('/api/notes').set('x-auth-token', token1).send();
            expect(feedRes2.body.length).toBe(2);
            
            const subjects = feedRes2.body.map((n: any) => n.subject);
            expect(subjects).toContain('u1');
            expect(subjects).toContain('u2');
            expect(subjects).not.toContain('u3');
        });
    });
});

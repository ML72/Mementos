import request from 'supertest';
import mongoose from 'mongoose';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import app from '../../src/server/index';
import { registerVerified } from '../helpers/auth';
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
        return { token: await registerVerified(email, password, fullName), email };
    };

    const getUserIdFromEmail = async (email: string) => {
        const user = await User.findOne({ 'login.email': email });
        return user?._id.toString();
    };

    describe('Notes CRUD', () => {
        it('should create, read, update and delete a note', async () => {
            const { token } = await createUserAndGetToken('creator@test.com');

            // 1. Create
            const createRes = await request(app)
                .post('/api/notes')
                .set('x-auth-token', token)
                .send({
                    subject: 'My Note',
                    content: 'Note contents here',
                    tags: ['tag1'],
                    importance: 8
                });
            
            expect(createRes.statusCode).toEqual(200);
            expect(createRes.body.subject).toBe('My Note');
            expect(createRes.body.content).toBe('Note contents here');
            expect(createRes.body.importance).toBe(8);
            expect(createRes.body.lastUpdated).toBeDefined();
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
                    tags: ['tag1', 'tag2'],
                    importance: 9
                });

            expect(updateRes.statusCode).toEqual(200);
            expect(updateRes.body.subject).toBe('Updated Note');
            expect(updateRes.body.tags.length).toBe(2);
            expect(updateRes.body.importance).toBe(9);
            expect(new Date(updateRes.body.lastUpdated).getTime()).toBeGreaterThanOrEqual(new Date(createRes.body.lastUpdated).getTime());

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

        it('should get all notes belonging to the current user', async () => {
            const { token } = await createUserAndGetToken('owner@test.com');
            const { token: otherToken } = await createUserAndGetToken('other@test.com');

            // Create two notes for owner
            await request(app)
                .post('/api/notes')
                .set('x-auth-token', token)
                .send({ subject: 'Note 1', content: 'Content 1' });
            
            await request(app)
                .post('/api/notes')
                .set('x-auth-token', token)
                .send({ subject: 'Note 2', content: 'Content 2' });

            // Create one note for other
            await request(app)
                .post('/api/notes')
                .set('x-auth-token', otherToken)
                .send({ subject: 'Other Note', content: 'Other Content' });

            // Fetch owner's notes
            const res = await request(app)
                .get('/api/notes/my')
                .set('x-auth-token', token)
                .send();

            expect(res.statusCode).toEqual(200);
            expect(res.body.length).toBe(2);
            expect(res.body[0].subject).toBe('Note 2'); // sorted by dateCreated desc
            expect(res.body[1].subject).toBe('Note 1');
        });
    });

    describe('Note validation', () => {
        const create = (token: string, note: object) =>
            request(app).post('/api/notes').set('x-auth-token', token).send({ subject: 'S', content: 'C', ...note });
        const messages = (res: any): string[] => res.body.errors.map((e: any) => e.msg);

        it('accepts tags of up to 30 characters', async () => {
            const { token } = await createUserAndGetToken('tags@test.com');
            const res = await create(token, { tags: ['t'.repeat(30), 'short'] });
            expect(res.statusCode).toEqual(200);
            expect(res.body.tags).toEqual(['t'.repeat(30), 'short']);
        });

        it('says what is wrong with a note, instead of failing with a server error', async () => {
            const { token } = await createUserAndGetToken('rules@test.com');
            const cases: [object, string][] = [
                [{ tags: ['x'.repeat(31)] }, `Tag "${'x'.repeat(31)}" is too long: tags can be at most 30 characters`],
                [{ tags: Array.from({ length: 11 }, (_, i) => `tag${i}`) }, 'A note can have at most 10 tags (it has 11)'],
                [{ tags: [''] }, 'Tags cannot be empty'],
                [{ subject: 's'.repeat(201) }, 'Subject must be at most 200 characters (it is 201)'],
                [{ content: 'c'.repeat(10001) }, 'Content must be at most 10,000 characters (it is 10,001)'],
                [{ subject: '' }, 'Subject is required'],
                [{ importance: 11 }, 'Importance must be a number from 1 to 10']
            ];
            for (const [note, message] of cases) {
                const res = await create(token, note);
                expect(res.statusCode).toEqual(400);
                expect(messages(res)).toEqual([message]);
            }
            expect(await Note.countDocuments()).toBe(0);
        });

        it('reports every problem at once, and shortens a runaway tag in the message', async () => {
            const { token } = await createUserAndGetToken('many@test.com');
            const res = await create(token, { subject: '', tags: ['ok', 'y'.repeat(500)] });
            expect(res.statusCode).toEqual(400);
            expect(messages(res)).toEqual([
                'Subject is required',
                `Tag "${'y'.repeat(40)}…" is too long: tags can be at most 30 characters`
            ]);
        });

        it('counts length as the schema does, so nothing slips through to a failed save', async () => {
            // 16 emoji are 16 characters to a person but 32 UTF-16 units, which is what Mongoose's
            // maxlength counts; a route that counted the first way would pass the note on to fail.
            const { token } = await createUserAndGetToken('emoji@test.com');
            const res = await create(token, { tags: ['🧠'.repeat(16)] });
            expect(res.statusCode).toEqual(400);
            expect(messages(res)[0]).toMatch(/tags can be at most 30 characters/);
            expect((await create(token, { tags: ['🧠'.repeat(15)] })).statusCode).toEqual(200);
        });

        it('checks an update the same way, and leaves the note as it was', async () => {
            const { token } = await createUserAndGetToken('edit@test.com');
            const noteId = (await create(token, { tags: ['before'] })).body._id;

            const res = await request(app)
                .put(`/api/notes/${noteId}`)
                .set('x-auth-token', token)
                .send({ subject: 'Edited', content: 'Edited', tags: ['before', 'z'.repeat(31)] });
            expect(res.statusCode).toEqual(400);
            expect(messages(res)).toEqual([`Tag "${'z'.repeat(31)}" is too long: tags can be at most 30 characters`]);

            const note = await Note.findById(noteId).lean() as any;
            expect(note.subject).toBe('S');
            expect(note.tags).toEqual(['before']);

            // Fields left out of an update are left alone, as before.
            const partial = await request(app).put(`/api/notes/${noteId}`).set('x-auth-token', token).send({ tags: ['after'] });
            expect(partial.statusCode).toEqual(200);
            expect(partial.body.subject).toBe('S');
            expect(partial.body.tags).toEqual(['after']);
        });
    });

    describe('Notes Like/Unlike', () => {
        it('should like and unlike a note', async () => {
            const { token: user1Token } = await createUserAndGetToken('liker@test.com');
            const { token: user2Token } = await createUserAndGetToken('author@test.com');

            // Author creates a note
            const createRes = await request(app)
                .post('/api/notes')
                .set('x-auth-token', user2Token)
                .send({
                    subject: 'Like Me',
                    content: 'Content'
                });
            const noteId = createRes.body._id;

            // User1 likes the note
            const likeRes = await request(app)
                .post(`/api/notes/${noteId}/like`)
                .set('x-auth-token', user1Token)
                .send();
            expect(likeRes.statusCode).toEqual(200);
            expect(likeRes.body.msg).toBe('Note liked');

            // Get liked notes
            const getLikedRes = await request(app)
                .get('/api/notes/liked')
                .set('x-auth-token', user1Token)
                .send();
            expect(getLikedRes.statusCode).toEqual(200);
            expect(getLikedRes.body.length).toBe(1);
            expect(getLikedRes.body[0]._id).toBe(noteId);
            // Liked notes come with their author populated so the UI can show who wrote them.
            expect(getLikedRes.body[0].creator?.profile?.fullName).toBeTruthy();

            // User1 unlikes the note
            const unlikeRes = await request(app)
                .post(`/api/notes/${noteId}/unlike`)
                .set('x-auth-token', user1Token)
                .send();
            expect(unlikeRes.statusCode).toEqual(200);
            expect(unlikeRes.body.msg).toBe('Note unliked');

            // Get liked notes again
            const getLikedRes2 = await request(app)
                .get('/api/notes/liked')
                .set('x-auth-token', user1Token)
                .send();
            expect(getLikedRes2.statusCode).toEqual(200);
            expect(getLikedRes2.body.length).toBe(0);
        });

        it('should maintain a denormalized like count on the note', async () => {
            const { token: likerToken } = await createUserAndGetToken('count-liker@test.com');
            const { token: authorToken } = await createUserAndGetToken('count-author@test.com');

            const createRes = await request(app)
                .post('/api/notes')
                .set('x-auth-token', authorToken)
                .send({ subject: 'Count me', content: 'Content' });
            const noteId = createRes.body._id;
            expect(createRes.body.likeCount).toBe(0);

            const readCount = async () => {
                const res = await request(app).get(`/api/notes/${noteId}`).set('x-auth-token', likerToken).send();
                return res.body.likeCount;
            };

            // Like increments the count
            await request(app).post(`/api/notes/${noteId}/like`).set('x-auth-token', likerToken).send();
            expect(await readCount()).toBe(1);

            // Liking again is idempotent (no double count)
            await request(app).post(`/api/notes/${noteId}/like`).set('x-auth-token', likerToken).send();
            expect(await readCount()).toBe(1);

            // Unlike decrements the count
            await request(app).post(`/api/notes/${noteId}/unlike`).set('x-auth-token', likerToken).send();
            expect(await readCount()).toBe(0);

            // Unliking again does not drive the count negative
            await request(app).post(`/api/notes/${noteId}/unlike`).set('x-auth-token', likerToken).send();
            expect(await readCount()).toBe(0);
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
            expect(feedRes1.body.notes.length).toBe(1);
            expect(feedRes1.body.notes[0].subject).toBe('u1');

            // User1 follows User2
            await request(app).post(`/api/users/${id2}/follow`).set('x-auth-token', token1).send();

            // Now user1 should see u1 and u2 (but not u3)
            const feedRes2 = await request(app).get('/api/notes').set('x-auth-token', token1).send();
            expect(feedRes2.body.notes.length).toBe(2);

            const subjects = feedRes2.body.notes.map((n: any) => n.subject);
            expect(subjects).toContain('u1');
            expect(subjects).toContain('u2');
            expect(subjects).not.toContain('u3');
        });
    });

    describe('Response compression', () => {
        it('should compress a large response for a client that accepts it', async () => {
            const { token } = await createUserAndGetToken('reader@test.com');
            const content = 'A note long enough to be worth compressing. '.repeat(40);
            await request(app).post('/api/notes').set('x-auth-token', token).send({ subject: 'Long', content });

            const res = await request(app).get('/api/notes/my').set('x-auth-token', token).set('Accept-Encoding', 'gzip');

            expect(res.statusCode).toEqual(200);
            expect(res.headers['content-encoding']).toBe('gzip');
            expect(res.body[0].content).toBe(content); // Supertest unzips it, as a browser does
        });
    });
});

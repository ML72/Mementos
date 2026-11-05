import request from 'supertest';
import mongoose from 'mongoose';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import app from '../../src/server/index';
import { registerVerified } from '../helpers/auth';
import { User, Note } from '../../src/server/models';

const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/mementos_test_privacy';

// The Privacy Policy tells users that nobody else can see their email address.
describe('Email address privacy', () => {

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

    it('never sends one user another user\'s email address', async () => {
        const AUTHOR_EMAIL = 'author@privacy.com';
        const reader = await registerVerified('reader@privacy.com', 'password123', 'Reader');
        const author = await registerVerified(AUTHOR_EMAIL, 'password123', 'Findable Author');
        const readerId = (await User.findOne({ 'login.email': 'reader@privacy.com' }))!._id.toString();
        const authorId = (await User.findOne({ 'login.email': AUTHOR_EMAIL }))!._id.toString();

        const post = (token: string, path: string, body?: any) =>
            request(app).post(path).set('x-auth-token', token).send(body);
        const note = (await post(author, '/api/notes', { subject: 'A note', content: 'Some text' })).body;
        await post(reader, `/api/users/${authorId}/follow`);
        await post(author, `/api/users/${readerId}/follow`);
        await post(reader, `/api/notes/${note._id}/like`);

        const reads = [
            '/api/notes',
            '/api/notes/liked',
            `/api/notes/${note._id}`,
            `/api/notes/user/${authorId}`,
            `/api/users/${authorId}/profile`,
            `/api/users/${readerId}/following`,
            `/api/users/${readerId}/followers`,
            '/api/users/search?query=Findable'
        ];
        for (const path of reads) {
            const res = await request(app).get(path).set('x-auth-token', reader).send();
            const body = JSON.stringify(res.body);

            expect(res.status).toBe(200);
            expect(body).toContain(authorId); // the author really is in this response
            expect(body).not.toContain(AUTHOR_EMAIL);
        }
    });

    it('still names the author of each note in the feed', async () => {
        const reader = await registerVerified('reader@privacy.com', 'password123', 'Reader');
        const author = await registerVerified('author@privacy.com', 'password123', 'Named Author');
        const authorId = (await User.findOne({ 'login.email': 'author@privacy.com' }))!._id.toString();

        await request(app).post('/api/notes').set('x-auth-token', author).send({ subject: 'A note', content: 'Some text' });
        await request(app).post(`/api/users/${authorId}/follow`).set('x-auth-token', reader).send();

        const feed = await request(app).get('/api/notes').set('x-auth-token', reader).send();
        expect(feed.body.notes[0].creator.profile.fullName).toBe('Named Author');
    });
});

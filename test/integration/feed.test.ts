import request from 'supertest';
import mongoose from 'mongoose';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import app from '../../src/server/index';
import { registerVerified } from '../helpers/auth';
import { User, Note } from '../../src/server/models';

const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/mementos_test_feed';

describe('Feed Algorithm Integration', () => {

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

    // --- helpers -----------------------------------------------------------
    const register = async (email: string) => {
        return registerVerified(email, 'password123', email.split('@')[0]);
    };
    const idOf = async (email: string) => {
        const user = await User.findOne({ 'login.email': email });
        return user!._id.toString();
    };
    const createNote = (token: string, body: any) =>
        request(app).post('/api/notes').set('x-auth-token', token).send(body);
    const follow = (token: string, targetId: string) =>
        request(app).post(`/api/users/${targetId}/follow`).set('x-auth-token', token).send();
    const like = (token: string, noteId: string) =>
        request(app).post(`/api/notes/${noteId}/like`).set('x-auth-token', token).send();
    const getFeed = (token: string, limit?: number) =>
        request(app).get(`/api/notes${limit ? `?limit=${limit}` : ''}`).set('x-auth-token', token).send();
    const creatorId = (note: any) => (note.creator?._id ?? note.creator);

    // -----------------------------------------------------------------------

    it('keeps at least 25% of the feed as the user’s own notes when they have >= 5 notes', async () => {
        const me = await register('quota.me@feed.com');
        const other = await register('quota.other@feed.com');
        const myId = await idOf('quota.me@feed.com');
        const otherId = await idOf('quota.other@feed.com');

        for (let i = 0; i < 6; i++) await createNote(me, { subject: `mine${i}`, content: 'c' });
        for (let i = 0; i < 10; i++) await createNote(other, { subject: `theirs${i}`, content: 'c' });
        await follow(me, otherId);

        const res = await getFeed(me, 20);
        const notes = res.body.notes;

        const selfCount = notes.filter((n: any) => creatorId(n) === myId).length;
        const otherCount = notes.filter((n: any) => creatorId(n) === otherId).length;

        expect(res.statusCode).toBe(200);
        // We have a true mix of both sources...
        expect(selfCount).toBeGreaterThan(0);
        expect(otherCount).toBeGreaterThan(0);
        // ...and the self-review floor is respected.
        expect(selfCount).toBeGreaterThanOrEqual(Math.ceil(0.25 * notes.length));
    });

    it('ranks higher-importance own notes ahead of lower-importance ones', async () => {
        const me = await register('imp.me@feed.com');

        await createNote(me, { subject: 'low', content: 'c', importance: 1 });
        await createNote(me, { subject: 'high', content: 'c', importance: 10 });
        await createNote(me, { subject: 'mid', content: 'c', importance: 5 });

        const subjects = (await getFeed(me)).body.notes.map((n: any) => n.subject);

        expect(subjects[0]).toBe('high');
        expect(subjects.indexOf('high')).toBeLessThan(subjects.indexOf('mid'));
        expect(subjects.indexOf('mid')).toBeLessThan(subjects.indexOf('low'));
    });

    it('does not repeat recently-seen notes: a second page surfaces different (not-seen-in-a-while) notes', async () => {
        const me = await register('recency.me@feed.com');
        for (let i = 0; i < 6; i++) await createNote(me, { subject: `n${i}`, content: 'c' });

        const page1 = (await getFeed(me, 3)).body.notes;
        const page2 = (await getFeed(me, 3)).body.notes;

        expect(page1.length).toBe(3);
        expect(page2.length).toBe(3);

        const ids1 = page1.map((n: any) => n._id);
        const ids2 = page2.map((n: any) => n._id);
        const overlap = ids1.filter((id: string) => ids2.includes(id));
        expect(overlap.length).toBe(0);
    });

    it('advances spaced-repetition review state for served own notes', async () => {
        const me = await register('sr.me@feed.com');
        const noteId = (await createNote(me, { subject: 'review me', content: 'c' })).body._id;

        // Brand-new note: due now, never reviewed.
        const before: any = await Note.findById(noteId);
        expect(before.review.reviewCount).toBe(0);
        expect(before.review.lastReviewedAt).toBeNull();

        await getFeed(me);

        // After being served, it has been "reviewed" and its next due time pushed out.
        const after: any = await Note.findById(noteId);
        expect(after.review.reviewCount).toBe(1);
        expect(after.review.lastReviewedAt).not.toBeNull();
        expect(new Date(after.review.nextDueAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('learns tag preferences from likes and pushes liked topics up the feed', async () => {
        const me = await register('tag.me@feed.com');
        const authorA = await register('tag.a@feed.com');
        const authorB = await register('tag.b@feed.com');
        const authorC = await register('tag.c@feed.com');
        const idA = await idOf('tag.a@feed.com');
        const idB = await idOf('tag.b@feed.com');
        const idC = await idOf('tag.c@feed.com');

        const physicsA = (await createNote(authorA, { subject: 'pa', content: 'c', tags: ['physics'] })).body;
        await createNote(authorC, { subject: 'pc', content: 'c', tags: ['physics'] }); // physics, different author
        await createNote(authorB, { subject: 'cb', content: 'c', tags: ['cooking'] }); // unrelated topic

        await follow(me, idA);
        await follow(me, idB);
        await follow(me, idC);

        // Like a physics note -> 'physics' tag affinity goes up.
        await like(me, physicsA._id);

        const subjects = (await getFeed(me)).body.notes.map((n: any) => n.subject);

        // The physics note from a *different* author (so it's the tag, not the author, talking)
        // should outrank the unrelated cooking note.
        expect(subjects.indexOf('pc')).toBeLessThan(subjects.indexOf('cb'));
    });

    it('learns author preferences from likes', async () => {
        const me = await register('auth.me@feed.com');
        const authorA = await register('auth.a@feed.com');
        const authorD = await register('auth.d@feed.com');
        const idA = await idOf('auth.a@feed.com');
        const idD = await idOf('auth.d@feed.com');

        await follow(me, idA);
        await follow(me, idD);

        // Build author-A affinity in isolation: like a note by A, then remove it so it isn't
        // a feed candidate (and so the compared notes have distinct authors — no de-clumping).
        const aLiked = (await createNote(authorA, { subject: 'aLiked', content: 'c', tags: ['liked-topic'] })).body;
        await like(me, aLiked._id);
        await request(app).delete(`/api/notes/${aLiked._id}`).set('x-auth-token', authorA).send();

        // Two fresh notes with distinct, never-liked tags: only the *author* differs in affinity.
        await createNote(authorA, { subject: 'aTest', content: 'c', tags: ['unseen-a'] });
        await createNote(authorD, { subject: 'dTest', content: 'c', tags: ['unseen-d'] });

        const subjects = (await getFeed(me)).body.notes.map((n: any) => n.subject);

        // aTest shares the liked author (but not the liked tag), so it should outrank dTest.
        expect(subjects.indexOf('aTest')).toBeLessThan(subjects.indexOf('dTest'));
    });

    it('paginates: reports hasMore and surfaces fresh notes on the next page', async () => {
        const me = await register('page.me@feed.com');
        const author = await register('page.author@feed.com');
        const authorId = await idOf('page.author@feed.com');

        for (let i = 0; i < 25; i++) await createNote(author, { subject: `o${i}`, content: 'c' });
        await follow(me, authorId);

        const res1 = await getFeed(me, 20);
        expect(res1.body.notes.length).toBe(20);
        expect(res1.body.hasMore).toBe(true);

        const ids1 = res1.body.notes.map((n: any) => n._id);
        const res2 = await getFeed(me, 20);
        const fresh = res2.body.notes.filter((n: any) => !ids1.includes(n._id));
        expect(fresh.length).toBeGreaterThan(0);
    });
});

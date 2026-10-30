import request from 'supertest';
import mongoose from 'mongoose';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import app from '../../src/server/index';
import { Note, User } from '../../src/server/models';
import { registerVerified } from '../helpers/auth';

const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/mementos_test';

describe('Auth Endpoints Integration Services', () => {
    
    beforeAll(async () => {
        // Ensure strictly separate DB for testing
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

    const login = (email: string, password = 'password123') => request(app).post('/api/auth').send({ email, password });
    const me = (token: string) => request(app).get('/api/auth').set('x-auth-token', token);

    describe('POST /api/users (Registration)', () => {
        it('should register a new user, unverified and without a session', async () => {
            const res = await request(app)
                .post('/api/users')
                .send({
                    email: 'test@example.com',
                    password: 'password123', fullName: 'Test Name'
                });
            
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({ verificationRequired: true });

            // Verify user in DB has nested login fields
            const user = await User.findOne({ 'login.email': 'test@example.com' });
            expect(user).toBeTruthy();
            expect(user?.login?.email).toBe('test@example.com');
            expect(user?.login?.password).toBeTruthy();
            expect(user?.login?.verified).toBe(false);
        });
    });

    describe('POST /api/auth (Login)', () => {
        it('should login an existing user', async () => {
            await registerVerified('test@example.com', 'password123', 'Test Name');

            const res = await request(app)
                .post('/api/auth')
                .send({
                    email: 'test@example.com',
                    password: 'password123'
                });

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('token');
        });

        it('should reject invalid credentials', async () => {
             await registerVerified('test@example.com', 'password123', 'Test Name');

             const res = await request(app)
                .post('/api/auth')
                .send({
                    email: 'test@example.com',
                    password: 'wrongpassword'
                });
            
            expect(res.statusCode).toEqual(400);
        });

        it('should treat the email case-insensitively, ignoring surrounding spaces', async () => {
            await registerVerified('Casing.Test@Example.com', 'password123', 'Test Name');

            for (const email of ['casing.test@example.com', 'CASING.TEST@EXAMPLE.COM', '  Casing.Test@example.COM ']) {
                const res = await login(email);
                expect(res.statusCode).toEqual(200);
                expect((await me(res.body.token)).body.login.email).toEqual('casing.test@example.com');
            }
            expect(await User.countDocuments()).toBe(1);
        });
    });

    describe('Sessions', () => {
        it('keeps every session signed in: several tabs and devices at once', async () => {
            const first = await registerVerified('multi@example.com');
            await new Promise(r => setTimeout(r, 1100)); // a later second, so the tokens differ
            const second = (await login('multi@example.com')).body.token;
            const third = (await login('MULTI@example.com')).body.token;
            expect(new Set([first, second, third]).size).toBeGreaterThan(1);

            for (const token of [first, second, third]) {
                expect((await me(token)).statusCode).toEqual(200);
            }
        });

        it('signs in an account created before sessions were bound to the password, and keeps it signed in', async () => {
            const token = await registerVerified('legacy@example.com');
            const noteId = (await request(app).post('/api/notes').set('x-auth-token', token)
                .send({ subject: 'Mine', content: 'Content' })).body._id;
            // What an account from before then looks like: no login.passwordChangedAt at all.
            await User.collection.updateOne({ 'login.email': 'legacy@example.com' }, { $unset: { 'login.passwordChangedAt': '' } });

            const res = await login('legacy@example.com');
            expect(res.statusCode).toEqual(200);
            expect((await me(res.body.token)).statusCode).toEqual(200);

            // It is given its creation date, once; a second sign-in agrees, and the first still works.
            const user = await User.findOne({ 'login.email': 'legacy@example.com' }).lean() as any;
            expect(user.login.passwordChangedAt).toEqual(user.dateCreated);
            const again = (await login('legacy@example.com')).body.token;
            expect((await me(again)).statusCode).toEqual(200);
            expect((await me(res.body.token)).statusCode).toEqual(200);

            // Saving the whole user document (liking a note does) must not move it either.
            expect((await request(app).post(`/api/notes/${noteId}/like`).set('x-auth-token', res.body.token)).statusCode).toEqual(200);
            expect((await me(res.body.token)).statusCode).toEqual(200);
        });
    });

    describe('GET /api/auth (Get Current User)', () => {
         it('should return user data for valid token', async () => {
            const token = await registerVerified('test@example.com', 'password123', 'Test Name');

            const res = await request(app)
                .get('/api/auth')
                .set('x-auth-token', token); 
            
            expect(res.statusCode).toEqual(200);
            expect(res.body.login.email).toEqual('test@example.com');
            // Ensure credential material is not returned
            expect(res.body.login.password).toBeUndefined();
            expect(res.body.emailVerification).toBeUndefined();
         });
    });
});

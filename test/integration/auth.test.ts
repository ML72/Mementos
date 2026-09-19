import request from 'supertest';
import mongoose from 'mongoose';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import app from '../../src/server/index';
import { User } from '../../src/server/models';
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
    });

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

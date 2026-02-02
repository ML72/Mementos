import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/server/index';
// @ts-ignore
import { User } from '../../src/server/models';

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
        it('should register a new user', async () => {
            const res = await request(app)
                .post('/api/users')
                .send({
                    email: 'test@example.com',
                    password: 'password123'
                });
            
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('token');

            // Verify user in DB has nested login fields
            const user = await User.findOne({ 'login.email': 'test@example.com' });
            expect(user).toBeTruthy();
            // @ts-ignore
            expect(user?.login?.email).toBe('test@example.com');
            // @ts-ignore
            expect(user?.login?.password).toBeTruthy();
        });
    });

    describe('POST /api/auth (Login)', () => {
        it('should login an existing user', async () => {
            // First register
            await request(app)
                .post('/api/users')
                .send({
                    email: 'test@example.com',
                    password: 'password123'
                });

            // Then login
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
             // First register
             await request(app)
                .post('/api/users')
                .send({
                    email: 'test@example.com',
                    password: 'password123'
                });

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
            // Register to get token
            const regRes = await request(app)
                .post('/api/users')
                .send({
                    email: 'test@example.com',
                    password: 'password123'
                });
            
            const token = regRes.body.token;

            const res = await request(app)
                .get('/api/auth')
                .set('x-auth-token', token); 
            
            expect(res.statusCode).toEqual(200);
            expect(res.body.login.email).toEqual('test@example.com');
            // Ensure password is not returned
            expect(res.body.login.password).toBeUndefined();
         });
    });
});

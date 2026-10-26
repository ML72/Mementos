import request from 'supertest';
import app from '../../src/server/index';
import { User } from '../../src/server/models';

/**
 * Register an account, mark it verified and sign in — for suites that need a logged-in user and
 * are not about the verification flow itself (test/integration/verification.test.ts covers that).
 */
export const registerVerified = async (
    email: string,
    password = 'password123',
    fullName = 'Test User'
): Promise<string> => {
    await request(app).post('/api/users').send({ email, password, fullName });
    await User.updateOne({ 'login.email': email.toLowerCase() }, { $set: { 'login.verified': true } });
    const res = await request(app).post('/api/auth').send({ email, password });
    return res.body.token as string;
};

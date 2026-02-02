import 'express';

// Define the structure of the user object in JWT payload
export interface JWTUser {
  id: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTUser;
    }
  }
}

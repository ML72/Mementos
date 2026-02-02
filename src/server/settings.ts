import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Types
type NodeEnv = "test" | "development" | "production";

// App settings
const NODE_ENV: NodeEnv = (process.env.NODE_ENV as NodeEnv) || 'development';
const PORT: number = parseInt(process.env.PORT  || "3000");

// MongoDB settings
const MONGO_URI: string = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/dev';

// Security settings
const JWT_SECRET: string = process.env.JWT_SECRET || "im-so-secret!";
const SECURITY_CSP: string = process.env.SECURITY_CSP || "default-src 'self'; script-src 'self' 'unsafe-eval'; frame-src 'self'; style-src 'self' 'unsafe-inline'; img-src * data:; font-src * data:";
const SECURITY_CORS_WHITELIST: string = process.env.SECURITY_CORS_WHITELIST || (NODE_ENV === 'development' ? 'http://localhost:3000;http://localhost:5173' : '');

export { NODE_ENV, PORT, MONGO_URI, JWT_SECRET, SECURITY_CSP, SECURITY_CORS_WHITELIST };

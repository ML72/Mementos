import express, { Express, Request, Response } from 'express';
import path from 'path';
import { connectDB, setupCSP, setupCORS } from './config';
import { NODE_ENV, PORT, SECURITY_CSP, SECURITY_CORS_WHITELIST } from './settings';

import { authRoutes, usersRoutes, notesRoutes } from './routes';

// Init app
const app: Express = express();
app.use(express.json());

// Set up security
setupCSP(app, SECURITY_CSP);
setupCORS(app, SECURITY_CORS_WHITELIST);

// Initialize connections if not in test environment
if (NODE_ENV !== 'test') {
  // Connect to MongoDB
  connectDB();
}

// Routing for API endpoints
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/notes', notesRoutes);

// Serve static assets in production
if (NODE_ENV === 'production') {
  const clientBuildPath = path.resolve(__dirname, '../src/client/dist');
  
  // Serve static files from the React app build directory
  app.use(express.static(clientBuildPath));

  // Handle React routing - return all requests to React app
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Start the server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server listening on ${PORT} in ${NODE_ENV} mode`);
  });
}

export default app;

import express, { Express, Request, Response } from 'express';
import path from 'path';
import { connectDB, setupCSP, setupCORS, setupWwwRedirect } from './config';
import { NODE_ENV, PORT, SECURITY_CSP, SECURITY_CORS_WHITELIST, WWW_REDIRECT_HOST } from './settings';

import { authRoutes, usersRoutes, notesRoutes } from './routes';
import { checkMailer } from './service';

// Init app
const app: Express = express();
app.set('trust proxy', true);
app.use(express.json());

// Redirect the apex domain to its www subdomain (no-op unless WWW_REDIRECT_HOST is set)
setupWwwRedirect(app, WWW_REDIRECT_HOST);

// Set up security
setupCSP(app, SECURITY_CSP);
setupCORS(app, SECURITY_CORS_WHITELIST);

// Initialize connections if not in test environment. Each service logs one status line
// (DATABASE: / EMAIL:), so one that is down or misconfigured shows up in the server log.
if (NODE_ENV !== 'test') {
  // Connect to MongoDB
  connectDB();

  // Check the SMTP login now rather than on the first sign-up
  checkMailer();
}

// Lightweight health check (no auth, no DB dependency) for deployment probes
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Routing for API endpoints
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/notes', notesRoutes);

// Serve static assets in production
if (NODE_ENV === 'production') {
  const clientBuildPath = path.resolve(__dirname, '../src/client/dist');

  // Serve static files from the React app build directory
  app.use(express.static(clientBuildPath));

  // Handle React routing - return all non-API requests to the React app.
  // Express 5 (path-to-regexp v8) rejects a bare '*' path and throws at startup,
  // so we use the named wildcard '/*splat'.
  app.get('/*splat', (req: Request, res: Response) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Start the server if not in test mode
if (NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server listening on ${PORT} in ${NODE_ENV} mode`);
  });
}

export default app;

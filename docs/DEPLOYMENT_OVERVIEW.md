# Deployment Guide for Azure App Service

This guide explains this project's deployment configuration. For first time deployment, please read [DEPLOYMENT_SETUP.md](./DEPLOYMENT_SETUP.md).

---

## Architecture

The application is deployed as a single unit where:
- The Node.js/Express backend serves both API endpoints and static frontend files
- In production, the frontend is built as static assets and served by the backend
- All requests to `/api/*` are handled by the Express API routes
- All other requests serve the React SPA

## Prerequisites

1. Node.js 20.11.0 (as specified in package.json)
2. Azure account with an App Service
3. MongoDB connection (Azure CosmosDB with MongoDB API or Atlas)

## Environment Variables

For the complete list with defaults, see [ENVIRONMENT_OVERVIEW.md](./ENVIRONMENT_OVERVIEW.md).

Set the following environment variables in your Azure App Service:

### Required
- `NODE_ENV=production`
- `MONGO_URI` - Your MongoDB connection string
- `JWT_SECRET` - A secure secret for JWT token signing

### Optional
- `PORT` - Port number (Azure sets this automatically, usually 8080 or 80)
- `SECURITY_CSP` - Custom Content Security Policy (has sensible defaults)
- `SECURITY_CORS_WHITELIST` - CORS whitelist (empty in production for same-origin only)
- `WWW_REDIRECT_HOST` - Apex domain to 301-redirect to its `www` subdomain (ex. Send `mementos.info/x` to `www.mementos.info/x`); leave unset to disable

## Custom Domain & www Redirect

When the app is served on a custom domain, set `WWW_REDIRECT_HOST` to the **apex** (root) domain to make the Express app issue a `301` redirect from the apex to the `www` subdomain. For example, with `WWW_REDIRECT_HOST=mementos.info`, a request to `https://mementos.info/notes?id=1` redirects to `https://www.mementos.info/notes?id=1`. The protocol and full path + query string are preserved.

Implementation notes:
- It only matches the bare apex host, so the `www` host, the `*.azurewebsites.net` default host, and `localhost` are left untouched (health probes and local dev are unaffected).
- It relies on `app.set('trust proxy', true)` so that `req.protocol` and `req.hostname` reflect Azure's `X-Forwarded-Proto` / `X-Forwarded-Host` headers rather than the internal proxy hop.
- Leaving `WWW_REDIRECT_HOST` unset (the default) disables the redirect entirely; nothing happens in dev or test.

**DNS / Azure requirement:** for the redirect to fire, requests to the apex must actually reach the app. An apex domain cannot be a `CNAME`, so map **both** hostnames to the App Service. Also add **both** as custom domains on the App Service and provision TLS certificates for **both** so the redirect terminates on HTTPS at the apex before sending the browser to `www`.

## Build Process

### Local Build (for testing)

```bash
# Install all dependencies
npm run install:all

# Build both client and server
npm run build
```

This will:
1. Build the React frontend to `src/client/dist/`
2. Compile TypeScript backend to `dist/`

### Running Production Build Locally

```bash
# Set environment variable
set NODE_ENV=production

# Start the server
npm start
```

The application will be available at `http://localhost:3000`

## Azure App Service Configuration

### Startup Command

Set the startup command in Azure App Service:

```bash
npm start
```

Or for direct execution:

```bash
node dist/index.js
```

### Application Settings

In the Azure Portal, go to:
- Configuration → Application Settings
- Add all environment variables listed above

### Build Automation (Optional)

Azure can build your app automatically using Oryx. Add this to Azure App Service configuration:

```bash
# Build Command
npm run install:all && npm run build
```

## Post-Deployment Verification

1. Check that environment variables are set correctly
2. Verify MongoDB connection
3. Test the health endpoint: `https://your-app.azurewebsites.net/api/health` (returns `{"status":"ok"}`)
4. Test frontend: `https://your-app.azurewebsites.net`
5. Check application logs in Azure Portal

## Troubleshooting

### Application won't start
- Check the Application Logs in Azure Portal
- Verify `NODE_ENV` is set to "production"
- Ensure all environment variables are configured

### 404 errors for frontend routes
- This should be handled by the catch-all route in production
- Verify `NODE_ENV` is set to "production"

### CORS errors
- In production, CORS should not be an issue as frontend and backend are same-origin
- Check that `SECURITY_CORS_WHITELIST` is empty or not set

### Build fails
- Ensure Node.js version matches (20.11.0)
- Check that both `src/client/dist` and `dist` directories are created
- Verify all dependencies are installed

## Build Directory Structure

### Before Build
```
Mementos/
├── src/
│   ├── client/
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── main.tsx
│   │   │   └── ...
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── server/
│       ├── index.ts
│       ├── routes/
│       ├── models/
│       └── ...
└── package.json
```

### After Build
```
Mementos/
├── dist/                    # Compiled server (TypeScript → JS)
│   ├── index.js             # Entry point
│   ├── routes/
│   ├── models/
│   └── ...
├── src/
│   └── client/
│       └── dist/            # Compiled client (React → Static)
│           ├── index.html
│           ├── assets/
│           │   ├── index-[hash].js
│           │   ├── index-[hash].css
│           │   └── ...
│           └── manifest.json
└── package.json
```

### Deployed Structure (Azure)
```
/home/site/wwwroot/          # Azure app root
├── dist/                    # Server code
│   └── index.js             # Running: node dist/index.js
├── src/
│   └── client/              # Static frontend files
│       └── dist/
│           ├── index.html   # Served for non-API routes
│           └── assets/
├── node_modules/            # Production dependencies
└── package.json
```

## Security Checklist

- ✅ JWT_SECRET set to a strong, unique value
- ✅ MONGO_URI uses secure connection (MongoDB Atlas or Azure CosmosDB)
- ✅ NODE_ENV set to "production"
- ✅ HTTPS enabled (Azure provides this by default)
- ✅ CSP headers configured
- ✅ CORS properly configured for production

## Monitoring

Monitor your application using:
- Azure Application Insights
- Azure App Service Logs
- Custom logging in your application

## Scaling

Azure App Service can be scaled:
- Vertically (larger instance size)
- Horizontally (more instances)

Configure auto-scaling rules based on CPU/memory usage or request count.

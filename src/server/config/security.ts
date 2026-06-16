import { Express, Request, Response, NextFunction } from 'express';
import { CorsOptions } from 'cors';

import cors from 'cors';

const setupCSP = (app: Express, csp: string) => {
    app.use((req: Request, res: Response, next: NextFunction) => {
        res.setHeader(
          'Content-Security-Policy',
          csp
        );
        next();
    });
}

const setupCORS = (app: Express, whitelist: string) => {
    // If whitelist is empty, allow same-origin requests
    if (!whitelist || whitelist.trim() === '') {
        app.use(cors({
            origin: false, // Only allow same-origin requests
            credentials: true
        }));
        return;
    }

    // Development mode with whitelist
    const corsWhitelist = whitelist.split(';');
    const corsOptions: CorsOptions = {
      origin: function (origin: string | undefined, callback: any) {
        // Allow whitelisted origins and server-to-server requests (no origin header)
        if (!origin || corsWhitelist.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true
    }
    app.use(cors(corsOptions));
}

const setupWwwRedirect = (app: Express, apexHost: string) => {
    // No apex host configured (local dev, tests, etc.) means nothing to redirect
    if (!apexHost || apexHost.trim() === '') return;

    const apex = apexHost.trim().toLowerCase();
    app.use((req: Request, res: Response, next: NextFunction) => {
        // Note that req.hostname strips the port
        // Only the bare apex (not www or azurewebsites.net default host) should be redirected
        if (req.hostname.toLowerCase() === apex) {
            // Preserve the protocol (via X-Forwarded-Proto, see trust proxy)
            // Preserve the full path + query string
            // 301 so browsers/SEO cache the canonical host
            return res.redirect(301, `${req.protocol}://www.${apex}${req.originalUrl}`);
        }
        next();
    });
}

export { setupCSP, setupCORS, setupWwwRedirect }
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

export { setupCSP, setupCORS }
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
const WWW_REDIRECT_HOST: string = process.env.WWW_REDIRECT_HOST || '';

// Content settings
const CONTENT_LIMITS: any = {
    NOTE: {
        SUBJECT_MIN_LENGTH: 1,
        SUBJECT_MAX_LENGTH: 200,
        CONTENT_MIN_LENGTH: 1,
        CONTENT_MAX_LENGTH: 10000,
        MAX_TAGS: 10,               // mirrored in src/client/src/components/layout/TagInput.tsx
        TAG_MIN_LENGTH: 1,
        TAG_MAX_LENGTH: 30          // mirrored there too
    },
    USER: {
        PASSWORD_MIN_LENGTH: 8,     // mirrored in src/client/src/service/auth.ts
        PASSWORD_MAX_LENGTH: 128,
        EMAIL_MAX_LENGTH: 254,
        FULL_NAME_MAX_LENGTH: 100,
        BIO_MAX_LENGTH: 500
    }
};

const REQUEST_CONSTRAINTS: any = {
    USER_SEARCH: {
        MIN_QUERY_LENGTH: 5,
        MAX_PAGE_SIZE: 50,
        DEFAULT_PAGE_SIZE: 10
    }
};

// Feed algorithm tunables. See docs/ALGORITHM_FEED.md for the full rationale.
// Everything is a knob so behaviour can be tuned without touching the logic.
const FEED: any = {
    PAGE_SIZE_DEFAULT: 20,
    PAGE_SIZE_MAX: 50,
    // Max notes pulled per track before ranking. Bounds per-request compute regardless
    // of how many notes a user owns or how many people they follow.
    CANDIDATE_POOL: 200,

    // --- Self / spaced-repetition ("review") track ---
    REVIEW: {
        BASE_INTERVAL_HOURS: 24,   // first review spacing
        SPACING_GROWTH: 2.0,       // interval multiplier per review (Leitner-style expansion)
        MAX_BOX: 8,                // cap on the growth exponent (~1.5 years at the defaults)
        IMPORTANCE_STRENGTH: 0.5,  // how strongly importance shortens/lengthens the interval
        OVERDUE_CAP: 5,            // cap on the overdue multiplier so old notes can't dominate
        MIN_REVIEW_GAP_HOURS: 6    // ignore re-serves within this window (anti refresh-spam)
    },

    // --- Others / discovery ("learn") track ---
    DISCOVERY: {
        FRESHNESS_TAU_HOURS: 72,    // exponential freshness decay time-constant (~3 days)
        TAG_AFFINITY_WEIGHT: 0.6,   // max multiplicative boost from tag affinity
        AUTHOR_AFFINITY_WEIGHT: 0.6,// max multiplicative boost from author affinity
        FOLLOW_BONUS: 0.2,          // flat boost for a creator the user follows
        TAG_NORM: 4,                // saturation constant for tag affinity (~2 likes)
        AUTHOR_NORM: 4              // saturation constant for author affinity
    },

    // --- Blend policy (self vs. others) ---
    SELF_MIN_RATIO: 0.25,           // floor on self notes when the user has enough of their own
    SELF_TARGET_RATIO: 0.4,         // desired self proportion when both tracks are plentiful
    MIN_NOTES_FOR_SELF_QUOTA: 5,    // only enforce the floor once the user owns this many notes

    // --- Online preference model (bounded => storage scales O(users), not O(notes)) ---
    AFFINITY: {
        MAX_TAGS: 25,               // top-K tags kept per user
        MAX_AUTHORS: 15,            // top-K authors kept per user
        DECAY: 0.95,                // multiplicative decay applied on each engagement (forgetting)
        MIN_SCORE: 0.05,            // evict entries that decay below this
        W_LIKE_TAG: 2.0,            // weight added to a tag when a note with it is liked
        W_LIKE_AUTHOR: 2.0          // weight added to an author when their note is liked
    },

    // Capped ring buffer of recently served notes per user. Implements "not seen in a
    // while" cheaply: an item becomes eligible again once it falls off the ring.
    RECENTLY_SEEN_CAP: 100
};

// Email is sent over SMTP, which any provider supports, once SMTP_HOST is set. Without it each
// message is printed to the console instead (`console`), so the app runs with no mail server.
// Tests always use `memory`, which captures messages for assertions.
type EmailTransport = 'smtp' | 'console' | 'memory';
const pickEmailTransport = (): EmailTransport => {
    // Checked first so no .env setting can make the test suite deliver real mail.
    if (NODE_ENV === 'test') return 'memory';
    return process.env.SMTP_HOST ? 'smtp' : 'console';
};
const parseBool = (value: string | undefined, fallback: boolean): boolean =>
    value === undefined || value === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');

// Origin used to build links inside emails: APP_URL when set, else the host visitors end up on —
// the www one the apex redirects to (a one-click unsubscribe POST doesn't follow redirects), else
// the host name Azure App Service gives the app. The dev default is the Vite dev server, which
// proxies /api.
const pickAppUrl = (): string => {
    if (process.env.APP_URL) return process.env.APP_URL;
    if (WWW_REDIRECT_HOST.trim()) return `https://www.${WWW_REDIRECT_HOST.trim().toLowerCase()}`;
    if (process.env.WEBSITE_HOSTNAME) return `https://${process.env.WEBSITE_HOSTNAME}`;
    return 'http://localhost:5173';
};

const EMAIL: any = {
    TRANSPORT: pickEmailTransport(),
    FROM: process.env.EMAIL_FROM || 'Mementos <no-reply@mementos.localhost>',
    APP_URL: pickAppUrl().replace(/\/+$/, ''),
    SMTP: {
        HOST: process.env.SMTP_HOST || '',
        PORT: SMTP_PORT,
        // Implicit TLS (465) vs STARTTLS (587). Defaults from the port because a mismatch does
        // not fail fast: every send stalls until nodemailer's greeting timeout.
        SECURE: parseBool(process.env.SMTP_SECURE, SMTP_PORT === 465),
        USER: process.env.SMTP_USER || '',
        PASS: process.env.SMTP_PASS || ''
    },
    // HMAC secret for emailed one-time codes. A 6-digit code hashed with bcrypt is
    // offline-crackable from a database dump (10^6 candidates); an HMAC is worthless without
    // this secret, which lives in config rather than the database. Falls back to JWT_SECRET.
    CODE_SECRET: process.env.EMAIL_CODE_SECRET || JWT_SECRET,
    // Per-IP cap across the public code endpoints. The per-account counters below stop a flood
    // aimed at one victim; this stops one client spraying many addresses.
    CODE_IP_LIMIT: {
        MAX_REQUESTS: parseInt(process.env.EMAIL_CODE_IP_MAX_REQUESTS || '20'),
        WINDOW_MINUTES: 15
    },
    VERIFICATION: {
        // When false, accounts can sign in without verifying (escape hatch if mail is down).
        REQUIRED: parseBool(process.env.EMAIL_VERIFICATION_REQUIRED, true),
        CODE_LENGTH: 6,             // mirrored in src/client/src/pages/public/VerifyEmail.tsx
        EXPIRY_MINUTES: 30,         // mirrored there too
        MAX_ATTEMPTS: 5,            // wrong guesses per code
        RESEND_COOLDOWN_SECONDS: 60,
        MAX_SENDS_PER_WINDOW: 5,
        SEND_WINDOW_MINUTES: 60
    },
    PASSWORD_RESET: {
        CODE_LENGTH: 6,             // mirrored in src/client/src/pages/public/ResetPassword.tsx
        EXPIRY_MINUTES: 30,         // mirrored there too
        MAX_ATTEMPTS: 5,            // wrong guesses per code
        RESEND_COOLDOWN_SECONDS: 60,
        MAX_SENDS_PER_WINDOW: 5,
        SEND_WINDOW_MINUTES: 60
    },
    // Weekly digest, sent at 12AM UTC on each user's `settings.email.digestDay`.
    DIGEST: {
        // Off stops the scheduled job only; settings and unsubscribe links keep working.
        ENABLED: parseBool(process.env.EMAIL_DIGEST_ENABLED, true),
        NOTE_COUNT: 5,              // notes per digest, picked by the feed algorithm
        // Never send a digest within this long of the previous one, so moving the digest day to
        // a nearby day can't produce two emails a few days apart. Under a week, so a send that
        // runs a little late one week doesn't push the next one back a week.
        MIN_GAP_HOURS: 6 * 24,
        // Pause between recipients, to stay under the mail provider's rate limit (Resend's
        // default is 2 requests/second, shared with verification and reset codes).
        THROTTLE_MS: parseInt(process.env.EMAIL_DIGEST_THROTTLE_MS || '500'),
        BATCH_SIZE: 100             // users fetched per query while working through a run
    }
};

export { NODE_ENV, PORT, MONGO_URI, JWT_SECRET, SECURITY_CSP, SECURITY_CORS_WHITELIST, WWW_REDIRECT_HOST, CONTENT_LIMITS, REQUEST_CONSTRAINTS, FEED, EMAIL };

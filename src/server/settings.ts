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
        MAX_TAGS: 10,
        TAG_MIN_LENGTH: 1,
        TAG_MAX_LENGTH: 20
    },
    USER: {
        PASSWORD_MIN_LENGTH: 8,
        PASSWORD_MAX_LENGTH: 128,
        EMAIL_MAX_LENGTH: 254,
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

export { NODE_ENV, PORT, MONGO_URI, JWT_SECRET, SECURITY_CSP, SECURITY_CORS_WHITELIST, WWW_REDIRECT_HOST, CONTENT_LIMITS, REQUEST_CONSTRAINTS, FEED };

import { randomBytes } from 'crypto';
import { Schema, model } from 'mongoose';
import { CONTENT_LIMITS } from '../settings';

/**
 * Credential for one-click unsubscribe links. Those are followed from a mail client with no
 * session, so the token *is* the auth — it has to be unguessable and unique per user.
 * base64url is safe to drop straight into a URL.
 */
const newUnsubscribeToken = (): string => randomBytes(32).toString('base64url');

const UserSchema = new Schema({
    login: {
        // Email is the identity key for login and for emailed codes, so it is stored normalized:
        // Mongoose applies `lowercase`/`trim` on write and to query filters, which makes
        // `Bob@Example.com` and `bob@example.com` the same account.
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            maxlength: CONTENT_LIMITS.USER.EMAIL_MAX_LENGTH
        },
        password: {
            type: String,
            required: true,
            minlength: CONTENT_LIMITS.USER.PASSWORD_MIN_LENGTH,
            maxlength: CONTENT_LIMITS.USER.PASSWORD_MAX_LENGTH
        },
        verified: {
            type: Boolean,
            default: false
        },
        // JWTs are stateless, so a password reset can't revoke tokens already issued — each
        // token is bound to this value instead (see signToken), and moving it on a reset or
        // change is what signs other sessions out. Defaults to account creation so it is never
        // missing.
        passwordChangedAt: {
            type: Date,
            default: Date.now
        }
    },
    // Email-verification state, written by CodeService. Same shape as `passwordReset` below: an
    // HMAC of the emailed code until `expiresAt`, `attempts` capping guesses against it, and
    // `sendCount`/`sendWindowStartedAt`/`lastSentAt` capping issuance. `login.verified` is the
    // outcome; this subtree is only the in-flight attempt.
    emailVerification: {
        codeHash: { type: String, default: null },
        expiresAt: { type: Date, default: null },
        attempts: { type: Number, default: 0 },
        lastSentAt: { type: Date, default: null },
        sendCount: { type: Number, default: 0 },
        sendWindowStartedAt: { type: Date, default: null }
    },
    // Password-reset state, written by CodeService. Only a hash of the emailed code
    // is stored, and only until `expiresAt`. Two counters cover two different abuses:
    // `attempts` caps guesses against a live code (the space is only 10^6), while
    // `sendCount`/`sendWindowStartedAt`/`lastSentAt` cap issuance so the endpoint can't be
    // used to flood an inbox. Null/0 is the resting state, not "unset".
    passwordReset: {
        codeHash: { type: String, default: null },
        expiresAt: { type: Date, default: null },
        attempts: { type: Number, default: 0 },
        lastSentAt: { type: Date, default: null },
        sendCount: { type: Number, default: 0 },
        sendWindowStartedAt: { type: Date, default: null }
    },
    roles: [{
        type: String,
        default: 'USER'
    }],
    profile: {
        fullName: {
            type: String,
            required: true,
            maxlength: CONTENT_LIMITS.USER.FULL_NAME_MAX_LENGTH
        },
        bio: {
            type: String,
            maxlength: CONTENT_LIMITS.USER.BIO_MAX_LENGTH,
            default: ''
        }
    },
    following: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    followers: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    likedNotes: [{
        type: Schema.Types.ObjectId,
        ref: 'Note'
    }],
    // Per-user feed personalization state. Deliberately bounded so total storage scales
    // O(users), independent of how many notes/tags/follows exist in the system:
    //  - tagAffinity / authorAffinity: small top-K preference maps, online-learned from likes
    //  - recentlySeen: capped ring buffer of recently served notes (powers "not seen in a while")
    feed: {
        tagAffinity: { type: Map, of: Number, default: () => ({}) },
        authorAffinity: { type: Map, of: Number, default: () => ({}) },
        recentlySeen: { type: [Schema.Types.ObjectId], default: () => [] }
    },
    // User-controlled preferences, namespaced by concern so non-email settings (theme,
    // locale) can be added without reshaping what is here.
    settings: {
        // Three groups the weekly digest has to satisfy: consent, deliverability, and schedule.
        email: {
            // Explicit `true` rather than an absent field, so the digest query is a plain
            // equality match and not "anything that isn't false".
            weeklyDigest: { type: Boolean, default: true },
            // See newUnsubscribeToken. Assigning a fresh one invalidates links already sent.
            unsubscribeToken: { type: String, default: newUnsubscribeToken },

            // Whether the address is still safe to send to. Mailing one that hard-bounces or
            // reports spam wrecks the sending domain's reputation, so bulk jobs have to filter
            // on this as well as on consent. The digest reads it; reserved for a bounce/complaint
            // handler to write.
            deliveryStatus: {
                type: String,
                enum: ['active', 'bounced', 'complained', 'suppressed'],
                default: 'active'
            },
            bounceCount: { type: Number, default: 0 },   // consecutive soft bounces
            lastBounceAt: { type: Date, default: null },

            // The digest goes out at 12AM UTC on `digestDay` (0 = Sunday, as Date#getUTCDay).
            // It defaults to the weekday the account is created on, which spreads sends across
            // the week.
            digestDay: {
                type: Number,
                min: 0,
                max: 6,
                default: () => new Date().getUTCDay()
            },
            // The next slot (12AM UTC on `digestDay`), denormalized so the job finds due users
            // with one index range scan, like Note.review.nextDueAt. Null while digests are off,
            // and until the job first schedules the account.
            nextDigestAt: { type: Date, default: null },
            // Last digest send. A send claims it together with `nextDigestAt` in one conditional
            // write, so a double-firing job or a second app instance never mails twice.
            lastDigestSentAt: { type: Date, default: null }
        }
    },
    dateCreated: {
        type: Date,
        default: Date.now
    }
});

// A text index allows for highly optimized text queries and supports text scoring.
// We apply weights to give priority: matches in fullName are prioritized over bio.
UserSchema.index(
    { 'profile.fullName': 'text', 'profile.bio': 'text' },
    { weights: { 'profile.fullName': 5, 'profile.bio': 1 } }
);

// Unsubscribe links are resolved by token alone, so that lookup needs an index. The partial
// filter scopes `unique` to documents that actually carry a token, so ones written before the
// field existed can't collide with each other on a missing value.
//
// NOTE: never put a TTL index on `emailVerification.expiresAt` or `passwordReset.expiresAt` —
// TTL deletes the whole *document*, which here is the user account. Expired code state is
// cleared by writing nulls over it.
UserSchema.index(
    { 'settings.email.unsubscribeToken': 1 },
    {
        unique: true,
        partialFilterExpression: { 'settings.email.unsubscribeToken': { $type: 'string' } }
    }
);

// The digest job's "whose slot has passed?" query.
UserSchema.index({ 'settings.email.nextDigestAt': 1 });

const User = model('User', UserSchema);
export default User;

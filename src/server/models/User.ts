import { Schema, model } from 'mongoose';
import { CONTENT_LIMITS } from '../settings';

const UserSchema = new Schema({
    login: {
        email: {
            type: String,
            required: true,
            unique: true,
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
        }
    },
    roles: [{
        type: String,
        default: 'USER'
    }],
    profile: {
        fullName: {
            type: String,
            required: true,
            maxlength: 100
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

const User = model('User', UserSchema);
export default User;

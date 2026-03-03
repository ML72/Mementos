import { Schema, model } from 'mongoose';
import { CONTENT_LIMITS } from '../settings';

const UserSchema = new Schema({
    fullName: {
        type: String,
        required: true,
        maxlength: 100
    },
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
    dateCreated: {
        type: Date,
        default: Date.now
    },
    following: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }]
});

const User = model('User', UserSchema);
export default User;

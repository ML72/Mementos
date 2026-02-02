import { Schema, model } from 'mongoose';

const UserSchema = new Schema({
    login: {
        email: {
            type: String,
            required: true,
            unique: true
        },
        password: {
            type: String,
            required: true
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
    }
});

const User = model('User', UserSchema);
export default User;

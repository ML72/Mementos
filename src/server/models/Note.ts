import { Schema, model } from 'mongoose';
import { CONTENT_LIMITS } from '../settings';

const NoteSchema = new Schema({
    creator: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    subject: {
        type: String,
        required: true,
        minlength: CONTENT_LIMITS.NOTE.SUBJECT_MIN_LENGTH,
        maxlength: CONTENT_LIMITS.NOTE.SUBJECT_MAX_LENGTH
    },
    tags: {
        type: [{
            type: String,
            minlength: CONTENT_LIMITS.NOTE.TAG_MIN_LENGTH,
            maxlength: CONTENT_LIMITS.NOTE.TAG_MAX_LENGTH
        }],
        default: [],
        validate: {
            validator: function(v: string[]) {
                return v.length <= CONTENT_LIMITS.NOTE.MAX_TAGS;
            },
            message: `Cannot exceed ${CONTENT_LIMITS.NOTE.MAX_TAGS} tags.`
        }
    },
    content: {
        type: String,
        required: true,
        minlength: CONTENT_LIMITS.NOTE.CONTENT_MIN_LENGTH,
        maxlength: CONTENT_LIMITS.NOTE.CONTENT_MAX_LENGTH
    },
    dateCreated: {
        type: Date,
        default: Date.now
    }
});

const Note = model('Note', NoteSchema);
export default Note;

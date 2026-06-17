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
    importance: {
        type: Number,
        min: 1,
        max: 10,
        default: 5
    },
    dateCreated: {
        type: Date,
        default: Date.now
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    // Spaced-repetition review state. Only a note's creator reviews their own note, so this
    // is one record per note (O(notes)), never O(users x notes). `nextDueAt` is a denormalized,
    // indexable "due time" so the feed can pull a user's most-overdue notes with one range scan.
    // New notes default to due-now (nextDueAt = creation time) so they enter review immediately.
    review: {
        lastReviewedAt: { type: Date, default: null },
        reviewCount: { type: Number, default: 0 },
        nextDueAt: { type: Date, default: Date.now }
    }
});

// Feed candidate-generation indexes:
//  - self / review track: a user's own notes ordered by how due they are (ascending nextDueAt)
//  - others / discovery track: most recent notes by a set of creators (also speeds getNotesByCreator)
NoteSchema.index({ creator: 1, 'review.nextDueAt': 1 });
NoteSchema.index({ creator: 1, dateCreated: -1 });

const Note = model('Note', NoteSchema);
export default Note;

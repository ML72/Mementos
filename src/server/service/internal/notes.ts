import { Note, User } from '../../models';
import { FEED } from '../../settings';
import { bumpAffinity, computeNextDueAt, ensureFeedMaps } from './feed';

export interface CreateNoteData {
    subject: string;
    content: string;
    tags?: string[];
    importance?: number;
}

export interface UpdateNoteData {
    subject?: string;
    content?: string;
    tags?: string[];
    importance?: number;
}

export interface NoteResult {
    success: boolean;
    note?: any;
    notes?: any[];
    error?: string;
}

class NotesService {
    async createNote(userId: string, noteData: CreateNoteData): Promise<NoteResult> {
        try {
            const note = new Note({
                creator: userId,
                subject: noteData.subject,
                content: noteData.content,
                tags: noteData.tags || [],
                importance: noteData.importance || 5
            });

            await note.save();
            return { success: true, note };
        } catch (error: any) {
            console.error('Create note error:', error.message);
            return { success: false, error: 'Server error: could not create note' };
        }
    }

    async getNoteById(userId: string, noteId: string): Promise<NoteResult> {
        try {
            const note = await Note.findById(noteId);
            if (!note) {
                return { success: false, error: 'Note not found' };
            }
            // Add any visibility checks if only author or followers can view (assuming public or follower view context)
            return { success: true, note };
        } catch (error: any) {
            console.error('Get note error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    async getNotesByCreator(creatorId: string): Promise<NoteResult> {
        try {
            const notes = await Note.find({
                creator: creatorId
            }).sort({ dateCreated: -1 });

            return { success: true, notes };
        } catch (error: any) {
            console.error('Get notes by creator error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    async updateNote(userId: string, noteId: string, updateData: UpdateNoteData): Promise<NoteResult> {
        try {
            const note = await Note.findById(noteId);
            if (!note) {
                return { success: false, error: 'Note not found' };
            }

            if (note.creator.toString() !== userId) {
                return { success: false, error: 'User not authorized to update this note' };
            }

            if (updateData.subject) note.subject = updateData.subject;
            if (updateData.content) note.content = updateData.content;
            if (updateData.tags) note.tags = updateData.tags;
            if (updateData.importance !== undefined) {
                note.importance = updateData.importance;
                // Importance changes the review spacing, so reschedule already-reviewed notes.
                // Never-reviewed notes stay due-now and are left untouched.
                if ((note.review?.reviewCount ?? 0) > 0 && note.review?.lastReviewedAt) {
                    note.review.nextDueAt = computeNextDueAt(
                        note.review.reviewCount!,
                        note.importance,
                        new Date(note.review.lastReviewedAt).getTime()
                    );
                }
            }
            note.lastUpdated = new Date();

            await note.save();
            return { success: true, note };
        } catch (error: any) {
            console.error('Update note error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    async deleteNote(userId: string, noteId: string): Promise<NoteResult> {
        try {
            const note = await Note.findById(noteId);
            if (!note) {
                return { success: false, error: 'Note not found' };
            }

            if (note.creator.toString() !== userId) {
                return { success: false, error: 'User not authorized to delete this note' };
            }

            await note.deleteOne();
            return { success: true };
        } catch (error: any) {
            console.error('Delete note error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    async likeNote(userId: string, noteId: string): Promise<NoteResult> {
        try {
            const user = await User.findById(userId);
            const note = await Note.findById(noteId);
            
            if (!user) return { success: false, error: 'User not found' };
            if (!note) return { success: false, error: 'Note not found' };

            // ObjectId comparison must use .equals(); Array.includes() compares by
            // reference and would treat re-fetched ids as distinct, allowing duplicates.
            if (!user.likedNotes.some(id => id.equals(note._id))) {
                user.likedNotes.push(note._id);

                // Online preference learning: a like is a strong positive signal for the
                // note's tags and its author. The maps are bounded, so storage stays O(users).
                ensureFeedMaps(user);
                bumpAffinity(user.feed!.tagAffinity as any, note.tags || [], FEED.AFFINITY.W_LIKE_TAG, {
                    maxEntries: FEED.AFFINITY.MAX_TAGS,
                    minScore: FEED.AFFINITY.MIN_SCORE,
                    decay: FEED.AFFINITY.DECAY
                });
                bumpAffinity(user.feed!.authorAffinity as any, [note.creator.toString()], FEED.AFFINITY.W_LIKE_AUTHOR, {
                    maxEntries: FEED.AFFINITY.MAX_AUTHORS,
                    minScore: FEED.AFFINITY.MIN_SCORE,
                    decay: FEED.AFFINITY.DECAY
                });
                user.markModified('feed.tagAffinity');
                user.markModified('feed.authorAffinity');

                await user.save();

                // Maintain the denormalized like counter on the note (atomic to avoid races).
                await Note.updateOne({ _id: note._id }, { $inc: { likeCount: 1 } });
            }

            return { success: true };
        } catch (error: any) {
            console.error('Like note error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    async unlikeNote(userId: string, noteId: string): Promise<NoteResult> {
        try {
            const user = await User.findById(userId);
            
            if (!user) return { success: false, error: 'User not found' };

            const wasLiked = user.likedNotes.some(id => id.toString() === noteId);
            user.likedNotes = user.likedNotes.filter(id => id.toString() !== noteId);

            if (wasLiked) {
                // Unwind the affinity contribution the original like added. No global decay
                // here so unliking is a clean reversal rather than another "event".
                const note = await Note.findById(noteId);
                if (note) {
                    ensureFeedMaps(user);
                    bumpAffinity(user.feed!.tagAffinity as any, note.tags || [], -FEED.AFFINITY.W_LIKE_TAG, {
                        maxEntries: FEED.AFFINITY.MAX_TAGS,
                        minScore: FEED.AFFINITY.MIN_SCORE
                    });
                    bumpAffinity(user.feed!.authorAffinity as any, [note.creator.toString()], -FEED.AFFINITY.W_LIKE_AUTHOR, {
                        maxEntries: FEED.AFFINITY.MAX_AUTHORS,
                        minScore: FEED.AFFINITY.MIN_SCORE
                    });
                    user.markModified('feed.tagAffinity');
                    user.markModified('feed.authorAffinity');

                    // Maintain the denormalized like counter (guarded so it never goes negative).
                    await Note.updateOne({ _id: note._id, likeCount: { $gt: 0 } }, { $inc: { likeCount: -1 } });
                }
            }

            await user.save();

            return { success: true };
        } catch (error: any) {
            console.error('Unlike note error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    async getLikedNotes(userId: string): Promise<NoteResult> {
        try {
            const user = await User.findById(userId).populate({
                path: 'likedNotes',
                populate: { path: 'creator', select: 'login.email profile.fullName' }
            });

            if (!user) return { success: false, error: 'User not found' };

            return { success: true, notes: user.likedNotes as any[] };
        } catch (error: any) {
            console.error('Get liked notes error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }
}

export default NotesService;

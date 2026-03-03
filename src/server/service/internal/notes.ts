import { Note, User } from '../../models';

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

    async getFeed(userId: string): Promise<NoteResult> {
        try {
            const currentUser = await User.findById(userId);
            if (!currentUser) {
                return { success: false, error: 'User not found' };
            }

            // Target user's own notes and their followed users' notes
            const authors = [userId, ...currentUser.following];
            
            const notes = await Note.find({
                creator: { $in: authors }
            }).sort({ dateCreated: -1 }).populate('creator', 'login.email fullName');

            return { success: true, notes };
        } catch (error: any) {
            console.error('Get feed error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    async getOwnNotes(userId: string): Promise<NoteResult> {
        try {
            const notes = await Note.find({
                creator: userId
            }).sort({ dateCreated: -1 });

            return { success: true, notes };
        } catch (error: any) {
            console.error('Get own notes error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    async updateNote(userId: string, noteId: string, updateData: UpdateNoteData): Promise<NoteResult> {
        try {
            let note = await Note.findById(noteId);
            if (!note) {
                return { success: false, error: 'Note not found' };
            }

            if (note.creator.toString() !== userId) {
                return { success: false, error: 'User not authorized to update this note' };
            }

            if (updateData.subject) note.subject = updateData.subject;
            if (updateData.content) note.content = updateData.content;
            if (updateData.tags) note.tags = updateData.tags;
            if (updateData.importance !== undefined) note.importance = updateData.importance;
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

            if (!user.likedNotes.includes(note._id)) {
                user.likedNotes.push(note._id);
                await user.save();
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

            user.likedNotes = user.likedNotes.filter(id => id.toString() !== noteId);
            await user.save();

            return { success: true };
        } catch (error: any) {
            console.error('Unlike note error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    async getLikedNotes(userId: string): Promise<NoteResult> {
        try {
            const user = await User.findById(userId).populate('likedNotes');
            
            if (!user) return { success: false, error: 'User not found' };

            return { success: true, notes: user.likedNotes as any[] };
        } catch (error: any) {
            console.error('Get liked notes error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }
}

export default NotesService;

import { Note, User } from '../../models';

export interface CreateNoteData {
    subject: string;
    content: string;
    tags?: string[];
}

export interface UpdateNoteData {
    subject?: string;
    content?: string;
    tags?: string[];
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
                tags: noteData.tags || []
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
}

export default NotesService;

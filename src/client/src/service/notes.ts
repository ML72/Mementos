import axios from 'axios';
import { setNewAlert, setApiErrorAlert } from './alert';

// Get own notes
export const getMyNotes = async (dispatch: any) => {
    try {
        const res = await axios.get('/api/notes/my');
        return res.data;
    } catch (err: any) {
        setApiErrorAlert(dispatch, err, 'Failed to fetch notes');
        return null;
    }
};

// Get a page of the personalized feed.
// Returns { notes, hasMore }. The feed is stateful: each call serves the next-best page
// and records impressions server-side, so calling again returns more (no page cursor needed).
export const getFeed = async (dispatch: any, limit?: number) => {
    try {
        const res = await axios.get('/api/notes', { params: limit ? { limit } : {} });
        return res.data;
    } catch (err: any) {
        setApiErrorAlert(dispatch, err, 'Failed to fetch feed');
        return null;
    }
};

// Get single note by id
export const getNoteById = async (dispatch: any, id: string) => {
    try {
        const res = await axios.get(`/api/notes/${id}`);
        return res.data;
    } catch (err: any) {
        setApiErrorAlert(dispatch, err, 'Failed to fetch note');
        return null;
    }
};

// Create a new note
export const createNote = async (
    dispatch: any,
    noteData: { subject: string; content: string; tags?: string[] }
) => {
    try {
        const res = await axios.post('/api/notes', noteData);
        setNewAlert(dispatch, { msg: 'Note created successfully', alertType: 'success' });
        return res.data;
    } catch (err: any) {
        setApiErrorAlert(dispatch, err, 'Failed to create note');
        return null;
    }
};

// Update a note
export const updateNote = async (
    dispatch: any,
    id: string,
    noteData: { subject: string; content: string; tags?: string[] }
) => {
    try {
        const res = await axios.put(`/api/notes/${id}`, noteData);
        setNewAlert(dispatch, { msg: 'Note updated successfully', alertType: 'success' });
        return res.data;
    } catch (err: any) {
        setApiErrorAlert(dispatch, err, 'Failed to update note');
        return null;
    }
};

// Delete a note
export const deleteNote = async (dispatch: any, id: string) => {
    try {
        await axios.delete(`/api/notes/${id}`);
        setNewAlert(dispatch, { msg: 'Note deleted successfully', alertType: 'success' });
        return true;
    } catch (err: any) {
        setApiErrorAlert(dispatch, err, 'Failed to delete note');
        return false;
    }
};

// Get a specific user's notes
export const getUserNotes = async (dispatch: any, userId: string) => {
    try {
        const res = await axios.get(`/api/notes/user/${userId}`);
        return res.data;
    } catch (err: any) {
        setApiErrorAlert(dispatch, err, 'Failed to fetch user notes');
        return null;
    }
};

// Like a note. Liking also feeds the feed-ranking preference model (tags + author).
// No success alert: the toggled heart is the feedback. Returns true on success.
export const likeNote = async (dispatch: any, id: string): Promise<boolean> => {
    try {
        await axios.post(`/api/notes/${id}/like`);
        return true;
    } catch (err: any) {
        setApiErrorAlert(dispatch, err, 'Failed to like note');
        return false;
    }
};

// Unlike a note. Returns true on success.
export const unlikeNote = async (dispatch: any, id: string): Promise<boolean> => {
    try {
        await axios.post(`/api/notes/${id}/unlike`);
        return true;
    } catch (err: any) {
        setApiErrorAlert(dispatch, err, 'Failed to unlike note');
        return false;
    }
};

// Get the current user's liked notes (used to seed liked state in the UI).
export const getLikedNotes = async (dispatch: any) => {
    try {
        const res = await axios.get('/api/notes/liked');
        return res.data;
    } catch (err: any) {
        setApiErrorAlert(dispatch, err, 'Failed to fetch liked notes');
        return null;
    }
};

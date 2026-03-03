import axios from 'axios';
import { setNewAlert } from './alert';

// Get own notes
export const getMyNotes = async (dispatch: any) => {
    try {
        const res = await axios.get('/api/notes/my');
        return res.data;
    } catch (err: any) {
        let msg = 'Failed to fetch notes';
        if (err.response && err.response.data && err.response.data.errors) {
            msg = err.response.data.errors.map((e: any) => e.msg).join(', ');
        }
        setNewAlert(dispatch, { msg, alertType: 'error' });
        return null;
    }
};

// Get feed notes
export const getFeed = async (dispatch: any) => {
    try {
        const res = await axios.get('/api/notes');
        return res.data;
    } catch (err: any) {
        let msg = 'Failed to fetch feed';
        if (err.response && err.response.data && err.response.data.errors) {
            msg = err.response.data.errors.map((e: any) => e.msg).join(', ');
        }
        setNewAlert(dispatch, { msg, alertType: 'error' });
        return null;
    }
};

// Get single note by id
export const getNoteById = async (dispatch: any, id: string) => {
    try {
        const res = await axios.get(`/api/notes/${id}`);
        return res.data;
    } catch (err: any) {
        const msg = (err.response?.data?.errors?.[0]?.msg) || 'Failed to fetch note';
        setNewAlert(dispatch, { msg, alertType: 'error' });
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
        const errors = err.response?.data?.errors;
        let msg = 'Failed to create note';
        if (errors) {
            msg = errors.map((e: any) => e.msg).join(', ');
        }
        setNewAlert(dispatch, { msg, alertType: 'error' });
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
        const errors = err.response?.data?.errors;
        let msg = 'Failed to update note';
        if (errors) {
            msg = errors.map((e: any) => e.msg).join(', ');
        }
        setNewAlert(dispatch, { msg, alertType: 'error' });
        return null;
    }
};

// Delete a note
export const deleteNote = async (dispatch: any, id: string) => {
    try {
        const res = await axios.delete(`/api/notes/${id}`);
        setNewAlert(dispatch, { msg: 'Note deleted successfully', alertType: 'success' });
        return true;
    } catch (err: any) {
        const errors = err.response?.data?.errors;
        let msg = 'Failed to delete note';
        if (errors) {
            msg = errors.map((e: any) => e.msg).join(', ');
        }
        setNewAlert(dispatch, { msg, alertType: 'error' });
        return false;
    }
};

// Get a specific user's notes
export const getUserNotes = async (dispatch: any, userId: string) => {
    try {
        const res = await axios.get(`/api/notes/user/${userId}`);
        return res.data;
    } catch (err: any) {
        let msg = 'Failed to fetch user notes';
        if (err.response && err.response.data && err.response.data.errors) {
            msg = err.response.data.errors.map((e: any) => e.msg).join(', ');
        }
        setNewAlert(dispatch, { msg, alertType: 'error' });
        return null;
    }
};

import { Request, Response, Router } from 'express';
import { check, validationResult } from 'express-validator';
import { privateAccess } from '../middleware';
import { NotesService } from '../service';
import { sendError } from '../util';

const router = Router();
const notesService = new NotesService();

// @route GET api/notes
// @desc get feed of notes (own + followed users)
// @access private
router.get('/', privateAccess, async (req: Request, res: Response) => {
    try {
        const result = await notesService.getFeed(req.user!.id);
        
        if (!result.success) {
            sendError(res, 400, result.error || 'Failed to fetch notes');
            return;
        }

        res.json(result.notes);
    } catch(err: any) {
        console.error(err.message);
        sendError(res, 500, 'Server Error - Please try again');
    }
});

// @route GET api/notes/my
// @desc get current user's notes
// @access private
router.get('/my', privateAccess, async (req: Request, res: Response) => {
    try {
        const result = await notesService.getOwnNotes(req.user!.id);
        
        if (!result.success) {
            sendError(res, 400, result.error || 'Failed to fetch notes');
            return;
        }

        res.json(result.notes);
    } catch(err: any) {
        console.error(err.message);
        sendError(res, 500, 'Server Error - Please try again');
    }
});

// @route GET api/notes/:id
// @desc get a note by id
// @access private
router.get('/:id', privateAccess, async (req: Request, res: Response) => {
    try {
        const result = await notesService.getNoteById(req.user!.id, req.params.id);
        
        if (!result.success) {
            sendError(res, 404, result.error || 'Note not found');
            return;
        }

        res.json(result.note);
    } catch(err: any) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            sendError(res, 404, 'Note not found');
            return;
        }
        sendError(res, 500, 'Server Error - Please try again');
    }
});

// @route POST api/notes
// @desc create a new note
// @access private
router.post('/', [
    privateAccess,
    check('subject', 'Subject is required').not().isEmpty(),
    check('content', 'Content is required').not().isEmpty()
], async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        sendError(res, 400, errors.array().map(e => e.msg));
        return;
    }

    try {
        const { subject, content, tags } = req.body;
        const result = await notesService.createNote(req.user!.id, { subject, content, tags });

        if (!result.success) {
            sendError(res, 400, result.error || 'Failed to create note');
            return;
        }

        res.json(result.note);
    } catch(err: any) {
        console.error(err.message);
        sendError(res, 500, 'Server Error - Please try again');
    }
});

// @route PUT api/notes/:id
// @desc update a note by id
// @access private
router.put('/:id', privateAccess, async (req: Request, res: Response) => {
    try {
        const { subject, content, tags } = req.body;
        const result = await notesService.updateNote(req.user!.id, req.params.id, { subject, content, tags });

        if (!result.success) {
            sendError(res, 400, result.error || 'Failed to update note');
            return;
        }

        res.json(result.note);
    } catch(err: any) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            sendError(res, 404, 'Note not found');
            return;
        }
        sendError(res, 500, 'Server Error - Please try again');
    }
});

// @route DELETE api/notes/:id
// @desc delete a note by id
// @access private
router.delete('/:id', privateAccess, async (req: Request, res: Response) => {
    try {
        const result = await notesService.deleteNote(req.user!.id, req.params.id);

        if (!result.success) {
            sendError(res, 400, result.error || 'Failed to delete note');
            return;
        }

        res.json({ msg: 'Note removed' });
    } catch(err: any) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            sendError(res, 404, 'Note not found');
            return;
        }
        sendError(res, 500, 'Server Error - Please try again');
    }
});

export default router;

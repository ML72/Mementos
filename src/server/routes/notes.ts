import { Request, Response, Router } from 'express';
import { check, validationResult, query as expressQuery } from 'express-validator';
import { privateAccess } from '../middleware';
import { NotesService, FeedService } from '../service';
import { sendError } from '../util';
import { FEED } from '../settings';

const router = Router();
const notesService = new NotesService();
const feedService = new FeedService();

// @route GET api/notes
// @desc get the personalized feed (spaced-repetition review of own notes blended with
//       a freshness/affinity-ranked discovery feed from followed users). See
//       docs/ALGORITHM_FEED.md. Stateful, cursorless pagination: each call serves the
//       next-best page and records impressions, so calling again returns more.
// @access private
router.get('/', privateAccess, [
    expressQuery('limit')
        .optional()
        .isInt({ min: 1, max: FEED.PAGE_SIZE_MAX })
        .toInt()
], async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        sendError(res, 400, errors.array().map(e => e.msg));
        return;
    }

    try {
        let limit = FEED.PAGE_SIZE_DEFAULT;
        if (req.query.limit !== undefined && !Number.isNaN(Number(req.query.limit))) {
            limit = Number(req.query.limit);
        }

        const result = await feedService.getFeed(req.user!.id, limit);

        if (!result.success) {
            sendError(res, 400, result.error || 'Failed to fetch notes');
            return;
        }

        res.json({ notes: result.notes, hasMore: result.hasMore });
    } catch(err: any) {
        console.error(err.message);
        sendError(res, 500, 'Server Error - Please try again');
    }
});

// @route GET api/notes/liked
// @desc get current user's liked notes
// @access private
router.get('/liked', privateAccess, async (req: Request, res: Response) => {
    try {
        const result = await notesService.getLikedNotes(req.user!.id);
        
        if (!result.success) {
            sendError(res, 400, result.error || 'Failed to fetch liked notes');
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
        const result = await notesService.getNotesByCreator(req.user!.id);

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

// @route GET api/notes/user/:id
// @desc get a specific user's notes
// @access private
router.get('/user/:id', privateAccess, async (req: Request, res: Response) => {
    try {
        const result = await notesService.getNotesByCreator(req.params.id);

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
        const { subject, content, tags, importance } = req.body;
        const result = await notesService.createNote(req.user!.id, { subject, content, tags, importance });

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
        const { subject, content, tags, importance } = req.body;
        const result = await notesService.updateNote(req.user!.id, req.params.id, { subject, content, tags, importance });

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

// @route POST api/notes/:id/like
// @desc like a note
// @access private
router.post('/:id/like', privateAccess, async (req: Request, res: Response) => {
    try {
        const result = await notesService.likeNote(req.user!.id, req.params.id);
        
        if (!result.success) {
            sendError(res, 400, result.error || 'Failed to like note');
            return;
        }

        res.json({ msg: 'Note liked' });
    } catch(err: any) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            sendError(res, 404, 'Note not found');
            return;
        }
        sendError(res, 500, 'Server Error - Please try again');
    }
});

// @route POST api/notes/:id/unlike
// @desc unlike a note
// @access private
router.post('/:id/unlike', privateAccess, async (req: Request, res: Response) => {
    try {
        const result = await notesService.unlikeNote(req.user!.id, req.params.id);
        
        if (!result.success) {
            sendError(res, 400, result.error || 'Failed to unlike note');
            return;
        }

        res.json({ msg: 'Note unliked' });
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

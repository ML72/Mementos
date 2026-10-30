import { Request, Response, Router } from 'express';
import { check, validationResult, query as expressQuery } from 'express-validator';
import { privateAccess } from '../middleware';
import { NotesService, FeedService } from '../service';
import { sendError } from '../util';
import { CONTENT_LIMITS, FEED } from '../settings';

const router = Router();
const notesService = new NotesService();
const feedService = new FeedService();

const { SUBJECT_MAX_LENGTH, CONTENT_MAX_LENGTH, MAX_TAGS, TAG_MAX_LENGTH } = CONTENT_LIMITS.NOTE;

/** A tag quoted back in an error message, cut short so a runaway one can't flood the alert. */
const quoteTag = (tag: string): string => `"${tag.length > 40 ? `${tag.slice(0, 40)}…` : tag}"`;

/**
 * The rules for a note's fields, with messages that say what to fix: the client shows them as
 * they are. They repeat the Note schema's limits so a bad note is told exactly what is wrong,
 * where a failed save could only report a server error. Lengths are counted as the schema counts
 * them (`String#length`). When updating, a field may be left out, but one that is sent must be
 * valid.
 */
const noteChecks = (partial: boolean) => {
    const field = (path: string) => (partial ? check(path).optional() : check(path));
    return [
        field('subject')
            .notEmpty().withMessage('Subject is required').bail()
            .isString().withMessage('Subject must be text').bail()
            .custom((subject: string) => subject.length <= SUBJECT_MAX_LENGTH)
            .withMessage((subject: string) =>
                `Subject must be at most ${SUBJECT_MAX_LENGTH} characters (it is ${subject.length})`),
        field('content')
            .notEmpty().withMessage('Content is required').bail()
            .isString().withMessage('Content must be text').bail()
            .custom((content: string) => content.length <= CONTENT_MAX_LENGTH)
            .withMessage((content: string) =>
                `Content must be at most ${CONTENT_MAX_LENGTH.toLocaleString('en-US')} characters ` +
                `(it is ${content.length.toLocaleString('en-US')})`),
        check('tags')
            .optional({ values: 'null' })
            .isArray().withMessage('Tags must be a list').bail()
            .isArray({ max: MAX_TAGS })
            .withMessage((tags: unknown[]) => `A note can have at most ${MAX_TAGS} tags (it has ${tags.length})`),
        check('tags.*')
            .isString().withMessage('Each tag must be text').bail()
            .notEmpty().withMessage('Tags cannot be empty').bail()
            .custom((tag: string) => tag.length <= TAG_MAX_LENGTH)
            .withMessage((tag: string) =>
                `Tag ${quoteTag(tag)} is too long: tags can be at most ${TAG_MAX_LENGTH} characters`),
        check('importance')
            .optional({ values: 'null' })
            .isFloat({ min: 1, max: 10 }).withMessage('Importance must be a number from 1 to 10')
    ];
};

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
    ...noteChecks(false)
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
router.put('/:id', [
    privateAccess,
    ...noteChecks(true)
], async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        sendError(res, 400, errors.array().map(e => e.msg));
        return;
    }

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

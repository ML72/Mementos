import { describe, it, expect } from '@jest/globals';
import {
    intervalHours,
    computeNextDueAt,
    scoreSelf,
    scoreOther,
    bumpAffinity,
    interleave,
    declumpByAuthor,
    blend
} from '../../src/server/service/internal/feed';
import { FEED } from '../../src/server/settings';

// Pure-function unit tests for the feed algorithm. No database required; every
// time-dependent helper takes an explicit `nowMs`, so the tests are deterministic.

const HOUR = 3600 * 1000;
const NOW = 1_700_000_000_000; // fixed reference instant

describe('Feed algorithm — pure helpers', () => {

    describe('intervalHours (spaced-repetition spacing)', () => {
        it('expands geometrically with the number of reviews', () => {
            const i1 = intervalHours(1, 5);
            const i2 = intervalHours(2, 5);
            const i3 = intervalHours(3, 5);
            expect(i2).toBeGreaterThan(i1);
            expect(i3).toBeGreaterThan(i2);
            // growth factor matches SPACING_GROWTH
            expect(i2 / i1).toBeCloseTo(FEED.REVIEW.SPACING_GROWTH);
        });

        it('shortens the interval for more important notes', () => {
            expect(intervalHours(1, 10)).toBeLessThan(intervalHours(1, 1));
        });
    });

    describe('computeNextDueAt', () => {
        it('schedules the next review in the future', () => {
            const due = computeNextDueAt(1, 5, NOW).getTime();
            expect(due).toBeGreaterThan(NOW);
            expect(due - NOW).toBeCloseTo(intervalHours(1, 5) * HOUR, -3);
        });
    });

    describe('scoreSelf (review priority = importance × overdueness)', () => {
        const selfNote = (importance: number, dueOffsetHours: number, reviewCount = 1) => ({
            importance,
            dateCreated: new Date(NOW),
            review: { reviewCount, lastReviewedAt: new Date(NOW), nextDueAt: new Date(NOW + dueOffsetHours * HOUR) }
        });

        it('equals importance exactly at the due time', () => {
            expect(scoreSelf(selfNote(8, 0), NOW)).toBeCloseTo(8);
        });

        it('ranks an overdue note above one that is not yet due', () => {
            const overdue = scoreSelf(selfNote(5, -100), NOW);   // due 100h ago
            const notYetDue = scoreSelf(selfNote(5, +100), NOW); // due in 100h
            expect(overdue).toBeGreaterThan(notYetDue);
        });

        it('caps the overdue multiplier so ancient notes cannot dominate forever', () => {
            const ancient = scoreSelf(selfNote(4, -1_000_000), NOW);
            expect(ancient).toBeLessThanOrEqual(4 * FEED.REVIEW.OVERDUE_CAP + 1e-9);
        });

        it('lets a high overdue low-importance note outrank a fresh high-importance one', () => {
            const overdueLow = scoreSelf(selfNote(3, -1000), NOW);
            const freshHigh = scoreSelf(selfNote(10, +50), NOW);
            expect(overdueLow).toBeGreaterThan(freshHigh);
        });
    });

    describe('scoreOther (discovery = importance × freshness × affinity)', () => {
        const otherNote = (overrides: any = {}) => ({
            importance: 5,
            dateCreated: new Date(NOW),
            tags: ['physics'],
            creator: 'author1',
            ...overrides
        });
        const empty = () => new Map<string, number>();

        it('prefers fresher notes', () => {
            const fresh = scoreOther(otherNote(), NOW, empty(), empty(), new Set());
            const old = scoreOther(otherNote({ dateCreated: new Date(NOW - 10 * 24 * HOUR) }), NOW, empty(), empty(), new Set());
            expect(fresh).toBeGreaterThan(old);
        });

        it('boosts notes whose tags the user likes', () => {
            const base = scoreOther(otherNote(), NOW, empty(), empty(), new Set());
            const boosted = scoreOther(otherNote(), NOW, new Map([['physics', 10]]), empty(), new Set());
            expect(boosted).toBeGreaterThan(base);
        });

        it('boosts notes from authors the user likes and from followed authors', () => {
            const base = scoreOther(otherNote(), NOW, empty(), empty(), new Set());
            const likedAuthor = scoreOther(otherNote(), NOW, empty(), new Map([['author1', 10]]), new Set());
            const followed = scoreOther(otherNote(), NOW, empty(), empty(), new Set(['author1']));
            expect(likedAuthor).toBeGreaterThan(base);
            expect(followed).toBeGreaterThan(base);
        });
    });

    describe('bumpAffinity (bounded online learning)', () => {
        it('accumulates weight for engaged keys', () => {
            const m = new Map<string, number>();
            bumpAffinity(m, ['a'], 2, { maxEntries: 10, minScore: 0.05 });
            expect(m.get('a')).toBeCloseTo(2);
        });

        it('keeps only the top-K entries by score', () => {
            const m = new Map<string, number>();
            bumpAffinity(m, ['a'], 1, { maxEntries: 2, minScore: 0.05 });
            bumpAffinity(m, ['b'], 2, { maxEntries: 2, minScore: 0.05 });
            bumpAffinity(m, ['c'], 3, { maxEntries: 2, minScore: 0.05 });
            expect(m.size).toBe(2);
            expect(m.has('c')).toBe(true);
            expect(m.has('b')).toBe(true);
            expect(m.has('a')).toBe(false);
        });

        it('decays existing entries to fade stale preferences', () => {
            const m = new Map<string, number>([['a', 10]]);
            bumpAffinity(m, ['b'], 1, { maxEntries: 10, minScore: 0.05, decay: 0.5 });
            expect(m.get('a')).toBeCloseTo(5);
            expect(m.get('b')).toBeCloseTo(1);
        });

        it('evicts entries that decay below minScore', () => {
            const m = new Map<string, number>([['a', 0.1]]);
            bumpAffinity(m, [], 0, { maxEntries: 10, minScore: 0.05, decay: 0.1 });
            expect(m.has('a')).toBe(false);
        });

        it('clamps at zero and removes a key on a large negative adjustment (unlike)', () => {
            const m = new Map<string, number>([['a', 1]]);
            bumpAffinity(m, ['a'], -5, { maxEntries: 10, minScore: 0.05 });
            expect(m.has('a')).toBe(false);
        });
    });

    describe('declumpByAuthor / interleave (diversity + blending)', () => {
        it('separates adjacent same-author notes when possible', () => {
            const out = declumpByAuthor([
                { _id: 1, creator: 'x' },
                { _id: 2, creator: 'x' },
                { _id: 3, creator: 'y' }
            ]);
            expect(out[0].creator).not.toBe(out[1].creator);
            expect(out[1].creator).not.toBe(out[2].creator);
        });

        it('interleaves both tracks preserving each item exactly once', () => {
            const self = [{ _id: 's1', creator: 'me' }, { _id: 's2', creator: 'me' }];
            const others = [
                { _id: 'o1', creator: 'a' }, { _id: 'o2', creator: 'b' },
                { _id: 'o3', creator: 'c' }, { _id: 'o4', creator: 'd' }
            ];
            const merged = interleave(self, others);
            expect(merged.length).toBe(6);
            expect(merged.filter(n => n.creator === 'me').length).toBe(2);
            expect(new Set(merged.map(n => n._id)).size).toBe(6);
        });
    });

    describe('blend (self-review quota)', () => {
        const self = (n: number) => Array.from({ length: n }, (_, i) => ({ _id: `s${i}`, creator: 'me' }));
        const others = (n: number) => Array.from({ length: n }, (_, i) => ({ _id: `o${i}`, creator: `a${i}` }));
        const countSelf = (page: any[]) => page.filter(x => x.creator === 'me').length;

        it('targets ~40% self and always clears the 25% floor when content is plentiful', () => {
            // Both tracks have more than their target, so no backfill kicks in.
            const page = blend(self(10), others(20), 20, true);
            expect(page.length).toBe(20);
            expect(countSelf(page)).toBe(Math.round(FEED.SELF_TARGET_RATIO * 20)); // 8
            expect(countSelf(page)).toBeGreaterThanOrEqual(Math.ceil(FEED.SELF_MIN_RATIO * 20)); // >= 5
        });

        it('backfills with own notes when there is little to learn from others', () => {
            const page = blend(self(10), others(2), 10, true);
            expect(page.length).toBe(10);
            expect(countSelf(page)).toBe(8); // 2 others + 8 self
        });

        it('guarantees at least one self note at tiny page sizes when the floor applies', () => {
            const page = blend(self(5), others(5), 1, true);
            expect(page.length).toBe(1);
            expect(countSelf(page)).toBe(1);
        });

        it('does not force a self note for a brand-new user (floor disabled)', () => {
            const page = blend(self(5), others(5), 1, false);
            expect(page.length).toBe(1);
            expect(countSelf(page)).toBe(0);
        });
    });
});

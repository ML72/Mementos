import { Note, User } from '../../models';
import { FEED } from '../../settings';

export interface FeedResult {
    success: boolean;
    notes?: any[];
    hasMore?: boolean;
    error?: string;
}

const HOUR_MS = 3600 * 1000;

// ---------------------------------------------------------------------------
// Pure, side-effect-free helpers (exported for unit testing).
// Every time-dependent helper takes `nowMs` explicitly so it stays deterministic.
// ---------------------------------------------------------------------------

/**
 * Target spacing (hours) before an own note should resurface for review.
 * Inspired by Leitner boxes / SM-2: the interval expands geometrically with the
 * number of reviews, while importance modulates it (important notes recur sooner).
 */
export function intervalHours(reviewCount: number, importance: number): number {
    const exponent = Math.max(0, Math.min(reviewCount - 1, FEED.REVIEW.MAX_BOX));
    // importance 10 -> shorter interval (~0.5x at strength 0.5); importance 1 -> longer (~1.5x).
    const importanceFactor = 1 - FEED.REVIEW.IMPORTANCE_STRENGTH * (importance - 5.5) / 4.5;
    return FEED.REVIEW.BASE_INTERVAL_HOURS * Math.pow(FEED.REVIEW.SPACING_GROWTH, exponent) * importanceFactor;
}

/** Denormalized next-due timestamp, persisted on the note after each review. */
export function computeNextDueAt(reviewCount: number, importance: number, fromMs: number): Date {
    return new Date(fromMs + intervalHours(reviewCount, importance) * HOUR_MS);
}

const creatorIdOf = (note: any): string => (note.creator?._id ?? note.creator).toString();

/**
 * Review priority for a user's own note: importance x how overdue it is.
 * `factor` is 1 exactly at the due time, <1 before it (recently reviewed), and grows
 * when overdue, capped so an ancient note can't dominate the feed forever.
 */
export function scoreSelf(note: any, nowMs: number): number {
    const reviewCount = note.review?.reviewCount ?? 0;
    const importance = note.importance ?? 5;
    const dueMs = note.review?.nextDueAt
        ? new Date(note.review.nextDueAt).getTime()
        : new Date(note.dateCreated).getTime();
    const yardstickMs = intervalHours(Math.max(1, reviewCount), importance) * HOUR_MS;
    const overdue = (nowMs - dueMs) / yardstickMs;
    const factor = Math.max(0, Math.min(overdue + 1, FEED.REVIEW.OVERDUE_CAP));
    return importance * factor;
}

/**
 * Discovery priority for someone else's note: importance x freshness x affinity.
 * - freshness: exponential time decay on creation date (EdgeRank-style time term)
 * - affinity : 1 + learned tag affinity + learned author affinity + follow bonus
 */
export function scoreOther(
    note: any,
    nowMs: number,
    tagAffinity: Map<string, number>,
    authorAffinity: Map<string, number>,
    followingSet: Set<string>
): number {
    const importance = note.importance ?? 5;
    const ageHours = Math.max(0, (nowMs - new Date(note.dateCreated).getTime()) / HOUR_MS);
    const freshness = Math.exp(-ageHours / FEED.DISCOVERY.FRESHNESS_TAU_HOURS);

    let tagSum = 0;
    for (const tag of (note.tags || [])) tagSum += tagAffinity.get(tag) || 0;
    const tagComponent = tagSum > 0 ? tagSum / (tagSum + FEED.DISCOVERY.TAG_NORM) : 0;

    const authorId = creatorIdOf(note);
    const authorScore = authorAffinity.get(authorId) || 0;
    const authorComponent = authorScore > 0 ? authorScore / (authorScore + FEED.DISCOVERY.AUTHOR_NORM) : 0;

    const followComponent = followingSet.has(authorId) ? FEED.DISCOVERY.FOLLOW_BONUS : 0;

    const affinity = 1
        + FEED.DISCOVERY.TAG_AFFINITY_WEIGHT * tagComponent
        + FEED.DISCOVERY.AUTHOR_AFFINITY_WEIGHT * authorComponent
        + followComponent;

    return (importance / 10) * freshness * affinity;
}

/**
 * Online-learning update for a bounded preference map (tag->score or author->score).
 * An optional global decay fades stale preferences (recency bias), then the map is
 * capped to `maxEntries` by score so per-user storage stays O(maxEntries).
 */
export function bumpAffinity(
    map: Map<string, number>,
    keys: string[],
    weight: number,
    opts: { maxEntries: number; minScore: number; decay?: number }
): void {
    if (opts.decay && opts.decay < 1) {
        for (const [key, value] of map) {
            const decayed = value * opts.decay;
            if (decayed < opts.minScore) map.delete(key);
            else map.set(key, decayed);
        }
    }
    for (const key of keys) {
        const next = Math.max(0, (map.get(key) || 0) + weight);
        if (next < opts.minScore) map.delete(key);
        else map.set(key, next);
    }
    if (map.size > opts.maxEntries) {
        const top = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, opts.maxEntries);
        map.clear();
        for (const [key, value] of top) map.set(key, value);
    }
}

/** Best-effort diversity: if two adjacent notes share an author, swap a later one forward. */
export function declumpByAuthor(notes: any[]): any[] {
    for (let i = 1; i < notes.length; i++) {
        if (creatorIdOf(notes[i]) !== creatorIdOf(notes[i - 1])) continue;
        for (let j = i + 1; j < notes.length; j++) {
            if (creatorIdOf(notes[j]) !== creatorIdOf(notes[i - 1])) {
                [notes[i], notes[j]] = [notes[j], notes[i]];
                break;
            }
        }
    }
    return notes;
}

/** Ratio-merge two ranked lists (preserving each list's order), then de-clump by author. */
export function interleave(selfNotes: any[], otherNotes: any[]): any[] {
    const merged: any[] = [];
    let si = 0;
    let oi = 0;
    const total = selfNotes.length + otherNotes.length;
    while (merged.length < total) {
        const selfFraction = selfNotes.length ? si / selfNotes.length : 1;
        const otherFraction = otherNotes.length ? oi / otherNotes.length : 1;
        if (oi >= otherNotes.length || (si < selfNotes.length && selfFraction <= otherFraction)) {
            merged.push(selfNotes[si++]);
        } else {
            merged.push(otherNotes[oi++]);
        }
    }
    return declumpByAuthor(merged);
}

/**
 * Blend the two ranked tracks into a single page, enforcing the self-review floor.
 * Each input track is already ordered best-first; the result is in display order.
 */
export function blend(selfRanked: any[], otherRanked: any[], limit: number, enforceSelfFloor: boolean): any[] {
    const selfFloor = enforceSelfFloor ? Math.ceil(FEED.SELF_MIN_RATIO * limit) : 0;
    const selfTarget = Math.max(selfFloor, Math.round(FEED.SELF_TARGET_RATIO * limit));

    let selfTake = Math.min(selfTarget, selfRanked.length);
    let otherTake = Math.min(limit - selfTake, otherRanked.length);

    // Backfill any unused capacity from whichever track still has candidates.
    let remaining = limit - selfTake - otherTake;
    if (remaining > 0) {
        const extraSelf = Math.min(remaining, selfRanked.length - selfTake);
        selfTake += extraSelf;
        remaining -= extraSelf;
        otherTake += Math.min(remaining, otherRanked.length - otherTake);
    }

    return interleave(selfRanked.slice(0, selfTake), otherRanked.slice(0, otherTake));
}

/** Defensive initializer: guarantees a user doc has usable feed maps/arrays to mutate. */
export function ensureFeedMaps(user: any): void {
    if (!user.feed) user.feed = {} as any;
    if (!(user.feed.tagAffinity instanceof Map)) user.feed.tagAffinity = new Map();
    if (!(user.feed.authorAffinity instanceof Map)) user.feed.authorAffinity = new Map();
    if (!Array.isArray(user.feed.recentlySeen)) user.feed.recentlySeen = [];
}

// ---------------------------------------------------------------------------
// FeedService
// ---------------------------------------------------------------------------

class FeedService {
    /**
     * Build a personalized page of the feed and record what was served.
     *
     * Two-stage recommender:
     *   1. Candidate generation  - two bounded, index-backed queries (self + others)
     *   2. Ranking               - score each track; prefer not-recently-seen notes
     *   3. Blend                 - interleave the tracks under a self-review quota
     * See docs/ALGORITHM_FEED.md for the full design.
     */
    async getFeed(userId: string, limit: number): Promise<FeedResult> {
        try {
            const user = await User.findById(userId).select('following feed');
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            const nowMs = Date.now();
            const tagAffinity: Map<string, number> = (user.feed?.tagAffinity as any) ?? new Map();
            const authorAffinity: Map<string, number> = (user.feed?.authorAffinity as any) ?? new Map();
            const recentlySeen: any[] = (user.feed?.recentlySeen as any[]) ?? [];
            const followingIds: any[] = user.following ?? [];
            const followingSet = new Set(followingIds.map(id => id.toString()));

            // recentlySeen is ordered most-recent-first; map id -> ring age (0 = most recent).
            const seenIndex = new Map<string, number>();
            recentlySeen.forEach((id, i) => seenIndex.set(id.toString(), i));

            // --- Stage 1: candidate generation (bounded + index-backed) ---
            const selfPool = await Note.find({ creator: userId })
                .sort({ 'review.nextDueAt': 1 })
                .limit(FEED.CANDIDATE_POOL);

            const otherPool = followingIds.length
                ? await Note.find({ creator: { $in: followingIds } })
                    .sort({ dateCreated: -1 })
                    .limit(FEED.CANDIDATE_POOL)
                : [];

            // --- Stage 2: ranking (prefer unseen; reuse least-recently-seen as fallback) ---
            const selfRanked = this.rankTrack(selfPool, note => scoreSelf(note, nowMs), seenIndex);
            const otherRanked = this.rankTrack(
                otherPool,
                note => scoreOther(note, nowMs, tagAffinity, authorAffinity, followingSet),
                seenIndex
            );

            // --- Stage 3: blend under the self-review floor ---
            const enforceSelfFloor = selfPool.length >= FEED.MIN_NOTES_FOR_SELF_QUOTA;
            const page = blend(selfRanked, otherRanked, limit, enforceSelfFloor);

            // Record impressions, then populate creators for just the served page.
            await this.recordServed(userId, page, recentlySeen, nowMs);
            await Note.populate(page, { path: 'creator', select: 'login.email profile.fullName' });

            const hasMore = (selfRanked.length + otherRanked.length) > page.length;
            return { success: true, notes: page, hasMore };
        } catch (error: any) {
            console.error('Get feed error:', error.message);
            return { success: false, error: 'Server error' };
        }
    }

    /**
     * Order a candidate pool: not-recently-seen notes first (by score, descending), then
     * already-seen notes (oldest sighting first) so the longest-unseen ones return earliest.
     */
    private rankTrack(pool: any[], scoreFn: (n: any) => number, seenIndex: Map<string, number>): any[] {
        const scored = pool.map(note => {
            const id = note._id.toString();
            return {
                note,
                score: scoreFn(note),
                ringAge: seenIndex.has(id) ? seenIndex.get(id)! : -1
            };
        });
        const unseen = scored.filter(x => x.ringAge < 0).sort((a, b) => b.score - a.score);
        const seen = scored.filter(x => x.ringAge >= 0).sort((a, b) => b.ringAge - a.ringAge);
        return [...unseen, ...seen].map(x => x.note);
    }

    /**
     * Advance spaced-repetition state for served own-notes (gap-guarded against refresh-spam)
     * and push every served note onto the recently-seen ring.
     */
    private async recordServed(userId: string, page: any[], recentlySeen: any[], nowMs: number): Promise<void> {
        const minGapMs = FEED.REVIEW.MIN_REVIEW_GAP_HOURS * HOUR_MS;
        const ops: any[] = [];
        for (const note of page) {
            if (creatorIdOf(note) !== userId.toString()) continue;
            const last = note.review?.lastReviewedAt ? new Date(note.review.lastReviewedAt).getTime() : 0;
            if (nowMs - last < minGapMs) continue;
            const reviewCount = (note.review?.reviewCount ?? 0) + 1;
            ops.push({
                updateOne: {
                    filter: { _id: note._id },
                    update: {
                        $set: {
                            'review.lastReviewedAt': new Date(nowMs),
                            'review.reviewCount': reviewCount,
                            'review.nextDueAt': computeNextDueAt(reviewCount, note.importance ?? 5, nowMs)
                        }
                    }
                }
            });
        }
        if (ops.length) await Note.bulkWrite(ops);

        // Push served ids to the front of the ring (dedup existing), then cap its length.
        const servedIds = page.map(n => n._id.toString());
        const servedSet = new Set(servedIds);
        const retained = recentlySeen
            .map(id => id.toString())
            .filter(id => !servedSet.has(id));
        const nextRing = [...servedIds, ...retained].slice(0, FEED.RECENTLY_SEEN_CAP);
        await User.updateOne({ _id: userId }, { $set: { 'feed.recentlySeen': nextRing } });
    }
}

export default FeedService;

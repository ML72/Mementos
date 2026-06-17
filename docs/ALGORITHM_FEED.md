# Feed Algorithm

This document describes how the Mementos feed is built — the home‑page feed served by
`GET /api/notes`. It explains the model, the scoring math, the storage/compute trade‑offs,
and how to tune or extend it.

> TL;DR — The feed is a **two‑stage recommender**: cheap, index‑backed *candidate
> generation* followed by *ranking* and a *blend* step. It mixes two tracks:
> **(1) your own notes, scheduled by spaced repetition** (review), and
> **(2) notes from people you follow, ranked by freshness × learned affinity** (discover).
> A quota guarantees the feed stays at least ~25% your own notes so review never starves.
> All added state is bounded so storage scales **O(users) + O(notes)** — never O(users × notes).

---

## Goals & constraints

From the product requirements:

1. **Prioritize high‑importance notes that haven't been seen in a while.** This is a review
   app, so re‑surfacing important material at the right time is the core value.
2. **Mix self and others.** Show your own notes (to review) and others' notes (to learn),
   with **≥ ~25% your own** once you have at least 5 notes.
3. **Light preference modeling.** Learn which tags and which authors you like and push them up.
4. **Storage is the scarce resource.** Be frugal with database space; keep compute reasonable.
   When the two trade off, prefer saving storage.
5. **Scale** with users, notes, and follows — and stay extensible (e.g. future "groups").

The central tension is #1 vs. #4: naively tracking "have I seen note *X*?" for every
(user, note) pair is an **impressions table of size O(users × notes)** — exactly the kind of
unbounded growth we must avoid. The design below gets the behaviour without that cost.

---

## Design overview

The feed is assembled from two independently‑ranked **tracks** that are then blended:

| Track | Source | Models | Inspiration |
|-------|--------|--------|-------------|
| **Self / review** | your own notes | spaced repetition on `Note.review` | Leitner boxes, SM‑2, half‑life regression |
| **Others / discover** | notes from people you follow | freshness × affinity on `User.feed` | EdgeRank (affinity × weight × time‑decay), content‑based recommenders |

Ranking each track separately and blending by **policy** (a quota) avoids the hard problem of
calibrating two very different score scales against each other. Within a track, scores are only
ever compared to each other.

The request flow (`FeedService.getFeed`, `src/server/service/internal/feed.ts`):

```
1. Candidate generation   two bounded, index-backed queries (self pool + others pool)
2. Ranking                score each candidate; prefer not-recently-seen notes
3. Blend                  interleave the two tracks under the self-review quota
4. Record-on-serve        advance review state + push served ids onto the seen-ring
```

---

## Data model additions

### `Note.review` — spaced‑repetition state (`src/server/models/Note.ts`)

```ts
review: {
  lastReviewedAt: Date | null,   // when the creator last saw it in their feed
  reviewCount:    number,        // how many times it has been reviewed
  nextDueAt:      Date           // denormalized "due time" (defaults to creation => due now)
}
```

Only a note's **creator** reviews their own note, so this is **one record per note** — O(notes),
*not* O(users × notes). `nextDueAt` is the key trick: it's a **denormalized, indexable** due time
recomputed on each review, so the feed can fetch a user's most‑overdue notes with a single index
range scan instead of scoring every note at request time.

Indexes added:

```ts
NoteSchema.index({ creator: 1, 'review.nextDueAt': 1 }); // self/review candidate query
NoteSchema.index({ creator: 1, dateCreated: -1 });       // others/discover query (+ getNotesByCreator)
```

### `User.feed` — personalization state (`src/server/models/User.ts`)

```ts
feed: {
  tagAffinity:    Map<string, number>,   // tag    -> score, top-K only
  authorAffinity: Map<string, number>,   // authorId -> score, top-K only
  recentlySeen:   ObjectId[]             // capped ring buffer of recently served notes
}
```

Every field is **bounded** (see [Storage](#storage--compute)). The two affinity maps are the
learned preference profile; `recentlySeen` powers "not seen in a while" cheaply.

> Legacy documents created before these fields existed need **no migration**: missing review
> state sorts first (treated as most‑due) and is filled in the first time a note is served;
> missing feed state is treated as empty.

---

## The self / review track (spaced repetition)

We want important notes to come back for review, with the spacing between reviews **expanding**
as you keep seeing them (you remember them better) — classic spaced repetition.

**Target interval** before a note is due again (`intervalHours`):

```
interval(reviewCount, importance) =
    BASE_INTERVAL_HOURS
  × SPACING_GROWTH ^ min(reviewCount - 1, MAX_BOX)     // Leitner-style geometric expansion
  × importanceFactor(importance)

importanceFactor = 1 - IMPORTANCE_STRENGTH × (importance - 5.5) / 4.5
```

So with the defaults (`BASE=24h`, `SPACING_GROWTH=2`, `IMPORTANCE_STRENGTH=0.5`): an
importance‑10 note recurs roughly twice as often as an importance‑1 note, and each successful
review roughly doubles the wait until the next one. After each review we persist
`nextDueAt = now + interval(...)`.

New notes default to `nextDueAt = creationTime` (**due immediately**), so a note you just wrote
enters the review rotation right away; spacing kicks in after the first review.

**Review priority** for ranking (`scoreSelf`):

```
overdue = (now - nextDueAt) / interval        // 0 at the due moment, >0 overdue, <0 not yet due
factor  = clamp(overdue + 1, 0, OVERDUE_CAP)  // 1 exactly at due; capped so nothing dominates forever
score   = importance × factor
```

This directly encodes the requirement: **high importance** and **overdue** (≈ "not seen in a
while") both push a note up, and the cap stops a single ancient note from dominating.

---

## The others / discover track (freshness × affinity)

For notes from people you follow we rank by an EdgeRank‑style product (`scoreOther`):

```
freshness = exp(-ageHours / FRESHNESS_TAU_HOURS)         // newer notes decay slower

affinity  = 1 + TAG_AFFINITY_WEIGHT    × sat(tagScore)
              + AUTHOR_AFFINITY_WEIGHT × sat(authorScore)
              + (FOLLOW_BONUS if you follow the author)

score     = (importance / 10) × freshness × affinity
```

where `sat(x) = x / (x + NORM)` is a saturating transform that keeps each affinity contribution
bounded in `[0, 1)` so a few strong signals can't blow up the score. `tagScore` is the sum of the
user's affinity for the note's tags; `authorScore` is the user's affinity for the note's author.

"Not seen in a while" for *others'* notes is handled differently than for self notes (we can't
afford per‑pair timestamps): see [the seen‑ring](#not-seen-in-a-while-the-seen-ring) below.

---

## Preference learning (bounded, online)

Affinities are learned **online from likes** — the strongest explicit positive signal — in
`NotesService.likeNote` / `unlikeNote`, via `bumpAffinity`:

- **On like:** add `W_LIKE_TAG` to each of the note's tags and `W_LIKE_AUTHOR` to its author.
- **On unlike:** subtract the same weights (clamped at 0) — a clean reversal.
- **Forgetting:** before each positive update, all entries are multiplied by `DECAY` (< 1), so
  stale interests fade and recent ones dominate (an exponential moving average in spirit).
- **Bounded:** entries below `MIN_SCORE` are dropped, and each map is capped to its top‑K by
  score (`MAX_TAGS`, `MAX_AUTHORS`). **Storage per user is therefore O(K), independent of how
  many distinct tags or authors exist in the system.**

Following is treated as a separate, **free** signal (`FOLLOW_BONUS`) — it's already stored on the
user, so no extra space is needed to know who you follow.

> **Storage‑driven choice:** we deliberately do *not* keep a full per‑user × per‑tag histogram or
> a separate "author engagement" table. A small top‑K map captures "what you like most" — which is
> all the ranking needs — at a tiny, constant cost.

---

## Not seen in a while: the seen‑ring

`User.feed.recentlySeen` is a **capped ring buffer** (most‑recent‑first, length `RECENTLY_SEEN_CAP`)
of note ids the user was recently served. It is a **soft** signal, not a hard filter:

- During ranking, candidates **not** in the ring are preferred (sorted by score).
- Candidates **in** the ring are kept as a fallback, ordered **oldest‑sighting‑first** — so when we
  do have to repeat, we repeat what you saw **longest ago**. That *is* "not seen in a while".
- A note becomes fully eligible again once it **falls off** the ring.

Because it's soft + bounded, it degrades gracefully: a user with little content still gets a full
page (their least‑recently‑seen notes reused) instead of an empty feed, while a user with lots of
content rarely sees repeats. Cost is a bounded `O(RECENTLY_SEEN_CAP)` ids per user.

For **own** notes, "not seen in a while" is additionally and more precisely captured by
`nextDueAt` (a served note's due time is pushed into the future), so the two mechanisms reinforce
each other.

---

## Blending & diversity

`blend()` merges the two ranked tracks into one page of size `limit`:

1. `selfFloor   = ceil(SELF_MIN_RATIO × limit)` — but only if the user owns ≥ `MIN_NOTES_FOR_SELF_QUOTA` notes.
2. `selfTarget  = max(selfFloor, round(SELF_TARGET_RATIO × limit))` — the desired self share (~40%).
3. Take `selfTarget` from the self track and the rest from others; **backfill** from whichever
   track has leftovers if one runs short.
4. **Interleave** the two chosen lists by ratio (so self and others are spread through the page,
   not front‑loaded), then **de‑clump by author** so you rarely see two consecutive notes from the
   same person (a lightweight diversity pass).

This guarantees the **≥25% self** floor whenever you have enough own notes, while still skewing
the feed toward your own material when there's little new to learn (and toward others when you've
already reviewed everything that's due).

---

## Record‑on‑serve & pagination

`GET /api/notes` is **stateful**: when a page is served, `recordServed()`:

- advances `review` state for served **own** notes (`reviewCount++`, new `lastReviewedAt`/`nextDueAt`),
  guarded by `MIN_REVIEW_GAP_HOURS` so rapid refreshes don't inflate review counts; and
- pushes every served id onto the `recentlySeen` ring (deduped, capped).

Because state advances on every serve, pagination is **cursorless**: each call returns the
next‑best page and marks it seen, so the *next* call naturally returns different notes. The
response is `{ notes, hasMore }`; the client simply calls again to load more (it dedupes by id
defensively).

> **Trade‑off (documented intentionally):** recording impressions on a `GET` is a mild violation
> of HTTP read semantics, and "served" is an approximation of "actually read". We accept this for
> simplicity given the current single‑page client; the recording is isolated in `recordServed()`
> so it can later move to an explicit `POST .../seen` impressions endpoint (scroll‑based) without
> touching the ranking logic.

---

## Storage & compute

**Storage (the priority).** Per‑note: three small `review` fields (~20 bytes) — O(notes), and
essential to the review feature. Per‑user: two top‑K affinity maps + the seen‑ring — all bounded:

```
per user ≈ MAX_TAGS·(tag+score) + MAX_AUTHORS·(id+score) + RECENTLY_SEEN_CAP·objectId
         ≈ 25·~28B            + 15·~32B               + 100·12B            ≈ 2.4 KB
```

Crucially this is **constant per user** — it does **not** grow with the number of notes, tags,
follows, or other users. Total added storage is **O(users) + O(notes)**, and we explicitly avoid
the **O(users × notes)** impressions table.

**Compute per request.** Two indexed queries (each capped at `CANDIDATE_POOL`), in‑memory scoring
and sorting over the pools, one `populate` for the served page, one `Note.bulkWrite` (≤ page size),
and one `User.updateOne`. All bounded by `CANDIDATE_POOL` / page size → predictable low latency.

**Scaling boundary.** The others‑track query `{ creator: { $in: following } }` is read‑time
fan‑out. With the `{creator, dateCreated}` index this scales comfortably to thousands of follows.
For celebrity‑scale fan‑out it would move to fan‑out‑on‑write (a materialized per‑user feed) — see
[Future work](#future-work).

---

## Configuration

All tunables live in `FEED` in `src/server/settings.ts` — change behaviour without touching logic:

| Group | Key | Default | Meaning |
|-------|-----|---------|---------|
| | `PAGE_SIZE_DEFAULT` / `PAGE_SIZE_MAX` | 20 / 50 | page size and its cap |
| | `CANDIDATE_POOL` | 200 | max notes pulled per track before ranking |
| `REVIEW` | `BASE_INTERVAL_HOURS` | 24 | first review spacing |
| `REVIEW` | `SPACING_GROWTH` | 2.0 | interval multiplier per review |
| `REVIEW` | `MAX_BOX` | 8 | cap on the growth exponent |
| `REVIEW` | `IMPORTANCE_STRENGTH` | 0.5 | how much importance shifts the interval |
| `REVIEW` | `OVERDUE_CAP` | 5 | cap on the overdue multiplier |
| `REVIEW` | `MIN_REVIEW_GAP_HOURS` | 6 | ignore re‑serves within this window |
| `DISCOVERY` | `FRESHNESS_TAU_HOURS` | 72 | freshness decay time‑constant |
| `DISCOVERY` | `TAG_AFFINITY_WEIGHT` / `AUTHOR_AFFINITY_WEIGHT` | 0.6 / 0.6 | max affinity boosts |
| `DISCOVERY` | `FOLLOW_BONUS` | 0.2 | boost for a followed author |
| `DISCOVERY` | `TAG_NORM` / `AUTHOR_NORM` | 4 / 4 | affinity saturation constants |
| | `SELF_MIN_RATIO` | 0.25 | self‑review floor |
| | `SELF_TARGET_RATIO` | 0.4 | desired self share |
| | `MIN_NOTES_FOR_SELF_QUOTA` | 5 | own‑note count before the floor applies |
| `AFFINITY` | `MAX_TAGS` / `MAX_AUTHORS` | 25 / 15 | top‑K bound per affinity map |
| `AFFINITY` | `DECAY` | 0.95 | forgetting factor per engagement |
| `AFFINITY` | `MIN_SCORE` | 0.05 | evict entries below this |
| `AFFINITY` | `W_LIKE_TAG` / `W_LIKE_AUTHOR` | 2.0 / 2.0 | weight a like adds |
| | `RECENTLY_SEEN_CAP` | 100 | seen‑ring length |

---

## Extending to groups (and beyond)

Future "group" visibility fits naturally. Add a `group` ref to `Note` and a group‑membership list
to `User`, then add a **third candidate source** in `FeedService.getFeed` —
`Note.find({ group: { $in: userGroups } })` — and feed it through the same `scoreOther` ranking
(group notes are "discover"). The scoring, blending, seen‑ring, and learning logic are unchanged;
only candidate generation grows. The track abstraction is what makes this cheap.

## Future work

- **Explicit impressions:** move recording from serve‑time to a client‑driven `POST .../seen`
  (scroll/viewport based) for more accurate "seen" tracking.
- **Fan‑out‑on‑write:** for very high follow counts, materialize per‑user feeds instead of
  read‑time fan‑out.
- **Richer signals:** dwell time, explicit "reviewed: easy/hard" buttons feeding the SR interval
  (full SM‑2), negative feedback ("show less of this").
- **Cold start:** popularity/recency fallback for users who follow no one and have no notes yet.

---

## Code & tests

- Implementation: `src/server/service/internal/feed.ts` (`FeedService` + pure helpers),
  wired in `src/server/routes/notes.ts`; preference updates in
  `src/server/service/internal/notes.ts`; tunables in `src/server/settings.ts`.
- Tests: `test/unit/feed.test.ts` (pure scoring/learning/blend helpers, deterministic, no DB) and
  `test/integration/feed.test.ts` (quota, importance ordering, recency dedup, SR advancement,
  tag/author learning, pagination).

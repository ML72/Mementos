import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { getLikedNotes, likeNote, unlikeNote } from '../service/notes';

/**
 * Single source of truth for the current user's likes across the app.
 *
 * - Seeds the liked set + the liked-notes list once from GET /api/notes/liked.
 * - `isLiked` / `likeCountFor` give the display state for any note (the count uses an
 *   optimistic override once the user toggles, otherwise the note's server `likeCount`).
 * - `toggleLike` updates the heart and count immediately and calls the API, reverting on
 *   failure. The backend like/unlike endpoints also update the feed-ranking preference model.
 */
export const useNoteLikes = () => {
  const dispatch = useDispatch();
  const [likedNotes, setLikedNotes] = useState<any[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [countOverrides, setCountOverrides] = useState<Map<string, number>>(new Map());
  const [loadingLiked, setLoadingLiked] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingLiked(true);
      const liked = await getLikedNotes(dispatch);
      if (active && Array.isArray(liked)) {
        const cleaned = liked.filter(Boolean);
        setLikedNotes(cleaned);
        setLikedIds(new Set(cleaned.map((n: any) => n._id)));
      }
      if (active) setLoadingLiked(false);
    })();
    return () => { active = false; };
  }, [dispatch]);

  const isLiked = (noteId: string) => likedIds.has(noteId);

  const likeCountFor = (note: any): number =>
    countOverrides.has(note._id) ? (countOverrides.get(note._id) as number) : (note.likeCount || 0);

  const toggleLike = async (note: any) => {
    const id = note._id;
    const currentlyLiked = likedIds.has(id);
    const base = countOverrides.has(id) ? (countOverrides.get(id) as number) : (note.likeCount || 0);
    const nextCount = Math.max(0, base + (currentlyLiked ? -1 : 1));

    // Optimistic update of both the heart and the count
    setLikedIds(prev => {
      const next = new Set(prev);
      if (currentlyLiked) next.delete(id);
      else next.add(id);
      return next;
    });
    setCountOverrides(prev => new Map(prev).set(id, nextCount));

    const ok = currentlyLiked
      ? await unlikeNote(dispatch, id)
      : await likeNote(dispatch, id);

    // Revert on failure (the service already surfaced an error alert)
    if (!ok) {
      setLikedIds(prev => {
        const next = new Set(prev);
        if (currentlyLiked) next.add(id);
        else next.delete(id);
        return next;
      });
      setCountOverrides(prev => new Map(prev).set(id, base));
    }
  };

  return { likedNotes, loadingLiked, isLiked, likeCountFor, toggleLike };
};

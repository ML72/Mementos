import { ComponentType, lazy } from 'react';

/**
 * Pages that download when first opened, each in its own chunk, so the first page a visitor loads
 * doesn't carry the rest of the app. `preload()` starts the download ahead of time.
 */

/** A page whose code could not be downloaded, as opposed to one that crashed while rendering. */
export class PageLoadError extends Error {
  constructor(cause: unknown) {
    super('A page could not be downloaded', { cause });
    this.name = 'PageLoadError';
  }
}

// A deploy replaces the files pages load from, so a tab opened before it can't download the pages
// it hasn't opened yet; reloading picks up the new version. At most once a minute, so a page that
// keeps failing (offline, or a problem on the server) shows an error instead of reloading in a loop.
const RELOADED_AT_KEY = 'mementos:page-reloaded-at';
const RELOAD_AGAIN_AFTER_MS = 60 * 1000;

const reloadForNewVersion = (): boolean => {
  if (!navigator.onLine) return false;
  try {
    if (Date.now() - Number(sessionStorage.getItem(RELOADED_AT_KEY)) < RELOAD_AGAIN_AFTER_MS) return false;
    sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
  } catch {
    return false; // storage is blocked, so there is no telling whether this tab just reloaded
  }
  window.location.reload();
  return true;
};

export const lazyPage = <T extends ComponentType<any>>(load: () => Promise<{ default: T }>) => {
  let loading: Promise<{ default: T }> | null = null;
  const loadOnce = () =>
    (loading ??= load().catch((error) => {
      loading = null; // a failed preload doesn't stop opening the page from trying again
      throw error;
    }));

  const page = lazy(() =>
    loadOnce().catch((error) => {
      // Leave what's on screen in place until the reload replaces it.
      if (reloadForNewVersion()) return new Promise<never>(() => {});
      throw new PageLoadError(error);
    })
  );
  return Object.assign(page, {
    preload: () => {
      loadOnce().catch(() => {}); // a failure shows if the page is opened
    }
  });
};

export type LazyPage = ReturnType<typeof lazyPage>;

/**
 * Downloads `pages` in the background once the current page has finished loading and the browser
 * is idle, so opening them later doesn't wait on the network. Skipped when the browser asks to save
 * data. Returns a function that cancels whatever hasn't started yet.
 */
export const preloadWhenIdle = (pages: LazyPage[]): (() => void) => {
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) {
    return () => {};
  }

  const preload = () => pages.forEach((page) => page.preload());
  let cancel = () => {};
  const whenIdle = () => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(preload, { timeout: 5000 });
      cancel = () => window.cancelIdleCallback(id);
    } else {
      const id = window.setTimeout(preload, 1000); // Safari has no requestIdleCallback
      cancel = () => window.clearTimeout(id);
    }
  };

  if (document.readyState === 'complete') {
    whenIdle();
  } else {
    window.addEventListener('load', whenIdle, { once: true });
    cancel = () => window.removeEventListener('load', whenIdle);
  }
  return () => cancel();
};

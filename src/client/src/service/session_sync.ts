import type { AuthState } from '../store/slices/auth';

/**
 * Keeps every open tab on the same session.
 *
 * redux-persist saves the `auth` slice to localStorage, which all tabs share, but each tab runs its
 * own store and reads that copy only once, at startup. Left alone, a tab never learns that another
 * one signed in, signed out or swapped in a new token (a password change does that), and acting on
 * its stale copy undoes the other tab's work: signing out over a token that has since expired, for
 * one, wipes out the session the user just started elsewhere. The browser fires a `storage` event
 * in every *other* tab when the saved session changes, and each of them takes it over.
 *
 * Dependencies are injected, as in ./interceptors.ts, so this needs neither the store nor a browser
 * to test. `main.tsx` wires it up once.
 */

export interface SessionSyncDeps {
    /** The localStorage key every tab saves the session under. */
    storageKey: string;
    /** What is saved under it now: null when nothing is, or when storage can't be read. */
    readSaved: () => string | null;
    /** This tab's session. */
    getSession: () => AuthState;
    /** Replaces this tab's session with the one another tab saved. */
    adoptSession: (session: AuthState) => void;
    /** Tells the user that another tab signed them out. */
    onSignedOutElsewhere: () => void;
}

/** The part of `window` this listens on. */
export interface EventTargetLike {
    addEventListener(type: string, listener: (event: any) => void): void;
    removeEventListener(type: string, listener: (event: any) => void): void;
}

const stringOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/**
 * The session in what redux-persist saved, or null when there is none to go by (nothing saved, or
 * nothing readable). redux-persist saves the persisted state as one JSON object whose values are
 * JSON strings of their own: `{"auth":"{\"token\":…}","_persist":"{…}"}`. The fields are rebuilt
 * in the slice's order, so the copy this tab writes back once it adopts the session is identical to
 * what it read, which the browser does not announce to the other tabs as a change.
 */
export const readSavedSession = (saved: string | null): AuthState | null => {
    if (!saved) return null;
    try {
        const auth = JSON.parse(JSON.parse(saved).auth);
        if (!auth || typeof auth !== 'object') return null;
        return {
            token: stringOrNull(auth.token),
            userId: stringOrNull(auth.userId),
            email: stringOrNull(auth.email),
            fullName: stringOrNull(auth.fullName),
            accountRoles: Array.isArray(auth.accountRoles)
                ? auth.accountRoles.filter((role: unknown) => typeof role === 'string')
                : [],
            isAuthenticated: auth.isAuthenticated === true
        };
    } catch {
        return null;
    }
};

/** Whether two copies describe the same session. */
export const sameSession = (a: AuthState, b: AuthState): boolean =>
    a.token === b.token &&
    a.userId === b.userId &&
    a.email === b.email &&
    a.fullName === b.fullName &&
    a.isAuthenticated === b.isAuthenticated &&
    a.accountRoles.length === b.accountRoles.length &&
    a.accountRoles.every((role, i) => role === b.accountRoles[i]);

/** Brings this tab's session in line with the saved one. Returns whether that changed anything. */
export const syncSession = (deps: SessionSyncDeps): boolean => {
    const saved = readSavedSession(deps.readSaved());
    const current = deps.getSession();
    if (!saved || sameSession(saved, current)) return false;

    deps.adoptSession(saved);
    if (current.isAuthenticated && !saved.isAuthenticated) deps.onSignedOutElsewhere();
    return true;
};

/**
 * For a tab whose token the API has just refused: takes over the session another tab saved, if it
 * holds a different token, and returns whether it did. This tab must then not sign out, which would
 * erase that session for every tab. The refusal can beat the `storage` event that brings the newer
 * session here, and a page restored from the back/forward cache missed those events altogether. A
 * saved session without a token changes nothing: this tab is signing out either way.
 */
export const adoptNewerSession = (deps: SessionSyncDeps): boolean => {
    const saved = readSavedSession(deps.readSaved());
    if (!saved?.token || saved.token === deps.getSession().token) return false;

    deps.adoptSession(saved);
    return true;
};

/**
 * Follows the saved session from now on: whenever another tab changes it, and when this page comes
 * back from the back/forward cache, having missed the changes in between. Returns a teardown that
 * stops following, as setupAxiosInterceptors does.
 */
export const setupSessionSync = (deps: SessionSyncDeps, target: EventTargetLike): (() => void) => {
    const onStorage = (event: { key: string | null }) => {
        if (event.key === deps.storageKey) syncSession(deps);
    };
    const onPageShow = (event: { persisted: boolean }) => {
        if (event.persisted) syncSession(deps);
    };

    target.addEventListener('storage', onStorage);
    target.addEventListener('pageshow', onPageShow);
    return () => {
        target.removeEventListener('storage', onStorage);
        target.removeEventListener('pageshow', onPageShow);
    };
};

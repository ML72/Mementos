import { describe, it, expect } from '@jest/globals';
import {
    adoptNewerSession,
    readSavedSession,
    sameSession,
    SessionSyncDeps,
    setupSessionSync,
    syncSession
} from '../../src/client/src/service/session_sync';
import type { AuthState } from '../../src/client/src/store/slices/auth';

// Pure unit test, like auth_interceptor.test.ts: the sync takes its dependencies as arguments, so
// a few plain objects stand in for the browser. It pins the multi-tab bug the module exists to fix:
// every tab shares one saved session but kept its own copy, so a tab never heard that another one
// signed in, signed out or got a new token, and signing out over its stale token wiped out the
// session the user had just started in another tab.

const KEY = 'persist:mementos-root';

/** What redux-persist saves: the persisted state as JSON, with each slice JSON-encoded again. */
const persisted = (auth: AuthState): string =>
    JSON.stringify({ auth: JSON.stringify(auth), _persist: JSON.stringify({ version: -1, rehydrated: true }) });

const SIGNED_OUT: AuthState = {
    token: null, userId: null, email: null, fullName: null, accountRoles: [], isAuthenticated: false
};
const signedIn = (token: string, userId = 'user-1'): AuthState => ({
    token, userId, email: 'ada@example.com', fullName: 'Ada Lovelace', accountRoles: ['USER'], isAuthenticated: true
});

/** Just enough of `window` to register listeners and fire events at them. */
const fakeWindow = () => {
    const listeners = new Map<string, Set<(event: any) => void>>();
    return {
        addEventListener: (type: string, listener: (event: any) => void) => {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type)!.add(listener);
        },
        removeEventListener: (type: string, listener: (event: any) => void) => {
            listeners.get(type)?.delete(listener);
        },
        fire: (type: string, event: object) => listeners.get(type)?.forEach((listener) => listener(event)),
        listenerCount: () => [...listeners.values()].reduce((n, set) => n + set.size, 0)
    };
};

interface Tab {
    session: AuthState;
    adoptions: number;
    signedOutElsewhere: number;
    window: ReturnType<typeof fakeWindow>;
    deps: SessionSyncDeps;
    stop: () => void;
    /** This tab changes its session; redux-persist saves it, and the other tabs hear of it. */
    change: (next: AuthState, options?: { othersHear?: boolean }) => void;
}

/** One browser profile: the localStorage its tabs share, and the tabs themselves. */
const browser = () => {
    const storage = { saved: null as string | null };
    const tabs: Tab[] = [];

    const openTab = (initial: AuthState = readSavedSession(storage.saved) ?? SIGNED_OUT): Tab => {
        const tab: Tab = {
            session: initial,
            adoptions: 0,
            signedOutElsewhere: 0,
            window: fakeWindow(),
            deps: undefined as unknown as SessionSyncDeps,
            stop: () => undefined,
            change: (next, { othersHear = true } = {}) => {
                tab.session = next;
                storage.saved = persisted(next);
                if (othersHear) {
                    for (const other of tabs) if (other !== tab) other.window.fire('storage', { key: KEY });
                }
            }
        };
        tab.deps = {
            storageKey: KEY,
            readSaved: () => storage.saved,
            getSession: () => tab.session,
            adoptSession: (session) => {
                tab.session = session;
                tab.adoptions++;
            },
            onSignedOutElsewhere: () => {
                tab.signedOutElsewhere++;
            }
        };
        tab.stop = setupSessionSync(tab.deps, tab.window);
        tabs.push(tab);
        return tab;
    };

    return { storage, openTab };
};

describe('readSavedSession', () => {
    it('reads back the session redux-persist saved', () => {
        expect(readSavedSession(persisted(signedIn('t1')))).toEqual(signedIn('t1'));
        expect(readSavedSession(persisted(SIGNED_OUT))).toEqual(SIGNED_OUT);
    });

    it('rebuilds it field for field, so saving it back is not announced to other tabs as a change', () => {
        // The browser only fires `storage` events when the saved string actually changes, so
        // a tab that adopts a session and writes it back must not start an echo between tabs.
        const saved = persisted(signedIn('t1'));
        expect(persisted(readSavedSession(saved)!)).toBe(saved);
    });

    it('is null when there is nothing to go by', () => {
        expect(readSavedSession(null)).toBeNull();
        expect(readSavedSession('')).toBeNull();
        expect(readSavedSession('not json')).toBeNull();
        expect(readSavedSession(JSON.stringify({ _persist: '{}' }))).toBeNull();
        expect(readSavedSession(JSON.stringify({ auth: 'null' }))).toBeNull();
    });

    it('fills in anything missing or malformed with the signed-out value', () => {
        const odd = JSON.stringify({ auth: JSON.stringify({ token: 42, isAuthenticated: 'yes', accountRoles: ['USER', 7] }) });
        expect(readSavedSession(odd)).toEqual({ ...SIGNED_OUT, accountRoles: ['USER'] });
    });
});

describe('sameSession', () => {
    it('compares every field, roles included', () => {
        expect(sameSession(signedIn('t1'), signedIn('t1'))).toBe(true);
        expect(sameSession(signedIn('t1'), signedIn('t2'))).toBe(false);
        expect(sameSession(signedIn('t1'), signedIn('t1', 'user-2'))).toBe(false);
        expect(sameSession(signedIn('t1'), { ...signedIn('t1'), accountRoles: ['USER', 'ADMIN'] })).toBe(false);
    });
});

describe('following the session across tabs', () => {
    it('signs every open tab in when one of them signs in', () => {
        const { openTab } = browser();
        const first = openTab();
        const second = openTab();

        second.change(signedIn('t1'));

        expect(first.session).toEqual(signedIn('t1'));
        expect(first.signedOutElsewhere).toBe(0);
    });

    it('signs every open tab out when one of them signs out, and says why', () => {
        const { storage, openTab } = browser();
        storage.saved = persisted(signedIn('t1'));
        const first = openTab();
        const second = openTab();

        second.change(SIGNED_OUT);

        expect(first.session).toEqual(SIGNED_OUT);
        expect(first.signedOutElsewhere).toBe(1);
    });

    it('hands a new token (a password change) to the other tabs without signing them out', () => {
        const { storage, openTab } = browser();
        storage.saved = persisted(signedIn('t1'));
        const first = openTab();
        const second = openTab();

        second.change(signedIn('t2'));

        expect(first.session.token).toBe('t2');
        expect(first.signedOutElsewhere).toBe(0);
    });

    it('lets several tabs stay signed in at once', () => {
        const { storage, openTab } = browser();
        storage.saved = persisted(signedIn('t1'));
        const tabs = [openTab(), openTab(), openTab()];

        expect(tabs.map((tab) => tab.session.token)).toEqual(['t1', 't1', 't1']);
        tabs[1].window.fire('storage', { key: KEY }); // e.g. a write that changed nothing
        expect(tabs.every((tab) => tab.adoptions === 0)).toBe(true);
    });

    it('ignores changes to other storage keys', () => {
        const { storage, openTab } = browser();
        const tab = openTab();
        storage.saved = persisted(signedIn('t1'));

        tab.window.fire('storage', { key: 'something-else' });
        expect(tab.session).toEqual(SIGNED_OUT);
    });

    it('leaves a tab alone when nothing readable is saved (storage blocked or cleared)', () => {
        const { storage, openTab } = browser();
        const tab = openTab(signedIn('t1'));
        storage.saved = null;

        tab.window.fire('storage', { key: KEY });
        expect(tab.session).toEqual(signedIn('t1'));
        expect(syncSession(tab.deps)).toBe(false);
    });

    it('catches up when the page comes back from the back/forward cache, having missed events', () => {
        const { openTab } = browser();
        const cached = openTab();
        const other = openTab();
        other.change(signedIn('t1'), { othersHear: false });

        cached.window.fire('pageshow', { persisted: false }); // an ordinary load: nothing to catch up on
        expect(cached.session).toEqual(SIGNED_OUT);
        cached.window.fire('pageshow', { persisted: true });
        expect(cached.session).toEqual(signedIn('t1'));
    });

    it('stops following on teardown', () => {
        const { openTab } = browser();
        const tab = openTab();
        const other = openTab();
        tab.stop();

        expect(tab.window.listenerCount()).toBe(0);
        other.change(signedIn('t1'));
        expect(tab.session).toEqual(SIGNED_OUT);
    });
});

describe('adoptNewerSession', () => {
    it("keeps a stale tab from wiping out the session another tab started", () => {
        // The bug: the user signs in again in one tab after the session expired, while an older
        // tab still holds the expired token and has not heard of the new one (the refusal beat
        // the storage event, or the page sat in the back/forward cache). When the old tab's next
        // request is refused, it must take over the new session instead of signing out.
        const { storage, openTab } = browser();
        const stale = openTab(signedIn('expired-token'));
        const fresh = openTab(SIGNED_OUT);
        fresh.change(signedIn('fresh-token'), { othersHear: false });

        expect(adoptNewerSession(stale.deps)).toBe(true);
        expect(stale.session.token).toBe('fresh-token');
        expect(readSavedSession(storage.saved)?.token).toBe('fresh-token');
    });

    it('leaves the sign-out to the caller when the saved token is the refused one', () => {
        const { storage, openTab } = browser();
        storage.saved = persisted(signedIn('dead-token'));
        const tab = openTab();

        expect(adoptNewerSession(tab.deps)).toBe(false);
        expect(tab.adoptions).toBe(0);
    });

    it('does not take over a saved session without a token: the tab signs out either way', () => {
        const { storage, openTab } = browser();
        const tab = openTab(signedIn('dead-token'));
        storage.saved = persisted(SIGNED_OUT);

        expect(adoptNewerSession(tab.deps)).toBe(false);
        storage.saved = null;
        expect(adoptNewerSession(tab.deps)).toBe(false);
        expect(tab.session.token).toBe('dead-token');
    });
});

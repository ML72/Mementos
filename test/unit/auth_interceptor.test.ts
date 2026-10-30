import { describe, it, expect, beforeEach } from '@jest/globals';
import {
    AUTH_HEADER,
    attachAuthToken,
    isTokenInvalidError,
    setupAxiosInterceptors,
    signOutOnInvalidToken,
    tokenSentWith
} from '../../src/client/src/service/interceptors';

// Pure unit test — the interceptors take their dependencies as arguments, so this needs no
// browser, no Redux store and no server. It pins the bug this module exists to fix: a token
// that has gone stale (the JWT lasts 3 days) used to leave the client "logged in" forever,
// because nothing acted on the `is_token_invalid` flag every API error response carries.

/** The shape axios rejects with when the API answers with a status error. */
const apiError = (data: object, sentToken: string | null = null) => ({
    isAxiosError: true,
    config: { headers: sentToken ? { [AUTH_HEADER]: sentToken } : {} },
    response: { status: 401, statusText: 'Unauthorized', data, headers: {} }
});

const EXPIRED = 'Your session has expired. Please sign in again.';
const TOKEN_INVALID = apiError({ errors: [{ msg: EXPIRED }], is_token_invalid: true }, 'a-valid-token');
const NOT_FOUND = apiError({ errors: [{ msg: 'Note not found' }], is_token_invalid: false }, 'a-valid-token');

describe('isTokenInvalidError', () => {
    it('is true only when the API flags the token as invalid', () => {
        expect(isTokenInvalidError(TOKEN_INVALID)).toBe(true);
    });

    it('is false for ordinary API errors, which always carry the flag as false', () => {
        expect(isTokenInvalidError(NOT_FOUND)).toBe(false);
    });

    it('is false for network errors and anything else without a response', () => {
        expect(isTokenInvalidError(new Error('Network Error'))).toBe(false);
        expect(isTokenInvalidError(undefined)).toBe(false);
        expect(isTokenInvalidError({ response: {} })).toBe(false);
    });
});

describe('attachAuthToken', () => {
    const headersOf = (token: string | null) => {
        const config: any = { headers: {} };
        attachAuthToken(() => token)(config);
        return config.headers;
    };

    it('stamps the current token onto the request', () => {
        expect(headersOf('a-valid-token')[AUTH_HEADER]).toBe('a-valid-token');
    });

    it('sends no token header when signed out', () => {
        expect(headersOf(null)[AUTH_HEADER]).toBeUndefined();
    });

    it('reads the token per request rather than caching it', () => {
        let token = 'first-token';
        const handler = attachAuthToken(() => token);

        const before: any = { headers: {} };
        handler(before);
        token = 'second-token';
        const after: any = { headers: {} };
        handler(after);

        expect(before.headers[AUTH_HEADER]).toBe('first-token');
        expect(after.headers[AUTH_HEADER]).toBe('second-token');
    });
});

describe('tokenSentWith', () => {
    it('reads the token a request went out with', () => {
        expect(tokenSentWith(TOKEN_INVALID)).toBe('a-valid-token');
    });

    it('asks AxiosHeaders, which ignores case, when that is what axios hands back', () => {
        const stored = new Map([['x-auth-token', 'a-valid-token']]);
        const headers = { get: (name: string) => stored.get(name.toLowerCase()) };
        expect(tokenSentWith({ config: { headers } })).toBe('a-valid-token');
    });

    it('is null when the request carried no token, or there is no request at all', () => {
        expect(tokenSentWith(apiError({}, null))).toBeNull();
        expect(tokenSentWith(new Error('Network Error'))).toBeNull();
        expect(tokenSentWith(undefined)).toBeNull();
    });
});

describe('signOutOnInvalidToken', () => {
    let token: string | null;
    let signOuts: number;
    let reasons: (string | undefined)[];
    let handler: (error: unknown) => Promise<never>;

    beforeEach(() => {
        token = 'a-valid-token';
        signOuts = 0;
        reasons = [];
        handler = signOutOnInvalidToken({
            getToken: () => token,
            // Mirrors the real handler: signing out clears the token synchronously.
            onTokenInvalid: (reason) => {
                signOuts++;
                reasons.push(reason);
                token = null;
            }
        });
    });

    it('signs the user out when a request reports an invalid token', async () => {
        await expect(handler(TOKEN_INVALID)).rejects.toBe(TOKEN_INVALID);
        expect(signOuts).toBe(1);
        expect(token).toBeNull();
    });

    it("passes the API's reason along, so the user is told why", async () => {
        await expect(handler(TOKEN_INVALID)).rejects.toBeDefined();
        expect(reasons).toEqual([EXPIRED]);
    });

    it('re-rejects with the original error so each caller still handles it', async () => {
        // Services read err.response.data.errors[].msg to raise their own alerts.
        await expect(handler(TOKEN_INVALID)).rejects.toMatchObject({
            response: { data: { errors: [{ msg: EXPIRED }] } }
        });
    });

    it('leaves a newer session alone when a request sent under an older token is refused', async () => {
        // A password change (here or in another tab) swapped the token while the request was in
        // flight, or the user signed out and back in: the refusal is about a token now gone.
        token = 'the-new-token';
        await expect(handler(TOKEN_INVALID)).rejects.toBe(TOKEN_INVALID);
        expect(signOuts).toBe(0);
        expect(token).toBe('the-new-token');
    });

    it('leaves the session alone when the refused request carried no token', async () => {
        await expect(handler(apiError({ errors: [{ msg: 'No token, authorization denied' }], is_token_invalid: true })))
            .rejects.toBeDefined();
        expect(signOuts).toBe(0);
    });

    it('leaves the session alone for ordinary errors', async () => {
        await expect(handler(NOT_FOUND)).rejects.toBe(NOT_FOUND);
        await expect(handler(new Error('Network Error'))).rejects.toBeInstanceOf(Error);
        expect(signOuts).toBe(0);
        expect(token).toBe('a-valid-token');
    });

    it('signs out once when a burst of parallel requests fails on the same dead token', async () => {
        const results = await Promise.allSettled([
            handler(TOKEN_INVALID),
            handler(TOKEN_INVALID),
            handler(TOKEN_INVALID)
        ]);

        expect(results.every((r) => r.status === 'rejected')).toBe(true);
        expect(signOuts).toBe(1);
    });

    it('does not sign out a visitor who was never signed in', async () => {
        token = null;
        await expect(
            handler(apiError({ errors: [{ msg: 'No token, authorization denied' }], is_token_invalid: true }))
        ).rejects.toBeDefined();
        expect(signOuts).toBe(0);
    });

    it('acts once on a burst, also when the first refusal hands over a newer session instead', async () => {
        // What main.tsx does when another tab already saved a new token: adopt it, no sign-out.
        let handled = 0;
        handler = signOutOnInvalidToken({
            getToken: () => token,
            onTokenInvalid: () => {
                handled++;
                token = 'adopted-from-another-tab';
            }
        });
        await Promise.allSettled([handler(TOKEN_INVALID), handler(TOKEN_INVALID)]);
        expect(handled).toBe(1);
        expect(token).toBe('adopted-from-another-tab');
    });
});

describe('setupAxiosInterceptors', () => {
    /** Minimal stand-in for an axios instance, recording what gets registered and ejected. */
    const fakeClient = () => {
        const registered: any = { request: [], response: [], ejected: [] };
        return {
            registered,
            client: {
                interceptors: {
                    request: {
                        use: (onFulfilled: any) => (registered.request.push(onFulfilled), 1),
                        eject: (id: number) => registered.ejected.push(['request', id])
                    },
                    response: {
                        use: (onFulfilled: any, onRejected: any) => (
                            registered.response.push([onFulfilled, onRejected]), 2
                        ),
                        eject: (id: number) => registered.ejected.push(['response', id])
                    }
                }
            } as any
        };
    };

    const deps = { getToken: () => 'a-valid-token', onTokenInvalid: () => undefined };

    it('registers a request handler that attaches the token', () => {
        const { registered, client } = fakeClient();
        setupAxiosInterceptors(deps, client);

        const config: any = { headers: {} };
        registered.request[0](config);
        expect(config.headers[AUTH_HEADER]).toBe('a-valid-token');
    });

    it('registers the sign-out handler on the response error path, passing successes through', () => {
        const { registered, client } = fakeClient();
        setupAxiosInterceptors(deps, client);

        const [onFulfilled, onRejected] = registered.response[0];
        const response = { status: 200 };
        expect(onFulfilled(response)).toBe(response);
        expect(onRejected).toBeInstanceOf(Function);
    });

    it('ejects both handlers on teardown', () => {
        const { registered, client } = fakeClient();
        setupAxiosInterceptors(deps, client)();

        expect(registered.ejected).toEqual([['request', 1], ['response', 2]]);
    });
});

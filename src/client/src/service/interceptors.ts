import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

/**
 * Cross-cutting axios wiring, kept in one place:
 *  - every outgoing request carries the current auth token
 *  - the user is signed out as soon as the API reports that the token is no longer valid
 *
 * Dependencies are injected rather than imported, so this module pulls in neither the store
 * nor the auth service (no import cycles) and each handler can be unit tested on its own.
 * `main.tsx` supplies the real implementations once, at startup.
 */

/** Header the API expects the JWT in (not `Authorization: Bearer`). */
export const AUTH_HEADER = 'x-auth-token';

export interface AxiosInterceptorDeps {
    /** Current auth token, or null when signed out. Read per request, never cached. */
    getToken: () => string | null;
    /** Signs the user out. Invoked at most once per dead token — see signOutOnInvalidToken. */
    onTokenInvalid: () => void;
}

/**
 * True when the API said the request failed because the token itself is no good.
 *
 * Every error response carries `is_token_invalid` (server `util/http_responses.ts`), but only
 * the `privateAccess` middleware ever sets it to true. So this stays false for validation
 * errors, 404s, server errors and failed login attempts, and false for network errors and
 * request-interceptor failures too, which have no `response` at all.
 */
export const isTokenInvalidError = (error: unknown): boolean =>
    (error as AxiosError<{ is_token_invalid?: boolean }> | undefined)
        ?.response?.data?.is_token_invalid === true;

/** Request handler: stamps the current token onto every outgoing request. */
export const attachAuthToken =
    (getToken: AxiosInterceptorDeps['getToken']) =>
    (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
        const token = getToken();
        if (token) {
            config.headers[AUTH_HEADER] = token;
        }
        return config;
    };

/** Response error handler: signs the user out when the API rejects the token. */
export const signOutOnInvalidToken =
    ({ getToken, onTokenInvalid }: AxiosInterceptorDeps) =>
    (error: unknown): Promise<never> => {
        // Only sign out if we still believe we are signed in. That check also collapses a burst
        // of parallel requests failing on the same dead token into a single sign-out: the first
        // one clears the token synchronously, so the rest fall straight through.
        if (isTokenInvalidError(error) && getToken()) {
            onTokenInvalid();
        }
        // Always re-reject, so each call's own error handling (alerts, null returns) still runs.
        return Promise.reject(error);
    };

/**
 * Installs both handlers on `client` (the shared axios default unless one is passed). Returns a
 * teardown that removes them again — used by tests; the app installs them for the page's life.
 */
export const setupAxiosInterceptors = (
    deps: AxiosInterceptorDeps,
    client: AxiosInstance = axios
): (() => void) => {
    const requestId = client.interceptors.request.use(attachAuthToken(deps.getToken));
    const responseId = client.interceptors.response.use(
        (response) => response,
        signOutOnInvalidToken(deps)
    );

    return () => {
        client.interceptors.request.eject(requestId);
        client.interceptors.response.eject(responseId);
    };
};

import { check } from 'express-validator';
import { CONTENT_LIMITS } from '../settings';

const { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } = CONTENT_LIMITS.USER;

/**
 * The rule for every password being set: at sign-up, reset and change. Signing in checks no length,
 * so an account whose password predates a change to these limits can still sign in.
 */
export const newPasswordCheck = (field: string) =>
    check(field, `Password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters long`)
        .isString()
        .isLength({ min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH });

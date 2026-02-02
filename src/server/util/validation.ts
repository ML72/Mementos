import { User } from '../models';

export interface EmailValidationResult {
    isValid: boolean;
    error?: string;
}

export interface PasswordValidationResult {
    isValid: boolean;
    error?: string;
}

/**
 * Validate email format and check if it's already in use
 */
export const validateEmail = async (email: string): Promise<EmailValidationResult> => {
    // Basic email format validation (more comprehensive than just isEmail)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return {
            isValid: false,
            error: 'Please enter a valid email address'
        };
    }

    try {
        // Check if email is already in use by anyone
        const existingUser = await User.findOne({ "login.email": email }).lean();
        if (existingUser) {
            return {
                isValid: false,
                error: 'Email is already in use'
            };
        }

        return { isValid: true };
    } catch (error: any) {
        console.error('Email validation error:', error.message);
        return {
            isValid: false,
            error: 'Error validating email'
        };
    }
};

/**
 * Validate password strength
 */
export const validatePassword = (password: string): PasswordValidationResult => {
    if (!password || password.length < 8) {
        return {
            isValid: false,
            error: 'Password must be at least 8 characters long'
        };
    }

    return { isValid: true };
};

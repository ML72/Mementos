// Utility for standardized HTML/JSON responses (especially errors)
import { Response } from 'express';


export function sendError(
	res: Response,
	status: number,
	message: string | string[],
	extra?: { is_token_invalid?: boolean } & object
) {
	// Always returns a JSON error response in a standard format
	const errors = Array.isArray(message) ? message.map(msg => ({ msg })) : [{ msg: message }];
	// Determine if this is a token error (default false unless explicitly set)
	const is_token_invalid = extra && typeof extra.is_token_invalid === 'boolean' ? extra.is_token_invalid : false;
	// Remove is_token_invalid from extra to avoid duplication
	const { is_token_invalid: _, ...rest } = extra || {};
	return res.status(status).json({ errors, is_token_invalid, ...rest });
}

export function sendSuccess(res: Response, data: object, status = 200) {
	// Standardized success response
	return res.status(status).json(data);
}

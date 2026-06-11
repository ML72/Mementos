// Utility for standardized HTML/JSON responses (especially errors)
import { Response } from 'express';


export function sendError(
	res: Response,
	status: number,
	message: string | string[],
	extra?: { is_token_invalid?: boolean } & object
) {
	// Always returns a JSON error response in a standard format:
	// { errors: [{ msg }], is_token_invalid, ...extra }
	const errors = Array.isArray(message) ? message.map(msg => ({ msg })) : [{ msg: message }];
	const { is_token_invalid = false, ...rest } = extra || {};
	return res.status(status).json({ errors, is_token_invalid, ...rest });
}

import { EMAIL } from '../settings';
import { OutgoingMail } from './mailer';

/**
 * Email and page templates. Everything user-controlled (names today, note content later) ends
 * up inside HTML that leaves the application boundary, so nothing here is built by string
 * concatenation: the `html` tag escapes every interpolated value, and only fragments explicitly
 * marked `raw()` are inserted verbatim.
 */

const ESCAPES: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
};

export const escapeHtml = (value: unknown): string =>
    String(value ?? '').replace(/[&<>"']/g, ch => ESCAPES[ch]);

/** A fragment that has already been escaped and may be embedded as-is. */
export class SafeHtml {
    constructor(public readonly value: string) {}
    toString(): string { return this.value; }
}

export const raw = (value: string): SafeHtml => new SafeHtml(value);

/** Tagged template: interpolations are escaped unless they are SafeHtml (or arrays of it). */
export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
    let out = '';
    strings.forEach((chunk, i) => {
        out += chunk;
        if (i < values.length) out += renderValue(values[i]);
    });
    return new SafeHtml(out);
}

function renderValue(value: unknown): string {
    if (value instanceof SafeHtml) return value.value;
    if (Array.isArray(value)) return value.map(renderValue).join('');
    if (value === null || value === undefined || value === false) return '';
    return escapeHtml(value);
}

const layout = (title: string, body: SafeHtml): string => html`<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="font-weight:800;font-size:20px;letter-spacing:-0.5px;margin-bottom:24px;">Mementos</div>
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;">
      ${body}
    </div>
  </div>
</body>
</html>`.value;

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

export interface VerificationParams {
    to: string;
    fullName: string;
    code: string;
}

export function renderVerificationEmail({ to, fullName, code }: VerificationParams): OutgoingMail {
    const minutes = EMAIL.VERIFICATION.EXPIRY_MINUTES;
    const link = `${EMAIL.APP_URL}/verify-email?email=${encodeURIComponent(to)}`;
    const subject = `${code} is your Mementos verification code`;
    const text =
        `Hi ${fullName},\n\n` +
        `Your Mementos verification code is: ${code}\n\n` +
        `It expires in ${minutes} minutes. Enter it at ${link}\n\n` +
        `If you did not create a Mementos account, you can ignore this email.\n`;
    const body = html`
      <h1 style="font-size:22px;margin:0 0 16px;">Verify your email</h1>
      <p style="margin:0 0 16px;line-height:1.5;">Hi ${fullName},</p>
      <p style="margin:0 0 16px;line-height:1.5;">Your Mementos verification code is:</p>
      <p style="font-size:32px;font-weight:800;letter-spacing:8px;margin:0 0 16px;font-family:SFMono-Regular,Menlo,Consolas,monospace;">${code}</p>
      <p style="margin:0 0 16px;line-height:1.5;color:#4b5563;">It expires in ${minutes} minutes. <a href="${link}" style="color:#111827;">Enter it here</a> to finish setting up your account.</p>
      <p style="margin:0;line-height:1.5;color:#6b7280;font-size:14px;">If you did not create a Mementos account, you can ignore this email.</p>`;
    return { to, subject, text, html: layout(subject, body) };
}

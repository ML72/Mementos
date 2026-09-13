import { EMAIL } from '../settings';
import { OutgoingMail } from './mailer';

/**
 * Email and page templates. Everything user-controlled (names, note subjects, note content) ends
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

/**
 * Reduce Markdown note content to a short plain-text snippet: strip the most common syntax,
 * collapse whitespace, cut at a word boundary. Deliberately lossy — a digest teases the
 * note, it does not reproduce it.
 */
export function snippet(markdown: string, maxLength: number = EMAIL.DIGEST.SNIPPET_LENGTH): string {
    const text = String(markdown ?? '')
        .replace(/```[\s\S]*?```/g, ' ')          // fenced code blocks
        .replace(/`([^`]*)`/g, '$1')              // inline code
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')    // images
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // links -> link text
        .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '') // headings, quotes, list markers
        .replace(/[*_~]{1,3}(\S[^*_~]*?)[*_~]{1,3}/g, '$1') // emphasis
        .replace(/\$\$?[^$]*\$\$?/g, ' ')         // math
        .replace(/\s+/g, ' ')
        .trim();
    if (text.length <= maxLength) return text;
    const cut = text.slice(0, maxLength);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
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
// Password reset
// ---------------------------------------------------------------------------

export interface PasswordResetParams {
    to: string;
    fullName: string;
    code: string;
}

export function renderPasswordResetEmail({ to, fullName, code }: PasswordResetParams): OutgoingMail {
    const minutes = EMAIL.PASSWORD_RESET.EXPIRY_MINUTES;
    const subject = `${code} is your Mementos password reset code`;
    const text =
        `Hi ${fullName},\n\n` +
        `Your password reset code is: ${code}\n\n` +
        `It expires in ${minutes} minutes. Enter it on the reset page along with your new password.\n\n` +
        `If you did not ask to reset your password, you can ignore this email — your password has not changed.\n`;
    const body = html`
      <h1 style="font-size:22px;margin:0 0 16px;">Reset your password</h1>
      <p style="margin:0 0 16px;line-height:1.5;">Hi ${fullName},</p>
      <p style="margin:0 0 16px;line-height:1.5;">Your password reset code is:</p>
      <p style="font-size:32px;font-weight:800;letter-spacing:8px;margin:0 0 16px;font-family:SFMono-Regular,Menlo,Consolas,monospace;">${code}</p>
      <p style="margin:0 0 16px;line-height:1.5;color:#4b5563;">It expires in ${minutes} minutes. Enter it on the reset page along with your new password.</p>
      <p style="margin:0;line-height:1.5;color:#6b7280;font-size:14px;">If you did not ask to reset your password, you can ignore this email — your password has not changed.</p>`;
    return { to, subject, text, html: layout(subject, body) };
}

// ---------------------------------------------------------------------------
// Weekly digest
// ---------------------------------------------------------------------------

export interface DigestNote {
    id: string;
    subject: string;
    content: string;
    tags: string[];
    creatorName: string;
    isOwn: boolean;
}

export interface DigestParams {
    to: string;
    fullName: string;
    notes: DigestNote[];
    unsubscribeToken: string;
}

export const unsubscribeUrl = (token: string): string =>
    `${EMAIL.APP_URL}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;

export function renderDigestEmail({ to, fullName, notes, unsubscribeToken }: DigestParams): OutgoingMail {
    const appUrl = `${EMAIL.APP_URL}/home`;
    const unsub = unsubscribeUrl(unsubscribeToken);
    const subject = `Your weekly Mementos: ${notes.length} ${notes.length === 1 ? 'note' : 'notes'} to revisit`;

    const textNotes = notes.map((n, i) => {
        const who = n.isOwn ? 'your note' : `by ${n.creatorName}`;
        const tags = n.tags.length ? `  [${n.tags.join(', ')}]` : '';
        return `${i + 1}. ${n.subject} (${who})${tags}\n   ${snippet(n.content)}`;
    }).join('\n\n');
    const text =
        `Hi ${fullName},\n\n` +
        `Here is what your feed has for you this week:\n\n${textNotes}\n\n` +
        `Open Mementos: ${appUrl}\n\n` +
        `You are receiving this because weekly digests are on for your account.\n` +
        `Unsubscribe: ${unsub}\n`;

    const items = notes.map(n => html`
        <li style="margin:0 0 20px;padding:0 0 20px;border-bottom:1px solid #f3f4f6;">
          <div style="font-weight:700;font-size:16px;margin-bottom:4px;">${n.subject}</div>
          <div style="font-size:13px;color:#6b7280;margin-bottom:8px;">
            ${n.isOwn ? 'Your note' : html`By ${n.creatorName}`}
            ${n.tags.length ? html` · ${n.tags.map((t, i) => html`${i ? ', ' : ''}${t}`)}` : ''}
          </div>
          <div style="line-height:1.5;color:#374151;">${snippet(n.content)}</div>
        </li>`);

    const body = html`
      <h1 style="font-size:22px;margin:0 0 16px;">Your week in notes</h1>
      <p style="margin:0 0 24px;line-height:1.5;">Hi ${fullName}, here is what your feed has for you this week.</p>
      <ol style="list-style:none;padding:0;margin:0 0 24px;">${items}</ol>
      <a href="${appUrl}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">Open Mementos</a>
      <p style="margin:32px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;">
        You are receiving this because weekly digests are on for your account.
        <a href="${unsub}" style="color:#6b7280;">Unsubscribe</a>
      </p>`;

    return {
        to,
        subject,
        text,
        html: layout(subject, body),
        // RFC 8058 one-click unsubscribe. Mail clients POST to the URL with no confirmation;
        // the endpoint accepts that as well as a human-clicked GET.
        headers: {
            'List-Unsubscribe': `<${unsub}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        }
    };
}

// ---------------------------------------------------------------------------
// Unsubscribe pages (served by the API, since the reader arrives from a mail client)
// ---------------------------------------------------------------------------

/** GET landing page: a form that POSTs, so link prefetchers cannot unsubscribe anyone. */
export function renderUnsubscribeConfirmPage(token: string): string {
    return layout('Unsubscribe from weekly digests', html`
      <h1 style="font-size:22px;margin:0 0 16px;">Unsubscribe from weekly digests?</h1>
      <p style="margin:0 0 24px;line-height:1.5;color:#4b5563;">You will stop receiving the weekly Mementos digest. You can turn it back on any time from Settings in the app.</p>
      <form method="post" action="${unsubscribeUrl(token)}">
        <button type="submit" style="background:#000;color:#fff;border:0;padding:12px 20px;border-radius:8px;font-weight:600;font-size:15px;cursor:pointer;">Unsubscribe</button>
      </form>`);
}

/** POST result page: identical whether or not the token matched a user (no token oracle). */
export function renderUnsubscribedPage(): string {
    return layout('Unsubscribed', html`
      <h1 style="font-size:22px;margin:0 0 16px;">You're unsubscribed</h1>
      <p style="margin:0;line-height:1.5;color:#4b5563;">You will no longer receive the weekly Mementos digest. Changed your mind? Turn it back on from Settings in the app.</p>`);
}

/** Shown when the link is missing its token entirely (not a lookup failure). */
export function renderUnsubscribeInvalidPage(): string {
    return layout('Invalid unsubscribe link', html`
      <h1 style="font-size:22px;margin:0 0 16px;">That link is incomplete</h1>
      <p style="margin:0;line-height:1.5;color:#4b5563;">This unsubscribe link is missing its token. Please use the link from a digest email, or manage email preferences from Settings in the app.</p>`);
}

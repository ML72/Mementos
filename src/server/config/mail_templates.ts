import { EMAIL } from '../settings';
import { OutgoingMail } from '../service/external';

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

const layout = (title: string, body: SafeHtml, footer?: SafeHtml): string => html`<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="font-weight:800;font-size:20px;letter-spacing:-0.5px;margin-bottom:24px;">Mementos</div>
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;">
      ${body}
    </div>
    ${footer && html`<div style="margin-top:16px;padding:0 8px;font-size:12px;line-height:1.5;color:#6b7280;">${footer}</div>`}
  </div>
</body>
</html>`.value;

const BUTTON_STYLE = 'display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px;border:0;cursor:pointer;';

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

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export interface PasswordResetParams {
    to: string;
    code: string;
}

/**
 * Deliberately impersonal: anyone can ask for a reset code for any address, and on an account
 * someone else registered with this address the profile name is theirs, not the reader's.
 */
export function renderPasswordResetEmail({ to, code }: PasswordResetParams): OutgoingMail {
    const minutes = EMAIL.PASSWORD_RESET.EXPIRY_MINUTES;
    const link = `${EMAIL.APP_URL}/reset-password?email=${encodeURIComponent(to)}`;
    const subject = `${code} is your Mementos password reset code`;
    const text =
        `We got a request to reset the password of the Mementos account registered to this address.\n\n` +
        `Your password reset code is: ${code}\n\n` +
        `It expires in ${minutes} minutes. Enter it at ${link} to choose a new password. ` +
        `Resetting signs the account out everywhere else.\n\n` +
        `If you didn't ask for this, you can ignore this email; your password won't change.\n`;
    const body = html`
      <h1 style="font-size:22px;margin:0 0 16px;">Reset your password</h1>
      <p style="margin:0 0 16px;line-height:1.5;">We got a request to reset the password of the Mementos account registered to this address. Your code is:</p>
      <p style="font-size:32px;font-weight:800;letter-spacing:8px;margin:0 0 16px;font-family:SFMono-Regular,Menlo,Consolas,monospace;">${code}</p>
      <p style="margin:0 0 16px;line-height:1.5;color:#4b5563;">It expires in ${minutes} minutes. <a href="${link}" style="color:#111827;">Enter it here</a> to choose a new password. Resetting signs the account out everywhere else.</p>
      <p style="margin:0;line-height:1.5;color:#6b7280;font-size:14px;">If you didn't ask for this, you can ignore this email; your password won't change.</p>`;
    return { to, subject, text, html: layout(subject, body) };
}

// ---------------------------------------------------------------------------
// Weekly digest
// ---------------------------------------------------------------------------

export interface DigestNote {
    subject: string;
    content: string;
    tags: string[];
    /** The author's name, or null for the recipient's own note. */
    authorName: string | null;
}

export interface DigestParams {
    to: string;
    fullName: string;
    notes: DigestNote[];
    unsubscribeToken: string;
}

/** Target of the digest's List-Unsubscribe header and footer link (see renderUnsubscribePage). */
export const unsubscribeUrl = (token: string): string =>
    `${EMAIL.APP_URL}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;

/**
 * A short plain-text taste of a note. Notes are Markdown, which an email can't render (no KaTeX,
 * and HTML built from user content is what this module exists to keep out), so the markers that
 * would read as noise are dropped — headings, quotes, list bullets, code fences, `**`/`__`,
 * backticks, link syntax — and the rest is shown as written. Lone `*`/`_` and LaTeX stay: in
 * running text they are as likely to be content. Cuts on code points, so an emoji is never split.
 */
export const toSnippet = (content: string, maxLength = 200): string => {
    const text = String(content ?? '')
        .replace(/^\s*```.*$/gm, '')
        .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/(\*\*|__)(.+?)\1/g, '$2')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
    const chars = Array.from(text);
    return chars.length <= maxLength ? text : `${chars.slice(0, maxLength - 1).join('').trimEnd()}…`;
};

const noteMeta = (note: DigestNote): string =>
    [note.authorName ?? 'Your note', ...note.tags.map(tag => `#${tag}`)].join(' · ');

export function renderDigestEmail({ to, fullName, notes, unsubscribeToken }: DigestParams): OutgoingMail {
    const writeLink = `${EMAIL.APP_URL}/notes/new`;
    const feedLink = `${EMAIL.APP_URL}/home`;
    const settingsLink = `${EMAIL.APP_URL}/settings`;
    const unsubscribeLink = unsubscribeUrl(unsubscribeToken);
    const subject = 'Your weekly Mementos digest';
    const empty = 'Nothing to review yet. Notes you write, and notes from people you follow, will show up here.';

    const text =
        `Hi ${fullName},\n\n` +
        `What's one thing from this week worth remembering? Write it down while it's fresh:\n${writeLink}\n\n` +
        (notes.length > 0
            ? `Notes to review:\n\n` +
              notes.map(note => `* ${note.subject} (${noteMeta(note)})\n  ${toSnippet(note.content)}\n`).join('\n') +
              `\nOpen your feed: ${feedLink}\n`
            : `${empty}\n`) +
        `\n--\nYou're getting this because your weekly digest is on. ` +
        `Change the day or turn it off: ${settingsLink}\nUnsubscribe: ${unsubscribeLink}\n`;

    const body = html`
      <h1 style="font-size:22px;margin:0 0 12px;">What's worth remembering this week?</h1>
      <p style="margin:0 0 20px;line-height:1.5;color:#374151;">Hi ${fullName}, take a minute to write down one thing from this week you'd like to keep.</p>
      <p style="margin:0 0 32px;"><a href="${writeLink}" style="${BUTTON_STYLE}">Write this week's note</a></p>
      <h2 style="font-size:17px;margin:0 0 4px;">Notes to review</h2>
      ${notes.length > 0
        ? notes.map(note => html`
      <div style="border-top:1px solid #e5e7eb;padding:16px 0;">
        <div style="font-size:13px;color:#6b7280;margin:0 0 4px;">${noteMeta(note)}</div>
        <div style="font-size:16px;font-weight:700;margin:0 0 6px;">${note.subject}</div>
        <div style="font-size:14px;line-height:1.5;color:#374151;">${toSnippet(note.content)}</div>
      </div>`)
        : html`<p style="margin:8px 0 0;line-height:1.5;color:#6b7280;">${empty}</p>`}
      ${notes.length > 0 && html`<p style="margin:8px 0 0;"><a href="${feedLink}" style="color:#111827;font-weight:600;">Open your feed</a></p>`}`;
    const footer = html`You're getting this because your weekly digest is on. <a href="${settingsLink}" style="color:#6b7280;">Change the day or turn it off</a> · <a href="${unsubscribeLink}" style="color:#6b7280;">Unsubscribe</a>`;

    return {
        to,
        subject,
        text,
        html: layout(subject, body, footer),
        headers: {
            // RFC 8058 one-click unsubscribe: the mail client's own "Unsubscribe" button POSTs
            // to this URL. Gmail and Yahoo require it of bulk senders.
            'List-Unsubscribe': `<${unsubscribeLink}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        }
    };
}

// ---------------------------------------------------------------------------
// Unsubscribe page (served by GET/POST /api/email/unsubscribe, not emailed)
// ---------------------------------------------------------------------------

export type UnsubscribePageState = 'confirm' | 'done' | 'invalid' | 'error';

/**
 * The page behind the digest's unsubscribe link. Opening the link only asks, because mail
 * scanners and link prefetchers follow GETs; the form's POST unsubscribes, the same request a
 * mail client's one-click button sends.
 */
export function renderUnsubscribePage(state: UnsubscribePageState, token = ''): string {
    const settingsLink = `${EMAIL.APP_URL}/settings`;
    const settings = html`<a href="${settingsLink}" style="color:#111827;">Settings</a>`;
    const form = (label: string) => html`
      <form method="post" action="/api/email/unsubscribe?token=${encodeURIComponent(token)}" style="margin:0;">
        <button type="submit" style="${BUTTON_STYLE}">${label}</button>
      </form>`;
    const pages: Record<UnsubscribePageState, { title: string; body: SafeHtml }> = {
        confirm: {
            title: 'Unsubscribe from the weekly digest?',
            body: html`
      <p style="margin:0 0 20px;line-height:1.5;color:#4b5563;">You'll stop getting the weekly email with notes to review. You can turn it back on any time in ${settings}.</p>
      ${form('Unsubscribe')}`
        },
        error: {
            title: 'Something went wrong',
            body: html`
      <p style="margin:0 0 20px;line-height:1.5;color:#4b5563;">We couldn't unsubscribe you just now, so nothing has changed yet. Please try again in a moment.</p>
      ${form('Try again')}`
        },
        done: {
            title: "You're unsubscribed",
            body: html`
      <p style="margin:0;line-height:1.5;color:#4b5563;">You won't get the weekly digest anymore. Changed your mind? Turn it back on in ${settings}.</p>`
        },
        invalid: {
            title: "This link doesn't work",
            body: html`
      <p style="margin:0;line-height:1.5;color:#4b5563;">This unsubscribe link is incomplete. You can turn off the weekly digest in ${settings}.</p>`
        }
    };
    const { title, body } = pages[state];
    return layout(title, html`<h1 style="font-size:22px;margin:0 0 16px;">${title}</h1>${body}`);
}

import { describe, it, expect } from '@jest/globals';
import {
    escapeHtml, html, raw, snippet,
    renderPasswordResetEmail, renderDigestEmail, renderUnsubscribeConfirmPage, renderUnsubscribedPage
} from '../../src/server/mail/templates';
import { classifySmtpError } from '../../src/server/mail/mailer';
import { generateResetCode, hashResetCode } from '../../src/server/service/internal/auth';
import { issuedBeforePasswordChange } from '../../src/server/middleware/auth';
import { EMAIL } from '../../src/server/settings';

// Pure unit tests — no database, no mailer.

describe('html template tag', () => {
    it('escapes every interpolated value', () => {
        const out = html`<p>${'<b>&"\'</b>'}</p>`.value;
        expect(out).toBe('<p>&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;</p>');
    });

    it('embeds nested fragments and raw() verbatim, and drops null/undefined/false', () => {
        const inner = html`<i>${'x<y'}</i>`;
        expect(html`${inner}${raw('<hr>')}${null}${undefined}${false}${0}`.value).toBe('<i>x&lt;y</i><hr>0');
    });

    it('renders arrays of fragments in order', () => {
        expect(html`${['a<', html`<b/>`, 'c']}`.value).toBe('a&lt;<b/>c');
    });

    it('escapeHtml leaves safe text alone', () => {
        expect(escapeHtml('plain text 123')).toBe('plain text 123');
        expect(escapeHtml(undefined)).toBe('');
    });
});

describe('snippet', () => {
    it('strips common Markdown and collapses whitespace', () => {
        expect(snippet('# Title\n\nSome **bold** and _it_ with `code` and [a link](http://x) ![img](y)\n\n- item\n1. num'))
            .toBe('Title Some bold and it with code and a link item num');
    });

    it('drops fenced code and math blocks', () => {
        expect(snippet('before ```js\nlet x = 1;\n``` after $$E=mc^2$$ end')).toBe('before after end');
    });

    it('cuts at a word boundary with an ellipsis', () => {
        const text = 'word '.repeat(100).trim();
        const out = snippet(text, 50);
        expect(out.length).toBeLessThanOrEqual(51);
        expect(out.endsWith('…')).toBe(true);
        expect(out).not.toMatch(/wor…$/);
    });

    it('returns short text unchanged', () => {
        expect(snippet('short', 50)).toBe('short');
        expect(snippet('', 50)).toBe('');
    });
});

describe('renderPasswordResetEmail', () => {
    it('puts the code in the subject, text and html, and escapes the name', () => {
        const mail = renderPasswordResetEmail({ to: 'a@b.c', fullName: 'Eve <script>', code: '012345' });
        expect(mail.to).toBe('a@b.c');
        expect(mail.subject).toMatch(/^012345 is your/);
        expect(mail.text).toContain('012345');
        expect(mail.html).toContain('012345');
        expect(mail.html).toContain('Eve &lt;script&gt;');
        expect(mail.html).not.toContain('<script>');
        expect(mail.text).toContain(`${EMAIL.PASSWORD_RESET.EXPIRY_MINUTES} minutes`);
        expect(mail.headers).toBeUndefined();
    });
});

describe('renderDigestEmail', () => {
    const base = { to: 'a@b.c', fullName: 'Ann', unsubscribeToken: 'tok+en/=' };

    it('carries RFC 8058 headers pointing at the unsubscribe endpoint with the token URL-encoded', () => {
        const mail = renderDigestEmail({ ...base, notes: [{ id: '1', subject: 's', content: 'c', tags: [], creatorName: 'x', isOwn: true }] });
        expect(mail.headers?.['List-Unsubscribe']).toBe(`<${EMAIL.APP_URL}/api/email/unsubscribe?token=tok%2Ben%2F%3D>`);
        expect(mail.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
        expect(mail.html).toContain('href="' + escapeHtml(`${EMAIL.APP_URL}/api/email/unsubscribe?token=tok%2Ben%2F%3D`) + '"');
        expect(mail.text).toContain(`${EMAIL.APP_URL}/api/email/unsubscribe?token=tok%2Ben%2F%3D`);
    });

    it('escapes note content, subjects, tags and author names', () => {
        const mail = renderDigestEmail({
            ...base,
            notes: [{
                id: '1', subject: '<img src=x onerror=alert(1)>', content: 'a & b <c>', tags: ['<t>'],
                creatorName: 'Mal "Ory"', isOwn: false
            }]
        });
        expect(mail.html).not.toContain('<img src=x');
        expect(mail.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(mail.html).toContain('a &amp; b &lt;c&gt;');
        expect(mail.html).toContain('&lt;t&gt;');
        expect(mail.html).toContain('By Mal &quot;Ory&quot;');
        expect(mail.text).toContain('a & b <c>');
    });

    it('pluralizes the subject', () => {
        const one = renderDigestEmail({ ...base, notes: [{ id: '1', subject: 's', content: 'c', tags: [], creatorName: 'x', isOwn: true }] });
        expect(one.subject).toContain('1 note to revisit');
        const two = renderDigestEmail({ ...base, notes: Array(2).fill({ id: '1', subject: 's', content: 'c', tags: [], creatorName: 'x', isOwn: true }) });
        expect(two.subject).toContain('2 notes to revisit');
    });
});

describe('unsubscribe pages', () => {
    it('confirmation page posts back to the same URL with the token escaped for HTML', () => {
        const page = renderUnsubscribeConfirmPage('a&b');
        expect(page).toContain('method="post"');
        expect(page).toContain(`action="${escapeHtml(`${EMAIL.APP_URL}/api/email/unsubscribe?token=a%26b`)}"`);
        expect(page).not.toContain('<script');
    });

    it('result page names no token', () => {
        expect(renderUnsubscribedPage()).not.toContain('token=');
    });
});

describe('classifySmtpError', () => {
    it('maps recipient rejections by SMTP reply class', () => {
        expect(classifySmtpError({ code: 'EENVELOPE', responseCode: 550 })).toBe('hard');
        expect(classifySmtpError({ code: 'EMESSAGE', responseCode: 552 })).toBe('hard');
        expect(classifySmtpError({ code: 'EENVELOPE', responseCode: 450 })).toBe('soft');
        expect(classifySmtpError({ code: 'EMESSAGE', responseCode: 421 })).toBe('soft');
    });

    it('treats our own failures as transient, never as a bounce', () => {
        expect(classifySmtpError({ code: 'ECONNECTION' })).toBe('transient');
        expect(classifySmtpError({ code: 'EAUTH', responseCode: 535 })).toBe('transient');
        expect(classifySmtpError({ code: 'ETIMEDOUT' })).toBe('transient');
        expect(classifySmtpError({ responseCode: 500 })).toBe('transient');
        expect(classifySmtpError(new Error('boom'))).toBe('transient');
        expect(classifySmtpError(undefined)).toBe('transient');
    });
});

describe('reset codes', () => {
    it('are exactly CODE_LENGTH digits, zero-padded, and reasonably distributed', () => {
        const codes = Array.from({ length: 2000 }, generateResetCode);
        for (const c of codes) expect(c).toMatch(new RegExp(`^\\d{${EMAIL.PASSWORD_RESET.CODE_LENGTH}}$`));
        expect(new Set(codes).size).toBeGreaterThan(1900);
        // Leading zeros must appear (~10% of codes start with 0).
        expect(codes.filter(c => c.startsWith('0')).length).toBeGreaterThan(100);
    });

    it('hash is a deterministic 64-hex HMAC that differs per code', () => {
        expect(hashResetCode('123456')).toMatch(/^[0-9a-f]{64}$/);
        expect(hashResetCode('123456')).toBe(hashResetCode('123456'));
        expect(hashResetCode('123456')).not.toBe(hashResetCode('123457'));
    });
});

describe('issuedBeforePasswordChange', () => {
    it('rejects tokens issued before the change and keeps same-second tokens', () => {
        const changedAt = new Date('2026-01-01T00:00:00.900Z');
        const sameSecond = Math.floor(changedAt.getTime() / 1000);
        expect(issuedBeforePasswordChange(sameSecond, changedAt)).toBe(false);
        expect(issuedBeforePasswordChange(sameSecond - 1, changedAt)).toBe(true);
        expect(issuedBeforePasswordChange(sameSecond + 1, changedAt)).toBe(false);
        expect(issuedBeforePasswordChange(sameSecond - 3600, changedAt)).toBe(true);
    });
});

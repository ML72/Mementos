import { describe, it, expect, jest } from '@jest/globals';
import {
    escapeHtml, html, raw, toSnippet, unsubscribeUrl,
    renderVerificationEmail, renderPasswordResetEmail, renderDigestEmail, renderUnsubscribePage
} from '../../src/server/config/mail_templates';
import { classifySmtpError } from '../../src/server/service/external/mailer';
import { generateCode, hashCode } from '../../src/server/service/internal/codes';
import { EMAIL } from '../../src/server/settings';

// Pure unit tests — no database, no mailer.

describe('html template tag', () => {
    it('escapes every interpolated value', () => {
        expect(html`<p>${'<b>&"\'</b>'}</p>`.value).toBe('<p>&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;</p>');
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

describe('renderVerificationEmail', () => {
    it('puts the code in the subject, text and html, links to the verify page, and escapes the name', () => {
        const mail = renderVerificationEmail({ to: 'a+b@c.d', fullName: 'Eve <script>', code: '012345' });
        expect(mail.to).toBe('a+b@c.d');
        expect(mail.subject).toMatch(/^012345 is your/);
        expect(mail.text).toContain('012345');
        expect(mail.html).toContain('012345');
        expect(mail.html).toContain('Eve &lt;script&gt;');
        expect(mail.html).not.toContain('<script>');
        expect(mail.text).toContain(`${EMAIL.APP_URL}/verify-email?email=a%2Bb%40c.d`);
        expect(mail.text).toContain(`${EMAIL.VERIFICATION.EXPIRY_MINUTES} minutes`);
    });
});

describe('renderPasswordResetEmail', () => {
    it('puts the code in the subject, text and html, and links to the reset page', () => {
        const mail = renderPasswordResetEmail({ to: 'a+b@c.d', code: '009876' });
        expect(mail.to).toBe('a+b@c.d');
        expect(mail.subject).toMatch(/^009876 is your Mementos password reset code$/);
        expect(mail.text).toContain('009876');
        expect(mail.html).toContain('009876');
        expect(mail.text).toContain(`${EMAIL.APP_URL}/reset-password?email=a%2Bb%40c.d`);
        expect(mail.text).toContain(`${EMAIL.PASSWORD_RESET.EXPIRY_MINUTES} minutes`);
    });
});

describe('toSnippet', () => {
    it('drops the Markdown markers that would read as noise', () => {
        expect(toSnippet('# Title\nSome **bold** and __strong__ text')).toBe('Title Some bold and strong text');
        expect(toSnippet('- one\n* two\n1. three\n> quoted `code`')).toBe('one two three quoted code');
        expect(toSnippet('see [the docs](https://x.y) and ![a chart](c.png)')).toBe('see the docs and a chart');
        expect(toSnippet('```js\nlet x;\n```')).toBe('let x;');
    });

    it('leaves lone underscores, asterisks and LaTeX alone', () => {
        expect(toSnippet('snake_case and a*b where $x_1 + y^2$')).toBe('snake_case and a*b where $x_1 + y^2$');
    });

    it('cuts long notes on code points and marks the cut', () => {
        expect(toSnippet('word '.repeat(100), 20)).toBe('word word word word…');
        const emoji = toSnippet('😀'.repeat(50), 10);
        expect(Array.from(emoji)).toHaveLength(10);
        expect(emoji).toBe(`${'😀'.repeat(9)}…`);
        expect(toSnippet('short')).toBe('short');
    });
});

describe('renderDigestEmail', () => {
    const notes = [
        { subject: 'Mine <b>bold</b>', content: '**Own** content', tags: ['x"y'], authorName: null },
        { subject: 'Theirs', content: 'Followed <script>alert(1)</script>', tags: [], authorName: 'Eve <img>' }
    ];
    const mail = renderDigestEmail({ to: 'reader@example.com', fullName: 'Ann <i>', notes, unsubscribeToken: 'tok_en-123' });

    it('opens with the reminder to write this week\'s note, before the notes to review', () => {
        const reminder = mail.html.indexOf('Write this week');
        expect(reminder).toBeGreaterThan(-1);
        expect(reminder).toBeLessThan(mail.html.indexOf('Notes to review'));
        expect(mail.html).toContain(`${EMAIL.APP_URL}/notes/new`);
        expect(mail.text.indexOf('/notes/new')).toBeLessThan(mail.text.indexOf('Notes to review'));
    });

    it('labels own notes and others\' by author, and escapes everything user-written', () => {
        expect(mail.html).toContain('Your note');
        expect(mail.html).toContain('Mine &lt;b&gt;bold&lt;/b&gt;');
        expect(mail.html).toContain('Eve &lt;img&gt;');
        expect(mail.html).toContain('Followed &lt;script&gt;alert(1)&lt;/script&gt;');
        expect(mail.html).toContain('#x&quot;y');
        expect(mail.html).toContain('Ann &lt;i&gt;');
        expect(mail.html).not.toMatch(/<script|<img|<b>bold/);
        expect(mail.text).toContain('Mine <b>bold</b> (Your note · #x"y)');
    });

    it('carries one-click unsubscribe headers and a footer link to the same URL', () => {
        const url = unsubscribeUrl('tok_en-123');
        expect(url).toBe(`${EMAIL.APP_URL}/api/email/unsubscribe?token=tok_en-123`);
        expect(mail.headers).toEqual({
            'List-Unsubscribe': `<${url}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        });
        expect(mail.html).toContain(url);
        expect(mail.text).toContain(`Unsubscribe: ${url}`);
        expect(mail.html).toContain(`${EMAIL.APP_URL}/settings`);
    });

    it('still sends the reminder when there is nothing to review', () => {
        const empty = renderDigestEmail({ to: 'a@b.c', fullName: 'A', notes: [], unsubscribeToken: 't' });
        expect(empty.html).toContain('Write this week');
        expect(empty.html).toContain('Nothing to review yet');
        expect(empty.html).not.toContain('Open your feed');
    });
});

describe('renderUnsubscribePage', () => {
    it('asks first, with a form that POSTs the token', () => {
        const page = renderUnsubscribePage('confirm', 'abc_DEF-123');
        expect(page).toMatch(/<form method="post" action="\/api\/email\/unsubscribe\?token=abc_DEF-123"/);
        expect(page).toContain('Unsubscribe from the weekly digest?');
    });

    it('offers to try again after a failure, and has no form once done or for a bad link', () => {
        expect(renderUnsubscribePage('error', 'abc')).toContain('<form method="post"');
        expect(renderUnsubscribePage('done')).not.toContain('<form');
        expect(renderUnsubscribePage('invalid')).not.toContain('<form');
        expect(renderUnsubscribePage('done')).toContain(`${EMAIL.APP_URL}/settings`);
    });

    it('cannot be broken out of through the token', () => {
        const page = renderUnsubscribePage('confirm', '"><script>x</script>');
        expect(page).not.toContain('<script>');
    });
});

describe('classifySmtpError', () => {
    it('maps recipient rejections by SMTP reply class', () => {
        expect(classifySmtpError({ code: 'EENVELOPE', responseCode: 550 })).toBe('hard');
        expect(classifySmtpError({ code: 'EMESSAGE', responseCode: 552 })).toBe('hard');
        expect(classifySmtpError({ code: 'EENVELOPE', responseCode: 450 })).toBe('soft');
    });

    it('treats our own failures as transient, never as a bounce', () => {
        expect(classifySmtpError({ code: 'ECONNECTION' })).toBe('transient');
        expect(classifySmtpError({ code: 'EAUTH', responseCode: 535 })).toBe('transient');
        expect(classifySmtpError({ responseCode: 500 })).toBe('transient');
        expect(classifySmtpError(undefined)).toBe('transient');
    });
});

describe('email settings', () => {
    // settings.ts reads the environment once, at import, so each case loads a fresh copy. Every
    // variable read is predefined (empty = unset): dotenv never overrides an existing key, so a
    // developer's .env can't leak into these cases.
    const UNSET = { SMTP_HOST: '', SMTP_PORT: '', SMTP_SECURE: '', APP_URL: '', WWW_REDIRECT_HOST: '', WEBSITE_HOSTNAME: '' };
    const loadEmailSettings = async (env: Record<string, string>): Promise<any> => {
        const saved = process.env;
        process.env = { ...saved, ...UNSET, ...env };
        try {
            let email: any;
            await jest.isolateModulesAsync(async () => {
                email = (await import('../../src/server/settings')).EMAIL;
            });
            return email;
        } finally {
            process.env = saved;
        }
    };

    it('sends over SMTP once SMTP_HOST is set, and prints to the console otherwise', async () => {
        expect((await loadEmailSettings({ NODE_ENV: 'development', SMTP_HOST: 'smtp.example.com' })).TRANSPORT).toBe('smtp');
        expect((await loadEmailSettings({ NODE_ENV: 'development' })).TRANSPORT).toBe('console');
    });

    it('always captures mail in memory under test, even with SMTP configured', async () => {
        const email = await loadEmailSettings({ SMTP_HOST: 'smtp.example.com' });
        expect(email.TRANSPORT).toBe('memory');
    });

    it('defaults SMTP_SECURE from the port, and an explicit value wins', async () => {
        expect((await loadEmailSettings({ SMTP_PORT: '465' })).SMTP.SECURE).toBe(true);
        expect((await loadEmailSettings({ SMTP_PORT: '587' })).SMTP.SECURE).toBe(false);
        expect((await loadEmailSettings({ SMTP_PORT: '465', SMTP_SECURE: 'false' })).SMTP.SECURE).toBe(false);
    });

    it('links to APP_URL, else the www host the apex redirects to, else the Azure host name', async () => {
        const azure = { WEBSITE_HOSTNAME: 'mementos.azurewebsites.net' };
        expect((await loadEmailSettings({ ...azure, WWW_REDIRECT_HOST: 'mementos.info', APP_URL: 'https://app.example.com/' })).APP_URL)
            .toBe('https://app.example.com');
        expect((await loadEmailSettings({ ...azure, WWW_REDIRECT_HOST: ' Mementos.info ' })).APP_URL).toBe('https://www.mementos.info');
        expect((await loadEmailSettings(azure)).APP_URL).toBe('https://mementos.azurewebsites.net');
        expect((await loadEmailSettings({})).APP_URL).toBe('http://localhost:5173');
    });
});

describe('one-time codes', () => {
    it('are exactly the requested length, zero-padded, and well spread', () => {
        const codes = Array.from({ length: 2000 }, () => generateCode(6));
        for (const c of codes) expect(c).toMatch(/^\d{6}$/);
        expect(new Set(codes).size).toBeGreaterThan(1900);
        expect(codes.filter(c => c.startsWith('0')).length).toBeGreaterThan(100);
    });

    it('hash to a deterministic 64-hex HMAC that differs per code', () => {
        expect(hashCode('123456')).toMatch(/^[0-9a-f]{64}$/);
        expect(hashCode('123456')).toBe(hashCode('123456'));
        expect(hashCode('123456')).not.toBe(hashCode('123457'));
    });
});

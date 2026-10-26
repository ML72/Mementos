import { describe, it, expect, jest } from '@jest/globals';
import { escapeHtml, html, raw, renderVerificationEmail } from '../../src/server/config/mail_templates';
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
    const UNSET = { SMTP_HOST: '', SMTP_PORT: '', SMTP_SECURE: '' };
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

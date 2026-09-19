import { describe, it, expect } from '@jest/globals';
import { escapeHtml, html, raw, renderVerificationEmail } from '../../src/server/mail/templates';
import { classifySmtpError } from '../../src/server/mail/mailer';
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

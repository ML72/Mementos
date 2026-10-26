/**
 * Local email tooling. Not part of the server build, and needs neither MongoDB nor the server.
 *
 *   npm run email:preview            render every template with sample data and print a
 *                                    file:// link to its HTML and plain-text versions
 *   npm run email:send -- <address>  send every template to <address> over the SMTP settings in
 *                                    .env, exactly as the server would
 *
 * Add a sample below when you add a template.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { renderVerificationEmail } from '../src/server/config/mail_templates';
import { getMailer, SendFailure, SmtpMailer } from '../src/server/service/external/mailer';
import type { OutgoingMail } from '../src/server/service/external/mailer';

const SAMPLES: Record<string, (to: string) => OutgoingMail> = {
    verification: to => renderVerificationEmail({ to, fullName: 'Ada Lovelace', code: '012345' })
};

// Outside the repo, so previews never show up in git; re-running overwrites them in place.
const PREVIEW_DIR = path.join(os.tmpdir(), 'mementos-email-preview');

function preview(): void {
    fs.mkdirSync(PREVIEW_DIR, { recursive: true });
    for (const [name, render] of Object.entries(SAMPLES)) {
        const mail = render('preview@example.com');
        const htmlFile = path.join(PREVIEW_DIR, `${name}.html`);
        const textFile = path.join(PREVIEW_DIR, `${name}.txt`);
        fs.writeFileSync(htmlFile, mail.html);
        fs.writeFileSync(textFile, `Subject: ${mail.subject}\n\n${mail.text}`);
        console.log(`${name}\n  html: ${pathToFileURL(htmlFile)}\n  text: ${pathToFileURL(textFile)}`);
    }
}

async function send(to: string | undefined): Promise<void> {
    if (!to) throw new Error('Usage: npm run email:send -- <address>');
    const mailer = getMailer();
    if (!(mailer instanceof SmtpMailer)) {
        throw new Error(
            'SMTP_HOST is not set. Add the SMTP_* variables to .env; ' +
            'see docs/ENVIRONMENT_OVERVIEW.md#email.'
        );
    }
    if (!(await mailer.verify())) {
        process.exitCode = 1; // verify() has already logged why
        return;
    }
    for (const [name, render] of Object.entries(SAMPLES)) {
        await mailer.send(render(to));
        console.log(`Sent "${name}" to ${to}`);
    }
}

async function main(): Promise<void> {
    const [command, arg] = process.argv.slice(2);
    if (command === 'preview') return preview();
    if (command === 'send') return send(arg);
    throw new Error('Usage: ts-node scripts/email.ts preview | send <address>');
}

main().catch((err: any) => {
    // `kind` says whether the provider blamed the address (hard/soft) or the problem is ours.
    console.error(err instanceof SendFailure ? `Send failed (${err.kind}): ${err.message}` : err?.message || err);
    process.exitCode = 1;
});

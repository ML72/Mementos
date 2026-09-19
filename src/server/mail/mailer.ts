import nodemailer, { Transporter } from 'nodemailer';
import { EMAIL, NODE_ENV } from '../settings';

/** One outgoing message: templates produce these, a Mailer delivers them. */
export interface OutgoingMail {
    to: string;
    subject: string;
    text: string;
    html: string;
    headers?: Record<string, string>;
}

/**
 * Why a send failed, reduced to what delivery-health bookkeeping needs to know.
 *  - hard:      the address does not exist (5xx on the recipient) — stop mailing it
 *  - soft:      temporary (4xx: full mailbox, greylisting) — count it, suppress at a threshold
 *  - transient: our side or the network (connection refused, auth) — says nothing about the address
 */
export type SendFailureKind = 'hard' | 'soft' | 'transient';

export class SendFailure extends Error {
    constructor(public readonly kind: SendFailureKind, message: string, public readonly cause?: unknown) {
        super(message);
        this.name = 'SendFailure';
    }
}

export interface Mailer {
    readonly name: string;
    /** Resolves when the message was accepted for delivery; rejects with a SendFailure otherwise. */
    send(mail: OutgoingMail): Promise<void>;
}

/**
 * Map a nodemailer/SMTP error onto a SendFailureKind. nodemailer surfaces the SMTP reply code as
 * `responseCode` and the failing phase as `code` (`EENVELOPE` = rejected at RCPT TO, `EMESSAGE` =
 * rejected after DATA, `ECONNECTION`/`EAUTH` = never got that far). Anything not clearly about
 * the recipient is transient: writing `bounced` for what was really our outage would silently
 * stop that user's mail.
 */
export function classifySmtpError(err: any): SendFailureKind {
    const code: number | undefined = typeof err?.responseCode === 'number' ? err.responseCode : undefined;
    const phase: string | undefined = err?.code;
    if (phase === 'ECONNECTION' || phase === 'EAUTH' || phase === 'ESOCKET' || phase === 'EDNS' || phase === 'ETIMEDOUT') {
        return 'transient';
    }
    if (code !== undefined && code >= 500 && code < 600) {
        return (phase === 'EENVELOPE' || phase === 'EMESSAGE') ? 'hard' : 'transient';
    }
    if (code !== undefined && code >= 400 && code < 500) {
        return (phase === 'EENVELOPE' || phase === 'EMESSAGE') ? 'soft' : 'transient';
    }
    return 'transient';
}

/** Real delivery over SMTP via nodemailer. */
export class SmtpMailer implements Mailer {
    readonly name = 'smtp';
    private readonly transporter: Transporter;

    constructor() {
        const smtp = EMAIL.SMTP;
        this.transporter = smtp.URL
            ? nodemailer.createTransport(smtp.URL)
            : nodemailer.createTransport({
                host: smtp.HOST,
                port: smtp.PORT,
                secure: smtp.SECURE,
                auth: smtp.USER ? { user: smtp.USER, pass: smtp.PASS } : undefined
            });
    }

    /** Connect and authenticate without sending anything; resolves false (and logs) on failure. */
    async verify(): Promise<boolean> {
        try {
            await this.transporter.verify();
            return true;
        } catch (err: any) {
            console.error(`EMAIL: SMTP check failed (${err?.code || 'error'}): ${err?.message || err}`);
            return false;
        }
    }

    async send(mail: OutgoingMail): Promise<void> {
        try {
            const info = await this.transporter.sendMail({ from: EMAIL.FROM, ...mail });
            // With a single recipient nodemailer throws on rejection, but be defensive about
            // servers that accept the envelope and report the rejection in the result.
            if (Array.isArray(info?.rejected) && info.rejected.length > 0 && (!info.accepted || info.accepted.length === 0)) {
                throw new SendFailure('hard', `Recipient rejected: ${info.response || 'no response'}`);
            }
        } catch (err: any) {
            if (err instanceof SendFailure) throw err;
            throw new SendFailure(classifySmtpError(err), err?.message || 'SMTP send failed', err);
        }
    }
}

/**
 * Development transport: prints the message instead of delivering it, so the whole flow (emailed
 * codes included) can be exercised with no mail server. Never used when SMTP is configured.
 */
export class ConsoleMailer implements Mailer {
    readonly name = 'console';

    async send(mail: OutgoingMail): Promise<void> {
        const headers = Object.entries(mail.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
        console.log(
            `\n----- EMAIL (not delivered: no SMTP configured) -----\n` +
            `To: ${mail.to}\nSubject: ${mail.subject}\n${headers ? headers + '\n' : ''}\n${mail.text}\n` +
            `------------------------------------------------------\n`
        );
    }
}

/**
 * Test transport: keeps every message in memory so tests can read a code back out, and
 * can be told to fail so delivery handling is testable without a mail server.
 */
export class MemoryMailer implements Mailer {
    readonly name = 'memory';
    readonly sent: OutgoingMail[] = [];
    /** When set, the next `send` rejects with this failure (then clears itself). */
    failNextWith: SendFailure | null = null;
    /** When set, every send to this address fails with the given kind. */
    failAddresses = new Map<string, SendFailureKind>();

    async send(mail: OutgoingMail): Promise<void> {
        if (this.failNextWith) {
            const failure = this.failNextWith;
            this.failNextWith = null;
            throw failure;
        }
        const kind = this.failAddresses.get(mail.to.toLowerCase());
        if (kind) throw new SendFailure(kind, `Simulated ${kind} failure for ${mail.to}`);
        this.sent.push(mail);
    }

    reset(): void {
        this.sent.length = 0;
        this.failNextWith = null;
        this.failAddresses.clear();
    }

    /** Messages sent to one address (case-insensitive), oldest first. */
    to(address: string): OutgoingMail[] {
        return this.sent.filter(m => m.to.toLowerCase() === address.toLowerCase());
    }
}

const buildMailer = (): Mailer => {
    switch (EMAIL.TRANSPORT) {
        case 'smtp': return new SmtpMailer();
        case 'memory': return new MemoryMailer();
        default: return new ConsoleMailer();
    }
};

let current: Mailer | null = null;

/** The process-wide mailer, built lazily from settings. */
export function getMailer(): Mailer {
    if (!current) {
        current = buildMailer();
        if (NODE_ENV === 'production' && current.name !== 'smtp') {
            console.warn('EMAIL: no SMTP configured (SMTP_URL or SMTP_HOST). Email will be logged to the console, not delivered.');
        }
    }
    return current;
}

/** Swap the mailer (tests inject a MemoryMailer; pass null to rebuild from settings). */
export function setMailer(mailer: Mailer | null): void {
    current = mailer;
}

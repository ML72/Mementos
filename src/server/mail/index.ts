export { getMailer, setMailer, classifySmtpError, SendFailure, MemoryMailer, ConsoleMailer, SmtpMailer } from './mailer';
export type { Mailer, OutgoingMail, SendFailureKind } from './mailer';
export { escapeHtml, html, raw, renderVerificationEmail } from './templates';
export type { VerificationParams } from './templates';

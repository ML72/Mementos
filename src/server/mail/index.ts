export { getMailer, setMailer, classifySmtpError, SendFailure, MemoryMailer, ConsoleMailer, SmtpMailer } from './mailer';
export type { Mailer, OutgoingMail, SendFailureKind } from './mailer';
export {
    escapeHtml, html, raw, snippet,
    renderVerificationEmail, renderPasswordResetEmail, renderDigestEmail, unsubscribeUrl,
    renderUnsubscribeConfirmPage, renderUnsubscribedPage, renderUnsubscribeInvalidPage
} from './templates';
export type { VerificationParams, DigestNote, DigestParams, PasswordResetParams } from './templates';

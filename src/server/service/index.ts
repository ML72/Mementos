export { AuthService, UserService, NotesService, FeedService, CodeService, DigestService, startDigestScheduler } from './internal';
export {
    INVALID_VERIFICATION_CODE, INVALID_RESET_CODE, EMAIL_UNVERIFIED, WRONG_CURRENT_PASSWORD, SESSION_EXPIRED, SESSION_REVOKED
} from './internal';
export type {
    AuthenticateUserResult,
    GetUserResult,
    VerifyTokenResult,
    SendVerificationResult,
    SendPasswordResetResult,
    VerifyEmailResult,
    PasswordChangeResult,
    CreateUserData,
    CreateUserResult,
    EmailSettings,
    SettingsResult,
    CreateNoteData,
    UpdateNoteData,
    NoteResult,
    FeedResult,
    DigestRunResult
} from './internal';
export { getMailer, setMailer, checkMailer, classifySmtpError, SendFailure, MemoryMailer, ConsoleMailer, SmtpMailer } from './external';
export type { Mailer, OutgoingMail, SendFailureKind } from './external';

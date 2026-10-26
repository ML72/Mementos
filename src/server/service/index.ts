export { AuthService, UserService, NotesService, FeedService, CodeService } from './internal';
export { INVALID_VERIFICATION_CODE, EMAIL_UNVERIFIED } from './internal';
export type {
    AuthenticateUserResult,
    GetUserResult,
    SendVerificationResult,
    VerifyEmailResult,
    CreateUserData,
    CreateUserResult,
    CreateNoteData,
    UpdateNoteData,
    NoteResult,
    FeedResult
} from './internal';
export { getMailer, setMailer, checkMailer, classifySmtpError, SendFailure, MemoryMailer, ConsoleMailer, SmtpMailer } from './external';
export type { Mailer, OutgoingMail, SendFailureKind } from './external';

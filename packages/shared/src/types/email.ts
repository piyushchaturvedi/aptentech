/**
 * Lead conversations and the email that carries them.
 *
 * A lead owns exactly one conversation. Everything said to or by the client — the original
 * enquiry, the automatic confirmation, every admin reply and every client reply that comes
 * back in — is a message on that one thread, so the admin reads a single chronological
 * history rather than reassembling it from an outbox and an inbox.
 */

/** Who produced a message. `SYSTEM` covers mail the application sent on its own. */
export const MESSAGE_AUTHORS = ['CLIENT', 'ADMIN', 'SYSTEM'] as const;
export type MessageAuthor = (typeof MESSAGE_AUTHORS)[number];

/**
 * How a message entered the thread.
 *
 * `FORM` is the submission itself, which is a message even though no email carried it —
 * without it the thread would start with the reply to something invisible.
 */
export const MESSAGE_KINDS = [
  'FORM',
  'CONFIRMATION',
  'ADMIN_NOTIFICATION',
  'ADMIN_REPLY',
  'CLIENT_REPLY',
  'FOLLOW_UP',
] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

/**
 * Delivery lifecycle of one outbound email.
 *
 * `QUEUED` is the state a message is created in, before any provider call. That ordering is
 * what stops a provider outage from losing a lead: the enquiry and its thread are already
 * committed, and delivery catches up separately.
 */
export const EMAIL_STATUSES = ['QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/** Template slots the application fills. A template may only reference these. */
export const TEMPLATE_KINDS = [
  'ADMIN_NEW_LEAD',
  'CLIENT_CONFIRMATION',
  'ADMIN_REPLY',
  'CLIENT_FOLLOW_UP',
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/**
 * Every variable a template is allowed to use.
 *
 * The list is closed on purpose. Rendering resolves a name against this set and leaves
 * anything else untouched, so a template cannot reach into arbitrary application state by
 * guessing a property path, and a typo shows up as visible text rather than as a blank.
 */
export const TEMPLATE_VARIABLES = [
  'clientName',
  'clientEmail',
  'clientPhone',
  'clientCompany',
  'serviceName',
  'budget',
  'message',
  'leadId',
  'leadStatus',
  'siteName',
  'siteUrl',
  'sourcePage',
  'submittedAt',
  'adminName',
  'replyBody',
  'leadUrl',
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export interface EmailTemplate {
  id: string;
  kind: TemplateKind;
  name: string;
  description: string;
  subject: string;
  html: string;
  text: string;
  active: boolean;
  /** A built-in template cannot be deleted — the application depends on its slot existing. */
  builtIn: boolean;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One delivery attempt's outcome, kept so a failure can be explained rather than guessed at. */
export interface EmailAttempt {
  at: string;
  status: EmailStatus;
  error: string | null;
}

export interface ConversationMessage {
  id: string;
  author: MessageAuthor;
  kind: MessageKind;
  /** Display name of whoever wrote it; for a client this is the lead's own name. */
  authorName: string;
  authorEmail: string;
  subject: string;
  /** Sanitised HTML. Always safe to render — the sanitiser runs before storage. */
  html: string;
  text: string;
  to: string[];
  cc: string[];
  bcc: string[];
  status: EmailStatus;
  /** Null for a message that never involved an email, such as the form submission itself. */
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  attempts: EmailAttempt[];
  lastError: string | null;
  providerId: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  leadId: string;
  subject: string;
  messages: ConversationMessage[];
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * An inbound email that could not be attached to a thread with confidence.
 *
 * Guessing would be worse than not matching: a misattached reply puts one client's words in
 * another client's history. These are held for an administrator to place or discard.
 */
export interface UnmatchedInboundEmail {
  id: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  text: string;
  html: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  reason: string;
  resolved: boolean;
  resolvedLeadId: string | null;
  createdAt: string;
}

/** Email delivery settings an administrator owns. Provider credentials are never here. */
export interface EmailSettings {
  /** Where new-lead notifications go. */
  notifyTo: string;
  notifyCc: string[];
  notifyBcc: string[];
  /** Display name on outgoing mail; the address itself is environment configuration. */
  senderName: string;
  replyTo: string;
  /** Turns client confirmations off without deleting the template. */
  sendClientConfirmation: boolean;
  sendAdminNotification: boolean;
}

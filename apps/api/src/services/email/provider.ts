/**
 * Email delivery, behind one interface.
 *
 * Everything above this file describes *what* to send; only the adapters below know *how*.
 * That separation is what lets the provider change without touching the conversation, the
 * templates or the admin — and it is why the development default can be a driver that
 * writes to the log instead of mailing anyone.
 */
import crypto from 'node:crypto';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export interface OutgoingEmail {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  text: string;
  fromName: string;
  replyTo: string;
  /** Set by the caller so the sent message can be recognised when a reply comes back. */
  messageId: string;
  inReplyTo: string | null;
  references: string[];
}

export interface SendResult {
  /** The provider's identifier, for tracing a delivery in their console. */
  providerId: string | null;
}

export interface EmailProvider {
  readonly name: string;
  send(message: OutgoingEmail): Promise<SendResult>;
}

/**
 * A `Message-ID` this application owns.
 *
 * Threading depends on the local part being unpredictable and unique: it is what a reply
 * echoes back in `In-Reply-To`, and it is matched against stored messages to find the
 * thread. A guessable id would let anyone graft a message onto someone else's conversation.
 */
export function newMessageId(): string {
  return `<${Date.now().toString(36)}.${crypto.randomBytes(12).toString('hex')}@${env.EMAIL_MESSAGE_ID_DOMAIN}>`;
}

/**
 * Rejects anything that could break out of a header.
 *
 * Header injection is the classic email vulnerability: a newline in a display name or a
 * subject lets an attacker append headers of their own, most usefully a `Bcc:` that copies
 * mail somewhere else. Validation already blocks this at the edge; this is the last line,
 * applied to every value on its way out, because a header assembled from several sources is
 * exactly where an unvalidated one slips through.
 */
export function assertHeaderSafe(label: string, value: string): string {
  if (/[\r\n\u2028\u2029\0]/.test(value)) {
    throw new Error(`Refusing to send: ${label} contains a line break`);
  }
  return value;
}

function guardMessage(message: OutgoingEmail): void {
  assertHeaderSafe('subject', message.subject);
  assertHeaderSafe('sender name', message.fromName);
  assertHeaderSafe('reply-to', message.replyTo);
  for (const address of [...message.to, ...message.cc, ...message.bcc]) {
    assertHeaderSafe('recipient', address);
  }
  if (message.to.length === 0) throw new Error('Refusing to send: no recipient');
}

/** Development default: records the message and reports success without contacting anyone. */
class LogProvider implements EmailProvider {
  readonly name = 'log';

  async send(message: OutgoingEmail): Promise<SendResult> {
    logger.info(
      {
        to: message.to,
        cc: message.cc,
        subject: message.subject,
        messageId: message.messageId,
        inReplyTo: message.inReplyTo,
        bytes: message.html.length,
      },
      'Email (log driver — not delivered)',
    );
    return { providerId: null };
  }
}

class SmtpProvider implements EmailProvider {
  readonly name = 'smtp';

  async send(message: OutgoingEmail): Promise<SendResult> {
    // Imported lazily so a deployment that uses SES or the log driver need not install it.
    const nodemailer = await import('nodemailer').catch(() => {
      throw new Error('EMAIL_DRIVER=smtp requires the "nodemailer" package to be installed');
    });

    const transport = nodemailer.default.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    });

    const info = await transport.sendMail({
      from: { name: message.fromName, address: env.EMAIL_FROM },
      to: message.to,
      cc: message.cc.length ? message.cc : undefined,
      bcc: message.bcc.length ? message.bcc : undefined,
      replyTo: message.replyTo || undefined,
      subject: message.subject,
      text: message.text,
      html: message.html,
      messageId: message.messageId,
      inReplyTo: message.inReplyTo ?? undefined,
      references: message.references.length ? message.references : undefined,
    });

    return { providerId: info.messageId ?? null };
  }
}

/**
 * Amazon SES.
 *
 * `SendRawEmail` is used rather than the simpler `SendEmail` because only the raw form lets
 * us set `Message-ID`, `In-Reply-To` and `References` — without those, replies cannot be
 * threaded, which is most of what this feature is for.
 */
class SesProvider implements EmailProvider {
  readonly name = 'ses';

  async send(message: OutgoingEmail): Promise<SendResult> {
    const { SESv2Client, SendEmailCommand } = await import('@aws-sdk/client-sesv2').catch(() => {
      throw new Error('EMAIL_DRIVER=ses requires the "@aws-sdk/client-sesv2" package to be installed');
    });

    const client = new SESv2Client({ region: env.AWS_REGION });
    const raw = buildRawMessage(message);

    const result = await client.send(
      new SendEmailCommand({
        FromEmailAddress: `${quoteDisplayName(message.fromName)} <${env.EMAIL_FROM}>`,
        Destination: {
          ToAddresses: message.to,
          CcAddresses: message.cc.length ? message.cc : undefined,
          BccAddresses: message.bcc.length ? message.bcc : undefined,
        },
        Content: { Raw: { Data: new TextEncoder().encode(raw) } },
      }),
    );

    return { providerId: result.MessageId ?? null };
  }
}

/** Wraps a display name so a comma or quote in it cannot split the address list. */
function quoteDisplayName(name: string): string {
  return `"${name.replace(/["\\]/g, '\\$&')}"`;
}

/**
 * Assembles a MIME message with both bodies.
 *
 * Sending text and HTML as `multipart/alternative` is not decoration: a plain-text part is
 * what makes the message readable in clients that refuse HTML, and its absence is one of the
 * strongest spam signals there is.
 */
export function buildRawMessage(message: OutgoingEmail): string {
  const boundary = `----=_Part_${crypto.randomBytes(16).toString('hex')}`;
  const headers: string[] = [
    `From: ${quoteDisplayName(message.fromName)} <${env.EMAIL_FROM}>`,
    `To: ${message.to.join(', ')}`,
  ];

  if (message.cc.length) headers.push(`Cc: ${message.cc.join(', ')}`);
  if (message.replyTo) headers.push(`Reply-To: ${message.replyTo}`);
  headers.push(`Subject: ${encodeHeaderValue(message.subject)}`);
  headers.push(`Message-ID: ${message.messageId}`);
  if (message.inReplyTo) headers.push(`In-Reply-To: ${message.inReplyTo}`);
  if (message.references.length) headers.push(`References: ${message.references.join(' ')}`);
  headers.push('MIME-Version: 1.0');
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    chunk(Buffer.from(message.text, 'utf8').toString('base64')),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    chunk(Buffer.from(message.html, 'utf8').toString('base64')),
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return `${headers.join('\r\n')}\r\n\r\n${body}`;
}

/**
 * Encodes a header that may hold non-ASCII.
 *
 * A raw UTF-8 subject is not valid in a header and arrives as mojibake; RFC 2047 encoding is
 * what makes an accented name or a currency symbol survive the trip.
 */
function encodeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** SMTP lines are limited to 998 octets; base64 is wrapped so a long body stays valid. */
function chunk(base64: string): string {
  return (base64.match(/.{1,76}/g) ?? []).join('\r\n');
}

let provider: EmailProvider | null = null;

export function emailProvider(): EmailProvider {
  if (provider) return provider;
  provider =
    env.EMAIL_DRIVER === 'ses' ? new SesProvider() : env.EMAIL_DRIVER === 'smtp' ? new SmtpProvider() : new LogProvider();
  return provider;
}

/** Sends after the header guard. Every outbound path goes through here. */
export async function deliver(message: OutgoingEmail): Promise<SendResult> {
  guardMessage(message);
  return emailProvider().send(message);
}

/** Test seam: lets the suite substitute a provider without a real transport. */
export function setEmailProvider(next: EmailProvider | null): void {
  provider = next;
}

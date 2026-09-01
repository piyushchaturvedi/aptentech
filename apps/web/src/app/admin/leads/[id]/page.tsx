'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { Conversation, ConversationMessage, EmailTemplate, Lead, LeadStatus } from '@aptentech/shared';
import { LEAD_STATUSES } from '@aptentech/shared';
import { useAdmin } from '@/components/admin/AdminClient';

/**
 * One lead, read as a conversation.
 *
 * The thread is the point of this screen: the enquiry, the automatic confirmation, every
 * reply in both directions, in the order they happened. Delivery state sits on each message
 * rather than in a separate log, because "did that reach them?" is a question about a
 * particular message and is otherwise impossible to answer from the admin.
 */

interface ConversationPayload {
  conversation: Conversation | null;
  templates: Array<Pick<EmailTemplate, 'id' | 'kind' | 'name' | 'subject' | 'html' | 'text'> & { _id?: string }>;
  settings: { senderName: string; replyTo: string };
}

/**
 * A key that identifies this composition attempt.
 *
 * Generated once when the composer opens and sent unchanged, so a double-click or a retried
 * request is recognised by the server as the same reply instead of mailing the client twice.
 */
function newDedupeKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export default function LeadDetailPage() {
  const { request, session } = useAdmin();
  const params = useParams<{ id: string }>();
  const leadId = params?.id ?? '';

  const [lead, setLead] = useState<Lead | null>(null);
  const [payload, setPayload] = useState<ConversationPayload | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  // Composer
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [dedupeKey, setDedupeKey] = useState(newDedupeKey);
  const [sent, setSent] = useState('');

  const load = useCallback(async () => {
    if (!leadId) return;
    try {
      const [leadData, conv] = await Promise.all([
        request<Lead>(`/leads/${leadId}`),
        request<ConversationPayload>(`/leads/${leadId}/conversation`),
      ]);
      setLead(leadData);
      setPayload(conv);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load that lead.');
    }
  }, [request, leadId]);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  // A sensible default subject, so replying is one click and a sentence.
  useEffect(() => {
    if (lead && !subject) setSubject(`Re: ${payload?.conversation?.subject ?? `your enquiry`}`.slice(0, 300));
  }, [lead, payload, subject]);

  const messages = useMemo(() => payload?.conversation?.messages ?? [], [payload]);

  async function changeStatus(next: LeadStatus) {
    setBusy(true);
    try {
      setLead(await request<Lead>(`/leads/${leadId}/status`, { method: 'PATCH', json: { status: next } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update that lead.');
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      setLead(await request<Lead>(`/leads/${leadId}/notes`, { json: { body: note.trim() } }));
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that note.');
    } finally {
      setBusy(false);
    }
  }

  function applyTemplate(templateId: string) {
    const template = payload?.templates.find((t) => (t._id ?? t.id) === templateId);
    if (!template) return;
    setSubject(template.subject.replace(/\{\{siteName\}\}/g, payload?.settings.senderName ?? ''));
    // `{{replyBody}}` is where the admin's own words go; the rest of the template surrounds it.
    setBody(template.text.replace(/\{\{replyBody\}\}/g, '').trim());
  }

  async function sendReply() {
    if (!body.trim() || !subject.trim()) return;
    setBusy(true);
    setSent('');
    try {
      await request(`/leads/${leadId}/reply`, {
        json: {
          subject: subject.trim(),
          // The composer is plain text; each paragraph becomes one. Escaping happens here
          // because whatever is typed must not become markup in the client's mail client.
          html: body
            .trim()
            .split(/\n{2,}/)
            .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
            .join(''),
          text: body.trim(),
          cc,
          bcc,
          dedupeKey,
        },
      });
      setBody('');
      setSent('Reply sent.');
      // A new key for the next reply — the old one is now spent.
      setDedupeKey(newDedupeKey());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send that reply.');
    } finally {
      setBusy(false);
    }
  }

  async function retry(messageId: string) {
    setBusy(true);
    try {
      await request(`/leads/${leadId}/messages/${messageId}/retry`, { json: {} });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That message could not be sent.');
    } finally {
      setBusy(false);
    }
  }

  if (!lead) {
    return (
      <div className="adm-card">
        <p className="hint">{error || 'Loading…'}</p>
        <Link className="adm-btn ghost sm" href="/admin/leads/">
          Back to leads
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="adm-card">
        <div className="adm-panel-head">
          <Link className="adm-btn ghost sm" href="/admin/leads/">
            ← Leads
          </Link>
          <h2 style={{ margin: 0 }}>{lead.name}</h2>
          <span className={`adm-chip ${lead.status.toLowerCase()}`}>{lead.status}</span>
          <span className="spacer" />
          <select
            className="adm-select"
            style={{ maxWidth: 180 }}
            value={lead.status}
            disabled={busy}
            aria-label="Lead status"
            onChange={(e) => void changeStatus(e.target.value as LeadStatus)}
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {error ? <p className="adm-error">{error}</p> : null}

        <div className="adm-grid2">
          <Detail label="Email" value={lead.email} />
          <Detail label="Phone" value={[lead.dialCode, lead.phone].filter(Boolean).join(' ') || '—'} />
          <Detail label="Company" value={lead.company ?? '—'} />
          <Detail label="Service" value={lead.service ?? '—'} />
          <Detail label="Budget" value={lead.budget ?? '—'} />
          <Detail label="Source" value={`${lead.sourceForm} · ${lead.sourcePage}`} />
          <Detail
            label="Campaign"
            value={[lead.utm.source, lead.utm.medium, lead.utm.campaign].filter(Boolean).join(' / ') || '—'}
          />
          <Detail label="Received" value={new Date(lead.createdAt).toLocaleString('en-GB')} />
        </div>
      </div>

      <div className="adm-card">
        <h3 className="adm-section-title">Conversation</h3>

        {messages.length === 0 ? (
          <p className="hint">No messages yet.</p>
        ) : (
          <ol className="crm-thread">
            {messages.map((m) => (
              <Message key={m.id} message={m} busy={busy} onRetry={() => void retry(m.id)} />
            ))}
          </ol>
        )}
      </div>

      <div className="adm-card">
        <h3 className="adm-section-title">Reply</h3>
        <p className="hint">
          Sent to {lead.email}. Their reply comes back to this thread.
        </p>

        {payload?.templates.length ? (
          <div className="adm-field">
            <label htmlFor="reply-template">Start from a template</label>
            <select
              id="reply-template"
              className="adm-select"
              defaultValue=""
              onChange={(e) => applyTemplate(e.target.value)}
            >
              <option value="">Write from scratch</option>
              {payload.templates.map((t) => (
                <option key={t._id ?? t.id} value={t._id ?? t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="adm-field">
          <label htmlFor="reply-subject">Subject</label>
          <input
            id="reply-subject"
            className="adm-input"
            value={subject}
            maxLength={300}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div className="adm-grid2">
          <div className="adm-field">
            <label htmlFor="reply-cc">CC</label>
            <input
              id="reply-cc"
              className="adm-input"
              placeholder="comma separated"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
            />
          </div>
          <div className="adm-field">
            <label htmlFor="reply-bcc">BCC</label>
            <input
              id="reply-bcc"
              className="adm-input"
              placeholder="comma separated"
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
            />
          </div>
        </div>

        <div className="adm-field">
          <label htmlFor="reply-body">Message</label>
          <textarea
            id="reply-body"
            className="adm-textarea"
            style={{ minHeight: 180 }}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your reply…"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="adm-btn" disabled={busy || !body.trim() || !subject.trim()} onClick={() => void sendReply()}>
            {busy ? 'Sending…' : 'Send reply'}
          </button>
          {sent ? <span className="adm-ok">{sent}</span> : null}
        </div>
      </div>

      <div className="adm-card">
        <h3 className="adm-section-title">Internal notes</h3>
        <p className="hint">Only visible here. Never sent to the client.</p>

        {lead.notes.length ? (
          <div className="adm-repeat">
            {lead.notes.map((n) => (
              <div className="adm-repeat-item" key={n.id ?? n.createdAt}>
                <div className="adm-repeat-head">
                  <strong>{n.authorName}</strong>
                  <span className="spacer" />
                  <span style={{ color: 'var(--a-muted)', fontSize: 12 }}>
                    {new Date(n.createdAt).toLocaleString('en-GB')}
                  </span>
                </div>
                <p style={{ whiteSpace: 'pre-wrap' }}>{n.body}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="hint">No notes yet.</p>
        )}

        <textarea
          className="adm-textarea"
          placeholder="Add a note about this enquiry…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div>
          <button className="adm-btn sm" disabled={busy || !note.trim()} onClick={() => void addNote()}>
            Add note
          </button>
        </div>
      </div>
    </>
  );
}

/** One message in the thread. */
function Message({
  message,
  busy,
  onRetry,
}: {
  message: ConversationMessage;
  busy: boolean;
  onRetry: () => void;
}) {
  const inbound = message.author === 'CLIENT';
  const failed = message.status === 'FAILED';

  return (
    <li className={`crm-msg ${inbound ? 'in' : 'out'}`}>
      <div className="crm-msg-head">
        <strong>{message.authorName || message.authorEmail}</strong>
        <span className="crm-kind">{KIND_LABEL[message.kind] ?? message.kind}</span>
        <span className="spacer" />
        <span className={`crm-status ${message.status.toLowerCase()}`}>{STATUS_LABEL[message.status]}</span>
        <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('en-GB')}</time>
      </div>

      {message.to.length > 0 ? (
        <div className="crm-msg-meta">
          To {message.to.join(', ')}
          {message.cc.length > 0 ? ` · CC ${message.cc.join(', ')}` : ''}
          {message.bcc.length > 0 ? ` · BCC ${message.bcc.join(', ')}` : ''}
        </div>
      ) : null}

      {message.subject ? <div className="crm-msg-subject">{message.subject}</div> : null}

      {/* Sanitised by the API before storage — both on the way out and on the way in. */}
      <div className="crm-msg-body" dangerouslySetInnerHTML={{ __html: message.html }} />

      {failed ? (
        <div className="crm-msg-error">
          <span>{message.lastError ?? 'Delivery failed.'}</span>
          <button className="adm-btn ghost sm" disabled={busy} onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : null}
    </li>
  );
}

const KIND_LABEL: Record<string, string> = {
  FORM: 'submitted the form',
  CONFIRMATION: 'confirmation',
  ADMIN_NOTIFICATION: 'internal notification',
  ADMIN_REPLY: 'reply',
  CLIENT_REPLY: 'replied',
  FOLLOW_UP: 'follow-up',
};

const STATUS_LABEL: Record<string, string> = {
  QUEUED: 'Queued',
  SENDING: 'Sending',
  SENT: 'Delivered',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="adm-field">
      <label>{label}</label>
      <p style={{ wordBreak: 'break-word' }}>{value}</p>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import type { EmailTemplate, TemplateKind } from '@aptentech/shared';
import { TEMPLATE_KINDS, TEMPLATE_VARIABLES } from '@aptentech/shared';
import { useAdmin } from '@/components/admin/AdminClient';

/**
 * Email templates.
 *
 * What an editor may change is the wording; what they may not change is the mechanism. The
 * variable list is fixed and shown on screen, unknown names are refused on save, and a
 * built-in template can be rewritten or switched off but never deleted — its slot is what the
 * application sends from, and an empty slot would silently stop a message going out.
 */

type Row = EmailTemplate & { _id?: string };

const KIND_LABEL: Record<TemplateKind, string> = {
  ADMIN_NEW_LEAD: 'New lead — admin notification',
  CLIENT_CONFIRMATION: 'Client confirmation',
  ADMIN_REPLY: 'Admin reply',
  CLIENT_FOLLOW_UP: 'Client follow-up',
};

const EMPTY = {
  kind: 'ADMIN_REPLY' as TemplateKind,
  name: '',
  description: '',
  subject: '',
  html: '',
  text: '',
  active: true,
};

export default function EmailTemplatesPage() {
  const { request, session } = useAdmin();

  const [rows, setRows] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Row | null>(null);
  const [draft, setDraft] = useState({ ...EMPTY });
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  /** The editor is a panel rather than a route, so its visibility is explicit state. */
  const [showEditor, setShowEditor] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await request<{ templates: Row[] }>('/email-templates');
      setRows(data.templates);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load templates.');
    }
  }, [request]);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  function open(row: Row | null) {
    setShowEditor(true);
    setEditing(row);
    setPreview(null);
    setSaved('');
    setError('');
    setDraft(
      row
        ? {
            kind: row.kind,
            name: row.name,
            description: row.description,
            subject: row.subject,
            html: row.html,
            text: row.text,
            active: row.active,
          }
        : { ...EMPTY },
    );
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const id = editing?._id ?? editing?.id;
      if (id) await request(`/email-templates/${id}`, { method: 'PUT', json: draft });
      else await request('/email-templates', { json: draft });
      setSaved('Saved.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that template.');
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    setBusy(true);
    setError('');
    try {
      setPreview(
        await request<{ subject: string; html: string }>('/email-templates/preview', {
          json: { subject: draft.subject, html: draft.html, text: draft.text },
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not render that template.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: Row) {
    if (!confirm(`Delete "${row.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await request(`/email-templates/${row._id ?? row.id}`, { method: 'DELETE' });
      if ((editing?._id ?? editing?.id) === (row._id ?? row.id)) open(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete that template.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="adm-card">
        <div className="adm-panel-head">
          <h2 style={{ margin: 0 }}>Email templates</h2>
          <span className="spacer" />
          <button className="adm-btn sm" onClick={() => open(null)}>
            New template
          </button>
        </div>

        <p className="hint">
          These are the emails the site sends. Built-in templates fill a slot the application
          sends from — they can be rewritten or switched off, but not deleted.
        </p>

        {error && !editing ? <p className="adm-error">{error}</p> : null}

        <div className="adm-tablewrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Subject</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id ?? row.id}>
                  <td>
                    {row.name}
                    {row.builtIn ? <span className="crm-kind" style={{ marginLeft: 8 }}>built-in</span> : null}
                  </td>
                  <td>{KIND_LABEL[row.kind] ?? row.kind}</td>
                  <td>
                    <code>{row.subject}</code>
                  </td>
                  <td>
                    <span className={`adm-chip ${row.active ? 'qualified' : 'lost'}`}>
                      {row.active ? 'ACTIVE' : 'OFF'}
                    </span>
                  </td>
                  <td>
                    <button className="adm-btn ghost sm" onClick={() => open(row)}>
                      Edit
                    </button>
                    {!row.builtIn ? (
                      <button className="adm-btn ghost sm" disabled={busy} onClick={() => void remove(row)}>
                        Delete
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showEditor ? (
        <div className="adm-card">
          <div className="adm-panel-head">
            <h3 style={{ margin: 0 }}>{editing ? `Editing: ${editing.name}` : 'New template'}</h3>
            <span className="spacer" />
            {saved ? <span className="adm-ok">{saved}</span> : null}
          </div>

          {error ? <p className="adm-error">{error}</p> : null}

          <div className="adm-grid2">
            <div className="adm-field">
              <label htmlFor="tpl-name">Name</label>
              <input
                id="tpl-name"
                className="adm-input"
                value={draft.name}
                maxLength={120}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>

            <div className="adm-field">
              <label htmlFor="tpl-kind">Type</label>
              <select
                id="tpl-kind"
                className="adm-select"
                value={draft.kind}
                // A built-in template's slot is fixed; the API refuses a change and the
                // control is disabled so the refusal is never a surprise.
                disabled={Boolean(editing?.builtIn)}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as TemplateKind })}
              >
                {TEMPLATE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="adm-field">
            <label htmlFor="tpl-desc">Description</label>
            <input
              id="tpl-desc"
              className="adm-input"
              value={draft.description}
              maxLength={400}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>

          <div className="adm-field">
            <label htmlFor="tpl-subject">Subject</label>
            <input
              id="tpl-subject"
              className="adm-input"
              value={draft.subject}
              maxLength={300}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            />
          </div>

          <div className="adm-field">
            <label>Available variables</label>
            <div className="crm-vars">
              {TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  className="crm-var"
                  title={`Insert {{${v}}}`}
                  onClick={() => setDraft({ ...draft, html: `${draft.html}{{${v}}}` })}
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
            <p className="hint">
              Only these names are substituted. Anything else is refused when you save, so a
              typo cannot reach a client as a blank.
            </p>
          </div>

          <div className="adm-field">
            <label htmlFor="tpl-html">HTML body</label>
            <textarea
              id="tpl-html"
              className="adm-textarea"
              style={{ minHeight: 260, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}
              value={draft.html}
              onChange={(e) => setDraft({ ...draft, html: e.target.value })}
            />
          </div>

          <div className="adm-field">
            <label htmlFor="tpl-text">Plain-text body</label>
            <textarea
              id="tpl-text"
              className="adm-textarea"
              style={{ minHeight: 160, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            />
            <p className="hint">
              Left empty, this is generated from the HTML. A message with no text part is far
              more likely to be filtered as spam.
            </p>
          </div>

          <div className="adm-field">
            <label className="adm-check">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              <span>Active</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="adm-btn" disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save template'}
            </button>
            <button className="adm-btn ghost" disabled={busy} onClick={() => void runPreview()}>
              Preview
            </button>
            <button
              className="adm-btn ghost"
              onClick={() => {
                setShowEditor(false);
                setEditing(null);
                setPreview(null);
              }}
            >
              Close
            </button>
          </div>

          {preview ? (
            <div className="crm-preview">
              <div className="crm-preview-head">
                <strong>Subject:</strong> {preview.subject}
              </div>
              {/* Rendered by the API through the same sanitiser a real send uses. */}
              <div className="crm-preview-body" dangerouslySetInnerHTML={{ __html: preview.html }} />
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

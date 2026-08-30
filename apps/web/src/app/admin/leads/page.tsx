'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Lead, LeadStatus, Paginated } from '@aptentech/shared';
import { LEAD_STATUSES } from '@aptentech/shared';
import { useAdmin } from '@/components/admin/AdminClient';

/**
 * Lead management.
 *
 * Search, filter, paginate, change status, add notes and export — the full triage loop the
 * brief asked for. Filtering and paging happen server-side against indexed queries, so the
 * screen stays fast as the collection grows rather than pulling everything into the browser.
 */
export default function LeadsPage() {
  const { request, session } = useAdmin();

  const [data, setData] = useState<Paginated<Lead> | null>(null);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<LeadStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20', status, sort: '-createdAt' });
    if (applied) params.set('search', applied);

    try {
      setData(await request<Paginated<Lead>>(`/leads?${params}`));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load leads.');
    }
  }, [request, page, status, applied]);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  async function changeStatus(lead: Lead, next: LeadStatus) {
    setBusy(true);
    try {
      const updated = await request<Lead>(`/leads/${lead.id}/status`, { method: 'PATCH', json: { status: next } });
      setSelected(updated);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update that lead.');
    } finally {
      setBusy(false);
    }
  }

  async function addNote(lead: Lead) {
    if (!note.trim()) return;
    setBusy(true);
    try {
      const updated = await request<Lead>(`/leads/${lead.id}/notes`, { method: 'POST', json: { body: note.trim() } });
      setSelected(updated);
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that note.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Export streams from the API as CSV. The blob is turned into a temporary object URL
   * rather than a data URI so a large export does not have to fit in a URL.
   */
  async function exportCsv() {
    const params = new URLSearchParams({ status, sort: '-createdAt', page: '1', pageSize: '20' });
    if (applied) params.set('search', applied);

    const blob = await request<Blob>(`/leads/export?${params}`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aptentech-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {error ? <div className="adm-alert error">{error}</div> : null}

      <div className="adm-panel">
        <div className="adm-panel-head">
          <div className="adm-toolbar">
            <input
              className="adm-input"
              placeholder="Search name, email, company, message…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPage(1);
                  setApplied(search);
                }
              }}
            />
            <button
              className="adm-btn ghost sm"
              onClick={() => {
                setPage(1);
                setApplied(search);
              }}
            >
              Search
            </button>
            <select
              className="adm-select"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value as LeadStatus | 'ALL');
              }}
            >
              <option value="ALL">All statuses</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <span className="spacer" />
          <button className="adm-btn ghost sm" onClick={() => void exportCsv()}>
            Export CSV
          </button>
        </div>

        {!data ? (
          <div className="adm-empty">Loading…</div>
        ) : data.items.length === 0 ? (
          <div className="adm-empty">No leads match these filters.</div>
        ) : (
          <>
            <div className="adm-tablewrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Received</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Service</th>
                    <th>Budget</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((lead) => (
                    <tr key={lead.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {new Date(lead.createdAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td>{lead.name}</td>
                      <td>{lead.email}</td>
                      <td>{lead.service ?? '—'}</td>
                      <td>{lead.budget ?? '—'}</td>
                      <td>
                        <code>{lead.sourcePage}</code>
                      </td>
                      <td>
                        <span className={`adm-chip ${lead.status.toLowerCase()}`}>{lead.status}</span>
                      </td>
                      <td>
                        <button className="adm-btn ghost sm" onClick={() => setSelected(lead)}>
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="adm-pager">
              <span>
                {data.total} lead{data.total === 1 ? '' : 's'} · page {data.page} of {data.totalPages}
              </span>
              <span className="spacer" />
              <button className="adm-btn ghost sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button
                className="adm-btn ghost sm"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>

      {selected ? (
        <div className="adm-panel">
          <div className="adm-panel-head">
            <h2>{selected.name}</h2>
            <span className={`adm-chip ${selected.status.toLowerCase()}`}>{selected.status}</span>
            <span className="spacer" />
            <button className="adm-btn ghost sm" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>

          <div className="adm-panel-body">
            <div className="adm-grid2">
              <Detail label="Email" value={selected.email} />
              <Detail label="Phone" value={[selected.dialCode, selected.phone].filter(Boolean).join(' ') || '—'} />
              <Detail label="Company" value={selected.company ?? '—'} />
              <Detail label="Service" value={selected.service ?? '—'} />
              <Detail label="Budget" value={selected.budget ?? '—'} />
              <Detail label="NDA requested" value={selected.ndaRequested ? 'Yes' : 'No'} />
              <Detail label="Source form" value={selected.sourceForm} />
              <Detail label="Source page" value={selected.sourcePage} />
              <Detail label="Referrer" value={selected.referrer ?? '—'} />
              <Detail
                label="Campaign"
                value={
                  [selected.utm.source, selected.utm.medium, selected.utm.campaign].filter(Boolean).join(' / ') || '—'
                }
              />
              <Detail label="Received" value={new Date(selected.createdAt).toLocaleString('en-GB')} />
              <Detail
                label="Spam score"
                value={selected.spamScore ? `${selected.spamScore} (${selected.spamReasons.join(', ')})` : '0'}
              />
            </div>

            <div className="adm-field">
              <label>Message</label>
              <p style={{ whiteSpace: 'pre-wrap', background: 'var(--a-sunk)', padding: 12, borderRadius: 8 }}>
                {selected.message || '—'}
              </p>
            </div>

            <div className="adm-field">
              <label htmlFor="lead-status">Status</label>
              <select
                id="lead-status"
                className="adm-select"
                value={selected.status}
                disabled={busy}
                onChange={(e) => void changeStatus(selected, e.target.value as LeadStatus)}
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="adm-field">
              <label htmlFor="lead-note">Notes</label>
              {selected.notes.length ? (
                <div className="adm-repeat">
                  {selected.notes.map((n) => (
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
                id="lead-note"
                className="adm-textarea"
                placeholder="Add a note about this enquiry…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div>
                <button className="adm-btn sm" disabled={busy || !note.trim()} onClick={() => void addNote(selected)}>
                  Add note
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="adm-field">
      <label>{label}</label>
      <p style={{ wordBreak: 'break-word' }}>{value}</p>
    </div>
  );
}

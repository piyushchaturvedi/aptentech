'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from './AdminClient';

/**
 * Generic list-and-edit screen for the simpler CMS collections.
 *
 * Testimonials, FAQs and case studies all follow the same shape — list, open, edit, save,
 * delete — and differ only in their fields and columns. Sharing the loop here means the
 * save/delete/error behaviour is identical everywhere, and each collection's page stays a
 * declaration of its own fields rather than a copy of the same plumbing.
 */

export interface Column<T> {
  header: string;
  render: (item: T) => React.ReactNode;
  numeric?: boolean;
}

export function CollectionAdmin<T extends { id: string }>({
  title,
  endpoint,
  columns,
  renderEditor,
  createBlank,
  paginated = false,
  itemName = 'item',
  canDelete = true,
  note,
}: {
  title: string;
  /** API path under `/admin`, e.g. `/testimonials`. */
  endpoint: string;
  columns: Array<Column<T>>;
  renderEditor: (item: T, patch: (p: Partial<T>) => void) => React.ReactNode;
  createBlank?: () => Omit<T, 'id'>;
  paginated?: boolean;
  itemName?: string;
  canDelete?: boolean;
  note?: string;
}) {
  const { request, session } = useAdmin();

  const [items, setItems] = useState<T[] | null>(null);
  const [editing, setEditing] = useState<T | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(async () => {
    try {
      if (paginated) {
        const res = await request<{ items: T[]; totalPages: number }>(`${endpoint}?page=${page}&pageSize=25`);
        setItems(res.items);
        setTotalPages(res.totalPages || 1);
      } else {
        setItems(await request<T[]>(endpoint));
      }
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not load ${title.toLowerCase()}.`);
    }
  }, [request, endpoint, paginated, page, title]);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError('');
    setNotice('');

    try {
      // Server-owned fields are stripped: the schemas reject unknown keys.
      const { id, createdAt, updatedAt, ...payload } = editing as T & Record<string, unknown>;

      if (isNew) {
        await request(endpoint, { method: 'POST', json: payload });
      } else {
        await request(`${endpoint}/${id}`, { method: 'PUT', json: payload });
      }

      setNotice('Saved. The live site will update within a few seconds.');
      setEditing(null);
      setIsNew(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: T) {
    if (!window.confirm(`Delete this ${itemName}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await request(`${endpoint}/${item.id}`, { method: 'DELETE' });
      setNotice('Deleted.');
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.');
    } finally {
      setBusy(false);
    }
  }

  const patch = (p: Partial<T>) => setEditing((prev) => (prev ? { ...prev, ...p } : prev));

  if (editing) {
    return (
      <>
        {error ? <div className="adm-alert error">{error}</div> : null}

        <div className="adm-panel">
          <div className="adm-panel-head">
            <h2>{isNew ? `New ${itemName}` : `Edit ${itemName}`}</h2>
            <span className="spacer" />
            <button className="adm-btn ghost sm" onClick={() => { setEditing(null); setIsNew(false); }}>
              Cancel
            </button>
            {!isNew && canDelete ? (
              <button className="adm-btn danger sm" onClick={() => void remove(editing)} disabled={busy}>
                Delete
              </button>
            ) : null}
            <button className="adm-btn" onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
          <div className="adm-panel-body">{renderEditor(editing, patch)}</div>
        </div>
      </>
    );
  }

  return (
    <>
      {error ? <div className="adm-alert error">{error}</div> : null}
      {notice ? <div className="adm-alert ok">{notice}</div> : null}

      <div className="adm-panel">
        <div className="adm-panel-head">
          <h2>{title}</h2>
          {note ? <span className="hint">{note}</span> : null}
          <span className="spacer" />
          {createBlank ? (
            <button
              className="adm-btn sm"
              onClick={() => {
                setEditing({ ...(createBlank() as object), id: '' } as T);
                setIsNew(true);
              }}
            >
              New {itemName}
            </button>
          ) : null}
        </div>

        {!items ? (
          <div className="adm-empty">Loading…</div>
        ) : items.length === 0 ? (
          <div className="adm-empty">Nothing here yet.</div>
        ) : (
          <>
            <div className="adm-tablewrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th key={c.header} className={c.numeric ? 'num' : undefined}>
                        {c.header}
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      {columns.map((c) => (
                        <td key={c.header} className={c.numeric ? 'num' : undefined}>
                          {c.render(item)}
                        </td>
                      ))}
                      <td>
                        <button
                          className="adm-btn ghost sm"
                          onClick={() => {
                            setEditing(item);
                            setIsNew(false);
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {paginated && totalPages > 1 ? (
              <div className="adm-pager">
                <span>
                  Page {page} of {totalPages}
                </span>
                <span className="spacer" />
                <button className="adm-btn ghost sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
                <button className="adm-btn ghost sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

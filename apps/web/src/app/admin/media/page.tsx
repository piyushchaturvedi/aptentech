'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MediaAsset } from '@aptentech/shared';
import { useAdmin } from '@/components/admin/AdminClient';

/**
 * Media library.
 *
 * This is where the 37 images the original site referenced but never shipped get filled in.
 * Uploads go Admin → API → storage: the API sniffs the actual bytes rather than trusting
 * the declared type, strips scriptable content from SVG, and stores under a
 * server-generated key so a crafted filename cannot traverse paths.
 *
 * Deleting only removes the file and its record — any content still pointing at it falls
 * back to the layout-preserving placeholder rather than breaking the page.
 */
type Asset = MediaAsset & { url: string };

export default function AdminMediaPage() {
  const { request, session } = useAdmin();

  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [alt, setAlt] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: '24' });
    if (applied) params.set('search', applied);
    try {
      const res = await request<{ items: Asset[]; totalPages: number }>(`/media?${params}`);
      setAssets(res.items);
      setTotalPages(res.totalPages || 1);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the media library.');
    }
  }, [request, page, applied]);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  async function upload(files: FileList) {
    setBusy(true);
    setError('');
    setNotice('');

    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        await request('/media', { method: 'POST', json: form });
      }
      setNotice(`Uploaded ${files.length} file${files.length === 1 ? '' : 's'}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function saveAlt() {
    if (!editing) return;
    setBusy(true);
    try {
      await request(`/media/${editing.id}`, { method: 'PATCH', json: { alt } });
      setEditing(null);
      setNotice('Alt text saved.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(asset: Asset) {
    if (!window.confirm(`Delete ${asset.filename}? Content still using it will fall back to a placeholder.`)) return;
    setBusy(true);
    try {
      await request(`/media/${asset.id}`, { method: 'DELETE' });
      setNotice('Deleted.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error ? <div className="adm-alert error">{error}</div> : null}
      {notice ? <div className="adm-alert ok">{notice}</div> : null}

      <div className="adm-panel">
        <div className="adm-panel-head">
          <h2>Media library</h2>
          <div className="adm-toolbar">
            <input
              className="adm-input"
              placeholder="Search filename or alt text…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPage(1);
                  setApplied(search);
                }
              }}
            />
            <button className="adm-btn ghost sm" onClick={() => { setPage(1); setApplied(search); }}>
              Search
            </button>
          </div>
          <span className="spacer" />
          <label className="adm-btn" style={{ cursor: busy ? 'not-allowed' : 'pointer' }}>
            {busy ? 'Uploading…' : 'Upload files'}
            <input
              type="file"
              multiple
              hidden
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf"
              onChange={(e) => {
                if (e.target.files?.length) void upload(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        <div className="adm-panel-body">
          <p className="hint">
            JPG, PNG, WebP, GIF, SVG and PDF up to 10 MB. Files are validated by their actual contents, not their
            extension.
          </p>

          {!assets ? (
            <div className="adm-empty">Loading…</div>
          ) : assets.length === 0 ? (
            <div className="adm-empty">
              Nothing uploaded yet. The site is showing sized placeholders wherever an image is expected.
            </div>
          ) : (
            <div className="adm-media">
              {assets.map((asset) => (
                <figure key={asset.id}>
                  {asset.mimeType.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.url} alt={asset.alt} />
                  ) : (
                    <div
                      style={{
                        height: 110,
                        display: 'grid',
                        placeItems: 'center',
                        background: 'var(--a-sunk)',
                        fontSize: 11,
                        color: 'var(--a-muted)',
                      }}
                    >
                      {asset.mimeType}
                    </div>
                  )}
                  <figcaption>
                    {asset.filename}
                    <br />
                    {asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ''}
                    {Math.round(asset.bytes / 1024)} KB
                    <br />
                    {new Date(asset.createdAt).toLocaleDateString('en-GB')}
                    {asset.alt ? (
                      <>
                        <br />
                        <em>{asset.alt}</em>
                      </>
                    ) : null}
                  </figcaption>
                  <div className="adm-media-actions">
                    <button
                      className="adm-btn ghost sm"
                      onClick={() => {
                        setEditing(asset);
                        setAlt(asset.alt ?? '');
                      }}
                    >
                      Alt text
                    </button>
                    <button className="adm-btn danger sm" onClick={() => void remove(asset)}>
                      Delete
                    </button>
                  </div>
                </figure>
              ))}
            </div>
          )}

          {totalPages > 1 ? (
            <div className="adm-pager" style={{ borderTop: 0, padding: 0 }}>
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
        </div>
      </div>

      {editing ? (
        <div className="adm-panel">
          <div className="adm-panel-head">
            <h2>Alt text — {editing.filename}</h2>
            <span className="spacer" />
            <button className="adm-btn ghost sm" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="adm-btn sm" onClick={() => void saveAlt()} disabled={busy}>
              Save
            </button>
          </div>
          <div className="adm-panel-body">
            <div className="adm-field">
              <label htmlFor="alt">Describe what the image shows</label>
              <input id="alt" className="adm-input" value={alt} onChange={(e) => setAlt(e.target.value)} />
              <span className="hint">
                Used by screen readers and search engines. Describe the content, not the filename.
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

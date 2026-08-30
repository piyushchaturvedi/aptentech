'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { SiteSettings } from '@aptentech/shared';
import { EMPTY_MEDIA } from '@aptentech/shared';
import { useAdmin } from '@/components/admin/AdminClient';
import { MediaPicker, Text, TextArea, Toggle } from '@/components/admin/Fields';

/**
 * SEO overview.
 *
 * Two jobs: edit the sitewide defaults that fill in wherever a page leaves its own SEO
 * blank, and give one screen that shows every page's title, description and canonical so
 * gaps and duplicates are visible together rather than one edit form at a time.
 *
 * The audit found the source had no `og:image` on 24 of 25 pages and a Twitter card on one,
 * so the missing-share-image column is the first thing worth working through here.
 */

interface SeoRow {
  id: string;
  slug: string;
  label: string;
  url: string;
  editHref: string;
  title: string;
  description: string;
  canonical: string;
  hasOgImage: boolean;
  status?: string;
}

export default function AdminSeoPage() {
  const { request, session } = useAdmin();

  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [rows, setRows] = useState<SeoRow[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [site, services, solutions, pages] = await Promise.all([
        request<SiteSettings>('/settings'),
        request<Array<{ id: string; slug: string; name: string; status: string; seo: SeoRow }>>('/content/service'),
        request<Array<{ id: string; slug: string; name: string; status: string; seo: SeoRow }>>('/content/solution'),
        request<Array<{ id: string; slug: string; title: string; status: string; seo: SeoRow }>>('/pages'),
      ]);

      setSettings(site);

      const toRow = (
        item: { id: string; slug: string; status: string; seo: SeoRow },
        label: string,
        url: string,
        editHref: string,
      ): SeoRow => ({
        id: item.id,
        slug: item.slug,
        label,
        url,
        editHref,
        title: item.seo?.title ?? '',
        description: item.seo?.description ?? '',
        canonical: item.seo?.canonical ?? '',
        hasOgImage: Boolean((item.seo as unknown as { ogImage?: { mediaId?: string } })?.ogImage?.mediaId),
        status: item.status,
      });

      setRows([
        ...pages.map((p) => toRow(p, p.title, p.slug === 'home' ? '/' : `/${p.slug}/`, '/admin/pages')),
        ...services.map((s) => toRow(s, s.name, `/services/${s.slug}/`, '/admin/services')),
        ...solutions.map((s) => toRow(s, s.name, `/solutions/${s.slug}/`, '/admin/solutions')),
      ]);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load SEO data.');
    }
  }, [request]);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  async function saveDefaults() {
    if (!settings) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { id, updatedAt, ...payload } = settings as SiteSettings & Record<string, unknown>;
      await request('/settings', { method: 'PUT', json: payload });
      setNotice('Defaults saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  const missingOg = rows?.filter((r) => !r.hasOgImage).length ?? 0;
  const missingDescription = rows?.filter((r) => !r.description).length ?? 0;

  return (
    <>
      {error ? <div className="adm-alert error">{error}</div> : null}
      {notice ? <div className="adm-alert ok">{notice}</div> : null}

      {rows && (missingOg || missingDescription) ? (
        <div className="adm-alert warn">
          {missingOg ? `${missingOg} pages have no social share image. ` : ''}
          {missingDescription ? `${missingDescription} pages have no meta description. ` : ''}
          Pages without their own value fall back to the sitewide defaults below.
        </div>
      ) : null}

      {settings ? (
        <div className="adm-panel">
          <div className="adm-panel-head">
            <h2>Sitewide defaults</h2>
            <span className="spacer" />
            <button className="adm-btn sm" onClick={() => void saveDefaults()} disabled={busy}>
              {busy ? 'Saving…' : 'Save defaults'}
            </button>
          </div>
          <div className="adm-panel-body">
            <Text
              label="Default title"
              value={settings.defaultSeo.title}
              onChange={(v) => setSettings({ ...settings, defaultSeo: { ...settings.defaultSeo, title: v } })}
            />
            <TextArea
              label="Default meta description"
              value={settings.defaultSeo.description}
              onChange={(v) => setSettings({ ...settings, defaultSeo: { ...settings.defaultSeo, description: v } })}
            />
            <MediaPicker
              label="Default social share image"
              value={settings.defaultSeo.ogImage ?? { ...EMPTY_MEDIA }}
              onChange={(v) => setSettings({ ...settings, defaultSeo: { ...settings.defaultSeo, ogImage: v } })}
            />
            <div className="adm-grid2">
              <Toggle
                label="Allow indexing by default"
                value={settings.defaultSeo.robotsIndex}
                onChange={(v) => setSettings({ ...settings, defaultSeo: { ...settings.defaultSeo, robotsIndex: v } })}
              />
              <Toggle
                label="Follow links by default"
                value={settings.defaultSeo.robotsFollow}
                onChange={(v) => setSettings({ ...settings, defaultSeo: { ...settings.defaultSeo, robotsFollow: v } })}
              />
            </div>
            <p className="hint">
              The sitemap is generated automatically from published content at{' '}
              <a href="/sitemap.xml" target="_blank" rel="noopener">
                /sitemap.xml
              </a>
              , and robots.txt at{' '}
              <a href="/robots.txt" target="_blank" rel="noopener">
                /robots.txt
              </a>
              .
            </p>
          </div>
        </div>
      ) : null}

      <div className="adm-panel">
        <div className="adm-panel-head">
          <h2>Every page</h2>
          <span className="hint">Edit a page&rsquo;s SEO on its own screen.</span>
        </div>

        {!rows ? (
          <div className="adm-empty">Loading…</div>
        ) : (
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>URL</th>
                  <th>Title</th>
                  <th>Description</th>
                  <th>Share image</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.editHref}-${row.id}`}>
                    <td>{row.label}</td>
                    <td>
                      <code>{row.url}</code>
                    </td>
                    <td>{row.title || <span style={{ color: 'var(--a-danger)' }}>Not set</span>}</td>
                    <td style={{ maxWidth: 320 }}>
                      {row.description ? (
                        `${row.description.slice(0, 90)}${row.description.length > 90 ? '…' : ''}`
                      ) : (
                        <span style={{ color: 'var(--a-danger)' }}>Not set</span>
                      )}
                    </td>
                    <td>
                      <span className={`adm-chip ${row.hasOgImage ? 'published' : 'draft'}`}>
                        {row.hasOgImage ? 'Set' : 'Missing'}
                      </span>
                    </td>
                    <td>
                      <Link className="adm-btn ghost sm" href={row.editHref}>
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

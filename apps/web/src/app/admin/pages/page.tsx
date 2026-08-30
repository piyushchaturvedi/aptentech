'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SitePage } from '@aptentech/shared';
import { EMPTY_MEDIA } from '@aptentech/shared';
import { useAdmin } from '@/components/admin/AdminClient';
import { MediaPicker, Repeater, Select, StringList, Text, TextArea, Toggle } from '@/components/admin/Fields';

/**
 * Static pages — home, about, contact, case studies, blog landing and the two legal pages.
 *
 * Each is a list of typed blocks. An editor can rewrite any text, swap an image, reorder
 * blocks or switch one off, but cannot add a block type that does not exist or inject
 * markup — which is what keeps the approved layout safe while leaving every word editable.
 *
 * The block types deliberately mirror the sections the design already has. Adding a new
 * one is a code change, by design.
 */

const PAGE_LABELS: Record<string, string> = {
  home: 'Homepage — /',
  about: 'About — /about/',
  contact: 'Contact — /contact/',
  'case-studies': 'Case studies — /case-studies/',
  blog: 'Blog landing — /blog/',
  'privacy-policy': 'Privacy Policy — /privacy-policy/',
  'terms-conditions': 'Terms & Conditions — /terms-conditions/',
};

const PAGE_PATHS: Record<string, string> = {
  home: '/',
  about: '/about/',
  contact: '/contact/',
  'case-studies': '/case-studies/',
  blog: '/blog/',
  'privacy-policy': '/privacy-policy/',
  'terms-conditions': '/terms-conditions/',
};

type Block = SitePage['blocks'][number] & Record<string, unknown>;

export default function AdminPagesPage() {
  const { request, session } = useAdmin();

  const [list, setList] = useState<Array<{ id: string; slug: string; title: string; status: string }> | null>(null);
  const [editing, setEditing] = useState<SitePage | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await request('/pages'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load pages.');
    }
  }, [request]);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  async function open(slug: string) {
    setError('');
    setNotice('');
    try {
      setEditing(await request<SitePage>(`/pages/${slug}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that page.');
    }
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { id, createdAt, updatedAt, ...payload } = editing as SitePage & Record<string, unknown>;
      await request(`/pages/${editing.slug}`, { method: 'PUT', json: payload });
      setNotice('Saved. The live page updates within a few seconds.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  const patch = (p: Partial<SitePage>) => setEditing((prev) => (prev ? { ...prev, ...p } : prev));

  if (editing) {
    const blocks = editing.blocks as Block[];

    return (
      <>
        {error ? <div className="adm-alert error">{error}</div> : null}
        {notice ? <div className="adm-alert ok">{notice}</div> : null}

        <div className="adm-panel">
          <div className="adm-panel-head">
            <h2>{PAGE_LABELS[editing.slug] ?? editing.title}</h2>
            <span className="spacer" />
            <a className="adm-btn ghost sm" href={PAGE_PATHS[editing.slug] ?? '/'} target="_blank" rel="noopener">
              Preview ↗
            </a>
            <button className="adm-btn ghost sm" onClick={() => setEditing(null)}>
              Back
            </button>
            <button className="adm-btn" onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : 'Save & publish'}
            </button>
          </div>

          <div className="adm-panel-body">
            <div className="adm-grid2">
              <Text label="Page title (internal)" value={editing.title} onChange={(v) => patch({ title: v })} />
              <Select
                label="Status"
                value={editing.status}
                onChange={(v) => patch({ status: v as SitePage['status'] })}
                options={[
                  { value: 'PUBLISHED', label: 'Published' },
                  { value: 'DRAFT', label: 'Draft' },
                ]}
              />
            </div>
          </div>
        </div>

        <div className="adm-panel">
          <div className="adm-panel-head">
            <h2>Sections</h2>
            <span className="hint">Reorder or switch off — the available types are fixed by the design.</span>
          </div>
          <div className="adm-panel-body">
            <Repeater<Block>
              label="Blocks"
              items={blocks}
              onChange={(next) => patch({ blocks: next as SitePage['blocks'] })}
              itemLabel={(b) => `${b.type}${b.title ? ` · ${String(b.title).slice(0, 40)}` : ''}`}
              create={() => ({ key: `block-${Date.now()}`, type: 'textSection', enabled: true, title: '', body: '', html: '' }) as Block}
              render={(block, update) => (
                <>
                  <div className="adm-grid2">
                    <Text label="Eyebrow" value={String(block.eyebrow ?? '')} onChange={(v) => update({ eyebrow: v } as Partial<Block>)} />
                    <Text label="Heading" value={String(block.title ?? '')} onChange={(v) => update({ title: v } as Partial<Block>)} />
                  </div>

                  <TextArea
                    label="Body"
                    value={String(block.body ?? '')}
                    onChange={(v) => update({ body: v } as Partial<Block>)}
                  />

                  {block.type === 'hero' || block.type === 'imageText' || block.type === 'ctaSection' ? (
                    <MediaPicker
                      label="Image"
                      value={(block.image as never) ?? { ...EMPTY_MEDIA }}
                      onChange={(v) => update({ image: v } as unknown as Partial<Block>)}
                    />
                  ) : null}

                  {block.type === 'statsBar' ? (
                    <Repeater
                      label="Statistics"
                      items={(block.stats as Array<{ value: string; suffix: string; label: string }>) ?? []}
                      onChange={(stats) => update({ stats } as unknown as Partial<Block>)}
                      itemLabel={(s) => s.label || 'Statistic'}
                      create={() => ({ value: '', suffix: '', label: '' })}
                      render={(stat, updateStat) => (
                        <div className="adm-grid2">
                          <Text label="Value" value={stat.value} onChange={(v) => updateStat({ value: v })} />
                          <Text label="Suffix" value={stat.suffix} onChange={(v) => updateStat({ suffix: v })} />
                          <Text label="Label" value={stat.label} onChange={(v) => updateStat({ label: v })} />
                        </div>
                      )}
                    />
                  ) : null}

                  {block.type === 'faqSection' ? (
                    <Repeater
                      label="Questions"
                      items={(block.faqs as Array<{ question: string; answer: string; category?: string; visible?: boolean }>) ?? []}
                      onChange={(faqs) => update({ faqs } as unknown as Partial<Block>)}
                      itemLabel={(f) => f.question || 'Question'}
                      create={() => ({ question: '', answer: '', category: '', visible: true })}
                      render={(faq, updateFaq) => (
                        <>
                          <Text label="Question" value={faq.question} onChange={(v) => updateFaq({ question: v })} />
                          <TextArea label="Answer" value={faq.answer} onChange={(v) => updateFaq({ answer: v })} rows={3} />
                          <Text label="Category" value={faq.category ?? ''} onChange={(v) => updateFaq({ category: v })} />
                        </>
                      )}
                    />
                  ) : null}

                  {block.type === 'officeGrid' ? (
                    <Repeater
                      label="Offices"
                      items={(block.offices as Array<{ city: string; lines: string[] }>) ?? []}
                      onChange={(offices) => update({ offices } as unknown as Partial<Block>)}
                      itemLabel={(o) => o.city || 'Office'}
                      create={() => ({ city: '', lines: [] })}
                      render={(office, updateOffice) => (
                        <>
                          <Text label="City" value={office.city} onChange={(v) => updateOffice({ city: v })} />
                          <StringList label="Address" items={office.lines} onChange={(v) => updateOffice({ lines: v })} />
                        </>
                      )}
                    />
                  ) : null}

                  {block.type === 'textSection' || block.type === 'richText' || block.type === 'legalSection' ? (
                    <TextArea
                      label="Content"
                      value={String(block.html ?? '')}
                      onChange={(v) => update({ html: v } as Partial<Block>)}
                      rows={16}
                      hint="Headings, paragraphs and lists only — sanitised on save."
                    />
                  ) : null}

                  {block.type === 'leadFormSection' ? (
                    <>
                      <Text
                        label="Submit button label"
                        value={String(block.submitLabel ?? '')}
                        onChange={(v) => update({ submitLabel: v } as Partial<Block>)}
                      />
                      <StringList
                        label="Service options"
                        items={(block.serviceOptions as string[]) ?? []}
                        onChange={(v) => update({ serviceOptions: v } as unknown as Partial<Block>)}
                      />
                    </>
                  ) : null}

                  {['portfolioGrid', 'testimonialSection', 'blogSection'].includes(block.type) ? (
                    <Text
                      label="How many to show"
                      type="number"
                      value={String(block.limit ?? 6)}
                      onChange={(v) => update({ limit: Number(v) || 0 } as Partial<Block>)}
                    />
                  ) : null}

                  <Toggle
                    label="Show this section"
                    value={block.enabled !== false}
                    onChange={(v) => update({ enabled: v } as Partial<Block>)}
                  />
                </>
              )}
            />
          </div>
        </div>

        <div className="adm-panel">
          <div className="adm-panel-head">
            <h2>SEO</h2>
          </div>
          <div className="adm-panel-body">
            <Text label="Title" value={editing.seo.title} onChange={(v) => patch({ seo: { ...editing.seo, title: v } })} />
            <TextArea
              label="Meta description"
              value={editing.seo.description}
              onChange={(v) => patch({ seo: { ...editing.seo, description: v } })}
            />
            <Text
              label="Canonical URL"
              value={editing.seo.canonical}
              onChange={(v) => patch({ seo: { ...editing.seo, canonical: v } })}
            />
            <MediaPicker
              label="Social share image"
              value={editing.seo.ogImage ?? { ...EMPTY_MEDIA }}
              onChange={(v) => patch({ seo: { ...editing.seo, ogImage: v } })}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="adm-btn" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : 'Save & publish'}
          </button>
          <button className="adm-btn ghost" onClick={() => setEditing(null)}>
            Cancel
          </button>
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
          <h2>Pages</h2>
          <span className="hint">Fixed set — these are the site&rsquo;s permanent pages, not a page builder.</span>
        </div>

        {!list ? (
          <div className="adm-empty">Loading…</div>
        ) : (
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>URL</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((page) => (
                  <tr key={page.id}>
                    <td>{PAGE_LABELS[page.slug]?.split(' — ')[0] ?? page.title}</td>
                    <td>
                      <code>{PAGE_PATHS[page.slug] ?? `/${page.slug}/`}</code>
                    </td>
                    <td>
                      <span className={`adm-chip ${page.status.toLowerCase()}`}>{page.status}</span>
                    </td>
                    <td>
                      <button className="adm-btn ghost sm" onClick={() => void open(page.slug)}>
                        Edit
                      </button>
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

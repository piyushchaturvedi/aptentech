'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SitePage, SiteSettings } from '@aptentech/shared';
import { EMPTY_MEDIA, EMPTY_SEO } from '@aptentech/shared';
import { describeError, useAdmin } from '@/components/admin/AdminClient';
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
  // The four index pages hold the heading and standfirst for a listing route. The route is
  // the code; this document is its copy, which is why the slug and the URL differ.
  'services-index': 'Services index — /services/',
  'solutions-index': 'Solutions index — /solutions/',
  'industries-index': 'Industries index — /industries/',
  'technologies-index': 'Technologies index — /technologies/',
};

const PAGE_PATHS: Record<string, string> = {
  home: '/',
  about: '/about/',
  contact: '/contact/',
  'case-studies': '/case-studies/',
  blog: '/blog/',
  'privacy-policy': '/privacy-policy/',
  'terms-conditions': '/terms-conditions/',
  'services-index': '/services/',
  'solutions-index': '/solutions/',
  'industries-index': '/industries/',
  'technologies-index': '/technologies/',
};

/** Pages that ship with the site and have a route of their own. */
const CORE_SLUGS = new Set(Object.keys(PAGE_PATHS));

/** Title → address, matching how the article editor behaves. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

/**
 * A starter page.
 *
 * Three sections that read as a finished page immediately — a header, a body and a closing
 * call to action — all of them types the design already styles. An editor adds, removes or
 * reorders from there.
 */
function starterBlocks(title: string) {
  return [
    { key: 'hero', type: 'aboutHero', enabled: true, eyebrow: '', title, sub: '', points: [] },
    { key: 'body', type: 'richText', enabled: true, title: '', html: '<p>Write the page here.</p>' },
    {
      key: 'cta',
      type: 'ctaSection',
      enabled: true,
      title: 'Talk to our engineers',
      body: '',
      points: [],
      ctas: [{ label: 'Start a conversation', href: '/contact/', style: 'primary' }],
    },
  ];
}

type Block = SitePage['blocks'][number] & Record<string, unknown>;

export default function AdminPagesPage() {
  const { request, session } = useAdmin();

  const [list, setList] = useState<Array<{ id: string; slug: string; title: string; status: string }> | null>(null);
  const [editing, setEditing] = useState<SitePage | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: '', slug: '', slugTouched: false, menu: '' });
  const [settings, setSettings] = useState<SiteSettings | null>(null);

  /*
    Menu destinations, flattened from the navigation the CMS already holds.

    A value is either `g:<index>` for a top-level menu or `g:<index>:c:<index>` for a column
    inside one, so a page can be added as a main item or as a sub-menu entry without the admin
    needing to understand the shape of the navigation document.
  */
  const menuOptions = useMemo(() => {
    const options = [
      { value: '', label: 'Do not add to a menu' },
      // A top-level entry is a group of its own — the shape "About" and "Contact" already use.
      { value: 'top', label: 'Main menu (top level)' },
    ];

    (settings?.navigation ?? []).forEach((group, gi) => {
      (group.columns ?? []).forEach((column, ci) => {
        const heading = column.heading || `column ${ci + 1}`;
        options.push({ value: `g:${gi}:c:${ci}`, label: `${group.label} → ${heading}` });
      });
    });

    return options;
  }, [settings]);

  const load = useCallback(async () => {
    try {
      const [pages, site] = await Promise.all([
        request<Array<{ id: string; slug: string; title: string; status: string }>>('/pages'),
        request<SiteSettings>('/settings'),
      ]);
      setList(pages);
      setSettings(site);
    } catch (e) {
      setError(describeError(e, 'Could not load pages.'));
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
      setError(describeError(e, 'Could not open that page.'));
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
      setError(describeError(e, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Creates the page, then places it in the chosen menu.
   *
   * Two writes rather than one, because the page and the navigation are different documents.
   * The page is created first: if the menu write then fails, the result is a page nobody can
   * navigate to, which the editor can fix. The other order would put a menu entry in front of
   * a page that does not exist.
   */
  async function create() {
    const slug = (draft.slug || slugify(draft.title)).trim();
    if (!slug) {
      setError('Give the page an address.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');

    try {
      await request('/pages', {
        method: 'POST',
        json: {
          slug,
          title: draft.title.trim(),
          status: 'DRAFT',
          blocks: starterBlocks(draft.title.trim()),
          caseStudyIds: [],
          testimonialIds: [],
          latestPostIds: [],
          seo: { ...EMPTY_SEO, title: draft.title.trim(), canonical: `/${slug}/` },
        },
      });

      if (draft.menu && settings) {
        const navigation = JSON.parse(JSON.stringify(settings.navigation)) as SiteSettings['navigation'];
        const label = draft.title.trim();
        const href = `/${slug}/`;
        let placed = false;

        if (draft.menu === 'top') {
          // A group with no columns renders as a plain link rather than a mega-menu.
          navigation.push({ label, href, columns: [] });
          placed = true;
        } else {
          const [, gi, , ci] = draft.menu.split(':');
          const column = navigation[Number(gi)]?.columns[Number(ci)];
          if (column) {
            column.links.push({ label, href });
            placed = true;
          }
        }

        if (placed) await request('/settings', { method: 'PUT', json: { ...settings, navigation } });
      }

      setNotice(
        draft.menu
          ? `Created /${slug}/ as a draft and added it to the menu. Publish it when the content is ready.`
          : `Created /${slug}/ as a draft. Publish it when the content is ready.`,
      );
      setCreating(false);
      setDraft({ title: '', slug: '', slugTouched: false, menu: '' });
      await load();
    } catch (e) {
      setError(describeError(e, 'Could not create that page.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(slug: string, title: string) {
    if (!window.confirm(`Delete "${title}" (/${slug}/)? This cannot be undone.`)) return;

    setBusy(true);
    setError('');
    try {
      await request(`/pages/${slug}`, { method: 'DELETE' });

      /*
        Any menu entry pointing at the deleted page is removed with it.

        Leaving it behind would produce exactly the broken navigation this project spent a
        session fixing — a menu item that opens a 404.
      */
      if (settings) {
        const navigation = JSON.parse(JSON.stringify(settings.navigation)) as SiteSettings['navigation'];
        const target = `/${slug}/`;
        let touched = false;

        for (const group of navigation) {
          for (const column of group.columns ?? []) {
            const before = column.links.length;
            column.links = column.links.filter((l) => l.href !== target);
            if (column.links.length !== before) touched = true;
          }
        }

        // A page added at the top level became a group of its own; that goes too.
        const kept = navigation.filter((g) => !(g.href === target && (g.columns ?? []).length === 0));
        if (kept.length !== navigation.length) {
          navigation.length = 0;
          navigation.push(...kept);
          touched = true;
        }

        if (touched) await request('/settings', { method: 'PUT', json: { ...settings, navigation } });
      }

      setNotice('Page deleted.');
      await load();
    } catch (e) {
      setError(describeError(e, 'Could not delete that page.'));
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
          <span className="spacer" />
          <button className="adm-btn" onClick={() => setCreating(true)}>
            Add new page
          </button>
        </div>

        {creating ? (
          <div className="adm-panel-body">
            <div className="wp-box">
              <h2>New page</h2>
              <div className="wp-box-body">
                <Text
                  label="Page title"
                  value={draft.title}
                  onChange={(v) =>
                    // The address follows the title until it is edited directly, the same way
                    // the article editor behaves.
                    setDraft((d) => ({ ...d, title: v, slug: d.slugTouched ? d.slug : slugify(v) }))
                  }
                />
                <div className="adm-field">
                  <label htmlFor="new-page-slug">Address</label>
                  <div className="wp-permalink">
                    <code>/{draft.slug || 'page-address'}/</code>
                    <input
                      id="new-page-slug"
                      className="wp-slug"
                      value={draft.slug}
                      onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value, slugTouched: true }))}
                    />
                  </div>
                  <p className="hint">
                    Lower-case letters, numbers and hyphens. Addresses already used by the site are refused.
                  </p>
                </div>

                <Select
                  label="Add to menu"
                  value={draft.menu}
                  onChange={(v) => setDraft((d) => ({ ...d, menu: v }))}
                  options={menuOptions}
                />
                <p className="hint">
                  Choose a top-level menu to add the page as a link, or a column inside one to add it as a
                  sub-menu entry. You can move it later under Settings → Navigation.
                </p>
              </div>
              <div className="wp-box-foot">
                <button className="adm-btn ghost" onClick={() => setCreating(false)} disabled={busy}>
                  Cancel
                </button>
                <button className="adm-btn" onClick={() => void create()} disabled={busy || !draft.title.trim()}>
                  {busy ? 'Creating…' : 'Create page'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

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
                    <td>
                      {PAGE_LABELS[page.slug]?.split(' — ')[0] ?? page.title}
                      {CORE_SLUGS.has(page.slug) ? null : <span className="adm-chip"> custom </span>}
                    </td>
                    <td>
                      <code>{PAGE_PATHS[page.slug] ?? `/${page.slug}/`}</code>
                    </td>
                    <td>
                      <span className={`adm-chip ${page.status.toLowerCase()}`}>{page.status}</span>
                    </td>
                    <td>
                      <div className="wp-rowactions">
                        <button onClick={() => void open(page.slug)}>Edit</button>
                        <a href={PAGE_PATHS[page.slug] ?? `/${page.slug}/`} target="_blank" rel="noreferrer">
                          View
                        </a>
                        {/*
                          Only pages created here can be deleted. A core page has a route that
                          reads it by slug, so removing the document would leave that route
                          rendering nothing rather than removing a page from the site.
                        */}
                        {CORE_SLUGS.has(page.slug) ? null : (
                          <button className="danger" onClick={() => void remove(page.slug, page.title)}>
                            Delete
                          </button>
                        )}
                      </div>
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

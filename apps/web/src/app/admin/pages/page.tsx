'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AccentToken, CtaLink, MediaRef, SitePage, SiteSettings } from '@aptentech/shared';
import { EMPTY_MEDIA, EMPTY_SEO } from '@aptentech/shared';
import { describeError, useAdmin } from '@/components/admin/AdminClient';
import {
  AccentPicker,
  IconPicker,
  MediaPicker,
  Repeater,
  Select,
  StringList,
  Text,
  TextArea,
  Toggle,
} from '@/components/admin/Fields';

/** The hero's heading, stored in three parts so the gradient span is content, not markup. */
interface SplitHeading {
  lead: string;
  highlight: string;
  trail: string;
}

/** One tech-stack category and its chips. A chip may carry an uploaded logo or a registry icon. */
interface TechGroup {
  category: string;
  accent: AccentToken;
  items: Array<{ label: string; icon: string; image: MediaRef }>;
}

/** One office card: a place, its address, and the two ways to reach it. */
interface OfficeCard {
  accent: AccentToken;
  kind?: string;
  city?: string;
  addressLines?: string[];
  phoneLabel?: string;
  phoneHref?: string;
  emailLabel?: string;
  emailHref?: string;
}

/*
  Single-line wording carried by several block types, and the longer prose beside it.

  These have no shape of their own — a breadcrumb label and a sidebar heading are both just a
  line of text — so they are listed rather than each getting a hand-written conditional. A field
  renders only when the block being edited actually carries it.
*/
const PLAIN_TEXT_KEYS = [
  'crumbLabel',
  'label',
  'heading',
  'listHeading',
  'sidebarTitle',
  'tocLabel',
  'shareLabel',
  'authorLabel',
  'prevLabel',
  'nextLabel',
  'relatedTitle',
  'meta',
] as const;

const LONG_TEXT_KEYS = ['sidebarSubtitle', 'formSubtitle', 'relatedLede', 'notice', 'bodyHtml', 'defaultBody'] as const;

const PLAIN_TEXT_LABELS: Record<string, string> = {
  crumbLabel: 'Breadcrumb label',
  label: 'Strip label',
  heading: 'Heading',
  listHeading: 'List heading',
  sidebarTitle: 'Sidebar heading',
  sidebarSubtitle: 'Sidebar body',
  tocLabel: 'Contents label',
  shareLabel: 'Share label',
  authorLabel: 'Author label',
  prevLabel: 'Previous link label',
  nextLabel: 'Next link label',
  relatedTitle: 'Related heading',
  relatedLede: 'Related body',
  meta: 'Meta line',
  notice: 'Notice',
  formSubtitle: 'Form subheading',
  bodyHtml: 'Document body',
  defaultBody: 'Default article body',
};

/** The enquiry form's labels and options, shared by every lead form on the site. */
interface LeadFormConfig {
  title?: string;
  submitLabel?: string;
  serviceLabel?: string;
  serviceOptions?: string[];
  budgetLabel?: string;
  budgetOptions?: string[];
  budgetNote?: string;
  detailsLabel?: string;
  detailsPlaceholder?: string;
  reassurance?: string;
}

/** The card shape shared by the quick-facts, values, reasons and feature grids. */
interface IconCard {
  accent: AccentToken;
  icon: string;
  title: string;
  description: string;
}

/*
  Block keys that hold a list of icon cards.

  They are the same shape and differ only in which grid they feed, so one editor serves all
  of them and the label is what tells an editor which part of the page they are looking at.
*/
const ICON_CARD_KEYS = ['items', 'quickCards', 'values', 'reasons'] as const;

const ICON_CARD_LABELS: Record<string, string> = {
  items: 'Cards',
  quickCards: 'Quick facts',
  values: 'Values',
  reasons: 'Reasons',
};

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
            <div className="adm-alert ok" style={{ marginBottom: 14 }}>
              <strong>Links inside text.</strong> In any body or description field, write{' '}
              <code>[the words to link](/where/it/goes/)</code> to turn a phrase into a link. It prints underlined in
              the surrounding colour.
            </div>

            <Repeater<Block>
              label="Blocks"
              items={blocks}
              onChange={(next) => patch({ blocks: next as SitePage['blocks'] })}
              itemLabel={(b) => `${b.type}${b.title ? ` · ${String(b.title).slice(0, 40)}` : ''}`}
              create={() => ({ key: `block-${Date.now()}`, type: 'textSection', enabled: true, title: '', body: '', html: '' }) as Block}
              render={(block, update) => {
                const has = (key: string) => key in (block as Record<string, unknown>);

                return (
                <>
                  <div className="adm-grid2">
                    <Text label="Eyebrow" value={String(block.eyebrow ?? '')} onChange={(v) => update({ eyebrow: v } as Partial<Block>)} />
                    <Text label="Heading" value={String(block.title ?? '')} onChange={(v) => update({ title: v } as Partial<Block>)} />
                  </div>

                  <TextArea links
                    label="Body"
                    value={String(block.body ?? '')}
                    onChange={(v) => update({ body: v } as Partial<Block>)}
                  />

                  {has('image') || block.type === 'hero' || block.type === 'imageText' || block.type === 'ctaSection' ? (
                    <MediaPicker
                      label="Image"
                      value={(block.image as never) ?? { ...EMPTY_MEDIA }}
                      onChange={(v) => update({ image: v } as unknown as Partial<Block>)}
                    />
                  ) : null}

                  {has('stats') ? (
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

                  {has('faqs') ? (
                    <Repeater
                      label="Questions"
                      items={(block.faqs as Array<{ question: string; answer: string; category?: string; visible?: boolean }>) ?? []}
                      onChange={(faqs) => update({ faqs } as unknown as Partial<Block>)}
                      itemLabel={(f) => f.question || 'Question'}
                      create={() => ({ question: '', answer: '', category: '', visible: true })}
                      render={(faq, updateFaq) => (
                        <>
                          <Text label="Question" value={faq.question} onChange={(v) => updateFaq({ question: v })} />
                          <TextArea links label="Answer" value={faq.answer} onChange={(v) => updateFaq({ answer: v })} rows={3} />
                          <Text label="Category" value={faq.category ?? ''} onChange={(v) => updateFaq({ category: v })} />
                        </>
                      )}
                    />
                  ) : null}

                  {has('offices') ? (
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

                  {has('submitLabel') || has('serviceOptions') ? (
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

                  {/*
                    Everything below appears only when the block actually carries that field.

                    Blocks are a permissive union: each type uses its own subset of a shared
                    bag of keys, and which subset is decided by the renderer, not by anything
                    the editor can read. Keying on presence is what makes the rule reliable —
                    if the live page is printing a tick list, the block holds `bullets`, so the
                    tick-list editor appears. It was the absence of exactly these that left the
                    admin showing headings and nothing else.
                  */}
                  {has('lede') ? (
                    <TextArea links
                      label="Text under the heading"
                      value={String(block.lede ?? '')}
                      onChange={(v) => update({ lede: v } as Partial<Block>)}
                      rows={3}
                    />
                  ) : null}

                  {has('sub') ? (
                    <TextArea
                      label="Sub-heading line"
                      value={String(block.sub ?? '')}
                      onChange={(v) => update({ sub: v } as Partial<Block>)}
                      rows={2}
                    />
                  ) : null}

                  {has('note') ? (
                    <Text label="Note" value={String(block.note ?? '')} onChange={(v) => update({ note: v } as Partial<Block>)} />
                  ) : null}

                  {has('kicker') ? (
                    <Text label="Kicker" value={String(block.kicker ?? '')} onChange={(v) => update({ kicker: v } as Partial<Block>)} />
                  ) : null}

                  {has('pillText') || has('pillStrong') ? (
                    <div className="adm-grid2">
                      <Text
                        label="Pill text"
                        value={String(block.pillText ?? '')}
                        onChange={(v) => update({ pillText: v } as Partial<Block>)}
                      />
                      <Text
                        label="Pill emphasis"
                        value={String(block.pillStrong ?? '')}
                        onChange={(v) => update({ pillStrong: v } as Partial<Block>)}
                      />
                    </div>
                  ) : null}

                  {has('bullets') ? (
                    <StringList
                      label="Tick points"
                      items={(block.bullets as string[]) ?? []}
                      onChange={(v) => update({ bullets: v } as unknown as Partial<Block>)}
                    />
                  ) : null}

                  {has('trustedLabel') || has('logoSlots') ? (
                    <>
                      <Text
                        label="Client strip label"
                        value={String(block.trustedLabel ?? '')}
                        onChange={(v) => update({ trustedLabel: v } as Partial<Block>)}
                      />
                      <StringList
                        label="Logo slots"
                        items={(block.logoSlots as string[]) ?? []}
                        onChange={(v) => update({ logoSlots: v } as unknown as Partial<Block>)}
                      />
                    </>
                  ) : null}

                  {has('capabilities') || has('capabilitiesTitle') ? (
                    <>
                      <Text
                        label="Capability list heading"
                        value={String(block.capabilitiesTitle ?? '')}
                        onChange={(v) => update({ capabilitiesTitle: v } as Partial<Block>)}
                      />
                      <StringList
                        label="Capabilities"
                        items={(block.capabilities as string[]) ?? []}
                        onChange={(v) => update({ capabilities: v } as unknown as Partial<Block>)}
                      />
                    </>
                  ) : null}

                  {has('mediaLabel') || has('mediaHint') ? (
                    <div className="adm-grid2">
                      <Text
                        label="Media caption"
                        value={String(block.mediaLabel ?? '')}
                        onChange={(v) => update({ mediaLabel: v } as Partial<Block>)}
                      />
                      <Text
                        label="Media sub-caption"
                        value={String(block.mediaHint ?? '')}
                        onChange={(v) => update({ mediaHint: v } as Partial<Block>)}
                      />
                    </div>
                  ) : null}

                  {ICON_CARD_KEYS.filter((key) => has(key)).map((key) => (
                    <Repeater
                      key={key}
                      label={ICON_CARD_LABELS[key] ?? key}
                      items={(block[key] as IconCard[]) ?? []}
                      onChange={(next) => update({ [key]: next } as unknown as Partial<Block>)}
                      itemLabel={(c) => c.title || 'Untitled'}
                      create={() => ({ accent: 'indigo' as AccentToken, icon: '', title: '', description: '' })}
                      render={(card, updateCard) => (
                        <>
                          <Text label="Title" value={card.title} onChange={(v) => updateCard({ title: v })} />
                          <TextArea links
                            label="Description"
                            value={card.description}
                            onChange={(v) => updateCard({ description: v })}
                          />
                          <div className="adm-grid2">
                            <AccentPicker value={card.accent} onChange={(v) => updateCard({ accent: v })} />
                            <IconPicker value={card.icon} onChange={(v) => updateCard({ icon: v })} />
                          </div>
                        </>
                      )}
                    />
                  ))}

                  {has('funnelLabel') || has('stages') ? (
                    <>
                      <Text
                        label="Funnel kicker"
                        value={String(block.funnelLabel ?? '')}
                        onChange={(v) => update({ funnelLabel: v } as Partial<Block>)}
                      />
                      <Repeater
                        label="Funnel stages"
                        items={(block.stages as Array<{ number: string; title: string; description: string }>) ?? []}
                        onChange={(stages) => update({ stages } as unknown as Partial<Block>)}
                        itemLabel={(s) => s.title || 'Stage'}
                        create={() => ({ number: '', title: '', description: '' })}
                        render={(stage, updateStage) => (
                          <>
                            <div className="adm-grid2">
                              <Text label="Number" value={stage.number} onChange={(v) => updateStage({ number: v })} />
                              <Text label="Title" value={stage.title} onChange={(v) => updateStage({ title: v })} />
                            </div>
                            <TextArea links
                              label="Description"
                              value={stage.description}
                              onChange={(v) => updateStage({ description: v })}
                              rows={2}
                            />
                          </>
                        )}
                      />
                      <p className="hint">
                        The number is content, not a position — reordering stages does not renumber them.
                      </p>
                    </>
                  ) : null}

                  {has('channels') ? (
                    <Repeater
                      label="Channels"
                      items={
                        (block.channels as Array<{
                          accent: AccentToken;
                          icon: string;
                          title: string;
                          description: string;
                          outcome: string;
                        }>) ?? []
                      }
                      onChange={(channels) => update({ channels } as unknown as Partial<Block>)}
                      itemLabel={(c) => c.title || 'Channel'}
                      create={() => ({ accent: 'indigo' as AccentToken, icon: '', title: '', description: '', outcome: '' })}
                      render={(channel, updateChannel) => (
                        <>
                          <Text label="Title" value={channel.title} onChange={(v) => updateChannel({ title: v })} />
                          <TextArea links
                            label="Description"
                            value={channel.description}
                            onChange={(v) => updateChannel({ description: v })}
                            rows={2}
                          />
                          <Text
                            label="Outcome"
                            value={channel.outcome}
                            onChange={(v) => updateChannel({ outcome: v })}
                          />
                          <div className="adm-grid2">
                            <AccentPicker value={channel.accent} onChange={(v) => updateChannel({ accent: v })} />
                            <IconPicker value={channel.icon} onChange={(v) => updateChannel({ icon: v })} />
                          </div>
                        </>
                      )}
                    />
                  ) : null}

                  {has('splitHeading') ? (
                    <>
                      <div className="adm-grid2">
                        <Text
                          label="Heading — first part"
                          value={String((block.splitHeading as SplitHeading)?.lead ?? '')}
                          onChange={(v) =>
                            update({
                              splitHeading: { ...(block.splitHeading as SplitHeading), lead: v },
                            } as unknown as Partial<Block>)
                          }
                        />
                        <Text
                          label="Heading — highlighted part"
                          value={String((block.splitHeading as SplitHeading)?.highlight ?? '')}
                          onChange={(v) =>
                            update({
                              splitHeading: { ...(block.splitHeading as SplitHeading), highlight: v },
                            } as unknown as Partial<Block>)
                          }
                        />
                      </div>
                      <Text
                        label="Heading — after the highlight"
                        value={String((block.splitHeading as SplitHeading)?.trail ?? '')}
                        onChange={(v) =>
                          update({
                            splitHeading: { ...(block.splitHeading as SplitHeading), trail: v },
                          } as unknown as Partial<Block>)
                        }
                      />
                      <p className="hint">
                        The highlighted part prints in the brand gradient. Leave the third box empty unless the
                        heading continues after it.
                      </p>
                    </>
                  ) : null}

                  {has('ctas') ? (
                    <Repeater
                      label="Buttons"
                      items={(block.ctas as CtaLink[]) ?? []}
                      onChange={(ctas) => update({ ctas } as unknown as Partial<Block>)}
                      itemLabel={(c) => c.label || 'Button'}
                      create={() => ({ label: '', href: '#contact', style: 'primary' as const })}
                      render={(cta, updateCta) => (
                        <>
                          <div className="adm-grid2">
                            <Text label="Label" value={cta.label} onChange={(v) => updateCta({ label: v })} />
                            <Text label="Link" value={cta.href} onChange={(v) => updateCta({ href: v })} />
                          </div>
                          <Select
                            label="Style"
                            value={cta.style}
                            onChange={(v) => updateCta({ style: v as CtaLink['style'] })}
                            options={[
                              { value: 'primary', label: 'Primary' },
                              { value: 'mint', label: 'Mint' },
                              { value: 'outline', label: 'Outline' },
                              { value: 'glass', label: 'Glass' },
                              { value: 'ghostLight', label: 'Ghost' },
                            ]}
                          />
                        </>
                      )}
                    />
                  ) : null}

                  {has('ctaLabel') || has('ctaHref') || has('buttonLabel') ? (
                    <div className="adm-grid2">
                      {has('ctaLabel') || has('buttonLabel') ? (
                        <Text
                          label="Link label"
                          value={String(block.ctaLabel ?? block.buttonLabel ?? '')}
                          onChange={(v) =>
                            update(
                              (has('ctaLabel') ? { ctaLabel: v } : { buttonLabel: v }) as Partial<Block>,
                            )
                          }
                        />
                      ) : null}
                      {has('ctaHref') ? (
                        <Text
                          label="Link target"
                          value={String(block.ctaHref ?? '')}
                          onChange={(v) => update({ ctaHref: v } as Partial<Block>)}
                        />
                      ) : null}
                    </div>
                  ) : null}

                  {has('points') ? (
                    <StringList
                      label="Points"
                      items={(block.points as string[]) ?? []}
                      onChange={(v) => update({ points: v } as unknown as Partial<Block>)}
                    />
                  ) : null}

                  {has('askTitle') || has('askBody') || has('askCtaLabel') ? (
                    <>
                      <Text
                        label="Side panel heading"
                        value={String(block.askTitle ?? '')}
                        onChange={(v) => update({ askTitle: v } as Partial<Block>)}
                      />
                      <TextArea links
                        label="Side panel body"
                        value={String(block.askBody ?? '')}
                        onChange={(v) => update({ askBody: v } as Partial<Block>)}
                        rows={2}
                      />
                      <Text
                        label="Side panel button"
                        value={String(block.askCtaLabel ?? '')}
                        onChange={(v) => update({ askCtaLabel: v } as Partial<Block>)}
                      />
                    </>
                  ) : null}

                  {has('awardLead') ? (
                    <>
                      <Text
                        label="Lead card heading"
                        value={String((block.awardLead as Record<string, string>)?.title ?? '')}
                        onChange={(v) =>
                          update({
                            awardLead: { ...(block.awardLead as object), title: v },
                          } as unknown as Partial<Block>)
                        }
                      />
                      <TextArea links
                        label="Lead card body"
                        value={String((block.awardLead as Record<string, string>)?.body ?? '')}
                        onChange={(v) =>
                          update({
                            awardLead: { ...(block.awardLead as object), body: v },
                          } as unknown as Partial<Block>)
                        }
                      />
                      <div className="adm-grid2">
                        <Text
                          label="Rating"
                          value={String((block.awardLead as Record<string, string>)?.rating ?? '')}
                          onChange={(v) =>
                            update({
                              awardLead: { ...(block.awardLead as object), rating: v },
                            } as unknown as Partial<Block>)
                          }
                        />
                        <Text
                          label="Rating note"
                          value={String((block.awardLead as Record<string, string>)?.ratingNote ?? '')}
                          onChange={(v) =>
                            update({
                              awardLead: { ...(block.awardLead as object), ratingNote: v },
                            } as unknown as Partial<Block>)
                          }
                        />
                      </div>
                    </>
                  ) : null}

                  {has('awards') ? (
                    <>
                      <Repeater
                        label="Awards"
                        items={(block.awards as Array<{ accent: AccentToken; icon: string; title: string; meta: string }>) ?? []}
                        onChange={(awards) => update({ awards } as unknown as Partial<Block>)}
                        itemLabel={(a) => a.title || 'Award'}
                        create={() => ({ accent: 'indigo' as AccentToken, icon: '', title: '', meta: '' })}
                        render={(award, updateAward) => (
                          <>
                            <Text label="Award" value={award.title} onChange={(v) => updateAward({ title: v })} />
                            <Text
                              label="Awarded by / year"
                              value={award.meta}
                              onChange={(v) => updateAward({ meta: v })}
                            />
                            <div className="adm-grid2">
                              <AccentPicker value={award.accent} onChange={(v) => updateAward({ accent: v })} />
                              <IconPicker value={award.icon} onChange={(v) => updateAward({ icon: v })} />
                            </div>
                          </>
                        )}
                      />
                      <p className="hint">
                        A visitor cannot tell an invented award from a real one. List only recognition AptenTech
                        actually holds, and switch this section off otherwise.
                      </p>
                    </>
                  ) : null}

                  {has('insightCards') ? (
                    <Repeater
                      label="Featured articles"
                      items={(block.insightCards as Array<{ slug: string; label: string; accent: AccentToken }>) ?? []}
                      onChange={(insightCards) => update({ insightCards } as unknown as Partial<Block>)}
                      itemLabel={(c) => c.label || c.slug || 'Article'}
                      create={() => ({ slug: '', label: '', accent: 'indigo' as AccentToken })}
                      render={(card, updateCard) => (
                        <>
                          <div className="adm-grid2">
                            <Text label="Article slug" value={card.slug} onChange={(v) => updateCard({ slug: v })} />
                            <Text label="Badge label" value={card.label} onChange={(v) => updateCard({ label: v })} />
                          </div>
                          <AccentPicker value={card.accent} onChange={(v) => updateCard({ accent: v })} />
                        </>
                      )}
                    />
                  ) : null}

                  {has('groups') ? (
                    <Repeater
                      label="Technology categories"
                      items={(block.groups as TechGroup[]) ?? []}
                      onChange={(groups) => update({ groups } as unknown as Partial<Block>)}
                      itemLabel={(g) => g.category || 'Category'}
                      create={() => ({ category: '', accent: 'indigo' as AccentToken, items: [] })}
                      render={(group, updateGroup) => (
                        <>
                          <Text
                            label="Category"
                            value={group.category}
                            onChange={(v) => updateGroup({ category: v })}
                          />
                          <AccentPicker value={group.accent} onChange={(v) => updateGroup({ accent: v })} />
                          <Repeater
                            label="Technologies"
                            items={group.items ?? []}
                            onChange={(items) => updateGroup({ items })}
                            itemLabel={(t) => t.label || 'Technology'}
                            create={() => ({ label: '', icon: '', image: { ...EMPTY_MEDIA } })}
                            render={(tech, updateTech) => (
                              <>
                                <Text label="Name" value={tech.label} onChange={(v) => updateTech({ label: v })} />
                                <MediaPicker
                                  label="Logo"
                                  value={tech.image}
                                  onChange={(v) => updateTech({ image: v })}
                                  recommended="64×64, square, transparent background"
                                />
                                <IconPicker value={tech.icon} onChange={(v) => updateTech({ icon: v })} />
                                <p className="hint">
                                  The logo is used if set, otherwise the icon, otherwise the first two letters of the
                                  name.
                                </p>
                              </>
                            )}
                          />
                        </>
                      )}
                    />
                  ) : null}

                  {has('leadForm') ? (
                    (() => {
                      /*
                        The enquiry form's own labels and options, stored as one nested object.

                        Written through a helper so each field merges into the object rather than
                        replacing it — editing the submit button must not drop the service list.
                      */
                      const form = (block.leadForm as LeadFormConfig) ?? {};
                      const setForm = (patch: Partial<LeadFormConfig>) =>
                        update({ leadForm: { ...form, ...patch } } as unknown as Partial<Block>);

                      return (
                        <>
                          <div className="adm-grid2">
                            <Text
                              label="Form heading"
                              value={String(form.title ?? '')}
                              onChange={(v) => setForm({ title: v })}
                            />
                            <Text
                              label="Submit button"
                              value={String(form.submitLabel ?? '')}
                              onChange={(v) => setForm({ submitLabel: v })}
                            />
                          </div>
                          <div className="adm-grid2">
                            <Text
                              label="Service field label"
                              value={String(form.serviceLabel ?? '')}
                              onChange={(v) => setForm({ serviceLabel: v })}
                            />
                            <Text
                              label="Budget field label"
                              value={String(form.budgetLabel ?? '')}
                              onChange={(v) => setForm({ budgetLabel: v })}
                            />
                          </div>
                          <StringList
                            label="Service options"
                            items={form.serviceOptions ?? []}
                            onChange={(v) => setForm({ serviceOptions: v })}
                          />
                          <StringList
                            label="Budget options"
                            items={form.budgetOptions ?? []}
                            onChange={(v) => setForm({ budgetOptions: v })}
                          />
                          <Text
                            label="Details field label"
                            value={String(form.detailsLabel ?? '')}
                            onChange={(v) => setForm({ detailsLabel: v })}
                          />
                          <TextArea
                            label="Details placeholder"
                            value={String(form.detailsPlaceholder ?? '')}
                            onChange={(v) => setForm({ detailsPlaceholder: v })}
                            rows={2}
                          />
                          <TextArea
                            label="Budget note"
                            value={String(form.budgetNote ?? '')}
                            onChange={(v) => setForm({ budgetNote: v })}
                            rows={2}
                          />
                          <TextArea
                            label="Reassurance line"
                            value={String(form.reassurance ?? '')}
                            onChange={(v) => setForm({ reassurance: v })}
                            rows={2}
                          />
                        </>
                      );
                    })()
                  ) : null}

                  {/*
                    Plain wording that several block types carry — breadcrumbs, sidebar headings,
                    the labels on an article's navigation. Each is a single line of text with no
                    shape of its own, so one loop serves all of them rather than thirty near
                    identical conditionals. A field appears only when its block actually has it.
                  */}
                  {PLAIN_TEXT_KEYS.filter((key) => has(key)).map((key) => (
                    <Text
                      key={key}
                      label={PLAIN_TEXT_LABELS[key] ?? key}
                      value={String(block[key] ?? '')}
                      onChange={(v) => update({ [key]: v } as unknown as Partial<Block>)}
                    />
                  ))}

                  {LONG_TEXT_KEYS.filter((key) => has(key)).map((key) => (
                    <TextArea
                      key={key}
                      label={PLAIN_TEXT_LABELS[key] ?? key}
                      value={String(block[key] ?? '')}
                      onChange={(v) => update({ [key]: v } as unknown as Partial<Block>)}
                      rows={key === 'bodyHtml' || key === 'defaultBody' ? 14 : 3}
                      {...(key === 'bodyHtml' || key === 'defaultBody'
                        ? { hint: 'Headings, paragraphs and lists only — sanitised on save.' }
                        : {})}
                    />
                  ))}

                  {has('cards') ? (
                    <Repeater
                      label="Office cards"
                      items={(block.cards as OfficeCard[]) ?? []}
                      onChange={(cards) => update({ cards } as unknown as Partial<Block>)}
                      itemLabel={(o) => o.city || o.kind || 'Office'}
                      create={() => ({
                        accent: 'indigo' as AccentToken,
                        kind: '',
                        city: '',
                        addressLines: [],
                        phoneLabel: '',
                        phoneHref: '',
                        emailLabel: '',
                        emailHref: '',
                      })}
                      render={(office, updateOffice) => (
                        <>
                          <div className="adm-grid2">
                            <Text label="Kind" value={office.kind ?? ''} onChange={(v) => updateOffice({ kind: v })} />
                            <Text label="City" value={office.city ?? ''} onChange={(v) => updateOffice({ city: v })} />
                          </div>
                          <StringList
                            label="Address"
                            items={office.addressLines ?? []}
                            onChange={(v) => updateOffice({ addressLines: v })}
                          />
                          <div className="adm-grid2">
                            <Text
                              label="Phone"
                              value={office.phoneLabel ?? ''}
                              onChange={(v) => updateOffice({ phoneLabel: v, phoneHref: `tel:${v.replace(/[^\d+]/g, '')}` })}
                            />
                            <Text
                              label="Email"
                              value={office.emailLabel ?? ''}
                              onChange={(v) => updateOffice({ emailLabel: v, emailHref: `mailto:${v}` })}
                            />
                          </div>
                          <AccentPicker value={office.accent} onChange={(v) => updateOffice({ accent: v })} />
                          <p className="hint">
                            Published exactly as written, and the phone and email become working links. Use real
                            details only.
                          </p>
                        </>
                      )}
                    />
                  ) : null}

                  {has('stepCards') ? (
                    <Repeater
                      label="Steps"
                      items={(block.stepCards as Array<{ accent: AccentToken; number: string; title: string; description: string }>) ?? []}
                      onChange={(stepCards) => update({ stepCards } as unknown as Partial<Block>)}
                      itemLabel={(s) => s.title || 'Step'}
                      create={() => ({ accent: 'indigo' as AccentToken, number: '', title: '', description: '' })}
                      render={(step, updateStep) => (
                        <>
                          <div className="adm-grid2">
                            <Text label="Number" value={step.number} onChange={(v) => updateStep({ number: v })} />
                            <Text label="Title" value={step.title} onChange={(v) => updateStep({ title: v })} />
                          </div>
                          <TextArea links
                            label="Description"
                            value={step.description}
                            onChange={(v) => updateStep({ description: v })}
                            rows={2}
                          />
                          <AccentPicker value={step.accent} onChange={(v) => updateStep({ accent: v })} />
                        </>
                      )}
                    />
                  ) : null}

                  {has('routes') ? (
                    <Repeater
                      label="Routes"
                      items={(block.routes as IconCard[]) ?? []}
                      onChange={(routes) => update({ routes } as unknown as Partial<Block>)}
                      itemLabel={(r) => r.title || 'Route'}
                      create={() => ({ accent: 'indigo' as AccentToken, icon: '', title: '', description: '' })}
                      render={(route, updateRoute) => (
                        <>
                          <Text label="Title" value={route.title} onChange={(v) => updateRoute({ title: v })} />
                          <TextArea links
                            label="Description"
                            value={route.description}
                            onChange={(v) => updateRoute({ description: v })}
                            rows={2}
                          />
                          <div className="adm-grid2">
                            <AccentPicker value={route.accent} onChange={(v) => updateRoute({ accent: v })} />
                            <IconPicker value={route.icon} onChange={(v) => updateRoute({ icon: v })} />
                          </div>
                        </>
                      )}
                    />
                  ) : null}

                  {has('clauses') ? (
                    <Repeater
                      label="Contents"
                      items={(block.clauses as Array<{ id: string; number: string; title: string }>) ?? []}
                      onChange={(clauses) => update({ clauses } as unknown as Partial<Block>)}
                      itemLabel={(c) => c.title || 'Clause'}
                      create={() => ({ id: '', number: '', title: '' })}
                      render={(clause, updateClause) => (
                        <>
                          <div className="adm-grid2">
                            <Text label="Number" value={clause.number} onChange={(v) => updateClause({ number: v })} />
                            <Text
                              label="Anchor id"
                              value={clause.id}
                              onChange={(v) => updateClause({ id: v })}
                            />
                          </div>
                          <Text label="Title" value={clause.title} onChange={(v) => updateClause({ title: v })} />
                        </>
                      )}
                    />
                  ) : null}

                  {has('principles') ? (
                    <Repeater
                      label="Principles"
                      items={(block.principles as Array<{ accent: AccentToken; number: string; title: string; description: string }>) ?? []}
                      onChange={(principles) => update({ principles } as unknown as Partial<Block>)}
                      itemLabel={(p) => p.title || 'Untitled'}
                      create={() => ({ accent: 'indigo' as AccentToken, number: '', title: '', description: '' })}
                      render={(item, updateItem) => (
                        <>
                          <div className="adm-grid2">
                            <Text label="Number" value={item.number} onChange={(v) => updateItem({ number: v })} />
                            <Text label="Title" value={item.title} onChange={(v) => updateItem({ title: v })} />
                          </div>
                          <TextArea links
                            label="Description"
                            value={item.description}
                            onChange={(v) => updateItem({ description: v })}
                          />
                          <AccentPicker value={item.accent} onChange={(v) => updateItem({ accent: v })} />
                        </>
                      )}
                    />
                  ) : null}

                  {has('steps') ? (
                    <Repeater
                      label="Steps"
                      items={(block.steps as Array<{ title: string; description: string; deliverables: string[] }>) ?? []}
                      onChange={(steps) => update({ steps } as unknown as Partial<Block>)}
                      itemLabel={(s) => s.title || 'Step'}
                      create={() => ({ title: '', description: '', deliverables: [] })}
                      render={(step, updateStep) => (
                        <>
                          <Text label="Title" value={step.title} onChange={(v) => updateStep({ title: v })} />
                          <TextArea links
                            label="Description"
                            value={step.description}
                            onChange={(v) => updateStep({ description: v })}
                          />
                          <StringList
                            label="Deliverables"
                            items={step.deliverables ?? []}
                            onChange={(v) => updateStep({ deliverables: v })}
                          />
                        </>
                      )}
                    />
                  ) : null}

                  {has('badges') ? (
                    <Repeater
                      label="Badges"
                      items={(block.badges as Array<{ accent: AccentToken; label: string; icon: string }>) ?? []}
                      onChange={(badges) => update({ badges } as unknown as Partial<Block>)}
                      itemLabel={(b) => b.label || 'Badge'}
                      create={() => ({ accent: 'indigo' as AccentToken, label: '', icon: '' })}
                      render={(badge, updateBadge) => (
                        <>
                          <Text label="Label" value={badge.label} onChange={(v) => updateBadge({ label: v })} />
                          <div className="adm-grid2">
                            <AccentPicker value={badge.accent} onChange={(v) => updateBadge({ accent: v })} />
                            <IconPicker value={badge.icon} onChange={(v) => updateBadge({ icon: v })} />
                          </div>
                        </>
                      )}
                    />
                  ) : null}

                  {has('items') && Array.isArray(block.items) && typeof block.items[0] === 'string' ? (
                    <StringList
                      label="Items"
                      items={block.items as string[]}
                      onChange={(v) => update({ items: v } as unknown as Partial<Block>)}
                    />
                  ) : null}

                  {has('formTitle') || has('formNote') ? (
                    <div className="adm-grid2">
                      <Text
                        label="Form heading"
                        value={String(block.formTitle ?? '')}
                        onChange={(v) => update({ formTitle: v } as Partial<Block>)}
                      />
                      <Text
                        label="Form note"
                        value={String(block.formNote ?? '')}
                        onChange={(v) => update({ formNote: v } as Partial<Block>)}
                      />
                    </div>
                  ) : null}

                  <Toggle
                    label="Show this section"
                    value={block.enabled !== false}
                    onChange={(v) => update({ enabled: v } as Partial<Block>)}
                  />
                </>
                );
              }}
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

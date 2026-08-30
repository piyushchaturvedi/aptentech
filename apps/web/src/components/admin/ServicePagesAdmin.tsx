'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AccentToken, ServiceKind, ServicePage } from '@aptentech/shared';
import { EMPTY_MEDIA } from '@aptentech/shared';
import { useAdmin } from './AdminClient';
import { AccentPicker, IconPicker, MediaPicker, Repeater, Select, StringList, Text, TextArea, Toggle } from './Fields';

/**
 * Service and solution page editor.
 *
 * One screen serves both families — they share a document shape, and `kind` only decides
 * the URL prefix. Every section of the page is editable, but only its *content*: an editor
 * can rewrite any heading, reorder or hide sections and swap images, and cannot touch
 * layout, colours outside the palette, or markup.
 *
 * Saving publishes through the API, which invalidates the affected cache tags, so the
 * public page reflects the change within seconds without a redeploy.
 */

interface Summary {
  id: string;
  slug: string;
  name: string;
  status: string;
  order: number;
  heroTitle: string;
}

const SECTION_KEYS = [
  'positioning',
  'services',
  'recognition',
  'solutions',
  'caseStudies',
  'testimonials',
  'features',
  'technologies',
  'compliance',
  'process',
  'pricing',
  'techStack',
  'why',
  'faqs',
  'latestInsights',
] as const;

export function ServicePagesAdmin({ kind }: { kind: ServiceKind }) {
  const { request, session } = useAdmin();

  const [list, setList] = useState<Summary[] | null>(null);
  const [editing, setEditing] = useState<ServicePage | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await request<Summary[]>(`/content/${kind}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load pages.');
    }
  }, [request, kind]);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  async function open(id: string) {
    setError('');
    setNotice('');
    try {
      setEditing(await request<ServicePage>(`/service-pages/${id}`));
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
      // `id`, `createdAt` and `updatedAt` are server-owned and rejected by the schema.
      const { id, createdAt, updatedAt, ...payload } = editing as ServicePage & Record<string, unknown>;
      await request(`/service-pages/${id}`, { method: 'PUT', json: payload });
      setNotice('Saved. The live page will update within a few seconds.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  const patch = (p: Partial<ServicePage>) => setEditing((prev) => (prev ? { ...prev, ...p } : prev));

  if (editing) {
    const urlPrefix = kind === 'service' ? '/services/' : '/solutions/';
    const hidden = new Set(editing.hiddenSections);

    return (
      <>
        {error ? <div className="adm-alert error">{error}</div> : null}
        {notice ? <div className="adm-alert ok">{notice}</div> : null}

        <div className="adm-panel">
          <div className="adm-panel-head">
            <h2>{editing.name}</h2>
            <code>
              {urlPrefix}
              {editing.slug}/
            </code>
            <span className="spacer" />
            <a className="adm-btn ghost sm" href={`${urlPrefix}${editing.slug}/`} target="_blank" rel="noopener">
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
              <Text label="Name" value={editing.name} onChange={(v) => patch({ name: v })} />
              <Text
                label="Slug"
                value={editing.slug}
                onChange={(v) => patch({ slug: v })}
                hint="Changing this changes the public URL. Existing slugs are indexed — set up a redirect first."
              />
              <Select
                label="Status"
                value={editing.status}
                onChange={(v) => patch({ status: v as ServicePage['status'] })}
                options={[
                  { value: 'PUBLISHED', label: 'Published' },
                  { value: 'DRAFT', label: 'Draft' },
                  { value: 'ARCHIVED', label: 'Archived' },
                ]}
              />
              <Text
                label="Order"
                type="number"
                value={String(editing.order)}
                onChange={(v) => patch({ order: Number(v) || 0 })}
              />
            </div>
          </div>
        </div>

        <Panel title="Hero">
          <Text label="Eyebrow" value={editing.heroEyebrow} onChange={(v) => patch({ heroEyebrow: v })} />
          <Text label="Heading (H1)" value={editing.heroTitle} onChange={(v) => patch({ heroTitle: v })} />
          <TextArea label="Standfirst" value={editing.heroDescription} onChange={(v) => patch({ heroDescription: v })} />
          <MediaPicker label="Hero image" value={editing.heroImage} onChange={(v) => patch({ heroImage: v })} />
        </Panel>

        <Panel title="Introduction">
          <Text label="Value proposition heading" value={editing.valuePropTitle} onChange={(v) => patch({ valuePropTitle: v })} />
          <TextArea label="Value proposition body" value={editing.valuePropBody} onChange={(v) => patch({ valuePropBody: v })} />
          <Text label="Positioning heading" value={editing.positioningTitle} onChange={(v) => patch({ positioningTitle: v })} />
          <TextArea label="Positioning body" value={editing.positioningBody} onChange={(v) => patch({ positioningBody: v })} />
          <MediaPicker label="Positioning image" value={editing.positioningImage} onChange={(v) => patch({ positioningImage: v })} />
          {kind === 'solution' ? (
            <>
              <Text label="Market context heading" value={editing.marketContextTitle} onChange={(v) => patch({ marketContextTitle: v })} />
              <TextArea label="Market context body" value={editing.marketContextBody} onChange={(v) => patch({ marketContextBody: v })} />
            </>
          ) : null}
        </Panel>

        <Panel title="Services">
          <Text label="Section heading" value={editing.servicesTitle} onChange={(v) => patch({ servicesTitle: v })} />
          <Repeater
            label="Services"
            items={editing.services}
            onChange={(services) => patch({ services })}
            itemLabel={(s) => s.title || 'Untitled'}
            create={() => ({ accent: 'indigo' as AccentToken, title: '', description: '', icon: '', bullets: [] })}
            render={(item, update) => (
              <>
                <Text label="Title" value={item.title} onChange={(v) => update({ title: v })} />
                <TextArea label="Description" value={item.description} onChange={(v) => update({ description: v })} />
                <div className="adm-grid2">
                  <AccentPicker value={item.accent} onChange={(v) => update({ accent: v })} />
                  <IconPicker value={item.icon} onChange={(v) => update({ icon: v })} />
                </div>
                <StringList label="Bullets" items={item.bullets} onChange={(v) => update({ bullets: v })} />
              </>
            )}
          />
        </Panel>

        <Panel title="Solutions">
          <Text label="Section heading" value={editing.solutionsTitle} onChange={(v) => patch({ solutionsTitle: v })} />
          <Repeater
            label="Solutions"
            items={editing.solutions}
            onChange={(solutions) => patch({ solutions })}
            itemLabel={(s) => s.title || 'Untitled'}
            create={() => ({ accent: 'indigo' as AccentToken, title: '', featured: false, icon: '', bullets: [] })}
            render={(item, update) => (
              <>
                <Text label="Title" value={item.title} onChange={(v) => update({ title: v })} />
                <div className="adm-grid2">
                  <AccentPicker value={item.accent} onChange={(v) => update({ accent: v })} />
                  <IconPicker value={item.icon} onChange={(v) => update({ icon: v })} />
                </div>
                <Toggle label="Featured (wide tile)" value={item.featured} onChange={(v) => update({ featured: v })} />
                <StringList label="Bullets" items={item.bullets} onChange={(v) => update({ bullets: v })} />
              </>
            )}
          />
        </Panel>

        <Panel title="Features">
          <Text label="Section heading" value={editing.featuresTitle} onChange={(v) => patch({ featuresTitle: v })} />
          <Select
            label="Layout"
            value={editing.featuresLayout}
            onChange={(v) => patch({ featuresLayout: v as 'chips' | 'groups' })}
            options={[
              { value: 'chips', label: 'Chip grid (service pages)' },
              { value: 'groups', label: 'Grouped cards (solution pages)' },
            ]}
            hint="Matches the two layouts in the approved design."
          />
          <Repeater
            label="Features"
            items={editing.features}
            onChange={(features) => patch({ features })}
            itemLabel={(f) => f.title || 'Untitled'}
            create={() => ({ accent: 'indigo' as AccentToken, title: '', description: '', icon: '', items: [] })}
            render={(item, update) => (
              <>
                <Text label="Title" value={item.title} onChange={(v) => update({ title: v })} />
                {editing.featuresLayout === 'groups' ? (
                  <>
                    <TextArea label="Description" value={item.description} onChange={(v) => update({ description: v })} />
                    <StringList label="Items" items={item.items} onChange={(v) => update({ items: v })} />
                  </>
                ) : null}
                <div className="adm-grid2">
                  <AccentPicker value={item.accent} onChange={(v) => update({ accent: v })} />
                  <IconPicker value={item.icon} onChange={(v) => update({ icon: v })} />
                </div>
              </>
            )}
          />
        </Panel>

        <Panel title="Technologies">
          <Text label="Section heading" value={editing.technologiesTitle} onChange={(v) => patch({ technologiesTitle: v })} />
          <Repeater
            label="Technologies"
            items={editing.technologies}
            onChange={(technologies) => patch({ technologies })}
            itemLabel={(t) => t.title || 'Untitled'}
            create={() => ({ accent: 'indigo' as AccentToken, title: '', description: '', icon: '' })}
            render={(item, update) => (
              <>
                <Text label="Title" value={item.title} onChange={(v) => update({ title: v })} />
                <TextArea label="Description" value={item.description} onChange={(v) => update({ description: v })} />
                <div className="adm-grid2">
                  <AccentPicker value={item.accent} onChange={(v) => update({ accent: v })} />
                  <IconPicker value={item.icon} onChange={(v) => update({ icon: v })} />
                </div>
              </>
            )}
          />
        </Panel>

        <Panel title="Compliance & standards">
          <Text label="Section heading" value={editing.complianceTitle} onChange={(v) => patch({ complianceTitle: v })} />
          <Repeater
            label="Badges"
            items={editing.compliance}
            onChange={(compliance) => patch({ compliance })}
            itemLabel={(c) => c.label || 'Untitled'}
            create={() => ({ accent: 'indigo' as AccentToken, label: '', icon: '' })}
            render={(item, update) => (
              <>
                <Text label="Label" value={item.label} onChange={(v) => update({ label: v })} />
                <div className="adm-grid2">
                  <AccentPicker value={item.accent} onChange={(v) => update({ accent: v })} />
                  <IconPicker value={item.icon} onChange={(v) => update({ icon: v })} />
                </div>
              </>
            )}
          />
        </Panel>

        <Panel title="Process">
          <Text label="Section heading" value={editing.processTitle} onChange={(v) => patch({ processTitle: v })} />
          <Repeater
            label="Stages"
            items={editing.process}
            onChange={(process) => patch({ process })}
            itemLabel={(s, i) => `${String(i + 1).padStart(2, '0')} · ${s.title || 'Untitled'}`}
            create={() => ({ title: '', description: '', deliverables: [] })}
            render={(item, update) => (
              <>
                <Text label="Title" value={item.title} onChange={(v) => update({ title: v })} />
                <TextArea label="Description" value={item.description} onChange={(v) => update({ description: v })} />
                <StringList label="Deliverables" items={item.deliverables} onChange={(v) => update({ deliverables: v })} />
              </>
            )}
          />
        </Panel>

        <Panel title="Pricing">
          <Text label="Section heading" value={editing.pricingTitle} onChange={(v) => patch({ pricingTitle: v })} />
          <TextArea label="Body" value={editing.pricingBody} onChange={(v) => patch({ pricingBody: v })} />
        </Panel>

        <Panel title="Tech stack">
          <Text label="Section heading" value={editing.techStackTitle} onChange={(v) => patch({ techStackTitle: v })} />
          <Repeater
            label="Categories"
            items={editing.techStack}
            onChange={(techStack) => patch({ techStack })}
            itemLabel={(t) => t.category || 'Untitled'}
            create={() => ({ category: '', accent: 'indigo' as AccentToken, items: [] })}
            render={(item, update) => (
              <>
                <Text label="Category" value={item.category} onChange={(v) => update({ category: v })} />
                <AccentPicker value={item.accent} onChange={(v) => update({ accent: v })} />
                <StringList label="Technologies" items={item.items} onChange={(v) => update({ items: v })} />
              </>
            )}
          />
        </Panel>

        <Panel title="Why Aptentech">
          <Text label="Section heading" value={editing.whyTitle} onChange={(v) => patch({ whyTitle: v })} />
          <Repeater
            label="Reasons"
            items={editing.why}
            onChange={(why) => patch({ why })}
            itemLabel={(w, i) => `${String(i + 1).padStart(2, '0')} · ${w.title || 'Untitled'}`}
            create={() => ({ title: '', description: '' })}
            render={(item, update) => (
              <>
                <Text label="Title" value={item.title} onChange={(v) => update({ title: v })} />
                <TextArea label="Description" value={item.description} onChange={(v) => update({ description: v })} />
              </>
            )}
          />
        </Panel>

        <Panel title="FAQs">
          <Text label="Section heading" value={editing.faqTitle} onChange={(v) => patch({ faqTitle: v })} />
          <p className="hint">
            These are published as FAQPage structured data, generated on the server from exactly the questions shown
            on the page.
          </p>
          <Repeater
            label="Questions"
            items={editing.faqs}
            onChange={(faqs) => patch({ faqs })}
            itemLabel={(f) => f.question || 'Untitled'}
            create={() => ({ question: '', answer: '', category: '', order: 0, visible: true })}
            render={(item, update) => (
              <>
                <Text label="Question" value={item.question} onChange={(v) => update({ question: v })} />
                <TextArea label="Answer" value={item.answer} onChange={(v) => update({ answer: v })} rows={4} />
                <Toggle label="Visible" value={item.visible !== false} onChange={(v) => update({ visible: v })} />
              </>
            )}
          />
        </Panel>

        <Panel title="Calls to action">
          <Text label="Mid-page CTA heading" value={editing.midCtaTitle} onChange={(v) => patch({ midCtaTitle: v })} />
          <TextArea label="Mid-page CTA body" value={editing.midCtaBody} onChange={(v) => patch({ midCtaBody: v })} />
          <Text label="Second CTA heading" value={editing.midCta2Title} onChange={(v) => patch({ midCta2Title: v })} />
          <Text label="Closing heading" value={editing.closingCtaTitle} onChange={(v) => patch({ closingCtaTitle: v })} />
          <TextArea label="Closing body" value={editing.closingCtaBody} onChange={(v) => patch({ closingCtaBody: v })} />
        </Panel>

        <Panel title="Lead form">
          <div className="adm-grid2">
            <Text
              label="Submit button label"
              value={editing.leadForm.submitLabel}
              onChange={(v) => patch({ leadForm: { ...editing.leadForm, submitLabel: v } })}
            />
            <Text
              label="Service field label"
              value={editing.leadForm.serviceLabel}
              onChange={(v) => patch({ leadForm: { ...editing.leadForm, serviceLabel: v } })}
            />
            <Text
              label="Budget field label"
              value={editing.leadForm.budgetLabel}
              onChange={(v) => patch({ leadForm: { ...editing.leadForm, budgetLabel: v } })}
            />
            <Text
              label="Details field label"
              value={editing.leadForm.detailsLabel}
              onChange={(v) => patch({ leadForm: { ...editing.leadForm, detailsLabel: v } })}
            />
          </div>
          <StringList
            label="Service options"
            items={editing.leadForm.serviceOptions}
            onChange={(v) => patch({ leadForm: { ...editing.leadForm, serviceOptions: v } })}
          />
          <StringList
            label="Budget options"
            items={editing.leadForm.budgetOptions}
            onChange={(v) => patch({ leadForm: { ...editing.leadForm, budgetOptions: v } })}
          />
          <TextArea
            label="Details placeholder"
            value={editing.leadForm.detailsPlaceholder}
            onChange={(v) => patch({ leadForm: { ...editing.leadForm, detailsPlaceholder: v } })}
          />
          <TextArea
            label="Budget note"
            value={editing.leadForm.budgetNote}
            onChange={(v) => patch({ leadForm: { ...editing.leadForm, budgetNote: v } })}
          />
          <TextArea
            label="Reassurance line"
            value={editing.leadForm.reassurance}
            onChange={(v) => patch({ leadForm: { ...editing.leadForm, reassurance: v } })}
          />
        </Panel>

        <Panel title="Section visibility">
          <p className="hint">
            Hide a section to remove it from the page entirely. Order follows the approved design and can be adjusted
            in Settings if needed.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
            {SECTION_KEYS.map((key) => (
              <Toggle
                key={key}
                label={key}
                value={!hidden.has(key)}
                onChange={(visible) =>
                  patch({
                    hiddenSections: visible
                      ? editing.hiddenSections.filter((k) => k !== key)
                      : [...editing.hiddenSections, key],
                  })
                }
              />
            ))}
          </div>
        </Panel>

        <Panel title="SEO">
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
            hint="Leave as-is unless the URL genuinely moved. This is what search engines index."
          />
          <div className="adm-grid2">
            <Text label="OG title" value={editing.seo.ogTitle} onChange={(v) => patch({ seo: { ...editing.seo, ogTitle: v } })} />
            <Text
              label="OG description"
              value={editing.seo.ogDescription}
              onChange={(v) => patch({ seo: { ...editing.seo, ogDescription: v } })}
            />
          </div>
          <MediaPicker
            label="Social share image"
            value={editing.seo.ogImage ?? { ...EMPTY_MEDIA }}
            onChange={(v) => patch({ seo: { ...editing.seo, ogImage: v } })}
          />
          <div className="adm-grid2">
            <Toggle label="Allow indexing" value={editing.seo.robotsIndex} onChange={(v) => patch({ seo: { ...editing.seo, robotsIndex: v } })} />
            <Toggle label="Follow links" value={editing.seo.robotsFollow} onChange={(v) => patch({ seo: { ...editing.seo, robotsFollow: v } })} />
          </div>
        </Panel>

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

      <div className="adm-panel">
        <div className="adm-panel-head">
          <h2>{kind === 'service' ? 'Service pages' : 'Solution pages'}</h2>
          <span className="spacer" />
          <span className="hint">URLs are preserved from the original site and should not be changed casually.</span>
        </div>

        {!list ? (
          <div className="adm-empty">Loading…</div>
        ) : (
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th className="num">Order</th>
                  <th>Name</th>
                  <th>URL</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((item) => (
                  <tr key={item.id}>
                    <td className="num">{item.order}</td>
                    <td>{item.name}</td>
                    <td>
                      <code>
                        {kind === 'service' ? '/services/' : '/solutions/'}
                        {item.slug}/
                      </code>
                    </td>
                    <td>
                      <span className={`adm-chip ${item.status.toLowerCase()}`}>{item.status}</span>
                    </td>
                    <td>
                      <button className="adm-btn ghost sm" onClick={() => void open(item.id)}>
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="adm-panel">
      <div className="adm-panel-head">
        <h2>{title}</h2>
      </div>
      <div className="adm-panel-body">{children}</div>
    </div>
  );
}

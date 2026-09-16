'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AccentToken, CtaLink, ServiceKind, ServicePage } from '@aptentech/shared';
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

    /*
      The standfirst printed under a section heading.

      These are stored in one `sectionLedes` map keyed by section id rather than as a field per
      section, so each panel reaches its own through this instead of through `patch`. Editing
      one must not drop the rest, hence the spread.
    */
    const setLede = (id: string, value: string) =>
      patch({ sectionLedes: { ...editing.sectionLedes, [id]: value } });

    const Lede = ({ id }: { id: string }) => (
      <TextArea
        label="Text under the heading"
        value={editing.sectionLedes?.[id] ?? ''}
        onChange={(v) => setLede(id, v)}
        rows={3}
      />
    );

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

        {/*
          Stated once, at the top, rather than repeated under every body field — there are
          around forty of them and the notation is the same in all of them.
        */}
        <div className="adm-alert ok" style={{ marginBottom: 14 }}>
          <strong>Links inside text.</strong> In any body or description field, write{' '}
          <code>[the words to link](/where/it/goes/)</code> to turn a phrase into a link. It prints underlined in the
          surrounding colour. Panels below are numbered in the order the sections appear on the live page.
        </div>

        <Panel title="1 · Hero">
          <Text label="Eyebrow" value={editing.heroEyebrow} onChange={(v) => patch({ heroEyebrow: v })} />
          <Text label="Heading (H1)" value={editing.heroTitle} onChange={(v) => patch({ heroTitle: v })} />
          <Text
            label="Heading — highlighted tail"
            value={editing.heroTitleHighlight}
            onChange={(v) => patch({ heroTitleHighlight: v })}
          />
          <p className="hint">The highlighted words print in the gradient at the end of the H1.</p>
          <TextArea label="Standfirst" value={editing.heroDescription} onChange={(v) => patch({ heroDescription: v })} />
          <StringList label="Tick points" items={editing.heroPoints} onChange={(v) => patch({ heroPoints: v })} />
          <div className="adm-grid2">
            <Text label="Button label" value={editing.heroCtaLabel} onChange={(v) => patch({ heroCtaLabel: v })} />
            <Text label="Note beside the button" value={editing.heroCtaNote} onChange={(v) => patch({ heroCtaNote: v })} />
          </div>
          <MediaPicker
            label="Hero image"
            value={editing.heroImage}
            onChange={(v) => patch({ heroImage: v })}
            recommended="1200×900"
          />
          <Text label="Form heading" value={editing.heroFormTitle} onChange={(v) => patch({ heroFormTitle: v })} />
          <TextArea
            label="Form subheading"
            value={editing.heroFormSubtitle}
            onChange={(v) => patch({ heroFormSubtitle: v })}
          />
        </Panel>

        <Panel title="2 · Client strip">
          <Text label="Strip label" value={editing.brandStripLabel} onChange={(v) => patch({ brandStripLabel: v })} />
          <StringList label="Logo slots" items={editing.logoSlots} onChange={(v) => patch({ logoSlots: v })} />
          <p className="hint">One name per slot. These render as the approved placeholder marks, not uploaded logos.</p>
        </Panel>

        <Panel title="3 · Three-card band">
          <Text label="Section heading" value={editing.protectTitle} onChange={(v) => patch({ protectTitle: v })} />
          <Lede id="protect" />
          <Repeater
            label="Cards"
            items={editing.protect}
            onChange={(protect) => patch({ protect })}
            itemLabel={(p) => p.title || 'Untitled'}
            create={() => ({ accent: 'indigo' as AccentToken, icon: '', title: '', description: '' })}
            render={(item, update) => (
              <>
                <Text label="Title" value={item.title} onChange={(v) => update({ title: v })} />
                <TextArea label="Body" value={item.description} onChange={(v) => update({ description: v })} />
                <div className="adm-grid2">
                  <AccentPicker value={item.accent} onChange={(v) => update({ accent: v })} />
                  <IconPicker value={item.icon} onChange={(v) => update({ icon: v })} />
                </div>
              </>
            )}
          />
        </Panel>

        <Panel title="4 · Introduction">
          <Text
            label="Value proposition heading"
            value={editing.valuePropTitle}
            onChange={(v) => patch({ valuePropTitle: v })}
          />
          <TextArea
            label="Value proposition body"
            value={editing.valuePropBody}
            onChange={(v) => patch({ valuePropBody: v })}
            rows={6}
          />
          <Text
            label="Capability list heading"
            value={editing.coreCapabilitiesTitle}
            onChange={(v) => patch({ coreCapabilitiesTitle: v })}
          />
          <StringList
            label="Capabilities"
            items={editing.coreCapabilities}
            onChange={(v) => patch({ coreCapabilities: v })}
          />
          <div className="adm-grid2">
            <Text label="Media caption" value={editing.introMediaLabel} onChange={(v) => patch({ introMediaLabel: v })} />
            <Text label="Media sub-caption" value={editing.introMediaHint} onChange={(v) => patch({ introMediaHint: v })} />
          </div>
        </Panel>

        <Panel title="5 · Positioning">
          <Text label="Heading" value={editing.positioningTitle} onChange={(v) => patch({ positioningTitle: v })} />
          <TextArea
            label="Body"
            value={editing.positioningBody}
            onChange={(v) => patch({ positioningBody: v })}
            rows={6}
          />
          <MediaPicker
            label="Positioning image"
            value={editing.positioningImage}
            onChange={(v) => patch({ positioningImage: v })}
            recommended="960×720"
          />
        </Panel>

        <Panel title="6 · Market context">
          <Text label="Heading" value={editing.marketContextTitle} onChange={(v) => patch({ marketContextTitle: v })} />
          <TextArea
            label="Body"
            value={editing.marketContextBody}
            onChange={(v) => patch({ marketContextBody: v })}
            rows={5}
          />
          <Lede id="marketContext" />
          <Repeater
            label="Market figures"
            items={editing.marketStats}
            onChange={(marketStats) => patch({ marketStats })}
            itemLabel={(s) => s.label || 'Untitled'}
            create={() => ({ value: '', label: '' })}
            render={(item, update) => (
              <div className="adm-grid2">
                <Text label="Figure" value={item.value} onChange={(v) => update({ value: v })} />
                <Text label="Label" value={item.label} onChange={(v) => update({ label: v })} />
              </div>
            )}
          />
          <p className="hint">
            Every figure here is a public claim about a market. Publish only numbers you can attribute.
          </p>
        </Panel>

        <Panel title="7 · Statistics">
          <Text label="Section heading" value={editing.statsTitle} onChange={(v) => patch({ statsTitle: v })} />
          <TextArea label="Note under the figures" value={editing.statsNote} onChange={(v) => patch({ statsNote: v })} />
          <Lede id="stats" />
          <Repeater
            label="Figures"
            items={editing.stats}
            onChange={(stats) => patch({ stats })}
            itemLabel={(s) => s.label || 'Untitled'}
            create={() => ({ value: '', suffix: '', label: '' })}
            render={(item, update) => (
              <>
                <div className="adm-grid2">
                  <Text label="Figure" value={item.value} onChange={(v) => update({ value: v })} />
                  <Text label="Suffix" value={item.suffix} onChange={(v) => update({ suffix: v })} />
                </div>
                <Text label="Label" value={item.label} onChange={(v) => update({ label: v })} />
              </>
            )}
          />
        </Panel>

        <Panel title="8 · Services">
          <Text label="Section heading" value={editing.servicesTitle} onChange={(v) => patch({ servicesTitle: v })} />
          <Lede id="services" />
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
          <Text
            label="Link label under the grid"
            value={editing.servicesCtaLabel}
            onChange={(v) => patch({ servicesCtaLabel: v })}
          />
        </Panel>

        <Panel title="9 · Mid-page call to action">
          <Text label="Heading" value={editing.midCtaTitle} onChange={(v) => patch({ midCtaTitle: v })} />
          <TextArea label="Body" value={editing.midCtaBody} onChange={(v) => patch({ midCtaBody: v })} />
          <StringList label="Points" items={editing.midCtaPoints} onChange={(v) => patch({ midCtaPoints: v })} />
          <CtaFields value={editing.midCtaButton} onChange={(midCtaButton) => patch({ midCtaButton })} />
        </Panel>

        <Panel title="10 · Recognition">
          <Text label="Section heading" value={editing.recognitionTitle} onChange={(v) => patch({ recognitionTitle: v })} />
          <Lede id="recognition" />
          <Text
            label="Lead card heading"
            value={editing.awardLead.title}
            onChange={(v) => patch({ awardLead: { ...editing.awardLead, title: v } })}
          />
          <TextArea
            label="Lead card body"
            value={editing.awardLead.body}
            onChange={(v) => patch({ awardLead: { ...editing.awardLead, body: v } })}
          />
          <div className="adm-grid2">
            <Text
              label="Rating"
              value={editing.awardLead.rating}
              onChange={(v) => patch({ awardLead: { ...editing.awardLead, rating: v } })}
            />
            <Text
              label="Rating note"
              value={editing.awardLead.ratingNote}
              onChange={(v) => patch({ awardLead: { ...editing.awardLead, ratingNote: v } })}
            />
          </div>
          <Repeater
            label="Awards"
            items={editing.awards}
            onChange={(awards) => patch({ awards })}
            itemLabel={(a) => a.title || 'Untitled'}
            create={() => ({ accent: 'indigo' as AccentToken, icon: '', title: '', meta: '' })}
            render={(item, update) => (
              <>
                <Text label="Award" value={item.title} onChange={(v) => update({ title: v })} />
                <Text label="Awarded by / year" value={item.meta} onChange={(v) => update({ meta: v })} />
                <div className="adm-grid2">
                  <AccentPicker value={item.accent} onChange={(v) => update({ accent: v })} />
                  <IconPicker value={item.icon} onChange={(v) => update({ icon: v })} />
                </div>
              </>
            )}
          />
          <p className="hint">
            A visitor cannot tell an invented award from a real one. List only recognition AptenTech actually holds,
            and hide this section otherwise.
          </p>
        </Panel>

        <Panel title="11 · Solutions">
          <Text label="Section heading" value={editing.solutionsTitle} onChange={(v) => patch({ solutionsTitle: v })} />
          <Lede id="solutions" />
          <Repeater
            label="Solutions"
            items={editing.solutions}
            onChange={(solutions) => patch({ solutions })}
            itemLabel={(s) => s.title || 'Untitled'}
            create={() => ({
              accent: 'indigo' as AccentToken,
              title: '',
              featured: false,
              icon: '',
              bullets: [],
            })}
            render={(item, update) => (
              <>
                <Text label="Title" value={item.title} onChange={(v) => update({ title: v })} />
                <div className="adm-grid2">
                  <AccentPicker value={item.accent} onChange={(v) => update({ accent: v })} />
                  <IconPicker value={item.icon} onChange={(v) => update({ icon: v })} />
                </div>
                <StringList label="Bullets" items={item.bullets} onChange={(v) => update({ bullets: v })} />
                <Toggle label="Featured" value={item.featured} onChange={(v) => update({ featured: v })} />
              </>
            )}
          />
          <Text
            label="Link label under the grid"
            value={editing.solutionsCtaLabel}
            onChange={(v) => patch({ solutionsCtaLabel: v })}
          />
        </Panel>

        <Panel title="12 · Case studies">
          <Text label="Section heading" value={editing.caseStudiesTitle} onChange={(v) => patch({ caseStudiesTitle: v })} />
          <Lede id="caseStudies" />
          <p className="hint">The studies themselves are managed under Case studies.</p>
        </Panel>

        <Panel title="13 · Testimonials">
          <Text
            label="Section heading"
            value={editing.testimonialsTitle}
            onChange={(v) => patch({ testimonialsTitle: v })}
          />
          <Lede id="testimonials" />
          <p className="hint">The quotes themselves are managed under Testimonials.</p>
        </Panel>

        <Panel title="14 · Features">
          <Text label="Section heading" value={editing.featuresTitle} onChange={(v) => patch({ featuresTitle: v })} />
          <Lede id="features" />
          <Select
            label="Layout"
            value={editing.featuresLayout}
            onChange={(v) => patch({ featuresLayout: v as 'chips' | 'groups' })}
            options={[
              { value: 'chips', label: 'Chip grid (service pages)' },
              { value: 'groups', label: 'Grouped cards (solution pages)' },
            ]}
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
                    <div className="adm-grid2">
                      <AccentPicker value={item.accent} onChange={(v) => update({ accent: v })} />
                      <IconPicker value={item.icon} onChange={(v) => update({ icon: v })} />
                    </div>
                    <StringList label="Items" items={item.items} onChange={(v) => update({ items: v })} />
                  </>
                ) : (
                  <AccentPicker value={item.accent} onChange={(v) => update({ accent: v })} />
                )}
              </>
            )}
          />
        </Panel>

        <Panel title="15 · Technologies">
          <Text
            label="Section heading"
            value={editing.technologiesTitle}
            onChange={(v) => patch({ technologiesTitle: v })}
          />
          <Lede id="technologies" />
          <Repeater
            label="Technologies"
            items={editing.technologies}
            onChange={(technologies) => patch({ technologies })}
            itemLabel={(t) => t.title || 'Untitled'}
            create={() => ({ accent: 'indigo' as AccentToken, title: '', description: '', icon: '', outcome: '' })}
            render={(item, update) => (
              <>
                <Text label="Title" value={item.title} onChange={(v) => update({ title: v })} />
                <TextArea label="Description" value={item.description} onChange={(v) => update({ description: v })} />
                <Text label="Outcome" value={item.outcome ?? ''} onChange={(v) => update({ outcome: v })} />
                <div className="adm-grid2">
                  <AccentPicker value={item.accent} onChange={(v) => update({ accent: v })} />
                  <IconPicker value={item.icon} onChange={(v) => update({ icon: v })} />
                </div>
              </>
            )}
          />
        </Panel>

        <Panel title="16 · Second call to action">
          <Text label="Heading" value={editing.midCta2Title} onChange={(v) => patch({ midCta2Title: v })} />
          <TextArea label="Body" value={editing.midCta2Body} onChange={(v) => patch({ midCta2Body: v })} />
          <StringList label="Points" items={editing.midCta2Points} onChange={(v) => patch({ midCta2Points: v })} />
          <CtaFields value={editing.midCta2Button} onChange={(midCta2Button) => patch({ midCta2Button })} />
          <MediaPicker
            label="Image"
            value={editing.midCta2Image}
            onChange={(v) => patch({ midCta2Image: v })}
            recommended="960×720"
          />
          <div className="adm-grid2">
            <Text
              label="Media caption"
              value={editing.midCta2MediaLabel}
              onChange={(v) => patch({ midCta2MediaLabel: v })}
            />
            <Text
              label="Media sub-caption"
              value={editing.midCta2MediaHint}
              onChange={(v) => patch({ midCta2MediaHint: v })}
            />
          </div>
        </Panel>

        <Panel title="17 · Compliance &amp; standards">
          <Text label="Section heading" value={editing.complianceTitle} onChange={(v) => patch({ complianceTitle: v })} />
          <Lede id="compliance" />
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
          <p className="hint">
            A certification badge is a factual claim. List only standards AptenTech has actually been assessed against.
          </p>
        </Panel>

        <Panel title="18 · Process">
          <Text label="Section heading" value={editing.processTitle} onChange={(v) => patch({ processTitle: v })} />
          <Lede id="process" />
          <Repeater
            label="Steps"
            items={editing.process}
            onChange={(process) => patch({ process })}
            itemLabel={(p) => p.title || 'Untitled'}
            create={() => ({ title: '', description: '', deliverables: [] })}
            render={(item, update) => (
              <>
                <Text label="Title" value={item.title} onChange={(v) => update({ title: v })} />
                <TextArea label="Description" value={item.description} onChange={(v) => update({ description: v })} />
                <StringList
                  label="Deliverables"
                  items={item.deliverables}
                  onChange={(v) => update({ deliverables: v })}
                />
              </>
            )}
          />
        </Panel>

        <Panel title="19 · Pricing">
          <Text label="Section heading" value={editing.pricingTitle} onChange={(v) => patch({ pricingTitle: v })} />
          <TextArea label="Body" value={editing.pricingBody} onChange={(v) => patch({ pricingBody: v })} />
          <Lede id="pricing" />
          <Text
            label="Table caption"
            value={editing.costTable.caption}
            onChange={(v) => patch({ costTable: { ...editing.costTable, caption: v } })}
          />
          <StringList
            label="Column headers"
            items={editing.costTable.headers}
            onChange={(v) => patch({ costTable: { ...editing.costTable, headers: v } })}
          />
          <Repeater
            label="Rows"
            items={editing.costTable.rows}
            onChange={(rows) => patch({ costTable: { ...editing.costTable, rows } })}
            itemLabel={(r) => r.tier || 'Untitled'}
            create={() => ({
              tier: '',
              tierAccent: 'indigo' as AccentToken,
              includes: '',
              timeline: '',
              investment: '',
            })}
            render={(item, update) => (
              <>
                <Text label="Tier" value={item.tier} onChange={(v) => update({ tier: v })} />
                <AccentPicker value={item.tierAccent} onChange={(v) => update({ tierAccent: v })} />
                <TextArea label="Includes" value={item.includes} onChange={(v) => update({ includes: v })} />
                <div className="adm-grid2">
                  <Text label="Timeline" value={item.timeline} onChange={(v) => update({ timeline: v })} />
                  <Text label="Investment" value={item.investment} onChange={(v) => update({ investment: v })} />
                </div>
              </>
            )}
          />
          <Text
            label="Cost factors heading"
            value={editing.costTable.factorsTitle}
            onChange={(v) => patch({ costTable: { ...editing.costTable, factorsTitle: v } })}
          />
          <StringList
            label="Cost factors"
            items={editing.costTable.factors}
            onChange={(v) => patch({ costTable: { ...editing.costTable, factors: v } })}
          />
          <Text
            label="Link label under the factors"
            value={editing.costFactorsCtaLabel}
            onChange={(v) => patch({ costFactorsCtaLabel: v })}
          />
        </Panel>

        <Panel title="20 · Tech stack">
          <Text label="Section heading" value={editing.techStackTitle} onChange={(v) => patch({ techStackTitle: v })} />
          <Lede id="techStack" />
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
                {/*
                  A repeater rather than a plain list, because each technology now carries its own
                  mark. Leave both mark fields empty and the chip falls back to the first two
                  letters of the name, which is how every existing entry renders.
                */}
                <Repeater
                  label="Technologies"
                  items={item.items}
                  onChange={(items) => update({ items })}
                  itemLabel={(t) => t.label || 'Untitled'}
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
                        The logo is used if set, otherwise the icon, otherwise the first two letters of the name.
                      </p>
                    </>
                  )}
                />
              </>
            )}
          />
        </Panel>

        <Panel title="21 · Why AptenTech">
          <Text label="Section heading" value={editing.whyTitle} onChange={(v) => patch({ whyTitle: v })} />
          <Lede id="why" />
          <Repeater
            label="Reasons"
            items={editing.why}
            onChange={(why) => patch({ why })}
            itemLabel={(w) => w.title || 'Untitled'}
            create={() => ({ title: '', description: '' })}
            render={(item, update) => (
              <>
                <Text label="Title" value={item.title} onChange={(v) => update({ title: v })} />
                <TextArea label="Description" value={item.description} onChange={(v) => update({ description: v })} />
              </>
            )}
          />
          <div className="adm-grid2">
            <Select
              label="Closing style"
              value={editing.whyCtaStyle}
              onChange={(v) => patch({ whyCtaStyle: v as 'strip' | 'inline' })}
              options={[
                { value: 'strip', label: 'Full-width strip' },
                { value: 'inline', label: 'Inline link' },
              ]}
            />
            <Text label="Link label" value={editing.whyCtaLabel} onChange={(v) => patch({ whyCtaLabel: v })} />
          </div>
        </Panel>

        <Panel title="22 · FAQs">
          <Text label="Section heading" value={editing.faqTitle} onChange={(v) => patch({ faqTitle: v })} />
          <Lede id="faqs" />
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
          <TextArea label="Text after the list" value={editing.faqAfter} onChange={(v) => patch({ faqAfter: v })} />
          <Text
            label="Link label after the list"
            value={editing.faqAfterCtaLabel}
            onChange={(v) => patch({ faqAfterCtaLabel: v })}
          />
        </Panel>

        <Panel title="23 · Latest insights">
          <Text
            label="Section heading"
            value={editing.latestInsightsTitle}
            onChange={(v) => patch({ latestInsightsTitle: v })}
          />
          <TextArea
            label="Body"
            value={editing.latestInsightsBody}
            onChange={(v) => patch({ latestInsightsBody: v })}
          />
          <Lede id="latestInsights" />
          <p className="hint">The articles themselves come from the blog, newest first.</p>
        </Panel>

        <Panel title="24 · Closing call to action">
          <Text label="Heading" value={editing.closingCtaTitle} onChange={(v) => patch({ closingCtaTitle: v })} />
          <TextArea label="Body" value={editing.closingCtaBody} onChange={(v) => patch({ closingCtaBody: v })} />
          <Repeater
            label="Reasons beside the form"
            items={editing.leadReasons}
            onChange={(leadReasons) => patch({ leadReasons })}
            itemLabel={(r) => r.title || 'Untitled'}
            create={() => ({ accent: 'indigo' as AccentToken, icon: '', title: '', description: '' })}
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
          <Repeater
            label="Office blocks"
            items={editing.leadOffices}
            onChange={(leadOffices) => patch({ leadOffices })}
            itemLabel={(o) => o.label || 'Untitled'}
            create={() => ({ label: '', lines: [] })}
            render={(item, update) => (
              <>
                <Text label="Label" value={item.label} onChange={(v) => update({ label: v })} />
                <StringList label="Lines" items={item.lines} onChange={(v) => update({ lines: v })} />
              </>
            )}
          />
          <p className="hint">Addresses and phone numbers are published as written. Use real ones only.</p>
        </Panel>

        <Panel title="25 · Lead form">
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

/**
 * The button attached to a call-to-action band.
 *
 * Nullable, because a band without one is a legitimate layout — the field set appears only
 * once a label is entered, and clearing the label removes the button rather than leaving an
 * unlabelled one on the page.
 *
 * `href` is validated on the server against the same safe-href rule as every other link, so
 * an editor cannot point a button at a javascript: URL.
 */
function CtaFields({
  value,
  onChange,
}: {
  value: CtaLink | null;
  onChange: (v: CtaLink | null) => void;
}) {
  const current = value ?? { label: '', href: '', style: 'primary' as const };

  return (
    <>
      <div className="adm-grid2">
        <Text
          label="Button label"
          value={current.label}
          onChange={(label) => onChange(label ? { ...current, label } : null)}
        />
        <Text
          label="Button link"
          value={current.href}
          onChange={(href) => onChange(current.label ? { ...current, href } : null)}
        />
      </div>
      <p className="hint">Leave the label empty to remove the button.</p>
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

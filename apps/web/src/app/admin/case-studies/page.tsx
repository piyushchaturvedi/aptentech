'use client';

import type { AccentToken, CaseStudy } from '@aptentech/shared';
import { EMPTY_SEO } from '@aptentech/shared';
import { CollectionAdmin } from '@/components/admin/CollectionAdmin';
import { AccentPicker, Repeater, Select, StringList, Text, TextArea, Toggle } from '@/components/admin/Fields';

/**
 * Case studies.
 *
 * Seeded from the `CASES` array on the portfolio page, including its `[PROJECT NAME]`,
 * `[VALUE]` and `[MEASURABLE BUSINESS RESULT]` placeholders. Those stay until AptenTech
 * supplies verified figures — a fabricated client result is not something to invent.
 *
 * The source also linked eight `/case-studies/<slug>/` detail pages that were never
 * designed. The slugs are preserved here so those URLs can be built later without changing
 * anything an editor has entered.
 */
export default function AdminCaseStudiesPage() {
  return (
    <CollectionAdmin<CaseStudy>
      title="Case studies"
      endpoint="/case-studies"
      itemName="case study"
      paginated
      note="Placeholder metrics preserved from the source — replace with verified figures."
      columns={[
        { header: 'Title', render: (c) => c.title },
        { header: 'Industry', render: (c) => c.industry || '—' },
        { header: 'Slug', render: (c) => <code>{c.slug}</code> },
        { header: 'Order', numeric: true, render: (c) => c.order },
        { header: 'Featured', render: (c) => (c.featured ? 'Yes' : '—') },
        { header: 'Status', render: (c) => <span className={`adm-chip ${c.status.toLowerCase()}`}>{c.status}</span> },
      ]}
      createBlank={() => ({
        slug: '',
        accent: 'indigo' as AccentToken,
        industry: '',
        techSummary: '',
        tag: '',
        title: '',
        problem: '',
        solution: '',
        result: '',
        metrics: [],
        shot: 'chart' as const,
        shotConsole: { command: '', checks: [], summary: '' },
        showInIndex: true,
        detailHref: null,
        technologies: [],
        category: '',
        projectUrl: '',
        featured: false,
        order: 0,
        status: 'DRAFT' as const,
        images: [],
        seo: { ...EMPTY_SEO },
      })}
      renderEditor={(item, patch) => (
        <>
          <div className="adm-grid2">
            <Text label="Title" value={item.title} onChange={(v) => patch({ title: v })} />
            <Text label="Slug" value={item.slug} onChange={(v) => patch({ slug: v })} hint="Used by /case-studies/<slug>/" />
            <Text label="Industry" value={item.industry} onChange={(v) => patch({ industry: v })} />
            <Text label="Tag" value={item.tag} onChange={(v) => patch({ tag: v })} />
            <Text
              label="Tech summary"
              value={item.techSummary}
              onChange={(v) => patch({ techSummary: v })}
              hint="Shown on the card, e.g. React Native · Node · AWS"
            />
            <Text label="Category" value={item.category} onChange={(v) => patch({ category: v })} />
          </div>

          <TextArea label="Problem" value={item.problem} onChange={(v) => patch({ problem: v })} rows={3} />
          <TextArea label="Solution" value={item.solution} onChange={(v) => patch({ solution: v })} rows={3} />
          <TextArea label="Result" value={item.result} onChange={(v) => patch({ result: v })} rows={2} />

          <Repeater
            label="Metrics"
            items={item.metrics}
            onChange={(metrics) => patch({ metrics })}
            itemLabel={(m) => m.label || 'Metric'}
            create={() => ({ value: '', label: '' })}
            render={(metric, update) => (
              <div className="adm-grid2">
                <Text label="Value" value={metric.value} onChange={(v) => update({ value: v })} />
                <Text label="Label" value={metric.label} onChange={(v) => update({ label: v })} />
              </div>
            )}
          />

          <StringList label="Technologies" items={item.technologies} onChange={(v) => patch({ technologies: v })} />

          <div className="adm-grid2">
            <AccentPicker value={item.accent} onChange={(v) => patch({ accent: v })} />
            <Select
              label="Illustration style"
              value={item.shot}
              onChange={(v) => patch({ shot: v as CaseStudy['shot'] })}
              options={[
                { value: 'chart', label: 'Chart' },
                { value: 'cells', label: 'Cells' },
                { value: 'code', label: 'Terminal' },
              ]}
            />
            <Text
              label="Order"
              type="number"
              value={String(item.order)}
              onChange={(v) => patch({ order: Number(v) || 0 })}
            />
            <Select
              label="Status"
              value={item.status}
              onChange={(v) => patch({ status: v as CaseStudy['status'] })}
              options={[
                { value: 'PUBLISHED', label: 'Published' },
                { value: 'DRAFT', label: 'Draft' },
                { value: 'ARCHIVED', label: 'Archived' },
              ]}
            />
          </div>

          <div className="adm-grid2">
            <Text label="Project URL" value={item.projectUrl} onChange={(v) => patch({ projectUrl: v })} />
            <Toggle label="Featured" value={item.featured} onChange={(v) => patch({ featured: v })} />
          </div>

          <Text
            label="SEO title"
            value={item.seo.title}
            onChange={(v) => patch({ seo: { ...item.seo, title: v } })}
          />
          <TextArea
            label="Meta description"
            value={item.seo.description}
            onChange={(v) => patch({ seo: { ...item.seo, description: v } })}
          />
        </>
      )}
    />
  );
}

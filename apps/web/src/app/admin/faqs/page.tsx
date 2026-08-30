'use client';

import type { FaqItem } from '@aptentech/shared';
import { CollectionAdmin } from '@/components/admin/CollectionAdmin';
import { Text, TextArea, Toggle } from '@/components/admin/Fields';

type Faq = FaqItem & { id: string; attachedTo?: string[] };

/**
 * Global FAQs.
 *
 * These feed the homepage FAQ rail. Whatever is visible here is what appears in the
 * FAQPage structured data, generated on the server — the schema and the page can never
 * disagree, which is what the original site's browser-generated version could not promise.
 *
 * Service and solution pages carry their own FAQs, edited on those pages.
 */
export default function AdminFaqsPage() {
  return (
    <CollectionAdmin<Faq>
      title="FAQs"
      endpoint="/faqs"
      itemName="question"
      note="Shown on the homepage. Service and solution FAQs are edited on those pages."
      columns={[
        { header: 'Question', render: (f) => f.question },
        { header: 'Category', render: (f) => f.category || '—' },
        { header: 'Order', numeric: true, render: (f) => f.order ?? 0 },
        {
          header: 'Visible',
          render: (f) => (
            <span className={`adm-chip ${f.visible !== false ? 'published' : 'draft'}`}>
              {f.visible !== false ? 'Yes' : 'No'}
            </span>
          ),
        },
      ]}
      createBlank={() => ({ question: '', answer: '', category: '', order: 0, visible: true, attachedTo: ['home'] })}
      renderEditor={(item, patch) => (
        <>
          <Text label="Question" value={item.question} onChange={(v) => patch({ question: v })} />
          <TextArea label="Answer" value={item.answer} onChange={(v) => patch({ answer: v })} rows={5} />
          <div className="adm-grid2">
            <Text
              label="Category"
              value={item.category ?? ''}
              onChange={(v) => patch({ category: v })}
              hint="Groups questions into the category rail on the homepage."
            />
            <Text
              label="Order"
              type="number"
              value={String(item.order ?? 0)}
              onChange={(v) => patch({ order: Number(v) || 0 })}
            />
          </div>
          <Toggle label="Visible on the site" value={item.visible !== false} onChange={(v) => patch({ visible: v })} />
        </>
      )}
    />
  );
}

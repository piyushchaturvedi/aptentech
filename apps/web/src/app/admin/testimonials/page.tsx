'use client';

import type { Testimonial } from '@aptentech/shared';
import { EMPTY_MEDIA } from '@aptentech/shared';
import { CollectionAdmin } from '@/components/admin/CollectionAdmin';
import { MediaPicker, StringList, Text, TextArea, Toggle } from '@/components/admin/Fields';

/**
 * Testimonials.
 *
 * The seeded records are the source's placeholder quotes — `[TESTIMONIAL — …]`,
 * `[CLIENT NAME]`, `[ROLE], [COMPANY]`. They are preserved rather than replaced with
 * invented praise; real, attributable quotes go in here when AptenTech supplies them.
 */
export default function AdminTestimonialsPage() {
  return (
    <CollectionAdmin<Testimonial>
      title="Testimonials"
      endpoint="/testimonials"
      itemName="testimonial"
      note="Seeded with the original placeholder quotes — replace with approved, attributable statements."
      columns={[
        { header: 'Name', render: (t) => t.name },
        { header: 'Role', render: (t) => [t.designation, t.company].filter(Boolean).join(', ') || '—' },
        { header: 'Quote', render: (t) => t.content.slice(0, 70) + (t.content.length > 70 ? '…' : '') },
        { header: 'Order', numeric: true, render: (t) => t.order },
        {
          header: 'Visible',
          render: (t) => <span className={`adm-chip ${t.visible ? 'published' : 'draft'}`}>{t.visible ? 'Yes' : 'No'}</span>,
        },
      ]}
      createBlank={() => ({
        name: '',
        designation: '',
        company: '',
        industry: '',
        duration: '',
        content: '',
        rating: 5,
        photo: { ...EMPTY_MEDIA },
        attachedTo: [],
        order: 0,
        visible: true,
      })}
      renderEditor={(item, patch) => (
        <>
          <div className="adm-grid2">
            <Text label="Client name" value={item.name} onChange={(v) => patch({ name: v })} />
            <Text label="Designation" value={item.designation} onChange={(v) => patch({ designation: v })} />
            <Text label="Company" value={item.company} onChange={(v) => patch({ company: v })} />
            <Text
              label="Rating (0–5, blank for none)"
              type="number"
              value={item.rating === null ? '' : String(item.rating)}
              onChange={(v) => patch({ rating: v === '' ? null : Math.max(0, Math.min(5, Number(v) || 0)) })}
            />
          </div>
          <TextArea label="Quote" value={item.content} onChange={(v) => patch({ content: v })} rows={4} />
          <div className="adm-grid2">
            {/* These two fill the small uppercase chips under the quote. Leave blank to hide them. */}
            <Text label="Industry chip" value={item.industry} onChange={(v) => patch({ industry: v })} />
            <Text label="Duration chip" value={item.duration} onChange={(v) => patch({ duration: v })} />
          </div>
          <MediaPicker label="Photo" value={item.photo} onChange={(v) => patch({ photo: v })} />
          <div className="adm-grid2">
            <Text
              label="Order"
              type="number"
              value={String(item.order)}
              onChange={(v) => patch({ order: Number(v) || 0 })}
            />
            <Toggle label="Visible on the site" value={item.visible} onChange={(v) => patch({ visible: v })} />
          </div>
          <StringList
            label="Attach to pages"
            items={item.attachedTo}
            onChange={(v) => patch({ attachedTo: v })}
            placeholder="Page slugs, one per line. Leave empty to make available everywhere."
          />
        </>
      )}
    />
  );
}

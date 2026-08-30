'use client';

import type { AccentToken, BlogPost } from '@aptentech/shared';
import { EMPTY_MEDIA, EMPTY_SEO } from '@aptentech/shared';
import { CollectionAdmin } from '@/components/admin/CollectionAdmin';
import { AccentPicker, MediaPicker, Repeater, Select, StringList, Text, TextArea, Toggle } from '@/components/admin/Fields';

/**
 * Blog.
 *
 * Article bodies accept a narrow subset of HTML — headings, paragraphs, lists, links,
 * quotes, code, tables and images — and are sanitised on the server when saved and again
 * when read. That allowlist is deliberately the set the stylesheet already styles, so an
 * article cannot introduce an element the design has no rules for.
 *
 * Setting the status to Published makes the article live and adds it to the sitemap on the
 * next revalidation.
 */
export default function AdminBlogPage() {
  return (
    <CollectionAdmin<BlogPost>
      title="Blog posts"
      endpoint="/blog"
      itemName="article"
      paginated
      note="Bodies accept a limited set of formatting and are sanitised server-side."
      columns={[
        { header: 'Title', render: (p) => p.title },
        { header: 'Category', render: (p) => p.categoryName || '—' },
        { header: 'Slug', render: (p) => <code>{p.slug}</code> },
        {
          header: 'Published',
          render: (p) =>
            p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
        },
        { header: 'Status', render: (p) => <span className={`adm-chip ${p.status.toLowerCase()}`}>{p.status}</span> },
      ]}
      createBlank={() => ({
        slug: '',
        accent: 'indigo' as AccentToken,
        title: '',
        excerpt: '',
        body: '',
        categoryId: null,
        categoryName: '',
        tags: [],
        authorName: '',
        coverImage: { ...EMPTY_MEDIA },
        readingMinutes: 0,
        status: 'DRAFT' as const,
        publishedAt: null,
        faqs: [],
        seo: { ...EMPTY_SEO },
      })}
      renderEditor={(item, patch) => (
        <>
          <div className="adm-grid2">
            <Text label="Title" value={item.title} onChange={(v) => patch({ title: v })} />
            <Text label="Slug" value={item.slug} onChange={(v) => patch({ slug: v })} hint="Used by /blog/<slug>/" />
            <Text label="Category" value={item.categoryName} onChange={(v) => patch({ categoryName: v })} />
            <Text label="Author" value={item.authorName} onChange={(v) => patch({ authorName: v })} />
          </div>

          <TextArea label="Excerpt" value={item.excerpt} onChange={(v) => patch({ excerpt: v })} rows={3} />

          <TextArea
            label="Article body"
            value={item.body}
            onChange={(v) => patch({ body: v })}
            rows={18}
            hint="Allowed: h2–h4, p, ul/ol, links, blockquote, code, tables, images. Anything else is stripped on save."
          />

          <MediaPicker label="Cover image" value={item.coverImage} onChange={(v) => patch({ coverImage: v })} />

          <div className="adm-grid2">
            <AccentPicker value={item.accent} onChange={(v) => patch({ accent: v })} />
            <Select
              label="Status"
              value={item.status}
              onChange={(v) => patch({ status: v as BlogPost['status'] })}
              options={[
                { value: 'PUBLISHED', label: 'Published' },
                { value: 'DRAFT', label: 'Draft' },
                { value: 'ARCHIVED', label: 'Archived' },
              ]}
            />
            <Text
              label="Publish date"
              type="date"
              value={item.publishedAt ? item.publishedAt.slice(0, 10) : ''}
              onChange={(v) => patch({ publishedAt: v ? new Date(v).toISOString() : null })}
            />
            <Text
              label="Reading time (minutes)"
              type="number"
              value={String(item.readingMinutes)}
              onChange={(v) => patch({ readingMinutes: Number(v) || 0 })}
            />
          </div>

          <StringList label="Tags" items={item.tags} onChange={(v) => patch({ tags: v })} />

          <Repeater
            label="Article FAQs"
            items={item.faqs}
            onChange={(faqs) => patch({ faqs })}
            itemLabel={(f) => f.question || 'Question'}
            create={() => ({ question: '', answer: '', category: '', order: 0, visible: true })}
            render={(faq, update) => (
              <>
                <Text label="Question" value={faq.question} onChange={(v) => update({ question: v })} />
                <TextArea label="Answer" value={faq.answer} onChange={(v) => update({ answer: v })} rows={3} />
                <Toggle label="Visible" value={faq.visible !== false} onChange={(v) => update({ visible: v })} />
              </>
            )}
          />

          <Text label="SEO title" value={item.seo.title} onChange={(v) => patch({ seo: { ...item.seo, title: v } })} />
          <TextArea
            label="Meta description"
            value={item.seo.description}
            onChange={(v) => patch({ seo: { ...item.seo, description: v } })}
          />
          <Text
            label="Canonical URL"
            value={item.seo.canonical}
            onChange={(v) => patch({ seo: { ...item.seo, canonical: v } })}
          />
          <MediaPicker
            label="Social share image"
            value={item.seo.ogImage ?? { ...EMPTY_MEDIA }}
            onChange={(v) => patch({ seo: { ...item.seo, ogImage: v } })}
          />
        </>
      )}
    />
  );
}

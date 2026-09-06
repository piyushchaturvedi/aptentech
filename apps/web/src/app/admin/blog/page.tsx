'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AccentToken, BlogPost } from '@aptentech/shared';
import { EMPTY_MEDIA, EMPTY_SEO } from '@aptentech/shared';
import { describeError, useAdmin } from '@/components/admin/AdminClient';
import { AccentPicker, MediaPicker, Repeater, Select, StringList, Text, TextArea, Toggle } from '@/components/admin/Fields';
import { RichText } from '@/components/admin/RichText';

/**
 * Blog administration.
 *
 * Two screens rather than one form, because writing an article and managing fifty of them are
 * different jobs: the list is for finding and triaging, the editor is for writing. The layout
 * follows the convention every editor already knows — status tabs with counts, a search box, a
 * table with row actions, and an editor whose main column is the article with the publishing
 * controls in a sidebar.
 *
 * The body is edited through a toolbar rather than as raw HTML, but the guarantee is unchanged:
 * the server sanitises every save against the same allowlist, so the editor is a convenience
 * and never the security boundary.
 */

const PAGE_SIZE = 20;

interface ListResponse {
  items: BlogPost[];
  total: number;
  totalPages: number;
  counts: Record<string, number>;
}

const STATUS_TABS = [
  { value: 'ALL', label: 'All' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'ARCHIVED', label: 'Archived' },
] as const;

/** Title → slug, the way an editor expects it to work while they type. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Rough reading time from the rendered text, so the field fills itself. */
function readingMinutes(html: string): number {
  const words = html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

function blankPost(): Omit<BlogPost, 'id'> {
  return {
    slug: '',
    accent: 'indigo' as AccentToken,
    title: '',
    excerpt: '',
    body: '',
    categoryId: null,
    categoryName: '',
    tags: [],
    authorName: '',
    authorRole: '',
    authorBio: '',
    coverImage: { ...EMPTY_MEDIA },
    readingMinutes: 0,
    status: 'DRAFT' as const,
    publishedAt: null,
    faqs: [],
    seo: { ...EMPTY_SEO },
  };
}

export default function AdminBlogPage() {
  const { request, session } = useAdmin();

  const [data, setData] = useState<ListResponse | null>(null);
  const [status, setStatus] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  /*
    The search box is debounced rather than querying on every keystroke.

    Each character would otherwise be a round trip, and the responses can arrive out of order —
    so a fast typist sees results for a prefix of what they typed.
  */
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), status });
      if (query) params.set('search', query);
      setData(await request<ListResponse>(`/blog?${params.toString()}`));
      setError('');
    } catch (e) {
      setError(describeError(e, 'Could not load articles.'));
    }
  }, [request, page, status, query]);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  const openNew = () => {
    setEditing({ ...blankPost(), id: '' } as BlogPost);
    setIsNew(true);
    setSlugTouched(false);
    setNotice('');
    setError('');
  };

  const openEdit = async (id: string) => {
    try {
      // The list omits the body to stay small; the editor needs the full document.
      setEditing(await request<BlogPost>(`/blog/${id}`));
      setIsNew(false);
      setSlugTouched(true);
      setNotice('');
      setError('');
    } catch (e) {
      setError(describeError(e, 'Could not open that article.'));
    }
  };

  const patch = (p: Partial<BlogPost>) => setEditing((prev) => (prev ? { ...prev, ...p } : prev));

  const save = async (overrideStatus?: BlogPost['status']) => {
    if (!editing) return;
    setBusy(true);
    setError('');

    const payload: Record<string, unknown> = { ...editing, ...(overrideStatus ? { status: overrideStatus } : {}) };
    delete payload.id;

    // Publishing without a date would leave the article out of every date-ordered listing.
    if (payload.status === 'PUBLISHED' && !payload.publishedAt) payload.publishedAt = new Date().toISOString();
    if (!payload.readingMinutes) payload.readingMinutes = readingMinutes(String(payload.body ?? ''));
    if (!payload.slug) payload.slug = slugify(String(payload.title ?? ''));

    try {
      if (isNew) {
        await request<BlogPost>('/blog', { method: 'POST', json: payload });
      } else {
        await request<BlogPost>(`/blog/${editing.id}`, { method: 'PUT', json: payload });
      }
      setNotice(overrideStatus === 'PUBLISHED' ? 'Article published.' : 'Article saved.');
      setEditing(null);
      await load();
    } catch (e) {
      setError(describeError(e, 'Could not save that article.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, title: string) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await request(`/blog/${id}`, { method: 'DELETE' });
      setNotice('Article deleted.');
      setSelected((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
      await load();
    } catch (e) {
      setError(describeError(e, 'Could not delete that article.'));
    } finally {
      setBusy(false);
    }
  };

  /** Applies one action to every ticked row, then reloads once rather than per item. */
  const bulk = async (action: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED' | 'DELETE') => {
    if (selected.size === 0) return;
    const ids = [...selected];

    if (action === 'DELETE' && !window.confirm(`Delete ${ids.length} article(s)? This cannot be undone.`)) return;

    setBusy(true);
    setError('');
    let failures = 0;

    for (const id of ids) {
      try {
        if (action === 'DELETE') {
          await request(`/blog/${id}`, { method: 'DELETE' });
        } else {
          const post = await request<BlogPost>(`/blog/${id}`);
          const payload: Record<string, unknown> = { ...post, status: action };
          delete payload.id;
          if (action === 'PUBLISHED' && !payload.publishedAt) payload.publishedAt = new Date().toISOString();
          await request(`/blog/${id}`, { method: 'PUT', json: payload });
        }
      } catch {
        failures += 1;
      }
    }

    setSelected(new Set());
    setNotice(
      failures === 0
        ? `${ids.length} article(s) updated.`
        : `${ids.length - failures} updated, ${failures} failed.`,
    );
    setBusy(false);
    await load();
  };

  const items = data?.items ?? [];
  const allChecked = items.length > 0 && items.every((i) => selected.has(i.id));

  const toggleAll = () =>
    setSelected((s) => {
      const next = new Set(s);
      if (allChecked) items.forEach((i) => next.delete(i.id));
      else items.forEach((i) => next.add(i.id));
      return next;
    });

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.categoryName).filter(Boolean))],
    [items],
  );

  /* ------------------------------------------------------------------ editor */

  if (editing) {
    return (
      <div className="adm-panel">
        <div className="adm-panel-head">
          <h1>{isNew ? 'Add new article' : 'Edit article'}</h1>
          <div className="adm-toolbar">
            <button type="button" className="adm-btn ghost" onClick={() => setEditing(null)} disabled={busy}>
              Back to list
            </button>
          </div>
        </div>

        {error ? <p className="adm-alert error">{error}</p> : null}

        <div className="adm-panel-body">
          <div className="wp-editor">
            <div className="wp-main">
              <input
                className="wp-title"
                placeholder="Add title"
                value={editing.title}
                onChange={(e) => {
                  const title = e.target.value;
                  // The slug follows the title until the editor types one, then it is theirs.
                  patch(slugTouched ? { title } : { title, slug: slugify(title) });
                }}
              />

              <div className="wp-permalink">
                <span>Permalink:</span>
                <code>/blog/{editing.slug || slugify(editing.title) || '…'}/</code>
                <input
                  className="wp-slug"
                  value={editing.slug}
                  aria-label="Slug"
                  onChange={(e) => {
                    setSlugTouched(true);
                    patch({ slug: e.target.value });
                  }}
                />
              </div>

              <RichText
                label="Article body"
                value={editing.body}
                onChange={(body) => patch({ body })}
                rows={18}
                hint="Headings, lists, links, quotes and code. Anything outside that set is removed when saved."
              />

              <TextArea
                label="Excerpt"
                value={editing.excerpt}
                onChange={(v) => patch({ excerpt: v })}
                rows={3}
                hint="Shown on the blog index and used as the meta description when none is set."
              />

              <details className="wp-more">
                <summary>SEO</summary>
                <Text label="SEO title" value={editing.seo.title} onChange={(v) => patch({ seo: { ...editing.seo, title: v } })} />
                <TextArea
                  label="Meta description"
                  value={editing.seo.description}
                  onChange={(v) => patch({ seo: { ...editing.seo, description: v } })}
                  rows={2}
                />
                <Text
                  label="Canonical URL"
                  value={editing.seo.canonical}
                  onChange={(v) => patch({ seo: { ...editing.seo, canonical: v } })}
                  placeholder={`/blog/${editing.slug || 'article-slug'}/`}
                  hint="Leave empty unless this article is published elsewhere too. A path like /blog/my-article/ or a full https:// address — not a bare word."
                />
                <MediaPicker
                  label="Social share image"
                  value={editing.seo.ogImage ?? { ...EMPTY_MEDIA }}
                  onChange={(v) => patch({ seo: { ...editing.seo, ogImage: v } })}
                />
              </details>

              <details className="wp-more">
                <summary>Article FAQs</summary>
                <Repeater
                  label=""
                  items={editing.faqs}
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
              </details>
            </div>

            <aside className="wp-side">
              <section className="wp-box">
                <h2>Publish</h2>
                <div className="wp-box-body">
                  <Select
                    label="Status"
                    value={editing.status}
                    onChange={(v) => patch({ status: v as BlogPost['status'] })}
                    options={[
                      { value: 'DRAFT', label: 'Draft' },
                      { value: 'PUBLISHED', label: 'Published' },
                      { value: 'ARCHIVED', label: 'Archived' },
                    ]}
                  />
                  <Text
                    label="Publish date"
                    type="date"
                    value={editing.publishedAt ? editing.publishedAt.slice(0, 10) : ''}
                    onChange={(v) => patch({ publishedAt: v ? new Date(v).toISOString() : null })}
                  />
                  <Text
                    label="Reading time (minutes)"
                    type="number"
                    value={String(editing.readingMinutes)}
                    onChange={(v) => patch({ readingMinutes: Number(v) || 0 })}
                    hint="Left at 0, it is calculated from the body on save."
                  />
                </div>
                <div className="wp-box-foot">
                  <button type="button" className="adm-btn ghost" onClick={() => void save('DRAFT')} disabled={busy}>
                    Save draft
                  </button>
                  {!isNew && editing.status === 'PUBLISHED' ? (
                    <a className="adm-btn ghost" href={`/blog/${editing.slug}/`} target="_blank" rel="noreferrer">
                      View
                    </a>
                  ) : null}
                  <button type="button" className="adm-btn" onClick={() => void save('PUBLISHED')} disabled={busy}>
                    {busy ? 'Saving…' : 'Publish'}
                  </button>
                </div>
              </section>

              <section className="wp-box">
                <h2>Category &amp; tags</h2>
                <div className="wp-box-body">
                  {/*
                    A free-text category with suggestions rather than a fixed dropdown: the
                    seeded categories come from the source content, and an editor writing about
                    something new should not have to add a category before they can file it.
                  */}
                  <div className="adm-field">
                    <label htmlFor="wp-category">Category</label>
                    <input
                      id="wp-category"
                      className="adm-input"
                      list="wp-categories"
                      value={editing.categoryName}
                      onChange={(e) => patch({ categoryName: e.target.value })}
                    />
                    <datalist id="wp-categories">
                      {categories.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                  <StringList label="Tags" items={editing.tags} onChange={(v) => patch({ tags: v })} />
                  <AccentPicker value={editing.accent} onChange={(v) => patch({ accent: v })} />
                </div>
              </section>

              <section className="wp-box">
                <h2>Featured image</h2>
                <div className="wp-box-body">
                  <MediaPicker label="" value={editing.coverImage} onChange={(v) => patch({ coverImage: v })} />
                </div>
              </section>

              <section className="wp-box">
                <h2>Author</h2>
                <div className="wp-box-body">
                  <Text label="Name" value={editing.authorName} onChange={(v) => patch({ authorName: v })} />
                  <Text label="Role" value={editing.authorRole} onChange={(v) => patch({ authorRole: v })} />
                  <TextArea label="Bio" value={editing.authorBio} onChange={(v) => patch({ authorBio: v })} rows={3} />
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ list */

  return (
    <div className="adm-panel">
      <div className="adm-panel-head">
        <h1>Blog posts</h1>
        <div className="adm-toolbar">
          <button type="button" className="adm-btn" onClick={openNew}>
            Add new
          </button>
        </div>
      </div>

      {error ? <p className="adm-alert error">{error}</p> : null}
      {notice ? <p className="adm-alert ok">{notice}</p> : null}

      <div className="adm-panel-body">
        <div className="wp-subsubsub">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`wp-tab${status === tab.value ? ' active' : ''}`}
              onClick={() => {
                setStatus(tab.value);
                setPage(1);
                setSelected(new Set());
              }}
            >
              {tab.label} <span className="wp-count">{data?.counts?.[tab.value] ?? 0}</span>
            </button>
          ))}

          <input
            className="adm-input wp-search"
            type="search"
            placeholder="Search articles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search articles"
          />
        </div>

        <div className="wp-bulk">
          <span className="wp-bulk-label">
            {selected.size > 0 ? `${selected.size} selected` : 'Select rows for bulk actions'}
          </span>
          <button type="button" className="adm-btn ghost sm" disabled={!selected.size || busy} onClick={() => void bulk('PUBLISHED')}>
            Publish
          </button>
          <button type="button" className="adm-btn ghost sm" disabled={!selected.size || busy} onClick={() => void bulk('DRAFT')}>
            To draft
          </button>
          <button type="button" className="adm-btn ghost sm" disabled={!selected.size || busy} onClick={() => void bulk('ARCHIVED')}>
            Archive
          </button>
          <button type="button" className="adm-btn ghost sm danger" disabled={!selected.size || busy} onClick={() => void bulk('DELETE')}>
            Delete
          </button>
        </div>

        <div className="adm-tablewrap">
          <table className="adm-table wp-table">
            <thead>
              <tr>
                <th className="wp-check">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all rows" />
                </th>
                <th>Title</th>
                <th>Category</th>
                <th>Tags</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data === null ? (
                <tr>
                  <td colSpan={6}>Loading…</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="adm-empty">
                    {query ? `No articles match “${query}”.` : 'No articles yet.'}
                  </td>
                </tr>
              ) : (
                items.map((post) => (
                  <tr key={post.id}>
                    <td className="wp-check">
                      <input
                        type="checkbox"
                        checked={selected.has(post.id)}
                        aria-label={`Select ${post.title}`}
                        onChange={() =>
                          setSelected((s) => {
                            const next = new Set(s);
                            if (next.has(post.id)) next.delete(post.id);
                            else next.add(post.id);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td>
                      <button type="button" className="wp-rowtitle" onClick={() => void openEdit(post.id)}>
                        {post.title || '(no title)'}
                      </button>
                      <div className="wp-rowactions">
                        <button type="button" onClick={() => void openEdit(post.id)}>
                          Edit
                        </button>
                        {post.status === 'PUBLISHED' ? (
                          <a href={`/blog/${post.slug}/`} target="_blank" rel="noreferrer">
                            View
                          </a>
                        ) : null}
                        <button type="button" className="danger" onClick={() => void remove(post.id, post.title)}>
                          Delete
                        </button>
                      </div>
                    </td>
                    <td>{post.categoryName || '—'}</td>
                    <td>{post.tags.length ? post.tags.slice(0, 3).join(', ') : '—'}</td>
                    <td>{formatDate(post.publishedAt)}</td>
                    <td>
                      <span className={`adm-chip ${post.status.toLowerCase()}`}>{post.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 ? (
          <div className="adm-pager">
            <button type="button" className="adm-btn ghost sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {page} of {data.totalPages} · {data.total} article{data.total === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              className="adm-btn ghost sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

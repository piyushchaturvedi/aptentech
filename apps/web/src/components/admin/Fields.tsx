'use client';

import { useEffect, useRef, useState } from 'react';
import type { AccentToken, MediaAsset, MediaRef } from '@aptentech/shared';
import { ACCENT_TOKENS, ACCENT_HEX } from '@aptentech/shared';
import { useAdmin } from './AdminClient';
import { ICON_REGISTRY } from '@/components/shared/iconRegistry.generated';

/**
 * Admin form primitives.
 *
 * These are the only controls an editor gets. There is no rich HTML editor for structured
 * fields, no colour picker and no free-text icon field — an accent is chosen from the six
 * brand tokens and an icon from the registry that ships with the code. That is what keeps
 * the approved design out of reach of a content edit.
 */

export function Text({
  label,
  value,
  onChange,
  hint,
  error,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="adm-field">
      <label>{label}</label>
      <input
        className="adm-input"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <span className="hint">{hint}</span> : null}
      {error ? <span className="err">{error}</span> : null}
    </div>
  );
}

/**
 * Where a link may point. The same rule the site applies when it renders one, so a link the
 * editor is allowed to insert is always a link the page will actually draw — anything else
 * would be rendered as its words only, which would look like the link silently vanished.
 */
function isAllowedHref(href: string): boolean {
  // Kept in step with isSafeHref in InlineLinks.tsx, which is the one that decides. A
  // protocol-relative address such as //example.com/ starts with a slash but leaves the site,
  // and the renderer drops it — so it is refused here too, where the editor can see why,
  // rather than being accepted into the field and silently rendering as plain text later.
  if (/^\/[/\\]/.test(href)) return false;

  if (href.startsWith('/') || href.startsWith('#')) return true;
  return /^(https?:|mailto:|tel:)/i.test(href);
}

export function TextArea({
  label,
  value,
  onChange,
  hint,
  rows = 4,
  links = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  rows?: number;
  /**
   * Offer an "Add link" button that turns the selected words into a link.
   *
   * Off by default, and switched on only for fields the site renders through inlineLinks().
   * A field that is printed as plain text would show the notation itself — "[text](/url/)" —
   * so offering the button there would let an editor break the page with one click.
   */
  links?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  /**
   * Wraps the selection as `[words](address)`.
   *
   * The field stays plain text; the site turns this one piece of notation into an anchor when
   * it renders. That is deliberate — accepting HTML here would let any editor put arbitrary
   * markup on the public site. See components/shared/InlineLinks.tsx.
   */
  function addLink() {
    const el = ref.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);

    if (!selected.trim()) {
      window.alert('Select the words you want to turn into a link, then click "Add link".');
      el.focus();
      return;
    }

    // The notation's own delimiters cannot appear inside it, or the link would end early.
    if (/[\]\n]/.test(selected)) {
      window.alert('A link can only cover words on one line, without a "]" in them. Select a shorter piece of text.');
      el.focus();
      return;
    }

    const input = window.prompt(
      `Link "${selected.trim()}" to which address?\n\n` +
        'A page on this site:  /services/ai-development/\n' +
        'Another website:      https://example.com',
      '/',
    );
    if (input === null) {
      el.focus();
      return;
    }

    const href = input.trim();
    if (!href || href === '/') {
      window.alert('Enter the address the link should go to.');
      el.focus();
      return;
    }
    if (/[\s)]/.test(href) || !isAllowedHref(href)) {
      window.alert(
        'That address cannot be used. Use a page on this site starting with "/", or a full address starting with "https://". Spaces and ")" are not allowed.',
      );
      el.focus();
      return;
    }

    const inserted = `[${selected}](${href})`;
    onChange(value.slice(0, start) + inserted + value.slice(end));

    // Put the cursor just after the new link, so typing carries on where the editor expects.
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + inserted.length;
      el.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className="adm-field">
      {/*
        The label stays a direct child of .adm-field unless there is a button to sit beside it.
        The stylesheet targets `.adm-field > label`, so wrapping it unconditionally would strip
        the label styling from every text area in the admin, not just the ones with links.
      */}
      {links ? (
        <div className="adm-field-head">
          <label>{label}</label>
          <button type="button" className="adm-btn ghost xs" onClick={addLink}>
            Add link
          </button>
        </div>
      ) : (
        <label>{label}</label>
      )}
      <textarea
        ref={ref}
        className="adm-textarea"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {links ? (
        <span className="hint">
          Select words and click Add link. They show here as [words](/address/) and as a link on the site.
        </span>
      ) : null}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Select({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="adm-field">
      <label>{label}</label>
      <select className="adm-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="adm-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span style={{ fontWeight: 600, fontSize: '12.5px' }}>{label}</span>
    </label>
  );
}

/** Accent picker, constrained to the six brand tokens. */
export function AccentPicker({ value, onChange }: { value: AccentToken; onChange: (v: AccentToken) => void }) {
  return (
    <div className="adm-field">
      <label>Accent</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ACCENT_TOKENS.map((token) => (
          <button
            key={token}
            type="button"
            onClick={() => onChange(token)}
            title={token}
            aria-label={token}
            aria-pressed={value === token}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: ACCENT_HEX[token],
              border: value === token ? '2px solid var(--a-ink)' : '2px solid transparent',
              cursor: 'pointer',
            }}
          />
        ))}
      </div>
      <span className="hint">Brand palette only — colours cannot be entered freely.</span>
    </div>
  );
}

/** Icon picker over the generated registry. */
export function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const keys = Object.keys(ICON_REGISTRY);

  return (
    <div className="adm-field">
      <label>Icon</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 34,
            height: 34,
            display: 'grid',
            placeItems: 'center',
            border: '1px solid var(--a-line)',
            borderRadius: 8,
            background: '#fff',
          }}
        >
          {value && ICON_REGISTRY[value] ? (
            <svg
              width="20"
              height="20"
              viewBox="0 0 22 22"
              fill="none"
              dangerouslySetInnerHTML={{ __html: ICON_REGISTRY[value]! }}
            />
          ) : (
            <span style={{ color: 'var(--a-muted)', fontSize: 11 }}>—</span>
          )}
        </span>
        <button type="button" className="adm-btn ghost sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : 'Change icon'}
        </button>
        {value ? (
          <button type="button" className="adm-btn ghost sm" onClick={() => onChange('')}>
            Clear
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          style={{
            marginTop: 8,
            maxHeight: 220,
            overflowY: 'auto',
            border: '1px solid var(--a-line)',
            borderRadius: 8,
            padding: 8,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))',
            gap: 6,
            background: '#fff',
          }}
        >
          {keys.map((key) => (
            <button
              key={key}
              type="button"
              title={key}
              onClick={() => {
                onChange(key);
                setOpen(false);
              }}
              style={{
                display: 'grid',
                placeItems: 'center',
                padding: 6,
                border: key === value ? '2px solid var(--a-primary)' : '1px solid var(--a-line)',
                borderRadius: 7,
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 22 22" fill="none" dangerouslySetInnerHTML={{ __html: ICON_REGISTRY[key]! }} />
            </button>
          ))}
        </div>
      ) : null}
      <span className="hint">{keys.length} icons from the approved set.</span>
    </div>
  );
}

/**
 * Media picker.
 *
 * This is how the 37 missing images get filled in. Each slot shows what it is waiting for —
 * the original `/images/...` path and expected dimensions from the source — so an editor
 * knows exactly which asset belongs there. Choosing one sets `mediaId` and the public site
 * swaps the placeholder for the real image on the next revalidation.
 */
/** Formats a byte count the way a person reading an upload form would say it. */
function fileSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaPicker({
  label,
  value,
  onChange,
  recommended,
}: {
  label: string;
  value: MediaRef;
  onChange: (v: MediaRef) => void;
  /**
   * The size this slot is designed around, e.g. `"1200×900"`. Shown before anything is
   * uploaded, which is the only moment it can still influence what someone picks — telling an
   * editor the expected proportions after they have already cropped and uploaded is too late.
   */
  recommended?: string;
}) {
  const { request, session } = useAdmin();
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [busy, setBusy] = useState(false);
  /*
    Dimensions are stored on the reference, but not every record has them: anything seeded from
    the original HTML carries a path and no measurements. Reading them off the rendered image
    covers those without a migration, and costs nothing — the browser has already decoded it.
  */
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    setMeasured(null);
  }, [value.mediaId, value.legacyPath]);

  useEffect(() => {
    if (!open || !session) return;
    request<{ items: MediaAsset[] }>('/media?page=1&pageSize=40')
      .then((r) => setAssets(r.items))
      .catch(() => setAssets([]));
  }, [open, session, request]);

  async function upload(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('alt', value.alt ?? '');
      const asset = await request<MediaAsset & { url: string }>('/media', { method: 'POST', json: form });
      onChange({ ...value, mediaId: asset.id, width: asset.width ?? value.width, height: asset.height ?? value.height });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  const current = assets.find((a) => a.id === value.mediaId);
  const preview = (value as MediaRef & { url?: string }).url ?? current?.url ?? null;

  // Three sources, best first: what the reference records, what the media library reports,
  // and what the browser measured off the rendered image.
  const width = value.width ?? current?.width ?? measured?.width ?? null;
  const height = value.height ?? current?.height ?? measured?.height ?? null;
  const dimensions = width && height ? `${width}×${height}` : null;
  const sizeOnDisk = fileSize(current?.bytes);

  return (
    <div className="adm-field">
      <label>{label}</label>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div
          style={{
            width: 120,
            minHeight: 80,
            border: '1px dashed var(--a-line)',
            borderRadius: 8,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--a-sunk)',
            overflow: 'hidden',
            fontSize: 10,
            color: 'var(--a-muted)',
            textAlign: 'center',
            padding: 6,
          }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt=""
              style={{ width: '100%', height: 'auto', display: 'block' }}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) {
                  setMeasured({ width: img.naturalWidth, height: img.naturalHeight });
                }
              }}
            />
          ) : (
            <span>Not uploaded</span>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="hint">
            {dimensions ? (
              <>
                Size: <strong>{dimensions}</strong>
                {sizeOnDisk ? ` · ${sizeOnDisk}` : ''}
              </>
            ) : (
              'Size: unknown'
            )}
            {recommended ? ` · designed for ${recommended}` : ''}
          </span>

          {value.legacyPath ? (
            <span className="hint">
              Original path: <code>{value.legacyPath}</code>
            </span>
          ) : null}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label className="adm-btn ghost sm" style={{ cursor: 'pointer' }}>
              {busy ? 'Uploading…' : 'Upload'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
            </label>
            <button type="button" className="adm-btn ghost sm" onClick={() => setOpen((v) => !v)}>
              {open ? 'Close library' : 'Choose from library'}
            </button>
            {value.mediaId ? (
              <button type="button" className="adm-btn ghost sm" onClick={() => onChange({ ...value, mediaId: null })}>
                Remove
              </button>
            ) : null}
          </div>

          <input
            className="adm-input"
            placeholder="Alt text — describe what the image shows"
            value={value.alt ?? ''}
            onChange={(e) => onChange({ ...value, alt: e.target.value })}
          />
        </div>
      </div>

      {open ? (
        <div className="adm-media" style={{ marginTop: 10 }}>
          {assets.map((asset) => (
            <figure key={asset.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset.url} alt={asset.alt} />
              <figcaption>{asset.filename}</figcaption>
              <div className="adm-media-actions">
                <button
                  type="button"
                  className="adm-btn sm"
                  onClick={() => {
                    onChange({ ...value, mediaId: asset.id, width: asset.width, height: asset.height });
                    setOpen(false);
                  }}
                >
                  Use
                </button>
              </div>
            </figure>
          ))}
          {assets.length === 0 ? <p className="hint">Nothing in the library yet.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Generic repeater for the CMS's list fields. */
export function Repeater<T>({
  label,
  items,
  onChange,
  render,
  create,
  itemLabel,
}: {
  label: string;
  items: T[];
  onChange: (items: T[]) => void;
  render: (item: T, update: (patch: Partial<T>) => void, index: number) => React.ReactNode;
  create: () => T;
  itemLabel?: (item: T, index: number) => string;
}) {
  const update = (index: number, patch: Partial<T>) => {
    const next = [...items];
    next[index] = { ...(next[index] as T), ...patch };
    onChange(next);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved as T);
    onChange(next);
  };

  return (
    <div className="adm-field">
      <label>
        {label} <span className="hint">({items.length})</span>
      </label>

      <div className="adm-repeat">
        {items.map((item, index) => (
          <div className="adm-repeat-item" key={index}>
            <div className="adm-repeat-head">
              <strong>{itemLabel ? itemLabel(item, index) : `Item ${index + 1}`}</strong>
              <span className="spacer" />
              <button type="button" className="adm-btn ghost sm" onClick={() => move(index, -1)} disabled={index === 0}>
                ↑
              </button>
              <button
                type="button"
                className="adm-btn ghost sm"
                onClick={() => move(index, 1)}
                disabled={index === items.length - 1}
              >
                ↓
              </button>
              <button
                type="button"
                className="adm-btn danger sm"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </div>
            {render(item, (patch) => update(index, patch), index)}
          </div>
        ))}
      </div>

      <div>
        <button type="button" className="adm-btn ghost sm" onClick={() => onChange([...items, create()])}>
          Add
        </button>
      </div>
    </div>
  );
}

/** Editable list of plain strings, used for bullets and option lists. */
export function StringList({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div className="adm-field">
      <label>{label}</label>
      <textarea
        className="adm-textarea"
        rows={Math.min(10, Math.max(3, items.length + 1))}
        placeholder={placeholder ?? 'One per line'}
        value={items.join('\n')}
        onChange={(e) => onChange(e.target.value.split('\n').map((l) => l.trim()).filter(Boolean))}
      />
      <span className="hint">One per line.</span>
    </div>
  );
}

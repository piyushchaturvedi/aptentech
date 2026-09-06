'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A visual editor for article bodies.
 *
 * Writing HTML by hand in a textarea is the one part of the CMS that assumed a developer.
 * This gives the same result through a toolbar, while keeping the two guarantees the design
 * lock depends on:
 *
 *  - **The tag set is closed.** Every button produces one of the elements the article
 *    stylesheet already styles. There is no colour picker, no font control and no way to type
 *    a class — an editor cannot introduce an element the design has no rules for.
 *  - **The server still decides.** Whatever this produces is sanitised again on save. This is
 *    a convenience, never the security boundary; a hostile paste is caught by the API, not by
 *    the browser.
 *
 * Pasted content is stripped to plain text on the way in, because pasting from Word or a web
 * page is the usual way inline styles and stray markup enter a CMS.
 */

interface ToolAction {
  label: string;
  title: string;
  /** `formatBlock` wraps the current line; the rest toggle inline formatting or insert. */
  command: 'formatBlock' | 'bold' | 'italic' | 'insertUnorderedList' | 'insertOrderedList' | 'createLink' | 'removeFormat';
  value?: string;
  /** Rendered as its own group separator before this button. */
  startsGroup?: boolean;
}

const TOOLS: ToolAction[] = [
  { label: 'P', title: 'Paragraph', command: 'formatBlock', value: 'p' },
  { label: 'H2', title: 'Heading 2', command: 'formatBlock', value: 'h2' },
  { label: 'H3', title: 'Heading 3', command: 'formatBlock', value: 'h3' },
  { label: 'H4', title: 'Heading 4', command: 'formatBlock', value: 'h4' },
  { label: 'B', title: 'Bold', command: 'bold', startsGroup: true },
  { label: 'I', title: 'Italic', command: 'italic' },
  { label: '• List', title: 'Bulleted list', command: 'insertUnorderedList', startsGroup: true },
  { label: '1. List', title: 'Numbered list', command: 'insertOrderedList' },
  { label: 'Quote', title: 'Block quote', command: 'formatBlock', value: 'blockquote', startsGroup: true },
  { label: 'Code', title: 'Code block', command: 'formatBlock', value: 'pre' },
  { label: 'Link', title: 'Insert link', command: 'createLink', startsGroup: true },
  { label: 'Clear', title: 'Remove formatting', command: 'removeFormat' },
];

export function RichText({
  label,
  value,
  onChange,
  hint,
  rows = 20,
}: {
  label: string;
  value: string;
  onChange: (html: string) => void;
  hint?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState(false);

  /*
    The editable div is written to only when the incoming value differs from what it already
    holds. Assigning `innerHTML` on every render would move the caret to the start on every
    keystroke, which is the classic contentEditable bug.
  */
  useEffect(() => {
    const el = ref.current;
    if (el && !source && el.innerHTML !== value) el.innerHTML = value || '';
  }, [value, source]);

  const emit = useCallback(() => {
    const el = ref.current;
    if (el) onChange(el.innerHTML);
  }, [onChange]);

  const run = useCallback(
    (tool: ToolAction) => {
      const el = ref.current;
      if (!el) return;
      el.focus();

      if (tool.command === 'createLink') {
        const href = window.prompt('Link URL — a path like /contact/ or a full https:// address');
        if (!href) return;
        // Only the schemes the sanitiser keeps. `javascript:` typed here would be stripped on
        // save anyway; refusing it now means the editor never shows a link that will vanish.
        if (!/^(https?:\/\/|\/|mailto:|tel:)/i.test(href)) {
          window.alert('Use a site path (/contact/), an https:// address, mailto: or tel:.');
          return;
        }
        document.execCommand('createLink', false, href);
      } else if (tool.command === 'formatBlock') {
        document.execCommand('formatBlock', false, tool.value);
      } else {
        document.execCommand(tool.command);
      }

      emit();
    },
    [emit],
  );

  /** Paste as plain text: the fastest route for stray markup into a CMS is the clipboard. */
  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
      emit();
    },
    [emit],
  );

  return (
    <div className="adm-field">
      <div className="rt-head">
        <label>{label}</label>
        <button type="button" className="adm-btn ghost sm" onClick={() => setSource((s) => !s)}>
          {source ? 'Visual' : 'HTML'}
        </button>
      </div>

      {source ? (
        <textarea
          className="adm-textarea rt-source"
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
      ) : (
        <>
          <div className="rt-tools" role="toolbar" aria-label={`${label} formatting`}>
            {TOOLS.map((tool) => (
              <span key={tool.label} className={tool.startsGroup ? 'rt-group' : undefined}>
                <button
                  type="button"
                  className="rt-btn"
                  title={tool.title}
                  aria-label={tool.title}
                  // `onMouseDown` with preventDefault keeps the selection alive; a plain click
                  // moves focus to the button first and the command applies to nothing.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    run(tool);
                  }}
                >
                  {tool.label}
                </button>
              </span>
            ))}
          </div>

          <div
            ref={ref}
            className="rt-body"
            style={{ minHeight: `${rows * 1.5}em` }}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label={label}
            onInput={emit}
            onBlur={emit}
            onPaste={onPaste}
          />
        </>
      )}

      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

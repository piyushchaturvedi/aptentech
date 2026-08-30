'use client';

/**
 * The honeypot field shared by every lead form.
 *
 * A person never sees this or reaches it with the keyboard; anything that fills it is
 * automated, and the server scores that as certain spam.
 *
 * The hiding is done with inline styles rather than the source's `.hp` class. That class is
 * only defined in the contact page's stylesheet, so on every other page the field rendered
 * as a visible empty input — which looked broken *and* inverted the control, because a real
 * visitor filling it would have been flagged as a bot. Inline styles cannot be missing.
 *
 * `aria-hidden` plus `tabIndex={-1}` keeps it away from screen readers and the tab order,
 * so it does not become an accessibility trap either.
 */
export function HoneypotField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        width: '1px',
        height: '1px',
        margin: '-1px',
        padding: 0,
        overflow: 'hidden',
        clip: 'rect(0 0 0 0)',
        clipPath: 'inset(50%)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      <label htmlFor={id}>Website</label>
      <input
        id={id}
        name="website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

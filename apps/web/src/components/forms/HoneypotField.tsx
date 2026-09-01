'use client';

/**
 * The honeypot field shared by every lead form.
 *
 * A person never sees this or reaches it with the keyboard; anything that fills it is
 * automated, and the server scores that as certain spam.
 *
 * The contact page is the only one the source gave this field, and the only stylesheet that
 * defines `.hp`. It is rendered on every form here for the protection it gives, so on those
 * other pages the class would resolve to nothing and the field would show as a visible empty
 * input — which looks broken *and* inverts the control, since a real visitor filling it in
 * would be scored as a bot. Those pages get inline styles instead, which cannot be missing;
 * the contact page keeps the class, so its markup stays identical to the original.
 *
 * `aria-hidden` plus `tabIndex={-1}` keeps it away from screen readers and the tab order,
 * so it does not become an accessibility trap either.
 */
export function HoneypotField({
  id,
  value,
  onChange,
  className,
}: {
  id: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /**
   * The source ships this wrapper only on the contact page, where it carries `.hp`. The
   * field itself is rendered on every form for the protection it gives; passing no class
   * elsewhere keeps those pages' markup identical to the original.
   */
  className?: string;
}) {
  return (
    <div
      {...(className ? { className } : {})}
      aria-hidden="true"
      /*
        The contact page ships `.hp` and hides the field itself; everywhere else that class
        does not exist, so the inline styles below do it. Applying both put the field a pixel
        away from where the source had it, which the layout comparison picked up.
      */
      {...(className
        ? {}
        : {
            style: {
              position: 'absolute' as const,
              width: '1px',
              height: '1px',
              margin: '-1px',
              padding: 0,
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)',
              clipPath: 'inset(50%)',
              whiteSpace: 'nowrap' as const,
              border: 0,
            },
          })}
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

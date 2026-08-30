import { ICON_REGISTRY } from './iconRegistry.generated';

/**
 * Renders one of the design's icons by key.
 *
 * The CMS stores a key, never SVG markup. Looking the body up in a generated registry that
 * ships with the code means an editor cannot introduce markup into the page, and the icon
 * set stays under design control. An unknown key renders nothing rather than breaking the
 * layout — the slots are fixed-size, so a missing glyph leaves a blank of the right shape.
 *
 * `viewBox` is a prop because the source used different coordinate systems per section:
 * most icon bodies are drawn for `0 0 22 22`, but the compliance badges use `0 0 24 24`.
 * Each call site passes the exact width, height and viewBox the original markup used.
 */
export function Icon({
  name,
  size = 22,
  viewBox = '0 0 22 22',
  className,
  fill = 'none',
}: {
  name: string;
  size?: number;
  viewBox?: string;
  className?: string;
  /** Most icon bodies are stroked; the social glyphs are solid shapes filled with the text colour. */
  fill?: string;
}) {
  const body = ICON_REGISTRY[name];
  if (!body) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill={fill}
      aria-hidden="true"
      focusable="false"
      {...(className ? { className } : {})}
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

/** The arrow that follows button and link labels throughout the design. */
export function ArrowIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The tick used in feature and bullet lists. */
export function TickIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="m3 8.5 3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The chevron on accordions and menu buttons. */
export function ChevronIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

import Image from 'next/image';
import type { ResolvedMedia } from '@/lib/api/content';

/**
 * Renders a CMS image slot.
 *
 * None of the 37 images the original pages referenced were delivered, so this has to work
 * in two states without the layout differing between them:
 *
 *  - **Asset uploaded** — `url` is set, and `next/image` serves an optimised, correctly
 *    sized image.
 *  - **Not yet uploaded** — the original page's own placeholder markup is rendered instead,
 *    passed in as `fallback`. Every image slot in the source already shipped a styled
 *    placeholder (`.im-frame`, `.blog-thumb .ph`, `.cm-frame`), so reusing it keeps the
 *    page pixel-identical to the original until a real file is uploaded. Where a slot has
 *    no source placeholder, a neutral box holding the recorded `width`/`height` is used so
 *    the aspect ratio and CLS still match.
 *
 * No image is invented and no section is dropped: the slot simply shows what it is waiting
 * for. Uploading through the CMS fills it with no code change.
 */
export function Media({
  media,
  className,
  priority = false,
  sizes,
  fallback,
}: {
  media: ResolvedMedia | null | undefined;
  className?: string;
  priority?: boolean;
  sizes?: string;
  /** The source page's own placeholder markup, shown until an asset is uploaded. */
  fallback?: React.ReactNode;
}) {
  if (!media) return fallback ?? null;

  const width = media.width ?? 800;
  const height = media.height ?? 600;
  const alt = media.alt ?? '';

  if (media.url) {
    /*
      SVG bypasses the image optimiser.

      Next refuses to optimise SVG unless `dangerouslyAllowSVG` is set, and that flag is
      global: turning it on would also cover any SVG an admin uploads later, which is a
      stored-XSS surface. Skipping optimisation for this one type costs nothing — an SVG is
      already resolution-independent and has no raster variants to generate — and it keeps
      the flag off.
    */
    const isVector = /\.svg(\?|$)/i.test(media.url);

    return (
      <Image
        src={media.url}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        // Only genuinely above-the-fold images get `priority`; everything else defers.
        loading={priority ? undefined : 'lazy'}
        unoptimized={isVector}
        {...(sizes ? { sizes } : {})}
        {...(className ? { className } : {})}
        style={{ width: '100%', height: 'auto' }}
      />
    );
  }

  if (fallback !== undefined) return <>{fallback}</>;

  return (
    <div
      {...(className ? { className } : {})}
      // `aspect-ratio` reserves the exact space the real image will take, so dropping the
      // file in later shifts nothing on the page.
      style={{
        aspectRatio: `${width} / ${height}`,
        width: '100%',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--tint, #F1F2FB)',
        border: '1px dashed var(--line, #E5E6F2)',
        borderRadius: 'var(--r, 16px)',
        color: 'var(--muted, #6E7391)',
        fontFamily: 'var(--mono, monospace)',
        fontSize: '11px',
        letterSpacing: '.08em',
        textAlign: 'center',
        padding: '16px',
        overflow: 'hidden',
      }}
      role="img"
      aria-label={alt || 'Image not yet uploaded'}
    >
      <span>
        {media.legacyPath ? media.legacyPath.split('/').pop() : 'IMAGE'}
        <br />
        <span style={{ opacity: 0.7 }}>
          {width}×{height} · upload in admin
        </span>
      </span>
    </div>
  );
}

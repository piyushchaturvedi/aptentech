'use client';

import { useEffect } from 'react';

/**
 * Adds the `in` class to `.rv` elements as they scroll into view, reproducing the source's
 * reveal animation.
 *
 * Kept in its own module rather than alongside the carousel and accordion: every page uses
 * it, and a shared `'use client'` module is bundled as a unit, so co-locating it would pull
 * the carousel and tab code into pages that have neither.
 *
 * Elements are visible by default in CSS terms, so a JavaScript failure cannot leave the
 * page blank — the animation simply does not run.
 */
export function ScrollReveal() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.rv').forEach((el) => el.classList.add('in'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );

    document.querySelectorAll('.rv:not(.in)').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}

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
 * This is the second pass, not the first. `EarlyReveal` has already revealed whatever was on
 * screen at load, from inline script that does not wait for hydration; the selector below
 * skips those (`:not(.in)`) and this takes over for everything reached by scrolling. It is
 * also the only pass on client-side navigation, where the inline script does not run again.
 *
 * This comment used to say that elements are visible by default, so a JavaScript failure
 * could not leave the page blank. The stylesheet has `.rv{opacity:0}` unconditionally, so that
 * was never true. `RevealFallback` is what makes it true now.
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

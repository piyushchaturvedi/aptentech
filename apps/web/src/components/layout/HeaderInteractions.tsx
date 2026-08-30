'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Header behaviour: burger toggle, mobile accordion, and the scrolled state.
 *
 * This renders nothing. It attaches the same listeners the original inline script did, to
 * the same elements and class names, so the header behaves and looks identical — but the
 * markup itself stays server-rendered.
 *
 * Written as effects over existing DOM rather than React state because the header markup
 * belongs to a Server Component; lifting it into state would mean shipping the whole
 * mega-menu to the browser as JavaScript, which is exactly what the audit flagged as the
 * original site's SEO problem.
 */
export function HeaderInteractions() {
  const pathname = usePathname();

  useEffect(() => {
    const header = document.getElementById('header');
    const burger = document.getElementById('burger');
    if (!header || !burger) return;

    const onBurger = () => {
      const open = header.classList.toggle('open');
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      // Stop the page scrolling behind the open mobile menu.
      document.body.style.overflow = open ? 'hidden' : '';
    };
    burger.addEventListener('click', onBurger);

    const topButtons = Array.from(header.querySelectorAll<HTMLButtonElement>('.mnav button.top'));
    const onTop = (event: Event) => {
      const button = event.currentTarget as HTMLButtonElement;
      const parent = button.parentElement;
      if (!parent) return;
      const open = parent.classList.toggle('open');
      button.setAttribute('aria-expanded', String(open));
    };
    topButtons.forEach((b) => b.addEventListener('click', onTop));

    // Any link tap closes the mobile menu, otherwise it stays open over the new page.
    const mobileLinks = Array.from(header.querySelectorAll<HTMLAnchorElement>('.mnav a'));
    const onLink = () => {
      header.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    };
    mobileLinks.forEach((a) => a.addEventListener('click', onLink));

    const onScroll = () => {
      header.classList.toggle('scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && header.classList.contains('open')) onLink();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      burger.removeEventListener('click', onBurger);
      topButtons.forEach((b) => b.removeEventListener('click', onTop));
      mobileLinks.forEach((a) => a.removeEventListener('click', onLink));
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [pathname]);

  // Close the menu on navigation, since the header persists across route changes.
  useEffect(() => {
    const header = document.getElementById('header');
    header?.classList.remove('open');
    document.body.style.overflow = '';
  }, [pathname]);

  return null;
}

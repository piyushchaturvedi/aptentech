'use client';

import { useEffect, useState } from 'react';

/**
 * The article's contents list and the reading-progress bar.
 *
 * The list itself is rendered on the server from the headings in the body, so it is in the
 * HTML for crawlers and works with JavaScript off. This component adds only the two things
 * that genuinely need the client: highlighting the heading currently in view, and the
 * progress bar across the top of the window. Both mirror the source's behaviour exactly.
 */
export function ArticleProgress() {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const article = document.getElementById('article');
    if (!article) return;

    const update = () => {
      const start = article.offsetTop;
      const height = article.offsetHeight - window.innerHeight;
      const scrolled = window.scrollY - start;
      const ratio = height > 0 ? scrolled / height : 0;
      setWidth(Math.min(100, Math.max(0, ratio * 100)));
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return <div className="progress" id="progress" role="presentation" style={{ width: `${width}%` }} />;
}

export function TocHighlight() {
  useEffect(() => {
    const toc = document.getElementById('toc');
    if (!toc) return;

    const links = Array.from(toc.querySelectorAll('a'));
    const targets = links
      .map((link) => document.getElementById(decodeURIComponent(link.getAttribute('href')?.slice(1) ?? '')))
      .filter((el): el is HTMLElement => Boolean(el));

    if (!targets.length) return;

    const update = () => {
      let index = 0;
      targets.forEach((target, i) => {
        if (target.getBoundingClientRect().top <= 120) index = i;
      });
      links.forEach((link, i) => link.classList.toggle('is-active', i === index));
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return null;
}

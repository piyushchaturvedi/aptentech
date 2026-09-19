/**
 * Starts the reveal animation at first paint instead of after the page's JavaScript loads.
 *
 * Every `.rv` element is served with `opacity: 0` and waits for `ScrollReveal` to add `.in`.
 * ScrollReveal is a React effect, so it cannot run until the bundle has downloaded, parsed and
 * hydrated — and until then the hero, which is on screen from the first frame, is invisible.
 * On a desktop that wait is a fraction of a second. On a mid-range phone it is most of the 3.3s
 * PageSpeed reported for Largest Contentful Paint: the heading is the largest thing on screen,
 * and the browser does not count it until it can be seen.
 *
 * This does ScrollReveal's first pass itself, from a few lines of inline script that run as
 * soon as the hero's HTML has been parsed. Same test (in the viewport, less the bottom 8%, the
 * observer's own rootMargin), same class, so the same CSS transition runs with the same
 * staggered delays — it simply starts on the first frame rather than a second or two later.
 * Anything below the fold is left alone, and ScrollReveal reveals it on scroll exactly as before.
 *
 * Deliberately not a CSS rule for "the first section". On the Services and Solutions indexes the
 * first section is the whole page — 23 and 18 reveal elements — so animating it on load would
 * have removed the scroll reveal from every card below the fold. Where the fold falls depends on
 * the screen, which only script can know.
 *
 * Written defensively: ES5 so it runs in anything, wrapped in try so an error here can never
 * reach the page, and every rectangle read before any class is written, so reading layout for
 * sixty-odd elements costs one reflow rather than sixty.
 */
const SCRIPT =
  '(function(){try{' +
  // Reduced motion: the stylesheet already shows every .rv, so there is nothing to start.
  "if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;" +
  "var els=document.querySelectorAll('.rv:not(.in)'),limit=window.innerHeight*0.92,show=[],i,r;" +
  'for(i=0;i<els.length;i++){r=els[i].getBoundingClientRect();if(r.top<limit&&r.bottom>0)show.push(els[i]);}' +
  "for(i=0;i<show.length;i++)show[i].classList.add('in');" +
  '}catch(e){}})();';

/**
 * Shown only when JavaScript is off, and makes every reveal element visible.
 *
 * The ScrollReveal module has claimed "a JavaScript failure cannot leave the page blank" since
 * it was written, and the stylesheet has contradicted it the whole time: `.rv` is `opacity: 0`
 * unconditionally, so without script the home page renders sixty-five invisible elements —
 * effectively nothing below the header. `<noscript>` is ignored entirely when script is
 * available, so for everyone else this is inert.
 */
const NOSCRIPT_STYLE = '<style>.rv{opacity:1!important;transform:none!important}</style>';

/** Place before the page content, so it applies from the first byte when script is off. */
export function RevealFallback() {
  return <noscript dangerouslySetInnerHTML={{ __html: NOSCRIPT_STYLE }} />;
}

/**
 * Place immediately after the page content: it has to run once the elements exist, and the
 * earlier it runs after that, the sooner the hero appears.
 *
 * A static string, so when a Content-Security-Policy is switched on it can be allowed by its
 * hash rather than needing a per-request nonce.
 */
export function EarlyReveal() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}

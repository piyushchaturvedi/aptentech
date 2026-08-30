/**
 * Performance measurement.
 *
 * Measures what can be measured server-side and honestly: TTFB and full response time from
 * a warm cache, HTML transfer size, and the JavaScript and CSS a page actually pulls in.
 *
 * These are not Core Web Vitals. LCP, INP and CLS are field metrics that depend on the
 * visitor's device, network and geography, and have to be measured in a real browser
 * against the production deployment — a localhost number would be meaningless.
 */
const zlib = require('zlib');
const { promisify } = require('node:util');
const gzip = promisify(zlib.gzip);

const BASE = process.env.SITE_URL || 'http://localhost:3000';

const ROUTES = [
  ['/', 'Homepage'],
  ['/services/seo/', 'Service page'],
  ['/solutions/taxi-app-development/', 'Solution page'],
  ['/case-studies/', 'Case studies'],
  ['/blog/', 'Blog listing'],
  ['/blog/mobile-app-development-cost/', 'Blog article'],
  ['/contact/', 'Contact'],
  ['/about/', 'About'],
  ['/privacy-policy/', 'Legal'],
];

const SOURCE_SIZES = {
  '/': 122082,
  '/services/seo/': 206543,
  '/solutions/taxi-app-development/': 200147,
  '/case-studies/': 126332,
  '/blog/': 128119,
  '/blog/mobile-app-development-cost/': 144700,
  '/contact/': 133720,
  '/about/': 153788,
  '/privacy-policy/': 131517,
};

const kb = (n) => (n / 1024).toFixed(1);

async function timed(url) {
  const start = process.hrtime.bigint();
  const res = await fetch(url);
  const firstByte = process.hrtime.bigint();
  const body = await res.text();
  const done = process.hrtime.bigint();

  return {
    status: res.status,
    ttfb: Number(firstByte - start) / 1e6,
    total: Number(done - start) / 1e6,
    body,
    cache: res.headers.get('x-nextjs-cache') ?? '-',
  };
}

(async () => {
  console.log('Warming caches…\n');
  for (const [route] of ROUTES) await fetch(`${BASE}${route}`);

  console.log(
    'ROUTE'.padEnd(38) +
      'TTFB'.padStart(8) +
      'TOTAL'.padStart(8) +
      'HTML'.padStart(9) +
      'GZIP'.padStart(9) +
      'JS'.padStart(8) +
      'CSS'.padStart(8) +
      '   vs SOURCE',
  );
  console.log('-'.repeat(96));

  let totalGzip = 0;
  let count = 0;

  for (const [route, label] of ROUTES) {
    // Three runs, keep the median, so one noisy sample does not set the number.
    const runs = [];
    for (let i = 0; i < 3; i += 1) runs.push(await timed(`${BASE}${route}`));
    runs.sort((a, b) => a.total - b.total);
    const run = runs[1];

    const gz = await gzip(run.body);
    const scripts = [...run.body.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    const styles = [...run.body.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]);

    let jsBytes = 0;
    for (const src of new Set(scripts)) {
      const r = await fetch(src.startsWith('http') ? src : `${BASE}${src}`);
      jsBytes += (await r.arrayBuffer()).byteLength;
    }
    let cssBytes = 0;
    for (const href of new Set(styles)) {
      const r = await fetch(href.startsWith('http') ? href : `${BASE}${href}`);
      cssBytes += (await r.arrayBuffer()).byteLength;
    }

    const source = SOURCE_SIZES[route];
    const delta = source ? `${(((run.body.length - source) / source) * 100).toFixed(0)}%` : '—';

    totalGzip += gz.length;
    count += 1;

    console.log(
      `${label} ${route}`.slice(0, 37).padEnd(38) +
        `${run.ttfb.toFixed(0)}ms`.padStart(8) +
        `${run.total.toFixed(0)}ms`.padStart(8) +
        `${kb(run.body.length)}KB`.padStart(9) +
        `${kb(gz.length)}KB`.padStart(9) +
        `${kb(jsBytes)}KB`.padStart(8) +
        `${kb(cssBytes)}KB`.padStart(8) +
        `   ${delta}`,
    );
  }

  console.log('-'.repeat(96));
  console.log(`Average gzipped HTML: ${kb(totalGzip / count)} KB across ${count} routes.`);
  console.log(
    '\nTTFB and TOTAL are localhost, warm-cache figures — they show the server is not doing',
  );
  console.log('per-request database work, not what a real visitor will experience. LCP, INP and CLS');
  console.log('must be measured in a browser against the production deployment.');
})();

/** @type {import('next').NextConfig} */

/**
 * Content Security Policy.
 *
 * A nonce-based policy is practical here only because the migration moved every inline
 * `<style>` and `<script>` out of the markup and into modules — the source pages carried
 * ~90 KB of inline CSS each, which would have forced `unsafe-inline` and gutted the policy.
 *
 * `'strict-dynamic'` lets Next's own bootstrap script load its chunks without listing every
 * hashed filename. `'unsafe-inline'` remains on style-src because React still emits inline
 * styles for a handful of layout primitives; scripts, which are what actually matter for
 * XSS, do not get that exemption.
 */
/**
 * Whether the site is actually reached over TLS.
 *
 * `upgrade-insecure-requests` and HSTS both assume a certificate exists. On a production
 * build served over plain HTTP — an IP address, before the domain is set up — the first tells
 * the browser to rewrite every request to `https://`, and the page then loads nothing at all.
 * Keyed off the public URL rather than `NODE_ENV`, so both turn themselves on the moment the
 * site moves to https and stay off until then.
 */
const servedOverHttps = (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://');

function csp(nonce, isDev) {
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com data:`,
    `img-src 'self' data: blob: https:`,
    `connect-src 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'none'`,
    `object-src 'none'`,
    servedOverHttps ? 'upgrade-insecure-requests' : '',
  ];
  return directives.filter(Boolean).join('; ');
}

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Every canonical URL in the source ends with a slash, so the app must too — otherwise
  // each page would be reachable at two URLs and split its own ranking signals.
  trailingSlash: true,

  eslint: { ignoreDuringBuilds: true },

  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },

  /**
   * Media served from the API's local disk.
   *
   * The local media driver returns site-relative paths like `/uploads/media/...`, but the
   * files sit on the API's disk on another port. Without this the browser asks the Next
   * server for them and gets a 404, so every image slot renders empty in development while
   * looking correctly wired in the database.
   *
   * A rewrite rather than an absolute URL on the stored record: the browser stays on one
   * origin, so `img-src 'self'` in the CSP keeps working and no API hostname reaches the
   * page. In production `MEDIA_DRIVER=s3` returns absolute CDN URLs and this never matches.
   */
  async rewrites() {
    const apiOrigin = (process.env.API_BASE_URL ?? 'http://localhost:4000/api/v1').replace(/\/api\/v1\/?$/, '');
    return [{ source: '/uploads/:path*', destination: `${apiOrigin}/uploads/:path*` }];
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          ...(servedOverHttps
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }]
            : []),
        ],
      },
      {
        // The admin must never be indexed, regardless of what a page's own metadata says.
        source: '/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
    ];
  },

  /**
   * Redirects come from the CMS.
   *
   * The source's navigation pointed 864 links at `/services/`, 378 at `/technologies/` and
   * 216 at `/solutions/ai-automation/`, none of which had a page behind it, plus a handful
   * of one-off paths. Rather than inventing pages, each is a row in the redirect table an
   * administrator can repoint the day a real page ships.
   *
   * Next evaluates this once, when the server starts, so a redirect added in the CMS takes
   * effect on the next deploy rather than immediately — which is the right trade for a
   * table that changes rarely and is checked on every request.
   *
   * FALLBACK is what ships if the API cannot be reached during a build: the same set the
   * seed writes, so a build never silently drops the redirects the navigation depends on.
   */
  async redirects() {
    const FALLBACK = [
      // The footer linked Blog/Insights/Guides to /insights/ on 24 of 25 source pages,
      // while every canonical and article link used /blog/. /blog/ wins; this keeps the
      // other path resolving instead of 404ing.
      { source: '/insights', destination: '/blog', permanent: true },
      { source: '/solutions/ai-automation', destination: '/services/ai-automation/', permanent: true },
      { source: '/case-studies/all', destination: '/case-studies', permanent: true },
      { source: '/careers', destination: '/contact', permanent: true },
    ];

    /*
      Structural redirects that belong to the application rather than to the content, so they
      apply whether or not the database answered.

      `/admin` is the address people actually type; without this it 404s, because every admin
      screen lives one segment deeper. It points at the dashboard and lets `AdminShell` send
      an unauthenticated visitor on to the sign-in page — that keeps one place deciding what
      an unauthenticated admin sees. It is deliberately temporary: a permanent redirect is
      cached by the browser indefinitely, which would make that landing choice unchangeable.

      `/insights/:path*` is a pattern rather than a single path, so the database's row-by-row
      table cannot express it.
    */
    const ALWAYS = [
      { source: '/admin', destination: '/admin/dashboard/', permanent: false },
      { source: '/insights/:path*', destination: '/blog/:path*', permanent: true },
    ];

    const base = process.env.API_BASE_URL;
    const token = process.env.API_SERVICE_TOKEN;
    if (!base || !token) return [...FALLBACK, ...ALWAYS];

    /*
      `npm run dev` starts both apps at once, so this can run before the API is listening.
      A single attempt fell back to the compiled-in list and silently dropped every redirect
      that only exists in the database. Six tries over about fifteen seconds covers a cold
      start without making a genuinely-absent API slow to fail.
    */
    async function fetchRedirects() {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const res = await fetch(`${base}/redirects`, {
            headers: { 'x-api-key': token },
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) return res;
        } catch {
          // Not up yet.
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      return null;
    }

    try {
      const res = await fetchRedirects();
      if (!res) {
        console.warn('[redirects] API unreachable — using the compiled-in fallback list.');
        return [...FALLBACK, ...ALWAYS];
      }

      const body = await res.json();
      const rows = Array.isArray(body?.data) ? body.data : [];
      const mapped = rows
        .filter((row) => row?.active !== false && row?.from && row?.to)
        // Next matches without the trailing slash; `trailingSlash: true` adds it back.
        .map((row) => ({
          source: String(row.from).replace(/\/$/, '') || '/',
          destination: String(row.to),
          permanent: row.statusCode !== 302,
        }))
        .filter((row) => row.source !== row.destination);

      return mapped.length ? [...mapped, ...ALWAYS] : [...FALLBACK, ...ALWAYS];
    } catch {
      return [...FALLBACK, ...ALWAYS];
    }
  },
};

export { csp };
export default nextConfig;

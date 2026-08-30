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
    isDev ? '' : 'upgrade-insecure-requests',
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
          ...(process.env.NODE_ENV === 'production'
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

  async redirects() {
    return [
      {
        // The footer linked Blog/Insights/Guides to /insights/ on 24 of 25 source pages,
        // while every canonical and article link used /blog/. /blog/ wins; this keeps the
        // other path resolving instead of 404ing.
        source: '/insights',
        destination: '/blog',
        permanent: true,
      },
      { source: '/insights/:path*', destination: '/blog/:path*', permanent: true },
    ];
  },
};

export { csp };
export default nextConfig;

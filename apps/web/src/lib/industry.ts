/**
 * Maps the broad industry names the menus use onto the specific ones case studies carry.
 *
 * The navigation offers a handful of industries; the studies record more than sixty, written
 * as whatever each project actually was — "Fintech", "FinTech" and "Financial services" all
 * appear, as do "E-commerce", "Ecommerce" and "D2C ecommerce". Matching on the exact string
 * would leave most menu entries showing nothing, so each menu industry owns a list of
 * patterns instead.
 *
 * The mapping is deliberately data, not cleverness: fuzzy matching on substrings would pair
 * "Retail" with "Liquor retail chain" and put a spirits marketplace under Healthcare's
 * neighbour by accident. An explicit table is auditable, and an editor can see why a study
 * appears where it does.
 */

/** Menu industry → the patterns that select it, matched case-insensitively against `industry`. */
const INDUSTRY_PATTERNS: Readonly<Record<string, readonly string[]>> = {
  healthcare: ['healthcare', 'insurance', 'corporate wellness', 'fitness', 'fitness & coaching', 'ai coaching'],
  fintech: ['fintech', 'financial services'],
  ecommerce: ['e-commerce', 'ecommerce', 'd2c ecommerce', 'retail', 'marketplace', 'marketplace app', 'winery dtc', 'liquor retail chain', 'alcohol marketplace', 'grocery delivery'],
  logistics: ['logistics', 'fleet fuelling', 'fuel delivery', 'on-demand fuel', 'tank monitoring', 'food delivery', 'cloud kitchen', 'restaurant chain'],
  education: ['education'],
  travel: ['travel', 'tour operator', 'airline', 'hospitality', 'airport transfers'],
  transport: ['ride-hailing', 'taxi fleet', 'ground transport', 'corporate transport', 'enterprise mobility'],
  media: ['media & entertainment', 'music streaming', 'video streaming', 'ott platform', 'live audio', 'live events', 'publisher', 'creator platform', 'artist tools'],
  // No `realestate` key: the menus name it, but not one case study records that industry, and
  // a filter that always comes back empty is worse than no filter. That entry links to the
  // unfiltered index until a study exists to justify it.
  enterprise: ['enterprise', 'enterprise operations', 'enterprise support', 'saas', 'b2b saas', 'professional services', 'manufacturing', 'multi-location services', 'multi-region operator'],
};

/** Normalises a menu label or query value: "FinTech & Banking" → "fintech". */
export function industryKey(input: string): string {
  const slug = input.toLowerCase().replace(/[^a-z0-9]+/g, '');

  // A label may name several things ("FinTech & Banking", "E-commerce & Retail"); the first
  // recognised key wins, which is the one the label leads with.
  for (const key of Object.keys(INDUSTRY_PATTERNS)) {
    if (slug.startsWith(key)) return key;
  }
  return slug;
}

/** True when `industry` belongs to the menu industry `key`. Unknown keys match nothing. */
export function matchesIndustry(industry: string | null | undefined, key: string): boolean {
  const patterns = INDUSTRY_PATTERNS[key];
  if (!patterns || !industry) return false;

  const value = industry.trim().toLowerCase();
  return patterns.some((p) => value === p || value.includes(p));
}

/** Whether a query value names an industry this site can filter by. */
export function isKnownIndustry(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(INDUSTRY_PATTERNS, key);
}

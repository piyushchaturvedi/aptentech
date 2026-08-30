/**
 * The remaining section content on a service or solution page.
 *
 * These structures were missed on the first pass, when the migration captured each
 * section's heading and its main list but not the surrounding copy and sub-blocks. A DOM
 * comparison against the original rendered pages found ~80 structural elements absent,
 * including several whole sections. Everything below is modelled from that comparison, so
 * the rendered markup matches the source element for element.
 */

import type { AccentToken } from './primitives';

/** `.pro` cards in the "how we protect your platform" band — numbered, iconed, three-up. */
export interface ProtectItem {
  accent: AccentToken;
  icon: string;
  title: string;
  description: string;
}

/** `.mkt` tiles in the market-context band. Values are placeholders in the source. */
export interface MarketStat {
  value: string;
  label: string;
}

/** `.aw` rows in the recognition band. */
export interface Award {
  accent: AccentToken;
  icon: string;
  title: string;
  meta: string;
}

/** `.aw-lead` — the review-platform panel beside the award list. */
export interface AwardLead {
  title: string;
  body: string;
  rating: string;
  ratingNote: string;
}

/** A row of the `.cost-table`. */
export interface CostRow {
  tier: string;
  tierAccent: AccentToken;
  includes: string;
  timeline: string;
  investment: string;
}

export interface CostTable {
  caption: string;
  headers: string[];
  rows: CostRow[];
  factorsTitle: string;
  factors: string[];
}

/** `.reason` rows beside the lead form. */
export interface LeadReason {
  accent: AccentToken;
  icon: string;
  title: string;
  description: string;
}

/** `.office` blocks beside the lead form. */
export interface OfficeBlock {
  label: string;
  lines: string[];
}

/**
 * Per-section standfirst copy, keyed by section.
 *
 * Every band in the source has a `.lede` paragraph under its heading. Holding them in one
 * map rather than as thirty separate fields keeps the document readable and lets the admin
 * render them as one list.
 */
export type SectionLedes = Record<string, string>;

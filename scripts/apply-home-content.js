#!/usr/bin/env node
/**
 * Applies the approved home page copy from `scripts/data/home-content.json`.
 *
 * The payload carries **text only**. Accents, icons and every other design decision are read
 * off the block that is already there and put back unchanged — the copy document does not
 * describe them, and inventing them here would quietly redesign a page that was signed off.
 * Where the new copy has more list items than the old block did, accents cycle through the
 * palette and the icon is left empty, which the design already renders as a plain mark.
 *
 * Safe to re-run: a second run finds every field already matching and reports nothing to do.
 *
 *   node scripts/apply-home-content.js
 *   node scripts/apply-home-content.js --apply
 *   node scripts/apply-home-content.js --apply --force   # write even if unchanged
 *
 * A payload whose file has not changed since it was last written is skipped, so the deploy
 * can run this unattended without reverting edits an admin has since made in the CMS. See
 * scripts/lib/content-checkpoint.js.
 */
const fs = require('node:fs');
const path = require('node:path');
const { payloadHash, shouldApply, recordApplied } = require('./lib/content-checkpoint');
const { revalidate } = require('./lib/revalidate');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const PAYLOAD = path.join(ROOT, 'scripts/data/home-content.json');

const ACCENTS = ['indigo', 'mint', 'violet', 'amber', 'cyan', 'pink'];

function envValue(key) {
  const file = path.join(ROOT, 'apps/api/.env');
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Merges new text onto an existing list, keeping each entry's design fields.
 *
 * `design` names the keys that belong to the design rather than the copy. Entry *n* of the new
 * list inherits them from entry *n* of the old list; beyond that the accent cycles and the rest
 * fall back to whatever the caller's template supplies.
 */
function mergeList(existing, incoming, design, template = {}) {
  const old = Array.isArray(existing) ? existing : [];
  return incoming.map((item, index) => {
    const from = old[index] ?? {};
    const kept = {};
    for (const key of design) {
      if (from[key] !== undefined) kept[key] = from[key];
    }
    if (design.includes('accent') && kept.accent === undefined) {
      kept.accent = ACCENTS[index % ACCENTS.length];
    }
    return { ...template, ...kept, ...item };
  });
}

(async () => {
  if (!fs.existsSync(PAYLOAD)) {
    console.error(`Copy payload not found: ${PAYLOAD}`);
    process.exit(1);
  }

  const copy = JSON.parse(fs.readFileSync(PAYLOAD, 'utf8'));

  const uri = envValue('MONGODB_URI');
  const dbName = envValue('MONGODB_DB_NAME') || 'aptentech';
  if (!uri) {
    console.error('MONGODB_URI is not set in apps/api/.env');
    process.exit(1);
  }

  const { MongoClient } = require('mongodb');
  const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const db = client.db(dbName);

  // Asked before the page is read: the question is whether this payload is new, not whether
  // the page happens to match it. A page that no longer matches because someone edited it in
  // the admin is the case this exists to leave alone.
  const hash = payloadHash(PAYLOAD);
  const verdict = await shouldApply(db, 'home', hash, { force: FORCE });
  if (!verdict.apply) {
    console.log(`Home page skipped — ${verdict.reason}.`);
    await client.close();
    return;
  }

  const home = await db.collection('sitepages').findOne({ slug: 'home' });
  if (!home) {
    console.error('No page with slug "home".');
    await client.close();
    process.exit(1);
  }

  const changes = [];

  /** Applies `next` over `block`, recording which fields actually moved. */
  const set = (block, next, label) => {
    const moved = Object.keys(next).filter((k) => !same(block[k], next[k]));
    if (moved.length) changes.push(`${label}: ${moved.join(', ')}`);
    return moved.length ? { ...block, ...next } : block;
  };

  const blocks = home.blocks.map((block) => {
    switch (block.type) {
      case 'homeHero': {
        const ctas = (block.ctas ?? []).map((cta, i) =>
          copy.hero.ctaLabels[i] ? { ...cta, label: copy.hero.ctaLabels[i] } : cta,
        );
        return set(block, { splitHeading: copy.hero.splitHeading, sub: copy.hero.sub, ctas }, 'hero');
      }

      case 'statsPanel':
        return set(
          block,
          {
            title: copy.stats.title,
            // The old note said the figures were placeholders. They are the client's own now,
            // so the disclaimer has to go with them.
            note: copy.stats.note,
            lede: copy.stats.lede,
            stats: copy.stats.items,
          },
          'stats',
        );

      case 'whyGrid':
        return set(
          block,
          {
            eyebrow: copy.why.eyebrow,
            title: copy.why.title,
            lede: copy.why.lede,
            items: mergeList(block.items, copy.why.items, ['accent', 'icon']),
          },
          'why',
        );

      case 'serviceTabs':
        return set(
          block,
          {
            eyebrow: copy.services.eyebrow,
            title: copy.services.title,
            lede: copy.services.lede,
            items: mergeList(block.items, copy.services.items, ['accent', 'icon']),
          },
          'services',
        );

      case 'caseCarousel':
        return set(
          block,
          {
            eyebrow: copy.cases.eyebrow,
            title: copy.cases.title,
            lede: copy.cases.lede,
            ctaLabel: copy.cases.ctaLabel,
          },
          'case studies',
        );

      case 'testimonialSection':
        return set(block, copy.testimonials, 'testimonials');

      case 'awardsBand':
        // Headings only. The award entries are claims about the company and are not in the copy
        // document, so they stay exactly as they are for someone to fill in or switch off.
        return set(block, copy.awards, 'awards (headings only)');

      case 'techTabs':
        return set(
          block,
          {
            eyebrow: copy.tech.eyebrow,
            title: copy.tech.title,
            lede: copy.tech.lede,
            groups: copy.tech.groups.map((group, index) => {
              const from = (block.groups ?? [])[index] ?? {};
              return {
                category: group.category,
                accent: from.accent ?? ACCENTS[index % ACCENTS.length],
                items: group.items.map((label, i) => {
                  const chip = (from.items ?? [])[i] ?? {};
                  return {
                    label,
                    icon: chip.icon ?? '',
                    image: chip.image ?? { mediaId: null, legacyPath: null, alt: '', width: null, height: null },
                  };
                }),
              };
            }),
          },
          'tech stack',
        );

      case 'growthBand':
        return set(
          block,
          {
            eyebrow: copy.growth.eyebrow,
            title: copy.growth.title,
            lede: copy.growth.lede,
            funnelLabel: copy.growth.funnelLabel,
            ctaLabel: copy.growth.ctaLabel,
            stages: copy.growth.stages,
            channels: mergeList(block.channels, copy.growth.channels, ['accent', 'icon']),
          },
          'growth',
        );

      case 'ctaSection': {
        const ctas = (block.ctas ?? []).map((cta, i) => (i === 0 ? { ...cta, label: copy.cta.ctaLabel } : cta));
        return set(
          block,
          { title: copy.cta.title, body: copy.cta.body, points: copy.cta.points, ctas },
          'mid-page CTA',
        );
      }

      case 'faqShell':
        return set(
          block,
          {
            eyebrow: copy.faq.eyebrow,
            title: copy.faq.title,
            lede: copy.faq.lede,
            askTitle: copy.faq.askTitle,
            askBody: copy.faq.askBody,
            askCtaLabel: copy.faq.askCtaLabel,
            faqs: copy.faq.items.map((item, index) => ({
              question: item.question,
              answer: item.answer,
              category: item.category,
              order: index,
              visible: true,
            })),
          },
          'FAQs',
        );

      case 'leadFormSection':
        return set(
          block,
          {
            title: copy.lead.title,
            lede: copy.lead.lede,
            reasons: mergeList(block.reasons, copy.lead.reasons, ['accent', 'icon']),
            leadForm: { ...(block.leadForm ?? {}), submitLabel: copy.lead.ctaLabel },
          },
          'lead form',
        );

      default:
        return block;
    }
  });

  if (!changes.length) {
    console.log(`Home page copy is already up to date (${verdict.reason}).`);
    // The payload is new but the page already says the same thing — a note changed, nothing
    // else. Still recorded, so the next deploy does not ask again.
    if (APPLY) await recordApplied(db, 'home', hash, 'home-content.json');
  } else {
    console.log('Changes:');
    for (const c of changes) console.log('  ' + c);
    if (APPLY) {
      await db.collection('sitepages').updateOne({ _id: home._id }, { $set: { blocks } });
      await recordApplied(db, 'home', hash, 'home-content.json');
      console.log('\nWritten.');
      await revalidate(['page:home', 'pages'], envValue);
    } else {
      console.log('\nDry run — nothing was written. To apply:');
      console.log('  node scripts/apply-home-content.js --apply\n');
    }
  }

  await client.close();
})().catch((err) => {
  // The whole error, not just its message. This runs unattended in the deploy, where the
  // only record of a failure is whatever it printed, and a bare message with no stack says
  // nothing about which of the page blocks it was working on when it gave up.
  console.error(err);
  process.exit(1);
});

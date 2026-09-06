#!/usr/bin/env node
/**
 * Hides the demo content that must not go live.
 *
 * The seeded demo values fill three slots that are *claims about the company* — awards and
 * certifications, client testimonials, and case-study outcome metrics. None was verified, and
 * a visitor cannot tell an invented award from a real one. `npm run preflight` blocks on them
 * for that reason; this is the way to clear that block when the real values are not ready.
 *
 * It **hides rather than deletes**. Every section can be switched back on from the CMS the day
 * real credentials, quotes and figures exist, and nothing has to be re-seeded. The pages stay
 * complete — the design has no empty state to fall into, because a hidden section is not
 * rendered at all rather than rendered blank.
 *
 * Nothing here touches contact details or the environment: those need real values, and
 * inventing them is the thing this whole approach exists to avoid.
 *
 *   node scripts/clear-demo-content.js            # show what would change
 *   node scripts/clear-demo-content.js --apply    # make the changes
 */
const { MongoClient } = require('mongodb');

const APPLY = process.argv.includes('--apply');

/** Read the API's own connection string so this cannot point at the wrong database. */
function readUri() {
  const fs = require('node:fs');
  const path = require('node:path');
  const file = path.resolve(__dirname, '../apps/api/.env');
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*MONGODB_URI\s*=\s*(.*)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

(async () => {
  const uri = process.env.MONGODB_URI || readUri();
  if (!uri) {
    console.error('MONGODB_URI not found. Set it, or fill it in in apps/api/.env.');
    process.exit(1);
  }

  const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 8000 });
  const db = client.db(process.env.MONGODB_DB_NAME || 'aptentech');

  console.log(APPLY ? 'Applying changes\n' : 'Dry run — nothing will be changed\n');

  /* ------------------------------------------------------------ awards / recognition */

  /*
    The recognition band is hidden by adding its section id to the page's own
    `hiddenSections`, which is the mechanism the CMS already uses. That is why this is
    reversible from the admin without a deploy.
  */
  const withDemoAwards = await db
    .collection('servicepages')
    .find({ 'awards.title': /^Demo /i })
    .project({ slug: 1, hiddenSections: 1 })
    .toArray();

  console.log(`Recognition band — ${withDemoAwards.length} page(s) show a "Demo award"`);
  if (APPLY) {
    for (const page of withDemoAwards) {
      const hidden = new Set(page.hiddenSections ?? []);
      hidden.add('recognition');
      await db.collection('servicepages').updateOne({ _id: page._id }, { $set: { hiddenSections: [...hidden] } });
    }
    console.log(`  hidden on ${withDemoAwards.length} page(s)`);
  } else {
    console.log(`  would hide the recognition section on: ${withDemoAwards.map((p) => p.slug).join(', ')}`);
  }

  /* ------------------------------------------------------------ testimonials */

  const demoTestimonials = await db.collection('testimonials').countDocuments({ demoContent: true, visible: true });
  console.log(`\nTestimonials — ${demoTestimonials} demo quote(s) currently visible`);
  if (APPLY) {
    const r = await db.collection('testimonials').updateMany({ demoContent: true }, { $set: { visible: false } });
    console.log(`  hidden ${r.modifiedCount}`);
  } else {
    console.log('  would set visible:false — the quotes stay in the CMS, ready to be replaced');
  }

  /* ------------------------------------------------------------ case studies */

  /*
    Case studies keep their prose — the problem and solution text came from the source and is
    real. Only the metrics were generated, so only those are cleared. An empty metric renders
    as nothing rather than as a wrong number.
  */
  const demoStudies = await db.collection('casestudies').countDocuments({ demoContent: true });
  console.log(`\nCase studies — ${demoStudies} carry generated metrics`);
  if (APPLY) {
    const studies = await db.collection('casestudies').find({ demoContent: true }).toArray();
    let cleared = 0;
    for (const study of studies) {
      const metrics = (study.metrics ?? []).map((m) => ({ ...m, value: '' }));
      await db.collection('casestudies').updateOne(
        { _id: study._id },
        { $set: { metrics, result: '' } },
      );
      cleared += 1;
    }
    console.log(`  cleared metrics on ${cleared} study(ies) — problem and solution text kept`);
  } else {
    console.log('  would blank the metric values and the result line, keeping the written case');
  }

  /* ------------------------------------------------------------ what this does not do */

  console.log('\nNot handled here — these need real values, not a switch:');
  const settings = await db.collection('sitesettings').findOne({ singleton: 'site' });
  console.log(`  Company email : ${settings?.email ?? '(unset)'}`);
  console.log(`  Company phone : ${settings?.phone ?? '(unset)'}`);
  console.log('  Set both in the admin under Settings, then run: npm run preflight');

  if (!APPLY) console.log('\nRe-run with --apply to make these changes.');

  await client.close();
})();

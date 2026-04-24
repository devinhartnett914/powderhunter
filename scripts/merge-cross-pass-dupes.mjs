// Collapse mountains that appear on multiple passes into a single row whose
// pass_types array holds all their passes.
//
// Usage:
//   node scripts/merge-cross-pass-dupes.mjs           # dry-run, prints plan
//   node scripts/merge-cross-pass-dupes.mjs --apply   # executes against DB
//
// Prereq: migration 008 has been run (adds the pass_types column).

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');

const sb = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Map anything state-ish to a canonical 2-letter code. Rows where the current
// location is a broader country/region (e.g. "Australia", "Japan") get normalized
// to the country name so US and international entries don't collide.
const STATE_TO_ABBR = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR',
  california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
  kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY',
  alberta: 'AB', 'british columbia': 'BC', manitoba: 'MB', 'new brunswick': 'NB',
  'newfoundland and labrador': 'NL', 'nova scotia': 'NS', ontario: 'ON',
  'prince edward island': 'PE', quebec: 'QC', saskatchewan: 'SK', yukon: 'YT',
};

// Region-to-country rollups so e.g. "Hokkaido" collides with "Japan".
const REGION_TO_COUNTRY = {
  hokkaido: 'Japan', honshu: 'Japan', nagano: 'Japan', niigata: 'Japan',
  victoria: 'Australia', 'new south wales': 'Australia',
  'santiago metropolitan': 'Chile', andes: 'Chile',
};

function canonLocation(loc) {
  if (!loc) return '';
  const trimmed = loc.trim();
  const lower = trimmed.toLowerCase();
  if (STATE_TO_ABBR[lower]) return STATE_TO_ABBR[lower];
  if (REGION_TO_COUNTRY[lower]) return REGION_TO_COUNTRY[lower];
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return trimmed;
}

function canonName(name) {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    // "Mt." / "Mt" → "mount" (the scrape has both forms for the same resorts)
    .replace(/\bmt\b\.?/g, 'mount')
    // Strip leading "the " ("The Summit at Snoqualmie" vs "Summit at Snoqualmie")
    .replace(/^the\s+/, '');
}

function dupeKey(row) {
  return canonName(row.name) + ' | ' + canonLocation(row.location).toLowerCase();
}

// Pick the "best" row from a dupe group: the one with the most non-null,
// non-empty interesting columns. Ties broken by lowest id (older = more
// enriched, from the original Excel seed).
const ENRICHMENT_FIELDS = [
  'lat', 'lng', 'acreage', 'vertical_ft', 'kids_ski_free', 'ski_school_min_age',
  'ski_school_max_cost', 'daycare', 'closest_airport', 'major_airport',
  'closest_airport_distance_mi', 'major_airport_distance_mi', 'url',
];

function score(row) {
  let s = 0;
  for (const f of ENRICHMENT_FIELDS) {
    const v = row[f];
    if (v !== null && v !== undefined && v !== '' && v !== 0) s += 1;
  }
  return s;
}

function pickCanonical(rows) {
  return rows.slice().sort((a, b) => {
    const ds = score(b) - score(a);
    if (ds !== 0) return ds;
    return a.id - b.id;
  })[0];
}

async function main() {
  console.log(APPLY ? '=== APPLY MODE ===' : '=== DRY RUN (pass --apply to execute) ===\n');

  const { data: all, error } = await sb.from('resorts').select('*');
  if (error) throw error;
  console.log(`fetched ${all.length} rows from resorts`);

  // Group by canonical key.
  const groups = {};
  for (const r of all) {
    const k = dupeKey(r);
    (groups[k] ||= []).push(r);
  }

  const dupeGroups = Object.entries(groups).filter(([, rows]) => rows.length > 1);
  console.log(`dupe groups: ${dupeGroups.length}`);

  let merged = 0;
  let deleted = 0;

  for (const [key, rows] of dupeGroups) {
    const canonical = pickCanonical(rows);
    const others = rows.filter(r => r.id !== canonical.id);

    // Union of pass_types across the whole group.
    const allPasses = new Set();
    for (const r of rows) {
      // pass_types might be null if migration 008 didn't backfill this row yet.
      const arr = (r.pass_types && r.pass_types.length) ? r.pass_types : [r.pass_type];
      for (const p of arr) if (p) allPasses.add(p);
    }
    const passTypesMerged = Array.from(allPasses).sort();

    // Normalize the canonical row's location to the canon form so the future
    // unique index on (lower(name), lower(location)) doesn't let new dupes in.
    const newLocation = canonLocation(canonical.location);

    // Promote any non-null enrichment field from the dupes into the canonical
    // if the canonical doesn't already have it.
    const promoted = {};
    for (const f of ENRICHMENT_FIELDS) {
      const canVal = canonical[f];
      if (canVal !== null && canVal !== undefined && canVal !== '' && canVal !== 0) continue;
      for (const o of others) {
        const oVal = o[f];
        if (oVal !== null && oVal !== undefined && oVal !== '' && oVal !== 0) {
          promoted[f] = oVal;
          break;
        }
      }
    }

    const updatePayload = {
      pass_types: passTypesMerged,
      location: newLocation,
      ...promoted,
    };

    console.log(`\n[${key}]`);
    console.log(`  canonical: id=${canonical.id} ${canonical.pass_type} "${canonical.name}" "${canonical.location}" (score=${score(canonical)})`);
    console.log(`  others   : ${others.map(o => `id=${o.id}/${o.pass_type}(score=${score(o)})`).join(', ')}`);
    console.log(`  -> pass_types = [${passTypesMerged.join(', ')}]`);
    if (newLocation !== canonical.location) {
      console.log(`  -> location  = "${canonical.location}" → "${newLocation}"`);
    }
    if (Object.keys(promoted).length) {
      console.log(`  -> promoted fields from dupes: ${Object.keys(promoted).join(', ')}`);
    }
    console.log(`  -> delete ids: ${others.map(o => o.id).join(', ')}`);

    if (APPLY) {
      const { error: upErr } = await sb
        .from('resorts')
        .update(updatePayload)
        .eq('id', canonical.id);
      if (upErr) { console.error('  UPDATE FAILED:', upErr); process.exit(1); }

      const { error: delErr } = await sb
        .from('resorts')
        .delete()
        .in('id', others.map(o => o.id));
      if (delErr) { console.error('  DELETE FAILED:', delErr); process.exit(1); }

      merged += 1;
      deleted += others.length;
    }
  }

  console.log(`\n=== summary ===`);
  console.log(`dupe groups found: ${dupeGroups.length}`);
  if (APPLY) {
    console.log(`groups merged:     ${merged}`);
    console.log(`rows deleted:      ${deleted}`);
    const { count } = await sb.from('resorts').select('id', { count: 'exact', head: true });
    console.log(`rows remaining:    ${count}`);
  } else {
    console.log(`(dry-run — no changes made)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

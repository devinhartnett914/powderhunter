// Delete Indy rows that represent XC / Nordic clubs (the "Indy XC Pass"), not
// the main alpine Indy Pass partners.
//
// Usage:
//   node scripts/cleanup-indy-nordic.mjs           # dry-run
//   node scripts/cleanup-indy-nordic.mjs --apply   # delete

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');

const sb = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Names that look Nordic BUT are actually alpine — keep these.
const KEEP_ALPINE = new Set([
  'Nordic Mountain', // Wisconsin alpine resort, despite the name
]);

// Patterns that reliably identify Nordic/XC-only partners.
const NORDIC_PATTERNS = [
  /\bnordic\b/i,
  /\bcross[-\s]?country\b/i,
  /\bxc\b/i,
];

// Ambiguous names — Ski Club / Outing Club could be either. Report but don't delete.
const AMBIGUOUS_PATTERNS = [
  /\bski club\b/i,
  /\bouting club\b/i,
];

async function main() {
  console.log(APPLY ? '=== APPLY MODE ===' : '=== DRY RUN (pass --apply to execute) ===\n');

  const { data: indy, error } = await sb
    .from('resorts')
    .select('id, name, location, pass_type, pass_types')
    .contains('pass_types', ['Indy'])
    .order('name');

  // Fallback for when pass_types doesn't exist yet: read pass_type directly.
  let rows = indy;
  if (error && error.code === '42703') {
    const { data: alt, error: altErr } = await sb
      .from('resorts')
      .select('id, name, location, pass_type')
      .eq('pass_type', 'Indy')
      .order('name');
    if (altErr) throw altErr;
    rows = alt;
    console.log('(pass_types column not found — falling back to pass_type=Indy)');
  } else if (error) {
    throw error;
  }

  console.log(`Indy rows: ${rows.length}`);

  const toDelete = [];
  const ambiguous = [];

  for (const r of rows) {
    if (KEEP_ALPINE.has(r.name)) continue;
    if (NORDIC_PATTERNS.some(re => re.test(r.name))) {
      toDelete.push(r);
      continue;
    }
    if (AMBIGUOUS_PATTERNS.some(re => re.test(r.name))) {
      ambiguous.push(r);
    }
  }

  console.log(`\nrows to delete (Nordic/XC): ${toDelete.length}`);
  toDelete.forEach(r => console.log(`  id=${r.id}  ${r.name} — ${r.location}`));

  console.log(`\nambiguous (review manually): ${ambiguous.length}`);
  ambiguous.forEach(r => console.log(`  id=${r.id}  ${r.name} — ${r.location}`));

  if (toDelete.length === 0) {
    console.log('\nnothing to delete.');
    return;
  }

  if (APPLY) {
    // If a Nordic row also has other passes in pass_types (unlikely, but possible),
    // drop only the 'Indy' entry from pass_types instead of deleting the row.
    const pureIndy = toDelete.filter(r => !r.pass_types || r.pass_types.length <= 1);
    const multiPass = toDelete.filter(r => r.pass_types && r.pass_types.length > 1);

    if (pureIndy.length) {
      const { error: delErr } = await sb
        .from('resorts')
        .delete()
        .in('id', pureIndy.map(r => r.id));
      if (delErr) { console.error('DELETE failed:', delErr); process.exit(1); }
      console.log(`\ndeleted ${pureIndy.length} pure-Indy Nordic rows`);
    }

    for (const r of multiPass) {
      const newPasses = r.pass_types.filter(p => p !== 'Indy');
      const { error: upErr } = await sb
        .from('resorts')
        .update({ pass_types: newPasses })
        .eq('id', r.id);
      if (upErr) { console.error('UPDATE failed:', upErr); process.exit(1); }
      console.log(`  dropped Indy from id=${r.id} (${r.name}); remaining: ${newPasses.join(', ')}`);
    }
  } else {
    console.log('\n(dry-run — no changes made)');
  }
}

main().catch(e => { console.error(e); process.exit(1); });

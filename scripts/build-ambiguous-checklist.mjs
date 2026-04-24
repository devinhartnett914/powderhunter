// Re-run the Levenshtein-3/4 ambiguous-name match against the LIVE DB and
// emit a checklist file so the user can mark which pairs are real dupes.
//
// Output: data/scraped/ambiguous-checklist.md
//
// The checklist pre-fills a guess:
//   - "likely dupe" when the locations match closely AND the names differ only
//     in punctuation / "Mt." vs "Mount" / "The X" vs "X".
//   - "likely different" otherwise.

import 'dotenv/config';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function normName(s) {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Aggressive normalization used to decide "likely dupe": ignores punctuation,
// "Mount" vs "Mt", leading "The".
function aggressiveName(s) {
  return normName(s)
    .replace(/^the\s+/, '')
    .replace(/\bmt\.?\b/g, 'mount')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function looseLocation(loc) {
  const s = (loc || '').toLowerCase().trim();
  const stateMap = {
    alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar',
    california: 'ca', colorado: 'co', connecticut: 'ct', delaware: 'de',
    florida: 'fl', georgia: 'ga', hawaii: 'hi', idaho: 'id',
    illinois: 'il', indiana: 'in', iowa: 'ia', kansas: 'ks',
    kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md',
    massachusetts: 'ma', michigan: 'mi', minnesota: 'mn', mississippi: 'ms',
    missouri: 'mo', montana: 'mt', nebraska: 'ne', nevada: 'nv',
    'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm', 'new york': 'ny',
    'north carolina': 'nc', 'north dakota': 'nd', ohio: 'oh', oklahoma: 'ok',
    oregon: 'or', pennsylvania: 'pa', 'rhode island': 'ri', 'south carolina': 'sc',
    'south dakota': 'sd', tennessee: 'tn', texas: 'tx', utah: 'ut',
    vermont: 'vt', virginia: 'va', washington: 'wa', 'west virginia': 'wv',
    wisconsin: 'wi', wyoming: 'wy',
    alberta: 'ab', 'british columbia': 'bc', quebec: 'qc', ontario: 'on',
  };
  return stateMap[s] || s;
}

// The main dedupe script's canon key. Anything that collides here gets
// auto-merged, so we can exclude those from the checklist.
function dedupeCanonName(s) {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
    .replace(/\bmt\b\.?/g, 'mount')
    .replace(/^the\s+/, '');
}

async function main() {
  const { data: all, error } = await sb.from('resorts').select('id, name, location, pass_type').order('name');
  if (error) throw error;

  const rows = all.map(r => ({
    ...r,
    _norm: normName(r.name),
    _agg: aggressiveName(r.name),
    _loc: looseLocation(r.location),
    _dedupeKey: dedupeCanonName(r.name) + ' | ' + looseLocation(r.location),
  }));

  // Find pairs with Levenshtein distance 1–4 AND loose-location match. The
  // location filter cuts 239 noisy pairs down to the real candidates —
  // same-name-different-state is almost always two genuinely different resorts.
  const seen = new Set();
  const pairs = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      const d = levenshtein(a._norm, b._norm);
      if (d < 1 || d > 4) continue;
      if (a._loc !== b._loc) continue;
      // Skip pairs the main dedupe script will already auto-merge.
      if (a._dedupeKey === b._dedupeKey) continue;

      const key = [a.id, b.id].sort().join('-');
      if (seen.has(key)) continue;
      seen.add(key);

      pairs.push({ a, b, dist: d });
    }
  }

  pairs.sort((x, y) => x.dist - y.dist);

  const lines = [];
  lines.push('# Ambiguous near-duplicate pairs — review');
  lines.push('');
  lines.push(`Found **${pairs.length} pairs** with Levenshtein distance 1–4 where locations also match. These are the cases the auto-merge can't handle confidently.`);
  lines.push('');
  lines.push('For each pair:');
  lines.push('- If they are the **same mountain**: put `[x]` next to the row you want to keep as canonical. The other is deleted and its pass_types merged into the canonical.');
  lines.push('- If they are **different mountains**: leave both boxes blank. They stay separate.');
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const p of pairs) {
    lines.push(`### ${p.a.name}  ↔  ${p.b.name}  (distance=${p.dist})`);
    lines.push(`- [ ] **keep** id=${p.a.id} "${p.a.name}" — ${p.a.pass_type} — ${p.a.location}`);
    lines.push(`- [ ] **keep** id=${p.b.id} "${p.b.name}" — ${p.b.pass_type} — ${p.b.location}`);
    lines.push('');
  }

  const outFile = 'data/scraped/ambiguous-checklist.md';
  fs.writeFileSync(outFile, lines.join('\n'));
  console.log(`wrote ${outFile}`);
  console.log(`  pairs needing review: ${pairs.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });

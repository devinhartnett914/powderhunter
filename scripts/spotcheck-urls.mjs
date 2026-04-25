#!/usr/bin/env node
// spotcheck-urls.mjs
// Reads data/scraped/enrich-urls.json, joins against the live resorts table
// for current URL values, picks a stratified sample across the five URL
// fields, and writes data/scraped/url-spotcheck.md — a clickable markdown
// checklist for manual verification.
//
// Sample plan (totals; clamped to whatever actually exists):
//   daycare_url          → all
//   url                  → 5 random
//   ski_school_url       → 3 random
//   ski_school_cost_url  → 3 random
//   kids_ski_free_url    → 5 random
//
// Usage:
//   node scripts/spotcheck-urls.mjs
//   node scripts/spotcheck-urls.mjs --seed 42   # reproducible sample

import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const INFILE = "data/scraped/enrich-urls.json";
const OUTFILE = "data/scraped/url-spotcheck.md";

const SAMPLE_PLAN = {
  daycare_url: Infinity,
  url: 5,
  ski_school_url: 3,
  ski_school_cost_url: 3,
  kids_ski_free_url: 5,
};

const args = process.argv.slice(2);
const seedIdx = args.indexOf("--seed");
const SEED = seedIdx >= 0 ? parseInt(args[seedIdx + 1], 10) : Date.now();

// Mulberry32 — tiny seeded PRNG so --seed produces a reproducible sample.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);

function sample(arr, n) {
  if (!Number.isFinite(n) || n >= arr.length) return [...arr];
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing in .env");
const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const results = JSON.parse(readFileSync(INFILE, "utf8"));

// Group accepted hits by field.
const hitsByField = Object.fromEntries(Object.keys(SAMPLE_PLAN).map((f) => [f, []]));
for (const r of results) {
  for (const [field, url] of Object.entries(r.accepted || {})) {
    if (hitsByField[field]) hitsByField[field].push({ id: r.id, name: r.name, scrapedUrl: url });
  }
}

const ids = new Set();
const sampled = {};
for (const [field, hits] of Object.entries(hitsByField)) {
  const picked = sample(hits, SAMPLE_PLAN[field]);
  sampled[field] = picked;
  for (const h of picked) ids.add(h.id);
}

// Fetch current DB values so we confirm the URL actually landed.
const { data: rows, error } = await supabase
  .from("resorts")
  .select("id, name, location, pass_type, pass_types, url, kids_ski_free_url, ski_school_url, ski_school_cost_url, daycare_url")
  .in("id", [...ids]);
if (error) throw error;
const byId = new Map(rows.map((r) => [r.id, r]));

const FIELD_LABELS = {
  url: "Main site",
  kids_ski_free_url: "Kids ski free",
  ski_school_url: "Ski school",
  ski_school_cost_url: "Ski school cost",
  daycare_url: "Daycare",
};

const FIELD_CHECK_HINT = {
  url: "Loads, looks like resort homepage.",
  kids_ski_free_url: "Page actually describes the kids-ski-free policy.",
  ski_school_url: "Page is the ski/snow school, not a generic landing.",
  ski_school_cost_url: "Page shows lesson prices.",
  daycare_url: "Page mentions childcare/daycare/nursery (not just family ski).",
};

const lines = [];
lines.push(`# URL spot-check — ${new Date().toISOString().slice(0, 10)}`);
lines.push("");
lines.push(`Sampled from \`${INFILE}\` (seed: \`${SEED}\`).`);
lines.push("");
lines.push("For each row: click the link, confirm the hint on the right, then check the box.");
lines.push("If a URL is wrong, note it below the row and we'll blank it out in the DB.");
lines.push("");

for (const [field, picked] of Object.entries(sampled)) {
  if (!picked.length) continue;
  lines.push(`## ${FIELD_LABELS[field]} (\`${field}\`) — ${picked.length} to check`);
  lines.push("");
  lines.push(`_Check: ${FIELD_CHECK_HINT[field]}_`);
  lines.push("");
  for (const h of picked) {
    const dbRow = byId.get(h.id);
    const dbUrl = dbRow?.[field];
    const mismatch = dbUrl !== h.scrapedUrl;
    const loc = dbRow?.location ? ` — ${dbRow.location}` : "";
    const passes = dbRow?.pass_types?.length ? ` [${dbRow.pass_types.join(", ")}]` : dbRow?.pass_type ? ` [${dbRow.pass_type}]` : "";
    lines.push(`- [ ] **${h.name}**${loc}${passes} — [${h.scrapedUrl}](${h.scrapedUrl})`);
    if (mismatch) {
      lines.push(`  - ⚠️ DB value differs: \`${dbUrl ?? "(null)"}\``);
    }
  }
  lines.push("");
}

lines.push("---");
lines.push("");
lines.push("## Notes");
lines.push("");
lines.push("_Record any bad URLs here so we can null them out:_");
lines.push("");

writeFileSync(OUTFILE, lines.join("\n"));
console.log(`[spotcheck] wrote ${OUTFILE}`);
console.log(`[seed] ${SEED}`);
for (const [field, picked] of Object.entries(sampled)) {
  console.log(`  ${field}: ${picked.length} / ${hitsByField[field].length} accepted`);
}

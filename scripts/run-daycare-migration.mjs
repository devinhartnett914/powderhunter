#!/usr/bin/env node
// run-daycare-migration.mjs
// Applies data from data/scraped/enrich-daycare.json to the resorts table.
// Matches the semantics of db/migrations/007_populate_daycare_min_age.sql:
//   UPDATE resorts SET daycare_min_age = ?, daycare_url = COALESCE(daycare_url, ?)
//   WHERE name = ? AND pass_type = ? AND location = ?
//
// Usage:
//   node scripts/run-daycare-migration.mjs            # dry-run (anon key OK)
//   node scripts/run-daycare-migration.mjs --apply    # writes (needs SUPABASE_SERVICE_ROLE_KEY)

import "dotenv/config";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const url = process.env.PUBLIC_SUPABASE_URL;
const key = APPLY ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!url) throw new Error("PUBLIC_SUPABASE_URL missing in .env");
if (!key) {
  throw new Error(
    APPLY
      ? "SUPABASE_SERVICE_ROLE_KEY missing in .env — grab it from Supabase dashboard > Project Settings > API"
      : "PUBLIC_SUPABASE_ANON_KEY missing in .env",
  );
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const enrich = JSON.parse(readFileSync("data/scraped/enrich-daycare.json", "utf8"));
const rows = enrich.filter((r) => r.daycare_min_age);

const { data: current, error: readErr } = await supabase
  .from("resorts")
  .select("name, pass_type, location, daycare_min_age, daycare_url");
if (readErr) throw readErr;

const currentMap = new Map(
  current.map((r) => [`${r.name}|${r.pass_type}|${r.location}`, r]),
);

let willChangeAge = 0,
  willChangeUrl = 0,
  noop = 0,
  notFound = 0,
  ok = 0,
  fail = 0;
const missing = [];

for (const r of rows) {
  const k = `${r.name}|${r.pass_type}|${r.location}`;
  const existing = currentMap.get(k);
  if (!existing) {
    notFound++;
    missing.push(`${r.name} (${r.pass_type}, ${r.location})`);
    continue;
  }

  const update = {};
  if (existing.daycare_min_age !== r.daycare_min_age) {
    update.daycare_min_age = r.daycare_min_age;
    willChangeAge++;
  }
  if (r.source_url && !existing.daycare_url) {
    update.daycare_url = r.source_url;
    willChangeUrl++;
  }
  if (Object.keys(update).length === 0) {
    noop++;
    continue;
  }

  if (!APPLY) continue;

  const { error } = await supabase
    .from("resorts")
    .update(update)
    .eq("name", r.name)
    .eq("pass_type", r.pass_type)
    .eq("location", r.location);
  if (error) {
    console.error(`FAIL ${r.name}: ${error.message}`);
    fail++;
  } else {
    ok++;
  }
}

console.log(APPLY ? "=== APPLIED ===" : "=== DRY RUN ===");
console.log(`daycare_min_age updates: ${willChangeAge}`);
console.log(`daycare_url updates (COALESCE):  ${willChangeUrl}`);
console.log(`No-op (already matches): ${noop}`);
console.log(`Not found in DB:         ${notFound}`);
if (APPLY) console.log(`Writes succeeded: ${ok}, failed: ${fail}`);
if (missing.length) {
  console.log("\nMissing rows (first 10):");
  missing.slice(0, 10).forEach((m) => console.log("  -", m));
  if (missing.length > 10) console.log(`  ... and ${missing.length - 10} more`);
}
if (!APPLY) console.log("\nRun with --apply to execute (requires SUPABASE_SERVICE_ROLE_KEY).");

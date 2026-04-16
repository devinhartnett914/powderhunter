#!/usr/bin/env node
// Generate UPDATE statements for vertical_ft + airport fields from enrichment JSON.
import { readFileSync, writeFileSync } from "node:fs";

const FILES = [
  ["enrich-ikon.json", "Ikon"],
  ["enrich-epic.json", "Epic"],
  ["enrich-indy.json", "Indy"],
  ["enrich-mc.json", "Mountain Collective"],
  ["enrich-clubmed.json", "Club Med"],
];

const esc = (s) => s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`;
const num = (n) => n == null ? "NULL" : String(n);

const lines = [
  "-- 004_backfill_vertical_airports.sql",
  "-- Backfills vertical_ft, closest_airport, major_airport, closest_airport_distance,",
  "-- major_airport_distance for all resorts. Matched by name + pass_type.",
  "-- Does NOT overwrite existing non-null airport fields (preserves hand-curated data).",
  "",
  "BEGIN;",
  "",
];

let count = 0;
for (const [file, passType] of FILES) {
  const data = JSON.parse(readFileSync(`data/scraped/${file}`, "utf8"));
  for (const r of data) {
    if (!r.name) continue;
    // Build SET clause — only set fields that have values, and only if existing is NULL
    const sets = [];
    if (r.vertical_ft != null) sets.push(`vertical_ft = COALESCE(vertical_ft, ${num(r.vertical_ft)})`);
    if (r.closest_airport) sets.push(`closest_airport = COALESCE(closest_airport, ${esc(r.closest_airport)})`);
    if (r.major_airport) sets.push(`major_airport = COALESCE(major_airport, ${esc(r.major_airport)})`);
    if (r.closest_airport_distance) sets.push(`closest_airport_distance = COALESCE(closest_airport_distance, ${esc(r.closest_airport_distance)})`);
    if (r.major_airport_distance) sets.push(`major_airport_distance = COALESCE(major_airport_distance, ${esc(r.major_airport_distance)})`);
    if (sets.length === 0) continue;

    // Match by name (fuzzy: the DB name may differ slightly from enrichment name)
    lines.push(`UPDATE resorts SET ${sets.join(", ")} WHERE name ILIKE ${esc(r.name)} AND pass_type = ${esc(passType)};`);
    count++;
  }
}

lines.push("", "COMMIT;", "");
writeFileSync("db/migrations/004_backfill_vertical_airports.sql", lines.join("\n"));
console.log(`wrote ${count} UPDATE statements`);

#!/usr/bin/env node
// Generate UPDATE statements to backfill lat/lng for resorts that were inserted without coordinates.
import { readFileSync, writeFileSync } from "node:fs";

const overflow = JSON.parse(readFileSync("data/scraped/enrichment-overflow.json", "utf8"));
const geo = JSON.parse(readFileSync("data/scraped/geocoded.json", "utf8"));

const esc = (s) => s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`;

const lines = ["-- 003_backfill_latlng.sql", "-- Backfills lat/lng for resorts geocoded after the initial 150-resort cap.", "", "BEGIN;", ""];

let count = 0;
for (const r of overflow) {
  const key = `${r.pass_type}|${r.name}|${r.location}`;
  const g = geo[key];
  if (!g || g.lat == null) continue;
  lines.push(
    `UPDATE resorts SET lat = ${g.lat}, lng = ${g.lng} WHERE name = ${esc(r.name)} AND pass_type = ${esc(r.pass_type)} AND location = ${esc(r.location)} AND lat IS NULL;`
  );
  count++;
}

lines.push("", "COMMIT;", "");
writeFileSync("db/migrations/003_backfill_latlng.sql", lines.join("\n"));
console.log(`wrote ${count} UPDATE statements`);

#!/usr/bin/env node
// Geocode new resorts via Google Geocoding API. Caps at 150 and writes to data/scraped/geocoded.json.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const envLines = readFileSync(".env", "utf8").split("\n");
const env = {};
for (const l of envLines) { const m = l.match(/^([^#=]+)=(.*)$/); if (m) env[m[1].trim()] = m[2].trim(); }
const KEY = env.GOOGLE_MAPS_API_KEY;
if (!KEY) { console.error("missing GOOGLE_MAPS_API_KEY"); process.exit(1); }

const CAP = 500;
const DELAY_MS = 120;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const inserts = JSON.parse(readFileSync("data/scraped/to-insert.json", "utf8"));
const cache = existsSync("data/scraped/geocoded.json")
  ? JSON.parse(readFileSync("data/scraped/geocoded.json", "utf8"))
  : {};

const work = inserts.slice(0, CAP);
const overflow = inserts.slice(CAP);

let done = 0, failed = 0;
for (const r of work) {
  const key = `${r.pass_type}|${r.name}|${r.location}`;
  if (cache[key]) { done++; continue; }
  const q = `${r.name} ski resort, ${r.location}${r.country && r.country !== "US" ? ", " + r.country : ""}`;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${KEY}`;
  try {
    const res = await fetch(url);
    const j = await res.json();
    if (j.status === "OK" && j.results[0]) {
      const loc = j.results[0].geometry.location;
      cache[key] = { lat: loc.lat, lng: loc.lng, formatted: j.results[0].formatted_address };
      done++;
    } else {
      cache[key] = { lat: null, lng: null, error: j.status };
      failed++;
    }
  } catch (e) {
    cache[key] = { lat: null, lng: null, error: String(e) };
    failed++;
  }
  if ((done + failed) % 25 === 0) {
    writeFileSync("data/scraped/geocoded.json", JSON.stringify(cache, null, 2));
    console.log(`progress: ${done} ok, ${failed} failed`);
  }
  await sleep(DELAY_MS);
}
writeFileSync("data/scraped/geocoded.json", JSON.stringify(cache, null, 2));
writeFileSync("data/scraped/enrichment-overflow.json", JSON.stringify(overflow, null, 2));
console.log(`done: ${done} ok, ${failed} failed, overflow ${overflow.length}`);

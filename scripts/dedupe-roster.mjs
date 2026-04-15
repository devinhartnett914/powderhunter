#!/usr/bin/env node
// Dedupe scraped roster JSON against current DB, emit insert/update/ambiguous buckets.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PASSES = [
  ["ikon.json", "Ikon"],
  ["epic.json", "Epic"],
  ["indy.json", "Indy"],
  ["mc.json", "Mountain Collective"],
  ["clubmed.json", "Club Med"],
];

const norm = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
  return dp[m][n];
}

const dbPath = resolve("data/scraped/current-db.json");
const db = JSON.parse(readFileSync(dbPath, "utf8"));

const dbByPass = new Map();
for (const row of db) {
  if (!dbByPass.has(row.pass_type)) dbByPass.set(row.pass_type, []);
  dbByPass.get(row.pass_type).push({ ...row, _n: norm(row.name) });
}

const toInsert = [];
const toUpdateExisting = []; // matched — will just confirm present
const ambiguous = [];
const seen = new Set();

for (const [file, passType] of PASSES) {
  let rows;
  try {
    rows = JSON.parse(readFileSync(resolve("data/scraped", file), "utf8"));
  } catch {
    console.error(`skip ${file}: not found`);
    continue;
  }
  if (!Array.isArray(rows)) {
    console.error(`skip ${file}: not an array`);
    continue;
  }
  const pool = dbByPass.get(passType) || [];
  for (const r of rows) {
    const n = norm(r.name);
    if (!n) continue;
    const dedupKey = `${passType}|${n}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    let best = null, bestDist = Infinity;
    for (const d of pool) {
      if (d._n === n || d._n.startsWith(n) || n.startsWith(d._n)) {
        best = d; bestDist = 0; break;
      }
      const dist = lev(n, d._n);
      if (dist < bestDist) { best = d; bestDist = dist; }
    }

    const entry = { pass_type: passType, name: r.name, location: r.location, country: r.country };

    if (best && bestDist <= 2) {
      toUpdateExisting.push({ ...entry, matched_id: best.id, matched_name: best.name, dist: bestDist });
    } else {
      if (best && bestDist <= 4) {
        ambiguous.push({ ...entry, candidate_id: best.id, candidate_name: best.name, dist: bestDist });
      }
      toInsert.push(entry);
    }
  }
}

writeFileSync("data/scraped/to-insert.json", JSON.stringify(toInsert, null, 2));
writeFileSync("data/scraped/matched.json", JSON.stringify(toUpdateExisting, null, 2));
writeFileSync("data/scraped/ambiguous.json", JSON.stringify(ambiguous, null, 2));
console.log(`insert: ${toInsert.length}  matched: ${toUpdateExisting.length}  ambiguous: ${ambiguous.length}`);

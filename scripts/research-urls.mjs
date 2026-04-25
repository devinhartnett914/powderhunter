#!/usr/bin/env node
// research-urls.mjs
// For each resort that's missing one or more of these URLs:
//   url, kids_ski_free_url, ski_school_url, ski_school_cost_url, daycare_url
// use Claude Haiku 4.5 + web_search to find them, HEAD-validate, then
// UPDATE the row directly.
//
// Design notes:
//   * Only fields that are currently NULL/empty get filled — existing URLs
//     are never overwritten.
//   * Every proposed URL is HEAD-validated (must return 2xx/3xx). Failures
//     are dropped.
//   * Aux URLs (kids_ski_free etc.) must live on the same eTLD+1 as the
//     main URL, otherwise they're rejected as likely hallucinations. This
//     is a hard-earned lesson from the Epic roster scrape.
//   * Some URL fields are *gated* on a sibling boolean field — see
//     BOOLEAN_GATES. e.g. kids_ski_free_url is only filled when the resort
//     actually has a kids-ski-free policy (kids_ski_free is non-null and
//     not "No"). Without the gate, the model invents URLs for resorts that
//     don't have the policy at all.
//   * Resumable: per-resort results are written to data/scraped/enrich-urls.json
//     as we go. Rerunning skips resorts already in that file.
//   * Hard cost cap (see MAX_COST_USD).
//
// Usage:
//   node scripts/research-urls.mjs                  # all resorts missing URLs
//   node scripts/research-urls.mjs --limit 5        # test mode (5 resorts)
//   node scripts/research-urls.mjs --only Indy      # restrict to one pass
//   node scripts/research-urls.mjs --dry-run        # don't UPDATE the DB

import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const OUTFILE = "data/scraped/enrich-urls.json";
const MODEL = "claude-haiku-4-5-20251001";
const BATCH_SIZE = 3;        // resorts per API call (smaller than daycare — 5 URLs each)
const RATE_LIMIT_MS = 1500;
const MAX_COST_USD = 25;
const MAX_WEB_SEARCHES = 5;  // per API call

const URL_FIELDS = [
  "url",
  "kids_ski_free_url",
  "ski_school_url",
  "ski_school_cost_url",
  "daycare_url",
];

// URL fields that only apply when a sibling field confirms the policy/feature.
// Map: url field → name of the field that gates it.
// Gate-open rule (see gateOpen): boolean is non-null/empty AND not "No".
// Examples of truthy gate values:
//   kids_ski_free: "Under 5", "Under 7", "Included", "Under 13 (Mon-Fri)"
//   daycare:       "Yes", "Yes ($137)", "Yes (CA$65)"
const BOOLEAN_GATES = {
  kids_ski_free_url: "kids_ski_free",
  daycare_url: "daycare",
};

function gateOpen(resort, field) {
  const gate = BOOLEAN_GATES[field];
  if (!gate) return true;
  const v = resort[gate];
  return v !== null && v !== undefined && v !== "" && v !== "No";
}

// --- args ---
const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const onlyIdx = args.indexOf("--only");
const DRY_RUN = args.includes("--dry-run");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null;
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

// --- setup ---
if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing in .env");
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing in .env");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// --- resume state ---
let results = existsSync(OUTFILE) ? JSON.parse(readFileSync(OUTFILE, "utf8")) : [];
const done = new Set(results.map((r) => `${r.id}`));
console.log(`[resume] ${results.length} resorts already processed`);

// --- fetch candidate resorts ---
let { data: all, error } = await supabase
  .from("resorts")
  .select("id, name, location, pass_type, pass_types, kids_ski_free, daycare, url, kids_ski_free_url, ski_school_url, ski_school_cost_url, daycare_url")
  .order("name");
if (error) throw error;

// A field "needs work" only when (a) it's empty AND (b) its gate is open.
// Without the gate check, we'd send the model resorts where the only missing
// field is e.g. kids_ski_free_url on a resort that doesn't have the policy.
const needsWork = all.filter((r) =>
  URL_FIELDS.some((f) => (!r[f] || r[f] === "") && gateOpen(r, f))
);

let resorts = needsWork.filter((r) => !done.has(`${r.id}`));
if (ONLY) {
  resorts = resorts.filter((r) => (r.pass_types || [r.pass_type]).includes(ONLY));
}
if (LIMIT) resorts = resorts.slice(0, LIMIT);

console.log(`[scope] ${needsWork.length} resorts are missing at least one URL`);
console.log(`[plan]  ${resorts.length} to process now (batches of ${BATCH_SIZE})${DRY_RUN ? " [DRY RUN]" : ""}`);

// --- cost tracking (Haiku 4.5: $1/MTok in, $5/MTok out; web search $10/1000) ---
let totalCostUsd = 0;
const estimateCost = (usage, webSearches) =>
  (usage.input_tokens / 1e6) * 1.0 +
  (usage.output_tokens / 1e6) * 5.0 +
  (webSearches / 1000) * 10.0;

const saveCheckpoint = () => writeFileSync(OUTFILE, JSON.stringify(results, null, 2));

// --- URL helpers ---
function etldPlusOne(hostname) {
  // Good-enough heuristic: last two labels for most cases, last three for
  // country-code-TLD with a common SLD (.co.uk, .com.au, etc).
  const labels = hostname.toLowerCase().split(".");
  if (labels.length <= 2) return labels.join(".");
  const last2 = labels.slice(-2).join(".");
  const commonCcSld = new Set(["co", "com", "org", "net", "gov", "ac"]);
  if (labels.length >= 3 && commonCcSld.has(labels[labels.length - 2]) && labels[labels.length - 1].length === 2) {
    return labels.slice(-3).join(".");
  }
  return last2;
}

async function headCheck(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Try HEAD first; some servers 405 HEAD and need GET.
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctrl.signal });
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, { method: "GET", redirect: "follow", signal: ctrl.signal });
    }
    return { ok: res.status >= 200 && res.status < 400, status: res.status, finalUrl: res.url };
  } catch (err) {
    return { ok: false, status: 0, error: err.message.slice(0, 80) };
  } finally {
    clearTimeout(t);
  }
}

// --- prompt ---
const SYSTEM = `You find authoritative web URLs for ski resorts. For each resort given, return up to 5 URLs on the official resort site:

  url                  — the resort's primary public URL (homepage or country-specific landing page)
  kids_ski_free_url    — the page describing the resort's kids-ski-free policy or kids lift-ticket pricing
  ski_school_url       — the page describing children's ski school / lessons
  ski_school_cost_url  — the page listing ski school prices (often the same as ski_school_url if pricing is on one page)
  daycare_url          — the page describing on-mountain daycare/childcare/nursery (NOT ski school)

HARD RULES:
1. Only return a URL if you've confirmed it exists via web_search. DO NOT invent URLs from pattern-matching the resort name.
2. All 5 URLs MUST be on the same domain (the official resort site). Do not return third-party pages (Booking.com, Ski.com, review sites, etc.).
3. If you cannot find a real URL for a field, return null for that field. Null is a valid and expected answer for most resorts — most resorts don't have every page.
4. If the resort has no on-mountain daycare at all (common — e.g., most Epic/Indy partner resorts), return null for daycare_url.
5. If kids-ski-free and lift-ticket pricing are on the same page, use that page for kids_ski_free_url.
6. Prefer English-language pages when a resort has localized versions.

Search strategy per resort:
- First, find the official site. Search for "{resort name} official site" or "{resort name} {state/country}".
- Then look for sections: "Kids", "Family", "Ski School", "Lessons", "Childcare", "Nursery", "Daycare", "Pricing", "Lift Tickets".

OUTPUT FORMAT — CRITICAL:
Your final message MUST end with a JSON array wrapped in <result></result> tags. Each array entry has the five URL fields (nullable) plus "name" and "pass_type" to match back to the input. Example:
<result>
[
  {
    "name": "Example Resort",
    "pass_type": "Ikon",
    "url": "https://www.exampleresort.com/",
    "kids_ski_free_url": "https://www.exampleresort.com/kids-ski-free",
    "ski_school_url": "https://www.exampleresort.com/lessons",
    "ski_school_cost_url": null,
    "daycare_url": null
  }
]
</result>`;

function buildUserPrompt(batch) {
  const list = batch
    .map((r, i) => {
      const passes = (r.pass_types || [r.pass_type]).join(", ");
      const have = URL_FIELDS.filter((f) => r[f] && r[f] !== "").map((f) => `${f}=${r[f]}`);
      const haveStr = have.length ? `\n     already-known: ${have.join(" | ")}` : "";
      const skip = Object.entries(BOOLEAN_GATES)
        .filter(([uf]) => !gateOpen(r, uf))
        .map(([uf, g]) => `${uf} (${g}=${r[g] ?? "null"})`);
      const skipStr = skip.length
        ? `\n     RETURN NULL for: ${skip.join(", ")} — resort lacks the underlying policy/feature`
        : "";
      return `${i + 1}. ${r.name} — ${r.location} — passes: ${passes}${haveStr}${skipStr}`;
    })
    .join("\n");
  return `Find the 5 URLs for each of these ${batch.length} ski resorts. If any URL is already known (listed above), you can use that domain as a hint but you still need to return a value for that field in your output (you can echo the known URL back). For missing URLs, search and return the real page URL or null. If a resort is marked "RETURN NULL for: <field>", do NOT search for or invent a URL for that field — return null.\n\n${list}\n\nReturn results as a JSON array inside <result></result> tags, one entry per resort in the same order.`;
}

// --- main loop ---
for (let i = 0; i < resorts.length; i += BATCH_SIZE) {
  const batch = resorts.slice(i, i + BATCH_SIZE);
  const batchLabel = `${i + 1}-${i + batch.length}/${resorts.length}`;
  console.log(`\n[batch ${batchLabel}] ${batch.map((r) => r.name).join(", ")}`);

  if (totalCostUsd > MAX_COST_USD) {
    console.error(`[abort] cost cap $${MAX_COST_USD} exceeded ($${totalCostUsd.toFixed(2)})`);
    break;
  }

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3072,
      system: SYSTEM,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: MAX_WEB_SEARCHES }],
      messages: [{ role: "user", content: buildUserPrompt(batch) }],
    });
  } catch (err) {
    console.error(`[batch ${batchLabel}] API error:`, err.message);
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    continue;
  }

  const webSearches = response.content.filter(
    (c) => c.type === "server_tool_use" && c.name === "web_search",
  ).length;
  const cost = estimateCost(response.usage, webSearches);
  totalCostUsd += cost;

  const fullText = response.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  let parsed;
  const tagMatch = fullText.match(/<result>\s*([\s\S]*?)\s*<\/result>/i);
  const jsonStr = tagMatch
    ? tagMatch[1].trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : (() => {
        const fb = fullText.indexOf("[");
        const lb = fullText.lastIndexOf("]");
        return fb >= 0 && lb > fb ? fullText.slice(fb, lb + 1) : null;
      })();

  if (!jsonStr) {
    console.error(`[batch ${batchLabel}] no JSON found`);
    continue;
  }
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.error(`[batch ${batchLabel}] JSON parse failed: ${e.message}`);
    continue;
  }
  if (!Array.isArray(parsed)) {
    console.error(`[batch ${batchLabel}] expected array`);
    continue;
  }

  // Process each returned resort
  for (const item of parsed) {
    const orig = batch.find((b) => b.name === item.name) || batch.find((b) => b.name.toLowerCase() === (item.name || "").toLowerCase());
    if (!orig) {
      console.warn(`[batch ${batchLabel}] unmatched: ${item.name}`);
      continue;
    }

    // Determine main-URL domain (prefer existing, fall back to proposed)
    const mainUrl = orig.url || item.url;
    let mainDomain = null;
    if (mainUrl) {
      try { mainDomain = etldPlusOne(new URL(mainUrl).hostname); } catch {}
    }

    // Validate and filter fields
    const toUpdate = {};
    const rowLog = { id: orig.id, name: orig.name, accepted: {}, rejected: {} };

    for (const f of URL_FIELDS) {
      // Skip fields already populated in DB — don't overwrite
      if (orig[f] && orig[f] !== "") continue;
      const proposed = item[f];
      if (!proposed) continue;

      // Gate check: don't fill kids_ski_free_url unless the resort actually
      // has a kids-ski-free policy, etc. The model often proposes plausible
      // URLs for resorts where the underlying feature doesn't exist.
      if (!gateOpen(orig, f)) {
        const gate = BOOLEAN_GATES[f];
        rowLog.rejected[f] = `gate-closed (${gate}=${orig[gate] ?? "null"}): ${proposed}`;
        continue;
      }

      // Basic shape check
      let u;
      try { u = new URL(proposed); } catch {
        rowLog.rejected[f] = `bad url: ${proposed}`;
        continue;
      }
      if (!/^https?:$/.test(u.protocol)) {
        rowLog.rejected[f] = `bad scheme: ${proposed}`;
        continue;
      }

      // Domain sanity: must match mainDomain if we have one
      // (Exception: if this IS the main url and it's the first one we're learning, mainDomain will be set to it.)
      if (mainDomain && f !== "url") {
        const domain = etldPlusOne(u.hostname);
        if (domain !== mainDomain) {
          rowLog.rejected[f] = `cross-domain (${domain} vs ${mainDomain}): ${proposed}`;
          continue;
        }
      }

      // HEAD check
      const chk = await headCheck(proposed);
      if (!chk.ok) {
        rowLog.rejected[f] = `head ${chk.status || chk.error}: ${proposed}`;
        continue;
      }

      toUpdate[f] = proposed;
      rowLog.accepted[f] = proposed;

      // If we just learned the main url, use it as domain anchor for subsequent checks
      if (f === "url" && !mainDomain) {
        try { mainDomain = etldPlusOne(new URL(proposed).hostname); } catch {}
      }
    }

    rowLog.cost = cost / parsed.length;
    results.push(rowLog);

    if (Object.keys(toUpdate).length > 0 && !DRY_RUN) {
      const { error: upErr } = await supabase
        .from("resorts")
        .update(toUpdate)
        .eq("id", orig.id);
      if (upErr) {
        console.error(`  [update-fail id=${orig.id}]`, upErr.message);
      }
    }

    const okKeys = Object.keys(rowLog.accepted);
    const bad = Object.keys(rowLog.rejected);
    console.log(`  id=${orig.id} ${orig.name}: +${okKeys.length} (${okKeys.join(", ") || "none"})${bad.length ? ` / rejected: ${bad.join(", ")}` : ""}`);
  }

  saveCheckpoint();
  console.log(`[batch ${batchLabel}] done. ${webSearches} searches, $${cost.toFixed(4)} (total $${totalCostUsd.toFixed(3)})`);
  await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
}

console.log(`\n[done] ${results.length} total resorts processed. Est. cost: $${totalCostUsd.toFixed(3)}`);
console.log(`[output] ${OUTFILE}`);

#!/usr/bin/env node
// research-daycare.mjs
// Uses Claude + web search to find the minimum childcare age for each resort.
// Writes results incrementally to data/scraped/enrich-daycare.json (resumable).
//
// Usage:
//   node scripts/research-daycare.mjs                  # run all resorts
//   node scripts/research-daycare.mjs --limit 5        # test mode (5 resorts)
//   node scripts/research-daycare.mjs --only ClubMed   # only one pass_type
//
// Env required: ANTHROPIC_API_KEY, PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY

import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const OUTFILE = "data/scraped/enrich-daycare.json";
const MODEL = "claude-haiku-4-5-20251001";
const BATCH_SIZE = 5;        // resorts per API call
const RATE_LIMIT_MS = 1000;  // pause between calls
const MAX_COST_USD = 15;     // abort if est. spend exceeds this
const MAX_WEB_SEARCHES = 3;  // per API call

// --- parse args ---
const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const onlyIdx = args.indexOf("--only");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null;
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

// --- setup clients ---
if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing in .env");
if (!process.env.PUBLIC_SUPABASE_URL) throw new Error("PUBLIC_SUPABASE_URL missing in .env");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.PUBLIC_SUPABASE_ANON_KEY,
);

// --- load existing results (resumable) ---
let results = existsSync(OUTFILE) ? JSON.parse(readFileSync(OUTFILE, "utf8")) : [];
const done = new Set(results.map((r) => `${r.pass_type}|${r.name}|${r.location}`));
console.log(`[resume] ${results.length} resorts already researched`);

// --- fetch resorts from Supabase ---
let { data: resorts, error } = await supabase
  .from("resorts")
  .select("name, pass_type, location, url")
  .order("pass_type")
  .order("name");
if (error) throw error;

if (ONLY) resorts = resorts.filter((r) => r.pass_type === ONLY);
resorts = resorts.filter((r) => !done.has(`${r.pass_type}|${r.name}|${r.location}`));
if (LIMIT) resorts = resorts.slice(0, LIMIT);

console.log(`[plan] ${resorts.length} resorts to research (batches of ${BATCH_SIZE})`);

// --- cost tracking ---
// Haiku 4.5: $1/MTok input, $5/MTok output. Web search: $10/1000 searches.
let totalCostUsd = 0;
const estimateCost = (usage, webSearches = 0) => {
  const inCost = (usage.input_tokens / 1_000_000) * 1.0;
  const outCost = (usage.output_tokens / 1_000_000) * 5.0;
  const searchCost = (webSearches / 1000) * 10.0;
  return inCost + outCost + searchCost;
};

const saveResults = () => writeFileSync(OUTFILE, JSON.stringify(results, null, 2));

// --- prompt ---
const SYSTEM = `You research the minimum age accepted by on-mountain or resort-attached CHILDCARE / DAYCARE / NURSERY programs at ski resorts. This is NON-SKIING supervised care for babies and toddlers — the age a parent can drop off a child while they ski.

CRITICAL: This is NOT ski school. Ski school teaches children to ski (usually starts age 3+). Daycare/childcare is non-skiing babysitting. Many ski resorts have one but not the other. If a page only describes ski lessons, it is NOT the answer — keep searching for "nursery", "daycare", "childcare", "kids club".

MANY RESORTS DO NOT HAVE ON-MOUNTAIN DAYCARE. If after searching you cannot find evidence of an actual on-mountain or resort-operated daycare/nursery program, answer "None". Do not fabricate a program that doesn't exist.

Pass-type specific notes:
- Club Med resorts: some offer Baby Club Med (4 months+), some start at Petit Club Med (2 years), and some don't include on-site childcare at all. DO NOT assume — check the specific resort's Club Med page for which kids' clubs it runs. Look for "Baby Club Med" listed as available at that specific resort.
- Other resorts: search "{resort name} daycare", "{resort name} nursery", "{resort name} childcare", "{resort name} kids club". The program should be operated by or partnered with the resort, not a random off-mountain babysitter.

Search strategy:
- Start with the official resort website if provided.
- Look for dedicated childcare/daycare/nursery pages, not ski school pages.
- Look for phrases like "from {age}", "ages {X} to {Y}", "minimum age", "infants", "toddlers".
- If the only mention of young children is in the context of ski lessons, the answer is likely "None".

Answer format:
- "{N} {unit}" with unit = "weeks", "months", or "years" (e.g. "4 months", "18 months", "3 years").
- "None" if the resort has no on-mountain/resort-operated daycare.
- "Unknown" if you genuinely cannot determine it after searching. Do NOT guess.

OUTPUT FORMAT — CRITICAL:
Your final message MUST end with a JSON array wrapped in <result></result> tags. Brief reasoning before the tags is fine, but the tags must contain only valid JSON. Example:
<result>
[{"name": "Foo Resort", "pass_type": "Ikon", "daycare_min_age": "6 months", "source_url": "https://..."}]
</result>`;

const buildUserPrompt = (batch) => {
  const list = batch
    .map((r, i) => `${i + 1}. ${r.name} (${r.pass_type}, ${r.location})${r.url ? ` — ${r.url}` : ""}`)
    .join("\n");
  return `Research the minimum on-mountain childcare age for these ${batch.length} ski resorts. Remember: many resorts have no on-mountain daycare at all — "None" is a common and valid answer. Do NOT confuse ski school with daycare.\n\n${list}\n\nReturn results as a JSON array inside <result></result> tags, one entry per resort in the same order.`;
};

// --- main loop ---
for (let i = 0; i < resorts.length; i += BATCH_SIZE) {
  const batch = resorts.slice(i, i + BATCH_SIZE);
  const batchLabel = `${i + 1}-${i + batch.length}/${resorts.length}`;
  console.log(`\n[batch ${batchLabel}] ${batch.map((r) => r.name).join(", ")}`);

  if (totalCostUsd > MAX_COST_USD) {
    console.error(`[abort] cost cap $${MAX_COST_USD} exceeded ($${totalCostUsd.toFixed(2)})`);
    break;
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: MAX_WEB_SEARCHES }],
      messages: [{ role: "user", content: buildUserPrompt(batch) }],
    });

    // Extract final text block (should be JSON)
    const textBlock = response.content.filter((c) => c.type === "text").pop();
    if (!textBlock) {
      console.error(`[batch ${batchLabel}] no text in response; skipping`);
      continue;
    }

    // Count server-side web searches
    const webSearches = response.content.filter(
      (c) => c.type === "server_tool_use" && c.name === "web_search",
    ).length;

    const cost = estimateCost(response.usage, webSearches);
    totalCostUsd += cost;

    // Extract JSON: prefer <result>...</result> tag; fall back to first [...] block
    const fullText = response.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
    let jsonStr = null;
    const tagMatch = fullText.match(/<result>\s*([\s\S]*?)\s*<\/result>/i);
    if (tagMatch) {
      jsonStr = tagMatch[1].trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    } else {
      // Fallback: grab first [ to matching last ]
      const firstBracket = fullText.indexOf("[");
      const lastBracket = fullText.lastIndexOf("]");
      if (firstBracket >= 0 && lastBracket > firstBracket) {
        jsonStr = fullText.slice(firstBracket, lastBracket + 1);
      }
    }
    if (!jsonStr) {
      console.error(`[batch ${batchLabel}] no JSON found in response`);
      console.error(`text: ${fullText.slice(0, 400)}`);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.error(`[batch ${batchLabel}] JSON parse failed: ${e.message}`);
      console.error(`raw: ${jsonStr.slice(0, 300)}`);
      continue;
    }

    if (!Array.isArray(parsed)) {
      console.error(`[batch ${batchLabel}] expected array, got ${typeof parsed}`);
      continue;
    }

    // Merge with original location (Claude may not echo it back)
    for (const item of parsed) {
      const match = batch.find((b) => b.name === item.name && b.pass_type === item.pass_type);
      if (!match) {
        console.warn(`[batch ${batchLabel}] unmatched in response: ${item.name}`);
        continue;
      }
      results.push({
        name: match.name,
        pass_type: match.pass_type,
        location: match.location,
        daycare_min_age: item.daycare_min_age || "Unknown",
        source_url: item.source_url || null,
      });
    }

    saveResults();
    console.log(
      `[batch ${batchLabel}] done. ${webSearches} searches, $${cost.toFixed(4)} (total $${totalCostUsd.toFixed(3)})`,
    );
  } catch (err) {
    console.error(`[batch ${batchLabel}] error:`, err.message);
  }

  await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
}

console.log(`\n[done] ${results.length} total resorts researched. Est. cost: $${totalCostUsd.toFixed(3)}`);
console.log(`[output] ${OUTFILE}`);

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load env vars
const envPath = resolve(process.cwd(), ".env");
const envContent = readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const supabase = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Load prototype data with URLs
const protoResorts = JSON.parse(readFileSync("/tmp/prototype-resorts.json", "utf-8"));

// Build a lookup: name+pass_type -> URLs
const urlLookup: Record<string, any> = {};
for (const r of protoResorts) {
  const key = `${r.name}|${r.pass}`;
  urlLookup[key] = {
    url: r.url || null,
    kids_ski_free_url: r.kidsSkiFreeUrl || null,
    ski_school_url: r.skiSchoolUrl || null,
    ski_school_cost_url: r.skiSchoolCostUrl || null,
    daycare_url: r.daycareUrl || null,
  };
}

async function main() {
  // Fetch all resorts from DB
  const { data: dbResorts, error } = await supabase.from("resorts").select("id, name, pass_type");
  if (error) { console.error("Fetch error:", error.message); process.exit(1); }

  let updated = 0;
  let missing = 0;

  for (const resort of dbResorts!) {
    const key = `${resort.name}|${resort.pass_type}`;
    const urls = urlLookup[key];

    if (urls) {
      const { error: updateError } = await supabase
        .from("resorts")
        .update(urls)
        .eq("id", resort.id);

      if (updateError) {
        console.error(`  Error updating ${resort.name}:`, updateError.message);
      } else {
        updated++;
      }
    } else {
      missing++;
      console.log(`  No URL data for: ${resort.name} (${resort.pass_type})`);
    }
  }

  console.log(`\nUpdated: ${updated}, Missing URL data: ${missing}`);
}

main().catch(console.error);

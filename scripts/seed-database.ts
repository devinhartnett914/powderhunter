import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import { readFileSync } from "fs";
import { resolve } from "path";
import { resortCoords } from "./resort-coordinates.js";

// Load env vars
const envPath = resolve(process.cwd(), ".env");
const envContent = readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const supabaseUrl = env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE env vars in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

function parseCost(val: string | undefined): number | null {
  if (!val) return null;
  const match = String(val).match(/[\d,]+/);
  return match ? parseInt(match[0].replace(",", "")) : null;
}

function lookupCoords(name: string, location: string): { lat: number; lng: number } | null {
  // Direct match
  if (resortCoords[name]) return resortCoords[name];
  // Try with state/province suffix for duplicates (e.g. "Hidden Valley" -> "Hidden Valley (PA)")
  const withLocation = `${name} (${location})`;
  if (resortCoords[withLocation]) return resortCoords[withLocation];
  return null;
}

async function main() {
  // Read Excel
  const wb = XLSX.readFile(resolve(process.cwd(), "data/ski-resorts.xlsx"));
  const allResorts: any[] = [];

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
    for (const row of rows as any[]) {
      const name = row["Resort"];
      const location = row["Location"];
      const coords = lookupCoords(name, location);

      allResorts.push({
        name,
        pass_type: row["Pass"],
        location,
        acreage: row["Total Acreage"] || null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        kids_ski_free: row["Kids Ski Free?"] || null,
        ski_school_min_age: row["Ski School Min Age"] || null,
        ski_school_max_cost: parseCost(row["Max Ski School Cost Per Day"]),
        daycare: row["On-Mountain Daycare"] || null,
        baby_club_med: row["Baby Club Med"] === "Yes" ? true : row["Baby Club Med"] === "No" ? false : null,
        closest_airport: row["Closest Airport & Flights"] || null,
        closest_airport_distance: row["Distance"] || null,
        major_airport:
          row["Closest Major Airport & Flights"] === "-"
            ? null
            : row["Closest Major Airport & Flights"] || null,
        major_airport_distance:
          row["Distance_1"] === "-" ? null : row["Distance_1"] || null,
      });
    }
  }

  console.log(`Read ${allResorts.length} resorts from Excel.`);

  const withCoords = allResorts.filter(r => r.lat !== null);
  const withoutCoords = allResorts.filter(r => r.lat === null);
  console.log(`Coordinates found: ${withCoords.length}/${allResorts.length}`);
  if (withoutCoords.length > 0) {
    console.log(`Missing coordinates for:`);
    withoutCoords.forEach(r => console.log(`  - ${r.name} (${r.location})`));
  }

  // Clear existing data and insert
  console.log("\nClearing existing data...");
  await supabase.from("resorts").delete().neq("id", 0);

  console.log("Inserting resorts...");
  for (let i = 0; i < allResorts.length; i += 50) {
    const batch = allResorts.slice(i, i + 50);
    const { error } = await supabase.from("resorts").insert(batch);
    if (error) {
      console.error(`Error inserting batch at index ${i}:`, error.message);
      if (error.message.includes("relation") && error.message.includes("does not exist")) {
        console.error("\nThe 'resorts' table does not exist yet. Create it in the Supabase SQL Editor first.");
        process.exit(1);
      }
    } else {
      console.log(`  Inserted ${Math.min(i + 50, allResorts.length)}/${allResorts.length}`);
    }
  }

  console.log("\nDone! All resorts seeded.");
}

main().catch(console.error);

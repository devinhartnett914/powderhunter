# Ski Resort Comparison Project — Memory File

## What We Built
- **Excel spreadsheet** (`ski-resorts.xlsx`) — 5 tabs, **201 resort entries** total
  - Ikon (49), Epic (36), Indy (75), Mountain Collective (21), Club Med (20)
- **Interactive webapp** (`index.html`) — single-file, Google Maps API powered, all 200 resorts embedded

## Excel Structure
**4 ski-pass tabs (Ikon/Epic/Indy/MC) share columns:**
Pass | Resort | Location | Total Acreage | Kids Ski Free? | Ski School Min Age | Max Ski School Cost Per Day | On-Mountain Daycare | Closest Airport & Flights | Distance | Closest Major Airport & Flights | Distance

**Club Med tab (custom — all-inclusive):**
Pass | Resort | Location | Total Acreage | Ski School Min Age | Baby Club Med | Closest Airport & Flights | Distance | Closest Major Airport & Flights | Distance

- Airport flight links live on the airport name cells (click → Google Flights from WAS)
- Hyperlinks on every data column where applicable (100% coverage)
- Sorted by acreage descending, freeze panes A2, auto-filter, alternating row shading

## This Session's Work
1. **Mountain Collective tab** — 21 North American resorts, same column structure/quality as Ikon/Epic/Indy
2. **Club Med tab** — 20 global ski resorts with custom columns (no Kids Ski Free / Max Cost since all-inclusive). Added Baby Club Med Yes/No with hyperlinks to each resort's childcare page
   - **Baby Club Med correction**: First pass was wrong. User caught Tignes (No, not Yes). Re-researched all 20. Final: 13 Yes / 7 No. No: Tignes, Val Thorens Sensations, Sahoro, Tomamu, Kiroro Peak, Beidahu, Changbaishan
3. **Renamed file** Ikon_Pass_Resorts.xlsx → `ski-resorts.xlsx`
4. **Built webapp** (`index.html`, ~133KB single file):
   - Enter address + max drive hours → finds resorts within range
   - Enter travel dates → Google Flights links pre-filled with departing/returning
   - Google Maps JS API: client-side Geocoder + Distance Matrix (batched 25/call)
   - Haversine pre-filter (×1.5 buffer) before Distance Matrix to limit API calls
   - All 187 unique resort lat/lng hardcoded (sandbox couldn't geocode)
   - Filter chips: Pass / Has Daycare / Kids Ski Free
   - Sort: drive time (default), pass, name, location, acreage, kids free, ski school age
   - Drive time color-coded: green ≤4hr, orange ≤6hr, red >6hr
   - API key embedded: `AIzaSyACDBsRJZ9JQptwxnWQpYawhjjfS8IQa4`
5. **Netlify deploy attempted but blocked** — npm registry blocked in sandbox (`netlify-cli` and `@netlify/mcp` both 403). User will deploy from their machine.

## Files
Final deliverables now live in `Powder Hunter/` at the top of Google Drive:
- `Powder Hunter/ski-resorts.xlsx` — final spreadsheet
- `Powder Hunter/index.html` — single-file webapp prototype
- `Powder Hunter/ski-resort-guide.html` — companion guide
- `Powder Hunter/ski-resort-project-notes.md` — this memory file

Build artifacts (only in the original sandbox session `busy-admiring-sagan`, not copied out — recreate if needed):
- `resorts_for_webapp.json` — structured 200-entry dataset
- `resort_data_raw.json` — raw extract w/ hyperlinks
- `build_mc_tab.py`, `build_clubmed_tab.py` — build scripts

## Known Issues
- **Sandbox network egress**: clubmed.us, googleapis.com, npm registry all blocked from server-side fetches
- **Geocoding**: must be done client-side (sandbox 403); resort coords hardcoded from training knowledge
- **Distance Matrix**: 25 destination max per call → batched

## User Preferences
- Home airports: WAS (all DC area)
- Focus: family ski trips (kids ski free, ski school, daycare/Baby Club Med key columns)
- Full-day group lesson max rates for ski school costs
- Hyperlinks to source pages on every column
- Clean merged columns (flights live on airport name)

## Data Sources & Compilation Methodology
**Gap warning:** This section was reconstructed after the fact — earlier sessions did not record per-field provenance. Treat as partial.

**Resort lists (which resorts belong to each pass):**
- Ikon, Epic, Indy, Mountain Collective: compiled from each pass's official destinations page (linked from the Pass column hyperlinks in the spreadsheet). Need to re-verify URLs are still canonical before any auto-refresh.
- Club Med: 20 global ski resorts pulled from clubmed.us — note clubmed.us was blocked from sandbox fetches, so this list was assembled from training knowledge + per-resort page hyperlinks the user could verify manually.

**Per-resort fields:**
- Total Acreage, Ski School Min Age, Max Ski School Cost/Day, On-Mountain Daycare, Kids Ski Free?: sourced from each resort's own website (hyperlinks live on the relevant cells). Mix of automated extraction and manual lookup — not currently distinguishable in the file.
- Baby Club Med Yes/No: hand-researched per resort. First pass had errors (Tignes was wrong); user caught it, all 20 were re-verified. Final ground truth: 13 Yes / 7 No (No: Tignes, Val Thorens Sensations, Sahoro, Tomamu, Kiroro Peak, Beidahu, Changbaishan).
- Closest Airport / Major Airport + Distance: derived, not scraped. Method not recorded — likely training-knowledge lookups, not a routing API.
- Resort lat/lng (used by webapp): hardcoded from training knowledge because sandbox couldn't reach googleapis.com to geocode. NOT a reliable refresh source.

**Known fragility for an auto-updating pipeline:**
- No stored canonical source URL per (resort, field) — only column-level hyperlinks
- Acreage / kids-ski-free / ski school pricing change yearly and have no structured feed
- Pass rosters change between seasons (resorts added/dropped) — needs a diff step
- Sandbox network egress blocks (clubmed.us, googleapis.com, npm) will need to be solved on the deploy target, not in-session

## Next Steps
- Port webapp to a proper multi-file project structure for further development & deploy
- User to set up Netlify space and deploy
- **For the "frequently updating" webapp:** design a refresh job that (1) re-scrapes each pass's resort list from a recorded source URL, (2) per-resort scrapes the small set of volatile fields, (3) uses a real geocoder instead of hardcoded lat/lng, (4) writes to a database/JSON the webapp reads at runtime instead of bundling data into HTML. Record source URLs in this file as they're identified.

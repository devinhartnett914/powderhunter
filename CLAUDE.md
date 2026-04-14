# Powder Hunter — Ski Resort Finder

## Project
Family ski trip planning webapp. 201 resorts across 5 ski passes (Ikon, Epic, Indy, Mountain Collective, Club Med). Users enter their address and travel dates to find resorts within driving distance, with Google Flights links for flying options.

## Stack
- **Astro 4.x** with Netlify adapter (server-rendered)
- **Vanilla CSS + JS** for frontend interactivity
- **Supabase** PostgreSQL for resort data (anon read-only via RLS)
- **Netlify Functions** for Google Maps API proxy
- **Netlify** hosting at powderhunter.devinhartnett.com

## Key Architecture
- All 200 resorts fetched from Supabase on page load, filtered/sorted client-side
- Google Maps Distance Matrix + Geocoding proxied through Netlify Functions (API key server-side)
- Google Places Autocomplete runs client-side with a restricted API key
- Resort data seeded from `data/ski-resorts.xlsx` via `scripts/seed-database.ts`

## Data Model
Single `resorts` table with: name, pass_type, url, location, acreage, lat, lng, kids_ski_free, ski_school_min_age, ski_school_max_cost, daycare, baby_club_med, airport fields, and URL columns for source links.

## Environment Variables
- `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` — safe to expose (RLS read-only)
- `SUPABASE_SERVICE_ROLE_KEY` — seed script only, never expose
- `GOOGLE_MAPS_API_KEY` — server-side only (Netlify Functions)
- `PUBLIC_GOOGLE_MAPS_CLIENT_KEY` — referrer-restricted client key (Places only)

## Commands
- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run seed` — seed Supabase from Excel

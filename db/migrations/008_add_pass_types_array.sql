-- Migration 008: introduce pass_types text[] so one mountain can belong to
-- multiple passes instead of duplicating the row.
--
-- Run order:
--   1. Paste this file in the Supabase SQL editor and run it.
--   2. Then run `node scripts/merge-cross-pass-dupes.mjs` locally to collapse
--      the 20 existing duplicate rows into one per mountain.
--   3. Then paste migration 009 (swap unique index) in the SQL editor.
--
-- The old `pass_type` column stays in place for now — both columns coexist
-- until the scraper + UI have moved over, then 010 drops `pass_type`.

ALTER TABLE resorts
  ADD COLUMN IF NOT EXISTS pass_types text[] NOT NULL DEFAULT '{}';

-- Backfill pass_types from the existing single pass_type column for rows
-- that haven't been touched yet. Safe to re-run.
UPDATE resorts
SET pass_types = ARRAY[pass_type]
WHERE cardinality(pass_types) = 0
  AND pass_type IS NOT NULL;

-- Sanity: nothing should be left with an empty pass_types.
DO $$
DECLARE
  empties integer;
BEGIN
  SELECT count(*) INTO empties FROM resorts WHERE cardinality(pass_types) = 0;
  IF empties > 0 THEN
    RAISE WARNING 'resorts with empty pass_types: %', empties;
  END IF;
END $$;

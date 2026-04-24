-- Migration 009: swap the resorts unique key from (name, pass_type, location)
-- to (lower(name), lower(location)) now that one mountain = one row and
-- pass_types holds the set of passes.
--
-- Prereqs:
--   * 008 has run (pass_types column exists).
--   * scripts/merge-cross-pass-dupes.mjs --apply has run (no more dupes).
--
-- Run this only AFTER the dedupe script has completed successfully, otherwise
-- the unique index creation will fail on the remaining duplicates.

DROP INDEX IF EXISTS resorts_name_pass_location_idx;

CREATE UNIQUE INDEX IF NOT EXISTS resorts_name_location_idx
  ON resorts (lower(name), lower(location));

-- Verify:
--   SELECT name, location, count(*) FROM resorts
--   GROUP BY lower(name), lower(location) HAVING count(*) > 1;
-- Should return zero rows.

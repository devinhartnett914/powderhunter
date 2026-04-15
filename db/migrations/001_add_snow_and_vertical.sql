-- Migration: add fields for daily snow data, vertical drop, and pipeline observability.
-- Run in the Supabase SQL Editor (dashboard → SQL → New query → paste → Run).
-- Safe to run more than once: uses IF NOT EXISTS / CREATE TABLE IF NOT EXISTS.

-- -----------------------------------------------------------------------------
-- resorts: new columns
-- -----------------------------------------------------------------------------

ALTER TABLE resorts
  ADD COLUMN IF NOT EXISTS vertical_ft           integer,
  ADD COLUMN IF NOT EXISTS snowfall_24h_in       integer,
  ADD COLUMN IF NOT EXISTS base_depth_in         integer,
  ADD COLUMN IF NOT EXISTS seasonal_snowfall_in  integer,
  ADD COLUMN IF NOT EXISTS snow_updated_at       timestamptz,
  ADD COLUMN IF NOT EXISTS static_updated_at     timestamptz,
  ADD COLUMN IF NOT EXISTS onthesnow_slug        text,
  ADD COLUMN IF NOT EXISTS removed_from_pass_at  timestamptz;

-- Unique natural key so scrapers can upsert without duplicating rows.
-- Name alone isn't unique (e.g. two different "Hidden Valley" resorts in
-- different states both on the Epic pass). Location (state/province) is
-- the natural tiebreaker.
CREATE UNIQUE INDEX IF NOT EXISTS resorts_name_pass_location_idx
  ON resorts (name, pass_type, location);

-- -----------------------------------------------------------------------------
-- pipeline_runs: observability for scheduled scraper jobs
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id                bigserial PRIMARY KEY,
  job               text NOT NULL,             -- e.g. 'snow_daily', 'roster_monthly'
  pass              text,                      -- e.g. 'Ikon', 'Epic', nullable for shared jobs
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  status            text NOT NULL DEFAULT 'running',  -- running | ok | partial | error
  resorts_updated   integer DEFAULT 0,
  resorts_failed    integer DEFAULT 0,
  error_message     text
);

CREATE INDEX IF NOT EXISTS pipeline_runs_started_at_idx
  ON pipeline_runs (started_at DESC);

-- RLS: anon should NOT read pipeline_runs (it's ops data, not user-facing).
-- Service role bypasses RLS so scheduled functions can still write.
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
-- No policies = no anon access. Service role still has full access.

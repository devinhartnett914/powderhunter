-- 006_add_daycare_min_age.sql
-- Add minimum childcare age column (text to handle "4 months", "18 months", "2 years", etc.)

ALTER TABLE resorts ADD COLUMN IF NOT EXISTS daycare_min_age text;
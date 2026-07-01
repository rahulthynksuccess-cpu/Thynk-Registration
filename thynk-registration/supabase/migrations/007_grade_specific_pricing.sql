-- ============================================================
-- Migration: 007_grade_specific_pricing.sql
-- Adds grade-specific pricing columns to the projects table.
--
-- grade_prices_inr  JSONB  — map of { "Grade Name": <amount_in_paise> }
-- grade_prices_usd  JSONB  — map of { "Grade Name": <amount_in_cents> }
--
-- A NULL value means flat pricing (use base_amount_inr / base_amount_usd).
-- A populated JSONB object activates per-grade pricing for that currency.
--
-- Example:
--   grade_prices_inr = {
--     "Grade 1": 120000,   -- ₹1200 in paise
--     "Grade 5": 150000,   -- ₹1500 in paise
--     "Grade 9": 180000    -- ₹1800 in paise
--   }
-- ============================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS grade_prices_inr JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS grade_prices_usd JSONB DEFAULT NULL;

-- Optional: GIN indexes for fast key-lookup inside the JSONB (useful if you
-- ever query "all projects that have a price for Grade 5"):
CREATE INDEX IF NOT EXISTS idx_projects_grade_prices_inr ON projects USING GIN (grade_prices_inr);
CREATE INDEX IF NOT EXISTS idx_projects_grade_prices_usd ON projects USING GIN (grade_prices_usd);

-- Helpful comment on the columns for future developers
COMMENT ON COLUMN projects.grade_prices_inr IS
  'Per-grade pricing in paise (INR). Keys = grade names, values = amount in paise. NULL = use base_amount_inr for all grades.';
COMMENT ON COLUMN projects.grade_prices_usd IS
  'Per-grade pricing in US cents (USD). Keys = grade names, values = amount in cents. NULL = use base_amount_usd for all grades.';

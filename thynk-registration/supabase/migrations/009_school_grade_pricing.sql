-- ============================================================
-- Migration: 009_school_grade_pricing.sql
-- Adds SCHOOL-level grade/class-wise pricing overrides.
--
-- Context: migration 007 added grade_prices_inr / grade_prices_usd
-- on the `projects` (program) table. That was only ever a
-- *program-level* default and was never actually surfaced or used
-- for a specific school's checkout, because every school always
-- gets a flat `pricing.base_amount` row on creation, and that flat
-- row always took priority over the program's grade prices.
--
-- This migration adds the same JSONB shape directly on the
-- `pricing` table so every school can have its OWN class-wise
-- price list (seeded from the program's grade prices when the
-- school is created, and independently editable afterwards).
--
-- Resolution order used by the app (see app/api/register/route.ts
-- and components/registration/RegistrationCard.tsx):
--   1. pricing.grade_prices_inr / _usd[selectedGrade]  (school override)
--   2. pricing.base_amount                              (school flat fee)
-- ============================================================

ALTER TABLE pricing
  ADD COLUMN IF NOT EXISTS grade_prices_inr JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS grade_prices_usd JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_pricing_grade_prices_inr ON pricing USING GIN (grade_prices_inr);
CREATE INDEX IF NOT EXISTS idx_pricing_grade_prices_usd ON pricing USING GIN (grade_prices_usd);

COMMENT ON COLUMN pricing.grade_prices_inr IS
  'School-specific per-grade pricing in paise (INR). Keys = grade names, values = amount in paise. NULL/empty = use flat base_amount for all grades.';
COMMENT ON COLUMN pricing.grade_prices_usd IS
  'School-specific per-grade pricing in US cents (USD). Keys = grade names, values = amount in cents. NULL/empty = use flat base_amount for all grades.';

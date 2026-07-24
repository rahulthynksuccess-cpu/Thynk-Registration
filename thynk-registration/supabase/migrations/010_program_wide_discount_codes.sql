-- ============================================================
-- Migration: 010_program_wide_discount_codes.sql
--
-- Previously every discount code had to be tied to exactly one school
-- (discount_codes.school_id was NOT NULL). Since the same code is often
-- meant to apply across every school running a given program, this adds
-- a project_id (program) scope as an alternative to school_id, so a code
-- can be created ONCE for a program and used at any school under it.
--
-- Resolution order used by the app (see app/api/register/route.ts):
--   1. A code scoped to this specific school (school_id = <school>)
--   2. A code scoped to the school's program (project_id = <program>)
-- ============================================================

-- 1. Allow school_id to be empty when a code is program-scoped instead.
ALTER TABLE discount_codes
  ALTER COLUMN school_id DROP NOT NULL;

-- 2. Add the program (project) scope column.
ALTER TABLE discount_codes
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;

-- 3. Every code must be scoped to exactly one of school_id / project_id.
ALTER TABLE discount_codes
  DROP CONSTRAINT IF EXISTS discount_codes_scope_check;
ALTER TABLE discount_codes
  ADD CONSTRAINT discount_codes_scope_check
  CHECK (
    (school_id IS NOT NULL AND project_id IS NULL) OR
    (school_id IS NULL AND project_id IS NOT NULL)
  );

-- 4. Replace the old single-scope unique constraint with two partial unique
--    indexes — one per scope — so the same code text can exist once per
--    school AND once per program without colliding.
ALTER TABLE discount_codes
  DROP CONSTRAINT IF EXISTS discount_codes_school_id_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_discount_codes_school_scope
  ON discount_codes(school_id, code) WHERE school_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_discount_codes_project_scope
  ON discount_codes(project_id, code) WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discount_codes_project_lookup
  ON discount_codes(project_id, code, is_active) WHERE project_id IS NOT NULL;

-- 5. Update usage-tracking function to find the right row regardless of scope:
--    prefer an exact school-scoped code, otherwise fall back to the program-
--    scoped code for that school's program.
CREATE OR REPLACE FUNCTION decrement_discount_usage(p_payment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_code       text;
  v_school     uuid;
  v_project    uuid;
BEGIN
  SELECT discount_code, school_id
  INTO   v_code, v_school
  FROM   payments
  WHERE  id = p_payment_id AND discount_code IS NOT NULL;

  IF v_code IS NULL THEN
    RETURN;
  END IF;

  -- Try the school-scoped code first
  UPDATE discount_codes
  SET    used_count = used_count + 1
  WHERE  school_id = v_school AND code = v_code;

  IF FOUND THEN
    RETURN;
  END IF;

  -- Fall back to the program-scoped code for this school's program
  SELECT project_id INTO v_project FROM schools WHERE id = v_school;

  IF v_project IS NOT NULL THEN
    UPDATE discount_codes
    SET    used_count = used_count + 1
    WHERE  project_id = v_project AND code = v_code;
  END IF;
END;
$$;

-- 6. RLS: admins should also be able to see program-scoped codes for
--    programs that include at least one school they have access to.
DROP POLICY IF EXISTS "discount_codes_select" ON discount_codes;
CREATE POLICY "discount_codes_select" ON discount_codes FOR SELECT
  USING (
    school_id IN (SELECT accessible_school_ids())
    OR project_id IN (
      SELECT DISTINCT project_id FROM schools
      WHERE id IN (SELECT accessible_school_ids()) AND project_id IS NOT NULL
    )
  );

COMMENT ON COLUMN discount_codes.school_id IS
  'Set when this code applies to ONE specific school only. Mutually exclusive with project_id.';
COMMENT ON COLUMN discount_codes.project_id IS
  'Set when this code applies across EVERY school running this program. Mutually exclusive with school_id.';

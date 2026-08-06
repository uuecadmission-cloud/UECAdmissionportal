-- ============================================================
-- UEC Admission Portal — Migration SQL: Add updated_score Columns
-- Run this script in: Supabase Dashboard > SQL Editor
-- Date: 2026-08-06
-- ============================================================

-- 1. Add new columns for Student High School Score updates (preserving original 'score' as history)
ALTER TABLE public.applications 
  ADD COLUMN IF NOT EXISTS updated_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS updated_score_at TIMESTAMPTZ;

-- 2. Allow anonymous students to update their score via update_score.html page
DROP POLICY IF EXISTS "Allow student score update" ON public.applications;

CREATE POLICY "Allow student score update"
  ON public.applications
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- 3. Verify columns were created:
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'applications' 
  AND column_name IN ('score', 'updated_score', 'updated_score_at');

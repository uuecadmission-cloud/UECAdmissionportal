-- ============================================================
-- UEC Admission Portal — Supabase Security Remediation SQL
-- Run this in: Supabase Dashboard > SQL Editor
-- Date: 2026-07-30
-- ============================================================

-- ============================================================
-- STEP 1: Enable RLS on the applications table
-- ============================================================

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 2: Drop any old policies first (safe to run even if they don't exist)
-- ============================================================

DROP POLICY IF EXISTS "Allow public insert" ON public.applications;
DROP POLICY IF EXISTS "Allow public select for duplicate check" ON public.applications;
DROP POLICY IF EXISTS "Allow authenticated admins full access" ON public.applications;

-- ============================================================
-- STEP 3: Create new RLS policies
-- ============================================================

-- POLICY A: Anyone (anon/public) can INSERT a new application
-- This is required for the public admission form to work
CREATE POLICY "Allow public insert"
  ON public.applications
  FOR INSERT
  WITH CHECK (true);

-- POLICY B: Anyone (anon/public) can SELECT applications
-- This is required for the duplicate-check and app ID fetch on the form
-- Note: We scope this to SELECT only — anon users cannot UPDATE or DELETE
CREATE POLICY "Allow public select for duplicate check"
  ON public.applications
  FOR SELECT
  USING (true);

-- POLICY C: Authenticated admins have full access (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Allow authenticated admins full access"
  ON public.applications
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- STEP 3b: CRITICAL FIX — Block anon DELETE and UPDATE
-- Discovered during live testing: anon users could delete records.
-- These explicit DENY policies prevent that.
-- ============================================================

DROP POLICY IF EXISTS "Deny anon delete" ON public.applications;
DROP POLICY IF EXISTS "Deny anon update" ON public.applications;

-- Block anon from deleting any application
-- AS RESTRICTIVE: AND-ed with other policies (not OR-ed), so SELECT USING(true) won't override this
CREATE POLICY "Deny anon delete"
  ON public.applications
  AS RESTRICTIVE
  FOR DELETE
  TO anon
  USING (false);

-- Block anon from updating any application
CREATE POLICY "Deny anon update"
  ON public.applications
  AS RESTRICTIVE
  FOR UPDATE
  TO anon
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- STEP 4: Storage bucket policies for 'documents' bucket
-- ============================================================
-- Run these AFTER updating and deploying the new index.html code.
-- These allow applicants to upload but require auth to download.

-- Allow anyone (public form) to upload documents
CREATE POLICY "Allow public document upload"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'documents');

-- Allow only authenticated admins to read/download documents
CREATE POLICY "Allow authenticated document download"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'documents');

-- Allow authenticated admins to delete documents
CREATE POLICY "Allow authenticated document delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'documents');

-- ============================================================
-- STEP 5: Make the 'documents' bucket private
-- Run this LAST, only after the code changes are deployed and tested
-- ============================================================

-- UPDATE storage.buckets SET public = false WHERE id = 'documents';

-- ============================================================
-- VERIFICATION QUERIES — Run after applying to confirm policies
-- ============================================================

-- Check RLS is enabled on applications table:
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'applications';

-- List all active policies:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd
-- FROM pg_policies
-- WHERE tablename IN ('applications', 'objects')
-- ORDER BY tablename, policyname;

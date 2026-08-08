-- ============================================================
-- UEC Admission Portal — Migration SQL: Add payment_status Column
-- Run this script in: Supabase Dashboard > SQL Editor
-- Date: 2026-08-08
-- ============================================================

-- 1. Add payment_status column to applications table with default 'Unpaid'
ALTER TABLE public.applications 
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'Unpaid';

-- 2. Verify column was created successfully
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'applications' 
  AND column_name = 'payment_status';

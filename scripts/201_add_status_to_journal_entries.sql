-- =====================================================
-- Migration: Add status column to journal_entries table
-- Date: 2025-12-23
-- Purpose: Fix error 42703 - column "status" does not exist
-- =====================================================

-- Add status column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'journal_entries' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE journal_entries 
    ADD COLUMN status TEXT DEFAULT 'posted' NOT NULL;
    
    RAISE NOTICE 'Added status column to journal_entries table';
  ELSE
    RAISE NOTICE 'Status column already exists in journal_entries table';
  END IF;
END $$;

-- Create index for better performance on status queries
CREATE INDEX IF NOT EXISTS idx_journal_entries_status 
ON journal_entries(company_id, status, entry_date);

-- Add check constraint to ensure valid status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'journal_entries_status_check'
  ) THEN
    ALTER TABLE journal_entries 
    ADD CONSTRAINT journal_entries_status_check 
    CHECK (status IN ('draft', 'posted', 'voided'));
    
    RAISE NOTICE 'Added status check constraint to journal_entries table';
  ELSE
    RAISE NOTICE 'Status check constraint already exists';
  END IF;
END $$;

-- Update any existing records to have 'posted' status
UPDATE journal_entries 
SET status = 'posted' 
WHERE status IS NULL OR status = '';

SELECT 'Migration 201 completed successfully' as result;


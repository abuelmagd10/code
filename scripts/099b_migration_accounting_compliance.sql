-- =============================================
-- Migration Script: Customer Debit Notes - Accounting Compliance
-- سكريبت الترحيل: إشعارات مدين العملاء - الامتثال المحاسبي
-- =============================================
-- Purpose: Migrate from old structure (auto journal entry) to new structure (claim-first)
-- Date: 2026-01-07
-- =============================================

-- 🔒 IMPORTANT: Run this AFTER deploying the updated schema
-- This script:
-- 1. Adds new columns to existing tables
-- 2. Migrates existing data
-- 3. Moves journal_entry_id from debit_notes to applications
-- =============================================

BEGIN;

-- 1️⃣ Add new columns to customer_debit_notes (if not exists)
DO $$ 
BEGIN
  -- Add approval_status column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customer_debit_notes' AND column_name = 'approval_status'
  ) THEN
    ALTER TABLE customer_debit_notes 
    ADD COLUMN approval_status VARCHAR(20) DEFAULT 'draft' 
    CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'rejected'));
    
    COMMENT ON COLUMN customer_debit_notes.approval_status IS 
    'Approval workflow: draft → pending_approval → approved/rejected';
  END IF;
  
  -- Add approved_by column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customer_debit_notes' AND column_name = 'approved_by'
  ) THEN
    ALTER TABLE customer_debit_notes 
    ADD COLUMN approved_by UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  
  -- Add approved_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customer_debit_notes' AND column_name = 'approved_at'
  ) THEN
    ALTER TABLE customer_debit_notes 
    ADD COLUMN approved_at TIMESTAMPTZ;
  END IF;
  
  -- Add rejection_reason column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customer_debit_notes' AND column_name = 'rejection_reason'
  ) THEN
    ALTER TABLE customer_debit_notes 
    ADD COLUMN rejection_reason TEXT;
  END IF;
  
  -- Add created_by column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customer_debit_notes' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE customer_debit_notes 
    ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2️⃣ Add new columns to customer_debit_note_applications
DO $$ 
BEGIN
  -- Add branch_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customer_debit_note_applications' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE customer_debit_note_applications 
    ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
  
  -- Add journal_entry_id column (MOVED from customer_debit_notes)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customer_debit_note_applications' AND column_name = 'journal_entry_id'
  ) THEN
    ALTER TABLE customer_debit_note_applications 
    ADD COLUMN journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;
    
    COMMENT ON COLUMN customer_debit_note_applications.journal_entry_id IS 
    'Journal entry created when debit note is applied (revenue recognition point)';
  END IF;
  
  -- Add application_method column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customer_debit_note_applications' AND column_name = 'application_method'
  ) THEN
    ALTER TABLE customer_debit_note_applications 
    ADD COLUMN application_method VARCHAR(50) DEFAULT 'manual';
  END IF;
  
  -- Add applied_by column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customer_debit_note_applications' AND column_name = 'applied_by'
  ) THEN
    ALTER TABLE customer_debit_note_applications 
    ADD COLUMN applied_by UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3️⃣ Migrate existing data
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Set all existing debit notes to 'approved' status (they were auto-approved in old system)
  UPDATE customer_debit_notes
  SET approval_status = 'approved',
      approved_at = created_at
  WHERE approval_status = 'draft' OR approval_status IS NULL;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Migrated % existing debit notes to approved status', v_count;
  
  -- Migrate journal_entry_id from debit_notes to applications (if applications exist)
  -- This is complex and may need manual review
  RAISE NOTICE 'Manual review required: Migrate journal_entry_id from customer_debit_notes to customer_debit_note_applications';
END $$;

-- 4️⃣ Drop old journal_entry_id column from customer_debit_notes (OPTIONAL - after verification)
-- UNCOMMENT AFTER VERIFYING MIGRATION
-- ALTER TABLE customer_debit_notes DROP COLUMN IF EXISTS journal_entry_id;

COMMIT;

-- =============================================
-- Verification Queries
-- =============================================

-- Check migration status
SELECT 
  'Total Debit Notes' as metric,
  COUNT(*) as count
FROM customer_debit_notes
UNION ALL
SELECT 
  'Approved Debit Notes',
  COUNT(*)
FROM customer_debit_notes
WHERE approval_status = 'approved'
UNION ALL
SELECT 
  'Draft Debit Notes',
  COUNT(*)
FROM customer_debit_notes
WHERE approval_status = 'draft';


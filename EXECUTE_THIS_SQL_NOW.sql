-- =====================================================
-- 🚨 URGENT: Execute this SQL on Supabase Dashboard NOW
-- =====================================================
-- Go to: https://supabase.com/dashboard/project/hfvsbsizokxontflgdyn/editor
-- Click: "New Query" → Paste this SQL → Click "Run" (F5)
-- =====================================================

-- Add status column to journal_entries
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'journal_entries' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE journal_entries 
    ADD COLUMN status TEXT DEFAULT 'posted' NOT NULL;
    
    RAISE NOTICE '✅ Added status column to journal_entries table';
  ELSE
    RAISE NOTICE '⚠️  Status column already exists in journal_entries table';
  END IF;
END $$;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_journal_entries_status 
ON journal_entries(company_id, status, entry_date);

-- Add check constraint for valid status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'journal_entries_status_check'
  ) THEN
    ALTER TABLE journal_entries 
    ADD CONSTRAINT journal_entries_status_check 
    CHECK (status IN ('draft', 'posted', 'voided'));
    
    RAISE NOTICE '✅ Added status check constraint';
  ELSE
    RAISE NOTICE '⚠️  Status check constraint already exists';
  END IF;
END $$;

-- Update existing records to have 'posted' status
UPDATE journal_entries 
SET status = 'posted' 
WHERE status IS NULL OR status = '';

-- Verify the migration
SELECT 
  '✅ Migration completed successfully!' as result,
  COUNT(*) as total_records,
  COUNT(CASE WHEN status = 'posted' THEN 1 END) as posted_records
FROM journal_entries;

-- Show column details
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'journal_entries' 
AND column_name = 'status';


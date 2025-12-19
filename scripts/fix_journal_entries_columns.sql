-- Fix journal_entries table to add missing columns for Fixed Assets module
-- إصلاح جدول journal_entries لإضافة الأعمدة المفقودة لموديول الأصول الثابتة

-- Add missing columns to journal_entries table
ALTER TABLE journal_entries
ADD COLUMN IF NOT EXISTS entry_number TEXT,
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Update reference_type to include new types
-- Note: This is informational, the column already supports TEXT

-- Create index for entry_number if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_number ON journal_entries(entry_number);

-- Update existing records to have entry numbers (for backwards compatibility)
-- This will only affect records created before this fix
UPDATE journal_entries
SET entry_number = 'JE-' || LPAD(ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at)::TEXT, 6, '0')
WHERE entry_number IS NULL;

-- Add a function to auto-generate entry numbers for new records
CREATE OR REPLACE FUNCTION generate_entry_number(p_company_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_next_number INTEGER;
  v_entry_number TEXT;
BEGIN
  -- Get the next number for this company
  SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM '[0-9]+') AS INTEGER)), 0) + 1
  INTO v_next_number
  FROM journal_entries
  WHERE company_id = p_company_id;

  -- Format as JE-000001, JE-000002, etc.
  v_entry_number := 'JE-' || LPAD(v_next_number::TEXT, 6, '0');

  RETURN v_entry_number;
END;
$$ LANGUAGE plpgsql;

-- Update the post_depreciation function to use the new columns
-- Note: The function should work now with the added columns
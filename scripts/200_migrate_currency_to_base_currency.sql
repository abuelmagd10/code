-- =====================================================
-- Migration: Rename currency to base_currency in companies table
-- Script: 200_migrate_currency_to_base_currency.sql
-- Date: 2025-12-23
-- Purpose: Standardize currency column naming across the system
-- =====================================================

BEGIN;

-- =====================================================
-- 1. Add base_currency column if it doesn't exist
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'companies' AND column_name = 'base_currency'
  ) THEN
    ALTER TABLE companies ADD COLUMN base_currency TEXT DEFAULT 'EGP';
    RAISE NOTICE 'Added base_currency column to companies table';
  ELSE
    RAISE NOTICE 'base_currency column already exists';
  END IF;
END $$;

-- =====================================================
-- 2. Migrate data from currency to base_currency
-- =====================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'companies' AND column_name = 'currency'
  ) THEN
    -- Copy data from currency to base_currency where base_currency is NULL
    UPDATE companies 
    SET base_currency = COALESCE(currency, 'EGP')
    WHERE base_currency IS NULL OR base_currency = '';
    
    RAISE NOTICE 'Migrated currency data to base_currency';
  END IF;
END $$;

-- =====================================================
-- 3. Drop old currency column
-- =====================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'companies' AND column_name = 'currency'
  ) THEN
    ALTER TABLE companies DROP COLUMN currency;
    RAISE NOTICE 'Dropped old currency column';
  ELSE
    RAISE NOTICE 'currency column already removed';
  END IF;
END $$;

-- =====================================================
-- 4. Add NOT NULL constraint to base_currency
-- =====================================================
ALTER TABLE companies 
  ALTER COLUMN base_currency SET DEFAULT 'EGP',
  ALTER COLUMN base_currency SET NOT NULL;

-- =====================================================
-- 5. Add comment to base_currency column
-- =====================================================
COMMENT ON COLUMN companies.base_currency IS 
'Base currency for the company. Used as default for all transactions and reports.';

-- =====================================================
-- 6. Update any views or functions that reference currency
-- =====================================================
-- Note: Add any view/function updates here if needed

COMMIT;

-- =====================================================
-- Verification Query
-- =====================================================
-- Run this to verify the migration:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'companies' AND column_name IN ('currency', 'base_currency');


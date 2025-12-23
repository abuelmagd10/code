# 🚨 URGENT: Fix Missing `status` Column in `journal_entries` Table

## ❌ Problem

```
GET | 400 | /rest/v1/journal_entries?select=id&company_id=eq...&status=eq.posted&entry_date=lte.2025-12-23
Error: 42703 - column "status" does not exist
```

**Root Cause:**
- The `journal_entries` table is missing the `status` column
- Code is trying to filter by `.eq("status", "posted")`
- This causes PostgreSQL error 42703 (column does not exist)

---

## ✅ Solution

### **Step 1: Execute Migration on Supabase Dashboard**

1. Go to: https://supabase.com/dashboard/project/hfvsbsizokxontflgdyn/editor
2. Click on **SQL Editor**
3. Click **New Query**
4. Copy and paste the following SQL:

```sql
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
```

5. Click **Run** (or press F5)
6. Wait for success message: `Migration 201 completed successfully`

---

### **Step 2: Verify the Fix**

After running the migration, verify it worked:

```sql
-- Check if status column exists
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'journal_entries' 
AND column_name = 'status';

-- Check existing data
SELECT status, COUNT(*) 
FROM journal_entries 
GROUP BY status;
```

Expected result:
- Column `status` exists with type `text` and default `'posted'`
- All existing records have `status = 'posted'`

---

### **Step 3: Test the Application**

1. Wait 2-3 minutes for changes to propagate
2. Clear browser cache (Ctrl + Shift + R)
3. Go to any financial report page
4. Check browser console - should see no errors
5. Check Supabase logs - should see no more 400/42703 errors

---

## 📊 What This Migration Does

| Action | Description |
|--------|-------------|
| **Add Column** | Adds `status TEXT DEFAULT 'posted' NOT NULL` to `journal_entries` |
| **Create Index** | Creates index on `(company_id, status, entry_date)` for performance |
| **Add Constraint** | Ensures `status` is one of: `'draft'`, `'posted'`, `'voided'` |
| **Update Data** | Sets all existing records to `status = 'posted'` |

---

## 🎯 Status Values

| Status | Description |
|--------|-------------|
| `draft` | قيد مسودة - لم يُرحّل بعد |
| `posted` | قيد مرحّل - تم ترحيله إلى الحسابات |
| `voided` | قيد ملغي - تم إلغاؤه |

---

## ⚠️ Important Notes

1. **Safe Migration**: Uses `IF NOT EXISTS` checks - safe to run multiple times
2. **No Data Loss**: All existing records will be set to `status = 'posted'`
3. **Performance**: Index created for faster queries
4. **Validation**: Check constraint ensures data integrity

---

## 🔍 Affected Files

The following API routes use `status` filter on `journal_entries`:

- `app/api/account-balances/route.ts` (line 55)
- `app/api/trial-balance/route.ts` (line 53)
- `app/api/cash-flow/route.ts` (line 48)
- `app/api/income-statement/route.ts` (line 58)
- `lib/ledger.ts` (potential usage)

All these will work correctly after the migration.

---

**Status:** ⏳ **WAITING FOR MANUAL EXECUTION**  
**Priority:** 🚨 **CRITICAL - Execute Immediately**  
**Estimated Time:** ⏱️ **2 minutes**


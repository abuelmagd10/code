# 🚀 Deployment Guide - Audit Log Phase 1

## Overview
This guide covers deploying the Phase 1 audit log enhancements to your database.

---

## Prerequisites

- ✅ Access to Supabase Dashboard or database connection string
- ✅ Service role key for API access
- ✅ Backup of current database (recommended)

---

## Deployment Options

### Option 1: Supabase Dashboard (Recommended)

**Steps:**

1. **Login to Supabase Dashboard**
   - Go to https://app.supabase.com
   - Select your project

2. **Open SQL Editor**
   - Navigate to: SQL Editor (left sidebar)
   - Click "New Query"

3. **Apply Migration 001**
   - Copy contents of: `supabase/migrations/20260215_001_audit_log_enhancements.sql`
   - Paste into SQL Editor
   - Click "Run" (or press Ctrl+Enter)
   - Wait for success message

4. **Apply Migration 002**
   - Click "New Query" again
   - Copy contents of: `supabase/migrations/20260215_002_audit_critical_tables.sql`
   - Paste into SQL Editor
   - Click "Run"
   - Wait for success message

5. **Verify**
   - Run verification queries (see below)

---

### Option 2: psql Command Line

**Requirements:**
- PostgreSQL client (`psql`) installed
- Database connection string

**Steps:**

```bash
# Set your connection string
export DATABASE_URL="postgresql://postgres:[password]@[host]:[port]/postgres"

# Apply migrations
psql $DATABASE_URL -f supabase/migrations/20260215_001_audit_log_enhancements.sql
psql $DATABASE_URL -f supabase/migrations/20260215_002_audit_critical_tables.sql

# Verify
psql $DATABASE_URL -f scripts/verify_audit_phase1.sql
```

---

### Option 3: Supabase CLI (if installed)

```bash
# Link to your project
supabase link --project-ref <your-project-ref>

# Push migrations
supabase db push

# Verify
supabase db remote exec < scripts/verify_audit_phase1.sql
```

---

### Option 4: TypeScript Script (Alternative)

```bash
# Set environment variables
export NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Run migration script
npx tsx scripts/apply-audit-migrations.ts
```

**Note:** This method may have limitations. Use Dashboard or psql for production.

---

## Verification

After applying migrations, verify the changes:

### Quick Verification (SQL)

```sql
-- Check action types
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'audit_logs'::regclass 
  AND conname = 'audit_logs_action_check';

-- Check reason column
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'audit_logs' 
  AND column_name = 'reason';

-- Check UPDATE policy
SELECT policyname 
FROM pg_policies 
WHERE tablename = 'audit_logs' 
  AND policyname = 'audit_logs_no_update';

-- Count triggers
SELECT COUNT(*) as total_triggers
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND t.tgname LIKE 'audit_%';
```

**Expected Results:**
- ✅ Action constraint includes 13 types
- ✅ `reason` column exists (TEXT)
- ✅ `audit_logs_no_update` policy exists
- ✅ 24+ total triggers

### Full Verification

```bash
# Run full verification script
npx tsx scripts/test-audit-phase1.ts
```

---

## Rollback (if needed)

If you need to rollback the changes:

```sql
-- Rollback Migration 002 (triggers)
DROP TRIGGER IF EXISTS audit_sales_orders ON sales_orders;
DROP TRIGGER IF EXISTS audit_purchase_returns ON purchase_returns;
DROP TRIGGER IF EXISTS audit_customer_debit_notes ON customer_debit_notes;
DROP TRIGGER IF EXISTS audit_inventory_write_offs ON inventory_write_offs;
DROP TRIGGER IF EXISTS audit_company_members ON company_members;
DROP TRIGGER IF EXISTS audit_company_role_permissions ON company_role_permissions;
DROP TRIGGER IF EXISTS audit_fixed_assets ON fixed_assets;
DROP TRIGGER IF EXISTS audit_asset_transactions ON asset_transactions;
DROP TRIGGER IF EXISTS audit_accounting_periods ON accounting_periods;
DROP TRIGGER IF EXISTS audit_payroll_runs ON payroll_runs;

-- Rollback Migration 001 (schema)
ALTER TABLE audit_logs DROP COLUMN IF EXISTS reason;
DROP POLICY IF EXISTS audit_logs_no_update ON audit_logs;
DROP INDEX IF EXISTS idx_audit_logs_reason;
DROP INDEX IF EXISTS idx_audit_logs_company_action_date;

-- Restore old action constraint
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_check 
  CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'REVERT'));
```

---

## Post-Deployment

After successful deployment:

1. ✅ **Monitor Logs**
   - Check for any errors in Supabase logs
   - Monitor audit_logs table for new entries

2. ✅ **Test Functionality**
   - Create a test record in a critical table
   - Verify audit log entry is created
   - Try to update an audit log (should fail)

3. ✅ **Update UI** (if needed)
   - Add new action types to filters
   - Test filtering by new action types

4. ✅ **Document**
   - Update internal documentation
   - Notify team of new audit capabilities

---

## Troubleshooting

### Issue: "Permission denied"
**Solution:** Ensure you're using service role key or have sufficient permissions

### Issue: "Table does not exist"
**Solution:** Some triggers are conditional. This is expected for optional tables.

### Issue: "Constraint already exists"
**Solution:** Migration may have been partially applied. Check current state and apply missing parts only.

### Issue: "Function does not exist"
**Solution:** Ensure base audit system (`022_audit_log.sql`) was applied first.

---

## Support

If you encounter issues:
1. Check Supabase logs
2. Review error messages carefully
3. Verify prerequisites are met
4. Contact database administrator

---

**Last Updated:** 2026-02-15  
**Version:** Phase 1  
**Status:** Ready for Deployment

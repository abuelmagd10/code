# Migration Fix Applied ✅

## Problem
عند تنفيذ migration `20260215_001_audit_log_enhancements.sql`، ظهر الخطأ:
```
ERROR: 42725: function name "create_audit_log" is not unique
HINT: Specify the argument list to select the function unambiguously.
```

## Root Cause
كانت هناك نسختان من دالة `create_audit_log`:
1. **النسخة القديمة** (8 parameters): من `scripts/022_audit_log.sql`
2. **النسخة الوسيطة** (10 parameters): من `scripts/105_audit_log_branch_filter.sql`
3. **النسخة الجديدة** (11 parameters): مع إضافة `p_reason`

PostgreSQL لا يمكنه تحديد أي نسخة يجب استبدالها عند استخدام `CREATE OR REPLACE`.

## Solution Applied
تم إضافة أوامر `DROP FUNCTION` الصريحة قبل إنشاء النسخة الجديدة:

```sql
-- حذف النسخ القديمة من الدالة أولاً
DROP FUNCTION IF EXISTS create_audit_log(UUID, UUID, TEXT, TEXT, UUID, TEXT, JSONB, JSONB);
DROP FUNCTION IF EXISTS create_audit_log(UUID, UUID, TEXT, TEXT, UUID, TEXT, JSONB, JSONB, UUID, UUID);

-- إنشاء النسخة الجديدة مع معامل reason
CREATE OR REPLACE FUNCTION create_audit_log(
  p_company_id UUID,
  p_user_id UUID,
  p_action TEXT,
  p_target_table TEXT,
  p_record_id UUID,
  p_record_identifier TEXT,
  p_old_data JSONB,
  p_new_data JSONB,
  p_branch_id UUID DEFAULT NULL,
  p_cost_center_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL  -- ← المعامل الجديد
) RETURNS UUID AS $$
...
```

## What Changed
- ✅ Added explicit `DROP FUNCTION` for 8-parameter version
- ✅ Added explicit `DROP FUNCTION` for 10-parameter version
- ✅ Now creates clean 11-parameter version with `reason` support

## Impact
- ✅ **Backward Compatible**: جميع الاستدعاءات القديمة ستعمل (reason اختياري)
- ✅ **No Data Loss**: لا يؤثر على البيانات الموجودة
- ✅ **Safe Migration**: يمكن التراجع بسهولة

## Next Steps
1. ✅ Migration file updated
2. ⏳ Re-run migration in Supabase Dashboard
3. ⏳ Verify with test script

## How to Apply

### Method 1: Supabase Dashboard (Recommended)
1. Open Supabase Dashboard → SQL Editor
2. Copy the **updated** `20260215_001_audit_log_enhancements.sql`
3. Paste and execute
4. Should complete without errors

### Method 2: psql
```bash
psql <connection-string> -f supabase/migrations/20260215_001_audit_log_enhancements.sql
```

## Verification
After applying, verify the function exists:

```sql
-- Should show only ONE function with 11 parameters
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'create_audit_log';
```

Expected output:
```
function_name    | arguments
-----------------+----------------------------------------------------------
create_audit_log | p_company_id uuid, p_user_id uuid, p_action text, 
                 | p_target_table text, p_record_id uuid, 
                 | p_record_identifier text, p_old_data jsonb, 
                 | p_new_data jsonb, p_branch_id uuid DEFAULT NULL, 
                 | p_cost_center_id uuid DEFAULT NULL, 
                 | p_reason text DEFAULT NULL
```

---

**Status:** ✅ Fixed  
**Date:** 2026-02-15  
**Ready to Apply:** Yes

# Audit Log Phase 1 - Testing Guide

## Prerequisites

Before running tests, ensure:
1. ✅ Both migrations have been applied to your database
2. ✅ Environment variables are set (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
3. ✅ You have access to the database

## Test Methods

### Method 1: SQL Verification Script

**Purpose:** Verify database schema and triggers

**Run:**
```bash
psql <your-database-connection-string> -f scripts/verify_audit_phase1.sql
```

**Expected Output:**
- ✅ Action constraint with 13 types
- ✅ `reason` column exists (TEXT, nullable)
- ✅ `audit_logs_no_update` policy exists
- ✅ 2 new indexes created
- ✅ 10+ new triggers on critical tables
- ✅ `create_audit_log` function accepts `p_reason`

---

### Method 2: TypeScript Test Script

**Purpose:** Functional testing of audit logging

**Run:**
```bash
npx tsx scripts/test-audit-phase1.ts
```

**What it tests:**
1. ✅ Schema accessibility
2. ✅ All 9 new action types (APPROVE, POST, CANCEL, etc.)
3. ✅ UPDATE prevention policy
4. ✅ Triggers on critical tables (sales_orders, company_members)

**Expected Output:**
```
🧪 Testing Audit Log Phase 1 Implementation...

1️⃣ Testing Schema Changes...
  ✅ audit_logs table accessible

2️⃣ Testing New Action Types...
  ✅ APPROVE action type works
  ✅ POST action type works
  ✅ CANCEL action type works
  ✅ REVERSE action type works
  ✅ CLOSE action type works
  ✅ LOGIN action type works
  ✅ LOGOUT action type works
  ✅ ACCESS_DENIED action type works
  ✅ SETTINGS action type works

3️⃣ Testing UPDATE Prevention...
  ✅ UPDATE prevention works (update blocked as expected)

4️⃣ Testing Triggers on Critical Tables...
  ✅ sales_orders trigger works
  ✅ company_members trigger works

==================================================
📊 Test Summary
==================================================
✅ Passed: 12
❌ Failed: 0
📈 Success Rate: 100.0%
==================================================

🎉 All tests passed! Phase 1 implementation is working correctly.
```

---

### Method 3: Manual UI Testing

**Purpose:** Verify UI integration

**Steps:**

1. **Navigate to Audit Log page:**
   ```
   http://localhost:3000/settings/audit-log
   ```

2. **Test Action Filter:**
   - Click on "Action" filter dropdown
   - Verify new actions appear:
     - APPROVE
     - POST
     - CANCEL
     - REVERSE
     - CLOSE
     - LOGIN
     - LOGOUT
     - ACCESS_DENIED
     - SETTINGS

3. **Perform a test operation:**
   - Create a new sales order (if table exists)
   - Go to audit log page
   - Filter by table = "sales_orders"
   - Verify the INSERT operation is logged

4. **Test reason field:**
   - Look for any logs with a reason
   - Verify the reason is displayed in the details

---

## Troubleshooting

### Issue: "Action type not allowed"
**Solution:** Migration 001 not applied. Run:
```bash
supabase db push
```

### Issue: "UPDATE succeeded when it should fail"
**Solution:** RLS policy not applied. Check:
```sql
SELECT * FROM pg_policies WHERE tablename = 'audit_logs';
```

### Issue: "Trigger not firing"
**Solution:** Check if trigger exists:
```sql
SELECT * FROM pg_trigger WHERE tgname LIKE 'audit_%';
```

### Issue: "reason column not found"
**Solution:** Migration 001 not fully applied. Verify:
```sql
\d audit_logs
```

---

## Next Steps After Testing

If all tests pass:
1. ✅ Mark testing tasks as complete in task.md
2. ✅ Update UI to show new action types (if needed)
3. ✅ Apply migrations to production
4. ✅ Monitor audit logs for any issues

If tests fail:
1. ❌ Review error messages
2. ❌ Check database logs
3. ❌ Verify migrations were applied correctly
4. ❌ Fix issues and re-test

---

## Production Deployment Checklist

Before deploying to production:

- [ ] All tests pass in development
- [ ] Migrations reviewed and approved
- [ ] Backup database before applying migrations
- [ ] Apply migrations during low-traffic period
- [ ] Run verification script after deployment
- [ ] Monitor audit logs for 24 hours
- [ ] Document any issues or anomalies

---

**Last Updated:** 2026-02-15  
**Phase:** 1 (Schema & Critical Tables)  
**Status:** Ready for Testing

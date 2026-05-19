# FX Account Configuration — Rollout Plan

**Migration:** `20260519000200_fx_account_configuration.sql`
**Date:** 2026-05-19
**Author:** AI Assistant (Phase 2-A)
**Risk Level:** Low (additive changes only, zero historical FX entries in production)

---

## Pre-Rollout Checklist

- [ ] Migration file reviewed and approved
- [ ] Code changes reviewed (currency-service.ts, fx-gains-losses report, exchange rate fallback, settings page)
- [ ] All TypeScript compilation passes (`pnpm tsc --noEmit`)
- [ ] Production database backup available (Supabase automatic daily backups)

---

## Deployment Order (Critical)

The code reads `companies.fx_gain_account_id` — if deployed before the migration, the query will fail.
The code includes a try/catch fallback for this scenario, but the correct order is:

### Step A: Apply Migration (Database First)

```bash
# From project root:
npx supabase db push
```

**What it does:**
1. Creates account `4320` (أرباح فروق العملة / FX Gains) in all 47 companies
2. Adds `fx_gain_account_id` and `fx_loss_account_id` columns to `companies` table

**Verification queries (run in Supabase SQL Editor):**

```sql
-- Verify 4320 was created in all companies
SELECT COUNT(*) AS companies_with_4320
FROM chart_of_accounts
WHERE account_code = '4320';
-- Expected: 47

-- Verify new columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'companies'
  AND column_name IN ('fx_gain_account_id', 'fx_loss_account_id');
-- Expected: 2 rows, both nullable UUID
```

**Success criteria:**
- 47 new `4320` accounts created (one per company)
- Both columns exist on `companies` table
- No errors in migration output
- Existing accounts unaffected (spot-check: `4200` still = "إيرادات الخدمات")

**If migration fails:** No rollback needed — both operations are idempotent. Fix the issue and re-run.

---

### Step B: Deploy Code Changes

Deploy the updated application code. The following files are modified:

| File | Change |
|------|--------|
| `lib/currency-service.ts` | New `getFXAccounts()` + fix `performCurrencyRevaluation` + fix `createFXAccountsIfNeeded` |
| `app/reports/fx-gains-losses/page.tsx` | Use `getFXAccounts()` instead of hardcoded 4200/5200 |
| `lib/exchange-rates.ts` | Remove `return 1` fallback, add stale rate detection |
| `lib/currency-conversion-system.ts` | Remove `return 1` fallback, add stale rate detection |
| `lib/currency-converter.ts` | Remove `return 1` fallback, add stale rate detection |
| `app/settings/page.tsx` | New "FX Account Configuration" section |
| `CHANGELOG.md` | Document changes |

**Safety net:** `getFXAccounts()` includes a try/catch around the `companies.fx_gain_account_id` query. If the columns don't exist yet (code deployed before migration), it falls through to the default 4320/5310 lookup.

---

### Step C: Manual Verification on VitaSlims

After both migration and code are deployed, perform these manual checks:

#### C1. FX Account Existence
```sql
SELECT account_code, account_name, account_type, parent_id IS NOT NULL AS has_parent
FROM chart_of_accounts
WHERE company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'
  AND account_code IN ('4320', '5310');
-- Expected: 2 rows (4320 income, 5310 expense)
```

#### C2. Settings Page
1. Navigate to `/settings`
2. Scroll to "إعدادات حسابات فروق العملة" section
3. Verify default accounts are shown (4320 and 5310)
4. Test selecting a different account and saving
5. Revert back to defaults

#### C3. FX Gains/Losses Report
1. Navigate to `/reports/fx-gains-losses`
2. Verify no errors on load
3. Verify "لا توجد قيود فروق صرف لهذه الفترة" message (since no FX entries exist)
4. Verify the report no longer queries Service Revenue (4200)

#### C4. Account 4200 Unchanged
```sql
SELECT account_code, account_name
FROM chart_of_accounts
WHERE company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'
  AND account_code = '4200';
-- Expected: "إيرادات الخدمات" (unchanged)
```

#### C5. Exchange Rate Fallback (Optional)
1. Open browser DevTools console
2. Navigate to a page that fetches exchange rates (e.g., `/invoices/new`)
3. Select a foreign currency (USD)
4. Verify rate is fetched successfully from DB or API
5. Temporarily disconnect internet → verify stale rate or error message appears (not silent `1`)

---

### Step D: Sign-Off

If all checks in Step C pass:
- [ ] Migration verified
- [ ] Settings page functional
- [ ] FX report corrected
- [ ] Account 4200 untouched
- [ ] Exchange rate fallback working

**The change is considered stable.**

---

## Rollback Procedure

### If migration needs reversal:

```sql
-- Step 1: Remove FK columns from companies
ALTER TABLE companies DROP COLUMN IF EXISTS fx_gain_account_id;
ALTER TABLE companies DROP COLUMN IF EXISTS fx_loss_account_id;

-- Step 2: Remove 4320 accounts (only the ones created by this migration)
DELETE FROM chart_of_accounts
WHERE account_code = '4320'
  AND account_name = 'أرباح فروق العملة';
```

### If code needs reversal:

Revert the git commit. The old code (hardcoded 4200/5200 and `return 1`) will work as before — no FX entries existed, so no damage from the old behavior.

---

## Impact Summary

| Area | Impact |
|------|--------|
| Existing invoices/payments | None — no data modified |
| Existing journal entries | None — no entries touched |
| Account 4200 (Service Revenue) | Unchanged |
| Account 5200 (Operating Expenses) | Unchanged |
| New FX entries (future) | Will correctly use 4320/5310 |
| FX Gains/Losses report | Corrected — will show actual FX accounts |
| Exchange rate failures | Visible error instead of silent wrong rate |

# Commission-Payroll Integration Testing Guide

## 🧪 Testing Checklist

### Prerequisites
- [ ] Deploy migration `20260217_004_commission_payroll_integration.sql` to production
- [ ] Or start Docker Desktop and run `npx supabase db reset` locally

---

## 1️⃣ Database Schema Verification

### Check commission_plans.payout_mode
```sql
SELECT id, name, payout_mode 
FROM commission_plans 
LIMIT 5;
```

**Expected**: Column `payout_mode` exists with values 'immediate' or 'payroll'

---

### Check commission_ledger payment tracking
```sql
SELECT id, payment_status, paid_at, payment_journal_entry_id 
FROM commission_ledger 
LIMIT 5;
```

**Expected**: Columns exist with proper data types

---

### Check commission_runs.payroll_run_id
```sql
SELECT id, payroll_run_id 
FROM commission_runs 
LIMIT 5;
```

**Expected**: Column exists (may be NULL)

---

## 2️⃣ RPC Functions Verification

### Test get_pending_instant_payouts
```sql
SELECT * FROM get_pending_instant_payouts(
  '<company_id>'::uuid,
  '2026-01-01'::date,
  '2026-12-31'::date,
  NULL
);
```

**Expected**: Returns aggregated commission data per employee

---

## 3️⃣ Instant Payout Flow Test

### Step 1: Create Commission Plan (Immediate Mode)
1. Go to **Settings → Commission Plans**
2. Click "Create New Plan"
3. Fill in details:
   - Name: "Test Instant Payout"
   - Type: Flat Percentage
   - **Payment Method: Instant Payout**
   - Rate: 5%
4. Save

**Expected**: Plan created with `payout_mode = 'immediate'`

---

### Step 2: Create Invoice
1. Create a sales order
2. Convert to invoice
3. Mark as paid

**Expected**: Commission auto-calculated with `payment_status = 'scheduled'`

**Verify in DB**:
```sql
SELECT * FROM commission_ledger 
WHERE payment_status = 'scheduled' 
ORDER BY created_at DESC 
LIMIT 5;
```

---

### Step 3: Pay Commission via Instant Payouts
1. Go to **HR → Instant Payouts**
2. Select date range
3. Click "Load Pending Commissions"
4. Select employee
5. Choose payment account (cash/bank)
6. Click "Pay Now"

**Expected**: 
- Success message
- Journal entry created
- Commission status = 'paid'

**Verify in DB**:
```sql
-- Check commission ledger
SELECT id, payment_status, paid_at, payment_journal_entry_id 
FROM commission_ledger 
WHERE payment_status = 'paid' 
ORDER BY paid_at DESC 
LIMIT 5;

-- Check journal entry
SELECT je.id, je.entry_date, je.description, 
       jel.account_id, jel.debit, jel.credit
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.reference_type = 'commission_payout'
ORDER BY je.created_at DESC
LIMIT 10;
```

**Expected Journal Entry**:
```
Dr. Commission Expense (مصروف عمولات)
Cr. Cash/Bank (حساب الدفع)
```

---

## 4️⃣ Payroll Integration Flow Test

### Step 1: Create Commission Plan (Payroll Mode)
1. Go to **Settings → Commission Plans**
2. Create plan with **Payment Method: Monthly with Payroll**

---

### Step 2: Calculate Commission Run
1. Go to **Settings → Commission Runs**
2. Create new run
3. Approve and post

---

### Step 3: Attach to Payroll
1. Go to **HR → Payroll**
2. Create payroll run
3. Click "Attach Commissions" (if button exists)
4. Select commission run
5. Verify payslips updated

**Verify in DB**:
```sql
-- Check commission run linked to payroll
SELECT id, payroll_run_id 
FROM commission_runs 
WHERE payroll_run_id IS NOT NULL;

-- Check payslips
SELECT employee_id, base_salary, sales_bonus, net_salary 
FROM payslips 
WHERE payroll_run_id = '<payroll_run_id>';
```

---

## 5️⃣ API Endpoint Testing

### Test 1: GET /api/commissions/instant-payouts
```bash
curl -X GET "http://localhost:3000/api/commissions/instant-payouts?companyId=<id>&startDate=2026-01-01&endDate=2026-12-31" \
  -H "Authorization: Bearer <token>"
```

**Expected**: List of employees with pending commissions

---

### Test 2: POST /api/commissions/instant-payouts/pay
```bash
curl -X POST "http://localhost:3000/api/commissions/instant-payouts/pay" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "companyId": "<id>",
    "employeeIds": ["<employee_id>"],
    "paymentAccountId": "<account_id>",
    "paymentDate": "2026-02-17",
    "startDate": "2026-02-01",
    "endDate": "2026-02-17"
  }'
```

**Expected**: Success response with journal entry IDs

---

### Test 3: POST /api/commissions/attach-to-payroll
```bash
curl -X POST "http://localhost:3000/api/commissions/attach-to-payroll" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "companyId": "<id>",
    "commissionRunId": "<run_id>",
    "payrollRunId": "<payroll_id>"
  }'
```

**Expected**: Success response with updated employee count

---

## 6️⃣ UI Testing

### Instant Payouts Page
- [ ] Page loads without errors
- [ ] Period selection works
- [ ] Pending commissions table displays correctly
- [ ] Individual "Pay Now" button works
- [ ] Bulk selection works
- [ ] "Pay Selected" button works
- [ ] Summary cards show correct totals
- [ ] Bilingual support (AR/EN)

### Commission Plans Form
- [ ] "Payment Method" field visible
- [ ] Options: "Monthly with Payroll" and "Instant Payout"
- [ ] Hint text changes based on selection
- [ ] Field saves correctly

### Sidebar
- [ ] "Instant Payouts" link visible under HR
- [ ] Link navigates to correct page
- [ ] RBAC enforced (only Owner/Admin/Finance)

---

## 7️⃣ RBAC Testing

### Instant Payouts Access
- [ ] Owner: Can view and pay ✅
- [ ] Admin: Can view and pay ✅
- [ ] Finance: Can view only ✅
- [ ] Other roles: No access ❌

### API Permissions
- [ ] GET instant-payouts: Owner/Admin/Finance
- [ ] POST instant-payouts/pay: Owner/Admin only
- [ ] POST attach-to-payroll: Owner/Admin only

---

## 8️⃣ Edge Cases

### Test Scenarios
- [ ] Pay commission with no pending commissions
- [ ] Pay commission with invalid payment account
- [ ] Pay commission twice (should fail)
- [ ] Attach commission run already attached (should fail)
- [ ] Attach commission run not posted (should fail)
- [ ] Create plan without payout_mode (should default to 'payroll')

---

## 9️⃣ Performance Testing

### Load Test
- [ ] Load 100+ pending commissions
- [ ] Bulk pay 50+ employees
- [ ] Check page load time
- [ ] Check API response time

---

## 🔟 Regression Testing

### Existing Features
- [ ] Commission calculation still works
- [ ] Commission runs still work
- [ ] Payroll still works
- [ ] No breaking changes to existing flows

---

## ✅ Sign-off Checklist

- [ ] All database schema changes verified
- [ ] All RPC functions working
- [ ] Instant payout flow tested end-to-end
- [ ] Payroll integration flow tested end-to-end
- [ ] Journal entries created correctly
- [ ] UI components working
- [ ] RBAC enforced
- [ ] No errors in console
- [ ] No breaking changes

---

## 📝 Test Results

**Date**: _______________  
**Tester**: _______________  
**Environment**: ☐ Local ☐ Staging ☐ Production

**Overall Status**: ☐ Pass ☐ Fail

**Notes**:
_______________________________________
_______________________________________
_______________________________________

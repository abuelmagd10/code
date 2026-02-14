# 🧪 Manual Testing Guide - Purchase Transaction Atomicity

## Quick Start

This guide provides step-by-step instructions for manually testing the atomic purchase transaction implementation.

---

## ✅ Test 1: Bill Posting Atomicity

### Objective
Verify that inventory and journal entries are created together atomically.

### Prerequisites
- Draft bill with at least one product item
- Bill must have: Branch, Warehouse, Cost Center
- Valid account mappings configured

### Steps

1. **Navigate to Bill**
   - Go to Bills page
   - Open a draft bill

2. **Change Status to "Sent"**
   - Click status dropdown
   - Select "Sent"
   - Confirm action

3. **Verify Success**
   - ✅ Success toast appears
   - ✅ Bill status changes to "Sent"
   - ✅ No error messages

4. **Database Verification**

Open Supabase SQL Editor and run:

```sql
-- Replace <bill_id> with your actual bill ID

-- Check inventory transactions (should have records)
SELECT 
  id, 
  transaction_type, 
  quantity, 
  reference_id
FROM inventory_transactions 
WHERE reference_id = '<bill_id>' 
AND transaction_type = 'purchase';

-- Check journal entry (should exist)
SELECT 
  id, 
  reference_type, 
  reference_id, 
  description
FROM journal_entries 
WHERE reference_id = '<bill_id>' 
AND reference_type = 'bill';

-- Check journal lines (should have 2-3 lines: Inventory, AP, VAT)
SELECT 
  jel.id,
  jel.debit_amount,
  jel.credit_amount,
  jel.description,
  coa.account_name
FROM journal_entry_lines jel
JOIN journal_entries je ON je.id = jel.journal_entry_id
JOIN chart_of_accounts coa ON coa.id = jel.account_id
WHERE je.reference_id = '<bill_id>';
```

### Expected Results
- ✅ Inventory transactions created
- ✅ Journal entry created
- ✅ Journal lines created (Debit: Inventory + VAT, Credit: AP)
- ✅ All records reference the same bill_id

### Atomicity Test
Try to find partial data:
```sql
-- Should return 0 rows (no orphaned records)
SELECT * FROM inventory_transactions 
WHERE reference_id = '<bill_id>' 
AND id NOT IN (
  SELECT id FROM inventory_transactions 
  WHERE reference_id IN (
    SELECT reference_id FROM journal_entries 
    WHERE reference_type = 'bill'
  )
);
```

---

## ✅ Test 2: Purchase Return Atomicity

### Objective
Verify that return, vendor credit, inventory reversal, and journal entries are created together atomically.

### Prerequisites
- Bill with status "Sent", "Received", or "Paid"
- Bill has product items with available stock
- Items have not been fully returned

### Steps

1. **Navigate to Bill**
   - Go to Bills page
   - Open a sent/received bill

2. **Initiate Return**
   - Click "Return" button
   - Return dialog opens

3. **Configure Return**
   - Select items to return
   - Enter return quantities
   - Choose settlement method:
     - **Credit**: For paid bills (creates vendor credit)
     - **Cash**: For unpaid bills
   - Add return reason (optional)

4. **Submit Return**
   - Click "Process Return"
   - Confirm action

5. **Verify Success**
   - ✅ Success toast appears
   - ✅ Dialog closes
   - ✅ Bill data refreshes
   - ✅ No error messages

6. **Database Verification**

```sql
-- Replace <bill_id> with your actual bill ID

-- Check purchase return (should exist)
SELECT 
  id, 
  bill_id, 
  return_number, 
  total_amount,
  settlement_method
FROM purchase_returns 
WHERE bill_id = '<bill_id>'
ORDER BY created_at DESC
LIMIT 1;

-- Check vendor credit (if paid bill with credit settlement)
SELECT 
  id, 
  bill_id, 
  credit_number, 
  total_amount,
  status
FROM vendor_credits 
WHERE bill_id = '<bill_id>'
ORDER BY created_at DESC
LIMIT 1;

-- Check inventory reversal (should have negative quantities)
SELECT 
  id, 
  transaction_type, 
  quantity, 
  reference_type,
  reference_id
FROM inventory_transactions 
WHERE reference_type = 'purchase_return'
AND reference_id IN (
  SELECT id FROM purchase_returns WHERE bill_id = '<bill_id>'
);

-- Check reversal journal entry
SELECT 
  je.id, 
  je.reference_type, 
  je.description,
  COUNT(jel.id) as line_count
FROM journal_entries je
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.reference_type = 'purchase_return'
AND je.reference_id IN (
  SELECT id FROM purchase_returns WHERE bill_id = '<bill_id>'
)
GROUP BY je.id, je.reference_type, je.description;

-- Check bill items updated
SELECT 
  id, 
  product_id, 
  quantity, 
  returned_quantity
FROM bill_items 
WHERE bill_id = '<bill_id>';
```

### Expected Results
- ✅ Purchase return record created
- ✅ Vendor credit created (if applicable)
- ✅ Inventory transactions reversed (negative quantities)
- ✅ Journal entry created for reversal
- ✅ Bill items `returned_quantity` updated
- ✅ All records linked correctly

### Atomicity Test
```sql
-- Should return 0 rows (no orphaned records)
SELECT * FROM purchase_returns pr
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_transactions it
  WHERE it.reference_type = 'purchase_return'
  AND it.reference_id = pr.id
);
```

---

## ✅ Test 3: Idempotency Test

### Objective
Verify that duplicate operations are prevented.

### Steps

1. **Post a Bill**
   - Follow Test 1 steps
   - Note the bill ID

2. **Attempt Duplicate Post**
   - Try to change status to "Sent" again
   - OR manually call the RPC again

3. **Expected Behavior**
   - ✅ System prevents duplicate
   - ✅ Shows "Already posted" message
   - ✅ No duplicate records created

### Verification
```sql
-- Should return 1 (not 2+)
SELECT COUNT(*) FROM journal_entries 
WHERE reference_id = '<bill_id>' 
AND reference_type = 'bill';

-- Should return item count (not 2x item count)
SELECT COUNT(*) FROM inventory_transactions 
WHERE reference_id = '<bill_id>' 
AND transaction_type = 'purchase';
```

---

## ✅ Test 4: Error Handling & Rollback

### Objective
Verify that errors cause complete rollback (no partial data).

### Test 4.1: Missing Governance Data

1. **Create Bill Without Warehouse**
   - Create a draft bill
   - Leave warehouse field empty

2. **Attempt to Post**
   - Try to change status to "Sent"

3. **Expected Behavior**
   - ❌ Error message: "Warehouse required"
   - ✅ No inventory transactions created
   - ✅ No journal entries created
   - ✅ Bill status remains "Draft"

### Test 4.2: Invalid Account Mapping

1. **Temporarily Remove Account**
   - Go to Chart of Accounts
   - Disable "Accounts Payable" account

2. **Attempt to Post Bill**
   - Try to change status to "Sent"

3. **Expected Behavior**
   - ❌ Error message: "Account mapping not found"
   - ✅ No partial data created

4. **Restore Account**
   - Re-enable the account

### Verification
```sql
-- Should return 0 rows (no orphaned data)
SELECT * FROM inventory_transactions 
WHERE reference_id IS NULL;

SELECT * FROM journal_entries 
WHERE reference_id IS NULL;

SELECT * FROM vendor_credits 
WHERE bill_id IS NULL;
```

---

## ✅ Test 5: Concurrent Operations

### Objective
Test race conditions and concurrent access.

### Steps

1. **Open Same Bill in Two Tabs**
   - Tab 1: Open bill A
   - Tab 2: Open same bill A

2. **Attempt Simultaneous Post**
   - Tab 1: Click "Send" → Confirm
   - Tab 2: Immediately click "Send" → Confirm

3. **Expected Behavior**
   - ✅ One succeeds
   - ✅ One fails gracefully
   - ✅ No duplicate records
   - ✅ Data remains consistent

### Verification
```sql
-- Should return 1 (not 2)
SELECT COUNT(*) FROM journal_entries 
WHERE reference_id = '<bill_id>';
```

---

## 📊 Success Criteria

All tests should meet these criteria:

- ✅ **Atomicity**: All related records created together or none at all
- ✅ **Consistency**: Foreign keys valid, no orphaned records
- ✅ **Isolation**: Concurrent operations don't interfere
- ✅ **Durability**: Data persists after commit
- ✅ **Idempotency**: Duplicate operations prevented
- ✅ **Error Recovery**: Clean rollback on failures

---

## 🐛 Troubleshooting

### Issue: "Account mapping not found"
**Solution:** Configure Chart of Accounts with required accounts:
- Accounts Payable (AP)
- Inventory
- VAT Input (if using tax)

### Issue: "Warehouse required"
**Solution:** Ensure bill has Branch, Warehouse, and Cost Center assigned

### Issue: "Insufficient stock for return"
**Solution:** Verify product has available stock in the warehouse

### Issue: RPC not found
**Solution:** Run migration:
```bash
supabase db push
```

---

## 📝 Test Results Template

```
Test Date: ___________
Tester: ___________

[ ] Test 1: Bill Posting Atomicity - PASS / FAIL
    Notes: _________________________________

[ ] Test 2: Purchase Return Atomicity - PASS / FAIL
    Notes: _________________________________

[ ] Test 3: Idempotency - PASS / FAIL
    Notes: _________________________________

[ ] Test 4: Error Handling - PASS / FAIL
    Notes: _________________________________

[ ] Test 5: Concurrent Operations - PASS / FAIL
    Notes: _________________________________

Overall Result: PASS / FAIL
```

---

## 🎯 Next Steps After Testing

If all tests pass:
- ✅ Mark Phase 3.6 complete
- ✅ Deploy to production
- ✅ Monitor transaction logs

If tests fail:
- 🐛 Document failures
- 🔍 Review error logs
- 🔧 Apply fixes
- 🔄 Re-test

# 🛠️ Useful Commands - Vendor Credits System

## 📋 Quick Reference

This file contains all the useful SQL commands and queries for managing and monitoring the Vendor Credits system.

---

## 🔍 Verification Commands

### Quick Verification
```bash
# Run the quick verification script
psql -U your_username -d your_database -f quick_verify.sql
```

### Manual Verification
```sql
-- Count all vendor credits
SELECT COUNT(*) FROM vendor_credits WHERE reference_type = 'bill_return';

-- List all vendor credits
SELECT 
  vc.credit_number,
  c.name as company,
  s.name as supplier,
  vc.total_amount,
  vc.applied_amount,
  vc.status
FROM vendor_credits vc
JOIN companies c ON c.id = vc.company_id
JOIN suppliers s ON s.id = vc.supplier_id
WHERE vc.reference_type = 'bill_return'
ORDER BY c.name, vc.credit_number;
```

---

## 🚀 Migration Commands

### Run Full Migration
```sql
-- Process all eligible bills
SELECT * FROM create_vendor_credits_for_all_returns();
```

### Create Vendor Credit for Single Bill
```sql
-- Replace 'bill-id-here' with actual bill UUID
SELECT create_vendor_credit_from_bill_return('bill-id-here'::UUID);
```

### Check Migration Results
```sql
-- Get detailed results
SELECT 
  bill_id,
  bill_number,
  company_name,
  returned_amount,
  vendor_credit_id,
  status
FROM create_vendor_credits_for_all_returns()
ORDER BY company_name, bill_number;
```

---

## 📊 Monitoring Commands

### Check Vendor Credits Summary
```sql
SELECT 
  c.name as company,
  COUNT(vc.id) as total_credits,
  SUM(vc.total_amount) as total_amount,
  SUM(vc.applied_amount) as applied_amount,
  SUM(vc.total_amount - vc.applied_amount) as remaining_balance
FROM vendor_credits vc
JOIN companies c ON c.id = vc.company_id
WHERE vc.reference_type = 'bill_return'
GROUP BY c.name
ORDER BY c.name;
```

### Check Vendor Credits by Status
```sql
SELECT 
  status,
  COUNT(*) as count,
  SUM(total_amount) as total_amount,
  SUM(applied_amount) as applied_amount
FROM vendor_credits
WHERE reference_type = 'bill_return'
GROUP BY status
ORDER BY status;
```

### Find Unapplied Vendor Credits
```sql
SELECT 
  vc.credit_number,
  c.name as company,
  s.name as supplier,
  vc.total_amount,
  vc.applied_amount,
  (vc.total_amount - vc.applied_amount) as remaining
FROM vendor_credits vc
JOIN companies c ON c.id = vc.company_id
JOIN suppliers s ON s.id = vc.supplier_id
WHERE vc.reference_type = 'bill_return'
  AND vc.applied_amount < vc.total_amount
ORDER BY remaining DESC;
```

---

## 🔒 Testing DB Guards

### Test Duplicate Prevention
```sql
-- Try to create duplicate (should return existing ID)
SELECT create_vendor_credit_from_bill_return('existing-bill-id'::UUID);
```

### Test Deletion Prevention
```sql
-- Try to delete open vendor credit (should fail)
DELETE FROM vendor_credits 
WHERE status = 'open' 
  AND reference_type = 'bill_return' 
LIMIT 1;
-- Expected: ERROR: Cannot delete Vendor Credit with status: open
```

### Test Bill Deletion Prevention
```sql
-- Try to delete bill with vendor credit (should fail)
DELETE FROM bills 
WHERE id IN (
  SELECT source_purchase_invoice_id 
  FROM vendor_credits 
  WHERE reference_type = 'bill_return' 
  LIMIT 1
);
-- Expected: ERROR: Cannot delete bill with vendor credits
```

### Test Amount Validation
```sql
-- Try to create vendor credit with negative amount (should fail)
INSERT INTO vendor_credits (
  company_id, branch_id, supplier_id, credit_number, credit_date,
  subtotal, tax_amount, total_amount, applied_amount, status
) VALUES (
  'company-id', 'branch-id', 'supplier-id', 'TEST-001', CURRENT_DATE,
  -100, 0, -100, 0, 'open'
);
-- Expected: ERROR: check_vendor_credit_total_amount_positive
```

---

## 🔧 Maintenance Commands

### Find Bills Eligible for Vendor Credits
```sql
SELECT 
  b.id,
  b.bill_number,
  c.name as company,
  b.returned_amount,
  b.status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM vendor_credits vc 
      WHERE vc.source_purchase_invoice_id = b.id 
        AND vc.reference_type = 'bill_return'
    ) THEN 'Has VC'
    ELSE 'Missing VC'
  END as vc_status
FROM bills b
JOIN companies c ON c.id = b.company_id
WHERE b.returned_amount > 0
  AND b.status IN ('paid', 'partially_paid', 'fully_returned')
ORDER BY vc_status, c.name, b.bill_number;
```

### Check for Data Integrity Issues
```sql
-- Check for orphaned vendor credits
SELECT 
  vc.id,
  vc.credit_number,
  vc.source_purchase_invoice_id
FROM vendor_credits vc
WHERE vc.reference_type = 'bill_return'
  AND vc.source_purchase_invoice_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM bills b WHERE b.id = vc.source_purchase_invoice_id
  );
-- Expected: 0 rows

-- Check for amount mismatches
SELECT 
  b.bill_number,
  b.returned_amount as bill_amount,
  vc.total_amount as vc_amount,
  ABS(b.returned_amount - vc.total_amount) as difference
FROM bills b
JOIN vendor_credits vc ON vc.source_purchase_invoice_id = b.id
WHERE vc.reference_type = 'bill_return'
  AND b.returned_amount != vc.total_amount;
-- Expected: 0 rows
```

---

## 📈 Performance Commands

### Check Index Usage
```sql
-- Check if indexes are being used
EXPLAIN ANALYZE
SELECT vc.*
FROM vendor_credits vc
WHERE vc.source_purchase_invoice_id = 'bill-id-here'
  AND vc.reference_type = 'bill_return';
-- Should show "Index Scan" not "Seq Scan"
```

### Check Table Statistics
```sql
-- Get table statistics
SELECT 
  schemaname,
  tablename,
  n_live_tup as row_count,
  n_dead_tup as dead_rows,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE tablename = 'vendor_credits';
```

---

## 🗑️ Cleanup Commands (Use with Caution!)

### Delete Draft Vendor Credits
```sql
-- Only deletes draft status (safe)
DELETE FROM vendor_credits
WHERE status = 'draft'
  AND reference_type = 'bill_return';
```

### Cancel Vendor Credit (Instead of Deleting)
```sql
-- Safer than deleting
UPDATE vendor_credits
SET status = 'cancelled',
    updated_at = NOW()
WHERE id = 'vendor-credit-id'
  AND status IN ('draft', 'open');
```

---

## 📊 Reporting Commands

### Monthly Vendor Credits Report
```sql
SELECT 
  TO_CHAR(vc.credit_date, 'YYYY-MM') as month,
  c.name as company,
  COUNT(vc.id) as total_credits,
  SUM(vc.total_amount) as total_amount,
  SUM(vc.applied_amount) as applied_amount,
  SUM(vc.total_amount - vc.applied_amount) as remaining
FROM vendor_credits vc
JOIN companies c ON c.id = vc.company_id
WHERE vc.reference_type = 'bill_return'
GROUP BY TO_CHAR(vc.credit_date, 'YYYY-MM'), c.name
ORDER BY month DESC, c.name;
```

### Supplier-wise Vendor Credits
```sql
SELECT 
  s.name as supplier,
  COUNT(vc.id) as total_credits,
  SUM(vc.total_amount) as total_amount,
  SUM(vc.applied_amount) as applied_amount,
  SUM(vc.total_amount - vc.applied_amount) as remaining
FROM vendor_credits vc
JOIN suppliers s ON s.id = vc.supplier_id
WHERE vc.reference_type = 'bill_return'
GROUP BY s.name
ORDER BY total_amount DESC;
```

---

## 🔍 Debugging Commands

### Check Function Definitions
```sql
-- View function definition
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'create_vendor_credit_from_bill_return';
```

### Check Trigger Definitions
```sql
-- View trigger definition
SELECT 
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'vendor_credits'
ORDER BY trigger_name;
```

### Check Constraint Definitions
```sql
-- View constraint definitions
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'vendor_credits'::regclass
ORDER BY conname;
```

---

## 📝 Notes

- Always test commands in a development environment first
- Use transactions for bulk operations
- Regular backups before major changes
- Monitor performance after changes

---

**Last Updated:** 2026-01-06  
**Version:** 1.0.0


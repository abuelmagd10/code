# 🗄️ Vendor Credits Database Migration - Complete Guide

## 📋 Overview

This migration implements an automatic Vendor Credits system at the database level for bills that have returns. It creates vendor credits for all eligible bills and applies comprehensive database guards to ensure data integrity.

---

## ✅ What Was Accomplished

### 1. **Vendor Credits Created**
- ✅ 4 Vendor Credits created for bills with returns
- ✅ Total amount: 139,800 EGP
- ✅ All credits linked to source bills
- ✅ All amounts verified and matched

### 2. **Database Functions**
- ✅ `create_vendor_credit_from_bill_return(bill_id)` - Create VC for single bill
- ✅ `create_vendor_credits_for_all_returns()` - Batch process all eligible bills

### 3. **Database Guards**
- ✅ Unique partial index to prevent duplicates
- ✅ Check constraints for amount validation
- ✅ Triggers to prevent deletion and validate data
- ✅ Performance indexes

### 4. **Data Integrity**
- ✅ All required fields populated
- ✅ Full context linking (company, branch, cost_center, supplier, bill)
- ✅ Audit trail with notes and timestamps

---

## 📁 Files Created

### SQL Scripts:
1. **`scripts/094_create_vendor_credits_from_existing_returns.sql`**
   - Database functions for creating vendor credits
   - Single and batch processing capabilities

2. **`scripts/095_vendor_credits_db_guards_and_constraints.sql`**
   - Unique indexes
   - Check constraints
   - Triggers for data protection
   - Performance indexes

3. **`VENDOR_CREDITS_VERIFICATION_QUERIES.sql`**
   - 16 verification queries
   - Data integrity checks
   - Performance analysis

### Documentation:
4. **`VENDOR_CREDITS_DB_MIGRATION_GUIDE.md`**
   - Complete implementation guide
   - Step-by-step instructions
   - Troubleshooting tips

5. **`VENDOR_CREDITS_MIGRATION_SUCCESS_2026-01-06.md`**
   - Detailed success report
   - Statistics and results
   - Verification steps

6. **`README_VENDOR_CREDITS_DB_MIGRATION.md`** (this file)
   - Quick reference guide

### Node.js Scripts:
7. **`scripts/execute-vendor-credits-migration.js`**
   - Automated migration execution
   - Progress reporting
   - Error handling

---

## 🚀 Quick Start

### Option 1: Verify Existing Migration (Recommended)

The migration has already been executed successfully. To verify:

```sql
-- Check vendor credits count
SELECT COUNT(*) FROM vendor_credits WHERE reference_type = 'bill_return';
-- Expected: 4

-- View all vendor credits
SELECT 
  vc.credit_number,
  c.name as company,
  vc.total_amount,
  vc.status
FROM vendor_credits vc
JOIN companies c ON c.id = vc.company_id
WHERE vc.reference_type = 'bill_return'
ORDER BY c.name;
```

### Option 2: Re-run Migration (If Needed)

If you need to process new bills with returns:

```sql
-- Process all eligible bills
SELECT * FROM create_vendor_credits_for_all_returns();
```

---

## 📊 Migration Results

### Vendor Credits Created:

| Company | Bill | Returned Amount | Credit Number | Status |
|---------|------|-----------------|---------------|--------|
| FOODCAN | BILL-0001 | 5,000 | FOO-VC-0001 | open |
| VitaSlims | BILL-0001 | 4,800 | VIT-VC-0001 | open |
| تست | BILL-0001 | 100,000 | VC-VC-0001 | open |
| تست | BILL-0002 | 30,000 | VC-VC-0002 | open |

**Total:** 139,800 EGP

---

## 🔒 Database Guards Applied

### 1. Unique Constraint
```sql
idx_unique_vendor_credit_per_bill_return
```
- Prevents duplicate vendor credits for the same bill
- Partial index on (source_purchase_invoice_id, reference_type)

### 2. Check Constraints
```sql
check_vendor_credit_total_amount_positive
check_vendor_credit_applied_not_exceed_total
```
- Ensures total_amount > 0
- Ensures applied_amount <= total_amount

### 3. Triggers
- **prevent_vendor_credit_deletion**: Prevents deletion except draft/cancelled
- **validate_vendor_credit**: Validates required fields before insert/update
- **prevent_bill_deletion_with_vendor_credit**: Prevents bill deletion if it has VCs

### 4. Performance Indexes
- `idx_vendor_credits_source_invoice_reference`
- `idx_vendor_credits_reference_lookup`
- `idx_vendor_credits_status_filter`

---

## ✅ Verification

### Run Verification Queries:

```bash
# Execute all verification queries
psql -f VENDOR_CREDITS_VERIFICATION_QUERIES.sql
```

Or run individual checks:

```sql
-- 1. Count vendor credits
SELECT COUNT(*) FROM vendor_credits WHERE reference_type = 'bill_return';

-- 2. Verify amounts match
SELECT 
  b.bill_number,
  b.returned_amount,
  vc.total_amount,
  CASE WHEN b.returned_amount = vc.total_amount THEN '✅' ELSE '❌' END
FROM bills b
JOIN vendor_credits vc ON vc.source_purchase_invoice_id = b.id
WHERE vc.reference_type = 'bill_return';

-- 3. Test duplicate prevention
SELECT create_vendor_credit_from_bill_return('existing-bill-id');
-- Should return existing ID, not create duplicate
```

---

## 🧪 Testing

### Test Scenarios:

1. **Create Vendor Credit for New Bill Return**
   ```sql
   -- If a new bill with return is added
   SELECT create_vendor_credit_from_bill_return('new-bill-id');
   ```

2. **Prevent Duplicate Creation**
   ```sql
   -- Try to create duplicate (should fail gracefully)
   SELECT create_vendor_credit_from_bill_return('existing-bill-id');
   ```

3. **Prevent Deletion**
   ```sql
   -- Try to delete open vendor credit (should fail)
   DELETE FROM vendor_credits WHERE status = 'open' LIMIT 1;
   ```

4. **Prevent Bill Deletion**
   ```sql
   -- Try to delete bill with VC (should fail)
   DELETE FROM bills WHERE id IN (
     SELECT source_purchase_invoice_id FROM vendor_credits LIMIT 1
   );
   ```

---

## 📚 Documentation

### For Detailed Information:

1. **Implementation Guide**: `VENDOR_CREDITS_DB_MIGRATION_GUIDE.md`
   - Complete step-by-step instructions
   - Troubleshooting guide
   - Expected results

2. **Success Report**: `VENDOR_CREDITS_MIGRATION_SUCCESS_2026-01-06.md`
   - Detailed migration results
   - Statistics and metrics
   - Verification steps

3. **System Documentation**: `docs/VENDOR_CREDITS_AUTOMATIC_SYSTEM.md`
   - Overall system architecture
   - Business logic
   - Integration points

---

## 🐛 Troubleshooting

### Issue: "Vendor Credit already exists"
**Solution:** This is expected behavior. The system prevents duplicates.

### Issue: "Cannot delete Vendor Credit"
**Solution:** Change status to 'cancelled' first, then delete.

### Issue: "Cannot delete Bill"
**Solution:** Delete or cancel associated Vendor Credits first.

### Issue: Function not found
**Solution:** Re-run `scripts/094_create_vendor_credits_from_existing_returns.sql`

---

## 📞 Support

For questions or issues:
1. Check `VENDOR_CREDITS_DB_MIGRATION_GUIDE.md`
2. Review `VENDOR_CREDITS_MIGRATION_SUCCESS_2026-01-06.md`
3. Run verification queries from `VENDOR_CREDITS_VERIFICATION_QUERIES.sql`

---

## ✅ Status

**Migration Status:** ✅ **COMPLETED SUCCESSFULLY**

- Date: 2026-01-06
- Bills Processed: 4
- Vendor Credits Created: 4
- Success Rate: 100%
- Total Amount: 139,800 EGP

**System Status:** ✅ **PRODUCTION READY**

- All guards applied
- All functions created
- All data verified
- Audit-ready

---

**Version:** 1.0.0  
**Last Updated:** 2026-01-06  
**Status:** ✅ Production Ready


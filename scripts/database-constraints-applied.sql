-- ============================================
-- Database Constraints Applied
-- Date: 21 December 2025
-- Purpose: Prevent duplicate document numbers
-- ============================================

-- ============================================
-- 1. INVOICES - Unique Constraint
-- ============================================
ALTER TABLE invoices 
ADD CONSTRAINT unique_invoice_number_per_company 
UNIQUE (invoice_number, company_id);

-- Status: ✅ Applied Successfully
-- Result: Prevents duplicate invoice numbers within the same company

-- ============================================
-- 2. BILLS - Unique Constraint
-- ============================================
ALTER TABLE bills 
ADD CONSTRAINT unique_bill_number_per_company 
UNIQUE (bill_number, company_id);

-- Status: ✅ Applied Successfully
-- Result: Prevents duplicate bill numbers within the same company

-- ============================================
-- 3. SALES ORDERS - Unique Constraint
-- ============================================
ALTER TABLE sales_orders 
ADD CONSTRAINT unique_so_number_per_company 
UNIQUE (so_number, company_id);

-- Status: ✅ Applied Successfully
-- Result: Prevents duplicate sales order numbers within the same company

-- ============================================
-- 4. PURCHASE ORDERS - Unique Constraint
-- ============================================
ALTER TABLE purchase_orders 
ADD CONSTRAINT unique_po_number_per_company 
UNIQUE (po_number, company_id);

-- Status: ✅ Applied Successfully
-- Result: Prevents duplicate purchase order numbers within the same company

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check for duplicate invoices
SELECT 
  invoice_number, 
  company_id, 
  COUNT(*) as count 
FROM invoices 
GROUP BY invoice_number, company_id 
HAVING COUNT(*) > 1;
-- Expected Result: 0 rows (no duplicates)

-- Check for duplicate bills
SELECT 
  bill_number, 
  company_id, 
  COUNT(*) as count 
FROM bills 
GROUP BY bill_number, company_id 
HAVING COUNT(*) > 1;
-- Expected Result: 0 rows (no duplicates)

-- Check for duplicate sales orders
SELECT 
  so_number, 
  company_id, 
  COUNT(*) as count 
FROM sales_orders 
GROUP BY so_number, company_id 
HAVING COUNT(*) > 1;
-- Expected Result: 0 rows (no duplicates)

-- Check for duplicate purchase orders
SELECT 
  po_number, 
  company_id, 
  COUNT(*) as count 
FROM purchase_orders 
GROUP BY po_number, company_id 
HAVING COUNT(*) > 1;
-- Expected Result: 0 rows (no duplicates)

-- ============================================
-- ROLLBACK (if needed)
-- ============================================
-- To remove these constraints, run:
-- ALTER TABLE invoices DROP CONSTRAINT unique_invoice_number_per_company;
-- ALTER TABLE bills DROP CONSTRAINT unique_bill_number_per_company;
-- ALTER TABLE sales_orders DROP CONSTRAINT unique_so_number_per_company;
-- ALTER TABLE purchase_orders DROP CONSTRAINT unique_po_number_per_company;

-- ============================================
-- NOTES
-- ============================================
-- 1. These constraints ensure data integrity
-- 2. Duplicate attempts will result in error: "duplicate key value violates unique constraint"
-- 3. Application code should handle this error gracefully
-- 4. All constraints are scoped per company_id to support multi-tenancy


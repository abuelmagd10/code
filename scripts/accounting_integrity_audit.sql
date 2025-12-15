-- =============================================
-- مراجعة سلامة القيود المحاسبية الشاملة
-- Comprehensive Accounting Integrity Audit
-- تاريخ: 2025-12-15
-- =============================================

-- =============================================
-- الجزء 1: القيود غير المتوازنة
-- Part 1: Unbalanced Journal Entries
-- =============================================
SELECT 
  '1. القيود غير المتوازنة' as audit_section,
  je.id as journal_entry_id,
  je.reference_type,
  je.reference_id,
  je.entry_date,
  je.description,
  COALESCE(SUM(jel.debit_amount), 0) as total_debit,
  COALESCE(SUM(jel.credit_amount), 0) as total_credit,
  COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0) as difference
FROM journal_entries je
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
GROUP BY je.id, je.reference_type, je.reference_id, je.entry_date, je.description
HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.01
ORDER BY ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) DESC;

-- =============================================
-- الجزء 2: الفواتير المدفوعة بدون قيود محاسبية
-- Part 2: Paid Invoices Without Journal Entries
-- =============================================
SELECT 
  '2. فواتير مدفوعة بدون قيود' as audit_section,
  i.id as invoice_id,
  i.invoice_number,
  i.status,
  i.total_amount,
  i.paid_amount,
  i.invoice_date
FROM invoices i
WHERE i.status IN ('paid', 'partially_paid')
  AND (i.is_deleted IS NULL OR i.is_deleted = false)
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je 
    WHERE je.reference_id = i.id 
    AND je.reference_type IN ('invoice', 'invoice_payment')
  )
ORDER BY i.invoice_date DESC;

-- =============================================
-- الجزء 3: فواتير الشراء المدفوعة بدون قيود
-- Part 3: Paid Bills Without Journal Entries
-- =============================================
SELECT 
  '3. فواتير شراء مدفوعة بدون قيود' as audit_section,
  b.id as bill_id,
  b.bill_number,
  b.status,
  b.total_amount,
  b.paid_amount,
  b.bill_date
FROM bills b
WHERE b.status IN ('paid', 'partially_paid')
  AND (b.is_deleted IS NULL OR b.is_deleted = false)
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je 
    WHERE je.reference_id = b.id 
    AND je.reference_type IN ('bill', 'bill_payment')
  )
ORDER BY b.bill_date DESC;

-- =============================================
-- الجزء 4: مرتجعات بيع بدون قيود عكسية
-- Part 4: Sales Returns Without Journal Entries
-- =============================================
SELECT 
  '4. مرتجعات بيع بدون قيود' as audit_section,
  sr.id as return_id,
  sr.return_number,
  sr.status,
  sr.total_amount,
  sr.return_date,
  sr.journal_entry_id
FROM sales_returns sr
WHERE sr.status = 'completed'
  AND sr.journal_entry_id IS NULL
ORDER BY sr.return_date DESC;

-- =============================================
-- الجزء 5: مرتجعات مشتريات بدون قيود عكسية
-- Part 5: Purchase Returns Without Journal Entries
-- =============================================
SELECT 
  '5. مرتجعات مشتريات بدون قيود' as audit_section,
  pr.id as return_id,
  pr.return_number,
  pr.status,
  pr.total_amount,
  pr.return_date,
  pr.journal_entry_id
FROM purchase_returns pr
WHERE pr.status = 'completed'
  AND pr.journal_entry_id IS NULL
ORDER BY pr.return_date DESC;

-- =============================================
-- الجزء 6: مدفوعات بدون قيود محاسبية
-- Part 6: Payments Without Journal Entries
-- =============================================
SELECT 
  '6. مدفوعات بدون قيود' as audit_section,
  p.id as payment_id,
  p.amount,
  p.payment_date,
  p.payment_method,
  CASE 
    WHEN p.customer_id IS NOT NULL THEN 'customer'
    WHEN p.supplier_id IS NOT NULL THEN 'supplier'
    ELSE 'unknown'
  END as payment_type,
  p.invoice_id,
  p.bill_id
FROM payments p
WHERE NOT EXISTS (
  SELECT 1 FROM journal_entries je 
  WHERE (je.reference_id = p.id OR je.reference_id = p.invoice_id OR je.reference_id = p.bill_id)
    AND je.reference_type IN ('customer_payment', 'supplier_payment', 'invoice_payment', 'bill_payment')
)
ORDER BY p.payment_date DESC;

-- =============================================
-- الجزء 7: قيود COGS مفقودة للفواتير المدفوعة
-- Part 7: Missing COGS Entries for Paid Invoices
-- =============================================
SELECT 
  '7. قيود COGS مفقودة' as audit_section,
  i.id as invoice_id,
  i.invoice_number,
  i.status,
  i.total_amount,
  i.invoice_date
FROM invoices i
WHERE i.status IN ('paid', 'partially_paid')
  AND (i.is_deleted IS NULL OR i.is_deleted = false)
  AND EXISTS (
    SELECT 1 FROM invoice_items ii 
    JOIN products p ON ii.product_id = p.id 
    WHERE ii.invoice_id = i.id 
    AND p.item_type = 'product'
    AND COALESCE(p.cost_price, 0) > 0
  )
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je 
    WHERE je.reference_id = i.id 
    AND je.reference_type = 'invoice_cogs'
  )
ORDER BY i.invoice_date DESC;

-- =============================================
-- الجزء 8: قيود إهلاك مخزون بدون ربط
-- Part 8: Write-off Entries Without Proper Link
-- =============================================
SELECT 
  '8. إهلاكات بدون ربط صحيح' as audit_section,
  wo.id as write_off_id,
  wo.write_off_number,
  wo.status,
  wo.total_cost,
  wo.write_off_date,
  wo.journal_entry_id
FROM inventory_write_offs wo
WHERE wo.status = 'approved'
  AND wo.journal_entry_id IS NULL
ORDER BY wo.write_off_date DESC;

-- =============================================
-- الجزء 9: ملخص حالة التدقيق
-- Part 9: Audit Summary
-- =============================================
SELECT
  'ملخص التدقيق' as report_section,
  (SELECT COUNT(*) FROM (
    SELECT je.id FROM journal_entries je
    LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    GROUP BY je.id
    HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.01
  ) unbalanced) as unbalanced_entries_count,

  (SELECT COUNT(*) FROM invoices i
   WHERE i.status IN ('paid', 'partially_paid')
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = i.id AND je.reference_type IN ('invoice', 'invoice_payment'))
  ) as paid_invoices_without_entries,

  (SELECT COUNT(*) FROM bills b
   WHERE b.status IN ('paid', 'partially_paid')
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = b.id AND je.reference_type IN ('bill', 'bill_payment'))
  ) as paid_bills_without_entries,

  (SELECT COUNT(*) FROM sales_returns sr WHERE sr.status = 'completed' AND sr.journal_entry_id IS NULL
  ) as sales_returns_without_entries,

  (SELECT COALESCE(SUM(jel.debit_amount), 0) FROM journal_entry_lines jel) as total_system_debit,
  (SELECT COALESCE(SUM(jel.credit_amount), 0) FROM journal_entry_lines jel) as total_system_credit,
  (SELECT COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0) FROM journal_entry_lines jel) as system_balance_difference;

-- =============================================
-- الجزء 10: التحقق من توازن الحسابات
-- Part 10: Account Balance Verification
-- =============================================
SELECT
  'توازن الحسابات' as report_section,
  ca.account_type,
  SUM(CASE
    WHEN ca.account_type IN ('asset', 'expense') THEN jel.debit_amount - jel.credit_amount
    ELSE jel.credit_amount - jel.debit_amount
  END) as net_balance
FROM chart_of_accounts ca
JOIN journal_entry_lines jel ON jel.account_id = ca.id
GROUP BY ca.account_type
ORDER BY ca.account_type;

-- =============================================
-- الجزء 11: فحص القيود المكررة
-- Part 11: Check Duplicate Entries
-- =============================================
SELECT
  '11. قيود مكررة محتملة' as audit_section,
  je.reference_type,
  je.reference_id,
  COUNT(*) as entry_count,
  STRING_AGG(je.id::text, ', ') as entry_ids
FROM journal_entries je
WHERE je.reference_id IS NOT NULL
  AND je.reference_type NOT IN ('manual_entry')
GROUP BY je.reference_type, je.reference_id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- =============================================
-- الجزء 12: القيود بدون سطور
-- Part 12: Journal Entries Without Lines
-- =============================================
SELECT
  '12. قيود بدون سطور' as audit_section,
  je.id as journal_entry_id,
  je.reference_type,
  je.reference_id,
  je.entry_date,
  je.description
FROM journal_entries je
WHERE NOT EXISTS (
  SELECT 1 FROM journal_entry_lines jel WHERE jel.journal_entry_id = je.id
)
ORDER BY je.entry_date DESC;

-- =============================================
-- الجزء 13: سطور قيود بحسابات محذوفة/غير موجودة
-- Part 13: Journal Lines with Invalid Accounts
-- =============================================
SELECT
  '13. سطور بحسابات غير صالحة' as audit_section,
  jel.id as line_id,
  jel.journal_entry_id,
  jel.account_id,
  jel.debit_amount,
  jel.credit_amount,
  jel.description
FROM journal_entry_lines jel
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.id = jel.account_id
);

-- =============================================
-- الجزء 14: إحصائيات القيود حسب النوع
-- Part 14: Journal Entries Statistics by Type
-- =============================================
SELECT
  '14. إحصائيات حسب نوع القيد' as audit_section,
  je.reference_type,
  COUNT(*) as entry_count,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit
FROM journal_entries je
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
GROUP BY je.reference_type
ORDER BY COUNT(*) DESC;

-- =============================================
-- الجزء 15: فحص تطابق الذمم المدينة
-- Part 15: Accounts Receivable Reconciliation
-- =============================================
SELECT
  '15. تطابق الذمم المدينة' as audit_section,
  (SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0)
   FROM invoices
   WHERE status IN ('sent', 'partially_paid')
   AND (is_deleted IS NULL OR is_deleted = false)
  ) as invoices_outstanding,
  (SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
   FROM journal_entry_lines jel
   JOIN chart_of_accounts ca ON ca.id = jel.account_id
   WHERE ca.sub_type = 'accounts_receivable'
  ) as ar_ledger_balance;

-- =============================================
-- الجزء 16: فحص تطابق الذمم الدائنة
-- Part 16: Accounts Payable Reconciliation
-- =============================================
SELECT
  '16. تطابق الذمم الدائنة' as audit_section,
  (SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0)
   FROM bills
   WHERE status IN ('sent', 'partially_paid', 'received')
   AND (is_deleted IS NULL OR is_deleted = false)
  ) as bills_outstanding,
  (SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0)
   FROM journal_entry_lines jel
   JOIN chart_of_accounts ca ON ca.id = jel.account_id
   WHERE ca.sub_type = 'accounts_payable'
  ) as ap_ledger_balance;

-- =============================================
-- الجزء 17: قيود يومية بقيم سالبة (غير مسموحة)
-- Part 17: Journal Lines with Negative Values
-- =============================================
SELECT
  '17. سطور بقيم سالبة' as audit_section,
  jel.id as line_id,
  jel.journal_entry_id,
  je.reference_type,
  jel.debit_amount,
  jel.credit_amount,
  jel.description
FROM journal_entry_lines jel
JOIN journal_entries je ON je.id = jel.journal_entry_id
WHERE jel.debit_amount < 0 OR jel.credit_amount < 0;

-- =============================================
-- الجزء 18: التحقق النهائي - الميزانية العمومية
-- Part 18: Final Check - Balance Sheet
-- =============================================
SELECT
  '18. الميزانية العمومية المختصرة' as report_section,
  SUM(CASE WHEN ca.account_type = 'asset' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) as total_assets,
  SUM(CASE WHEN ca.account_type = 'liability' THEN jel.credit_amount - jel.debit_amount ELSE 0 END) as total_liabilities,
  SUM(CASE WHEN ca.account_type = 'equity' THEN jel.credit_amount - jel.debit_amount ELSE 0 END) as total_equity,
  SUM(CASE WHEN ca.account_type = 'income' THEN jel.credit_amount - jel.debit_amount ELSE 0 END) as total_income,
  SUM(CASE WHEN ca.account_type = 'expense' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) as total_expenses,
  SUM(CASE WHEN ca.account_type = 'asset' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) -
  (SUM(CASE WHEN ca.account_type = 'liability' THEN jel.credit_amount - jel.debit_amount ELSE 0 END) +
   SUM(CASE WHEN ca.account_type = 'equity' THEN jel.credit_amount - jel.debit_amount ELSE 0 END) +
   SUM(CASE WHEN ca.account_type = 'income' THEN jel.credit_amount - jel.debit_amount ELSE 0 END) -
   SUM(CASE WHEN ca.account_type = 'expense' THEN jel.debit_amount - jel.credit_amount ELSE 0 END)
  ) as balance_sheet_difference
FROM journal_entry_lines jel
JOIN chart_of_accounts ca ON ca.id = jel.account_id;

-- =====================================================
-- تشخيص الفواتير المتبقية بدون قيود محاسبية
-- =====================================================

-- 1. عرض تفاصيل الفواتير المتبقية
SELECT 
  '1. Missing Bills Details' AS check_type,
  b.id AS bill_id,
  b.bill_number,
  b.bill_date,
  c.name AS company_name,
  b.company_id,
  b.status,
  b.subtotal,
  b.tax_amount,
  b.total_amount,
  COALESCE(b.shipping, 0) AS shipping,
  b.branch_id,
  b.cost_center_id,
  b.warehouse_id
FROM bills b
JOIN companies c ON c.id = b.company_id
WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.reference_type = 'bill'
      AND je.reference_id = b.id
      AND je.deleted_at IS NULL
  )
ORDER BY b.bill_date;

-- 2. فحص الحسابات المطلوبة لكل شركة
WITH MissingBills AS (
  SELECT DISTINCT b.company_id
  FROM bills b
  WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.reference_type = 'bill'
        AND je.reference_id = b.id
        AND je.deleted_at IS NULL
    )
)
SELECT 
  '2. Required Accounts Check' AS check_type,
  c.name AS company_name,
  c.id AS company_id,
  (SELECT COUNT(*) FROM chart_of_accounts WHERE company_id = c.id AND sub_type = 'accounts_payable' AND is_active = true) AS ap_accounts,
  (SELECT COUNT(*) FROM chart_of_accounts WHERE company_id = c.id AND sub_type = 'inventory' AND is_active = true) AS inventory_accounts,
  (SELECT COUNT(*) FROM chart_of_accounts WHERE company_id = c.id AND account_type = 'expense' AND is_active = true) AS expense_accounts,
  (SELECT COUNT(*) FROM chart_of_accounts WHERE company_id = c.id AND account_type = 'asset' AND (sub_type = 'vat_input' OR account_name ILIKE '%vat%' OR account_name ILIKE '%ضريب%') AND is_active = true) AS vat_accounts,
  CASE
    WHEN (SELECT COUNT(*) FROM chart_of_accounts WHERE company_id = c.id AND sub_type = 'accounts_payable' AND is_active = true) = 0 THEN '❌ لا يوجد حساب AP'
    WHEN (SELECT COUNT(*) FROM chart_of_accounts WHERE company_id = c.id AND sub_type = 'inventory' AND is_active = true) = 0 
         AND (SELECT COUNT(*) FROM chart_of_accounts WHERE company_id = c.id AND account_type = 'expense' AND is_active = true) = 0 THEN '❌ لا يوجد حساب Inventory أو Expense'
    ELSE '✅ الحسابات متوفرة'
  END AS accounts_status
FROM MissingBills mb
JOIN companies c ON c.id = mb.company_id;

-- 3. فحص معرفات الحسابات المحددة لكل شركة
WITH MissingBills AS (
  SELECT DISTINCT b.company_id
  FROM bills b
  WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.reference_type = 'bill'
        AND je.reference_id = b.id
        AND je.deleted_at IS NULL
    )
)
SELECT 
  '3. Account IDs for Missing Bills' AS check_type,
  c.name AS company_name,
  (SELECT id FROM chart_of_accounts WHERE company_id = c.id AND sub_type = 'accounts_payable' AND is_active = true LIMIT 1) AS ap_account_id,
  (SELECT id FROM chart_of_accounts WHERE company_id = c.id AND sub_type = 'inventory' AND is_active = true LIMIT 1) AS inventory_account_id,
  (SELECT id FROM chart_of_accounts WHERE company_id = c.id AND account_type = 'expense' AND is_active = true LIMIT 1) AS expense_account_id,
  (SELECT id FROM chart_of_accounts WHERE company_id = c.id AND account_type = 'asset' AND (sub_type = 'vat_input' OR account_name ILIKE '%vat%' OR account_name ILIKE '%ضريب%') AND is_active = true LIMIT 1) AS vat_account_id
FROM MissingBills mb
JOIN companies c ON c.id = mb.company_id;

-- 4. فحص ما إذا كانت هناك قيود محاسبية موجودة بالفعل ولكن محذوفة
SELECT 
  '4. Deleted Journal Entries Check' AS check_type,
  b.bill_number,
  b.total_amount,
  COUNT(je.id) AS deleted_journal_count,
  STRING_AGG(je.id::text, ', ') AS deleted_journal_ids
FROM bills b
LEFT JOIN journal_entries je ON je.reference_type = 'bill' AND je.reference_id = b.id
WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je2
    WHERE je2.reference_type = 'bill'
      AND je2.reference_id = b.id
      AND je2.deleted_at IS NULL
  )
  AND je.deleted_at IS NOT NULL
GROUP BY b.bill_number, b.total_amount
ORDER BY b.bill_number;

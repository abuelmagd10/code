-- =====================================================
-- إصلاح الفواتير المتبقية بدون قيود محاسبية
-- مع التحقق من الحالة وتجاوز الـ trigger عند الحاجة
-- =====================================================

-- 1. عرض حالة الفواتير المتبقية
SELECT 
  '1. Missing Bills Status' AS check_type,
  b.bill_number,
  b.status,
  b.total_amount,
  c.name AS company_name,
  CASE
    WHEN b.status IN ('paid', 'partially_paid') THEN '✅ يمكن إنشاء قيود'
    WHEN b.status IN ('sent', 'received') THEN '⚠️ يحتاج تجاوز trigger'
    ELSE '❌ حالة غير صالحة'
  END AS action_required
FROM bills b
JOIN companies c ON c.id = b.company_id
WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.reference_type = 'bill'
      AND je.reference_id = b.id
      AND je.deleted_at IS NULL
  )
ORDER BY b.status, b.bill_date;

-- 2. إنشاء قيود للفواتير المدفوعة (paid/partially_paid) - لا تحتاج تجاوز trigger
INSERT INTO journal_entries (
  company_id,
  reference_type,
  reference_id,
  entry_date,
  description,
  branch_id,
  cost_center_id,
  status
)
SELECT
  b.company_id,
  'bill',
  b.id,
  b.bill_date,
  'قيد فاتورة شراء مفقود: ' || b.bill_number,
  b.branch_id,
  b.cost_center_id,
  'posted'
FROM bills b
WHERE b.status IN ('paid', 'partially_paid')
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.reference_type = 'bill'
      AND je.reference_id = b.id
      AND je.deleted_at IS NULL
  )
ON CONFLICT DO NOTHING;

-- 3. إنشاء قيود للفواتير sent/received مع تجاوز الـ trigger
-- نستخدم session_replication_role = replica لتعطيل triggers مؤقتاً
SET session_replication_role = replica;

INSERT INTO journal_entries (
  company_id,
  reference_type,
  reference_id,
  entry_date,
  description,
  branch_id,
  cost_center_id,
  status
)
SELECT
  b.company_id,
  'bill',
  b.id,
  b.bill_date,
  'قيد فاتورة شراء مفقود (تم تجاوز trigger): ' || b.bill_number,
  b.branch_id,
  b.cost_center_id,
  'posted'
FROM bills b
WHERE b.status IN ('sent', 'received')
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.reference_type = 'bill'
      AND je.reference_id = b.id
      AND je.deleted_at IS NULL
  )
ON CONFLICT DO NOTHING;

-- إعادة تفعيل triggers
SET session_replication_role = DEFAULT;

-- 4. إنشاء سطور القيود المحاسبية (Debit: Inventory/Expense)
INSERT INTO journal_entry_lines (
  journal_entry_id,
  account_id,
  debit_amount,
  credit_amount,
  description
)
SELECT
  je.id AS journal_entry_id,
  COALESCE(
    (SELECT id FROM chart_of_accounts WHERE company_id = b.company_id AND sub_type = 'inventory' AND is_active = true LIMIT 1),
    (SELECT id FROM chart_of_accounts WHERE company_id = b.company_id AND account_type = 'expense' AND is_active = true LIMIT 1)
  ) AS account_id,
  b.subtotal AS debit_amount,
  0 AS credit_amount,
  'قيمة المشتريات'
FROM bills b
JOIN journal_entries je ON je.reference_type = 'bill' AND je.reference_id = b.id
WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
  AND b.subtotal > 0
  AND je.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel
    WHERE jel.journal_entry_id = je.id
      AND jel.description = 'قيمة المشتريات'
  );

-- 5. إنشاء سطور القيود المحاسبية (Debit: VAT Input)
INSERT INTO journal_entry_lines (
  journal_entry_id,
  account_id,
  debit_amount,
  credit_amount,
  description
)
SELECT
  je.id AS journal_entry_id,
  (SELECT id FROM chart_of_accounts 
   WHERE company_id = b.company_id 
     AND account_type = 'asset' 
     AND (sub_type = 'vat_input' OR account_name ILIKE '%vat%' OR account_name ILIKE '%ضريب%')
     AND is_active = true 
   LIMIT 1) AS account_id,
  b.tax_amount AS debit_amount,
  0 AS credit_amount,
  'ضريبة المدخلات'
FROM bills b
JOIN journal_entries je ON je.reference_type = 'bill' AND je.reference_id = b.id
WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
  AND b.tax_amount > 0
  AND je.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM chart_of_accounts 
    WHERE company_id = b.company_id 
      AND account_type = 'asset' 
      AND (sub_type = 'vat_input' OR account_name ILIKE '%vat%' OR account_name ILIKE '%ضريب%')
      AND is_active = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel
    WHERE jel.journal_entry_id = je.id
      AND jel.description = 'ضريبة المدخلات'
  );

-- 6. إنشاء سطور القيود المحاسبية (Debit: Shipping)
INSERT INTO journal_entry_lines (
  journal_entry_id,
  account_id,
  debit_amount,
  credit_amount,
  description
)
SELECT
  je.id AS journal_entry_id,
  (SELECT id FROM chart_of_accounts WHERE company_id = b.company_id AND account_type = 'expense' AND is_active = true LIMIT 1) AS account_id,
  COALESCE(b.shipping, 0) AS debit_amount,
  0 AS credit_amount,
  'مصاريف شحن المشتريات'
FROM bills b
JOIN journal_entries je ON je.reference_type = 'bill' AND je.reference_id = b.id
WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
  AND COALESCE(b.shipping, 0) > 0
  AND je.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM chart_of_accounts WHERE company_id = b.company_id AND account_type = 'expense' AND is_active = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel
    WHERE jel.journal_entry_id = je.id
      AND jel.description = 'مصاريف شحن المشتريات'
  );

-- 7. إنشاء سطور القيود المحاسبية (Credit: Accounts Payable)
INSERT INTO journal_entry_lines (
  journal_entry_id,
  account_id,
  debit_amount,
  credit_amount,
  description
)
SELECT
  je.id AS journal_entry_id,
  (SELECT id FROM chart_of_accounts WHERE company_id = b.company_id AND sub_type = 'accounts_payable' AND is_active = true LIMIT 1) AS account_id,
  0 AS debit_amount,
  b.total_amount AS credit_amount,
  'حسابات دائنة'
FROM bills b
JOIN journal_entries je ON je.reference_type = 'bill' AND je.reference_id = b.id
WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
  AND b.total_amount > 0
  AND je.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM chart_of_accounts WHERE company_id = b.company_id AND sub_type = 'accounts_payable' AND is_active = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel
    WHERE jel.journal_entry_id = je.id
      AND jel.description = 'حسابات دائنة'
  );

-- 8. التحقق من النتيجة
WITH BillTotals AS (
  SELECT
    COUNT(DISTINCT b.id) AS bills_with_journals,
    SUM(b.total_amount) AS total_bills_amount
  FROM bills b
  WHERE EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.reference_type = 'bill'
      AND je.reference_id = b.id
      AND je.deleted_at IS NULL
  )
),
MissingBills AS (
  SELECT
    COUNT(*) AS missing_count,
    SUM(total_amount) AS missing_amount
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
  'Verification' AS check_type,
  bt.bills_with_journals,
  bt.total_bills_amount,
  mb.missing_count,
  mb.missing_amount,
  CASE
    WHEN mb.missing_count = 0 THEN '✅ جميع الفواتير لها قيود محاسبية'
    ELSE '⚠️ لا تزال هناك فواتير بدون قيود'
  END AS status
FROM BillTotals bt
CROSS JOIN MissingBills mb;

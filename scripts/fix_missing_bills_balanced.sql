-- =====================================================
-- إصلاح الفواتير المتبقية بدون قيود محاسبية
-- مع ضمان التوازن الكامل للقيود
-- =====================================================

-- 1. عرض تفاصيل الفواتير المتبقية مع حساب المبالغ
SELECT 
  '1. Missing Bills Analysis' AS check_type,
  b.bill_number,
  b.status,
  b.subtotal,
  b.tax_amount,
  COALESCE(b.shipping, 0) AS shipping,
  b.total_amount,
  (b.subtotal + b.tax_amount + COALESCE(b.shipping, 0)) AS calculated_total,
  ABS(b.total_amount - (b.subtotal + b.tax_amount + COALESCE(b.shipping, 0))) AS difference,
  CASE
    WHEN ABS(b.total_amount - (b.subtotal + b.tax_amount + COALESCE(b.shipping, 0))) > 0.01 THEN '⚠️ المبالغ غير متطابقة'
    ELSE '✅ المبالغ متطابقة'
  END AS balance_status
FROM bills b
WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.reference_type = 'bill'
      AND je.reference_id = b.id
      AND je.deleted_at IS NULL
  )
ORDER BY b.bill_date;

-- 2. تعطيل triggers مؤقتاً
SET session_replication_role = replica;

-- 3. إنشاء قيود محاسبية للفواتير المتبقية
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
WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.reference_type = 'bill'
      AND je.reference_id = b.id
      AND je.deleted_at IS NULL
  )
ON CONFLICT DO NOTHING;

-- 4. إنشاء سطور القيود المحاسبية مع ضمان التوازن
-- 4.1 Debit: Inventory/Expense (subtotal)
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

-- 4.2 Debit: VAT Input (tax_amount)
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

-- 4.3 Debit: Shipping Expense (shipping)
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

-- 4.4 Credit: Accounts Payable (total_amount)
-- ✅ هذا هو المبلغ الكامل الذي يجب أن يساوي مجموع المدين
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

-- 5. التحقق من توازن القيود المحاسبية المنشأة
WITH JournalBalances AS (
  SELECT
    je.id AS journal_entry_id,
    je.description,
    b.bill_number,
    SUM(jel.debit_amount) AS total_debit,
    SUM(jel.credit_amount) AS total_credit,
    ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) AS imbalance
  FROM journal_entries je
  JOIN bills b ON b.id = je.reference_id
  WHERE je.reference_type = 'bill'
    AND je.deleted_at IS NULL
    AND je.description LIKE '%مفقود%'
  GROUP BY je.id, je.description, b.bill_number
)
SELECT
  '2. Journal Balance Check' AS check_type,
  journal_entry_id,
  bill_number,
  total_debit,
  total_credit,
  imbalance,
  CASE
    WHEN imbalance < 0.01 THEN '✅ متوازن'
    ELSE '❌ غير متوازن'
  END AS balance_status
FROM JournalBalances
ORDER BY imbalance DESC;

-- 6. إصلاح القيود غير المتوازنة (إذا كان هناك فرق، نضيفه كـ Debit إضافي)
-- هذا يحدث فقط إذا كان هناك خطأ في حساب المبالغ
WITH UnbalancedJournals AS (
  SELECT
    je.id AS journal_entry_id,
    b.bill_number,
    SUM(jel.debit_amount) AS total_debit,
    SUM(jel.credit_amount) AS total_credit,
    (SUM(jel.credit_amount) - SUM(jel.debit_amount)) AS difference
  FROM journal_entries je
  JOIN bills b ON b.id = je.reference_id
  LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.reference_type = 'bill'
    AND je.deleted_at IS NULL
    AND je.description LIKE '%مفقود%'
  GROUP BY je.id, b.bill_number
  HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01
)
INSERT INTO journal_entry_lines (
  journal_entry_id,
  account_id,
  debit_amount,
  credit_amount,
  description
)
SELECT
  uj.journal_entry_id,
  COALESCE(
    (SELECT id FROM chart_of_accounts coa
     JOIN journal_entries je ON je.company_id = coa.company_id
     WHERE je.id = uj.journal_entry_id
       AND coa.account_type = 'expense'
       AND coa.is_active = true
     LIMIT 1),
    (SELECT id FROM chart_of_accounts coa
     JOIN journal_entries je ON je.company_id = coa.company_id
     WHERE je.id = uj.journal_entry_id
       AND coa.sub_type = 'inventory'
       AND coa.is_active = true
     LIMIT 1)
  ) AS account_id,
  uj.difference AS debit_amount,
  0 AS credit_amount,
  'تسوية: فرق التوازن'
FROM UnbalancedJournals uj
WHERE uj.difference > 0.01
  AND NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel
    WHERE jel.journal_entry_id = uj.journal_entry_id
      AND jel.description = 'تسوية: فرق التوازن'
  );

-- 7. إعادة تفعيل triggers
SET session_replication_role = DEFAULT;

-- 8. التحقق النهائي
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
),
UnbalancedCount AS (
  SELECT COUNT(*) AS unbalanced_journals
  FROM (
    SELECT je.id
    FROM journal_entries je
    LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    WHERE je.reference_type = 'bill'
      AND je.deleted_at IS NULL
      AND je.description LIKE '%مفقود%'
    GROUP BY je.id
    HAVING ABS(SUM(COALESCE(jel.debit_amount, 0)) - SUM(COALESCE(jel.credit_amount, 0))) > 0.01
  ) uj
)
SELECT
  '3. Final Verification' AS check_type,
  bt.bills_with_journals,
  bt.total_bills_amount,
  mb.missing_count,
  mb.missing_amount,
  uc.unbalanced_journals,
  CASE
    WHEN mb.missing_count = 0 AND uc.unbalanced_journals = 0 THEN '✅ جميع الفواتير لها قيود متوازنة'
    WHEN mb.missing_count > 0 THEN '⚠️ لا تزال هناك فواتير بدون قيود'
    WHEN uc.unbalanced_journals > 0 THEN '⚠️ هناك قيود غير متوازنة'
    ELSE '✅'
  END AS status
FROM BillTotals bt
CROSS JOIN MissingBills mb
CROSS JOIN UnbalancedCount uc;

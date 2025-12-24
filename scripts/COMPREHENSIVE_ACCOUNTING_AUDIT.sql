-- =====================================================
-- 🔍 المراجعة المحاسبية الشاملة - Comprehensive Accounting Audit
-- =====================================================
-- تاريخ الإنشاء: 2025-01-XX
-- الهدف: مراجعة شاملة لجميع الجوانب المحاسبية والتقنية للنظام
-- =====================================================
--
-- هذا السكربت يغطي:
-- 1️⃣ المراجعة المحاسبية الشاملة
-- 2️⃣ مراجعة قاعدة البيانات
-- 3️⃣ المراجعة التقنية
-- 4️⃣ خطوات عملية للتحقق النهائي
--
-- =====================================================

-- =====================================================
-- 1️⃣ المراجعة المحاسبية الشاملة
-- =====================================================

-- =====================================================
-- أ. التحقق من القيود المحاسبية
-- =====================================================

-- 1.1: القيود غير المتوازنة (مجموع المدين ≠ مجموع الدائن)
-- =====================================================
SELECT 
  '1.1 - القيود غير المتوازنة' as audit_category,
  je.id as journal_entry_id,
  je.company_id,
  c.name as company_name,
  je.reference_type,
  je.reference_id,
  je.entry_date,
  je.description,
  COALESCE(SUM(jel.debit_amount), 0) as total_debit,
  COALESCE(SUM(jel.credit_amount), 0) as total_credit,
  ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) as difference,
  CASE 
    WHEN ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.01 THEN '❌ غير متوازن'
    ELSE '✅ متوازن'
  END as status
FROM journal_entries je
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
LEFT JOIN companies c ON c.id = je.company_id
WHERE je.status = 'posted' OR je.status IS NULL
GROUP BY je.id, je.company_id, c.name, je.reference_type, je.reference_id, je.entry_date, je.description
HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.01
ORDER BY ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) DESC;

-- 1.2: الفواتير بدون قيود محاسبية مرتبطة
-- =====================================================
SELECT 
  '1.2 - فواتير بدون قيود محاسبية' as audit_category,
  i.id as invoice_id,
  i.company_id,
  c.name as company_name,
  i.invoice_number,
  i.invoice_date,
  i.status,
  i.total_amount,
  i.paid_amount,
  CASE 
    WHEN i.status IN ('sent', 'paid', 'partially_paid') AND NOT EXISTS (
      SELECT 1 FROM journal_entries je 
      WHERE je.reference_id = i.id 
      AND je.reference_type IN ('invoice', 'invoice_payment')
    ) THEN '❌ بدون قيد'
    ELSE '✅ له قيد'
  END as status
FROM invoices i
LEFT JOIN companies c ON c.id = i.company_id
WHERE i.status IN ('sent', 'paid', 'partially_paid')
  AND (i.is_deleted IS NULL OR i.is_deleted = false)
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je 
    WHERE je.reference_id = i.id 
    AND je.reference_type IN ('invoice', 'invoice_payment')
  )
ORDER BY i.invoice_date DESC;

-- 1.3: فواتير الشراء (Bills) بدون قيود محاسبية
-- =====================================================
SELECT 
  '1.3 - فواتير شراء بدون قيود محاسبية' as audit_category,
  b.id as bill_id,
  b.company_id,
  c.name as company_name,
  b.bill_number,
  b.bill_date,
  b.status,
  b.total_amount,
  b.paid_amount,
  CASE 
    WHEN b.status IN ('sent', 'paid', 'partially_paid', 'received') AND NOT EXISTS (
      SELECT 1 FROM journal_entries je 
      WHERE je.reference_id = b.id 
      AND je.reference_type IN ('bill', 'bill_payment')
    ) THEN '❌ بدون قيد'
    ELSE '✅ له قيد'
  END as status
FROM bills b
LEFT JOIN companies c ON c.id = b.company_id
WHERE b.status IN ('sent', 'paid', 'partially_paid', 'received')
  AND (b.is_deleted IS NULL OR b.is_deleted = false)
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je 
    WHERE je.reference_id = b.id 
    AND je.reference_type IN ('bill', 'bill_payment')
  )
ORDER BY b.bill_date DESC;

-- 1.4: المدفوعات بدون قيود محاسبية
-- =====================================================
SELECT 
  '1.4 - مدفوعات بدون قيود محاسبية' as audit_category,
  p.id as payment_id,
  p.company_id,
  c.name as company_name,
  p.payment_date,
  p.amount,
  p.payment_method,
  CASE 
    WHEN p.customer_id IS NOT NULL THEN 'عميل'
    WHEN p.supplier_id IS NOT NULL THEN 'مورد'
    ELSE 'غير محدد'
  END as payment_type,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM journal_entries je 
      WHERE (je.reference_id = p.id OR je.reference_id = p.invoice_id OR je.reference_id = p.bill_id)
      AND je.reference_type IN ('customer_payment', 'supplier_payment', 'invoice_payment', 'bill_payment')
    ) THEN '❌ بدون قيد'
    ELSE '✅ له قيد'
  END as status
FROM payments p
LEFT JOIN companies c ON c.id = p.company_id
WHERE NOT EXISTS (
  SELECT 1 FROM journal_entries je 
  WHERE (je.reference_id = p.id OR je.reference_id = p.invoice_id OR je.reference_id = p.bill_id)
  AND je.reference_type IN ('customer_payment', 'supplier_payment', 'invoice_payment', 'bill_payment')
)
ORDER BY p.payment_date DESC;

-- 1.5: مراجعة قيود الاستهلاك والإهلاك
-- =====================================================
SELECT 
  '1.5 - قيود الإهلاك والاستهلاك' as audit_category,
  je.id as journal_entry_id,
  je.company_id,
  c.name as company_name,
  je.entry_date,
  je.description,
  ca.account_name as account_name,
  ca.account_type,
  jel.debit_amount,
  jel.credit_amount,
  CASE 
    WHEN je.description ILIKE '%إهلاك%' OR je.description ILIKE '%depreciation%' 
      OR ca.account_name ILIKE '%إهلاك%' OR ca.account_name ILIKE '%depreciation%' THEN '✅ قيد إهلاك'
    ELSE '⚠️ قد يكون إهلاك'
  END as status
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
JOIN chart_of_accounts ca ON ca.id = jel.account_id
LEFT JOIN companies c ON c.id = je.company_id
WHERE (je.description ILIKE '%إهلاك%' OR je.description ILIKE '%depreciation%' 
  OR ca.account_name ILIKE '%إهلاك%' OR ca.account_name ILIKE '%depreciation%')
ORDER BY je.entry_date DESC;

-- =====================================================
-- ب. مراجعة الحسابات
-- =====================================================

-- 1.6: أرصدة العملاء - مقارنة مع القيود المحاسبية
-- =====================================================
SELECT 
  '1.6 - أرصدة العملاء' as audit_category,
  cust.id as customer_id,
  cust.company_id,
  c.name as company_name,
  cust.name as customer_name,
  -- رصيد من الفواتير
  COALESCE((
    SELECT SUM(i.total_amount - COALESCE(i.paid_amount, 0))
    FROM invoices i
    WHERE i.customer_id = cust.id
      AND i.status IN ('sent', 'partially_paid')
      AND (i.is_deleted IS NULL OR i.is_deleted = false)
  ), 0) as invoice_balance,
  -- رصيد من القيود المحاسبية (AR)
  COALESCE((
    SELECT SUM(jel.debit_amount - jel.credit_amount)
    FROM journal_entry_lines jel
    JOIN chart_of_accounts ca ON ca.id = jel.account_id
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE ca.sub_type = 'accounts_receivable'
      AND je.company_id = cust.company_id
      AND EXISTS (
        SELECT 1 FROM invoices i2
        WHERE i2.customer_id = cust.id
          AND (je.reference_id = i2.id OR je.reference_id IN (
            SELECT p.id FROM payments p WHERE p.invoice_id = i2.id
          ))
      )
  ), 0) as ledger_balance,
  -- الفرق
  ABS(COALESCE((
    SELECT SUM(i.total_amount - COALESCE(i.paid_amount, 0))
    FROM invoices i
    WHERE i.customer_id = cust.id
      AND i.status IN ('sent', 'partially_paid')
      AND (i.is_deleted IS NULL OR i.is_deleted = false)
  ), 0) - COALESCE((
    SELECT SUM(jel.debit_amount - jel.credit_amount)
    FROM journal_entry_lines jel
    JOIN chart_of_accounts ca ON ca.id = jel.account_id
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE ca.sub_type = 'accounts_receivable'
      AND je.company_id = cust.company_id
      AND EXISTS (
        SELECT 1 FROM invoices i2
        WHERE i2.customer_id = cust.id
          AND (je.reference_id = i2.id OR je.reference_id IN (
            SELECT p.id FROM payments p WHERE p.invoice_id = i2.id
          ))
      )
  ), 0)) as difference,
  CASE 
    WHEN ABS(COALESCE((
      SELECT SUM(i.total_amount - COALESCE(i.paid_amount, 0))
      FROM invoices i
      WHERE i.customer_id = cust.id
        AND i.status IN ('sent', 'partially_paid')
        AND (i.is_deleted IS NULL OR i.is_deleted = false)
    ), 0) - COALESCE((
      SELECT SUM(jel.debit_amount - jel.credit_amount)
      FROM journal_entry_lines jel
      JOIN chart_of_accounts ca ON ca.id = jel.account_id
      JOIN journal_entries je ON je.id = jel.journal_entry_id
      WHERE ca.sub_type = 'accounts_receivable'
        AND je.company_id = cust.company_id
        AND EXISTS (
          SELECT 1 FROM invoices i2
          WHERE i2.customer_id = cust.id
            AND (je.reference_id = i2.id OR je.reference_id IN (
              SELECT p.id FROM payments p WHERE p.invoice_id = i2.id
            ))
        )
    ), 0)) > 0.01 THEN '❌ غير متطابق'
    ELSE '✅ متطابق'
  END as status
FROM customers cust
LEFT JOIN companies c ON c.id = cust.company_id
WHERE cust.is_active = true
GROUP BY cust.id, cust.company_id, c.name, cust.name
HAVING ABS(COALESCE((
    SELECT SUM(i.total_amount - COALESCE(i.paid_amount, 0))
    FROM invoices i
    WHERE i.customer_id = cust.id
      AND i.status IN ('sent', 'partially_paid')
      AND (i.is_deleted IS NULL OR i.is_deleted = false)
  ), 0) - COALESCE((
    SELECT SUM(jel.debit_amount - jel.credit_amount)
    FROM journal_entry_lines jel
    JOIN chart_of_accounts ca ON ca.id = jel.account_id
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE ca.sub_type = 'accounts_receivable'
      AND je.company_id = cust.company_id
      AND EXISTS (
        SELECT 1 FROM invoices i2
        WHERE i2.customer_id = cust.id
          AND (je.reference_id = i2.id OR je.reference_id IN (
            SELECT p.id FROM payments p WHERE p.invoice_id = i2.id
          ))
      )
  ), 0)) > 0.01
ORDER BY ABS(COALESCE((
    SELECT SUM(i.total_amount - COALESCE(i.paid_amount, 0))
    FROM invoices i
    WHERE i.customer_id = cust.id
      AND i.status IN ('sent', 'partially_paid')
      AND (i.is_deleted IS NULL OR i.is_deleted = false)
  ), 0) - COALESCE((
    SELECT SUM(jel.debit_amount - jel.credit_amount)
    FROM journal_entry_lines jel
    JOIN chart_of_accounts ca ON ca.id = jel.account_id
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE ca.sub_type = 'accounts_receivable'
      AND je.company_id = cust.company_id
      AND EXISTS (
        SELECT 1 FROM invoices i2
        WHERE i2.customer_id = cust.id
          AND (je.reference_id = i2.id OR je.reference_id IN (
            SELECT p.id FROM payments p WHERE p.invoice_id = i2.id
          ))
      )
  ), 0)) DESC;

-- 1.7: أرصدة الموردين - مقارنة مع القيود المحاسبية
-- =====================================================
SELECT 
  '1.7 - أرصدة الموردين' as audit_category,
  supp.id as supplier_id,
  supp.company_id,
  c.name as company_name,
  supp.name as supplier_name,
  -- رصيد من فواتير الشراء
  COALESCE((
    SELECT SUM(b.total_amount - COALESCE(b.paid_amount, 0))
    FROM bills b
    WHERE b.supplier_id = supp.id
      AND b.status IN ('sent', 'partially_paid', 'received')
      AND (b.is_deleted IS NULL OR b.is_deleted = false)
  ), 0) as bill_balance,
  -- رصيد من القيود المحاسبية (AP)
  COALESCE((
    SELECT SUM(jel.credit_amount - jel.debit_amount)
    FROM journal_entry_lines jel
    JOIN chart_of_accounts ca ON ca.id = jel.account_id
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE ca.sub_type = 'accounts_payable'
      AND je.company_id = supp.company_id
      AND EXISTS (
        SELECT 1 FROM bills b2
        WHERE b2.supplier_id = supp.id
          AND (je.reference_id = b2.id OR je.reference_id IN (
            SELECT p.id FROM payments p WHERE p.bill_id = b2.id
          ))
      )
  ), 0) as ledger_balance,
  -- الفرق
  ABS(COALESCE((
    SELECT SUM(b.total_amount - COALESCE(b.paid_amount, 0))
    FROM bills b
    WHERE b.supplier_id = supp.id
      AND b.status IN ('sent', 'partially_paid', 'received')
      AND (b.is_deleted IS NULL OR b.is_deleted = false)
  ), 0) - COALESCE((
    SELECT SUM(jel.credit_amount - jel.debit_amount)
    FROM journal_entry_lines jel
    JOIN chart_of_accounts ca ON ca.id = jel.account_id
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE ca.sub_type = 'accounts_payable'
      AND je.company_id = supp.company_id
      AND EXISTS (
        SELECT 1 FROM bills b2
        WHERE b2.supplier_id = supp.id
          AND (je.reference_id = b2.id OR je.reference_id IN (
            SELECT p.id FROM payments p WHERE p.bill_id = b2.id
          ))
      )
  ), 0)) as difference,
  CASE 
    WHEN ABS(COALESCE((
      SELECT SUM(b.total_amount - COALESCE(b.paid_amount, 0))
      FROM bills b
      WHERE b.supplier_id = supp.id
        AND b.status IN ('sent', 'partially_paid', 'received')
        AND (b.is_deleted IS NULL OR b.is_deleted = false)
    ), 0) - COALESCE((
      SELECT SUM(jel.credit_amount - jel.debit_amount)
      FROM journal_entry_lines jel
      JOIN chart_of_accounts ca ON ca.id = jel.account_id
      JOIN journal_entries je ON je.id = jel.journal_entry_id
      WHERE ca.sub_type = 'accounts_payable'
        AND je.company_id = supp.company_id
        AND EXISTS (
          SELECT 1 FROM bills b2
          WHERE b2.supplier_id = supp.id
            AND (je.reference_id = b2.id OR je.reference_id IN (
              SELECT p.id FROM payments p WHERE p.bill_id = b2.id
            ))
        )
    ), 0)) > 0.01 THEN '❌ غير متطابق'
    ELSE '✅ متطابق'
  END as status
FROM suppliers supp
LEFT JOIN companies c ON c.id = supp.company_id
WHERE supp.is_active = true
GROUP BY supp.id, supp.company_id, c.name, supp.name
HAVING ABS(COALESCE((
    SELECT SUM(b.total_amount - COALESCE(b.paid_amount, 0))
    FROM bills b
    WHERE b.supplier_id = supp.id
      AND b.status IN ('sent', 'partially_paid', 'received')
      AND (b.is_deleted IS NULL OR b.is_deleted = false)
  ), 0) - COALESCE((
    SELECT SUM(jel.credit_amount - jel.debit_amount)
    FROM journal_entry_lines jel
    JOIN chart_of_accounts ca ON ca.id = jel.account_id
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE ca.sub_type = 'accounts_payable'
      AND je.company_id = supp.company_id
      AND EXISTS (
        SELECT 1 FROM bills b2
        WHERE b2.supplier_id = supp.id
          AND (je.reference_id = b2.id OR je.reference_id IN (
            SELECT p.id FROM payments p WHERE p.bill_id = b2.id
          ))
      )
  ), 0)) > 0.01
ORDER BY ABS(COALESCE((
    SELECT SUM(b.total_amount - COALESCE(b.paid_amount, 0))
    FROM bills b
    WHERE b.supplier_id = supp.id
      AND b.status IN ('sent', 'partially_paid', 'received')
      AND (b.is_deleted IS NULL OR b.is_deleted = false)
  ), 0) - COALESCE((
    SELECT SUM(jel.credit_amount - jel.debit_amount)
    FROM journal_entry_lines jel
    JOIN chart_of_accounts ca ON ca.id = jel.account_id
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE ca.sub_type = 'accounts_payable'
      AND je.company_id = supp.company_id
      AND EXISTS (
        SELECT 1 FROM bills b2
        WHERE b2.supplier_id = supp.id
          AND (je.reference_id = b2.id OR je.reference_id IN (
            SELECT p.id FROM payments p WHERE p.bill_id = b2.id
          ))
      )
  ), 0)) DESC;

-- 1.8: الحسابات البنكية والنقدية - مقارنة مع القيود
-- =====================================================
SELECT 
  '1.8 - الحسابات البنكية والنقدية' as audit_category,
  ca.id as account_id,
  ca.company_id,
  c.name as company_name,
  ca.account_code,
  ca.account_name,
  ca.account_type,
  ca.sub_type,
  -- الرصيد من القيود
  COALESCE(SUM(
    CASE 
      WHEN ca.account_type = 'asset' THEN jel.debit_amount - jel.credit_amount
      ELSE jel.credit_amount - jel.debit_amount
    END
  ), 0) + COALESCE(ca.opening_balance, 0) as calculated_balance,
  -- الرصيد من account_balances (إن وجد)
  COALESCE((
    SELECT ab.debit_balance - ab.credit_balance
    FROM account_balances ab
    WHERE ab.account_id = ca.id
      AND ab.balance_date = (
        SELECT MAX(ab2.balance_date) 
        FROM account_balances ab2 
        WHERE ab2.account_id = ca.id
      )
  ), 0) as stored_balance,
  ABS(COALESCE(SUM(
    CASE 
      WHEN ca.account_type = 'asset' THEN jel.debit_amount - jel.credit_amount
      ELSE jel.credit_amount - jel.debit_amount
    END
  ), 0) + COALESCE(ca.opening_balance, 0) - COALESCE((
    SELECT ab.debit_balance - ab.credit_balance
    FROM account_balances ab
    WHERE ab.account_id = ca.id
      AND ab.balance_date = (
        SELECT MAX(ab2.balance_date) 
        FROM account_balances ab2 
        WHERE ab2.account_id = ca.id
      )
  ), 0)) as difference
FROM chart_of_accounts ca
LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND (je.status = 'posted' OR je.status IS NULL)
LEFT JOIN companies c ON c.id = ca.company_id
WHERE ca.sub_type IN ('cash', 'bank', 'checking', 'savings')
  AND ca.is_active = true
GROUP BY ca.id, ca.company_id, c.name, ca.account_code, ca.account_name, ca.account_type, ca.sub_type, ca.opening_balance
HAVING ABS(COALESCE(SUM(
    CASE 
      WHEN ca.account_type = 'asset' THEN jel.debit_amount - jel.credit_amount
      ELSE jel.credit_amount - jel.debit_amount
    END
  ), 0) + COALESCE(ca.opening_balance, 0) - COALESCE((
    SELECT ab.debit_balance - ab.credit_balance
    FROM account_balances ab
    WHERE ab.account_id = ca.id
      AND ab.balance_date = (
        SELECT MAX(ab2.balance_date) 
        FROM account_balances ab2 
        WHERE ab2.account_id = ca.id
      )
  ), 0)) > 0.01
ORDER BY difference DESC;

-- =====================================================
-- ج. تطابق مع Zoho Books
-- =====================================================

-- 1.9: تصنيف الحسابات - التحقق من التصنيفات المطلوبة
-- =====================================================
SELECT 
  '1.9 - تصنيف الحسابات (Zoho Books)' as audit_category,
  ca.company_id,
  c.name as company_name,
  ca.account_type,
  COUNT(*) as account_count,
  CASE 
    WHEN ca.account_type IN ('asset', 'liability', 'equity', 'income', 'expense') THEN '✅ تصنيف صحيح'
    ELSE '❌ تصنيف غير صحيح'
  END as status
FROM chart_of_accounts ca
LEFT JOIN companies c ON c.id = ca.company_id
WHERE ca.is_active = true
GROUP BY ca.company_id, c.name, ca.account_type
ORDER BY ca.company_id, ca.account_type;

-- 1.10: الإيرادات والمصروفات - التحقق من الدقة
-- =====================================================
SELECT 
  '1.10 - الإيرادات والمصروفات' as audit_category,
  ca.company_id,
  c.name as company_name,
  ca.account_type,
  COUNT(DISTINCT jel.journal_entry_id) as entry_count,
  COALESCE(SUM(
    CASE 
      WHEN ca.account_type = 'income' THEN jel.credit_amount - jel.debit_amount
      WHEN ca.account_type = 'expense' THEN jel.debit_amount - jel.credit_amount
      ELSE 0
    END
  ), 0) as total_amount,
  CASE 
    WHEN ca.account_type IN ('income', 'expense') THEN '✅ حساب إيراد/مصروف'
    ELSE '⚠️ ليس إيراد/مصروف'
  END as status
FROM chart_of_accounts ca
LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND (je.status = 'posted' OR je.status IS NULL)
LEFT JOIN companies c ON c.id = ca.company_id
WHERE ca.account_type IN ('income', 'expense')
  AND ca.is_active = true
GROUP BY ca.company_id, c.name, ca.account_type
ORDER BY ca.company_id, ca.account_type;

-- 1.11: الشحن والضرائب والخصومات - التحقق من الحسابات
-- =====================================================
SELECT 
  '1.11 - الشحن والضرائب والخصومات' as audit_category,
  i.id as invoice_id,
  i.company_id,
  c.name as company_name,
  i.invoice_number,
  i.subtotal,
  i.tax_amount,
  i.shipping,
  i.discount_value,
  i.total_amount,
  -- حساب المبلغ المتوقع
  (i.subtotal + COALESCE(i.tax_amount, 0) + COALESCE(i.shipping, 0) - COALESCE(i.discount_value, 0)) as calculated_total,
  ABS(i.total_amount - (i.subtotal + COALESCE(i.tax_amount, 0) + COALESCE(i.shipping, 0) - COALESCE(i.discount_value, 0))) as difference,
  CASE 
    WHEN ABS(i.total_amount - (i.subtotal + COALESCE(i.tax_amount, 0) + COALESCE(i.shipping, 0) - COALESCE(i.discount_value, 0))) > 0.01 THEN '❌ غير متطابق'
    ELSE '✅ متطابق'
  END as status
FROM invoices i
LEFT JOIN companies c ON c.id = i.company_id
WHERE (i.is_deleted IS NULL OR i.is_deleted = false)
GROUP BY i.id, i.company_id, c.name, i.invoice_number, i.subtotal, i.tax_amount, i.shipping, i.discount_value, i.total_amount
HAVING ABS(i.total_amount - (i.subtotal + COALESCE(i.tax_amount, 0) + COALESCE(i.shipping, 0) - COALESCE(i.discount_value, 0))) > 0.01
ORDER BY ABS(i.total_amount - (i.subtotal + COALESCE(i.tax_amount, 0) + COALESCE(i.shipping, 0) - COALESCE(i.discount_value, 0))) DESC;

-- =====================================================
-- 2️⃣ مراجعة قاعدة البيانات (Database Audit)
-- =====================================================

-- =====================================================
-- أ. تكامل البيانات
-- =====================================================

-- 2.1: سجلات مكررة في العملاء
-- =====================================================
SELECT 
  '2.1 - عملاء مكررون' as audit_category,
  company_id,
  name,
  email,
  COUNT(*) as duplicate_count,
  STRING_AGG(id::text, ', ') as customer_ids
FROM customers
WHERE is_active = true
GROUP BY company_id, name, email
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 2.2: سجلات مكررة في الموردين
-- =====================================================
SELECT 
  '2.2 - موردون مكررون' as audit_category,
  company_id,
  name,
  email,
  COUNT(*) as duplicate_count,
  STRING_AGG(id::text, ', ') as supplier_ids
FROM suppliers
WHERE is_active = true
GROUP BY company_id, name, email
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 2.3: فواتير مكررة
-- =====================================================
SELECT 
  '2.3 - فواتير مكررة' as audit_category,
  company_id,
  invoice_number,
  COUNT(*) as duplicate_count,
  STRING_AGG(id::text, ', ') as invoice_ids
FROM invoices
WHERE (is_deleted IS NULL OR is_deleted = false)
GROUP BY company_id, invoice_number
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 2.4: قيود بدون تاريخ
-- =====================================================
SELECT 
  '2.4 - قيود بدون تاريخ' as audit_category,
  je.id as journal_entry_id,
  je.company_id,
  c.name as company_name,
  je.reference_type,
  je.reference_id,
  je.entry_date,
  je.description
FROM journal_entries je
LEFT JOIN companies c ON c.id = je.company_id
WHERE je.entry_date IS NULL
ORDER BY je.created_at DESC;

-- 2.5: قيود بدون حساب مرتبط
-- =====================================================
SELECT 
  '2.5 - قيود بدون سطور (بدون حساب)' as audit_category,
  je.id as journal_entry_id,
  je.company_id,
  c.name as company_name,
  je.reference_type,
  je.reference_id,
  je.entry_date,
  je.description
FROM journal_entries je
LEFT JOIN companies c ON c.id = je.company_id
WHERE NOT EXISTS (
  SELECT 1 FROM journal_entry_lines jel WHERE jel.journal_entry_id = je.id
)
ORDER BY je.entry_date DESC;

-- 2.6: سطور قيود بحسابات غير موجودة
-- =====================================================
SELECT 
  '2.6 - سطور قيود بحسابات غير موجودة' as audit_category,
  jel.id as line_id,
  jel.journal_entry_id,
  jel.account_id,
  jel.debit_amount,
  jel.credit_amount,
  jel.description
FROM journal_entry_lines jel
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca.id = jel.account_id
)
ORDER BY jel.created_at DESC;

-- =====================================================
-- ب. الاتساق الداخلي
-- =====================================================

-- 2.7: التحقق من Foreign Key Integrity
-- =====================================================
-- ملاحظة: هذا الفحص يعتمد على قاعدة البيانات نفسها
-- يمكن استخدام: SELECT * FROM information_schema.table_constraints

-- 2.8: أرصدة الحسابات مقابل مجموع القيود
-- =====================================================
SELECT 
  '2.8 - أرصدة الحسابات مقابل القيود' as audit_category,
  ca.id as account_id,
  ca.company_id,
  c.name as company_name,
  ca.account_code,
  ca.account_name,
  ca.account_type,
  COALESCE(ca.opening_balance, 0) as opening_balance,
  COALESCE(SUM(
    CASE 
      WHEN ca.account_type IN ('asset', 'expense') THEN jel.debit_amount - jel.credit_amount
      ELSE jel.credit_amount - jel.debit_amount
    END
  ), 0) as movement_balance,
  COALESCE(ca.opening_balance, 0) + COALESCE(SUM(
    CASE 
      WHEN ca.account_type IN ('asset', 'expense') THEN jel.debit_amount - jel.credit_amount
      ELSE jel.credit_amount - jel.debit_amount
    END
  ), 0) as calculated_balance
FROM chart_of_accounts ca
LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND (je.status = 'posted' OR je.status IS NULL)
LEFT JOIN companies c ON c.id = ca.company_id
WHERE ca.is_active = true
GROUP BY ca.id, ca.company_id, c.name, ca.account_code, ca.account_name, ca.account_type, ca.opening_balance
ORDER BY ca.company_id, ca.account_code;

-- =====================================================
-- ج. التحقق من أنواع البيانات
-- =====================================================

-- 2.9: المبالغ المالية - التحقق من الدقة (decimal/float)
-- =====================================================
SELECT 
  '2.9 - فحص دقة المبالغ المالية' as audit_category,
  'journal_entry_lines' as table_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN debit_amount < 0 OR credit_amount < 0 THEN 1 END) as negative_amounts,
  COUNT(CASE WHEN debit_amount > 999999999999.99 OR credit_amount > 999999999999.99 THEN 1 END) as overflow_amounts
FROM journal_entry_lines
UNION ALL
SELECT 
  '2.9 - فحص دقة المبالغ المالية' as audit_category,
  'invoices' as table_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN total_amount < 0 THEN 1 END) as negative_amounts,
  COUNT(CASE WHEN total_amount > 999999999999.99 THEN 1 END) as overflow_amounts
FROM invoices
WHERE (is_deleted IS NULL OR is_deleted = false)
UNION ALL
SELECT 
  '2.9 - فحص دقة المبالغ المالية' as audit_category,
  'bills' as table_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN total_amount < 0 THEN 1 END) as negative_amounts,
  COUNT(CASE WHEN total_amount > 999999999999.99 THEN 1 END) as overflow_amounts
FROM bills
WHERE (is_deleted IS NULL OR is_deleted = false);

-- 2.10: التواريخ والأوقات - التحقق من الاتساق
-- =====================================================
SELECT 
  '2.10 - فحص التواريخ والأوقات' as audit_category,
  'journal_entries' as table_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN entry_date > CURRENT_DATE THEN 1 END) as future_dates,
  COUNT(CASE WHEN entry_date < '1900-01-01' THEN 1 END) as very_old_dates,
  COUNT(CASE WHEN entry_date IS NULL THEN 1 END) as null_dates
FROM journal_entries
UNION ALL
SELECT 
  '2.10 - فحص التواريخ والأوقات' as audit_category,
  'invoices' as table_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN invoice_date > CURRENT_DATE THEN 1 END) as future_dates,
  COUNT(CASE WHEN invoice_date < '1900-01-01' THEN 1 END) as very_old_dates,
  COUNT(CASE WHEN invoice_date IS NULL THEN 1 END) as null_dates
FROM invoices
WHERE (is_deleted IS NULL OR is_deleted = false)
UNION ALL
SELECT 
  '2.10 - فحص التواريخ والأوقات' as audit_category,
  'bills' as table_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN bill_date > CURRENT_DATE THEN 1 END) as future_dates,
  COUNT(CASE WHEN bill_date < '1900-01-01' THEN 1 END) as very_old_dates,
  COUNT(CASE WHEN bill_date IS NULL THEN 1 END) as null_dates
FROM bills
WHERE (is_deleted IS NULL OR is_deleted = false);

-- =====================================================
-- 4️⃣ خطوات عملية للتحقق النهائي
-- =====================================================

-- =====================================================
-- تقرير تسوية شامل لكل الحسابات
-- =====================================================

-- 4.1: تقرير تسوية شامل
-- =====================================================
SELECT 
  '4.1 - تقرير التسوية الشامل' as report_section,
  ca.company_id,
  c.name as company_name,
  ca.account_type,
  COUNT(DISTINCT ca.id) as account_count,
  COALESCE(SUM(ca.opening_balance), 0) as total_opening_balance,
  COALESCE(SUM(
    CASE 
      WHEN ca.account_type IN ('asset', 'expense') THEN jel.debit_amount - jel.credit_amount
      ELSE jel.credit_amount - jel.debit_amount
    END
  ), 0) as total_movements,
  COALESCE(SUM(ca.opening_balance), 0) + COALESCE(SUM(
    CASE 
      WHEN ca.account_type IN ('asset', 'expense') THEN jel.debit_amount - jel.credit_amount
      ELSE jel.credit_amount - jel.debit_amount
    END
  ), 0) as total_balance
FROM chart_of_accounts ca
LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND (je.status = 'posted' OR je.status IS NULL)
LEFT JOIN companies c ON c.id = ca.company_id
WHERE ca.is_active = true
GROUP BY ca.company_id, c.name, ca.account_type
ORDER BY ca.company_id, ca.account_type;

-- 4.2: أرصدة العملاء والموردين والبنك والنقدية والمخزون
-- =====================================================
SELECT 
  '4.2 - أرصدة رئيسية' as report_section,
  'العملاء (AR)' as account_category,
  ca.company_id,
  c.name as company_name,
  COALESCE(SUM(
    CASE 
      WHEN ca.account_type = 'asset' THEN jel.debit_amount - jel.credit_amount
      ELSE jel.credit_amount - jel.debit_amount
    END
  ), 0) + COALESCE(SUM(ca.opening_balance), 0) as total_balance
FROM chart_of_accounts ca
LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND (je.status = 'posted' OR je.status IS NULL)
LEFT JOIN companies c ON c.id = ca.company_id
WHERE ca.sub_type = 'accounts_receivable' AND ca.is_active = true
GROUP BY ca.company_id, c.name
UNION ALL
SELECT 
  '4.2 - أرصدة رئيسية' as report_section,
  'الموردين (AP)' as account_category,
  ca.company_id,
  c.name as company_name,
  COALESCE(SUM(
    CASE 
      WHEN ca.account_type = 'liability' THEN jel.credit_amount - jel.debit_amount
      ELSE jel.debit_amount - jel.credit_amount
    END
  ), 0) + COALESCE(SUM(ca.opening_balance), 0) as total_balance
FROM chart_of_accounts ca
LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND (je.status = 'posted' OR je.status IS NULL)
LEFT JOIN companies c ON c.id = ca.company_id
WHERE ca.sub_type = 'accounts_payable' AND ca.is_active = true
GROUP BY ca.company_id, c.name
UNION ALL
SELECT 
  '4.2 - أرصدة رئيسية' as report_section,
  'البنك' as account_category,
  ca.company_id,
  c.name as company_name,
  COALESCE(SUM(
    CASE 
      WHEN ca.account_type = 'asset' THEN jel.debit_amount - jel.credit_amount
      ELSE jel.credit_amount - jel.debit_amount
    END
  ), 0) + COALESCE(SUM(ca.opening_balance), 0) as total_balance
FROM chart_of_accounts ca
LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND (je.status = 'posted' OR je.status IS NULL)
LEFT JOIN companies c ON c.id = ca.company_id
WHERE ca.sub_type IN ('bank', 'checking', 'savings') AND ca.is_active = true
GROUP BY ca.company_id, c.name
UNION ALL
SELECT 
  '4.2 - أرصدة رئيسية' as report_section,
  'النقدية' as account_category,
  ca.company_id,
  c.name as company_name,
  COALESCE(SUM(
    CASE 
      WHEN ca.account_type = 'asset' THEN jel.debit_amount - jel.credit_amount
      ELSE jel.credit_amount - jel.debit_amount
    END
  ), 0) + COALESCE(SUM(ca.opening_balance), 0) as total_balance
FROM chart_of_accounts ca
LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND (je.status = 'posted' OR je.status IS NULL)
LEFT JOIN companies c ON c.id = ca.company_id
WHERE ca.sub_type = 'cash' AND ca.is_active = true
GROUP BY ca.company_id, c.name
UNION ALL
SELECT 
  '4.2 - أرصدة رئيسية' as report_section,
  'المخزون' as account_category,
  ca.company_id,
  c.name as company_name,
  COALESCE(SUM(
    CASE 
      WHEN ca.account_type = 'asset' THEN jel.debit_amount - jel.credit_amount
      ELSE jel.credit_amount - jel.debit_amount
    END
  ), 0) + COALESCE(SUM(ca.opening_balance), 0) as total_balance
FROM chart_of_accounts ca
LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND (je.status = 'posted' OR je.status IS NULL)
LEFT JOIN companies c ON c.id = ca.company_id
WHERE ca.sub_type = 'inventory' AND ca.is_active = true
GROUP BY ca.company_id, c.name
ORDER BY company_id, account_category;

-- 4.3: مراجعة القيود القديمة والجديدة
-- =====================================================
SELECT 
  '4.3 - مراجعة القيود' as report_section,
  je.company_id,
  c.name as company_name,
  je.reference_type,
  COUNT(*) as entry_count,
  MIN(je.entry_date) as oldest_entry_date,
  MAX(je.entry_date) as newest_entry_date,
  COUNT(CASE WHEN je.reference_type = 'manual_entry' AND je.description ILIKE '%تسوية%' OR je.description ILIKE '%adjustment%' THEN 1 END) as adjustment_entries_count
FROM journal_entries je
LEFT JOIN companies c ON c.id = je.company_id
WHERE (je.status = 'posted' OR je.status IS NULL)
GROUP BY je.company_id, c.name, je.reference_type
ORDER BY je.company_id, entry_count DESC;

-- 4.4: الميزانية العمومية (Balance Sheet)
-- =====================================================
SELECT 
  '4.4 - الميزانية العمومية' as report_section,
  ca.company_id,
  c.name as company_name,
  -- الأصول: opening_balance + movements
  SUM(CASE WHEN ca.account_type = 'asset' THEN COALESCE(ca.opening_balance, 0) ELSE 0 END) +
  SUM(CASE WHEN ca.account_type = 'asset' THEN COALESCE(jel.debit_amount - jel.credit_amount, 0) ELSE 0 END) as total_assets,
  -- الالتزامات: opening_balance + movements
  SUM(CASE WHEN ca.account_type = 'liability' THEN COALESCE(ca.opening_balance, 0) ELSE 0 END) +
  SUM(CASE WHEN ca.account_type = 'liability' THEN COALESCE(jel.credit_amount - jel.debit_amount, 0) ELSE 0 END) as total_liabilities,
  -- حقوق الملكية: opening_balance + movements
  SUM(CASE WHEN ca.account_type = 'equity' THEN COALESCE(ca.opening_balance, 0) ELSE 0 END) +
  SUM(CASE WHEN ca.account_type = 'equity' THEN COALESCE(jel.credit_amount - jel.debit_amount, 0) ELSE 0 END) as total_equity,
  -- الفرق في الميزانية
  (SUM(CASE WHEN ca.account_type = 'asset' THEN COALESCE(ca.opening_balance, 0) ELSE 0 END) +
   SUM(CASE WHEN ca.account_type = 'asset' THEN COALESCE(jel.debit_amount - jel.credit_amount, 0) ELSE 0 END)) -
  (SUM(CASE WHEN ca.account_type = 'liability' THEN COALESCE(ca.opening_balance, 0) ELSE 0 END) +
   SUM(CASE WHEN ca.account_type = 'liability' THEN COALESCE(jel.credit_amount - jel.debit_amount, 0) ELSE 0 END) +
   SUM(CASE WHEN ca.account_type = 'equity' THEN COALESCE(ca.opening_balance, 0) ELSE 0 END) +
   SUM(CASE WHEN ca.account_type = 'equity' THEN COALESCE(jel.credit_amount - jel.debit_amount, 0) ELSE 0 END)) as balance_sheet_difference
FROM chart_of_accounts ca
LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND (je.status = 'posted' OR je.status IS NULL)
LEFT JOIN companies c ON c.id = ca.company_id
WHERE ca.is_active = true
GROUP BY ca.company_id, c.name
ORDER BY ca.company_id;

-- 4.5: قائمة الدخل (P&L - Profit & Loss)
-- =====================================================
SELECT 
  '4.5 - قائمة الدخل' as report_section,
  ca.company_id,
  c.name as company_name,
  -- الإيرادات
  SUM(CASE WHEN ca.account_type = 'income' THEN COALESCE(jel.credit_amount - jel.debit_amount, 0) ELSE 0 END) as total_income,
  -- المصروفات
  SUM(CASE WHEN ca.account_type = 'expense' THEN COALESCE(jel.debit_amount - jel.credit_amount, 0) ELSE 0 END) as total_expenses,
  -- صافي الربح/الخسارة
  SUM(CASE WHEN ca.account_type = 'income' THEN COALESCE(jel.credit_amount - jel.debit_amount, 0) ELSE 0 END) - 
  SUM(CASE WHEN ca.account_type = 'expense' THEN COALESCE(jel.debit_amount - jel.credit_amount, 0) ELSE 0 END) as net_profit_loss
FROM chart_of_accounts ca
LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND (je.status = 'posted' OR je.status IS NULL)
LEFT JOIN companies c ON c.id = ca.company_id
WHERE ca.account_type IN ('income', 'expense') AND ca.is_active = true
GROUP BY ca.company_id, c.name
ORDER BY ca.company_id;

-- 4.6: ملخص شامل للمراجعة
-- =====================================================
SELECT 
  '4.6 - ملخص المراجعة الشاملة' as report_section,
  (SELECT COUNT(*) FROM (
    SELECT je.id FROM journal_entries je
    LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    WHERE (je.status = 'posted' OR je.status IS NULL)
    GROUP BY je.id
    HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.01
  ) unbalanced) as unbalanced_entries_count,
  (SELECT COUNT(*) FROM invoices i
   WHERE i.status IN ('sent', 'paid', 'partially_paid')
   AND (i.is_deleted IS NULL OR i.is_deleted = false)
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = i.id AND je.reference_type IN ('invoice', 'invoice_payment'))
  ) as invoices_without_entries,
  (SELECT COUNT(*) FROM bills b
   WHERE b.status IN ('sent', 'paid', 'partially_paid', 'received')
   AND (b.is_deleted IS NULL OR b.is_deleted = false)
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = b.id AND je.reference_type IN ('bill', 'bill_payment'))
  ) as bills_without_entries,
  (SELECT COUNT(*) FROM payments p
   WHERE NOT EXISTS (SELECT 1 FROM journal_entries je 
     WHERE (je.reference_id = p.id OR je.reference_id = p.invoice_id OR je.reference_id = p.bill_id)
     AND je.reference_type IN ('customer_payment', 'supplier_payment', 'invoice_payment', 'bill_payment'))
  ) as payments_without_entries,
  (SELECT COUNT(*) FROM customers cust
   WHERE cust.is_active = true
   GROUP BY cust.company_id, cust.name, cust.email
   HAVING COUNT(*) > 1
  ) as duplicate_customers,
  (SELECT COUNT(*) FROM suppliers supp
   WHERE supp.is_active = true
   GROUP BY supp.company_id, supp.name, supp.email
   HAVING COUNT(*) > 1
  ) as duplicate_suppliers,
  (SELECT COUNT(*) FROM journal_entries je WHERE je.entry_date IS NULL) as entries_without_date,
  (SELECT COUNT(*) FROM journal_entries je 
   WHERE NOT EXISTS (SELECT 1 FROM journal_entry_lines jel WHERE jel.journal_entry_id = je.id)
  ) as entries_without_lines,
  (SELECT COUNT(*) FROM journal_entry_lines jel
   WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts ca WHERE ca.id = jel.account_id)
  ) as lines_with_invalid_accounts,
  (SELECT COALESCE(SUM(jel.debit_amount), 0) FROM journal_entry_lines jel
   JOIN journal_entries je ON je.id = jel.journal_entry_id
   WHERE (je.status = 'posted' OR je.status IS NULL)
  ) as total_system_debit,
  (SELECT COALESCE(SUM(jel.credit_amount), 0) FROM journal_entry_lines jel
   JOIN journal_entries je ON je.id = jel.journal_entry_id
   WHERE (je.status = 'posted' OR je.status IS NULL)
  ) as total_system_credit,
  (SELECT ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) FROM journal_entry_lines jel
   JOIN journal_entries je ON je.id = jel.journal_entry_id
   WHERE (je.status = 'posted' OR je.status IS NULL)
  ) as system_balance_difference;

-- =====================================================
-- نهاية المراجعة المحاسبية الشاملة
-- =====================================================


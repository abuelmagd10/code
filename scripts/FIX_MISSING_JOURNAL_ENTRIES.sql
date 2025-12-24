-- =====================================================
-- 🔧 سكربت تحديد المشاكل للإصلاح
-- Script to Identify Missing Journal Entries for Fix
-- =====================================================
-- تاريخ الإنشاء: 2025-01-XX
-- الهدف: تحديد الفواتير والمدفوعات التي تحتاج قيود محاسبية
-- =====================================================

-- =====================================================
-- 1. الفواتير بدون قيود محاسبية (18 فاتورة)
-- =====================================================
SELECT 
  'فاتورة بدون قيد' as issue_type,
  i.id as invoice_id,
  i.company_id,
  c.name as company_name,
  i.invoice_number,
  i.invoice_date,
  i.due_date,
  i.status,
  i.subtotal,
  i.tax_amount,
  i.shipping,
  i.discount_value,
  i.total_amount,
  i.paid_amount,
  cust.name as customer_name,
  cust.id as customer_id,
  -- حساب المبلغ المتبقي
  (i.total_amount - COALESCE(i.paid_amount, 0)) as outstanding_amount,
  -- نوع القيد المطلوب
  CASE 
    WHEN i.status = 'sent' AND i.paid_amount = 0 THEN 'قيد AR/Revenue فقط'
    WHEN i.status = 'sent' AND i.paid_amount > 0 THEN 'قيد AR/Revenue + قيد الدفع'
    WHEN i.status = 'paid' THEN 'قيد AR/Revenue + قيد الدفع'
    WHEN i.status = 'partially_paid' THEN 'قيد AR/Revenue + قيد الدفع'
    ELSE 'تحقق من الحالة'
  END as required_entry_type
FROM invoices i
LEFT JOIN customers cust ON cust.id = i.customer_id
LEFT JOIN companies c ON c.id = i.company_id
WHERE i.status IN ('sent', 'paid', 'partially_paid')
  AND (i.is_deleted IS NULL OR i.is_deleted = false)
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je 
    WHERE je.reference_id = i.id 
    AND je.reference_type IN ('invoice', 'invoice_payment')
  )
ORDER BY i.invoice_date DESC, i.total_amount DESC;

-- =====================================================
-- 2. فواتير الشراء بدون قيود محاسبية (3 فواتير)
-- =====================================================
SELECT 
  'فاتورة شراء بدون قيد' as issue_type,
  b.id as bill_id,
  b.company_id,
  c.name as company_name,
  b.bill_number,
  b.bill_date,
  b.due_date,
  b.status,
  b.subtotal,
  b.tax_amount,
  b.total_amount,
  b.paid_amount,
  s.name as supplier_name,
  s.id as supplier_id,
  -- حساب المبلغ المتبقي
  (b.total_amount - COALESCE(b.paid_amount, 0)) as outstanding_amount,
  -- نوع القيد المطلوب
  CASE 
    WHEN b.status IN ('sent', 'received') AND b.paid_amount = 0 THEN 'قيد AP/Expense فقط'
    WHEN b.status IN ('sent', 'received') AND b.paid_amount > 0 THEN 'قيد AP/Expense + قيد الدفع'
    WHEN b.status = 'paid' THEN 'قيد AP/Expense + قيد الدفع'
    WHEN b.status = 'partially_paid' THEN 'قيد AP/Expense + قيد الدفع'
    ELSE 'تحقق من الحالة'
  END as required_entry_type
FROM bills b
LEFT JOIN suppliers s ON s.id = b.supplier_id
LEFT JOIN companies c ON c.id = b.company_id
WHERE b.status IN ('sent', 'paid', 'partially_paid', 'received')
  AND (b.is_deleted IS NULL OR b.is_deleted = false)
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je 
    WHERE je.reference_id = b.id 
    AND je.reference_type IN ('bill', 'bill_payment')
  )
ORDER BY b.bill_date DESC, b.total_amount DESC;

-- =====================================================
-- 3. المدفوعات بدون قيود محاسبية (55 دفعة)
-- =====================================================
SELECT 
  'دفعة بدون قيد' as issue_type,
  p.id as payment_id,
  p.company_id,
  c.name as company_name,
  p.payment_date,
  p.amount,
  p.payment_method,
  p.reference_number,
  CASE 
    WHEN p.customer_id IS NOT NULL THEN 'عميل'
    WHEN p.supplier_id IS NOT NULL THEN 'مورد'
    ELSE 'غير محدد'
  END as payment_type,
  p.customer_id,
  p.supplier_id,
  p.invoice_id,
  p.bill_id,
  -- معلومات العميل/المورد
  CASE 
    WHEN p.customer_id IS NOT NULL THEN (SELECT name FROM customers WHERE id = p.customer_id)
    WHEN p.supplier_id IS NOT NULL THEN (SELECT name FROM suppliers WHERE id = p.supplier_id)
    ELSE NULL
  END as party_name,
  -- معلومات الفاتورة/فاتورة الشراء
  CASE 
    WHEN p.invoice_id IS NOT NULL THEN (SELECT invoice_number FROM invoices WHERE id = p.invoice_id)
    WHEN p.bill_id IS NOT NULL THEN (SELECT bill_number FROM bills WHERE id = p.bill_id)
    ELSE NULL
  END as document_number,
  -- نوع القيد المطلوب
  CASE 
    WHEN p.customer_id IS NOT NULL AND p.invoice_id IS NOT NULL THEN 'قيد دفع عميل (Cash/Bank vs AR)'
    WHEN p.customer_id IS NOT NULL THEN 'قيد دفع عميل عام (Cash/Bank vs AR)'
    WHEN p.supplier_id IS NOT NULL AND p.bill_id IS NOT NULL THEN 'قيد دفع مورد (AP vs Cash/Bank)'
    WHEN p.supplier_id IS NOT NULL THEN 'قيد دفع مورد عام (AP vs Cash/Bank)'
    ELSE 'تحقق من نوع الدفعة'
  END as required_entry_type
FROM payments p
LEFT JOIN companies c ON c.id = p.company_id
WHERE NOT EXISTS (
  SELECT 1 FROM journal_entries je 
  WHERE (je.reference_id = p.id OR je.reference_id = p.invoice_id OR je.reference_id = p.bill_id)
  AND je.reference_type IN ('customer_payment', 'supplier_payment', 'invoice_payment', 'bill_payment')
)
ORDER BY p.payment_date DESC, p.amount DESC;

-- =====================================================
-- 4. ملخص المشاكل حسب الشركة
-- =====================================================
SELECT 
  'ملخص المشاكل' as report_type,
  c.id as company_id,
  c.name as company_name,
  (SELECT COUNT(*) FROM invoices i
   WHERE i.company_id = c.id
   AND i.status IN ('sent', 'paid', 'partially_paid')
   AND (i.is_deleted IS NULL OR i.is_deleted = false)
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = i.id AND je.reference_type IN ('invoice', 'invoice_payment'))
  ) as invoices_without_entries,
  (SELECT COUNT(*) FROM bills b
   WHERE b.company_id = c.id
   AND b.status IN ('sent', 'paid', 'partially_paid', 'received')
   AND (b.is_deleted IS NULL OR b.is_deleted = false)
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = b.id AND je.reference_type IN ('bill', 'bill_payment'))
  ) as bills_without_entries,
  (SELECT COUNT(*) FROM payments p
   WHERE p.company_id = c.id
   AND NOT EXISTS (SELECT 1 FROM journal_entries je 
     WHERE (je.reference_id = p.id OR je.reference_id = p.invoice_id OR je.reference_id = p.bill_id)
     AND je.reference_type IN ('customer_payment', 'supplier_payment', 'invoice_payment', 'bill_payment'))
  ) as payments_without_entries,
  (SELECT COUNT(*) FROM invoices i
   WHERE i.company_id = c.id
   AND i.status IN ('sent', 'paid', 'partially_paid')
   AND (i.is_deleted IS NULL OR i.is_deleted = false)
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = i.id AND je.reference_type IN ('invoice', 'invoice_payment'))
  ) + 
  (SELECT COUNT(*) FROM bills b
   WHERE b.company_id = c.id
   AND b.status IN ('sent', 'paid', 'partially_paid', 'received')
   AND (b.is_deleted IS NULL OR b.is_deleted = false)
   AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = b.id AND je.reference_type IN ('bill', 'bill_payment'))
  ) + 
  (SELECT COUNT(*) FROM payments p
   WHERE p.company_id = c.id
   AND NOT EXISTS (SELECT 1 FROM journal_entries je 
     WHERE (je.reference_id = p.id OR je.reference_id = p.invoice_id OR je.reference_id = p.bill_id)
     AND je.reference_type IN ('customer_payment', 'supplier_payment', 'invoice_payment', 'bill_payment'))
  ) as total_issues
FROM companies c
WHERE EXISTS (
  SELECT 1 FROM invoices i WHERE i.company_id = c.id
  AND i.status IN ('sent', 'paid', 'partially_paid')
  AND (i.is_deleted IS NULL OR i.is_deleted = false)
  AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = i.id AND je.reference_type IN ('invoice', 'invoice_payment'))
)
OR EXISTS (
  SELECT 1 FROM bills b WHERE b.company_id = c.id
  AND b.status IN ('sent', 'paid', 'partially_paid', 'received')
  AND (b.is_deleted IS NULL OR b.is_deleted = false)
  AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = b.id AND je.reference_type IN ('bill', 'bill_payment'))
)
OR EXISTS (
  SELECT 1 FROM payments p WHERE p.company_id = c.id
  AND NOT EXISTS (SELECT 1 FROM journal_entries je 
    WHERE (je.reference_id = p.id OR je.reference_id = p.invoice_id OR je.reference_id = p.bill_id)
    AND je.reference_type IN ('customer_payment', 'supplier_payment', 'invoice_payment', 'bill_payment'))
)
ORDER BY total_issues DESC;

-- =====================================================
-- نهاية السكربت
-- =====================================================


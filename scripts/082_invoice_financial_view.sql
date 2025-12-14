-- =============================================
-- View للعرض المالي للفواتير (فصل العرض عن المحاسبة)
-- =============================================
-- Invoice Financial View - Reporting Safety
-- =============================================
-- ⚠️ هذا View للعرض فقط - لا يعدل أي بيانات
-- ⚠️ This view is read-only - does not modify any data

BEGIN;

-- =====================================
-- 1. View شامل للعرض المالي للفواتير
-- =====================================
CREATE OR REPLACE VIEW invoice_financial_view AS
SELECT
  i.id,
  i.company_id,
  i.customer_id,
  i.invoice_number,
  i.invoice_date,
  i.due_date,
  i.status,
  
  -- القيم الأصلية (من الفاتورة)
  i.total_amount AS original_total,
  i.subtotal AS original_subtotal,
  i.tax_amount AS original_tax_amount,
  i.paid_amount AS paid_amount,
  
  -- حساب إجمالي المرتجعات
  COALESCE(
    (SELECT SUM(sr.total_amount)
     FROM sales_returns sr
     WHERE sr.invoice_id = i.id
       AND sr.status != 'cancelled'),
    0
  ) AS total_returns,
  
  -- حساب صافي الفاتورة (بعد المرتجعات)
  (i.total_amount - COALESCE(
    (SELECT SUM(sr.total_amount)
     FROM sales_returns sr
     WHERE sr.invoice_id = i.id
       AND sr.status != 'cancelled'),
    0
  )) AS net_invoice_total,
  
  -- حساب رصيد العميل (المتبقي)
  (i.total_amount - COALESCE(
    (SELECT SUM(sr.total_amount)
     FROM sales_returns sr
     WHERE sr.invoice_id = i.id
       AND sr.status != 'cancelled'),
    0
  ) - i.paid_amount) AS customer_credit,
  
  -- معلومات إضافية
  i.discount_type,
  i.discount_value,
  i.shipping,
  i.adjustment,
  i.notes,
  i.created_at,
  i.updated_at,
  
  -- معلومات العميل
  c.name AS customer_name,
  c.email AS customer_email,
  c.credit_limit AS customer_credit_limit,
  
  -- عدد المرتجعات
  COALESCE(
    (SELECT COUNT(*)
     FROM sales_returns sr
     WHERE sr.invoice_id = i.id
       AND sr.status != 'cancelled'),
    0
  ) AS returns_count,
  
  -- حالة الدفع
  CASE
    WHEN i.status = 'cancelled' THEN 'cancelled'
    WHEN i.paid_amount = 0 THEN 'unpaid'
    WHEN i.paid_amount >= (i.total_amount - COALESCE(
      (SELECT SUM(sr.total_amount)
       FROM sales_returns sr
       WHERE sr.invoice_id = i.id
         AND sr.status != 'cancelled'),
      0
    )) THEN 'paid'
    ELSE 'partially_paid'
  END AS payment_status,
  
  -- نسبة الدفع
  CASE
    WHEN i.total_amount = 0 THEN 0
    ELSE ROUND(
      (i.paid_amount / (i.total_amount - COALESCE(
        (SELECT SUM(sr.total_amount)
         FROM sales_returns sr
         WHERE sr.invoice_id = i.id
           AND sr.status != 'cancelled'),
        0
      ))) * 100,
      2
    )
  END AS payment_percentage

FROM invoices i
LEFT JOIN customers c ON c.id = i.customer_id;

-- =====================================
-- 2. View مبسط للتقارير السريعة
-- =====================================
CREATE OR REPLACE VIEW invoice_summary_view AS
SELECT
  company_id,
  customer_id,
  customer_name,
  COUNT(*) AS total_invoices,
  SUM(original_total) AS total_sales,
  SUM(total_returns) AS total_returns_amount,
  SUM(net_invoice_total) AS net_sales,
  SUM(paid_amount) AS total_paid,
  SUM(customer_credit) AS total_outstanding,
  COUNT(*) FILTER (WHERE payment_status = 'paid') AS paid_count,
  COUNT(*) FILTER (WHERE payment_status = 'partially_paid') AS partially_paid_count,
  COUNT(*) FILTER (WHERE payment_status = 'unpaid') AS unpaid_count,
  COUNT(*) FILTER (WHERE payment_status = 'cancelled') AS cancelled_count
FROM invoice_financial_view
GROUP BY company_id, customer_id, customer_name;

-- =====================================
-- 3. View للتقارير الشهرية
-- =====================================
CREATE OR REPLACE VIEW invoice_monthly_summary_view AS
SELECT
  company_id,
  DATE_TRUNC('month', invoice_date) AS month,
  COUNT(*) AS invoice_count,
  SUM(original_total) AS total_sales,
  SUM(total_returns) AS total_returns_amount,
  SUM(net_invoice_total) AS net_sales,
  SUM(paid_amount) AS total_paid,
  SUM(customer_credit) AS total_outstanding,
  COUNT(DISTINCT customer_id) AS unique_customers
FROM invoice_financial_view
WHERE status != 'cancelled'
GROUP BY company_id, DATE_TRUNC('month', invoice_date)
ORDER BY month DESC;

-- =====================================
-- 4. View للعملاء مع رصيدهم الإجمالي
-- =====================================
CREATE OR REPLACE VIEW customer_balance_view AS
SELECT
  company_id,
  customer_id,
  customer_name,
  customer_email,
  customer_credit_limit,
  SUM(customer_credit) AS total_outstanding,
  COUNT(*) AS active_invoices_count,
  CASE
    WHEN customer_credit_limit > 0 AND SUM(customer_credit) > customer_credit_limit THEN 'over_limit'
    WHEN SUM(customer_credit) > 0 THEN 'has_balance'
    ELSE 'paid'
  END AS credit_status
FROM invoice_financial_view
WHERE payment_status IN ('unpaid', 'partially_paid')
GROUP BY company_id, customer_id, customer_name, customer_email, customer_credit_limit;

-- =====================================
-- 5. منح الصلاحيات
-- =====================================
GRANT SELECT ON invoice_financial_view TO authenticated;
GRANT SELECT ON invoice_summary_view TO authenticated;
GRANT SELECT ON invoice_monthly_summary_view TO authenticated;
GRANT SELECT ON customer_balance_view TO authenticated;

-- =====================================
-- 6. تعليقات ووثائق
-- =====================================
COMMENT ON VIEW invoice_financial_view IS 
'View للعرض المالي للفواتير - يحسب القيم المشتقة للعرض فقط (لا يعدل البيانات)';

COMMENT ON VIEW invoice_summary_view IS 
'ملخص الفواتير حسب العميل - للتقارير السريعة';

COMMENT ON VIEW invoice_monthly_summary_view IS 
'ملخص الفواتير الشهري - للتقارير المالية';

COMMENT ON VIEW customer_balance_view IS 
'رصيد العملاء الإجمالي - لتتبع الائتمان';

COMMIT;

-- =============================================
-- ملاحظات:
-- 1. هذه Views للعرض فقط - لا تعدل أي بيانات
-- 2. لا تغير بنية جدول invoices الأصلي
-- 3. يمكن استخدامها في التقارير والواجهات
-- 4. القيم المحسوبة:
--    - original_total: القيمة الأصلية للفاتورة
--    - total_returns: إجمالي المرتجعات
--    - net_invoice_total: صافي الفاتورة (بعد المرتجعات)
--    - paid_amount: المدفوع
--    - customer_credit: المتبقي على العميل
-- 5. الحسابات ديناميكية - تعتمد على البيانات الحالية
-- =============================================

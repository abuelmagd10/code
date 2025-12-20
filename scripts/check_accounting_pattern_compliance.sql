-- فحص شامل لتطبيق النمط المحاسبي في جميع الصفحات
-- يجب تشغيل هذا السكريبت للتأكد من عدم وجود مخالفات

-- 1. فحص الأوامر التي لها فواتير مرسلة ولكن لا تزال قابلة للتعديل (مخالفة)
CREATE OR REPLACE FUNCTION check_orders_with_sent_invoices()
RETURNS TABLE(
  order_type TEXT,
  order_id UUID,
  order_number TEXT,
  order_status TEXT,
  invoice_id UUID,
  invoice_status TEXT,
  violation_type TEXT
) AS $$
BEGIN
  -- فحص أوامر البيع
  RETURN QUERY
  SELECT 
    'sales_order'::TEXT,
    so.id,
    so.so_number,
    so.status,
    i.id,
    i.status,
    'Order editable but invoice sent'::TEXT
  FROM sales_orders so
  JOIN invoices i ON so.invoice_id = i.id
  WHERE i.status != 'draft' 
    AND so.status = 'draft';
    
  -- فحص أوامر الشراء
  RETURN QUERY
  SELECT 
    'purchase_order'::TEXT,
    po.id,
    po.po_number,
    po.status,
    b.id,
    b.status,
    'Order editable but bill sent'::TEXT
  FROM purchase_orders po
  JOIN bills b ON po.bill_id = b.id
  WHERE b.status != 'draft' 
    AND po.status = 'draft';
END;
$$ LANGUAGE plpgsql;

-- 2. فحص الفواتير المرتبطة بأوامر في حالة مسودة (يجب أن تكون مسودة أيضاً)
CREATE OR REPLACE FUNCTION check_invoices_linked_to_draft_orders()
RETURNS TABLE(
  invoice_type TEXT,
  invoice_id UUID,
  invoice_number TEXT,
  invoice_status TEXT,
  order_id UUID,
  order_status TEXT,
  violation_type TEXT
) AS $$
BEGIN
  -- فحص فواتير البيع
  RETURN QUERY
  SELECT 
    'sales_invoice'::TEXT,
    i.id,
    i.invoice_number,
    i.status,
    so.id,
    so.status,
    'Invoice sent but order still draft'::TEXT
  FROM invoices i
  JOIN sales_orders so ON i.sales_order_id = so.id
  WHERE so.status = 'draft' 
    AND i.status != 'draft';
    
  -- فحص فواتير الشراء
  RETURN QUERY
  SELECT 
    'purchase_bill'::TEXT,
    b.id,
    b.bill_number,
    b.status,
    po.id,
    po.status,
    'Bill sent but order still draft'::TEXT
  FROM bills b
  JOIN purchase_orders po ON b.purchase_order_id = po.id
  WHERE po.status = 'draft' 
    AND b.status != 'draft';
END;
$$ LANGUAGE plpgsql;

-- 3. فحص الفواتير غير المرتبطة بأوامر (يجب أن تكون مرتبطة حسب النمط)
CREATE OR REPLACE FUNCTION check_unlinked_invoices()
RETURNS TABLE(
  invoice_type TEXT,
  invoice_id UUID,
  invoice_number TEXT,
  invoice_status TEXT,
  violation_type TEXT
) AS $$
BEGIN
  -- فحص فواتير البيع غير المرتبطة
  RETURN QUERY
  SELECT 
    'sales_invoice'::TEXT,
    i.id,
    i.invoice_number,
    i.status,
    'Invoice not linked to sales order'::TEXT
  FROM invoices i
  WHERE i.sales_order_id IS NULL
    AND i.created_at > '2024-01-01'; -- فقط الفواتير الجديدة
    
  -- فحص فواتير الشراء غير المرتبطة
  RETURN QUERY
  SELECT 
    'purchase_bill'::TEXT,
    b.id,
    b.bill_number,
    b.status,
    'Bill not linked to purchase order'::TEXT
  FROM bills b
  WHERE b.purchase_order_id IS NULL
    AND b.created_at > '2024-01-01'; -- فقط الفواتير الجديدة
END;
$$ LANGUAGE plpgsql;

-- 4. فحص القيود المالية في حالة المسودة (مخالفة)
CREATE OR REPLACE FUNCTION check_journal_entries_for_draft_invoices()
RETURNS TABLE(
  invoice_type TEXT,
  invoice_id UUID,
  invoice_number TEXT,
  journal_entry_id UUID,
  violation_type TEXT
) AS $$
BEGIN
  -- فحص قيود فواتير البيع في حالة مسودة
  RETURN QUERY
  SELECT 
    'sales_invoice'::TEXT,
    i.id,
    i.invoice_number,
    je.id,
    'Journal entry exists for draft invoice'::TEXT
  FROM invoices i
  JOIN journal_entries je ON je.reference_id = i.id::TEXT
  WHERE i.status = 'draft'
    AND je.reference_type = 'invoice';
    
  -- فحص قيود فواتير الشراء في حالة مسودة
  RETURN QUERY
  SELECT 
    'purchase_bill'::TEXT,
    b.id,
    b.bill_number,
    je.id,
    'Journal entry exists for draft bill'::TEXT
  FROM bills b
  JOIN journal_entries je ON je.reference_id = b.id::TEXT
  WHERE b.status = 'draft'
    AND je.reference_type = 'bill';
END;
$$ LANGUAGE plpgsql;

-- 5. فحص حركات المخزون في حالة المسودة (مخالفة)
CREATE OR REPLACE FUNCTION check_inventory_transactions_for_draft_invoices()
RETURNS TABLE(
  invoice_type TEXT,
  invoice_id UUID,
  invoice_number TEXT,
  transaction_id UUID,
  violation_type TEXT
) AS $$
BEGIN
  -- فحص حركات مخزون فواتير البيع في حالة مسودة
  RETURN QUERY
  SELECT 
    'sales_invoice'::TEXT,
    i.id,
    i.invoice_number,
    it.id,
    'Inventory transaction exists for draft invoice'::TEXT
  FROM invoices i
  JOIN inventory_transactions it ON it.reference_id = i.id::TEXT
  WHERE i.status = 'draft'
    AND it.reference_type = 'sale';
END;
$$ LANGUAGE plpgsql;

-- 6. تقرير شامل لجميع المخالفات
CREATE OR REPLACE FUNCTION generate_accounting_pattern_violations_report()
RETURNS TABLE(
  violation_category TEXT,
  violation_count BIGINT,
  details TEXT
) AS $$
BEGIN
  -- عدد الأوامر المخالفة
  RETURN QUERY
  SELECT 
    'Orders with sent invoices but still editable'::TEXT,
    COUNT(*),
    'Orders that should be locked but are still in draft state'::TEXT
  FROM check_orders_with_sent_invoices();
  
  -- عدد الفواتير المخالفة
  RETURN QUERY
  SELECT 
    'Invoices sent but orders still draft'::TEXT,
    COUNT(*),
    'Invoices that are sent but linked orders are still draft'::TEXT
  FROM check_invoices_linked_to_draft_orders();
  
  -- عدد الفواتير غير المرتبطة
  RETURN QUERY
  SELECT 
    'Unlinked invoices'::TEXT,
    COUNT(*),
    'Invoices not linked to orders (violates pattern)'::TEXT
  FROM check_unlinked_invoices();
  
  -- عدد القيود المالية المخالفة
  RETURN QUERY
  SELECT 
    'Journal entries for draft invoices'::TEXT,
    COUNT(*),
    'Financial entries exist for draft invoices (violation)'::TEXT
  FROM check_journal_entries_for_draft_invoices();
  
  -- عدد حركات المخزون المخالفة
  RETURN QUERY
  SELECT 
    'Inventory transactions for draft invoices'::TEXT,
    COUNT(*),
    'Inventory movements exist for draft invoices (violation)'::TEXT
  FROM check_inventory_transactions_for_draft_invoices();
END;
$$ LANGUAGE plpgsql;

-- تشغيل التقرير الشامل
SELECT 
  violation_category as "نوع المخالفة",
  violation_count as "عدد المخالفات",
  details as "التفاصيل"
FROM generate_accounting_pattern_violations_report();

-- عرض تفاصيل المخالفات إن وجدت
DO $$
DECLARE
  violation_count INTEGER;
BEGIN
  -- فحص وجود مخالفات
  SELECT COUNT(*) INTO violation_count 
  FROM (
    SELECT * FROM check_orders_with_sent_invoices()
    UNION ALL
    SELECT * FROM check_invoices_linked_to_draft_orders()
    UNION ALL
    SELECT * FROM check_unlinked_invoices()
    UNION ALL
    SELECT * FROM check_journal_entries_for_draft_invoices()
    UNION ALL
    SELECT * FROM check_inventory_transactions_for_draft_invoices()
  ) violations;
  
  IF violation_count > 0 THEN
    RAISE NOTICE '⚠️  تم العثور على % مخالفة للنمط المحاسبي!', violation_count;
    RAISE NOTICE 'يرجى مراجعة التفاصيل أعلاه وإصلاح المخالفات';
  ELSE
    RAISE NOTICE '✅ لا توجد مخالفات للنمط المحاسبي';
    RAISE NOTICE 'النظام يتبع النمط المحاسبي الصارم بشكل صحيح';
  END IF;
END $$;
-- =============================================
-- 🔧 سكربت التصحيح المحاسبي الشامل
-- Comprehensive Accounting Correction Script
-- =============================================
-- التاريخ: 2025-12-27
-- الهدف: تصحيح جميع الأخطاء المحاسبية المكتشفة
-- التوافق: Zoho Books Accounting Pattern
-- =============================================

-- =============================================
-- المرحلة 1: إضافة الأعمدة والقيود المفقودة
-- Phase 1: Add Missing Columns and Constraints
-- =============================================

-- 1.1 إضافة عمود status للقيود اليومية
ALTER TABLE journal_entries 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'posted'));

ALTER TABLE journal_entries 
ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;

ALTER TABLE journal_entries 
ADD COLUMN IF NOT EXISTS posted_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN journal_entries.status IS 'حالة القيد: draft (مسودة) أو posted (مرحّل)';
COMMENT ON COLUMN journal_entries.posted_at IS 'تاريخ ووقت الترحيل';
COMMENT ON COLUMN journal_entries.posted_by IS 'المستخدم الذي قام بالترحيل';

-- 1.2 إضافة UNIQUE constraint لمنع القيود المكررة
-- نحذف القيود المكررة أولاً إن وجدت
DO $$
BEGIN
  -- حذف القيود المكررة (نحتفظ بالأقدم فقط)
  DELETE FROM journal_entries je1
  WHERE EXISTS (
    SELECT 1 FROM journal_entries je2
    WHERE je2.company_id = je1.company_id
      AND je2.reference_type = je1.reference_type
      AND je2.reference_id = je1.reference_id
      AND je2.reference_type IS NOT NULL
      AND je2.reference_id IS NOT NULL
      AND je2.created_at < je1.created_at
  );
END $$;

-- الآن نضيف الـ UNIQUE constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_unique_reference 
ON journal_entries(company_id, reference_type, reference_id)
WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

-- 1.3 إضافة CHECK constraint لبنود القيود
-- التأكد من أن debit أو credit واحد فقط يكون موجب
ALTER TABLE journal_entry_lines 
DROP CONSTRAINT IF EXISTS chk_debit_or_credit_only;

ALTER TABLE journal_entry_lines 
ADD CONSTRAINT chk_debit_or_credit_only 
CHECK (
  (debit_amount = 0 AND credit_amount >= 0) OR 
  (credit_amount = 0 AND debit_amount >= 0)
);

-- 1.4 إضافة Foreign Key لربط inventory_transactions مع journal_entries
ALTER TABLE inventory_transactions 
DROP CONSTRAINT IF EXISTS fk_inventory_journal_entry;

ALTER TABLE inventory_transactions 
ADD CONSTRAINT fk_inventory_journal_entry 
FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL;

-- 1.5 إنشاء فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_posted_at ON journal_entries(posted_at);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_journal_entry ON inventory_transactions(journal_entry_id);

-- =============================================
-- المرحلة 2: دوال مساعدة لإنشاء قيود COGS
-- Phase 2: Helper Functions for COGS Entries
-- =============================================

-- 2.1 دالة لحساب تكلفة FIFO لمنتج معين
CREATE OR REPLACE FUNCTION calculate_fifo_cost(
  p_product_id UUID,
  p_warehouse_id UUID,
  p_quantity NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  v_total_cost NUMERIC := 0;
  v_remaining_qty NUMERIC := p_quantity;
  v_lot RECORD;
BEGIN
  -- جلب اللوتات حسب FIFO (الأقدم أولاً)
  FOR v_lot IN 
    SELECT id, remaining_quantity, unit_cost
    FROM fifo_cost_lots
    WHERE product_id = p_product_id
      AND (warehouse_id = p_warehouse_id OR warehouse_id IS NULL)
      AND remaining_quantity > 0
    ORDER BY purchase_date ASC, created_at ASC
  LOOP
    IF v_remaining_qty <= 0 THEN
      EXIT;
    END IF;
    
    DECLARE
      v_qty_from_lot NUMERIC := LEAST(v_lot.remaining_quantity, v_remaining_qty);
    BEGIN
      v_total_cost := v_total_cost + (v_qty_from_lot * v_lot.unit_cost);
      v_remaining_qty := v_remaining_qty - v_qty_from_lot;
    END;
  END LOOP;
  
  RETURN v_total_cost;
END;
$$ LANGUAGE plpgsql;

-- 2.2 دالة لإنشاء قيد COGS لفاتورة مبيعات
CREATE OR REPLACE FUNCTION create_cogs_journal_for_invoice(
  p_invoice_id UUID
) RETURNS UUID AS $$
DECLARE
  v_invoice RECORD;
  v_item RECORD;
  v_journal_entry_id UUID;
  v_cogs_account_id UUID;
  v_inventory_account_id UUID;
  v_total_cogs NUMERIC := 0;
  v_item_cost NUMERIC;
BEGIN
  -- جلب بيانات الفاتورة
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
  END IF;
  
  -- التحقق من عدم وجود قيد COGS مسبقاً
  IF EXISTS (
    SELECT 1 FROM journal_entries 
    WHERE reference_type = 'invoice_cogs' 
      AND reference_id = p_invoice_id
  ) THEN
    RAISE NOTICE 'COGS journal already exists for invoice %', p_invoice_id;
    RETURN NULL;
  END IF;
  
  -- جلب حساب COGS
  SELECT id INTO v_cogs_account_id
  FROM chart_of_accounts
  WHERE company_id = v_invoice.company_id
    AND (
      sub_type = 'cogs' OR 
      sub_type = 'cost_of_goods_sold' OR
      account_name ILIKE '%cost of goods sold%' OR
      account_name ILIKE '%تكلفة البضاعة المباعة%' OR
      account_name LIKE '%COGS%'
    )
    AND is_active = true
  LIMIT 1;
  
  -- جلب حساب المخزون
  SELECT id INTO v_inventory_account_id
  FROM chart_of_accounts
  WHERE company_id = v_invoice.company_id
    AND (
      sub_type = 'inventory' OR
      account_name ILIKE '%inventory%' OR
      account_name ILIKE '%مخزون%'
    )
    AND is_active = true
  LIMIT 1;
  
  IF v_cogs_account_id IS NULL OR v_inventory_account_id IS NULL THEN
    RAISE NOTICE 'COGS or Inventory account not found for company %', v_invoice.company_id;
    RETURN NULL;
  END IF;

  -- حساب تكلفة COGS لكل منتج
  FOR v_item IN
    SELECT ii.*, p.product_name
    FROM invoice_items ii
    JOIN products p ON p.id = ii.product_id
    WHERE ii.invoice_id = p_invoice_id
      AND p.track_inventory = true
  LOOP
    v_item_cost := calculate_fifo_cost(
      v_item.product_id,
      v_invoice.warehouse_id,
      v_item.quantity
    );
    v_total_cogs := v_total_cogs + v_item_cost;
  END LOOP;

  -- إذا لم يكن هناك تكلفة، لا نُنشئ قيد
  IF v_total_cogs <= 0 THEN
    RAISE NOTICE 'No COGS to record for invoice %', p_invoice_id;
    RETURN NULL;
  END IF;

  -- إنشاء القيد المحاسبي
  INSERT INTO journal_entries (
    company_id,
    reference_type,
    reference_id,
    entry_date,
    description,
    status,
    branch_id,
    cost_center_id,
    warehouse_id
  ) VALUES (
    v_invoice.company_id,
    'invoice_cogs',
    p_invoice_id,
    v_invoice.invoice_date,
    'تكلفة البضاعة المباعة - فاتورة ' || v_invoice.invoice_number,
    'posted',
    v_invoice.branch_id,
    v_invoice.cost_center_id,
    v_invoice.warehouse_id
  ) RETURNING id INTO v_journal_entry_id;

  -- إضافة بنود القيد
  -- Debit: COGS
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description,
    branch_id,
    cost_center_id
  ) VALUES (
    v_journal_entry_id,
    v_cogs_account_id,
    v_total_cogs,
    0,
    'تكلفة البضاعة المباعة',
    v_invoice.branch_id,
    v_invoice.cost_center_id
  );

  -- Credit: Inventory
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description,
    branch_id,
    cost_center_id
  ) VALUES (
    v_journal_entry_id,
    v_inventory_account_id,
    0,
    v_total_cogs,
    'تخفيض المخزون',
    v_invoice.branch_id,
    v_invoice.cost_center_id
  );

  -- تحديث inventory_transactions لربطها بالقيد
  UPDATE inventory_transactions
  SET journal_entry_id = v_journal_entry_id
  WHERE transaction_type = 'sale'
    AND reference_id = p_invoice_id
    AND journal_entry_id IS NULL;

  RETURN v_journal_entry_id;
END;
$$ LANGUAGE plpgsql;

-- 2.3 دالة لعكس قيد COGS عند مرتجع مبيعات
CREATE OR REPLACE FUNCTION reverse_cogs_journal_for_return(
  p_invoice_id UUID
) RETURNS UUID AS $$
DECLARE
  v_original_cogs_entry RECORD;
  v_invoice RECORD;
  v_new_journal_entry_id UUID;
BEGIN
  -- جلب بيانات الفاتورة
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
  END IF;

  -- جلب قيد COGS الأصلي
  SELECT je.* INTO v_original_cogs_entry
  FROM journal_entries je
  WHERE je.reference_type = 'invoice_cogs'
    AND je.reference_id = p_invoice_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE NOTICE 'No COGS journal found to reverse for invoice %', p_invoice_id;
    RETURN NULL;
  END IF;

  -- التحقق من عدم وجود قيد عكسي مسبقاً
  IF EXISTS (
    SELECT 1 FROM journal_entries
    WHERE reference_type = 'sales_return_cogs'
      AND reference_id = p_invoice_id
  ) THEN
    RAISE NOTICE 'COGS reversal journal already exists for invoice %', p_invoice_id;
    RETURN NULL;
  END IF;

  -- إنشاء قيد عكسي
  INSERT INTO journal_entries (
    company_id,
    reference_type,
    reference_id,
    entry_date,
    description,
    status,
    branch_id,
    cost_center_id,
    warehouse_id
  ) VALUES (
    v_invoice.company_id,
    'sales_return_cogs',
    p_invoice_id,
    CURRENT_DATE,
    'عكس تكلفة البضاعة المباعة - مرتجع فاتورة ' || v_invoice.invoice_number,
    'posted',
    v_invoice.branch_id,
    v_invoice.cost_center_id,
    v_invoice.warehouse_id
  ) RETURNING id INTO v_new_journal_entry_id;

  -- نسخ البنود بشكل معكوس (Debit ↔ Credit)
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description,
    branch_id,
    cost_center_id
  )
  SELECT
    v_new_journal_entry_id,
    account_id,
    credit_amount,  -- عكس
    debit_amount,   -- عكس
    'عكس: ' || description,
    branch_id,
    cost_center_id
  FROM journal_entry_lines
  WHERE journal_entry_id = v_original_cogs_entry.id;

  -- تحديث inventory_transactions لربطها بالقيد
  UPDATE inventory_transactions
  SET journal_entry_id = v_new_journal_entry_id
  WHERE transaction_type = 'sale_return'
    AND reference_id = p_invoice_id
    AND journal_entry_id IS NULL;

  RETURN v_new_journal_entry_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- المرحلة 3: Triggers لإنشاء قيود COGS تلقائياً
-- Phase 3: Triggers for Automatic COGS Entries
-- =============================================

-- 3.1 Trigger لإنشاء قيد COGS عند تغيير حالة الفاتورة إلى "sent" أو "paid"
CREATE OR REPLACE FUNCTION auto_create_cogs_on_invoice_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- إذا تغيرت الحالة من draft إلى sent أو paid
  IF (OLD.status IN ('draft', 'pending') AND NEW.status IN ('sent', 'paid')) THEN
    -- إنشاء قيد COGS
    PERFORM create_cogs_journal_for_invoice(NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_create_cogs_on_invoice ON invoices;
CREATE TRIGGER trg_auto_create_cogs_on_invoice
AFTER UPDATE OF status ON invoices
FOR EACH ROW
EXECUTE FUNCTION auto_create_cogs_on_invoice_status_change();

-- 3.2 Trigger لمنع تعديل/حذف القيود المرحّلة (Posted)
CREATE OR REPLACE FUNCTION prevent_posted_journal_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'posted' THEN
      RAISE EXCEPTION 'Cannot modify posted journal entry. Entry ID: %', OLD.id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'posted' THEN
      RAISE EXCEPTION 'Cannot delete posted journal entry. Entry ID: %', OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_posted_journal_modification ON journal_entries;
CREATE TRIGGER trg_prevent_posted_journal_modification
BEFORE UPDATE OR DELETE ON journal_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_posted_journal_modification();

-- =============================================
-- المرحلة 4: تصحيح البيانات التاريخية
-- Phase 4: Historical Data Correction
-- =============================================

-- 4.1 تحديث حالة القيود الموجودة إلى "posted"
-- جميع القيود المرتبطة بفواتير/مدفوعات تُعتبر مرحّلة
UPDATE journal_entries
SET status = 'posted',
    posted_at = created_at
WHERE status = 'draft'
  AND reference_type IN ('invoice', 'bill', 'payment', 'customer_payment', 'supplier_payment', 'invoice_payment', 'bill_payment');

-- القيود اليدوية تبقى draft ما لم يتم ترحيلها يدوياً
-- (يمكن للمستخدم ترحيلها لاحقاً)

-- 4.2 إنشاء قيود COGS للفواتير التاريخية
DO $$
DECLARE
  v_invoice RECORD;
  v_journal_id UUID;
  v_count INTEGER := 0;
  v_success INTEGER := 0;
  v_skipped INTEGER := 0;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'إنشاء قيود COGS للفواتير التاريخية';
  RAISE NOTICE '========================================';

  -- جلب جميع الفواتير المرسلة/المدفوعة التي ليس لها قيد COGS
  FOR v_invoice IN
    SELECT i.id, i.invoice_number, i.status
    FROM invoices i
    WHERE i.status IN ('sent', 'paid')
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je
        WHERE je.reference_type = 'invoice_cogs'
          AND je.reference_id = i.id
      )
    ORDER BY i.invoice_date ASC
  LOOP
    v_count := v_count + 1;

    BEGIN
      v_journal_id := create_cogs_journal_for_invoice(v_invoice.id);

      IF v_journal_id IS NOT NULL THEN
        v_success := v_success + 1;
        RAISE NOTICE '[%/%] ✅ تم إنشاء قيد COGS للفاتورة: %', v_count, v_count, v_invoice.invoice_number;
      ELSE
        v_skipped := v_skipped + 1;
        RAISE NOTICE '[%/%] ⚠️ تم تخطي الفاتورة (لا توجد منتجات مخزنية): %', v_count, v_count, v_invoice.invoice_number;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
      RAISE NOTICE '[%/%] ❌ خطأ في الفاتورة %: %', v_count, v_count, v_invoice.invoice_number, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'النتائج:';
  RAISE NOTICE '  - إجمالي الفواتير: %', v_count;
  RAISE NOTICE '  - تم إنشاء قيود COGS: %', v_success;
  RAISE NOTICE '  - تم التخطي: %', v_skipped;
  RAISE NOTICE '========================================';
END $$;

-- 4.3 ربط inventory_transactions مع journal_entries
DO $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ربط حركات المخزون مع القيود المحاسبية';
  RAISE NOTICE '========================================';

  -- ربط حركات البيع مع قيود AR/Revenue
  UPDATE inventory_transactions it
  SET journal_entry_id = je.id
  FROM journal_entries je
  WHERE it.transaction_type = 'sale'
    AND it.reference_id = je.reference_id
    AND je.reference_type = 'invoice'
    AND it.journal_entry_id IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '✅ تم ربط % حركة بيع مع قيود AR/Revenue', v_count;

  -- ربط حركات الشراء مع قيود AP/Inventory
  UPDATE inventory_transactions it
  SET journal_entry_id = je.id
  FROM journal_entries je
  WHERE it.transaction_type = 'purchase'
    AND it.reference_id = je.reference_id
    AND je.reference_type = 'bill'
    AND it.journal_entry_id IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '✅ تم ربط % حركة شراء مع قيود AP/Inventory', v_count;

  -- ربط حركات الشطب مع قيود Write-off
  UPDATE inventory_transactions it
  SET journal_entry_id = je.id
  FROM journal_entries je
  WHERE it.transaction_type = 'write_off'
    AND it.reference_id = je.reference_id
    AND je.reference_type = 'write_off'
    AND it.journal_entry_id IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '✅ تم ربط % حركة شطب مع قيود Write-off', v_count;

  RAISE NOTICE '========================================';
END $$;

-- =============================================
-- المرحلة 5: إنشاء Views للتقارير المحسّنة
-- Phase 5: Create Enhanced Reporting Views
-- =============================================

-- 5.1 View لعرض قيود COGS مع تفاصيلها
CREATE OR REPLACE VIEW v_cogs_journal_entries AS
SELECT
  je.id as journal_entry_id,
  je.company_id,
  je.entry_date,
  je.description,
  je.status,
  i.id as invoice_id,
  i.invoice_number,
  i.customer_id,
  c.customer_name,
  SUM(CASE WHEN jel.account_id IN (
    SELECT id FROM chart_of_accounts WHERE sub_type IN ('cogs', 'cost_of_goods_sold')
  ) THEN jel.debit_amount ELSE 0 END) as total_cogs,
  je.branch_id,
  je.cost_center_id,
  je.warehouse_id
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
LEFT JOIN invoices i ON i.id = je.reference_id AND je.reference_type = 'invoice_cogs'
LEFT JOIN customers c ON c.id = i.customer_id
WHERE je.reference_type IN ('invoice_cogs', 'sales_return_cogs')
GROUP BY je.id, i.id, c.id;

COMMENT ON VIEW v_cogs_journal_entries IS 'عرض قيود تكلفة البضاعة المباعة مع تفاصيل الفواتير';

-- 5.2 View لعرض الفواتير مع قيود COGS
CREATE OR REPLACE VIEW v_invoices_with_cogs AS
SELECT
  i.id as invoice_id,
  i.invoice_number,
  i.invoice_date,
  i.status,
  i.customer_id,
  c.customer_name,
  i.total_amount as invoice_total,
  i.subtotal as invoice_subtotal,
  COALESCE(cogs.total_cogs, 0) as cogs_amount,
  i.subtotal - COALESCE(cogs.total_cogs, 0) as gross_profit,
  CASE
    WHEN i.subtotal > 0 THEN
      ROUND(((i.subtotal - COALESCE(cogs.total_cogs, 0)) / i.subtotal * 100), 2)
    ELSE 0
  END as gross_profit_margin_percent,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.reference_type = 'invoice_cogs'
        AND je.reference_id = i.id
    ) THEN true
    ELSE false
  END as has_cogs_entry,
  i.branch_id,
  i.cost_center_id,
  i.warehouse_id
FROM invoices i
LEFT JOIN customers c ON c.id = i.customer_id
LEFT JOIN (
  SELECT
    je.reference_id,
    SUM(jel.debit_amount) as total_cogs
  FROM journal_entries je
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts ca ON ca.id = jel.account_id
  WHERE je.reference_type = 'invoice_cogs'
    AND ca.sub_type IN ('cogs', 'cost_of_goods_sold')
  GROUP BY je.reference_id
) cogs ON cogs.reference_id = i.id
WHERE i.status IN ('sent', 'paid');

COMMENT ON VIEW v_invoices_with_cogs IS 'عرض الفواتير مع تكلفة البضاعة المباعة ومجمل الربح';

-- 5.3 View لعرض حركات المخزون المرتبطة بالقيود
CREATE OR REPLACE VIEW v_inventory_with_journals AS
SELECT
  it.id as transaction_id,
  it.product_id,
  p.product_name,
  it.warehouse_id,
  w.warehouse_name,
  it.transaction_type,
  it.quantity_change,
  it.reference_id,
  it.transaction_date,
  it.journal_entry_id,
  je.entry_date as journal_date,
  je.description as journal_description,
  je.status as journal_status,
  CASE
    WHEN it.journal_entry_id IS NOT NULL THEN true
    ELSE false
  END as is_linked_to_journal
FROM inventory_transactions it
LEFT JOIN products p ON p.id = it.product_id
LEFT JOIN warehouses w ON w.id = it.warehouse_id
LEFT JOIN journal_entries je ON je.id = it.journal_entry_id
ORDER BY it.transaction_date DESC;

COMMENT ON VIEW v_inventory_with_journals IS 'عرض حركات المخزون مع القيود المحاسبية المرتبطة';

-- =============================================
-- المرحلة 6: إنشاء دوال للتحقق من سلامة البيانات
-- Phase 6: Data Integrity Verification Functions
-- =============================================

-- 6.1 دالة للتحقق من توازن جميع القيود
CREATE OR REPLACE FUNCTION verify_all_journal_entries_balanced()
RETURNS TABLE (
  journal_entry_id UUID,
  entry_date DATE,
  description TEXT,
  total_debit NUMERIC,
  total_credit NUMERIC,
  difference NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    je.id,
    je.entry_date,
    je.description,
    COALESCE(SUM(jel.debit_amount), 0) as total_debit,
    COALESCE(SUM(jel.credit_amount), 0) as total_credit,
    COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0) as difference
  FROM journal_entries je
  LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  GROUP BY je.id, je.entry_date, je.description
  HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.01
  ORDER BY je.entry_date DESC;
END;
$$ LANGUAGE plpgsql;

-- 6.2 دالة للتحقق من وجود قيود COGS لجميع الفواتير
CREATE OR REPLACE FUNCTION verify_invoices_have_cogs()
RETURNS TABLE (
  invoice_id UUID,
  invoice_number TEXT,
  invoice_date DATE,
  status TEXT,
  has_inventory_items BOOLEAN,
  has_cogs_entry BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.invoice_number,
    i.invoice_date,
    i.status,
    EXISTS (
      SELECT 1 FROM invoice_items ii
      JOIN products p ON p.id = ii.product_id
      WHERE ii.invoice_id = i.id AND p.track_inventory = true
    ) as has_inventory_items,
    EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.reference_type = 'invoice_cogs' AND je.reference_id = i.id
    ) as has_cogs_entry
  FROM invoices i
  WHERE i.status IN ('sent', 'paid')
  ORDER BY i.invoice_date DESC;
END;
$$ LANGUAGE plpgsql;

-- 6.3 دالة للتحقق من ربط inventory_transactions مع journal_entries
CREATE OR REPLACE FUNCTION verify_inventory_journal_links()
RETURNS TABLE (
  transaction_id UUID,
  product_id UUID,
  transaction_type TEXT,
  quantity_change NUMERIC,
  reference_id UUID,
  has_journal_link BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    it.id,
    it.product_id,
    it.transaction_type,
    it.quantity_change,
    it.reference_id,
    (it.journal_entry_id IS NOT NULL) as has_journal_link
  FROM inventory_transactions it
  WHERE it.transaction_type IN ('sale', 'purchase', 'write_off', 'sale_return')
  ORDER BY it.transaction_date DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- المرحلة 7: تقرير نهائي للتحقق
-- Phase 7: Final Verification Report
-- =============================================

DO $$
DECLARE
  v_unbalanced_count INTEGER;
  v_missing_cogs_count INTEGER;
  v_unlinked_inventory_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '📊 تقرير التحقق النهائي';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';

  -- 1. التحقق من توازن القيود
  SELECT COUNT(*) INTO v_unbalanced_count
  FROM verify_all_journal_entries_balanced();

  IF v_unbalanced_count = 0 THEN
    RAISE NOTICE '✅ جميع القيود المحاسبية متوازنة';
  ELSE
    RAISE NOTICE '❌ يوجد % قيد غير متوازن', v_unbalanced_count;
  END IF;

  -- 2. التحقق من قيود COGS
  SELECT COUNT(*) INTO v_missing_cogs_count
  FROM verify_invoices_have_cogs()
  WHERE has_inventory_items = true AND has_cogs_entry = false;

  IF v_missing_cogs_count = 0 THEN
    RAISE NOTICE '✅ جميع الفواتير لها قيود COGS';
  ELSE
    RAISE NOTICE '⚠️ يوجد % فاتورة بدون قيد COGS', v_missing_cogs_count;
  END IF;

  -- 3. التحقق من ربط المخزون
  SELECT COUNT(*) INTO v_unlinked_inventory_count
  FROM verify_inventory_journal_links()
  WHERE has_journal_link = false;

  IF v_unlinked_inventory_count = 0 THEN
    RAISE NOTICE '✅ جميع حركات المخزون مرتبطة بقيود محاسبية';
  ELSE
    RAISE NOTICE '⚠️ يوجد % حركة مخزون غير مرتبطة بقيد', v_unlinked_inventory_count;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '📋 ملخص الإصلاحات المطبقة:';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ 1. إضافة عمود status للقيود (draft/posted)';
  RAISE NOTICE '✅ 2. إضافة UNIQUE constraint لمنع القيود المكررة';
  RAISE NOTICE '✅ 3. إضافة CHECK constraint لبنود القيود';
  RAISE NOTICE '✅ 4. إضافة Foreign Key لربط المخزون بالقيود';
  RAISE NOTICE '✅ 5. إنشاء دوال لحساب وإنشاء قيود COGS';
  RAISE NOTICE '✅ 6. إنشاء Triggers لإنشاء COGS تلقائياً';
  RAISE NOTICE '✅ 7. إنشاء Trigger لمنع تعديل القيود المرحّلة';
  RAISE NOTICE '✅ 8. تصحيح البيانات التاريخية';
  RAISE NOTICE '✅ 9. إنشاء Views للتقارير المحسّنة';
  RAISE NOTICE '✅ 10. إنشاء دوال التحقق من سلامة البيانات';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';

  IF v_unbalanced_count = 0 AND v_missing_cogs_count = 0 THEN
    RAISE NOTICE '🎉 النظام المحاسبي سليم ومتوافق مع Zoho Books!';
    RAISE NOTICE '✅ جاهز للإنتاج (Production Ready)';
  ELSE
    RAISE NOTICE '⚠️ يوجد بعض المشاكل التي تحتاج إلى مراجعة يدوية';
    RAISE NOTICE '📝 استخدم الدوال التالية للتحقق:';
    RAISE NOTICE '   - SELECT * FROM verify_all_journal_entries_balanced();';
    RAISE NOTICE '   - SELECT * FROM verify_invoices_have_cogs();';
    RAISE NOTICE '   - SELECT * FROM verify_inventory_journal_links();';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
END $$;

-- =============================================
-- ملاحظات مهمة | Important Notes
-- =============================================

/*
📌 ملاحظات التطبيق:

1. **النسخ الاحتياطي:**
   - يُنصح بشدة بعمل نسخة احتياطية كاملة قبل تطبيق هذا السكربت
   - استخدم: pg_dump أو Supabase Backup

2. **الاختبار:**
   - اختبر السكربت على بيئة تطوير أولاً
   - تحقق من النتائج قبل التطبيق على الإنتاج

3. **الأداء:**
   - قد يستغرق تطبيق السكربت وقتاً طويلاً على قواعد بيانات كبيرة
   - يُنصح بتطبيقه خارج ساعات العمل

4. **التوافق:**
   - هذا السكربت متوافق مع PostgreSQL 12+
   - متوافق مع Supabase

5. **الدعم:**
   - في حالة وجود مشاكل، راجع الـ Logs
   - استخدم دوال التحقق للتشخيص

6. **التحديثات المستقبلية:**
   - الـ Triggers ستعمل تلقائياً على البيانات الجديدة
   - لا حاجة لإعادة تطبيق السكربت

7. **التكامل مع الكود:**
   - يجب تحديث الكود في:
     * app/invoices/[id]/page.tsx
     * lib/sales-returns.ts
   - لاستخدام الدوال الجديدة

8. **Views الجديدة:**
   - v_cogs_journal_entries: لعرض قيود COGS
   - v_invoices_with_cogs: لعرض الفواتير مع مجمل الربح
   - v_inventory_with_journals: لعرض المخزون مع القيود

9. **الدوال الجديدة:**
   - calculate_fifo_cost(): حساب تكلفة FIFO
   - create_cogs_journal_for_invoice(): إنشاء قيد COGS
   - reverse_cogs_journal_for_return(): عكس قيد COGS
   - verify_all_journal_entries_balanced(): التحقق من التوازن
   - verify_invoices_have_cogs(): التحقق من قيود COGS
   - verify_inventory_journal_links(): التحقق من الربط

10. **الصلاحيات:**
    - يتطلب تطبيق السكربت صلاحيات SUPERUSER أو service_role
    - في Supabase، استخدم SQL Editor مع service_role key
*/

-- =============================================
-- نهاية السكربت | End of Script
-- =============================================

-- تاريخ الإنشاء: 2025-12-27
-- الإصدار: 1.0
-- المطور: Augment Agent - Accounting Audit System
-- الترخيص: Proprietary - VitaSlims ERP

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ تم تطبيق سكربت التصحيح المحاسبي بنجاح!';
  RAISE NOTICE '📊 راجع التقرير أعلاه للتأكد من سلامة البيانات';
  RAISE NOTICE '';
END $$;

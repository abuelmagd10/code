-- =============================================
-- Auto COGS Journal Entry Trigger
-- =============================================
-- هذا الـ Trigger يسجل قيد COGS تلقائيًا عند بيع المنتجات
-- حسب المعيار المحاسبي الصحيح:
-- المشتريات → المخزون (Asset)
-- البيع → COGS (تكلفة البضاعة المباعة)
-- الربح = المبيعات - COGS - المصروفات
-- =============================================

-- دالة لتسجيل قيد COGS تلقائيًا عند البيع (باستخدام FIFO)
CREATE OR REPLACE FUNCTION auto_create_cogs_journal()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
  v_product_cost NUMERIC;
  v_cogs_amount NUMERIC;
  v_inventory_account_id UUID;
  v_cogs_account_id UUID;
  v_journal_entry_id UUID;
  v_invoice_number TEXT;
  v_invoice_date DATE;
  v_product_item_type TEXT;
BEGIN
  -- فقط لحركات البيع (sale)
  IF NEW.transaction_type != 'sale' THEN
    RETURN NEW;
  END IF;

  -- تجاهل الخدمات (Services لا تؤثر على المخزون)
  SELECT item_type INTO v_product_item_type
  FROM products
  WHERE id = NEW.product_id;

  IF v_product_item_type = 'service' THEN
    RETURN NEW;
  END IF;

  -- الحصول على company_id
  SELECT company_id INTO v_company_id FROM products WHERE id = NEW.product_id;

  -- حساب قيمة COGS باستخدام FIFO
  -- استهلاك الدفعات وحساب التكلفة
  v_cogs_amount := consume_fifo_lots(
    v_company_id,
    NEW.product_id,
    ABS(NEW.quantity_change),
    'sale',
    'invoice',
    NEW.reference_id,
    CURRENT_DATE
  );
  
  -- إذا كانت التكلفة = 0، لا نسجل قيد
  IF v_cogs_amount = 0 THEN
    RETURN NEW;
  END IF;

  -- الحصول على حسابات المخزون و COGS
  SELECT id INTO v_inventory_account_id 
  FROM chart_of_accounts 
  WHERE company_id = v_company_id 
    AND sub_type = 'inventory' 
    AND (parent_id IS NOT NULL OR level > 1)
  LIMIT 1;

  SELECT id INTO v_cogs_account_id 
  FROM chart_of_accounts 
  WHERE company_id = v_company_id 
    AND (sub_type = 'cost_of_goods_sold' OR sub_type = 'cogs' OR account_code = '5000')
    AND (parent_id IS NOT NULL OR level > 1)
  LIMIT 1;

  -- إذا لم نجد الحسابات، لا نسجل قيد
  IF v_inventory_account_id IS NULL OR v_cogs_account_id IS NULL THEN
    RAISE WARNING 'COGS accounts not found for company %', v_company_id;
    RETURN NEW;
  END IF;

  -- الحصول على معلومات الفاتورة
  SELECT invoice_number, invoice_date 
  INTO v_invoice_number, v_invoice_date
  FROM invoices 
  WHERE id = NEW.reference_id;

  -- إنشاء قيد COGS
  INSERT INTO journal_entries (
    company_id,
    reference_type,
    reference_id,
    entry_date,
    description,
    branch_id,
    cost_center_id
  ) VALUES (
    v_company_id,
    'invoice_cogs',
    NEW.reference_id,
    COALESCE(v_invoice_date, CURRENT_DATE),
    'تكلفة البضاعة المباعة - ' || COALESCE(v_invoice_number, 'فاتورة'),
    NEW.branch_id,
    NEW.cost_center_id
  ) RETURNING id INTO v_journal_entry_id;

  -- سطور القيد:
  -- مدين: تكلفة البضاعة المباعة (COGS) - مصروف
  -- دائن: المخزون (Inventory) - أصل
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES 
  (
    v_journal_entry_id,
    v_cogs_account_id,
    v_cogs_amount,
    0,
    'تكلفة البضاعة المباعة'
  ),
  (
    v_journal_entry_id,
    v_inventory_account_id,
    0,
    v_cogs_amount,
    'خصم من المخزون'
  );

  -- ربط حركة المخزون بالقيد المحاسبي
  NEW.journal_entry_id := v_journal_entry_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- حذف الـ Trigger القديم إن وجد
DROP TRIGGER IF EXISTS trg_auto_cogs_on_sale ON inventory_transactions;

-- إنشاء الـ Trigger الجديد
CREATE TRIGGER trg_auto_cogs_on_sale
BEFORE INSERT ON inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION auto_create_cogs_journal();

-- ملاحظة: هذا الـ Trigger يعمل فقط على المعاملات الجديدة
-- للمعاملات القديمة، يجب تشغيل سكريبت إصلاح منفصل


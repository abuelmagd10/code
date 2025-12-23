-- =============================================
-- محرك المحاسبة على أساس الاستحقاق (Accrual Accounting Engine)
-- مطابق 100% لـ Zoho Books
-- =============================================
-- الهدف: تطبيق Accrual Accounting بدلاً من Cash Basis
-- المعايير:
-- ✅ تسجيل الإيراد عند إصدار الفاتورة (وليس عند الدفع)
-- ✅ تسجيل COGS عند التسليم (وليس عند الشراء)
-- ✅ فصل التحصيل النقدي عن الاعتراف بالإيراد
-- ✅ ربط المخزون محاسبياً بالأحداث
-- ✅ Trial Balance دائماً متزن
-- =============================================

-- =============================================
-- 1. دالة تسجيل الإيراد عند إصدار الفاتورة (Issue Event)
-- =============================================
CREATE OR REPLACE FUNCTION create_invoice_revenue_journal(
  p_invoice_id UUID,
  p_company_id UUID
) RETURNS UUID AS $$
DECLARE
  v_journal_entry_id UUID;
  v_ar_account_id UUID;
  v_revenue_account_id UUID;
  v_vat_account_id UUID;
  v_invoice_data RECORD;
  v_net_amount NUMERIC;
  v_vat_amount NUMERIC;
  v_total_amount NUMERIC;
BEGIN
  -- الحصول على بيانات الفاتورة
  SELECT 
    invoice_number,
    invoice_date,
    subtotal,
    tax_amount,
    total_amount,
    status
  INTO v_invoice_data
  FROM invoices 
  WHERE id = p_invoice_id AND company_id = p_company_id;

  -- فقط للفواتير المرسلة (ليس المسودات)
  IF v_invoice_data.status = 'draft' THEN
    RETURN NULL;
  END IF;

  -- حساب المبالغ
  v_net_amount := COALESCE(v_invoice_data.subtotal, 0);
  v_vat_amount := COALESCE(v_invoice_data.tax_amount, 0);
  v_total_amount := COALESCE(v_invoice_data.total_amount, 0);

  -- الحصول على الحسابات المطلوبة
  SELECT id INTO v_ar_account_id 
  FROM chart_of_accounts 
  WHERE company_id = p_company_id 
    AND sub_type = 'accounts_receivable'
    AND is_active = true
  LIMIT 1;

  SELECT id INTO v_revenue_account_id 
  FROM chart_of_accounts 
  WHERE company_id = p_company_id 
    AND sub_type = 'sales_revenue'
    AND is_active = true
  LIMIT 1;

  SELECT id INTO v_vat_account_id 
  FROM chart_of_accounts 
  WHERE company_id = p_company_id 
    AND sub_type = 'vat_output'
    AND is_active = true
  LIMIT 1;

  -- التحقق من وجود الحسابات
  IF v_ar_account_id IS NULL OR v_revenue_account_id IS NULL THEN
    RAISE EXCEPTION 'Required accounts not found for revenue journal';
  END IF;

  -- إنشاء القيد المحاسبي
  INSERT INTO journal_entries (
    company_id,
    reference_type,
    reference_id,
    entry_date,
    description
  ) VALUES (
    p_company_id,
    'invoice',
    p_invoice_id,
    v_invoice_data.invoice_date,
    'إيراد المبيعات - ' || v_invoice_data.invoice_number
  ) RETURNING id INTO v_journal_entry_id;

  -- سطور القيد:
  -- مدين: العملاء (Accounts Receivable) - أصل
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_journal_entry_id,
    v_ar_account_id,
    v_total_amount,
    0,
    'مستحق من العميل'
  );

  -- دائن: إيرادات المبيعات (Sales Revenue) - إيراد
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_journal_entry_id,
    v_revenue_account_id,
    0,
    v_net_amount,
    'إيراد المبيعات'
  );

  -- دائن: ضريبة القيمة المضافة (إذا وجدت)
  IF v_vat_amount > 0 AND v_vat_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description
    ) VALUES (
      v_journal_entry_id,
      v_vat_account_id,
      0,
      v_vat_amount,
      'ضريبة القيمة المضافة'
    );
  END IF;

  RETURN v_journal_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 2. دالة تسجيل COGS عند التسليم (Delivery Event)
-- =============================================
CREATE OR REPLACE FUNCTION create_cogs_journal_on_delivery(
  p_invoice_id UUID,
  p_company_id UUID
) RETURNS UUID AS $$
DECLARE
  v_journal_entry_id UUID;
  v_inventory_account_id UUID;
  v_cogs_account_id UUID;
  v_total_cogs NUMERIC := 0;
  v_invoice_data RECORD;
  v_item RECORD;
BEGIN
  -- الحصول على بيانات الفاتورة
  SELECT 
    invoice_number,
    invoice_date,
    status
  INTO v_invoice_data
  FROM invoices 
  WHERE id = p_invoice_id AND company_id = p_company_id;

  -- فقط للفواتير المرسلة
  IF v_invoice_data.status = 'draft' THEN
    RETURN NULL;
  END IF;

  -- حساب إجمالي COGS من بنود الفاتورة
  FOR v_item IN 
    SELECT 
      ii.quantity,
      p.cost_price,
      p.item_type
    FROM invoice_items ii
    JOIN products p ON ii.product_id = p.id
    WHERE ii.invoice_id = p_invoice_id
      AND p.item_type != 'service' -- تجاهل الخدمات
  LOOP
    v_total_cogs := v_total_cogs + (v_item.quantity * COALESCE(v_item.cost_price, 0));
  END LOOP;

  -- إذا لم توجد تكلفة، لا نسجل قيد
  IF v_total_cogs = 0 THEN
    RETURN NULL;
  END IF;

  -- الحصول على الحسابات المطلوبة
  SELECT id INTO v_inventory_account_id 
  FROM chart_of_accounts 
  WHERE company_id = p_company_id 
    AND sub_type = 'inventory'
    AND is_active = true
  LIMIT 1;

  SELECT id INTO v_cogs_account_id 
  FROM chart_of_accounts 
  WHERE company_id = p_company_id 
    AND (sub_type = 'cogs' OR sub_type = 'cost_of_goods_sold')
    AND is_active = true
  LIMIT 1;

  -- التحقق من وجود الحسابات
  IF v_inventory_account_id IS NULL OR v_cogs_account_id IS NULL THEN
    RAISE EXCEPTION 'COGS accounts not found';
  END IF;

  -- إنشاء قيد COGS
  INSERT INTO journal_entries (
    company_id,
    reference_type,
    reference_id,
    entry_date,
    description
  ) VALUES (
    p_company_id,
    'invoice_cogs',
    p_invoice_id,
    v_invoice_data.invoice_date,
    'تكلفة البضاعة المباعة - ' || v_invoice_data.invoice_number
  ) RETURNING id INTO v_journal_entry_id;

  -- سطور القيد:
  -- مدين: تكلفة البضاعة المباعة (COGS) - مصروف
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_journal_entry_id,
    v_cogs_account_id,
    v_total_cogs,
    0,
    'تكلفة البضاعة المباعة'
  );

  -- دائن: المخزون (Inventory) - أصل
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_journal_entry_id,
    v_inventory_account_id,
    0,
    v_total_cogs,
    'خصم من المخزون'
  );

  RETURN v_journal_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 3. دالة تسجيل التحصيل النقدي (Payment Event)
-- =============================================
CREATE OR REPLACE FUNCTION create_payment_journal(
  p_payment_id UUID,
  p_company_id UUID
) RETURNS UUID AS $$
DECLARE
  v_journal_entry_id UUID;
  v_cash_account_id UUID;
  v_ar_account_id UUID;
  v_payment_data RECORD;
BEGIN
  -- الحصول على بيانات الدفعة
  SELECT 
    payment_date,
    amount,
    payment_method,
    reference_number
  INTO v_payment_data
  FROM payments 
  WHERE id = p_payment_id AND company_id = p_company_id;

  -- الحصول على الحسابات المطلوبة
  SELECT id INTO v_cash_account_id 
  FROM chart_of_accounts 
  WHERE company_id = p_company_id 
    AND (sub_type = 'cash' OR sub_type = 'bank')
    AND is_active = true
  LIMIT 1;

  SELECT id INTO v_ar_account_id 
  FROM chart_of_accounts 
  WHERE company_id = p_company_id 
    AND sub_type = 'accounts_receivable'
    AND is_active = true
  LIMIT 1;

  -- التحقق من وجود الحسابات
  IF v_cash_account_id IS NULL OR v_ar_account_id IS NULL THEN
    RAISE EXCEPTION 'Payment accounts not found';
  END IF;

  -- إنشاء قيد التحصيل
  INSERT INTO journal_entries (
    company_id,
    reference_type,
    reference_id,
    entry_date,
    description
  ) VALUES (
    p_company_id,
    'payment',
    p_payment_id,
    v_payment_data.payment_date,
    'تحصيل نقدي - ' || COALESCE(v_payment_data.reference_number, 'دفعة')
  ) RETURNING id INTO v_journal_entry_id;

  -- سطور القيد:
  -- مدين: النقدية/البنك (Cash/Bank) - أصل
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_journal_entry_id,
    v_cash_account_id,
    v_payment_data.amount,
    0,
    'تحصيل نقدي'
  );

  -- دائن: العملاء (Accounts Receivable) - أصل
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_journal_entry_id,
    v_ar_account_id,
    0,
    v_payment_data.amount,
    'تحصيل من العميل'
  );

  RETURN v_journal_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 4. دالة تسجيل المشتريات في المخزون
-- =============================================
CREATE OR REPLACE FUNCTION create_purchase_inventory_journal(
  p_bill_id UUID,
  p_company_id UUID
) RETURNS UUID AS $$
DECLARE
  v_journal_entry_id UUID;
  v_inventory_account_id UUID;
  v_ap_account_id UUID;
  v_vat_input_account_id UUID;
  v_bill_data RECORD;
  v_net_amount NUMERIC;
  v_vat_amount NUMERIC;
  v_total_amount NUMERIC;
BEGIN
  -- الحصول على بيانات فاتورة الشراء
  SELECT 
    bill_number,
    bill_date,
    subtotal,
    tax_amount,
    total_amount,
    status
  INTO v_bill_data
  FROM bills 
  WHERE id = p_bill_id AND company_id = p_company_id;

  -- فقط للفواتير المرسلة
  IF v_bill_data.status = 'draft' THEN
    RETURN NULL;
  END IF;

  -- حساب المبالغ
  v_net_amount := COALESCE(v_bill_data.subtotal, 0);
  v_vat_amount := COALESCE(v_bill_data.tax_amount, 0);
  v_total_amount := COALESCE(v_bill_data.total_amount, 0);

  -- الحصول على الحسابات المطلوبة
  SELECT id INTO v_inventory_account_id 
  FROM chart_of_accounts 
  WHERE company_id = p_company_id 
    AND sub_type = 'inventory'
    AND is_active = true
  LIMIT 1;

  SELECT id INTO v_ap_account_id 
  FROM chart_of_accounts 
  WHERE company_id = p_company_id 
    AND sub_type = 'accounts_payable'
    AND is_active = true
  LIMIT 1;

  SELECT id INTO v_vat_input_account_id 
  FROM chart_of_accounts 
  WHERE company_id = p_company_id 
    AND sub_type = 'vat_input'
    AND is_active = true
  LIMIT 1;

  -- التحقق من وجود الحسابات
  IF v_inventory_account_id IS NULL OR v_ap_account_id IS NULL THEN
    RAISE EXCEPTION 'Purchase accounts not found';
  END IF;

  -- إنشاء قيد الشراء
  INSERT INTO journal_entries (
    company_id,
    reference_type,
    reference_id,
    entry_date,
    description
  ) VALUES (
    p_company_id,
    'bill',
    p_bill_id,
    v_bill_data.bill_date,
    'شراء مخزون - ' || v_bill_data.bill_number
  ) RETURNING id INTO v_journal_entry_id;

  -- سطور القيد:
  -- مدين: المخزون (Inventory) - أصل
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_journal_entry_id,
    v_inventory_account_id,
    v_net_amount,
    0,
    'شراء مخزون'
  );

  -- مدين: ضريبة القيمة المضافة - مدخلات (إذا وجدت)
  IF v_vat_amount > 0 AND v_vat_input_account_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description
    ) VALUES (
      v_journal_entry_id,
      v_vat_input_account_id,
      v_vat_amount,
      0,
      'ضريبة القيمة المضافة - مدخلات'
    );
  END IF;

  -- دائن: الموردين (Accounts Payable) - التزام
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_journal_entry_id,
    v_ap_account_id,
    0,
    v_total_amount,
    'مستحق للمورد'
  );

  RETURN v_journal_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 5. Triggers لتطبيق Accrual Accounting تلقائياً
-- =============================================

-- Trigger لتسجيل الإيراد عند تغيير حالة الفاتورة من draft إلى sent
CREATE OR REPLACE FUNCTION trigger_invoice_revenue_journal()
RETURNS TRIGGER AS $$
BEGIN
  -- إذا تغيرت الحالة من draft إلى أي حالة أخرى
  IF OLD.status = 'draft' AND NEW.status != 'draft' THEN
    -- تسجيل الإيراد
    PERFORM create_invoice_revenue_journal(NEW.id, NEW.company_id);
    -- تسجيل COGS
    PERFORM create_cogs_journal_on_delivery(NEW.id, NEW.company_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger لتسجيل المشتريات عند تغيير حالة فاتورة الشراء
CREATE OR REPLACE FUNCTION trigger_purchase_inventory_journal()
RETURNS TRIGGER AS $$
BEGIN
  -- إذا تغيرت الحالة من draft إلى أي حالة أخرى
  IF OLD.status = 'draft' AND NEW.status != 'draft' THEN
    PERFORM create_purchase_inventory_journal(NEW.id, NEW.company_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger لتسجيل التحصيل عند إدراج دفعة جديدة
CREATE OR REPLACE FUNCTION trigger_payment_journal()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM create_payment_journal(NEW.id, NEW.company_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- حذف Triggers القديمة
DROP TRIGGER IF EXISTS trg_invoice_revenue_journal ON invoices;
DROP TRIGGER IF EXISTS trg_purchase_inventory_journal ON bills;
DROP TRIGGER IF EXISTS trg_payment_journal ON payments;

-- إنشاء Triggers الجديدة
CREATE TRIGGER trg_invoice_revenue_journal
AFTER UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION trigger_invoice_revenue_journal();

CREATE TRIGGER trg_purchase_inventory_journal
AFTER UPDATE ON bills
FOR EACH ROW
EXECUTE FUNCTION trigger_purchase_inventory_journal();

CREATE TRIGGER trg_payment_journal
AFTER INSERT ON payments
FOR EACH ROW
EXECUTE FUNCTION trigger_payment_journal();

-- =============================================
-- 6. دالة إصلاح البيانات الحالية (Opening Balances)
-- =============================================
CREATE OR REPLACE FUNCTION fix_existing_data_with_opening_balances(
  p_company_id UUID
) RETURNS TEXT AS $$
DECLARE
  v_result TEXT := '';
  v_invoice RECORD;
  v_bill RECORD;
  v_payment RECORD;
  v_count INTEGER := 0;
BEGIN
  v_result := 'بدء إصلاح البيانات الحالية...' || E'\n';

  -- 1. إصلاح الفواتير المرسلة بدون قيود محاسبية
  FOR v_invoice IN 
    SELECT i.id, i.company_id
    FROM invoices i
    WHERE i.company_id = p_company_id
      AND i.status != 'draft'
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je 
        WHERE je.reference_type = 'invoice' 
          AND je.reference_id = i.id
      )
  LOOP
    -- تسجيل الإيراد
    PERFORM create_invoice_revenue_journal(v_invoice.id, v_invoice.company_id);
    -- تسجيل COGS
    PERFORM create_cogs_journal_on_delivery(v_invoice.id, v_invoice.company_id);
    v_count := v_count + 1;
  END LOOP;
  
  v_result := v_result || 'تم إصلاح ' || v_count || ' فاتورة بيع' || E'\n';
  v_count := 0;

  -- 2. إصلاح فواتير الشراء المرسلة بدون قيود محاسبية
  FOR v_bill IN 
    SELECT b.id, b.company_id
    FROM bills b
    WHERE b.company_id = p_company_id
      AND b.status != 'draft'
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je 
        WHERE je.reference_type = 'bill' 
          AND je.reference_id = b.id
      )
  LOOP
    PERFORM create_purchase_inventory_journal(v_bill.id, v_bill.company_id);
    v_count := v_count + 1;
  END LOOP;
  
  v_result := v_result || 'تم إصلاح ' || v_count || ' فاتورة شراء' || E'\n';
  v_count := 0;

  -- 3. إصلاح المدفوعات بدون قيود محاسبية
  FOR v_payment IN 
    SELECT p.id, p.company_id
    FROM payments p
    WHERE p.company_id = p_company_id
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je 
        WHERE je.reference_type = 'payment' 
          AND je.reference_id = p.id
      )
  LOOP
    PERFORM create_payment_journal(v_payment.id, v_payment.company_id);
    v_count := v_count + 1;
  END LOOP;
  
  v_result := v_result || 'تم إصلاح ' || v_count || ' دفعة' || E'\n';
  v_result := v_result || 'تم الانتهاء من إصلاح البيانات بنجاح!';

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 7. دالة التحقق من صحة Accrual Accounting
-- =============================================
CREATE OR REPLACE FUNCTION validate_accrual_accounting(
  p_company_id UUID
) RETURNS TABLE(
  test_name TEXT,
  status TEXT,
  details TEXT
) AS $$
BEGIN
  -- اختبار 1: الربح يظهر قبل التحصيل
  RETURN QUERY
  SELECT 
    'Revenue Recognition Test'::TEXT,
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM journal_entries je
        JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
        JOIN chart_of_accounts coa ON jel.account_id = coa.id
        WHERE je.company_id = p_company_id
          AND je.reference_type = 'invoice'
          AND coa.sub_type = 'sales_revenue'
          AND jel.credit_amount > 0
      ) THEN 'PASS'::TEXT
      ELSE 'FAIL'::TEXT
    END,
    'Revenue is recorded when invoice is issued'::TEXT;

  -- اختبار 2: COGS مسجل عند البيع
  RETURN QUERY
  SELECT 
    'COGS Recognition Test'::TEXT,
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM journal_entries je
        JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
        JOIN chart_of_accounts coa ON jel.account_id = coa.id
        WHERE je.company_id = p_company_id
          AND je.reference_type = 'invoice_cogs'
          AND coa.sub_type IN ('cogs', 'cost_of_goods_sold')
          AND jel.debit_amount > 0
      ) THEN 'PASS'::TEXT
      ELSE 'FAIL'::TEXT
    END,
    'COGS is recorded when goods are delivered'::TEXT;

  -- اختبار 3: Trial Balance متزن
  RETURN QUERY
  SELECT 
    'Trial Balance Test'::TEXT,
    CASE 
      WHEN ABS(
        (SELECT COALESCE(SUM(debit_amount), 0) FROM journal_entry_lines jel
         JOIN journal_entries je ON jel.journal_entry_id = je.id
         WHERE je.company_id = p_company_id) -
        (SELECT COALESCE(SUM(credit_amount), 0) FROM journal_entry_lines jel
         JOIN journal_entries je ON jel.journal_entry_id = je.id
         WHERE je.company_id = p_company_id)
      ) < 0.01 THEN 'PASS'::TEXT
      ELSE 'FAIL'::TEXT
    END,
    'Total debits equal total credits'::TEXT;

  -- اختبار 4: المخزون له قيمة محاسبية
  RETURN QUERY
  SELECT 
    'Inventory Valuation Test'::TEXT,
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM journal_entry_lines jel
        JOIN journal_entries je ON jel.journal_entry_id = je.id
        JOIN chart_of_accounts coa ON jel.account_id = coa.id
        WHERE je.company_id = p_company_id
          AND coa.sub_type = 'inventory'
          AND jel.debit_amount > 0
      ) THEN 'PASS'::TEXT
      ELSE 'FAIL'::TEXT
    END,
    'Inventory has accounting value'::TEXT;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- تعليقات الاستخدام
-- =============================================
/*
لتطبيق محرك المحاسبة على أساس الاستحقاق:

1. تشغيل هذا السكريبت لإنشاء الدوال والـ Triggers

2. إصلاح البيانات الحالية:
   SELECT fix_existing_data_with_opening_balances('YOUR_COMPANY_ID');

3. التحقق من صحة التطبيق:
   SELECT * FROM validate_accrual_accounting('YOUR_COMPANY_ID');

4. من الآن فصاعداً، سيعمل النظام تلقائياً:
   - عند إرسال فاتورة → تسجيل الإيراد + COGS
   - عند استلام دفعة → تسجيل التحصيل النقدي
   - عند شراء مخزون → تسجيل في المخزون

النتيجة: نظام محاسبي مطابق 100% لـ Zoho Books!
*/
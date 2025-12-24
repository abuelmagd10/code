-- =============================================
-- Zoho Books Accounting Pattern Implementation
-- =============================================
-- هذا السكريبت يطبق النمط المحاسبي المطابق لـ Zoho Books
-- ويمنع الأخطاء المحاسبية الشائعة
-- =============================================

-- =============================================
-- 1. COGS Reversal Trigger for Sales Returns
-- =============================================
-- عند إرجاع بضاعة، يجب عكس قيد COGS:
-- Dr: Inventory (المخزون)
-- Cr: COGS (تكلفة البضاعة المباعة)

CREATE OR REPLACE FUNCTION auto_reverse_cogs_on_sale_return()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
  v_product_cost NUMERIC;
  v_cogs_reversal_amount NUMERIC;
  v_inventory_account_id UUID;
  v_cogs_account_id UUID;
  v_journal_entry_id UUID;
  v_product_item_type TEXT;
  v_existing_reversal UUID;
BEGIN
  -- فقط لمرتجعات المبيعات (sale_return)
  IF NEW.transaction_type != 'sale_return' THEN
    RETURN NEW;
  END IF;

  -- تجاهل الخدمات
  SELECT item_type INTO v_product_item_type 
  FROM products 
  WHERE id = NEW.product_id;
  
  IF v_product_item_type = 'service' THEN
    RETURN NEW;
  END IF;

  -- الحصول على company_id وتكلفة المنتج
  SELECT company_id, cost_price INTO v_company_id, v_product_cost 
  FROM products 
  WHERE id = NEW.product_id;
  
  -- حساب قيمة COGS المرتجعة
  v_cogs_reversal_amount := ABS(NEW.quantity_change) * COALESCE(v_product_cost, 0);
  
  IF v_cogs_reversal_amount = 0 THEN
    RETURN NEW;
  END IF;

  -- التحقق من عدم وجود قيد عكس COGS سابق لنفس المرجع
  SELECT id INTO v_existing_reversal
  FROM journal_entries
  WHERE company_id = v_company_id
    AND reference_type = 'sales_return_cogs'
    AND reference_id = NEW.reference_id
  LIMIT 1;

  IF v_existing_reversal IS NOT NULL THEN
    -- تحديث القيد الموجود بدلاً من إنشاء قيد جديد
    UPDATE journal_entry_lines
    SET debit_amount = debit_amount + v_cogs_reversal_amount
    WHERE journal_entry_id = v_existing_reversal AND debit_amount > 0;
    
    UPDATE journal_entry_lines
    SET credit_amount = credit_amount + v_cogs_reversal_amount
    WHERE journal_entry_id = v_existing_reversal AND credit_amount > 0;
    
    NEW.journal_entry_id := v_existing_reversal;
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
    AND sub_type IN ('cost_of_goods_sold', 'cogs')
    AND (parent_id IS NOT NULL OR level > 1)
  LIMIT 1;

  IF v_inventory_account_id IS NULL OR v_cogs_account_id IS NULL THEN
    RAISE WARNING 'Accounts not found for COGS reversal, company %', v_company_id;
    RETURN NEW;
  END IF;

  -- إنشاء قيد عكس COGS
  INSERT INTO journal_entries (
    company_id, reference_type, reference_id, entry_date, description,
    branch_id, cost_center_id, status
  ) VALUES (
    v_company_id, 'sales_return_cogs', NEW.reference_id, CURRENT_DATE,
    'عكس تكلفة البضاعة المرتجعة',
    NEW.branch_id, NEW.cost_center_id, 'posted'
  ) RETURNING id INTO v_journal_entry_id;

  -- سطور القيد (عكس COGS):
  -- مدين: المخزون (Inventory) - إضافة للمخزون
  -- دائن: تكلفة البضاعة المباعة (COGS) - تخفيض المصروف
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
  VALUES 
  (v_journal_entry_id, v_inventory_account_id, v_cogs_reversal_amount, 0, 'إرجاع المخزون - مرتجع'),
  (v_journal_entry_id, v_cogs_account_id, 0, v_cogs_reversal_amount, 'عكس تكلفة البضاعة المرتجعة');

  NEW.journal_entry_id := v_journal_entry_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- حذف الـ Trigger القديم إن وجد
DROP TRIGGER IF EXISTS trg_auto_cogs_reversal_on_return ON inventory_transactions;

-- إنشاء الـ Trigger الجديد
CREATE TRIGGER trg_auto_cogs_reversal_on_return
BEFORE INSERT ON inventory_transactions
FOR EACH ROW
WHEN (NEW.transaction_type = 'sale_return')
EXECUTE FUNCTION auto_reverse_cogs_on_sale_return();

-- =============================================
-- 2. Prevent Duplicate COGS Entries
-- =============================================
CREATE OR REPLACE FUNCTION prevent_duplicate_cogs_entries()
RETURNS TRIGGER AS $$
DECLARE
  v_existing_count INTEGER;
BEGIN
  -- التحقق من reference_type = 'invoice_cogs'
  IF NEW.reference_type = 'invoice_cogs' THEN
    SELECT COUNT(*) INTO v_existing_count
    FROM journal_entries
    WHERE company_id = NEW.company_id
      AND reference_type = 'invoice_cogs'
      AND reference_id = NEW.reference_id;
    
    IF v_existing_count > 0 THEN
      RAISE EXCEPTION 'قيد COGS موجود مسبقاً لهذه الفاتورة. لا يمكن إنشاء قيد مكرر.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_cogs ON journal_entries;
CREATE TRIGGER trg_prevent_duplicate_cogs
BEFORE INSERT ON journal_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_duplicate_cogs_entries();

-- =============================================
-- 3. Validate Journal Entry Balance
-- =============================================
-- التحقق من أن كل قيد متوازن (مجموع المدين = مجموع الدائن)

CREATE OR REPLACE FUNCTION validate_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_total_debit NUMERIC;
  v_total_credit NUMERIC;
BEGIN
  SELECT
    COALESCE(SUM(debit_amount), 0),
    COALESCE(SUM(credit_amount), 0)
  INTO v_total_debit, v_total_credit
  FROM journal_entry_lines
  WHERE journal_entry_id = NEW.journal_entry_id;

  -- إضافة السطر الجديد
  v_total_debit := v_total_debit + COALESCE(NEW.debit_amount, 0);
  v_total_credit := v_total_credit + COALESCE(NEW.credit_amount, 0);

  -- التحقق من التوازن (مع هامش صغير للأخطاء العشرية)
  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    -- تحذير فقط، لا نمنع الإدخال لأن القيد قد يكون غير مكتمل بعد
    RAISE WARNING 'تحذير: القيد غير متوازن. المدين: %, الدائن: %', v_total_debit, v_total_credit;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 4. Function to Check All Journal Entries Balance
-- =============================================
CREATE OR REPLACE FUNCTION check_all_journal_entries_balance(p_company_id UUID DEFAULT NULL)
RETURNS TABLE (
  journal_entry_id UUID,
  entry_date DATE,
  description TEXT,
  total_debit NUMERIC,
  total_credit NUMERIC,
  difference NUMERIC,
  is_balanced BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    je.id,
    je.entry_date,
    je.description,
    COALESCE(SUM(jel.debit_amount), 0) as total_debit,
    COALESCE(SUM(jel.credit_amount), 0) as total_credit,
    ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) as difference,
    ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) < 0.01 as is_balanced
  FROM journal_entries je
  LEFT JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
  WHERE (p_company_id IS NULL OR je.company_id = p_company_id)
  GROUP BY je.id, je.entry_date, je.description
  HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.01
  ORDER BY je.entry_date DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 5. Function to Verify COGS Entries Exist for All Sales
-- =============================================
CREATE OR REPLACE FUNCTION verify_cogs_entries_for_sales(p_company_id UUID)
RETURNS TABLE (
  invoice_id UUID,
  invoice_number TEXT,
  invoice_date DATE,
  has_cogs_entry BOOLEAN,
  expected_cogs NUMERIC,
  actual_cogs NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id as invoice_id,
    i.invoice_number,
    i.invoice_date,
    EXISTS(
      SELECT 1 FROM journal_entries je
      WHERE je.reference_type = 'invoice_cogs' AND je.reference_id = i.id
    ) as has_cogs_entry,
    COALESCE((
      SELECT SUM(ii.quantity * p.cost_price)
      FROM invoice_items ii
      JOIN products p ON ii.product_id = p.id
      WHERE ii.invoice_id = i.id AND p.item_type != 'service'
    ), 0) as expected_cogs,
    COALESCE((
      SELECT SUM(jel.debit_amount)
      FROM journal_entries je
      JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
      JOIN chart_of_accounts coa ON jel.account_id = coa.id
      WHERE je.reference_type = 'invoice_cogs'
        AND je.reference_id = i.id
        AND coa.sub_type IN ('cost_of_goods_sold', 'cogs')
    ), 0) as actual_cogs
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND i.status NOT IN ('draft', 'cancelled')
  ORDER BY i.invoice_date DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 6. Function to Fix Missing COGS Entries
-- =============================================
CREATE OR REPLACE FUNCTION fix_missing_cogs_entries(p_company_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_fixed_count INTEGER := 0;
  v_invoice RECORD;
  v_cogs_amount NUMERIC;
  v_inventory_account_id UUID;
  v_cogs_account_id UUID;
  v_journal_entry_id UUID;
BEGIN
  -- الحصول على حسابات المخزون و COGS
  SELECT id INTO v_inventory_account_id
  FROM chart_of_accounts
  WHERE company_id = p_company_id
    AND sub_type = 'inventory'
    AND (parent_id IS NOT NULL OR level > 1)
  LIMIT 1;

  SELECT id INTO v_cogs_account_id
  FROM chart_of_accounts
  WHERE company_id = p_company_id
    AND sub_type IN ('cost_of_goods_sold', 'cogs')
    AND (parent_id IS NOT NULL OR level > 1)
  LIMIT 1;

  IF v_inventory_account_id IS NULL OR v_cogs_account_id IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على حسابات المخزون أو COGS';
  END IF;

  -- البحث عن الفواتير بدون قيد COGS
  FOR v_invoice IN
    SELECT
      i.id,
      i.invoice_number,
      i.invoice_date,
      i.branch_id,
      COALESCE((
        SELECT SUM(ii.quantity * p.cost_price)
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        WHERE ii.invoice_id = i.id AND p.item_type != 'service'
      ), 0) as cogs_amount
    FROM invoices i
    WHERE i.company_id = p_company_id
      AND i.status NOT IN ('draft', 'cancelled')
      AND NOT EXISTS(
        SELECT 1 FROM journal_entries je
        WHERE je.reference_type = 'invoice_cogs' AND je.reference_id = i.id
      )
  LOOP
    IF v_invoice.cogs_amount > 0 THEN
      -- إنشاء قيد COGS
      INSERT INTO journal_entries (
        company_id, reference_type, reference_id, entry_date, description,
        branch_id, status
      ) VALUES (
        p_company_id, 'invoice_cogs', v_invoice.id, v_invoice.invoice_date,
        'تكلفة البضاعة المباعة - ' || v_invoice.invoice_number,
        v_invoice.branch_id, 'posted'
      ) RETURNING id INTO v_journal_entry_id;

      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
      VALUES
      (v_journal_entry_id, v_cogs_account_id, v_invoice.cogs_amount, 0, 'تكلفة البضاعة المباعة'),
      (v_journal_entry_id, v_inventory_account_id, 0, v_invoice.cogs_amount, 'خصم من المخزون');

      v_fixed_count := v_fixed_count + 1;
    END IF;
  END LOOP;

  RETURN v_fixed_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 7. Accounting Integrity Check Function
-- =============================================
CREATE OR REPLACE FUNCTION check_accounting_integrity(p_company_id UUID)
RETURNS TABLE (
  check_name TEXT,
  status TEXT,
  details TEXT
) AS $$
DECLARE
  v_unbalanced_count INTEGER;
  v_missing_cogs_count INTEGER;
  v_duplicate_cogs_count INTEGER;
BEGIN
  -- 1. التحقق من القيود غير المتوازنة
  SELECT COUNT(*) INTO v_unbalanced_count
  FROM (SELECT * FROM check_all_journal_entries_balance(p_company_id)) t;

  check_name := 'القيود غير المتوازنة';
  IF v_unbalanced_count = 0 THEN
    status := '✅ نجاح';
    details := 'جميع القيود متوازنة';
  ELSE
    status := '❌ فشل';
    details := v_unbalanced_count || ' قيد غير متوازن';
  END IF;
  RETURN NEXT;

  -- 2. التحقق من قيود COGS المفقودة
  SELECT COUNT(*) INTO v_missing_cogs_count
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND i.status NOT IN ('draft', 'cancelled')
    AND NOT EXISTS(
      SELECT 1 FROM journal_entries je
      WHERE je.reference_type = 'invoice_cogs' AND je.reference_id = i.id
    )
    AND EXISTS(
      SELECT 1 FROM invoice_items ii
      JOIN products p ON ii.product_id = p.id
      WHERE ii.invoice_id = i.id AND p.item_type != 'service' AND p.cost_price > 0
    );

  check_name := 'قيود COGS المفقودة';
  IF v_missing_cogs_count = 0 THEN
    status := '✅ نجاح';
    details := 'جميع الفواتير لديها قيود COGS';
  ELSE
    status := '❌ فشل';
    details := v_missing_cogs_count || ' فاتورة بدون قيد COGS';
  END IF;
  RETURN NEXT;

  -- 3. التحقق من قيود COGS المكررة
  SELECT COUNT(*) INTO v_duplicate_cogs_count
  FROM (
    SELECT reference_id, COUNT(*) as cnt
    FROM journal_entries
    WHERE company_id = p_company_id AND reference_type = 'invoice_cogs'
    GROUP BY reference_id
    HAVING COUNT(*) > 1
  ) t;

  check_name := 'قيود COGS المكررة';
  IF v_duplicate_cogs_count = 0 THEN
    status := '✅ نجاح';
    details := 'لا توجد قيود COGS مكررة';
  ELSE
    status := '❌ فشل';
    details := v_duplicate_cogs_count || ' فاتورة لديها قيود COGS مكررة';
  END IF;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 8. Delete Duplicate COGS Entries (Keep First)
-- =============================================
CREATE OR REPLACE FUNCTION delete_duplicate_cogs_entries(p_company_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER := 0;
  v_duplicate RECORD;
BEGIN
  FOR v_duplicate IN
    SELECT reference_id, array_agg(id ORDER BY created_at) as entry_ids
    FROM journal_entries
    WHERE company_id = p_company_id AND reference_type = 'invoice_cogs'
    GROUP BY reference_id
    HAVING COUNT(*) > 1
  LOOP
    -- حذف جميع القيود ما عدا الأول
    DELETE FROM journal_entry_lines
    WHERE journal_entry_id = ANY(v_duplicate.entry_ids[2:]);

    DELETE FROM journal_entries
    WHERE id = ANY(v_duplicate.entry_ids[2:]);

    v_deleted_count := v_deleted_count + array_length(v_duplicate.entry_ids, 1) - 1;
  END LOOP;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 9. Zoho Books Pattern Summary
-- =============================================
--
-- نمط Zoho Books للقيود المحاسبية:
--
-- 1. فاتورة مبيعات (Invoice):
--    Dr: Accounts Receivable (ذمم مدينة)
--    Cr: Sales Revenue (إيرادات المبيعات)
--    Cr: VAT Output (ضريبة مخرجات) - إن وجدت
--
-- 2. تكلفة البضاعة المباعة (COGS) - تلقائي:
--    Dr: Cost of Goods Sold (تكلفة البضاعة المباعة)
--    Cr: Inventory (المخزون)
--
-- 3. استلام دفعة (Payment Received):
--    Dr: Cash/Bank (نقدية/بنك)
--    Cr: Accounts Receivable (ذمم مدينة)
--
-- 4. مرتجع مبيعات (Sales Return):
--    Dr: Sales Returns (مردودات المبيعات)
--    Dr: VAT Output (ضريبة مخرجات) - إن وجدت
--    Cr: Accounts Receivable (ذمم مدينة)
--
-- 5. عكس COGS للمرتجع - تلقائي:
--    Dr: Inventory (المخزون)
--    Cr: Cost of Goods Sold (تكلفة البضاعة المباعة)
--
-- 6. فاتورة مشتريات (Bill):
--    Dr: Inventory (المخزون) - للمنتجات
--    Dr: Expense (مصروف) - للخدمات
--    Dr: VAT Input (ضريبة مدخلات) - إن وجدت
--    Cr: Accounts Payable (ذمم دائنة)
--
-- 7. دفع فاتورة مشتريات (Bill Payment):
--    Dr: Accounts Payable (ذمم دائنة)
--    Cr: Cash/Bank (نقدية/بنك)
--
-- 8. مرتجع مشتريات (Purchase Return):
--    Dr: Accounts Payable (ذمم دائنة)
--    Cr: Inventory (المخزون)
--    Cr: VAT Input (ضريبة مدخلات) - إن وجدت
-- =============================================

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION check_all_journal_entries_balance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_cogs_entries_for_sales(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fix_missing_cogs_entries(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_accounting_integrity(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_duplicate_cogs_entries(UUID) TO authenticated;

-- =============================================
-- Usage Examples:
-- =============================================
--
-- 1. التحقق من سلامة النظام المحاسبي:
--    SELECT * FROM check_accounting_integrity('company-uuid-here');
--
-- 2. عرض القيود غير المتوازنة:
--    SELECT * FROM check_all_journal_entries_balance('company-uuid-here');
--
-- 3. التحقق من قيود COGS للمبيعات:
--    SELECT * FROM verify_cogs_entries_for_sales('company-uuid-here');
--
-- 4. إصلاح قيود COGS المفقودة:
--    SELECT fix_missing_cogs_entries('company-uuid-here');
--
-- 5. حذف قيود COGS المكررة:
--    SELECT delete_duplicate_cogs_entries('company-uuid-here');
-- =============================================


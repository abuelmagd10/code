-- =============================================
-- تصحيح البيانات القديمة - COGS Accounting Fix
-- =============================================
-- هذا السكريبت يصحح جميع البيانات القديمة لتطبيق النظام المحاسبي الصحيح

-- 1️⃣ إنشاء قيود COGS للمبيعات القديمة
CREATE OR REPLACE FUNCTION fix_all_historical_cogs()
RETURNS TABLE(
  company_id UUID,
  fixed_invoices INTEGER,
  total_cogs_amount NUMERIC,
  status TEXT
) AS $$
DECLARE
  company_record RECORD;
  invoice_record RECORD;
  item_record RECORD;
  v_cogs_amount NUMERIC;
  v_inventory_account_id UUID;
  v_cogs_account_id UUID;
  v_journal_entry_id UUID;
  fixed_count INTEGER := 0;
  total_cogs NUMERIC := 0;
BEGIN
  -- معالجة كل شركة
  FOR company_record IN 
    SELECT DISTINCT c.id, c.name 
    FROM companies c
  LOOP
    -- الحصول على حسابات المخزون و COGS
    SELECT id INTO v_inventory_account_id 
    FROM chart_of_accounts 
    WHERE company_id = company_record.id 
      AND sub_type = 'inventory' 
      AND (parent_id IS NOT NULL OR level > 1)
    LIMIT 1;

    SELECT id INTO v_cogs_account_id 
    FROM chart_of_accounts 
    WHERE company_id = company_record.id 
      AND (sub_type = 'cost_of_goods_sold' OR sub_type = 'cogs' OR account_code = '5000')
      AND (parent_id IS NOT NULL OR level > 1)
    LIMIT 1;

    -- تخطي الشركة إذا لم نجد الحسابات
    IF v_inventory_account_id IS NULL OR v_cogs_account_id IS NULL THEN
      CONTINUE;
    END IF;

    -- معالجة الفواتير المرسلة/المدفوعة بدون قيود COGS
    FOR invoice_record IN 
      SELECT i.id, i.invoice_number, i.invoice_date, i.company_id
      FROM invoices i
      WHERE i.company_id = company_record.id
        AND i.status IN ('sent', 'partially_paid', 'paid')
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je 
          WHERE je.reference_id = i.id 
            AND je.reference_type = 'invoice_cogs'
        )
    LOOP
      v_cogs_amount := 0;
      
      -- حساب إجمالي COGS للفاتورة
      FOR item_record IN
        SELECT ii.product_id, ii.quantity, p.cost_price, p.item_type
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        WHERE ii.invoice_id = invoice_record.id
          AND p.item_type != 'service'
          AND COALESCE(p.cost_price, 0) > 0
      LOOP
        v_cogs_amount := v_cogs_amount + (item_record.quantity * COALESCE(item_record.cost_price, 0));
      END LOOP;

      -- إنشاء قيد COGS إذا كان المبلغ > 0
      IF v_cogs_amount > 0 THEN
        INSERT INTO journal_entries (
          company_id,
          reference_type,
          reference_id,
          entry_date,
          description
        ) VALUES (
          company_record.id,
          'invoice_cogs',
          invoice_record.id,
          invoice_record.invoice_date,
          'تكلفة البضاعة المباعة (تصحيح) - ' || invoice_record.invoice_number
        ) RETURNING id INTO v_journal_entry_id;

        -- سطور القيد
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

        -- تحديث حركات المخزون لربطها بالقيد
        UPDATE inventory_transactions
        SET journal_entry_id = v_journal_entry_id
        WHERE reference_id = invoice_record.id
          AND transaction_type = 'sale'
          AND journal_entry_id IS NULL;

        fixed_count := fixed_count + 1;
        total_cogs := total_cogs + v_cogs_amount;
      END IF;
    END LOOP;

    -- إرجاع النتيجة لكل شركة
    RETURN QUERY SELECT 
      company_record.id,
      fixed_count,
      total_cogs,
      CASE 
        WHEN fixed_count > 0 THEN 'تم التصحيح'
        ELSE 'لا يحتاج تصحيح'
      END;
    
    fixed_count := 0;
    total_cogs := 0;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2️⃣ تصحيح قيود المشتريات القديمة (تحويل من مصروف إلى مخزون)
CREATE OR REPLACE FUNCTION fix_purchase_accounting()
RETURNS TABLE(
  company_id UUID,
  fixed_bills INTEGER,
  status TEXT
) AS $$
DECLARE
  company_record RECORD;
  bill_record RECORD;
  v_inventory_account_id UUID;
  v_expense_account_id UUID;
  v_journal_entry_id UUID;
  fixed_count INTEGER := 0;
BEGIN
  FOR company_record IN 
    SELECT DISTINCT c.id FROM companies c
  LOOP
    -- الحصول على حسابات المخزون والمصروفات
    SELECT id INTO v_inventory_account_id 
    FROM chart_of_accounts 
    WHERE company_id = company_record.id 
      AND sub_type = 'inventory' 
    LIMIT 1;

    SELECT id INTO v_expense_account_id 
    FROM chart_of_accounts 
    WHERE company_id = company_record.id 
      AND account_type = 'expense'
      AND sub_type != 'cogs'
    LIMIT 1;

    IF v_inventory_account_id IS NULL OR v_expense_account_id IS NULL THEN
      CONTINUE;
    END IF;

    -- البحث عن قيود فواتير المشتريات المسجلة كمصروف
    FOR bill_record IN
      SELECT DISTINCT je.id, je.reference_id, b.bill_number, b.subtotal
      FROM journal_entries je
      JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
      JOIN bills b ON je.reference_id = b.id
      WHERE je.company_id = company_record.id
        AND je.reference_type = 'bill'
        AND jel.account_id = v_expense_account_id
        AND jel.debit_amount > 0
    LOOP
      -- إنشاء قيد تصحيحي
      INSERT INTO journal_entries (
        company_id,
        reference_type,
        reference_id,
        entry_date,
        description
      ) VALUES (
        company_record.id,
        'bill_correction',
        bill_record.reference_id,
        CURRENT_DATE,
        'تصحيح: تحويل مصروف إلى مخزون - ' || bill_record.bill_number
      ) RETURNING id INTO v_journal_entry_id;

      -- القيد التصحيحي
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        description
      ) VALUES 
      (
        v_journal_entry_id,
        v_inventory_account_id,
        bill_record.subtotal,
        0,
        'تحويل إلى مخزون'
      ),
      (
        v_journal_entry_id,
        v_expense_account_id,
        0,
        bill_record.subtotal,
        'عكس المصروف'
      );

      fixed_count := fixed_count + 1;
    END LOOP;

    RETURN QUERY SELECT 
      company_record.id,
      fixed_count,
      CASE 
        WHEN fixed_count > 0 THEN 'تم تصحيح قيود المشتريات'
        ELSE 'لا يحتاج تصحيح'
      END;
    
    fixed_count := 0;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3️⃣ تشغيل التصحيحات
DO $$
BEGIN
  RAISE NOTICE '🚀 بدء تصحيح البيانات القديمة...';
  
  RAISE NOTICE '1️⃣ تصحيح قيود COGS للمبيعات القديمة...';
  PERFORM fix_all_historical_cogs();
  
  RAISE NOTICE '2️⃣ تصحيح قيود المشتريات القديمة...';
  PERFORM fix_purchase_accounting();
  
  RAISE NOTICE '✅ تم الانتهاء من تصحيح البيانات!';
END $$;

-- 4️⃣ عرض النتائج
SELECT 
  'COGS Fix Results' as operation,
  company_id,
  fixed_invoices,
  total_cogs_amount,
  status
FROM fix_all_historical_cogs()
WHERE fixed_invoices > 0;

SELECT 
  'Purchase Fix Results' as operation,
  company_id,
  fixed_bills,
  status
FROM fix_purchase_accounting()
WHERE fixed_bills > 0;
-- =============================================
-- Fix Historical COGS Entries
-- =============================================
-- هذا السكريبت يصحح قيود COGS للمعاملات القديمة
-- يجب تشغيله مرة واحدة بعد تطبيق الـ Trigger الجديد
-- =============================================

-- دالة لإنشاء قيود COGS للمعاملات القديمة
CREATE OR REPLACE FUNCTION fix_historical_cogs(p_company_id UUID)
RETURNS TABLE(
  invoice_id UUID,
  invoice_number TEXT,
  cogs_amount NUMERIC,
  journal_entry_id UUID,
  status TEXT
) AS $$
DECLARE
  v_transaction RECORD;
  v_product_cost NUMERIC;
  v_cogs_amount NUMERIC;
  v_inventory_account_id UUID;
  v_cogs_account_id UUID;
  v_journal_entry_id UUID;
  v_invoice_number TEXT;
  v_invoice_date DATE;
  v_existing_cogs UUID;
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
    AND (sub_type = 'cost_of_goods_sold' OR sub_type = 'cogs' OR account_code = '5000')
    AND (parent_id IS NOT NULL OR level > 1)
  LIMIT 1;

  -- إذا لم نجد الحسابات، نتوقف
  IF v_inventory_account_id IS NULL OR v_cogs_account_id IS NULL THEN
    RAISE EXCEPTION 'COGS accounts not found for company %', p_company_id;
  END IF;

  -- معالجة جميع معاملات البيع التي ليس لها قيد COGS
  FOR v_transaction IN 
    SELECT 
      it.id,
      it.product_id,
      it.quantity_change,
      it.reference_id,
      it.branch_id,
      it.cost_center_id,
      p.cost_price,
      p.item_type
    FROM inventory_transactions it
    JOIN products p ON it.product_id = p.id
    WHERE it.company_id = p_company_id
      AND it.transaction_type = 'sale'
      AND p.item_type != 'service'
      AND it.journal_entry_id IS NULL -- ليس لها قيد COGS
    ORDER BY it.created_at
  LOOP
    -- حساب قيمة COGS
    v_cogs_amount := ABS(v_transaction.quantity_change) * COALESCE(v_transaction.cost_price, 0);
    
    -- تجاهل إذا كانت التكلفة = 0
    IF v_cogs_amount = 0 THEN
      CONTINUE;
    END IF;

    -- التحقق من عدم وجود قيد COGS سابق
    SELECT id INTO v_existing_cogs
    FROM journal_entries
    WHERE company_id = p_company_id
      AND reference_type = 'invoice_cogs'
      AND reference_id = v_transaction.reference_id
    LIMIT 1;

    IF v_existing_cogs IS NOT NULL THEN
      -- قيد موجود بالفعل، نتخطى
      CONTINUE;
    END IF;

    -- الحصول على معلومات الفاتورة
    SELECT invoice_number, invoice_date 
    INTO v_invoice_number, v_invoice_date
    FROM invoices 
    WHERE id = v_transaction.reference_id;

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
      p_company_id,
      'invoice_cogs',
      v_transaction.reference_id,
      COALESCE(v_invoice_date, CURRENT_DATE),
      'تكلفة البضاعة المباعة (تصحيح) - ' || COALESCE(v_invoice_number, 'فاتورة'),
      v_transaction.branch_id,
      v_transaction.cost_center_id
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

    -- تحديث حركة المخزون لربطها بالقيد
    UPDATE inventory_transactions
    SET journal_entry_id = v_journal_entry_id
    WHERE id = v_transaction.id;

    -- إرجاع النتيجة
    RETURN QUERY SELECT 
      v_transaction.reference_id,
      v_invoice_number,
      v_cogs_amount,
      v_journal_entry_id,
      'created'::TEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ملاحظة: لتشغيل هذه الدالة، استخدم:
-- SELECT * FROM fix_historical_cogs('YOUR_COMPANY_ID');


-- تطبيق نظام المحاسبة على أساس الاستحقاق - النسخة المبسطة
-- لحل مشكلة COGS الخاطئة

-- 1. إضافة الحقول المطلوبة
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'chart_of_accounts' AND column_name = 'sub_type') THEN
        ALTER TABLE chart_of_accounts ADD COLUMN sub_type VARCHAR(50);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'cost_price') THEN
        ALTER TABLE products ADD COLUMN cost_price DECIMAL(15,2) DEFAULT 0;
    END IF;
END $$;

-- 2. تحديث أنواع الحسابات
UPDATE chart_of_accounts SET sub_type = 'cogs' 
WHERE account_type = 'expense' 
  AND (LOWER(account_name) LIKE '%تكلفة%' OR LOWER(account_name) LIKE '%cogs%')
  AND sub_type IS NULL;

UPDATE chart_of_accounts SET sub_type = 'inventory' 
WHERE account_type = 'asset' 
  AND (LOWER(account_name) LIKE '%مخزون%' OR LOWER(account_name) LIKE '%inventory%')
  AND sub_type IS NULL;

-- 3. دالة حساب COGS الصحيحة
CREATE OR REPLACE FUNCTION calculate_correct_cogs(p_invoice_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_total_cogs NUMERIC := 0;
  v_item RECORD;
BEGIN
  FOR v_item IN 
    SELECT 
      ii.quantity,
      COALESCE(p.cost_price, 0) as cost_price
    FROM invoice_items ii
    JOIN products p ON ii.product_id = p.id
    WHERE ii.invoice_id = p_invoice_id
  LOOP
    v_total_cogs := v_total_cogs + (v_item.quantity * v_item.cost_price);
  END LOOP;
  
  RETURN v_total_cogs;
END;
$$ LANGUAGE plpgsql;

-- 4. إصلاح قيود COGS الموجودة
CREATE OR REPLACE FUNCTION fix_existing_cogs_entries(p_company_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_result TEXT := '';
  v_invoice RECORD;
  v_correct_cogs NUMERIC;
  v_current_cogs NUMERIC;
  v_cogs_account_id UUID;
  v_count INTEGER := 0;
BEGIN
  -- الحصول على حساب COGS
  SELECT id INTO v_cogs_account_id 
  FROM chart_of_accounts 
  WHERE company_id = p_company_id AND sub_type = 'cogs'
  LIMIT 1;
  
  IF v_cogs_account_id IS NULL THEN
    RETURN 'حساب تكلفة البضاعة المباعة غير موجود';
  END IF;
  
  -- إصلاح كل فاتورة
  FOR v_invoice IN 
    SELECT DISTINCT i.id, i.invoice_number
    FROM invoices i
    JOIN journal_entries je ON je.reference_id = i.id
    WHERE i.company_id = p_company_id 
      AND je.reference_type = 'invoice_cogs'
  LOOP
    -- حساب COGS الصحيحة
    SELECT calculate_correct_cogs(v_invoice.id) INTO v_correct_cogs;
    
    -- الحصول على COGS الحالية
    SELECT COALESCE(SUM(jel.debit_amount), 0) INTO v_current_cogs
    FROM journal_entries je
    JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
    WHERE je.reference_id = v_invoice.id 
      AND je.reference_type = 'invoice_cogs'
      AND jel.account_id = v_cogs_account_id;
    
    -- إذا كانت مختلفة، قم بالتصحيح
    IF ABS(v_correct_cogs - v_current_cogs) > 0.01 THEN
      -- تحديث المبلغ الصحيح
      UPDATE journal_entry_lines 
      SET debit_amount = v_correct_cogs,
          credit_amount = 0
      WHERE journal_entry_id IN (
        SELECT je.id FROM journal_entries je 
        WHERE je.reference_id = v_invoice.id 
          AND je.reference_type = 'invoice_cogs'
      ) AND account_id = v_cogs_account_id;
      
      -- تحديث المخزون أيضاً
      UPDATE journal_entry_lines 
      SET credit_amount = v_correct_cogs,
          debit_amount = 0
      WHERE journal_entry_id IN (
        SELECT je.id FROM journal_entries je 
        WHERE je.reference_id = v_invoice.id 
          AND je.reference_type = 'invoice_cogs'
      ) AND account_id != v_cogs_account_id;
      
      v_count := v_count + 1;
      v_result := v_result || 'تم إصلاح فاتورة ' || v_invoice.invoice_number || 
                  ' من ' || v_current_cogs || ' إلى ' || v_correct_cogs || E'\n';
    END IF;
  END LOOP;
  
  v_result := v_result || 'تم إصلاح ' || v_count || ' فاتورة' || E'\n';
  v_result := v_result || 'النظام الآن يحسب COGS بناءً على التكلفة الفعلية للمنتجات';
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
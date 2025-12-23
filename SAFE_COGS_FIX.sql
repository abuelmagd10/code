-- تصحيح COGS بحذف وإعادة إنشاء القيود الخاطئة

-- 1. تحديث أسعار التكلفة المفقودة أولاً
UPDATE products p
SET cost_price = (
  SELECT bi.unit_price 
  FROM bill_items bi
  JOIN bills b ON bi.bill_id = b.id
  WHERE bi.product_id = p.id 
    AND b.status != 'draft'
  ORDER BY b.bill_date DESC
  LIMIT 1
)
WHERE (cost_price IS NULL OR cost_price = 0)
  AND EXISTS (
    SELECT 1 FROM bill_items bi
    JOIN bills b ON bi.bill_id = b.id
    WHERE bi.product_id = p.id AND b.status != 'draft'
  );

-- 2. دالة إعادة إنشاء قيود COGS الصحيحة
CREATE OR REPLACE FUNCTION recreate_correct_cogs()
RETURNS TEXT AS $$
DECLARE
  v_result TEXT := '';
  v_count INTEGER := 0;
  rec RECORD;
  v_correct_cogs NUMERIC;
  v_current_cogs NUMERIC;
  v_cogs_account_id UUID;
  v_inventory_account_id UUID;
BEGIN
  v_result := 'بدء إعادة إنشاء قيود COGS الصحيحة...' || E'\n\n';
  
  -- معالجة كل فاتورة
  FOR rec IN 
    SELECT 
      i.id as invoice_id,
      i.invoice_number,
      i.company_id,
      i.invoice_date,
      c.name as company_name
    FROM invoices i
    JOIN companies c ON i.company_id = c.id
    WHERE i.status != 'draft'
    ORDER BY c.name, i.invoice_number
  LOOP
    
    -- حساب COGS الصحيحة
    SELECT COALESCE(SUM(ii.quantity * COALESCE(p.cost_price, 0)), 0)
    INTO v_correct_cogs
    FROM invoice_items ii
    JOIN products p ON ii.product_id = p.id
    WHERE ii.invoice_id = rec.invoice_id;
    
    -- الحصول على COGS الحالية
    SELECT COALESCE(SUM(jel.debit_amount), 0)
    INTO v_current_cogs
    FROM journal_entries je
    JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
    WHERE je.reference_id = rec.invoice_id 
      AND je.reference_type = 'invoice_cogs'
      AND jel.debit_amount > 0;
    
    -- إذا كانت مختلفة وأكبر من صفر
    IF ABS(v_correct_cogs - v_current_cogs) > 0.01 AND v_correct_cogs > 0 THEN
      
      -- الحصول على الحسابات
      SELECT coa.id INTO v_cogs_account_id 
      FROM chart_of_accounts coa
      WHERE coa.company_id = rec.company_id AND coa.sub_type = 'cogs'
      LIMIT 1;
      
      SELECT coa.id INTO v_inventory_account_id 
      FROM chart_of_accounts coa
      WHERE coa.company_id = rec.company_id AND coa.sub_type = 'inventory'
      LIMIT 1;
      
      IF v_cogs_account_id IS NOT NULL AND v_inventory_account_id IS NOT NULL THEN
        
        -- حذف القيد القديم
        DELETE FROM journal_entry_lines 
        WHERE journal_entry_id IN (
          SELECT je.id FROM journal_entries je 
          WHERE je.reference_id = rec.invoice_id 
            AND je.reference_type = 'invoice_cogs'
        );
        
        DELETE FROM journal_entries 
        WHERE reference_id = rec.invoice_id 
          AND reference_type = 'invoice_cogs';
        
        -- إنشاء قيد جديد صحيح
        INSERT INTO journal_entries (
          company_id,
          reference_type,
          reference_id,
          entry_date,
          description
        ) VALUES (
          rec.company_id,
          'invoice_cogs',
          rec.invoice_id,
          rec.invoice_date,
          'تكلفة البضاعة المباعة - ' || rec.invoice_number
        );
        
        -- إضافة سطور القيد الصحيحة
        INSERT INTO journal_entry_lines (
          journal_entry_id,
          account_id,
          debit_amount,
          credit_amount,
          description
        ) VALUES 
        (
          (SELECT id FROM journal_entries WHERE reference_id = rec.invoice_id AND reference_type = 'invoice_cogs'),
          v_cogs_account_id,
          v_correct_cogs,
          0,
          'تكلفة البضاعة المباعة'
        ),
        (
          (SELECT id FROM journal_entries WHERE reference_id = rec.invoice_id AND reference_type = 'invoice_cogs'),
          v_inventory_account_id,
          0,
          v_correct_cogs,
          'خصم من المخزون'
        );
        
        v_count := v_count + 1;
        v_result := v_result || '✅ ' || rec.company_name || ' - فاتورة ' || rec.invoice_number || 
                    ': ' || v_current_cogs || ' → ' || v_correct_cogs || E'\n';
      END IF;
    END IF;
    
  END LOOP;
  
  v_result := v_result || E'\n🎉 تم إعادة إنشاء ' || v_count || ' قيد COGS صحيح';
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 3. تشغيل التصحيح
SELECT recreate_correct_cogs();

-- 4. تقرير نهائي مفصل
SELECT 
  c.name as company_name,
  i.invoice_number,
  i.total_amount as sales,
  -- COGS الحالية
  COALESCE((
    SELECT SUM(jel.debit_amount)
    FROM journal_entries je
    JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
    WHERE je.reference_id = i.id 
      AND je.reference_type = 'invoice_cogs'
      AND jel.debit_amount > 0
  ), 0) as cogs,
  -- الربح الإجمالي
  i.total_amount - COALESCE((
    SELECT SUM(jel.debit_amount)
    FROM journal_entries je
    JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
    WHERE je.reference_id = i.id 
      AND je.reference_type = 'invoice_cogs'
      AND jel.debit_amount > 0
  ), 0) as gross_profit,
  -- نسبة الربح
  CASE 
    WHEN i.total_amount > 0 THEN 
      ROUND(((i.total_amount - COALESCE((
        SELECT SUM(jel.debit_amount)
        FROM journal_entries je
        JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
        WHERE je.reference_id = i.id 
          AND je.reference_type = 'invoice_cogs'
          AND jel.debit_amount > 0
      ), 0)) / i.total_amount * 100), 2)
    ELSE 0 
  END as profit_margin_percent
FROM companies c
JOIN invoices i ON c.id = i.company_id
WHERE i.status != 'draft'
ORDER BY c.name, i.invoice_number;
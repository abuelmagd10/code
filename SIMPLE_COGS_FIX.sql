-- تصحيح بيانات COGS بطريقة مباشرة بدون تعطيل triggers

-- 1. دالة تصحيح آمنة
CREATE OR REPLACE FUNCTION simple_fix_cogs()
RETURNS TEXT AS $$
DECLARE
  v_result TEXT := '';
  v_count INTEGER := 0;
  rec RECORD;
  v_correct_cogs NUMERIC;
  v_current_cogs NUMERIC;
BEGIN
  v_result := 'بدء تصحيح COGS...' || E'\n';
  
  -- تصحيح كل قيد COGS خاطئ
  FOR rec IN 
    SELECT 
      je.id as journal_id,
      je.reference_id as invoice_id,
      i.invoice_number,
      c.name as company_name
    FROM journal_entries je
    JOIN invoices i ON je.reference_id = i.id
    JOIN companies c ON i.company_id = c.id
    WHERE je.reference_type = 'invoice_cogs'
    ORDER BY c.name, i.invoice_number
  LOOP
    
    -- حساب COGS الصحيحة
    SELECT COALESCE(SUM(ii.quantity * COALESCE(p.cost_price, 0)), 0)
    INTO v_correct_cogs
    FROM invoice_items ii
    JOIN products p ON ii.product_id = p.id
    WHERE ii.invoice_id = rec.invoice_id;
    
    -- الحصول على COGS الحالية
    SELECT COALESCE(SUM(debit_amount), 0)
    INTO v_current_cogs
    FROM journal_entry_lines
    WHERE journal_entry_id = rec.journal_id
      AND debit_amount > 0;
    
    -- إذا كانت مختلفة، قم بالتصحيح
    IF ABS(v_correct_cogs - v_current_cogs) > 0.01 THEN
      
      -- تحديث المدين (COGS)
      UPDATE journal_entry_lines 
      SET debit_amount = v_correct_cogs,
          credit_amount = 0
      WHERE journal_entry_id = rec.journal_id
        AND debit_amount > 0;
      
      -- تحديث الدائن (Inventory)
      UPDATE journal_entry_lines 
      SET credit_amount = v_correct_cogs,
          debit_amount = 0
      WHERE journal_entry_id = rec.journal_id
        AND credit_amount > 0;
      
      v_count := v_count + 1;
      v_result := v_result || '✅ ' || rec.company_name || ' - فاتورة ' || rec.invoice_number || 
                  ': ' || v_current_cogs || ' → ' || v_correct_cogs || E'\n';
    END IF;
    
  END LOOP;
  
  v_result := v_result || E'\n🎉 تم تصحيح ' || v_count || ' قيد محاسبي';
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 2. تحديث أسعار التكلفة المفقودة
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

-- 3. تشغيل التصحيح
SELECT simple_fix_cogs();

-- 4. تقرير نهائي
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
  ), 0) as current_cogs,
  -- COGS الصحيحة
  COALESCE((
    SELECT SUM(ii.quantity * COALESCE(p.cost_price, 0))
    FROM invoice_items ii
    JOIN products p ON ii.product_id = p.id
    WHERE ii.invoice_id = i.id
  ), 0) as correct_cogs,
  -- الربح
  i.total_amount - COALESCE((
    SELECT SUM(jel.debit_amount)
    FROM journal_entries je
    JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
    WHERE je.reference_id = i.id 
      AND je.reference_type = 'invoice_cogs'
      AND jel.debit_amount > 0
  ), 0) as profit
FROM companies c
JOIN invoices i ON c.id = i.company_id
WHERE i.status != 'draft'
ORDER BY c.name, i.invoice_number;
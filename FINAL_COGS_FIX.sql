-- الحل النهائي: تصحيح COGS بحذف وإعادة إنشاء القيود

-- 1. تحديث أسعار التكلفة أولاً
UPDATE products p
SET cost_price = COALESCE((
  SELECT bi.unit_price 
  FROM bill_items bi
  JOIN bills b ON bi.bill_id = b.id
  WHERE bi.product_id = p.id 
    AND b.status != 'draft'
  ORDER BY b.bill_date DESC
  LIMIT 1
), p.cost_price, 0);

-- 2. حذف جميع قيود COGS الخاطئة
DELETE FROM journal_entry_lines 
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries 
  WHERE reference_type = 'invoice_cogs'
);

DELETE FROM journal_entries 
WHERE reference_type = 'invoice_cogs';

-- 3. إعادة إنشاء قيود COGS صحيحة
DO $$
DECLARE
  invoice_rec RECORD;
  v_cogs NUMERIC;
  v_cogs_account_id UUID;
  v_inventory_account_id UUID;
  v_journal_id UUID;
BEGIN
  FOR invoice_rec IN 
    SELECT i.id, i.company_id, i.invoice_number, i.invoice_date
    FROM invoices i
    WHERE i.status != 'draft'
    ORDER BY i.company_id, i.invoice_number
  LOOP
    
    -- حساب COGS الصحيحة
    SELECT COALESCE(SUM(ii.quantity * COALESCE(p.cost_price, 0)), 0)
    INTO v_cogs
    FROM invoice_items ii
    JOIN products p ON ii.product_id = p.id
    WHERE ii.invoice_id = invoice_rec.id;
    
    -- فقط إذا كان هناك تكلفة
    IF v_cogs > 0 THEN
      
      -- الحصول على الحسابات
      SELECT id INTO v_cogs_account_id 
      FROM chart_of_accounts 
      WHERE company_id = invoice_rec.company_id 
        AND sub_type = 'cogs'
      LIMIT 1;
      
      SELECT id INTO v_inventory_account_id 
      FROM chart_of_accounts 
      WHERE company_id = invoice_rec.company_id 
        AND sub_type = 'inventory'
      LIMIT 1;
      
      -- إنشاء الحسابات إذا لم تكن موجودة
      IF v_cogs_account_id IS NULL THEN
        INSERT INTO chart_of_accounts (
          company_id, account_code, account_name, account_type, sub_type, is_active
        ) VALUES (
          invoice_rec.company_id, 'COGS001', 'تكلفة البضاعة المباعة', 'expense', 'cogs', true
        ) RETURNING id INTO v_cogs_account_id;
      END IF;
      
      IF v_inventory_account_id IS NULL THEN
        INSERT INTO chart_of_accounts (
          company_id, account_code, account_name, account_type, sub_type, is_active
        ) VALUES (
          invoice_rec.company_id, 'INV001', 'المخزون', 'asset', 'inventory', true
        ) RETURNING id INTO v_inventory_account_id;
      END IF;
      
      -- إنشاء القيد المحاسبي
      INSERT INTO journal_entries (
        company_id,
        reference_type,
        reference_id,
        entry_date,
        description
      ) VALUES (
        invoice_rec.company_id,
        'invoice_cogs',
        invoice_rec.id,
        invoice_rec.invoice_date,
        'تكلفة البضاعة المباعة - ' || invoice_rec.invoice_number
      ) RETURNING id INTO v_journal_id;
      
      -- سطر المدين (COGS)
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        description
      ) VALUES (
        v_journal_id,
        v_cogs_account_id,
        v_cogs,
        0,
        'تكلفة البضاعة المباعة'
      );
      
      -- سطر الدائن (Inventory)
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        description
      ) VALUES (
        v_journal_id,
        v_inventory_account_id,
        0,
        v_cogs,
        'خصم من المخزون'
      );
      
    END IF;
    
  END LOOP;
END $$;

-- 4. تقرير النتائج النهائية
SELECT 
  '🎉 تم إعادة إنشاء قيود COGS بنجاح!' as status,
  COUNT(*) as total_cogs_entries
FROM journal_entries 
WHERE reference_type = 'invoice_cogs';

-- 5. تقرير مفصل لكل شركة
SELECT 
  c.name as company_name,
  COUNT(DISTINCT i.id) as total_invoices,
  SUM(i.total_amount) as total_sales,
  SUM(COALESCE((
    SELECT SUM(jel.debit_amount)
    FROM journal_entries je
    JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
    WHERE je.reference_id = i.id 
      AND je.reference_type = 'invoice_cogs'
      AND jel.debit_amount > 0
  ), 0)) as total_cogs,
  SUM(i.total_amount) - SUM(COALESCE((
    SELECT SUM(jel.debit_amount)
    FROM journal_entries je
    JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
    WHERE je.reference_id = i.id 
      AND je.reference_type = 'invoice_cogs'
      AND jel.debit_amount > 0
  ), 0)) as gross_profit
FROM companies c
JOIN invoices i ON c.id = i.company_id
WHERE i.status != 'draft'
GROUP BY c.id, c.name
ORDER BY c.name;

-- 6. تفاصيل كل فاتورة
SELECT 
  c.name as company_name,
  i.invoice_number,
  i.total_amount as sales,
  COALESCE((
    SELECT SUM(jel.debit_amount)
    FROM journal_entries je
    JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
    WHERE je.reference_id = i.id 
      AND je.reference_type = 'invoice_cogs'
      AND jel.debit_amount > 0
  ), 0) as cogs,
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
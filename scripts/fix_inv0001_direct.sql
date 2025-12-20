-- تصحيح مباشر للفاتورة INV-0001 في شركة foodcana
-- تطبيق النمط المحاسبي الجديد

-- 1. تحديث الفاتورة مباشرة
UPDATE invoices 
SET 
  subtotal = 0,
  total_amount = 0,
  returned_amount = 20000,
  return_status = 'full'
WHERE 
  company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
  AND invoice_number = 'INV-0001';

-- 2. حذف قيود sales_return القديمة
DELETE FROM journal_entry_lines 
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries 
  WHERE company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
    AND reference_type = 'sales_return'
    AND reference_id = (
      SELECT id FROM invoices 
      WHERE company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
        AND invoice_number = 'INV-0001'
    )
);

DELETE FROM journal_entries 
WHERE company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
  AND reference_type = 'sales_return'
  AND reference_id = (
    SELECT id FROM invoices 
    WHERE company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
      AND invoice_number = 'INV-0001'
  );

-- 3. تحديث القيد الأصلي (AR = 0, Revenue = 0)
UPDATE journal_entry_lines 
SET 
  debit_amount = 0,
  credit_amount = 0
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries 
  WHERE company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
    AND reference_type = 'invoice'
    AND reference_id = (
      SELECT id FROM invoices 
      WHERE company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
        AND invoice_number = 'INV-0001'
    )
);

-- التحقق من النتيجة
SELECT 
  invoice_number,
  subtotal,
  total_amount,
  returned_amount,
  return_status
FROM invoices 
WHERE company_id = '3a663f6b-0689-4952-93c1-6d958c737089'
  AND invoice_number = 'INV-0001';
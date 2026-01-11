-- Trigger: تعيين branch_id تلقائياً للفواتير من أوامر البيع أو المستخدم
CREATE OR REPLACE FUNCTION auto_set_invoice_branch()
RETURNS TRIGGER AS $$
BEGIN
  -- إذا لم يكن branch_id موجود
  IF NEW.branch_id IS NULL THEN
    -- محاولة 1: من أمر البيع المرتبط
    IF NEW.sales_order_id IS NOT NULL THEN
      SELECT branch_id INTO NEW.branch_id
      FROM sales_orders
      WHERE id = NEW.sales_order_id;
    END IF;
    
    -- محاولة 2: من المستخدم المنشئ
    IF NEW.branch_id IS NULL AND NEW.created_by_user_id IS NOT NULL THEN
      SELECT branch_id INTO NEW.branch_id
      FROM company_members
      WHERE user_id = NEW.created_by_user_id 
        AND company_id = NEW.company_id
      LIMIT 1;
    END IF;
    
    -- محاولة 3: الفرع الرئيسي للشركة
    IF NEW.branch_id IS NULL THEN
      SELECT id INTO NEW.branch_id
      FROM branches
      WHERE company_id = NEW.company_id 
        AND is_main = true
      LIMIT 1;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- إنشاء trigger
DROP TRIGGER IF EXISTS trg_auto_set_invoice_branch ON invoices;
CREATE TRIGGER trg_auto_set_invoice_branch
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_invoice_branch();

-- اختبار
SELECT 'Trigger created successfully' as status;

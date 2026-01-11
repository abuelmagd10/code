-- ========================================
-- Trigger: ضمان branch_id تلقائياً لأوامر البيع
-- ========================================
CREATE OR REPLACE FUNCTION auto_set_sales_order_branch()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.branch_id IS NULL THEN
    -- من المستخدم المنشئ
    SELECT branch_id INTO NEW.branch_id
    FROM company_members
    WHERE user_id = NEW.created_by_user_id 
      AND company_id = NEW.company_id
    LIMIT 1;
    
    -- الفرع الرئيسي كخيار احتياطي
    IF NEW.branch_id IS NULL THEN
      SELECT id INTO NEW.branch_id
      FROM branches
      WHERE company_id = NEW.company_id AND is_main = true
      LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_branch_sales_orders ON sales_orders;
CREATE TRIGGER trg_auto_branch_sales_orders
  BEFORE INSERT ON sales_orders
  FOR EACH ROW EXECUTE FUNCTION auto_set_sales_order_branch();

-- ========================================
-- Trigger: ضمان branch_id تلقائياً للفواتير
-- ========================================
CREATE OR REPLACE FUNCTION auto_set_invoice_branch()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.branch_id IS NULL THEN
    -- من أمر البيع المرتبط
    IF NEW.sales_order_id IS NOT NULL THEN
      SELECT branch_id INTO NEW.branch_id
      FROM sales_orders WHERE id = NEW.sales_order_id;
    END IF;
    
    -- من المستخدم المنشئ
    IF NEW.branch_id IS NULL AND NEW.created_by_user_id IS NOT NULL THEN
      SELECT branch_id INTO NEW.branch_id
      FROM company_members
      WHERE user_id = NEW.created_by_user_id 
        AND company_id = NEW.company_id
      LIMIT 1;
    END IF;
    
    -- الفرع الرئيسي كخيار احتياطي
    IF NEW.branch_id IS NULL THEN
      SELECT id INTO NEW.branch_id
      FROM branches
      WHERE company_id = NEW.company_id AND is_main = true
      LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_branch_invoices ON invoices;
CREATE TRIGGER trg_auto_branch_invoices
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION auto_set_invoice_branch();

-- التحقق
SELECT 'Triggers created successfully ✓' as status;

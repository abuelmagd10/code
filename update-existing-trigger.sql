-- تحديث trigger الموجود: trg_set_default_branch_invoices
-- لضمان تعيين branch_id دائماً

CREATE OR REPLACE FUNCTION set_default_branch_invoices()
RETURNS TRIGGER AS $$
BEGIN
  -- تعيين branch_id إذا كان NULL
  IF NEW.branch_id IS NULL THEN
    -- من أمر البيع
    IF NEW.sales_order_id IS NOT NULL THEN
      SELECT branch_id INTO NEW.branch_id
      FROM sales_orders
      WHERE id = NEW.sales_order_id;
    END IF;
    
    -- من المستخدم
    IF NEW.branch_id IS NULL AND NEW.created_by_user_id IS NOT NULL THEN
      SELECT branch_id INTO NEW.branch_id
      FROM company_members
      WHERE user_id = NEW.created_by_user_id 
        AND company_id = NEW.company_id
      LIMIT 1;
    END IF;
    
    -- الفرع الرئيسي
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

-- ============================================
-- تطبيق قيود الحوكمة الدائمة
-- ERB VitaSlims - Enforce Governance Constraints
-- ============================================
-- هذا السكريبت يمنع انتهاكات الحوكمة مستقبلاً
-- ============================================

-- ============================================
-- 1. إضافة قيود NOT NULL
-- ============================================

-- أوامر البيع
ALTER TABLE sales_orders 
  ALTER COLUMN company_id SET NOT NULL,
  ALTER COLUMN branch_id SET NOT NULL,
  ALTER COLUMN warehouse_id SET NOT NULL,
  ALTER COLUMN cost_center_id SET NOT NULL;

-- الفواتير
ALTER TABLE invoices 
  ALTER COLUMN company_id SET NOT NULL,
  ALTER COLUMN branch_id SET NOT NULL,
  ALTER COLUMN warehouse_id SET NOT NULL,
  ALTER COLUMN cost_center_id SET NOT NULL;

-- حركات المخزون
ALTER TABLE inventory_transactions 
  ALTER COLUMN company_id SET NOT NULL,
  ALTER COLUMN branch_id SET NOT NULL,
  ALTER COLUMN warehouse_id SET NOT NULL,
  ALTER COLUMN cost_center_id SET NOT NULL;

-- ============================================
-- 2. إنشاء دالة التحقق من الحوكمة
-- ============================================

CREATE OR REPLACE FUNCTION check_governance_scope()
RETURNS TRIGGER AS $$
BEGIN
  -- التحقق من أن الفرع ينتمي للشركة
  IF NOT EXISTS (
    SELECT 1 FROM branches 
    WHERE id = NEW.branch_id 
    AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Branch does not belong to company';
  END IF;

  -- التحقق من أن المستودع ينتمي للشركة
  IF NOT EXISTS (
    SELECT 1 FROM warehouses 
    WHERE id = NEW.warehouse_id 
    AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Warehouse does not belong to company';
  END IF;

  -- التحقق من أن مركز التكلفة ينتمي للشركة
  IF NOT EXISTS (
    SELECT 1 FROM cost_centers 
    WHERE id = NEW.cost_center_id 
    AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Cost center does not belong to company';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. تطبيق Triggers على الجداول
-- ============================================

-- أوامر البيع
DROP TRIGGER IF EXISTS enforce_governance_sales_orders ON sales_orders;
CREATE TRIGGER enforce_governance_sales_orders
  BEFORE INSERT OR UPDATE ON sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION check_governance_scope();

-- الفواتير
DROP TRIGGER IF EXISTS enforce_governance_invoices ON invoices;
CREATE TRIGGER enforce_governance_invoices
  BEFORE INSERT OR UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION check_governance_scope();

-- حركات المخزون
DROP TRIGGER IF EXISTS enforce_governance_inventory ON inventory_transactions;
CREATE TRIGGER enforce_governance_inventory
  BEFORE INSERT OR UPDATE ON inventory_transactions
  FOR EACH ROW
  EXECUTE FUNCTION check_governance_scope();

-- ============================================
-- 4. إنشاء Row Level Security (RLS)
-- ============================================

-- تفعيل RLS على الجداول
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

-- سياسة للمستخدمين العاديين (يرون فقط بيانات شركتهم)
CREATE POLICY sales_orders_company_isolation ON sales_orders
  FOR ALL
  USING (company_id = current_setting('app.current_company_id', true)::uuid);

CREATE POLICY invoices_company_isolation ON invoices
  FOR ALL
  USING (company_id = current_setting('app.current_company_id', true)::uuid);

CREATE POLICY inventory_company_isolation ON inventory_transactions
  FOR ALL
  USING (company_id = current_setting('app.current_company_id', true)::uuid);

-- ============================================
-- 5. إنشاء فهارس للأداء
-- ============================================

CREATE INDEX IF NOT EXISTS idx_sales_orders_governance 
  ON sales_orders(company_id, branch_id, warehouse_id, cost_center_id);

CREATE INDEX IF NOT EXISTS idx_invoices_governance 
  ON invoices(company_id, branch_id, warehouse_id, cost_center_id);

CREATE INDEX IF NOT EXISTS idx_inventory_governance 
  ON inventory_transactions(company_id, branch_id, warehouse_id, cost_center_id);

-- ============================================
-- 6. التحقق من التطبيق
-- ============================================

-- محاولة إدخال بيانات غير صحيحة (يجب أن تفشل)
-- DO $$
-- BEGIN
--   INSERT INTO sales_orders (company_id, branch_id, warehouse_id, cost_center_id)
--   VALUES (gen_random_uuid(), NULL, NULL, NULL);
-- EXCEPTION WHEN OTHERS THEN
--   RAISE NOTICE 'Test passed: NULL values rejected';
-- END $$;

SELECT 'Governance constraints applied successfully' as status;

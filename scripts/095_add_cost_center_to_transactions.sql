-- =====================================================
-- 📌 إضافة مركز التكلفة للجداول المحاسبية والمخزنية
-- Add cost_center_id to accounting and inventory tables
-- =====================================================
-- 
-- النمط المحاسبي الصارم (MANDATORY SPECIFICATION):
-- كل قيد يحتوي: reference_type, reference_id, branch_id, cost_center_id
-- كل حركة مخزون تحتوي: source_document, document_id, branch_id, cost_center_id
-- =====================================================

-- 1️⃣ إضافة cost_center_id لجدول الفواتير
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_cost_center_id ON invoices(cost_center_id);

-- 2️⃣ إضافة cost_center_id لجدول فواتير المشتريات
ALTER TABLE bills ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bills_cost_center_id ON bills(cost_center_id);

-- 3️⃣ إضافة cost_center_id لجدول القيود المحاسبية
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_journal_entries_cost_center_id ON journal_entries(cost_center_id);

-- 4️⃣ إضافة cost_center_id لجدول حركات المخزون
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_cost_center_id ON inventory_transactions(cost_center_id);

-- 5️⃣ إضافة cost_center_id لجدول المدفوعات
ALTER TABLE payments ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payments_cost_center_id ON payments(cost_center_id);

-- 6️⃣ إضافة cost_center_id لجدول أوامر البيع
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_orders_cost_center_id ON sales_orders(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_branch_id ON sales_orders(branch_id);

-- 7️⃣ إضافة cost_center_id لجدول أوامر الشراء
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_cost_center_id ON purchase_orders(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_branch_id ON purchase_orders(branch_id);

-- 8️⃣ إضافة cost_center_id لجدول العروض
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_estimates_cost_center_id ON estimates(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_estimates_branch_id ON estimates(branch_id);

-- =====================================================
-- 📌 دالة للتحقق من صحة الفرع ومركز التكلفة
-- Function to validate branch and cost center belong to same company
-- =====================================================

CREATE OR REPLACE FUNCTION validate_branch_cost_center()
RETURNS TRIGGER AS $$
DECLARE
  v_branch_company_id UUID;
  v_cost_center_company_id UUID;
  v_cost_center_branch_id UUID;
BEGIN
  -- إذا لم يتم تحديد فرع أو مركز تكلفة، السماح بالعملية
  IF NEW.branch_id IS NULL AND NEW.cost_center_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- التحقق من أن الفرع ينتمي لنفس الشركة
  IF NEW.branch_id IS NOT NULL THEN
    SELECT company_id INTO v_branch_company_id FROM branches WHERE id = NEW.branch_id;
    IF v_branch_company_id IS NULL THEN
      RAISE EXCEPTION 'الفرع غير موجود';
    END IF;
    IF v_branch_company_id != NEW.company_id THEN
      RAISE EXCEPTION 'الفرع لا ينتمي لهذه الشركة';
    END IF;
  END IF;

  -- التحقق من أن مركز التكلفة ينتمي لنفس الشركة والفرع
  IF NEW.cost_center_id IS NOT NULL THEN
    SELECT company_id, branch_id INTO v_cost_center_company_id, v_cost_center_branch_id 
    FROM cost_centers WHERE id = NEW.cost_center_id;
    
    IF v_cost_center_company_id IS NULL THEN
      RAISE EXCEPTION 'مركز التكلفة غير موجود';
    END IF;
    IF v_cost_center_company_id != NEW.company_id THEN
      RAISE EXCEPTION 'مركز التكلفة لا ينتمي لهذه الشركة';
    END IF;
    -- التحقق من أن مركز التكلفة ينتمي للفرع المحدد (إذا كان الفرع محدداً)
    IF NEW.branch_id IS NOT NULL AND v_cost_center_branch_id IS NOT NULL 
       AND v_cost_center_branch_id != NEW.branch_id THEN
      RAISE EXCEPTION 'مركز التكلفة لا ينتمي للفرع المحدد';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 📌 تطبيق الـ Triggers على الجداول
-- =====================================================

-- Invoices
DROP TRIGGER IF EXISTS trg_validate_invoice_branch_cost_center ON invoices;
CREATE TRIGGER trg_validate_invoice_branch_cost_center
BEFORE INSERT OR UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION validate_branch_cost_center();

-- Bills
DROP TRIGGER IF EXISTS trg_validate_bill_branch_cost_center ON bills;
CREATE TRIGGER trg_validate_bill_branch_cost_center
BEFORE INSERT OR UPDATE ON bills
FOR EACH ROW EXECUTE FUNCTION validate_branch_cost_center();

-- Journal Entries
DROP TRIGGER IF EXISTS trg_validate_journal_branch_cost_center ON journal_entries;
CREATE TRIGGER trg_validate_journal_branch_cost_center
BEFORE INSERT OR UPDATE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION validate_branch_cost_center();

-- Inventory Transactions
DROP TRIGGER IF EXISTS trg_validate_inventory_branch_cost_center ON inventory_transactions;
CREATE TRIGGER trg_validate_inventory_branch_cost_center
BEFORE INSERT OR UPDATE ON inventory_transactions
FOR EACH ROW EXECUTE FUNCTION validate_branch_cost_center();

-- Payments
DROP TRIGGER IF EXISTS trg_validate_payment_branch_cost_center ON payments;
CREATE TRIGGER trg_validate_payment_branch_cost_center
BEFORE INSERT OR UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION validate_branch_cost_center();

-- =====================================================
-- 📌 التحقق من التثبيت
-- =====================================================
SELECT 'cost_center_id columns added successfully' AS status;


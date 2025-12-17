-- =====================================================
-- 📌 نظام الفروع ومراكز التكلفة - MANDATORY SPECIFICATION
-- Branches and Cost Centers System
-- =====================================================
--
-- آلية العمل:
-- 1️⃣ كل سجل مرتبط بـ: Company → Branch → Cost Center
-- 2️⃣ كل مستخدم مرتبط بفرع واحد ومركز تكلفة واحد فقط
-- 3️⃣ يمنع أي تداخل بين الشركات أو الفروع أو مستخدميها
-- 4️⃣ كل العمليات المحاسبية والمخزنية مرتبطة بالفرع ومركز التكلفة
-- =====================================================

-- =====================================
-- 1️⃣ جدول الفروع (Branches)
-- =====================================
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  address TEXT,
  city TEXT,
  phone TEXT,
  email TEXT,
  manager_name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_main BOOLEAN DEFAULT FALSE, -- الفرع الرئيسي
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, code)
);

-- فهارس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_branches_company_id ON branches(company_id);
CREATE INDEX IF NOT EXISTS idx_branches_is_active ON branches(is_active);
CREATE INDEX IF NOT EXISTS idx_branches_is_main ON branches(is_main);

-- =====================================
-- 2️⃣ جدول مراكز التكلفة (Cost Centers)
-- =====================================
CREATE TABLE IF NOT EXISTS cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, code)
);

-- فهارس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_cost_centers_company_id ON cost_centers(company_id);
CREATE INDEX IF NOT EXISTS idx_cost_centers_branch_id ON cost_centers(branch_id);
CREATE INDEX IF NOT EXISTS idx_cost_centers_is_active ON cost_centers(is_active);

-- =====================================
-- 3️⃣ ربط المستخدم بالفرع ومركز التكلفة
-- =====================================
CREATE TABLE IF NOT EXISTS user_branch_cost_center (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  is_default BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, company_id) -- مستخدم واحد لكل شركة
);

-- فهارس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_user_branch_cc_user_id ON user_branch_cost_center(user_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_cc_company_id ON user_branch_cost_center(company_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_cc_branch_id ON user_branch_cost_center(branch_id);

-- =====================================
-- 4️⃣ إضافة branch_id للجداول الموجودة
-- =====================================

-- الفواتير
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_branch_id ON invoices(branch_id);

-- فواتير المشتريات
ALTER TABLE bills ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bills_branch_id ON bills(branch_id);

-- القيود المحاسبية
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_journal_entries_branch_id ON journal_entries(branch_id);

-- حركات المخزون
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_branch_id ON inventory_transactions(branch_id);

-- المدفوعات
ALTER TABLE payments ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payments_branch_id ON payments(branch_id);

-- مرتجعات المبيعات
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_returns_branch_id ON sales_returns(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_cost_center_id ON sales_returns(cost_center_id);

-- مرتجعات المشتريات
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_returns_branch_id ON purchase_returns(branch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_cost_center_id ON purchase_returns(cost_center_id);

-- أرصدة العملاء الدائنة
ALTER TABLE customer_credits ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE customer_credits ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customer_credits_branch_id ON customer_credits(branch_id);
CREATE INDEX IF NOT EXISTS idx_customer_credits_cost_center_id ON customer_credits(cost_center_id);

-- أرصدة الموردين المدينة
ALTER TABLE supplier_debit_credits ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE supplier_debit_credits ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_debit_credits_branch_id ON supplier_debit_credits(branch_id);
CREATE INDEX IF NOT EXISTS idx_supplier_debit_credits_cost_center_id ON supplier_debit_credits(cost_center_id);

-- =====================================
CREATE OR REPLACE FUNCTION create_default_branch_for_company()
RETURNS TRIGGER AS $$
BEGIN
  -- إنشاء فرع رئيسي افتراضي لكل شركة جديدة
  INSERT INTO branches (company_id, name, code, is_main, is_active)
  VALUES (NEW.id, 'الفرع الرئيسي', 'MAIN', TRUE, TRUE);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger لإنشاء فرع افتراضي عند إنشاء شركة جديدة
DROP TRIGGER IF EXISTS trg_create_default_branch ON companies;
CREATE TRIGGER trg_create_default_branch
  AFTER INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION create_default_branch_for_company();

-- =====================================
-- 6️⃣ دالة إنشاء فروع للشركات الموجودة بدون فروع
-- =====================================
CREATE OR REPLACE FUNCTION create_missing_default_branches()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  INSERT INTO branches (company_id, name, code, is_main, is_active)
  SELECT c.id, 'الفرع الرئيسي', 'MAIN', TRUE, TRUE
  FROM companies c
  WHERE NOT EXISTS (
    SELECT 1 FROM branches b WHERE b.company_id = c.id
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- تنفيذ الدالة لإنشاء الفروع المفقودة
SELECT create_missing_default_branches();

-- =====================================
-- 7️⃣ RLS Policies للفروع ومراكز التكلفة
-- =====================================

-- تمكين RLS
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_branch_cost_center ENABLE ROW LEVEL SECURITY;

-- سياسات القراءة للفروع
DROP POLICY IF EXISTS branches_select_policy ON branches;
CREATE POLICY branches_select_policy ON branches FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = branches.company_id
    AND cm.user_id = auth.uid()
  ));

-- سياسات الإدراج للفروع (owner و admin فقط)
DROP POLICY IF EXISTS branches_insert_policy ON branches;
CREATE POLICY branches_insert_policy ON branches FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = branches.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner', 'admin')
  ));

-- سياسات التحديث للفروع
DROP POLICY IF EXISTS branches_update_policy ON branches;
CREATE POLICY branches_update_policy ON branches FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = branches.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner', 'admin')
  ));

-- سياسات الحذف للفروع (owner فقط)
DROP POLICY IF EXISTS branches_delete_policy ON branches;
CREATE POLICY branches_delete_policy ON branches FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = branches.company_id
    AND cm.user_id = auth.uid()
    AND cm.role = 'owner'
  ) AND NOT is_main); -- منع حذف الفرع الرئيسي

-- سياسات مراكز التكلفة (مشابهة للفروع)
DROP POLICY IF EXISTS cost_centers_select_policy ON cost_centers;
CREATE POLICY cost_centers_select_policy ON cost_centers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = cost_centers.company_id
    AND cm.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS cost_centers_insert_policy ON cost_centers;
CREATE POLICY cost_centers_insert_policy ON cost_centers FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = cost_centers.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner', 'admin')
  ));

DROP POLICY IF EXISTS cost_centers_update_policy ON cost_centers;
CREATE POLICY cost_centers_update_policy ON cost_centers FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = cost_centers.company_id
    AND cm.user_id = auth.uid()
    AND cm.role IN ('owner', 'admin')
  ));

DROP POLICY IF EXISTS cost_centers_delete_policy ON cost_centers;
CREATE POLICY cost_centers_delete_policy ON cost_centers FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = cost_centers.company_id
    AND cm.user_id = auth.uid()
    AND cm.role = 'owner'
  ));

-- =====================================
-- ✅ تم إنشاء نظام الفروع ومراكز التكلفة بنجاح
-- =====================================

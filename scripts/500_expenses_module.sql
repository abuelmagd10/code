-- =====================================================
-- 💰 Expenses Module - نظام المصروفات الاحترافي
-- =====================================================
-- Created: 2026-01-30
-- Purpose: نظام مصروفات موحد مع دورة اعتماد كاملة (Enterprise-grade)
-- =====================================================

-- =====================================
-- 1️⃣ جدول المصروفات (Expenses)
-- =====================================
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 🏢 السياق التنظيمي (إلزامي - ERP Governance)
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  
  -- 📋 معلومات المصروف
  expense_number TEXT NOT NULL,
  expense_date DATE NOT NULL,
  description TEXT NOT NULL,
  notes TEXT,
  
  -- 💰 المبالغ
  amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
  currency_code VARCHAR(3) DEFAULT 'EGP',
  exchange_rate DECIMAL(15, 6) DEFAULT 1,
  base_currency_amount DECIMAL(15, 2), -- المبلغ بالعملة الأساسية
  
  -- 📂 التصنيف
  expense_category VARCHAR(100), -- مثل: رواتب، إيجار، كهرباء، صيانة، مواصلات، إلخ
  payment_method VARCHAR(50), -- cash, bank_transfer, check, credit_card
  
  -- 🔗 الحساب المحاسبي
  expense_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  payment_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL, -- حساب الدفع (نقدية/بنك)
  
  -- 📎 المرفقات
  attachments JSONB, -- [{filename, url, uploaded_by, uploaded_at}]
  
  -- 🔄 حالة المصروف (Expense Status)
  status VARCHAR(20) NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'paid', 'cancelled')),
  
  -- ✅ دورة الاعتماد (Approval Workflow)
  approval_status VARCHAR(20) DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  
  -- 👤 من أنشأ المصروف
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- 👤 من وافق على المصروف (Owner / General Manager)
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  
  -- ❌ في حالة الرفض
  rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- 💳 معلومات الدفع
  paid_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  payment_reference TEXT, -- رقم الشيك / رقم التحويل / إلخ
  
  -- 📊 القيد المحاسبي
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  
  -- 🔍 فهارس للأداء
  CONSTRAINT expenses_unique_number UNIQUE(company_id, expense_number)
);

-- =====================================
-- 2️⃣ الفهارس (Indexes)
-- =====================================
CREATE INDEX IF NOT EXISTS idx_expenses_company_id ON expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_branch_id ON expenses(branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_cost_center_id ON expenses(cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_warehouse_id ON expenses(warehouse_id) WHERE warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(company_id, status, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON expenses(created_by, company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(company_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(company_id, expense_category) WHERE expense_category IS NOT NULL;

-- =====================================
-- 3️⃣ Trigger لتحديث updated_at
-- =====================================
CREATE OR REPLACE FUNCTION update_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER expenses_updated_at_trigger
  BEFORE UPDATE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION update_expenses_updated_at();

-- =====================================
-- 4️⃣ دالة توليد رقم المصروف التلقائي
-- =====================================
CREATE OR REPLACE FUNCTION generate_expense_number(p_company_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_count INTEGER;
  v_number TEXT;
BEGIN
  -- عد المصروفات الموجودة
  SELECT COUNT(*) INTO v_count
  FROM expenses
  WHERE company_id = p_company_id;
  
  -- توليد الرقم
  v_number := 'EXP-' || LPAD((v_count + 1)::TEXT, 4, '0');
  
  -- التحقق من عدم التكرار
  WHILE EXISTS (SELECT 1 FROM expenses WHERE company_id = p_company_id AND expense_number = v_number) LOOP
    v_count := v_count + 1;
    v_number := 'EXP-' || LPAD((v_count + 1)::TEXT, 4, '0');
  END LOOP;
  
  RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- 5️⃣ تفعيل Realtime
-- =====================================
ALTER PUBLICATION supabase_realtime ADD TABLE expenses;

-- =====================================
-- 6️⃣ منح الصلاحيات
-- =====================================
GRANT SELECT, INSERT, UPDATE, DELETE ON expenses TO authenticated;

-- =====================================================
-- ✅ اكتمل إنشاء جدول المصروفات
-- =====================================================


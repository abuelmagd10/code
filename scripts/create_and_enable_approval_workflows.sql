-- =====================================================
-- 🔄 إنشاء جدول approval_workflows وتفعيل Realtime
-- =====================================================

-- 1️⃣ إنشاء الجدول (إذا لم يكن موجوداً)
CREATE TABLE IF NOT EXISTS approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 🏢 السياق التنظيمي (إلزامي)
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  
  -- 📋 نوع سير العمل والمورد
  workflow_type VARCHAR(50) NOT NULL, -- 'financial', 'inventory', 'refund', 'transfer', 'adjustment'
  resource_type VARCHAR(50) NOT NULL, -- 'customer_debit_note', 'vendor_credit', 'refund_request', 'stock_transfer', etc.
  resource_id UUID NOT NULL,
  
  -- 💰 المبلغ (للموافقات المالية)
  amount DECIMAL(15,2),
  currency_code VARCHAR(3) DEFAULT 'USD',
  
  -- 👤 من طلب ومن وافق
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  
  approver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  
  rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ,
  
  -- ✅ الحالة
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'executed', 'cancelled')),
  
  -- 📝 ملاحظات
  notes TEXT,
  metadata JSONB,
  
  -- 📅 التواريخ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 🔒 قيود
  CONSTRAINT approval_workflows_no_self_approval CHECK (requested_by != approver_id)
);

-- 2️⃣ إنشاء الفهارس
CREATE INDEX IF NOT EXISTS idx_approval_workflows_company_status ON approval_workflows(company_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_resource ON approval_workflows(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_approver ON approval_workflows(approver_id, status) WHERE approver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_approval_workflows_branch ON approval_workflows(branch_id, status) WHERE branch_id IS NOT NULL;

-- 3️⃣ تفعيل RLS (Row Level Security)
ALTER TABLE approval_workflows ENABLE ROW LEVEL SECURITY;

-- 4️⃣ إضافة الجدول إلى Realtime Publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'approval_workflows'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE approval_workflows;
    RAISE NOTICE '✅ Added approval_workflows to realtime';
  ELSE
    RAISE NOTICE '✅ approval_workflows already in realtime publication';
  END IF;
END $$;

-- 5️⃣ التحقق من التفعيل
SELECT 
  tablename,
  '✅ Enabled in Realtime' as status
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND schemaname = 'public'
  AND tablename = 'approval_workflows';

-- ✅ انتهى
SELECT '✅ approval_workflows table created and Realtime enabled!' as result;

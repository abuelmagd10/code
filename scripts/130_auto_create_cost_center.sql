-- =====================================================
-- 🏢 إنشاء مركز تكلفة رئيسي تلقائياً عند إنشاء فرع
-- Auto-create main cost center when branch is created
-- =====================================================
-- تاريخ: 2024-12-21
-- الغرض: ضمان وجود مركز تكلفة لكل فرع (متطلب ERP)
-- =====================================================

-- 1️⃣ دالة إنشاء مركز تكلفة رئيسي عند إنشاء فرع
CREATE OR REPLACE FUNCTION create_default_cost_center_for_branch()
RETURNS TRIGGER AS $$
BEGIN
  -- إنشاء مركز تكلفة رئيسي لكل فرع جديد
  INSERT INTO cost_centers (
    company_id, 
    branch_id, 
    cost_center_code, 
    cost_center_name, 
    is_main, 
    is_active
  )
  VALUES (
    NEW.company_id, 
    NEW.id, 
    'CC-' || UPPER(COALESCE(NEW.code, 'MAIN')), 
    'مركز التكلفة - ' || NEW.name, 
    NEW.is_main,  -- إذا كان الفرع رئيسي، مركز التكلفة رئيسي أيضاً
    TRUE
  )
  ON CONFLICT DO NOTHING;  -- تجنب التكرار
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2️⃣ Trigger لإنشاء مركز تكلفة عند إنشاء فرع
DROP TRIGGER IF EXISTS trg_create_default_cost_center ON branches;
CREATE TRIGGER trg_create_default_cost_center
  AFTER INSERT ON branches
  FOR EACH ROW
  EXECUTE FUNCTION create_default_cost_center_for_branch();

-- 3️⃣ إنشاء مراكز تكلفة للفروع الموجودة بدون مراكز
INSERT INTO cost_centers (company_id, branch_id, cost_center_code, cost_center_name, is_main, is_active)
SELECT 
  b.company_id,
  b.id,
  'CC-' || UPPER(COALESCE(b.code, 'MAIN')),
  'مركز التكلفة - ' || b.name,
  b.is_main,
  TRUE
FROM branches b
WHERE NOT EXISTS (
  SELECT 1 FROM cost_centers cc 
  WHERE cc.branch_id = b.id
)
ON CONFLICT DO NOTHING;

-- 4️⃣ تحديث المستخدمين الذين ليس لديهم مركز تكلفة
UPDATE company_members cm
SET cost_center_id = cc.id
FROM cost_centers cc
WHERE cm.cost_center_id IS NULL
  AND cm.branch_id IS NOT NULL
  AND cc.branch_id = cm.branch_id
  AND cc.is_main = true;

-- =====================================================
-- ✅ تم تفعيل إنشاء مراكز التكلفة التلقائي
-- =====================================================


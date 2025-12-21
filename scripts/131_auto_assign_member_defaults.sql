-- =====================================================
-- 👤 تعيين الفرع/المركز/المخزن الافتراضي للأعضاء الجدد
-- Auto-assign default branch/cost_center/warehouse for new members
-- =====================================================
-- تاريخ: 2024-12-21
-- الغرض: ضمان ربط كل عضو جديد بالفرع الرئيسي إذا لم يتم تحديده
-- =====================================================

-- 1️⃣ دالة تعيين القيم الافتراضية للعضو الجديد
CREATE OR REPLACE FUNCTION assign_default_member_branch()
RETURNS TRIGGER AS $$
DECLARE
  v_main_branch_id UUID;
  v_main_cost_center_id UUID;
  v_main_warehouse_id UUID;
BEGIN
  -- إذا لم يتم تحديد فرع، نعين الفرع الرئيسي
  IF NEW.branch_id IS NULL THEN
    SELECT id INTO v_main_branch_id
    FROM branches
    WHERE company_id = NEW.company_id AND is_main = true
    LIMIT 1;
    
    NEW.branch_id := v_main_branch_id;
  END IF;
  
  -- إذا لم يتم تحديد مركز تكلفة، نعين المركز الرئيسي للفرع
  IF NEW.cost_center_id IS NULL AND NEW.branch_id IS NOT NULL THEN
    SELECT id INTO v_main_cost_center_id
    FROM cost_centers
    WHERE branch_id = NEW.branch_id AND is_main = true
    LIMIT 1;
    
    -- إذا لم يوجد مركز رئيسي، نأخذ أي مركز للفرع
    IF v_main_cost_center_id IS NULL THEN
      SELECT id INTO v_main_cost_center_id
      FROM cost_centers
      WHERE branch_id = NEW.branch_id
      LIMIT 1;
    END IF;
    
    NEW.cost_center_id := v_main_cost_center_id;
  END IF;
  
  -- إذا لم يتم تحديد مخزن، نعين المخزن الرئيسي للفرع
  IF NEW.warehouse_id IS NULL AND NEW.branch_id IS NOT NULL THEN
    SELECT id INTO v_main_warehouse_id
    FROM warehouses
    WHERE branch_id = NEW.branch_id AND is_main = true
    LIMIT 1;
    
    -- إذا لم يوجد مخزن رئيسي، نأخذ أي مخزن للفرع
    IF v_main_warehouse_id IS NULL THEN
      SELECT id INTO v_main_warehouse_id
      FROM warehouses
      WHERE branch_id = NEW.branch_id
      LIMIT 1;
    END IF;
    
    NEW.warehouse_id := v_main_warehouse_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2️⃣ Trigger لتعيين القيم الافتراضية قبل الإدراج
DROP TRIGGER IF EXISTS trg_assign_default_member_branch ON company_members;
CREATE TRIGGER trg_assign_default_member_branch
  BEFORE INSERT ON company_members
  FOR EACH ROW
  EXECUTE FUNCTION assign_default_member_branch();

-- 3️⃣ تحديث الأعضاء الحاليين بدون فرع
UPDATE company_members cm
SET branch_id = b.id
FROM branches b
WHERE cm.branch_id IS NULL
  AND b.company_id = cm.company_id
  AND b.is_main = true;

-- 4️⃣ تحديث الأعضاء الحاليين بدون مركز تكلفة
UPDATE company_members cm
SET cost_center_id = cc.id
FROM cost_centers cc
WHERE cm.cost_center_id IS NULL
  AND cm.branch_id IS NOT NULL
  AND cc.branch_id = cm.branch_id
  AND cc.is_main = true;

-- 5️⃣ تحديث الأعضاء الحاليين بدون مخزن
UPDATE company_members cm
SET warehouse_id = w.id
FROM warehouses w
WHERE cm.warehouse_id IS NULL
  AND cm.branch_id IS NOT NULL
  AND w.branch_id = cm.branch_id
  AND w.is_main = true;

-- =====================================================
-- ✅ تم تفعيل التعيين التلقائي للفرع/المركز/المخزن
-- =====================================================


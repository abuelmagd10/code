-- =====================================================
-- 📌 ربط الحسابات المصرفية بالفرع ومركز التكلفة
-- Bank Accounts Branch and Cost Center Link
-- =====================================================
--
-- الهدف: التأكد من أن كل حركة مالية مصرفية مرتبطة بالشركة الصحيحة،
-- الفرع الصحيح، ومركز التكلفة المناسب لضمان نمط محاسبي صارم واحترافي
-- =====================================================

-- =====================================
-- 1️⃣ إضافة branch_id و cost_center_id لجدول chart_of_accounts
-- =====================================

-- إضافة عمود الفرع للحسابات
ALTER TABLE chart_of_accounts 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

-- إضافة عمود مركز التكلفة للحسابات
ALTER TABLE chart_of_accounts 
ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;

-- فهارس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_coa_branch_id ON chart_of_accounts(branch_id);
CREATE INDEX IF NOT EXISTS idx_coa_cost_center_id ON chart_of_accounts(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_coa_company_branch ON chart_of_accounts(company_id, branch_id);

-- =====================================
-- 2️⃣ إضافة branch_id و cost_center_id لجدول bank_reconciliations
-- =====================================

ALTER TABLE bank_reconciliations 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE bank_reconciliations 
ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bank_rec_branch_id ON bank_reconciliations(branch_id);
CREATE INDEX IF NOT EXISTS idx_bank_rec_cost_center_id ON bank_reconciliations(cost_center_id);

-- =====================================
-- 3️⃣ دالة للحصول على الفرع ومركز التكلفة للحساب البنكي
-- =====================================

CREATE OR REPLACE FUNCTION get_account_branch_cost_center(p_account_id UUID)
RETURNS TABLE(branch_id UUID, cost_center_id UUID, branch_name TEXT, cost_center_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    coa.branch_id,
    coa.cost_center_id,
    b.name AS branch_name,
    cc.name AS cost_center_name
  FROM chart_of_accounts coa
  LEFT JOIN branches b ON b.id = coa.branch_id
  LEFT JOIN cost_centers cc ON cc.id = coa.cost_center_id
  WHERE coa.id = p_account_id;
END;
$$;

-- =====================================
-- 4️⃣ دالة للتحقق من صلاحية المستخدم للحساب البنكي
-- =====================================

CREATE OR REPLACE FUNCTION user_can_access_bank_account(p_user_id UUID, p_account_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_branch_id UUID;
  v_user_branch_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- الحصول على فرع الحساب
  SELECT branch_id INTO v_account_branch_id
  FROM chart_of_accounts
  WHERE id = p_account_id;
  
  -- إذا الحساب غير مرتبط بفرع، يمكن للجميع الوصول
  IF v_account_branch_id IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- التحقق إذا المستخدم admin أو owner
  SELECT EXISTS (
    SELECT 1 FROM company_members cm
    JOIN chart_of_accounts coa ON coa.company_id = cm.company_id
    WHERE cm.user_id = p_user_id
    AND coa.id = p_account_id
    AND cm.role IN ('owner', 'admin')
  ) INTO v_is_admin;
  
  IF v_is_admin THEN
    RETURN TRUE;
  END IF;
  
  -- الحصول على فرع المستخدم
  SELECT ubcc.branch_id INTO v_user_branch_id
  FROM user_branch_cost_center ubcc
  JOIN chart_of_accounts coa ON coa.company_id = ubcc.company_id
  WHERE ubcc.user_id = p_user_id
  AND coa.id = p_account_id;
  
  -- التحقق من تطابق الفرع
  RETURN v_user_branch_id = v_account_branch_id;
END;
$$;

-- =====================================
-- 5️⃣ دالة تحديث الحسابات المصرفية الموجودة
-- =====================================

CREATE OR REPLACE FUNCTION link_existing_bank_accounts_to_main_branch()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- ربط حسابات النقد والبنك الموجودة بالفرع الرئيسي
  UPDATE chart_of_accounts coa
  SET branch_id = (
    SELECT b.id FROM branches b 
    WHERE b.company_id = coa.company_id 
    AND b.is_main = TRUE 
    LIMIT 1
  )
  WHERE coa.branch_id IS NULL
  AND coa.sub_type IN ('cash', 'bank')
  AND EXISTS (
    SELECT 1 FROM branches b 
    WHERE b.company_id = coa.company_id 
    AND b.is_main = TRUE
  );
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- تنفيذ الربط للحسابات الموجودة
SELECT link_existing_bank_accounts_to_main_branch();

-- =====================================
-- ✅ تم ربط الحسابات المصرفية بالفرع ومركز التكلفة
-- =====================================


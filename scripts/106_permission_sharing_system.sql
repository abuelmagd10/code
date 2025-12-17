-- =====================================================
-- 📌 نظام مشاركة ونقل الصلاحيات بين الموظفين
-- Permission Sharing & Transfer System
-- Version: 1.0
-- =====================================================
--
-- الميزات:
-- 1️⃣ نقل الصلاحيات (Transfer): نقل ملكية العملاء/الأوامر من موظف لآخر
-- 2️⃣ فتح الصلاحيات (Share): منح موظف صلاحية الاطلاع على بيانات موظف آخر
-- 3️⃣ دعم الفروع المتعددة (Multi-Branch): ربط الموظف بأكثر من فرع
-- 4️⃣ سجل المراجعة (Audit): تسجيل جميع عمليات النقل والمشاركة
-- =====================================================

-- =====================================
-- 1️⃣ جدول مشاركة الصلاحيات (Permission Sharing)
-- يسجل منح موظف صلاحية الاطلاع على بيانات موظف آخر
-- =====================================
CREATE TABLE IF NOT EXISTS permission_sharing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- الموظف المانح (صاحب البيانات)
  grantor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- الموظف المستفيد (الذي يحصل على الصلاحية)
  grantee_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- نوع البيانات المشاركة
  resource_type TEXT NOT NULL CHECK (resource_type IN ('customers', 'sales_orders', 'invoices', 'all')),
  -- نطاق المشاركة: branch = كل بيانات الفرع، user = بيانات المنشئ فقط
  scope TEXT NOT NULL DEFAULT 'user' CHECK (scope IN ('user', 'branch', 'cost_center')),
  -- الفرع (اختياري - لتحديد نطاق المشاركة)
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  -- مركز التكلفة (اختياري)
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  -- الصلاحيات الممنوحة
  can_view BOOLEAN DEFAULT TRUE,
  can_edit BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE,
  -- حالة المشاركة
  is_active BOOLEAN DEFAULT TRUE,
  -- من قام بإنشاء المشاركة (عادة المدير)
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- تاريخ انتهاء المشاركة (اختياري)
  notes TEXT,
  -- منع التكرار
  UNIQUE(company_id, grantor_user_id, grantee_user_id, resource_type)
);

-- =====================================
-- 2️⃣ جدول نقل الصلاحيات (Permission Transfers)
-- يسجل عمليات نقل ملكية البيانات من موظف لآخر
-- =====================================
CREATE TABLE IF NOT EXISTS permission_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- الموظف المصدر (الذي يفقد الصلاحية)
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- الموظف الهدف (الذي يكتسب الصلاحية)
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- نوع البيانات المنقولة
  resource_type TEXT NOT NULL CHECK (resource_type IN ('customers', 'sales_orders', 'invoices', 'all')),
  -- نطاق النقل
  scope TEXT NOT NULL DEFAULT 'user' CHECK (scope IN ('user', 'branch', 'all')),
  -- الفرع (اختياري)
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  -- عدد السجلات المنقولة
  records_transferred INTEGER DEFAULT 0,
  -- حالة النقل
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'reverted')),
  -- من قام بالنقل
  transferred_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  transferred_at TIMESTAMPTZ DEFAULT NOW(),
  -- بيانات النقل للتراجع
  transfer_data JSONB, -- يحتوي على IDs السجلات المنقولة
  -- سبب النقل
  reason TEXT,
  notes TEXT
);

-- =====================================
-- 3️⃣ جدول الفروع المتعددة للموظف (User Multi-Branch Access)
-- يسمح بربط الموظف بأكثر من فرع
-- =====================================
CREATE TABLE IF NOT EXISTS user_branch_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  -- نوع الوصول للفرع
  access_type TEXT DEFAULT 'full' CHECK (access_type IN ('full', 'read_only', 'limited')),
  -- هل هذا الفرع الرئيسي للموظف؟
  is_primary BOOLEAN DEFAULT FALSE,
  -- صلاحيات خاصة بالفرع
  can_view_customers BOOLEAN DEFAULT TRUE,
  can_view_orders BOOLEAN DEFAULT TRUE,
  can_view_invoices BOOLEAN DEFAULT TRUE,
  can_view_inventory BOOLEAN DEFAULT TRUE,
  can_view_prices BOOLEAN DEFAULT FALSE, -- رؤية أسعار الشراء
  -- حالة الوصول
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- منع التكرار
  UNIQUE(company_id, user_id, branch_id)
);

-- =====================================
-- 4️⃣ الفهارس للأداء
-- =====================================
CREATE INDEX IF NOT EXISTS idx_permission_sharing_company ON permission_sharing(company_id);
CREATE INDEX IF NOT EXISTS idx_permission_sharing_grantor ON permission_sharing(grantor_user_id);
CREATE INDEX IF NOT EXISTS idx_permission_sharing_grantee ON permission_sharing(grantee_user_id);
CREATE INDEX IF NOT EXISTS idx_permission_sharing_active ON permission_sharing(is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_permission_transfers_company ON permission_transfers(company_id);
CREATE INDEX IF NOT EXISTS idx_permission_transfers_from ON permission_transfers(from_user_id);
CREATE INDEX IF NOT EXISTS idx_permission_transfers_to ON permission_transfers(to_user_id);
CREATE INDEX IF NOT EXISTS idx_permission_transfers_status ON permission_transfers(status);

CREATE INDEX IF NOT EXISTS idx_user_branch_access_company ON user_branch_access(company_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_access_user ON user_branch_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_access_branch ON user_branch_access(branch_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_access_active ON user_branch_access(is_active) WHERE is_active = TRUE;

-- =====================================
-- 5️⃣ RLS Policies
-- =====================================

-- تمكين RLS
ALTER TABLE permission_sharing ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_branch_access ENABLE ROW LEVEL SECURITY;

-- سياسات permission_sharing
DROP POLICY IF EXISTS permission_sharing_select ON permission_sharing;
CREATE POLICY permission_sharing_select ON permission_sharing FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = permission_sharing.company_id
      AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS permission_sharing_insert ON permission_sharing;
CREATE POLICY permission_sharing_insert ON permission_sharing FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = permission_sharing.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin', 'manager')
    )
  );

DROP POLICY IF EXISTS permission_sharing_update ON permission_sharing;
CREATE POLICY permission_sharing_update ON permission_sharing FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = permission_sharing.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin', 'manager')
    )
  );

DROP POLICY IF EXISTS permission_sharing_delete ON permission_sharing;
CREATE POLICY permission_sharing_delete ON permission_sharing FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = permission_sharing.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin')
    )
  );

-- سياسات permission_transfers
DROP POLICY IF EXISTS permission_transfers_select ON permission_transfers;
CREATE POLICY permission_transfers_select ON permission_transfers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = permission_transfers.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin', 'manager')
    )
  );

DROP POLICY IF EXISTS permission_transfers_insert ON permission_transfers;
CREATE POLICY permission_transfers_insert ON permission_transfers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = permission_transfers.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin', 'manager')
    )
  );

-- سياسات user_branch_access
DROP POLICY IF EXISTS user_branch_access_select ON user_branch_access;
CREATE POLICY user_branch_access_select ON user_branch_access FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = user_branch_access.company_id
      AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS user_branch_access_insert ON user_branch_access;
CREATE POLICY user_branch_access_insert ON user_branch_access FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = user_branch_access.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS user_branch_access_update ON user_branch_access;
CREATE POLICY user_branch_access_update ON user_branch_access FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = user_branch_access.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS user_branch_access_delete ON user_branch_access;
CREATE POLICY user_branch_access_delete ON user_branch_access FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = user_branch_access.company_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('owner', 'admin')
    )
  );

-- =====================================
-- 6️⃣ دوال مساعدة
-- =====================================

-- دالة للتحقق من صلاحية الوصول للعميل/الأمر
CREATE OR REPLACE FUNCTION check_user_access_to_record(
  p_user_id UUID,
  p_company_id UUID,
  p_resource_type TEXT,
  p_record_created_by UUID,
  p_record_branch_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_user_role TEXT;
  v_user_branch_id UUID;
  v_has_sharing BOOLEAN;
  v_has_branch_access BOOLEAN;
BEGIN
  -- جلب دور المستخدم وفرعه
  SELECT role, branch_id INTO v_user_role, v_user_branch_id
  FROM company_members
  WHERE company_id = p_company_id AND user_id = p_user_id;

  -- المالك والمدير العام لديهم وصول كامل
  IF v_user_role IN ('owner', 'admin') THEN
    RETURN TRUE;
  END IF;

  -- إذا كان المستخدم هو منشئ السجل
  IF p_record_created_by = p_user_id THEN
    RETURN TRUE;
  END IF;

  -- التحقق من مشاركة الصلاحيات
  SELECT EXISTS (
    SELECT 1 FROM permission_sharing ps
    WHERE ps.company_id = p_company_id
    AND ps.grantee_user_id = p_user_id
    AND ps.grantor_user_id = p_record_created_by
    AND (ps.resource_type = p_resource_type OR ps.resource_type = 'all')
    AND ps.is_active = TRUE
    AND (ps.expires_at IS NULL OR ps.expires_at > NOW())
  ) INTO v_has_sharing;

  IF v_has_sharing THEN
    RETURN TRUE;
  END IF;

  -- التحقق من وصول الفرع المتعدد
  IF p_record_branch_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM user_branch_access uba
      WHERE uba.company_id = p_company_id
      AND uba.user_id = p_user_id
      AND uba.branch_id = p_record_branch_id
      AND uba.is_active = TRUE
      AND (
        (p_resource_type = 'customers' AND uba.can_view_customers = TRUE) OR
        (p_resource_type = 'sales_orders' AND uba.can_view_orders = TRUE) OR
        (p_resource_type = 'invoices' AND uba.can_view_invoices = TRUE)
      )
    ) INTO v_has_branch_access;

    IF v_has_branch_access THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- المدير يرى بيانات فرعه
  IF v_user_role = 'manager' AND p_record_branch_id = v_user_branch_id THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- دالة لنقل الصلاحيات (تحديث created_by_user_id)
CREATE OR REPLACE FUNCTION transfer_records_ownership(
  p_company_id UUID,
  p_from_user_id UUID,
  p_to_user_id UUID,
  p_resource_type TEXT,
  p_transferred_by UUID
) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_transfer_id UUID;
  v_record_ids UUID[];
BEGIN
  -- إنشاء سجل النقل
  INSERT INTO permission_transfers (
    company_id, from_user_id, to_user_id, resource_type,
    transferred_by, status
  ) VALUES (
    p_company_id, p_from_user_id, p_to_user_id, p_resource_type,
    p_transferred_by, 'pending'
  ) RETURNING id INTO v_transfer_id;

  -- نقل العملاء
  IF p_resource_type IN ('customers', 'all') THEN
    SELECT ARRAY_AGG(id) INTO v_record_ids
    FROM customers
    WHERE company_id = p_company_id AND created_by_user_id = p_from_user_id;

    UPDATE customers
    SET created_by_user_id = p_to_user_id
    WHERE company_id = p_company_id AND created_by_user_id = p_from_user_id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  -- نقل أوامر البيع
  IF p_resource_type IN ('sales_orders', 'all') THEN
    UPDATE sales_orders
    SET created_by_user_id = p_to_user_id
    WHERE company_id = p_company_id AND created_by_user_id = p_from_user_id;

    GET DIAGNOSTICS v_count = v_count + ROW_COUNT;
  END IF;

  -- تحديث سجل النقل
  UPDATE permission_transfers
  SET
    status = 'completed',
    records_transferred = v_count,
    transfer_data = jsonb_build_object('record_ids', v_record_ids)
  WHERE id = v_transfer_id;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 7️⃣ تعليقات توثيقية
-- =====================================
COMMENT ON TABLE permission_sharing IS 'جدول مشاركة الصلاحيات بين الموظفين - يسمح لموظف برؤية بيانات موظف آخر';
COMMENT ON TABLE permission_transfers IS 'جدول نقل الصلاحيات - يسجل عمليات نقل ملكية البيانات';
COMMENT ON TABLE user_branch_access IS 'جدول وصول الموظف للفروع المتعددة';

COMMENT ON FUNCTION check_user_access_to_record IS 'دالة للتحقق من صلاحية المستخدم للوصول لسجل معين';
COMMENT ON FUNCTION transfer_records_ownership IS 'دالة لنقل ملكية السجلات من موظف لآخر';

-- =====================================
-- ✅ تم إنشاء نظام مشاركة ونقل الصلاحيات بنجاح
-- =====================================


-- =============================================
-- نظام إهلاك/شطب المنتجات التالفة (Inventory Write-offs)
-- =============================================
-- يوفر:
-- 1. جدول inventory_write_offs لتسجيل عمليات الإهلاك
-- 2. جدول inventory_write_off_items للعناصر المشطوبة
-- 3. دالة لاعتماد الإهلاك وتحديث المخزون والقيود المحاسبية
-- 4. صلاحيات RBAC للإهلاك
-- =============================================

-- =====================================
-- 1. جدول إهلاك المخزون
-- =====================================
CREATE TABLE IF NOT EXISTS inventory_write_offs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  write_off_number TEXT NOT NULL,
  write_off_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  
  -- أسباب الإهلاك
  reason TEXT NOT NULL CHECK (reason IN ('damaged', 'expired', 'lost', 'obsolete', 'theft', 'other')),
  reason_details TEXT,
  
  -- المستودع (اختياري)
  warehouse_id UUID,
  warehouse_name TEXT,
  
  -- ✅ حقول الحوكمة (Governance) - مطلوبة للقيود المحاسبية
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  
  -- القيم المالية
  total_cost DECIMAL(15, 2) NOT NULL DEFAULT 0,
  
  -- المرفقات
  attachments JSONB DEFAULT '[]',
  
  -- سجل التدقيق
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES auth.users(id),
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  cancelled_by UUID REFERENCES auth.users(id),
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  
  -- ربط القيد المحاسبي
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  
  -- معلومات إضافية للتدقيق
  ip_address TEXT,
  user_agent TEXT,
  
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(company_id, write_off_number)
);

-- =====================================
-- 2. جدول عناصر الإهلاك
-- =====================================
CREATE TABLE IF NOT EXISTS inventory_write_off_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  write_off_id UUID NOT NULL REFERENCES inventory_write_offs(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  
  -- الكميات
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost DECIMAL(15, 2) NOT NULL DEFAULT 0,
  total_cost DECIMAL(15, 2) NOT NULL DEFAULT 0,
  
  -- معلومات إضافية
  batch_number TEXT,
  expiry_date DATE,
  item_reason TEXT,
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================
-- 3. الفهارس
-- =====================================
CREATE INDEX IF NOT EXISTS idx_write_offs_company ON inventory_write_offs(company_id);
CREATE INDEX IF NOT EXISTS idx_write_offs_status ON inventory_write_offs(company_id, status);
CREATE INDEX IF NOT EXISTS idx_write_offs_date ON inventory_write_offs(company_id, write_off_date);
-- ✅ فهارس حقول الحوكمة
CREATE INDEX IF NOT EXISTS idx_write_offs_branch ON inventory_write_offs(branch_id);
CREATE INDEX IF NOT EXISTS idx_write_offs_cost_center ON inventory_write_offs(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_write_offs_warehouse ON inventory_write_offs(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_write_off_items_product ON inventory_write_off_items(product_id);
CREATE INDEX IF NOT EXISTS idx_write_off_items_write_off ON inventory_write_off_items(write_off_id);

-- =====================================
-- 4. RLS Policies
-- =====================================
ALTER TABLE inventory_write_offs ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_write_off_items ENABLE ROW LEVEL SECURITY;

-- سياسة القراءة: أعضاء الشركة فقط
DROP POLICY IF EXISTS write_offs_select ON inventory_write_offs;
CREATE POLICY write_offs_select ON inventory_write_offs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = inventory_write_offs.company_id
      AND cm.user_id = auth.uid()
    )
  );

-- سياسة الإدراج: أعضاء الشركة فقط
DROP POLICY IF EXISTS write_offs_insert ON inventory_write_offs;
CREATE POLICY write_offs_insert ON inventory_write_offs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = inventory_write_offs.company_id
      AND cm.user_id = auth.uid()
    )
  );

-- سياسة التحديث: أعضاء الشركة فقط
DROP POLICY IF EXISTS write_offs_update ON inventory_write_offs;
CREATE POLICY write_offs_update ON inventory_write_offs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = inventory_write_offs.company_id
      AND cm.user_id = auth.uid()
    )
  );

-- سياسات عناصر الإهلاك
DROP POLICY IF EXISTS write_off_items_select ON inventory_write_off_items;
CREATE POLICY write_off_items_select ON inventory_write_off_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM inventory_write_offs wo
      JOIN company_members cm ON cm.company_id = wo.company_id
      WHERE wo.id = inventory_write_off_items.write_off_id
      AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS write_off_items_insert ON inventory_write_off_items;
CREATE POLICY write_off_items_insert ON inventory_write_off_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM inventory_write_offs wo
      JOIN company_members cm ON cm.company_id = wo.company_id
      WHERE wo.id = inventory_write_off_items.write_off_id
      AND cm.user_id = auth.uid()
    )
  );

-- =====================================
-- 5. دالة توليد رقم الإهلاك
-- =====================================
CREATE OR REPLACE FUNCTION generate_write_off_number(p_company_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_count INTEGER;
  v_year TEXT;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
  SELECT COUNT(*) + 1 INTO v_count
  FROM inventory_write_offs
  WHERE company_id = p_company_id
  AND EXTRACT(YEAR FROM write_off_date) = EXTRACT(YEAR FROM CURRENT_DATE);

  RETURN 'WO-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 6. دالة اعتماد الإهلاك
-- =====================================
CREATE OR REPLACE FUNCTION approve_write_off(
  p_write_off_id UUID,
  p_approved_by UUID,
  p_expense_account_id UUID,
  p_inventory_account_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_write_off RECORD;
  v_item RECORD;
  v_journal_id UUID;
  v_product RECORD;
  v_available_qty INTEGER;
BEGIN
  -- جلب بيانات الإهلاك
  SELECT * INTO v_write_off FROM inventory_write_offs WHERE id = p_write_off_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على الإهلاك');
  END IF;

  IF v_write_off.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الإهلاك ليس في حالة انتظار');
  END IF;

  -- التحقق من توفر الكميات
  FOR v_item IN SELECT * FROM inventory_write_off_items WHERE write_off_id = p_write_off_id LOOP
    SELECT quantity_on_hand INTO v_available_qty FROM products WHERE id = v_item.product_id;
    IF v_available_qty < v_item.quantity THEN
      SELECT name INTO v_product FROM products WHERE id = v_item.product_id;
      RETURN jsonb_build_object(
        'success', false,
        'error', 'الكمية المتاحة غير كافية للمنتج: ' || v_product.name ||
                 ' (متاح: ' || v_available_qty || ', مطلوب: ' || v_item.quantity || ')'
      );
    END IF;
  END LOOP;

  -- إنشاء القيد المحاسبي
  INSERT INTO journal_entries (
    company_id, reference_type, reference_id, entry_date, description
  ) VALUES (
    v_write_off.company_id,
    'write_off',
    p_write_off_id,
    v_write_off.write_off_date,
    'إهلاك مخزون - ' || v_write_off.write_off_number
  ) RETURNING id INTO v_journal_id;

  -- إدراج كلا السطرين (المدين والدائن) في نفس الأمر لضمان التوازن
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, debit_amount, credit_amount, description
  ) VALUES 
    -- خصم حساب مصروف الإهلاك
    (
      v_journal_id, p_expense_account_id, v_write_off.total_cost, 0,
      'مصروف إهلاك مخزون - ' || v_write_off.write_off_number
    ),
    -- دائن حساب المخزون
    (
      v_journal_id, p_inventory_account_id, 0, v_write_off.total_cost,
      'تخفيض المخزون - ' || v_write_off.write_off_number
    );

  -- إنشاء حركات المخزون
  FOR v_item IN SELECT * FROM inventory_write_off_items WHERE write_off_id = p_write_off_id LOOP
    INSERT INTO inventory_transactions (
      company_id, product_id, transaction_type, quantity_change,
      reference_id, journal_entry_id, notes
    ) VALUES (
      v_write_off.company_id,
      v_item.product_id,
      'write_off',
      -v_item.quantity,
      p_write_off_id,
      v_journal_id,
      'إهلاك - ' || v_write_off.write_off_number
    );
  END LOOP;

  -- تحديث حالة الإهلاك
  UPDATE inventory_write_offs SET
    status = 'approved',
    approved_by = p_approved_by,
    approved_at = now(),
    journal_entry_id = v_journal_id,
    updated_at = now()
  WHERE id = p_write_off_id;

  RETURN jsonb_build_object(
    'success', true,
    'journal_entry_id', v_journal_id,
    'message', 'تم اعتماد الإهلاك بنجاح'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 7. دالة إلغاء الإهلاك المعتمد
-- =====================================
CREATE OR REPLACE FUNCTION cancel_approved_write_off(
  p_write_off_id UUID,
  p_cancelled_by UUID,
  p_cancellation_reason TEXT
) RETURNS JSONB AS $$
DECLARE
  v_write_off RECORD;
  v_item RECORD;
  v_reversal_journal_id UUID;
BEGIN
  SELECT * INTO v_write_off FROM inventory_write_offs WHERE id = p_write_off_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على الإهلاك');
  END IF;

  IF v_write_off.status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن إلغاء إهلاك غير معتمد');
  END IF;

  -- إنشاء قيد عكسي
  -- ✅ إضافة branch_id و cost_center_id من inventory_write_offs لتجنب خطأ "Branch does not belong to company"
  INSERT INTO journal_entries (
    company_id, 
    reference_type, 
    reference_id, 
    entry_date, 
    description,
    branch_id,
    cost_center_id
  ) VALUES (
    v_write_off.company_id,
    'write_off_reversal',
    p_write_off_id,
    CURRENT_DATE,
    'إلغاء إهلاك - ' || v_write_off.write_off_number,
    v_write_off.branch_id,
    v_write_off.cost_center_id
  ) RETURNING id INTO v_reversal_journal_id;

  -- عكس القيود (نسخ عكسي)
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, debit_amount, credit_amount, description
  )
  SELECT
    v_reversal_journal_id,
    account_id,
    credit_amount, -- عكس: الدائن يصبح مدين
    debit_amount,  -- عكس: المدين يصبح دائن
    'عكس: ' || COALESCE(description, '')
  FROM journal_entry_lines
  WHERE journal_entry_id = v_write_off.journal_entry_id;

  -- إرجاع الكميات للمخزون
  -- ✅ إضافة branch_id و cost_center_id و warehouse_id من inventory_write_offs
  FOR v_item IN SELECT * FROM inventory_write_off_items WHERE write_off_id = p_write_off_id LOOP
    INSERT INTO inventory_transactions (
      company_id, 
      product_id, 
      transaction_type, 
      quantity_change,
      reference_id, 
      journal_entry_id, 
      notes,
      branch_id,
      cost_center_id,
      warehouse_id
    ) VALUES (
      v_write_off.company_id,
      v_item.product_id,
      'write_off_reversal',
      v_item.quantity, -- إضافة الكمية مرة أخرى
      p_write_off_id,
      v_reversal_journal_id,
      'إلغاء إهلاك - ' || v_write_off.write_off_number,
      v_write_off.branch_id,
      v_write_off.cost_center_id,
      v_write_off.warehouse_id
    );
  END LOOP;

  -- تحديث حالة الإهلاك
  UPDATE inventory_write_offs SET
    status = 'cancelled',
    cancelled_by = p_cancelled_by,
    cancelled_at = now(),
    cancellation_reason = p_cancellation_reason,
    updated_at = now()
  WHERE id = p_write_off_id;

  RETURN jsonb_build_object(
    'success', true,
    'reversal_journal_id', v_reversal_journal_id,
    'message', 'تم إلغاء الإهلاك بنجاح'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 8. إضافة صلاحيات الإهلاك
-- =====================================
INSERT INTO permissions (action, resource, category, title_ar, title_en, is_dangerous) VALUES
  ('write_offs:access', 'write_offs', 'inventory', 'الوصول لإهلاك المخزون', 'Access Write-offs', FALSE),
  ('write_offs:read', 'write_offs', 'inventory', 'عرض الإهلاكات', 'View Write-offs', FALSE),
  ('write_offs:create', 'write_offs', 'inventory', 'إنشاء إهلاك', 'Create Write-off', FALSE),
  ('write_offs:approve', 'write_offs', 'inventory', 'اعتماد إهلاك', 'Approve Write-off', TRUE),
  ('write_offs:reject', 'write_offs', 'inventory', 'رفض إهلاك', 'Reject Write-off', TRUE),
  ('write_offs:cancel', 'write_offs', 'inventory', 'إلغاء إهلاك معتمد', 'Cancel Approved Write-off', TRUE),
  ('write_offs:export', 'write_offs', 'inventory', 'تصدير الإهلاكات', 'Export Write-offs', FALSE)
ON CONFLICT (action) DO NOTHING;

-- إضافة الصلاحيات الافتراضية للأدوار
-- Owner & Admin: كل الصلاحيات
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT role_name, action FROM (
  SELECT 'owner' AS role_name UNION SELECT 'admin'
) roles
CROSS JOIN (
  SELECT action FROM permissions WHERE resource = 'write_offs'
) perms
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- Manager: كل صلاحيات الإهلاك ما عدا الإلغاء
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'manager', action FROM permissions
WHERE resource = 'write_offs' AND action != 'write_offs:cancel'
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- Store Manager: إنشاء وقراءة فقط
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'store_manager', action FROM permissions
WHERE action IN ('write_offs:access', 'write_offs:read', 'write_offs:create')
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- Accountant: قراءة وتصدير
INSERT INTO role_default_permissions (role_name, permission_action)
SELECT 'accountant', action FROM permissions
WHERE action IN ('write_offs:access', 'write_offs:read', 'write_offs:export')
ON CONFLICT (role_name, permission_action) DO NOTHING;

-- =====================================
-- 9. Trigger لتحديث updated_at
-- =====================================
CREATE OR REPLACE FUNCTION update_write_off_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_write_off_updated_at ON inventory_write_offs;
CREATE TRIGGER trg_write_off_updated_at
BEFORE UPDATE ON inventory_write_offs
FOR EACH ROW EXECUTE FUNCTION update_write_off_updated_at();


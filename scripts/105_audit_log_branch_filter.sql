-- =============================================
-- تحديث سجل المراجعة لدعم الفلترة حسب الفرع ومركز التكلفة
-- 🔐 ERP Access Control - Audit Log Enhancement
-- =============================================

-- 1. إضافة أعمدة الفرع ومركز التكلفة إلى جدول audit_logs
ALTER TABLE audit_logs 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;

-- 2. إنشاء فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_id ON audit_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_cost_center_id ON audit_logs(cost_center_id);

-- 3. تحديث دالة إنشاء سجل المراجعة لتشمل الفرع ومركز التكلفة
CREATE OR REPLACE FUNCTION create_audit_log(
  p_company_id UUID,
  p_user_id UUID,
  p_action TEXT,
  p_target_table TEXT,
  p_record_id UUID,
  p_record_identifier TEXT,
  p_old_data JSONB,
  p_new_data JSONB,
  p_branch_id UUID DEFAULT NULL,
  p_cost_center_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_user_email TEXT;
  v_user_name TEXT;
  v_changed_fields TEXT[];
  v_log_id UUID;
  v_branch_id UUID;
  v_cost_center_id UUID;
BEGIN
  -- جلب بيانات المستخدم
  IF p_user_id IS NOT NULL THEN
    SELECT email, raw_user_meta_data->>'full_name'
    INTO v_user_email, v_user_name
    FROM auth.users WHERE id = p_user_id;
  END IF;

  -- حساب الحقول التي تغيرت
  IF p_action = 'UPDATE' AND p_old_data IS NOT NULL AND p_new_data IS NOT NULL THEN
    SELECT array_agg(key)
    INTO v_changed_fields
    FROM (
      SELECT key FROM jsonb_each(p_new_data)
      EXCEPT
      SELECT key FROM jsonb_each(p_old_data) WHERE p_old_data->key = p_new_data->key
    ) changed;
  END IF;

  -- استخراج branch_id و cost_center_id من البيانات إذا لم يتم تمريرها
  v_branch_id := COALESCE(p_branch_id, (p_new_data->>'branch_id')::UUID, (p_old_data->>'branch_id')::UUID);
  v_cost_center_id := COALESCE(p_cost_center_id, (p_new_data->>'cost_center_id')::UUID, (p_old_data->>'cost_center_id')::UUID);

  -- إدراج السجل
  INSERT INTO audit_logs (
    company_id, user_id, user_email, user_name,
    action, target_table, record_id, record_identifier,
    old_data, new_data, changed_fields,
    branch_id, cost_center_id
  ) VALUES (
    p_company_id, p_user_id, v_user_email, COALESCE(v_user_name, v_user_email),
    p_action, p_target_table, p_record_id, p_record_identifier,
    p_old_data, p_new_data, v_changed_fields,
    v_branch_id, v_cost_center_id
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. تحديث دالة الـ Trigger لاستخراج الفرع ومركز التكلفة
CREATE OR REPLACE FUNCTION audit_trigger_function() RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
  v_record_id UUID;
  v_record_identifier TEXT;
  v_old_data JSONB;
  v_new_data JSONB;
  v_user_id UUID;
  v_branch_id UUID;
  v_cost_center_id UUID;
BEGIN
  -- جلب معرف المستخدم الحالي
  v_user_id := auth.uid();

  -- تحديد company_id و record_id
  IF TG_OP = 'DELETE' THEN
    v_company_id := OLD.company_id;
    v_record_id := OLD.id;
    -- استخراج branch_id و cost_center_id من OLD
    v_branch_id := CASE WHEN TG_TABLE_NAME IN ('invoices', 'bills', 'payments', 'journal_entries', 'sales_orders', 'purchase_orders', 'customers', 'inventory_transactions') 
                        THEN OLD.branch_id ELSE NULL END;
    v_cost_center_id := CASE WHEN TG_TABLE_NAME IN ('invoices', 'bills', 'payments', 'journal_entries', 'sales_orders', 'purchase_orders', 'customers', 'inventory_transactions') 
                             THEN OLD.cost_center_id ELSE NULL END;
  ELSE
    v_company_id := NEW.company_id;
    v_record_id := NEW.id;
    -- استخراج branch_id و cost_center_id من NEW
    v_branch_id := CASE WHEN TG_TABLE_NAME IN ('invoices', 'bills', 'payments', 'journal_entries', 'sales_orders', 'purchase_orders', 'customers', 'inventory_transactions') 
                        THEN NEW.branch_id ELSE NULL END;
    v_cost_center_id := CASE WHEN TG_TABLE_NAME IN ('invoices', 'bills', 'payments', 'journal_entries', 'sales_orders', 'purchase_orders', 'customers', 'inventory_transactions') 
                             THEN NEW.cost_center_id ELSE NULL END;
  END IF;

  -- تحديد معرف السجل بشكل مبسط
  v_record_identifier := TG_TABLE_NAME || '_' || COALESCE(v_record_id::TEXT, 'unknown');

  -- تحويل البيانات إلى JSON
  IF TG_OP = 'DELETE' THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
  ELSE -- UPDATE
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
  END IF;

  -- إنشاء سجل المراجعة
  PERFORM create_audit_log(
    v_company_id,
    v_user_id,
    TG_OP,
    TG_TABLE_NAME,
    v_record_id,
    v_record_identifier,
    v_old_data,
    v_new_data,
    v_branch_id,
    v_cost_center_id
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Audit log failed: %', SQLERRM;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. منح الصلاحيات
GRANT EXECUTE ON FUNCTION create_audit_log TO authenticated;
GRANT EXECUTE ON FUNCTION audit_trigger_function TO authenticated;

-- ✅ تم تحديث نظام سجل المراجعة لدعم الفلترة حسب الفرع ومركز التكلفة


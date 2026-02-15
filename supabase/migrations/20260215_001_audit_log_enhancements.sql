-- =============================================
-- AUDIT LOG ENHANCEMENTS - Phase 1
-- Date: 2026-02-15
-- Description: Schema enhancements for comprehensive audit logging
-- =============================================

BEGIN;

-- 1. توسيع أنواع العمليات (Expand Action Types)
-- إضافة أنواع جديدة للعمليات لتغطية جميع سيناريوهات ERP
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_check 
  CHECK (action IN (
    'INSERT', 'UPDATE', 'DELETE', 'REVERT',
    'APPROVE', 'POST', 'CANCEL', 'REVERSE', 'CLOSE',
    'LOGIN', 'LOGOUT', 'ACCESS_DENIED', 'SETTINGS'
  ));

-- 2. إضافة حقل reason (سبب العملية)
-- يستخدم لتوثيق سبب العمليات الحرجة مثل الحذف أو الإلغاء
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;

-- 3. منع UPDATE على audit_logs (Immutability Protection)
-- لضمان عدم إمكانية تعديل سجلات المراجعة بعد إنشائها
DROP POLICY IF EXISTS audit_logs_no_update ON audit_logs;
CREATE POLICY audit_logs_no_update ON audit_logs FOR UPDATE
  USING (false);

-- 4. إنشاء فهرس على reason للأداء
CREATE INDEX IF NOT EXISTS idx_audit_logs_reason ON audit_logs(reason) 
  WHERE reason IS NOT NULL;

-- 5. إنشاء فهرس مركب للاستعلامات الشائعة
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_action_date 
  ON audit_logs(company_id, action, created_at DESC);

-- 6. تحديث دالة create_audit_log لدعم reason
-- حذف النسخ القديمة من الدالة أولاً
DROP FUNCTION IF EXISTS create_audit_log(UUID, UUID, TEXT, TEXT, UUID, TEXT, JSONB, JSONB);
DROP FUNCTION IF EXISTS create_audit_log(UUID, UUID, TEXT, TEXT, UUID, TEXT, JSONB, JSONB, UUID, UUID);

-- إنشاء النسخة الجديدة مع معامل reason
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
  p_cost_center_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
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
    branch_id, cost_center_id, reason
  ) VALUES (
    p_company_id, p_user_id, v_user_email, COALESCE(v_user_name, v_user_email),
    p_action, p_target_table, p_record_id, p_record_identifier,
    p_old_data, p_new_data, v_changed_fields,
    v_branch_id, v_cost_center_id, p_reason
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7. منح الصلاحيات
GRANT EXECUTE ON FUNCTION create_audit_log TO authenticated;

COMMIT;

-- =============================================
-- ✅ تم تطبيق التحسينات بنجاح
-- =============================================
-- التغييرات:
-- 1. ✅ توسيع action types (13 نوع)
-- 2. ✅ إضافة حقل reason
-- 3. ✅ منع UPDATE على audit_logs
-- 4. ✅ تحسين الفهارس
-- 5. ✅ تحديث دالة create_audit_log
-- =============================================

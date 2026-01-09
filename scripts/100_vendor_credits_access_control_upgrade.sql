-- =====================================================
-- 📌 Vendor Credits - Access Control & Approval Workflow
-- =====================================================
-- تحديث نظام Vendor Credits ليتوافق مع معايير Customer Debit Notes
-- يطبق: Separation of Duties, Approval Workflow, Access Control
-- التاريخ: 2026-01-09
-- =====================================================

-- 1️⃣ إضافة الحقول المطلوبة للتحكم والتدقيق
ALTER TABLE vendor_credits
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS applied_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS application_payment_id UUID REFERENCES payments(id);

-- 2️⃣ تحديث الحقول الموجودة (إذا لم تكن موجودة)
ALTER TABLE vendor_credits
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id),
ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id);

-- 3️⃣ إنشاء فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_vendor_credits_created_by ON vendor_credits(created_by);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_approval_status ON vendor_credits(approval_status);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_approved_by ON vendor_credits(approved_by);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_branch_id ON vendor_credits(branch_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_cost_center_id ON vendor_credits(cost_center_id);

-- 4️⃣ إضافة قيود التحقق
ALTER TABLE vendor_credits
DROP CONSTRAINT IF EXISTS chk_vendor_credit_approval_status,
ADD CONSTRAINT chk_vendor_credit_approval_status 
  CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'rejected'));

-- 5️⃣ تحديث البيانات الموجودة
-- تعيين created_by للسجلات الموجودة (من company owner)
UPDATE vendor_credits vc
SET created_by = c.user_id,
    approval_status = 'approved',
    approved_at = vc.created_at
FROM companies c
WHERE vc.company_id = c.id
  AND vc.created_by IS NULL;

-- 6️⃣ جعل created_by إلزامي بعد تحديث البيانات
ALTER TABLE vendor_credits
ALTER COLUMN created_by SET NOT NULL;

-- 7️⃣ تعليقات على الأعمدة الجديدة
COMMENT ON COLUMN vendor_credits.created_by IS 'المستخدم الذي أنشأ الإشعار';
COMMENT ON COLUMN vendor_credits.approval_status IS 'حالة الموافقة: draft, pending_approval, approved, rejected';
COMMENT ON COLUMN vendor_credits.submitted_by IS 'المستخدم الذي قدم الطلب للموافقة';
COMMENT ON COLUMN vendor_credits.submitted_at IS 'تاريخ تقديم الطلب للموافقة';
COMMENT ON COLUMN vendor_credits.approved_by IS 'المستخدم الذي وافق على الإشعار';
COMMENT ON COLUMN vendor_credits.approved_at IS 'تاريخ الموافقة';
COMMENT ON COLUMN vendor_credits.rejected_by IS 'المستخدم الذي رفض الإشعار';
COMMENT ON COLUMN vendor_credits.rejected_at IS 'تاريخ الرفض';
COMMENT ON COLUMN vendor_credits.rejection_reason IS 'سبب الرفض';
COMMENT ON COLUMN vendor_credits.applied_by IS 'المستخدم الذي طبق الإشعار';
COMMENT ON COLUMN vendor_credits.applied_at IS 'تاريخ التطبيق';
COMMENT ON COLUMN vendor_credits.application_payment_id IS 'معرف سند الصرف المرتبط';

-- =====================================================
-- 📌 دوال الموافقة والتطبيق
-- =====================================================

-- 8️⃣ دالة تقديم Vendor Credit للموافقة
CREATE OR REPLACE FUNCTION submit_vendor_credit_for_approval(
  p_vendor_credit_id UUID,
  p_submitted_by UUID
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  vendor_credit_id UUID,
  approval_status TEXT
) AS $$
DECLARE
  v_current_status TEXT;
  v_created_by UUID;
BEGIN
  -- التحقق من وجود الإشعار
  SELECT approval_status, created_by
  INTO v_current_status, v_created_by
  FROM vendor_credits
  WHERE id = p_vendor_credit_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Vendor credit not found', NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  -- التحقق من الحالة الحالية
  IF v_current_status != 'draft' THEN
    RETURN QUERY SELECT FALSE, 'Vendor credit is not in draft status', p_vendor_credit_id, v_current_status;
    RETURN;
  END IF;

  -- تحديث الحالة
  UPDATE vendor_credits
  SET approval_status = 'pending_approval',
      submitted_by = p_submitted_by,
      submitted_at = NOW()
  WHERE id = p_vendor_credit_id;

  RETURN QUERY SELECT TRUE, 'Vendor credit submitted for approval', p_vendor_credit_id, 'pending_approval'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9️⃣ دالة الموافقة على Vendor Credit
CREATE OR REPLACE FUNCTION approve_vendor_credit(
  p_vendor_credit_id UUID,
  p_approved_by UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  vendor_credit_id UUID,
  approval_status TEXT
) AS $$
DECLARE
  v_current_status TEXT;
  v_created_by UUID;
BEGIN
  -- التحقق من وجود الإشعار
  SELECT approval_status, created_by
  INTO v_current_status, v_created_by
  FROM vendor_credits
  WHERE id = p_vendor_credit_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Vendor credit not found', NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  -- التحقق من الحالة
  IF v_current_status NOT IN ('pending_approval', 'draft') THEN
    RETURN QUERY SELECT FALSE, 'Vendor credit is not pending approval', p_vendor_credit_id, v_current_status;
    RETURN;
  END IF;

  -- 🔒 Separation of Duties: المنشئ لا يمكنه الموافقة
  IF v_created_by = p_approved_by THEN
    RETURN QUERY SELECT FALSE, 'Creator cannot approve their own vendor credit', p_vendor_credit_id, v_current_status;
    RETURN;
  END IF;

  -- تحديث الحالة
  UPDATE vendor_credits
  SET approval_status = 'approved',
      approved_by = p_approved_by,
      approved_at = NOW(),
      status = 'open',
      notes = COALESCE(notes || E'\n\n', '') || COALESCE(p_notes, '')
  WHERE id = p_vendor_credit_id;

  RETURN QUERY SELECT TRUE, 'Vendor credit approved successfully', p_vendor_credit_id, 'approved'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 🔟 دالة رفض Vendor Credit
CREATE OR REPLACE FUNCTION reject_vendor_credit(
  p_vendor_credit_id UUID,
  p_rejected_by UUID,
  p_rejection_reason TEXT
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  vendor_credit_id UUID,
  approval_status TEXT
) AS $$
DECLARE
  v_current_status TEXT;
BEGIN
  -- التحقق من وجود الإشعار
  SELECT approval_status
  INTO v_current_status
  FROM vendor_credits
  WHERE id = p_vendor_credit_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Vendor credit not found', NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  -- التحقق من الحالة
  IF v_current_status != 'pending_approval' THEN
    RETURN QUERY SELECT FALSE, 'Vendor credit is not pending approval', p_vendor_credit_id, v_current_status;
    RETURN;
  END IF;

  -- التحقق من وجود سبب الرفض
  IF p_rejection_reason IS NULL OR TRIM(p_rejection_reason) = '' THEN
    RETURN QUERY SELECT FALSE, 'Rejection reason is required', p_vendor_credit_id, v_current_status;
    RETURN;
  END IF;

  -- تحديث الحالة
  UPDATE vendor_credits
  SET approval_status = 'rejected',
      rejected_by = p_rejected_by,
      rejected_at = NOW(),
      rejection_reason = p_rejection_reason
  WHERE id = p_vendor_credit_id;

  RETURN QUERY SELECT TRUE, 'Vendor credit rejected', p_vendor_credit_id, 'rejected'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1️⃣1️⃣ دالة تطبيق Vendor Credit (إنشاء سند صرف)
CREATE OR REPLACE FUNCTION apply_vendor_credit_to_payment(
  p_vendor_credit_id UUID,
  p_payment_id UUID,
  p_amount_to_apply DECIMAL(15,2),
  p_applied_by UUID
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  vendor_credit_id UUID,
  payment_id UUID
) AS $$
DECLARE
  v_approval_status TEXT;
  v_remaining_amount DECIMAL(15,2);
  v_total_amount DECIMAL(15,2);
  v_applied_amount DECIMAL(15,2);
BEGIN
  -- التحقق من وجود الإشعار
  SELECT approval_status, total_amount, applied_amount, remaining_amount
  INTO v_approval_status, v_total_amount, v_applied_amount, v_remaining_amount
  FROM vendor_credits
  WHERE id = p_vendor_credit_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Vendor credit not found', NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- التحقق من الموافقة
  IF v_approval_status != 'approved' THEN
    RETURN QUERY SELECT FALSE, 'Vendor credit must be approved before application', p_vendor_credit_id, NULL::UUID;
    RETURN;
  END IF;

  -- التحقق من المبلغ المتبقي
  IF p_amount_to_apply > v_remaining_amount THEN
    RETURN QUERY SELECT FALSE, 'Amount exceeds remaining credit balance', p_vendor_credit_id, NULL::UUID;
    RETURN;
  END IF;

  -- تحديث المبلغ المطبق
  UPDATE vendor_credits
  SET applied_amount = applied_amount + p_amount_to_apply,
      application_payment_id = p_payment_id,
      applied_by = p_applied_by,
      applied_at = NOW(),
      status = CASE
        WHEN (applied_amount + p_amount_to_apply) >= total_amount THEN 'closed'
        ELSE 'applied'
      END
  WHERE id = p_vendor_credit_id;

  RETURN QUERY SELECT TRUE, 'Vendor credit applied to payment successfully', p_vendor_credit_id, p_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 📌 Triggers للحماية والتدقيق
-- =====================================================

-- 1️⃣2️⃣ منع تعديل Vendor Credit بعد الموافقة
CREATE OR REPLACE FUNCTION prevent_vendor_credit_modification()
RETURNS TRIGGER AS $$
BEGIN
  -- السماح بالتعديل فقط في حالة draft أو rejected
  IF OLD.approval_status NOT IN ('draft', 'rejected') THEN
    -- السماح فقط بتحديث حقول التطبيق والموافقة
    IF (NEW.approval_status != OLD.approval_status OR
        NEW.applied_amount != OLD.applied_amount OR
        NEW.approved_by != OLD.approved_by OR
        NEW.rejected_by != OLD.rejected_by) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Cannot modify vendor credit after approval. Status: %', OLD.approval_status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_vendor_credit_modification ON vendor_credits;
CREATE TRIGGER trg_prevent_vendor_credit_modification
  BEFORE UPDATE ON vendor_credits
  FOR EACH ROW
  EXECUTE FUNCTION prevent_vendor_credit_modification();

-- 1️⃣3️⃣ منع حذف Vendor Credit بعد التقديم
CREATE OR REPLACE FUNCTION prevent_vendor_credit_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.approval_status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'Cannot delete vendor credit after submission. Status: %', OLD.approval_status;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_vendor_credit_deletion ON vendor_credits;
CREATE TRIGGER trg_prevent_vendor_credit_deletion
  BEFORE DELETE ON vendor_credits
  FOR EACH ROW
  EXECUTE FUNCTION prevent_vendor_credit_deletion();

-- =====================================================
-- 📌 تعليقات نهائية
-- =====================================================

COMMENT ON FUNCTION submit_vendor_credit_for_approval IS 'تقديم إشعار دائن للموافقة';
COMMENT ON FUNCTION approve_vendor_credit IS 'الموافقة على إشعار دائن (مع فصل المهام)';
COMMENT ON FUNCTION reject_vendor_credit IS 'رفض إشعار دائن';
COMMENT ON FUNCTION apply_vendor_credit_to_payment IS 'تطبيق إشعار دائن على سند صرف';

-- ✅ انتهى التحديث
SELECT 'Vendor Credits Access Control & Approval Workflow - Installed Successfully' AS status;


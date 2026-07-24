-- ============================================================================
-- v3.74.814 — أعمدة مرحلة اعتماد الإدارة فى طلبات صرف مواد التصنيع
-- ============================================================================
-- اصطدم المالك بها حياً عند «اعتماد الإدارة» لأول طلب صرف: المسار المنشور
-- (management-approve) يكتب management_approved_by/at/notes ويحوّل الحالة
-- إلى 'management_approved' — لكن الجدول أُنشئ بأعمدة مرحلة المخزن فقط
-- (approved_by/at) وقيد حالة لا يعرف القيمة الوسيطة:
--   * PostgREST: Could not find the 'management_approved_at' column ...
-- الإصلاح (طُبق على القاعدتين وقت الاكتشاف):
--   1) الأعمدة الثلاثة لمرحلة الإدارة — فيبقى لكل مرحلة توقيعها المستقل
--      (إدارة ثم مخزن) كما صُمم التدفق.
--   2) توسيع قيد الحالة ليشمل 'management_approved' الوسيطة.
-- ============================================================================

ALTER TABLE manufacturing_material_issue_approvals
  ADD COLUMN IF NOT EXISTS management_approved_by uuid,
  ADD COLUMN IF NOT EXISTS management_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS management_approved_notes text;

ALTER TABLE manufacturing_material_issue_approvals
  DROP CONSTRAINT IF EXISTS manufacturing_material_issue_approvals_status_check;
ALTER TABLE manufacturing_material_issue_approvals
  ADD CONSTRAINT manufacturing_material_issue_approvals_status_check
  CHECK (status = ANY (ARRAY['pending','management_approved','approved','rejected','cancelled']));

-- ============================================================================
-- v3.74.812 — مسؤول التصنيع يقرأ المنتجات (لبناء قوائم المكونات)
-- ============================================================================
-- أثناء بدء اختبار التصنيع: دور manufacturing_officer كان يملك
-- approvals + manufacturing_boms + reports فقط — بلا قراءة المنتجات،
-- فبانى الـBOM لن يعرض له أى مكون ليختاره. منح قراءة فقط (كل الشركات
-- التى لديها الدور، idempotent). طُبقت يدوياً على القاعدتين وقت
-- الاكتشاف؛ هذا الملف يوثقها للمستودع وأى بيئة جديدة.
-- ============================================================================

INSERT INTO company_role_permissions (company_id, role, resource, can_read, can_write, can_update, can_delete, all_access, can_access)
SELECT DISTINCT crp.company_id, 'manufacturing_officer', 'products', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE
FROM company_role_permissions crp
WHERE crp.role = 'manufacturing_officer'
  AND NOT EXISTS (
    SELECT 1 FROM company_role_permissions x
    WHERE x.company_id = crp.company_id
      AND x.role = 'manufacturing_officer'
      AND x.resource = 'products'
  );

-- =====================================================
-- استعلامات فحص الصلاحيات - VitaSlims ERP
-- Permission Check Queries
-- تاريخ: 2025-12-09
-- =====================================================

-- =====================================================
-- 1. فحص عضوية المستخدم في شركة معينة
-- Check if user is member of a specific company
-- =====================================================
SELECT 
    cm.id,
    cm.user_id,
    cm.company_id,
    cm.role,
    c.name as company_name,
    u.email as user_email
FROM company_members cm
JOIN companies c ON c.id = cm.company_id
JOIN auth.users u ON u.id = cm.user_id
WHERE cm.user_id = 'USER_UUID_HERE'
  AND cm.company_id = 'COMPANY_UUID_HERE';

-- =====================================================
-- 2. عرض جميع أعضاء شركة معينة مع أدوارهم
-- List all members of a company with their roles
-- =====================================================
SELECT 
    cm.id,
    cm.role,
    u.email,
    u.raw_user_meta_data->>'full_name' as full_name,
    cm.created_at as joined_at
FROM company_members cm
JOIN auth.users u ON u.id = cm.user_id
WHERE cm.company_id = 'COMPANY_UUID_HERE'
ORDER BY 
    CASE cm.role 
        WHEN 'owner' THEN 1 
        WHEN 'admin' THEN 2 
        WHEN 'manager' THEN 3 
        WHEN 'accountant' THEN 4 
        WHEN 'store_manager' THEN 5
        WHEN 'staff' THEN 6 
        WHEN 'viewer' THEN 7 
    END;

-- =====================================================
-- 3. فحص صلاحيات دور معين لمورد محدد
-- Check permissions for a specific role on a resource
-- =====================================================
SELECT 
    crp.role,
    crp.resource,
    crp.can_access,
    crp.can_read,
    crp.can_write,
    crp.can_update,
    crp.can_delete,
    crp.all_access,
    crp.allowed_actions
FROM company_role_permissions crp
WHERE crp.company_id = 'COMPANY_UUID_HERE'
  AND crp.role = 'accountant'
  AND crp.resource = 'invoices';

-- =====================================================
-- 4. عرض جميع صلاحيات دور معين
-- List all permissions for a specific role
-- =====================================================
SELECT 
    crp.resource,
    crp.can_access,
    crp.can_read,
    crp.can_write,
    crp.can_update,
    crp.can_delete,
    crp.all_access
FROM company_role_permissions crp
WHERE crp.company_id = 'COMPANY_UUID_HERE'
  AND crp.role = 'accountant'
ORDER BY crp.resource;

-- =====================================================
-- 5. فحص الدعوات المعلقة لشركة
-- Check pending invitations for a company
-- =====================================================
SELECT 
    ci.id,
    ci.email,
    ci.role,
    ci.created_at,
    ci.expires_at,
    ci.accepted,
    u.email as inviter_email
FROM company_invitations ci
LEFT JOIN auth.users u ON u.id = ci.invited_by
WHERE ci.company_id = 'COMPANY_UUID_HERE'
  AND ci.accepted = false
  AND ci.expires_at > NOW()
ORDER BY ci.created_at DESC;

-- =====================================================
-- 6. فحص سجل التدقيق لمستخدم معين
-- Check audit log for a specific user
-- =====================================================
SELECT 
    al.id,
    al.action,
    al.table_name,
    al.record_id,
    al.user_email,
    al.changed_fields,
    al.created_at
FROM audit_logs al
WHERE al.company_id = 'COMPANY_UUID_HERE'
  AND al.user_id = 'USER_UUID_HERE'
ORDER BY al.created_at DESC
LIMIT 50;

-- =====================================================
-- 7. فحص التعديلات على القيود اليومية
-- Check modifications to journal entries
-- =====================================================
SELECT 
    al.id,
    al.action,
    al.record_id,
    al.user_email,
    al.old_data,
    al.new_data,
    al.changed_fields,
    al.edit_reason,
    al.created_at
FROM audit_logs al
WHERE al.company_id = 'COMPANY_UUID_HERE'
  AND al.table_name = 'journal_entries'
  AND al.action IN ('UPDATE', 'DELETE')
ORDER BY al.created_at DESC;

-- =====================================================
-- 8. فحص المستخدمين الذين لديهم صلاحية الحذف
-- Check users with delete permission
-- =====================================================
SELECT DISTINCT
    cm.user_id,
    u.email,
    cm.role
FROM company_members cm
JOIN auth.users u ON u.id = cm.user_id
WHERE cm.company_id = 'COMPANY_UUID_HERE'
  AND cm.role IN ('owner', 'admin', 'manager');

-- =====================================================
-- 9. فحص الشركات التي ينتمي إليها مستخدم
-- Check companies a user belongs to
-- =====================================================
SELECT 
    c.id,
    c.name,
    cm.role,
    cm.created_at as joined_at
FROM company_members cm
JOIN companies c ON c.id = cm.company_id
WHERE cm.user_id = 'USER_UUID_HERE'
ORDER BY cm.created_at DESC;

-- =====================================================
-- 10. فحص عدد المالكين في كل شركة (للتأكد من وجود مالك واحد على الأقل)
-- Check owner count per company
-- =====================================================
SELECT 
    c.id,
    c.name,
    COUNT(cm.id) as owner_count
FROM companies c
LEFT JOIN company_members cm ON cm.company_id = c.id AND cm.role = 'owner'
GROUP BY c.id, c.name
HAVING COUNT(cm.id) = 0 OR COUNT(cm.id) > 1
ORDER BY owner_count;


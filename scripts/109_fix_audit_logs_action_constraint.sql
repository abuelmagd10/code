-- =============================================
-- إصلاح CHECK constraint في audit_logs.action
-- لإضافة جميع القيم المستخدمة في الكود
-- =============================================

-- إزالة CHECK constraint القديم
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;

-- إضافة CHECK constraint جديد يشمل جميع القيم المستخدمة
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_check CHECK (
  action IN (
    -- القيم الأساسية (CRUD)
    'INSERT',
    'UPDATE',
    'DELETE',
    'REVERT',
    
    -- قيم الصلاحيات والحوكمة
    'PERMISSIONS',
    'invite_sent',
    'invite_accepted',
    'active_company_set',
    
    -- قيم الموظفين
    'employee_added',
    'employee_updated',
    'employee_deleted',
    
    -- قيم المرتبات
    'payroll_paid',
    'payslip_updated',
    'payslip_deleted',
    
    -- قيم الإهلاك
    'depreciation_auto_post',
    
    -- قيم المكافآت
    'bonus_calculated',
    'bonus_settings_updated',
    'bonus_reversed',
    'bonuses_attached_to_payroll',
    
    -- قيم النسخ الاحتياطي
    'backup_export',
    'backup_restore_failed',
    
    -- قيم أخرى
    'init_missing_tables',
    'customer_address_updated'
  )
);

-- =============================================
-- ✅ تم تحديث CHECK constraint بنجاح
-- =============================================

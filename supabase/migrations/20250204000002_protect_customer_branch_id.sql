-- ============================================
-- 🔐 حماية branch_id للعملاء
-- ============================================
-- هذا الـ Trigger يمنع تغيير branch_id بعد الإنشاء
-- إلا للأدوار المصرح لها (owner, admin, general_manager)
-- ============================================

-- 1️⃣ إنشاء دالة التحقق من صلاحية تغيير branch_id
CREATE OR REPLACE FUNCTION protect_customer_branch_id()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
  allowed_roles TEXT[] := ARRAY['owner', 'admin', 'general_manager', 'gm', 'super_admin', 'superadmin', 'generalmanager'];
BEGIN
  -- السماح بالإدخال الجديد (INSERT)
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- التحقق من تغيير branch_id
  IF TG_OP = 'UPDATE' THEN
    -- إذا لم يتغير branch_id، نسمح بالتحديث
    IF OLD.branch_id IS NOT DISTINCT FROM NEW.branch_id THEN
      RETURN NEW;
    END IF;

    -- جلب دور المستخدم الحالي
    SELECT role INTO user_role
    FROM company_members
    WHERE user_id = auth.uid()
      AND company_id = NEW.company_id
    LIMIT 1;

    -- تطبيع الدور
    user_role := LOWER(TRIM(REPLACE(COALESCE(user_role, 'staff'), ' ', '_')));

    -- التحقق من الصلاحية
    IF user_role = ANY(allowed_roles) THEN
      -- 🔐 تسجيل التغيير في Audit Log
      INSERT INTO audit_logs (
        company_id,
        user_id,
        action,
        entity_type,
        entity_id,
        old_values,
        new_values,
        metadata
      ) VALUES (
        NEW.company_id,
        auth.uid(),
        'customer_branch_changed_by_trigger',
        'customer',
        NEW.id,
        jsonb_build_object('branch_id', OLD.branch_id, 'customer_name', OLD.name),
        jsonb_build_object('branch_id', NEW.branch_id, 'customer_name', NEW.name),
        jsonb_build_object(
          'changed_by_role', user_role,
          'changed_at', NOW(),
          'trigger_name', 'protect_customer_branch_id'
        )
      );
      
      RETURN NEW;
    ELSE
      -- 🚫 رفض التغيير للمستخدمين غير المصرح لهم
      RAISE EXCEPTION 'GOVERNANCE_VIOLATION: Cannot change customer branch_id. Only Owner or General Manager can modify branch assignment. Your role: %', user_role;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2️⃣ إنشاء الـ Trigger
DROP TRIGGER IF EXISTS trigger_protect_customer_branch_id ON customers;

CREATE TRIGGER trigger_protect_customer_branch_id
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION protect_customer_branch_id();

-- 3️⃣ إضافة تعليق توضيحي
COMMENT ON FUNCTION protect_customer_branch_id() IS 
'🔐 ERP Governance: Protects customer branch_id from unauthorized changes.
Only owner, admin, and general_manager roles can modify branch assignment.
All changes are logged to audit_logs table.';

COMMENT ON TRIGGER trigger_protect_customer_branch_id ON customers IS
'🔐 ERP Governance Trigger: Enforces branch_id immutability for customers.
Prevents unauthorized branch reassignment after customer creation.';

-- ============================================
-- ✅ تم إنشاء الحماية بنجاح
-- ============================================

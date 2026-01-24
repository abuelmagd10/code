-- =============================================
-- Script: 108_user_security_events_system.sql
-- Purpose: نظام بث أحداث تغيير السياق الأمني (ERP Grade - لحظي 100%)
-- 🎯 القناة الرسمية لإعلام جلسة المستخدم أن صلاحياته تغيرت
-- =============================================

-- =====================================
-- 1️⃣ إنشاء جدول user_security_events
-- =====================================

CREATE TABLE IF NOT EXISTS user_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('role_changed', 'branch_changed', 'access_changed', 'allowed_branches_changed')),
  event_data JSONB DEFAULT '{}'::jsonb, -- بيانات إضافية عن الحدث
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ, -- وقت معالجة الحدث (للتنظيف لاحقاً)
  
  -- Indexes
  CONSTRAINT user_security_events_user_company_key UNIQUE (user_id, company_id, event_type, created_at)
);

-- =====================================
-- 2️⃣ Indexes للأداء
-- =====================================

CREATE INDEX IF NOT EXISTS idx_user_security_events_user_id ON user_security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_security_events_company_id ON user_security_events(company_id);
CREATE INDEX IF NOT EXISTS idx_user_security_events_event_type ON user_security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_user_security_events_created_at ON user_security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_security_events_unprocessed ON user_security_events(user_id, company_id, created_at DESC) WHERE processed_at IS NULL;

-- =====================================
-- 3️⃣ RLS Policies
-- =====================================

ALTER TABLE user_security_events ENABLE ROW LEVEL SECURITY;

-- ✅ حذف الـ Policies القديمة إن وجدت (للتطبيق الآمن)
DROP POLICY IF EXISTS "Users can read their own security events" ON user_security_events;
DROP POLICY IF EXISTS "Owners and admins can read all events in their company" ON user_security_events;

-- ✅ Policy: المستخدم يستطيع قراءة أحداثه فقط
CREATE POLICY "Users can read their own security events"
  ON user_security_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- ✅ Policy: Owner/Admin يستطيعون قراءة جميع الأحداث في شركتهم
CREATE POLICY "Owners and admins can read all events in their company"
  ON user_security_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM company_members cm
      WHERE cm.company_id = user_security_events.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

-- ✅ Policy: فقط النظام (service role) يستطيع إدراج الأحداث
-- ✅ هذا يمنع المستخدمين من إنشاء أحداث يدوياً
-- ✅ الأحداث يتم إنشاؤها فقط عبر Triggers

-- =====================================
-- 4️⃣ Function لإدراج حدث أمني
-- =====================================

CREATE OR REPLACE FUNCTION insert_user_security_event(
  p_user_id UUID,
  p_company_id UUID,
  p_event_type TEXT,
  p_event_data JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- ✅ إدراج الحدث
  INSERT INTO user_security_events (
    user_id,
    company_id,
    event_type,
    event_data,
    created_at
  )
  VALUES (
    p_user_id,
    p_company_id,
    p_event_type,
    p_event_data,
    NOW()
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

-- =====================================
-- 5️⃣ Trigger: عند تغيير role في company_members
-- =====================================

CREATE OR REPLACE FUNCTION trigger_user_security_event_role_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- ✅ فقط إذا تغير role فعلياً
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- ✅ إدراج حدث role_changed
    PERFORM insert_user_security_event(
      NEW.user_id,
      NEW.company_id,
      'role_changed',
      jsonb_build_object(
        'old_role', OLD.role,
        'new_role', NEW.role,
        'changed_by', auth.uid(),
        'changed_at', NOW()
      )
    );
    
    -- ✅ أيضاً إدراج حدث access_changed (لأن تغيير role يؤثر على الصلاحيات)
    PERFORM insert_user_security_event(
      NEW.user_id,
      NEW.company_id,
      'access_changed',
      jsonb_build_object(
        'reason', 'role_changed',
        'old_role', OLD.role,
        'new_role', NEW.role,
        'changed_by', auth.uid(),
        'changed_at', NOW()
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- ✅ حذف الـ Trigger القديم إن وجد (للتطبيق الآمن)
DROP TRIGGER IF EXISTS trigger_company_members_role_changed ON company_members;

CREATE TRIGGER trigger_company_members_role_changed
  AFTER UPDATE ON company_members
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION trigger_user_security_event_role_changed();

-- =====================================
-- 6️⃣ Trigger: عند تغيير branch_id في company_members
-- =====================================

CREATE OR REPLACE FUNCTION trigger_user_security_event_branch_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- ✅ فقط إذا تغير branch_id فعلياً
  IF OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
    -- ✅ إدراج حدث branch_changed
    PERFORM insert_user_security_event(
      NEW.user_id,
      NEW.company_id,
      'branch_changed',
      jsonb_build_object(
        'old_branch_id', OLD.branch_id,
        'new_branch_id', NEW.branch_id,
        'changed_by', auth.uid(),
        'changed_at', NOW()
      )
    );
    
    -- ✅ أيضاً إدراج حدث access_changed (لأن تغيير branch يؤثر على الصلاحيات)
    PERFORM insert_user_security_event(
      NEW.user_id,
      NEW.company_id,
      'access_changed',
      jsonb_build_object(
        'reason', 'branch_changed',
        'old_branch_id', OLD.branch_id,
        'new_branch_id', NEW.branch_id,
        'changed_by', auth.uid(),
        'changed_at', NOW()
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- ✅ حذف الـ Trigger القديم إن وجد (للتطبيق الآمن)
DROP TRIGGER IF EXISTS trigger_company_members_branch_changed ON company_members;

CREATE TRIGGER trigger_company_members_branch_changed
  AFTER UPDATE ON company_members
  FOR EACH ROW
  WHEN (OLD.branch_id IS DISTINCT FROM NEW.branch_id)
  EXECUTE FUNCTION trigger_user_security_event_branch_changed();

-- =====================================
-- 7️⃣ Trigger: عند تغيير user_branch_access
-- =====================================

CREATE OR REPLACE FUNCTION trigger_user_security_event_allowed_branches_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- ✅ عند INSERT: إدراج حدث allowed_branches_changed
  IF TG_OP = 'INSERT' THEN
    PERFORM insert_user_security_event(
      NEW.user_id,
      NEW.company_id,
      'allowed_branches_changed',
      jsonb_build_object(
        'action', 'added',
        'branch_id', NEW.branch_id,
        'is_active', NEW.is_active,
        'changed_by', auth.uid(),
        'changed_at', NOW()
      )
    );
    
    -- ✅ أيضاً إدراج حدث access_changed
    PERFORM insert_user_security_event(
      NEW.user_id,
      NEW.company_id,
      'access_changed',
      jsonb_build_object(
        'reason', 'allowed_branches_changed',
        'action', 'added',
        'branch_id', NEW.branch_id,
        'changed_by', auth.uid(),
        'changed_at', NOW()
      )
    );
    
    RETURN NEW;
  END IF;
  
  -- ✅ عند UPDATE: فقط إذا تغير is_active أو branch_id
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.is_active IS DISTINCT FROM NEW.is_active) OR (OLD.branch_id IS DISTINCT FROM NEW.branch_id) THEN
      PERFORM insert_user_security_event(
        NEW.user_id,
        NEW.company_id,
        'allowed_branches_changed',
        jsonb_build_object(
          'action', 'updated',
          'old_branch_id', OLD.branch_id,
          'new_branch_id', NEW.branch_id,
          'old_is_active', OLD.is_active,
          'new_is_active', NEW.is_active,
          'changed_by', auth.uid(),
          'changed_at', NOW()
        )
      );
      
      -- ✅ أيضاً إدراج حدث access_changed
      PERFORM insert_user_security_event(
        NEW.user_id,
        NEW.company_id,
        'access_changed',
        jsonb_build_object(
          'reason', 'allowed_branches_changed',
          'action', 'updated',
          'branch_id', NEW.branch_id,
          'changed_by', auth.uid(),
          'changed_at', NOW()
        )
      );
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- ✅ عند DELETE: إدراج حدث allowed_branches_changed
  IF TG_OP = 'DELETE' THEN
    PERFORM insert_user_security_event(
      OLD.user_id,
      OLD.company_id,
      'allowed_branches_changed',
      jsonb_build_object(
        'action', 'removed',
        'branch_id', OLD.branch_id,
        'changed_by', auth.uid(),
        'changed_at', NOW()
      )
    );
    
    -- ✅ أيضاً إدراج حدث access_changed
    PERFORM insert_user_security_event(
      OLD.user_id,
      OLD.company_id,
      'access_changed',
      jsonb_build_object(
        'reason', 'allowed_branches_changed',
        'action', 'removed',
        'branch_id', OLD.branch_id,
        'changed_by', auth.uid(),
        'changed_at', NOW()
      )
    );
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- ✅ حذف الـ Trigger القديم إن وجد (للتطبيق الآمن)
DROP TRIGGER IF EXISTS trigger_user_branch_access_changed ON user_branch_access;

CREATE TRIGGER trigger_user_branch_access_changed
  AFTER INSERT OR UPDATE OR DELETE ON user_branch_access
  FOR EACH ROW
  EXECUTE FUNCTION trigger_user_security_event_allowed_branches_changed();

-- =====================================
-- 8️⃣ Trigger: عند تغيير company_role_permissions (يؤثر على access_changed)
-- =====================================

CREATE OR REPLACE FUNCTION trigger_user_security_event_permissions_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_affected_users UUID[];
BEGIN
  -- ✅ جلب جميع المستخدمين الذين لديهم هذا الدور في هذه الشركة
  SELECT ARRAY_AGG(user_id)
  INTO v_affected_users
  FROM company_members
  WHERE company_id = COALESCE(NEW.company_id, OLD.company_id)
    AND role = COALESCE(NEW.role, OLD.role);
  
  -- ✅ إدراج حدث access_changed لكل مستخدم متأثر
  IF v_affected_users IS NOT NULL THEN
    FOR i IN 1..array_length(v_affected_users, 1) LOOP
      PERFORM insert_user_security_event(
        v_affected_users[i],
        COALESCE(NEW.company_id, OLD.company_id),
        'access_changed',
        jsonb_build_object(
          'reason', 'role_permissions_changed',
          'role', COALESCE(NEW.role, OLD.role),
          'resource', COALESCE(NEW.resource, OLD.resource),
          'changed_by', auth.uid(),
          'changed_at', NOW()
        )
      );
    END LOOP;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trigger_company_role_permissions_changed
  AFTER INSERT OR UPDATE OR DELETE ON company_role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_user_security_event_permissions_changed();

-- =====================================
-- 9️⃣ Function لتنظيف الأحداث القديمة (اختياري)
-- =====================================

CREATE OR REPLACE FUNCTION cleanup_old_security_events(days_to_keep INTEGER DEFAULT 7)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- ✅ حذف الأحداث الأقدم من days_to_keep أيام
  DELETE FROM user_security_events
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$;

-- =====================================
-- 🔟 تفعيل Realtime Replication
-- =====================================

-- ✅ تفعيل Realtime Replication لجدول user_security_events
ALTER PUBLICATION supabase_realtime ADD TABLE user_security_events;

-- =====================================
-- ✅ تم إنشاء نظام user_security_events بنجاح
-- =====================================
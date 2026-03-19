-- ==============================================================================
-- 062: Batch Notification Status Update
-- الوصف: دوال مجمعة لتحديث حالة الإشعارات لتحسين الأداء (Batch API)
-- ==============================================================================

-- 1. تحديثات متعددة لحالة "مقروء"
CREATE OR REPLACE FUNCTION public.batch_mark_notifications_as_read(
  p_notification_ids uuid[],
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- إدراج حالة جديدة أو تحديث الحالة الحالية للمستخدم
  INSERT INTO notification_user_states (notification_id, user_id, status, read_at, updated_at)
  SELECT 
    unnest(p_notification_ids), 
    p_user_id, 
    'read', 
    NOW(), 
    NOW()
  ON CONFLICT (notification_id, user_id)
  DO UPDATE SET 
    status = CASE WHEN notification_user_states.status = 'unread' THEN 'read' ELSE notification_user_states.status END,
    read_at = COALESCE(notification_user_states.read_at, NOW()),
    updated_at = NOW();

  RETURN TRUE;
END;
$function$;

-- 2. تحديثات متعددة لحالة مخصصة (أرشيف، تنفيذ، الخ)
CREATE OR REPLACE FUNCTION public.batch_update_notification_status(
  p_notification_ids uuid[],
  p_status character varying,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- إدراج حالة جديدة أو تحديث الحالة الحالية للمستخدم
  INSERT INTO notification_user_states (notification_id, user_id, status, read_at, actioned_at, updated_at)
  SELECT 
    unnest(p_notification_ids), 
    p_user_id, 
    p_status,
    CASE WHEN p_status IN ('read', 'archived', 'actioned') THEN NOW() ELSE NULL END,
    CASE WHEN p_status = 'actioned' THEN NOW() ELSE NULL END,
    NOW()
  ON CONFLICT (notification_id, user_id)
  DO UPDATE SET 
    status = p_status,
    read_at = CASE WHEN p_status IN ('read', 'archived', 'actioned') THEN COALESCE(notification_user_states.read_at, NOW()) ELSE notification_user_states.read_at END,
    actioned_at = CASE WHEN p_status = 'actioned' THEN COALESCE(notification_user_states.actioned_at, NOW()) ELSE notification_user_states.actioned_at END,
    updated_at = NOW();

  RETURN TRUE;
END;
$function$;

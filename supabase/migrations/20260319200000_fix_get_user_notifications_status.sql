-- ==============================================================================
-- 063: Fix get_user_notifications Status Read
-- الوصف: دمج حالة الإشعار من جدول notification_user_states بدلاً من الجدول الأساسي
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_user_notifications(
  p_user_id uuid,
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_warehouse_id uuid DEFAULT NULL::uuid,
  p_status character varying DEFAULT NULL::character varying,
  p_severity character varying DEFAULT NULL::character varying,
  p_category character varying DEFAULT NULL::character varying,
  p_search_query text DEFAULT NULL::text,
  p_priority character varying DEFAULT NULL::character varying,
  p_reference_type character varying DEFAULT NULL::character varying
)
 RETURNS TABLE(
  id uuid, 
  reference_type character varying, 
  reference_id uuid, 
  title character varying, 
  message text, 
  priority character varying, 
  status character varying, 
  created_at timestamp with time zone, 
  branch_name character varying, 
  warehouse_name character varying, 
  severity character varying, 
  category character varying, 
  event_key text, 
  branch_id uuid, 
  warehouse_id uuid, 
  assigned_to_user uuid, 
  assigned_to_role character varying
)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_role VARCHAR(50);
BEGIN
  -- Get user role
  SELECT cm.role INTO v_user_role
  FROM company_members cm
  WHERE cm.user_id = p_user_id
    AND cm.company_id = p_company_id
  LIMIT 1;

  RETURN QUERY
  SELECT
    n.id,
    n.reference_type,
    n.reference_id,
    n.title,
    n.message,
    n.priority,
    COALESCE(nus.status, n.status, 'unread')::VARCHAR AS status,
    n.created_at,
    b.name::VARCHAR(255) AS branch_name,
    w.name::VARCHAR(255) AS warehouse_name,
    COALESCE(n.severity, 'info')::VARCHAR AS severity,
    COALESCE(n.category, 'system')::VARCHAR AS category,
    n.event_key::TEXT,
    n.branch_id,
    n.warehouse_id,
    n.assigned_to_user,
    n.assigned_to_role
  FROM notifications n
  LEFT JOIN branches b ON (n.branch_id = b.id AND b.company_id = p_company_id)
  LEFT JOIN warehouses w ON (n.warehouse_id = w.id AND w.company_id = p_company_id)
  LEFT JOIN notification_user_states nus ON (n.id = nus.notification_id AND nus.user_id = p_user_id)
  WHERE n.company_id = p_company_id
    -- Baseline Role/User Access Check
    AND (
      n.assigned_to_user = p_user_id
      OR (
        n.assigned_to_user IS NULL
        AND (
          n.assigned_to_role = v_user_role
          OR n.assigned_to_role IS NULL
          OR v_user_role IN ('owner', 'admin', 'general_manager')
        )
      )
    )
    -- Bypass branch/warehouse filters if user is top management
    AND (
      v_user_role IN ('owner', 'admin', 'general_manager')
      OR (p_branch_id IS NULL OR n.branch_id = p_branch_id OR n.branch_id IS NULL)
    )
    AND (
      v_user_role IN ('owner', 'admin', 'general_manager')
      OR (p_warehouse_id IS NULL OR n.warehouse_id = p_warehouse_id OR n.warehouse_id IS NULL)
    )
    -- Status Filter: استخدام دمج الحالات للتأكد من حالة الإشعار
    AND (
      (p_status IS NULL AND COALESCE(nus.status, n.status, 'unread') != 'archived')
      OR (p_status IS NOT NULL AND COALESCE(nus.status, n.status, 'unread') = p_status)
    )
    -- Additional Metadata Filters
    AND (p_severity IS NULL OR COALESCE(n.severity, 'info') = p_severity)
    AND (p_category IS NULL OR COALESCE(n.category, 'system') = p_category)
    AND (p_priority IS NULL OR n.priority = p_priority)
    AND (p_reference_type IS NULL OR n.reference_type = p_reference_type)
    -- Text Search Filter (title, message, reference_id)
    AND (
      p_search_query IS NULL 
      OR p_search_query = ''
      OR n.title ILIKE '%' || p_search_query || '%'
      OR n.message ILIKE '%' || p_search_query || '%'
      OR n.reference_id::text ILIKE '%' || p_search_query || '%'
    )
    -- Expiration Check
    AND (n.expires_at IS NULL OR n.expires_at > NOW())
  ORDER BY
    CASE n.priority
      WHEN 'urgent' THEN 1
      WHEN 'high' THEN 2
      WHEN 'normal' THEN 3
      WHEN 'low' THEN 4
    END,
    n.created_at DESC;
END;
$function$;

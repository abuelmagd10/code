-- Fix get_user_notifications and get_unread_notification_count
-- To include 'general_manager' in the top-level roles that can view 'admin' notifications

CREATE OR REPLACE FUNCTION public.get_user_notifications(p_user_id uuid, p_company_id uuid, p_branch_id uuid DEFAULT NULL::uuid, p_warehouse_id uuid DEFAULT NULL::uuid, p_status character varying DEFAULT NULL::character varying, p_severity character varying DEFAULT NULL::character varying, p_category character varying DEFAULT NULL::character varying)
 RETURNS TABLE(id uuid, reference_type character varying, reference_id uuid, title character varying, message text, priority character varying, status character varying, created_at timestamp with time zone, branch_name character varying, warehouse_name character varying, severity text, category text, event_key character varying)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_role VARCHAR(50);
BEGIN
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
    n.status,
    n.created_at,
    b.name::VARCHAR(255) AS branch_name,
    w.name::VARCHAR(255) AS warehouse_name,
    COALESCE(n.severity, 'info')::TEXT AS severity,
    COALESCE(n.category, 'system')::TEXT AS category,
    n.event_key
  FROM notifications n
  LEFT JOIN branches b ON (n.branch_id = b.id AND b.company_id = p_company_id)
  LEFT JOIN warehouses w ON (n.warehouse_id = w.id AND w.company_id = p_company_id)
  WHERE n.company_id = p_company_id
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
    AND (p_branch_id IS NULL OR n.branch_id = p_branch_id OR n.branch_id IS NULL)
    AND (p_warehouse_id IS NULL OR n.warehouse_id = p_warehouse_id OR n.warehouse_id IS NULL)
    AND (
      (p_status IS NULL AND n.status != 'archived')
      OR (p_status IS NOT NULL AND n.status = p_status)
    )
    AND (p_severity IS NULL OR COALESCE(n.severity, 'info') = p_severity)
    AND (p_category IS NULL OR COALESCE(n.category, 'system') = p_category)
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

CREATE OR REPLACE FUNCTION public.get_unread_notification_count(p_user_id uuid, p_company_id uuid, p_branch_id uuid DEFAULT NULL::uuid, p_warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_role VARCHAR(50);
  v_count INTEGER;
BEGIN
  -- Get user role
  SELECT cm.role INTO v_user_role
  FROM company_members cm
  WHERE cm.user_id = p_user_id
    AND cm.company_id = p_company_id
  LIMIT 1;

  -- Count unread notifications
  SELECT COUNT(*) INTO v_count
  FROM notifications n
  WHERE n.company_id = p_company_id
    AND n.status = 'unread'
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
    AND (p_branch_id IS NULL OR n.branch_id = p_branch_id OR n.branch_id IS NULL)
    AND (p_warehouse_id IS NULL OR n.warehouse_id = p_warehouse_id OR n.warehouse_id IS NULL)
    AND (n.expires_at IS NULL OR n.expires_at > NOW());

  RETURN COALESCE(v_count, 0);
END;
$function$;

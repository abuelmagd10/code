-- Fix get_user_notifications to bypass branch and warehouse restrictions for owners, admins, and general_managers
-- This ensures that higher management receives notifications (like rejections) across all branches.

DROP FUNCTION IF EXISTS public.get_user_notifications(uuid, uuid, uuid, uuid, character varying, character varying, character varying);

CREATE OR REPLACE FUNCTION public.get_user_notifications(
  p_user_id uuid, 
  p_company_id uuid, 
  p_branch_id uuid DEFAULT NULL::uuid, 
  p_warehouse_id uuid DEFAULT NULL::uuid, 
  p_status character varying DEFAULT NULL::character varying, 
  p_severity character varying DEFAULT NULL::character varying, 
  p_category character varying DEFAULT NULL::character varying
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
  event_key text
)
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
    COALESCE(n.severity, 'info')::VARCHAR AS severity,
    COALESCE(n.category, 'system')::VARCHAR AS category,
    n.event_key::TEXT
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
    -- ✅ Bypass branch/warehouse filters if user is owner, admin, or general manager
    AND (
      v_user_role IN ('owner', 'admin', 'general_manager')
      OR (p_branch_id IS NULL OR n.branch_id = p_branch_id OR n.branch_id IS NULL)
    )
    AND (
      v_user_role IN ('owner', 'admin', 'general_manager')
      OR (p_warehouse_id IS NULL OR n.warehouse_id = p_warehouse_id OR n.warehouse_id IS NULL)
    )
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

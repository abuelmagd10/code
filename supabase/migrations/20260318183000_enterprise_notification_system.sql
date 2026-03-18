-- Enterprise Notification System: Deep Governance & Filtering
-- 1. Enable RLS on notifications table to prevent real-time data bleed
-- 2. Update get_user_notifications RPC to handle search and priority filtering server-side

-- ==========================================
-- Part 1: Strict RLS on notifications table
-- ==========================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view their notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

-- Policy 1: Read Access
-- A user can see the notification ONLY IF:
-- a) It's explicitly assigned to them (assigned_to_user)
-- b) It's assigned to their role (assigned_to_role) AND they match the branch/warehouse conditions.
-- c) They are in top-level management (owner, admin, general_manager) - they see everything in their company.
CREATE POLICY "Users can view their notifications" ON public.notifications
FOR SELECT
USING (
  company_id IN (
    SELECT cm.company_id 
    FROM company_members cm 
    WHERE cm.user_id = auth.uid()
  )
  AND (
    assigned_to_user = auth.uid()
    OR 
    EXISTS (
      SELECT 1 FROM company_members cm 
      WHERE cm.user_id = auth.uid() 
      AND cm.company_id = notifications.company_id
      AND (
        -- Top management sees everything within the company
        cm.role IN ('owner', 'admin', 'general_manager')
        OR
        (
          (assigned_to_role IS NULL OR assigned_to_role = cm.role)
          AND (branch_id IS NULL OR branch_id = cm.branch_id)
          AND (warehouse_id IS NULL OR warehouse_id = cm.warehouse_id)
        )
      )
    )
  )
);

-- Policy 2: Update Access
-- A user can update (mark as read/actioned) ONLY their own notifications.
CREATE POLICY "Users can update their notifications" ON public.notifications
FOR UPDATE
USING (
  company_id IN (
    SELECT cm.company_id 
    FROM company_members cm 
    WHERE cm.user_id = auth.uid()
  )
  AND (
    assigned_to_user = auth.uid()
    OR 
    EXISTS (
      SELECT 1 FROM company_members cm 
      WHERE cm.user_id = auth.uid() 
      AND cm.company_id = notifications.company_id
      AND (
        cm.role IN ('owner', 'admin', 'general_manager')
        OR
        (
          (assigned_to_role IS NULL OR assigned_to_role = cm.role)
          AND (branch_id IS NULL OR branch_id = cm.branch_id)
          AND (warehouse_id IS NULL OR warehouse_id = cm.warehouse_id)
        )
      )
    )
  )
);

-- Policy 3: Insert Access (Usually bypasses RLS if done via SECURITY DEFINER functions, but good practice)
CREATE POLICY "System can insert notifications" ON public.notifications
FOR INSERT
WITH CHECK (
  company_id IN (
    SELECT cm.company_id 
    FROM company_members cm 
    WHERE cm.user_id = auth.uid()
  )
);

-- ==========================================
-- Part 2: Update get_user_notifications RPC
-- ==========================================
-- We expand the parameter list to accept p_search_query and p_priority for server-side filtering.

DROP FUNCTION IF EXISTS public.get_user_notifications(uuid, uuid, uuid, uuid, character varying, character varying, character varying);
DROP FUNCTION IF EXISTS public.get_user_notifications(uuid, uuid, uuid, uuid, character varying, character varying, character varying, text, character varying);

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
  branch_id uuid,          -- Added to return list so frontend knows
  warehouse_id uuid,       -- Added to return list so frontend knows
  assigned_to_user uuid,   -- Added for frontend validation rules
  assigned_to_role character varying -- Added for frontend validation rules
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
    n.status,
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
    -- Status Filter
    AND (
      (p_status IS NULL AND n.status != 'archived')
      OR (p_status IS NOT NULL AND n.status = p_status)
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

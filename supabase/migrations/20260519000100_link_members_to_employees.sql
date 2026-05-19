-- ============================================================
-- Link company members to employees
-- Enterprise pattern: member → employee for unified identity
-- When linked, user_profiles.display_name syncs to employee.full_name
-- ============================================================

ALTER TABLE public.company_members
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_company_members_employee_id
  ON public.company_members (employee_id)
  WHERE employee_id IS NOT NULL;

-- Auto-link members that share the same user_id with an employee
DO $$
DECLARE
  v_member RECORD;
BEGIN
  FOR v_member IN
    SELECT cm.id AS member_id, cm.user_id, cm.company_id, e.id AS emp_id, e.full_name
    FROM public.company_members cm
    JOIN public.employees e ON e.user_id = cm.user_id AND e.company_id = cm.company_id
    WHERE cm.employee_id IS NULL
      AND e.user_id IS NOT NULL
  LOOP
    -- Link member to employee
    UPDATE public.company_members
    SET employee_id = v_member.emp_id
    WHERE id = v_member.member_id;

    -- Sync display_name to employee name
    UPDATE public.user_profiles
    SET display_name = v_member.full_name,
        updated_at = NOW()
    WHERE user_id = v_member.user_id
      AND (display_name IS NULL OR display_name = '' OR display_name != v_member.full_name);

    RAISE NOTICE 'Auto-linked member % to employee % (%)', v_member.member_id, v_member.emp_id, v_member.full_name;
  END LOOP;
END;
$$;

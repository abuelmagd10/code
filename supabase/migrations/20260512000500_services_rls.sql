-- ==============================================================================
-- Services & Booking Module — Phase 1 / B5
-- Purpose:
--   Row Level Security for services tables.
-- Pattern:
--   company_id IN (get_user_company_ids()) AND can_access_record_branch(company_id, branch_id)
--   Child tables additionally validate parent linkage via EXISTS.
-- ==============================================================================

ALTER TABLE public.services          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_staff     ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 1) services policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "services_select" ON public.services;
DROP POLICY IF EXISTS "services_insert" ON public.services;
DROP POLICY IF EXISTS "services_update" ON public.services;
DROP POLICY IF EXISTS "services_delete" ON public.services;

CREATE POLICY "services_select" ON public.services FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "services_insert" ON public.services FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "services_update" ON public.services FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "services_delete" ON public.services FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

-- ------------------------------------------------------------------------------
-- 2) service_schedules policies (child of services)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_schedules_select" ON public.service_schedules;
DROP POLICY IF EXISTS "service_schedules_insert" ON public.service_schedules;
DROP POLICY IF EXISTS "service_schedules_update" ON public.service_schedules;
DROP POLICY IF EXISTS "service_schedules_delete" ON public.service_schedules;

CREATE POLICY "service_schedules_select" ON public.service_schedules FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1 FROM public.services s
       WHERE s.id = service_schedules.service_id
         AND s.company_id = service_schedules.company_id
         AND s.branch_id  = service_schedules.branch_id
    )
  );

CREATE POLICY "service_schedules_insert" ON public.service_schedules FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1 FROM public.services s
       WHERE s.id = service_schedules.service_id
         AND s.company_id = service_schedules.company_id
         AND s.branch_id  = service_schedules.branch_id
    )
  );

CREATE POLICY "service_schedules_update" ON public.service_schedules FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "service_schedules_delete" ON public.service_schedules FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

-- ------------------------------------------------------------------------------
-- 3) service_staff policies (child of services)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_staff_select" ON public.service_staff;
DROP POLICY IF EXISTS "service_staff_insert" ON public.service_staff;
DROP POLICY IF EXISTS "service_staff_update" ON public.service_staff;
DROP POLICY IF EXISTS "service_staff_delete" ON public.service_staff;

CREATE POLICY "service_staff_select" ON public.service_staff FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1 FROM public.services s
       WHERE s.id = service_staff.service_id
         AND s.company_id = service_staff.company_id
         AND s.branch_id  = service_staff.branch_id
    )
  );

CREATE POLICY "service_staff_insert" ON public.service_staff FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "service_staff_update" ON public.service_staff FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "service_staff_delete" ON public.service_staff FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

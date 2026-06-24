-- v3.74.324 — Bookings: "current responsible user" column + flexible RLS
--
-- First migration of three (324 → 325 → 326) that turn the existing
-- bookings table into the source of "أوامر الحجز" without moving any
-- data into sales_orders. The booking lifecycle, availability check,
-- schedules and staff tables all stay exactly as they are.
--
-- This file changes only the row-level access rules + adds one
-- audit/reporting column:
--   * staff/booking_officer can now see and edit a booking they did
--     not personally create, IF either (a) they're explicitly assigned
--     to it via staff_user_id, or (b) it has no assigned staff and
--     lives in their own branch (the "open queue" pattern).
--   * current_responsible_user_id is the "who's holding this right now"
--     pointer, populated from staff_user_id at create time and updated
--     to the activator if it was still NULL — wired in v3.74.326.
--
-- Company-wide roles (owner / admin / general_manager) and branch-
-- scope roles (manager) are unchanged.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS current_responsible_user_id UUID;

COMMENT ON COLUMN public.bookings.current_responsible_user_id IS
  'موظف الحجز الحالى: يُملأ عند الإنشاء من staff_user_id لو محدد، أو عند التفعيل من المستخدم اللى ضغط زر التفعيل. يُستخدم فى التقارير وقياس الأداء.';

UPDATE public.bookings
   SET current_responsible_user_id = staff_user_id
 WHERE current_responsible_user_id IS NULL
   AND staff_user_id IS NOT NULL;

DROP POLICY IF EXISTS bookings_select_v4 ON public.bookings;
DROP POLICY IF EXISTS bookings_select_v5 ON public.bookings;

CREATE POLICY bookings_select_v5 ON public.bookings
  FOR SELECT
  USING (
    is_company_member(company_id) AND (
      current_user_resource_visibility(company_id, 'bookings'::text) = 'company'

      OR (
        current_user_resource_visibility(company_id, 'bookings'::text) = 'branch'
        AND (branch_id IS NULL OR branch_id = current_user_branch_id(company_id))
      )

      OR (
        current_user_resource_visibility(company_id, 'bookings'::text) = 'own'
        AND (
          created_by_user_id = auth.uid()
          OR staff_user_id   = auth.uid()
          OR (
            staff_user_id IS NULL
            AND (
              current_user_branch_id(company_id) IS NULL
              OR branch_id = current_user_branch_id(company_id)
            )
          )
        )
      )

      OR has_shared_access(company_id, 'bookings'::text, created_by_user_id)
    )
  );

DROP POLICY IF EXISTS bookings_update     ON public.bookings;
DROP POLICY IF EXISTS bookings_update_v2  ON public.bookings;

CREATE POLICY bookings_update_v2 ON public.bookings
  FOR UPDATE
  USING (
    company_id IN (SELECT get_user_company_ids())
    AND (
      current_user_resource_visibility(company_id, 'bookings'::text) = 'company'

      OR (
        current_user_resource_visibility(company_id, 'bookings'::text) = 'branch'
        AND (branch_id IS NULL OR branch_id = current_user_branch_id(company_id))
      )

      OR (
        current_user_resource_visibility(company_id, 'bookings'::text) = 'own'
        AND (
          created_by_user_id = auth.uid()
          OR staff_user_id   = auth.uid()
          OR (
            staff_user_id IS NULL
            AND (
              current_user_branch_id(company_id) IS NULL
              OR branch_id = current_user_branch_id(company_id)
            )
          )
        )
      )
    )
  );

-- v3.74.688 — Also notify the branch purchasing officer when a MANDATORY
-- booking withdrawal is rejected.
-- ------------------------------------------------------------------
-- The mandatory-rejection escalation (v3.74.683) tells management the booking
-- cannot run without the item ("provide the item or cancel"). Providing the
-- item is procurement's job, so the branch purchasing officer should be
-- notified too. Adds purchasing_officer of the same branch (and central ones
-- with no branch) to the escalation recipients. Idempotent fetch-patch; the
-- full patched body is also captured in supabase/schema/functions.sql.
-- ------------------------------------------------------------------

DO $do$
DECLARE d text;
BEGIN
  IF (SELECT pg_get_functiondef('public.decide_booking_stock_withdrawal'::regproc)) NOT ILIKE '%purchasing_officer%' THEN
    SELECT pg_get_functiondef('public.decide_booking_stock_withdrawal'::regproc) INTO d;
    d := replace(d,
      $a$         WHERE company_id = v_w.company_id AND role = 'manager' AND branch_id = v_w.branch_id
      ) x$a$,
      $a$         WHERE company_id = v_w.company_id AND role = 'manager' AND branch_id = v_w.branch_id
        UNION
        SELECT user_id FROM public.company_members
         WHERE company_id = v_w.company_id AND role = 'purchasing_officer' AND (branch_id = v_w.branch_id OR branch_id IS NULL)
      ) x$a$);
    EXECUTE d;
  END IF;
END $do$;

-- v3.74.384 — Auto-sync employees.user_id with company_members.employee_id.
--
-- Background
--   The repo has TWO places that record the user-employee linkage:
--     1. company_members.employee_id  (current source of truth, set
--        by the "ربط مستخدم بموظف" UI on /settings/users)
--     2. employees.user_id            (legacy column that several DB
--        functions still depend on — commission RPCs and the biometric
--        attendance RLS policy)
--
--   When the linkage is changed via the UI, only (1) is updated, so
--   (2) drifts and starts pointing at the wrong user. The commission
--   engine then attributes invoices to the wrong employee, and the
--   attendance RLS policy lets one employee see another employee's
--   biometric logs.
--
-- Fix strategy
--   Make (2) a derived value that always mirrors (1). A trigger on
--   company_members keeps the two in sync after every insert / update
--   / delete that touches employee_id. Application code never needs
--   to write to employees.user_id; the trigger takes care of it.
--
--   We also do a one-shot sync of the existing data so every company
--   on the DB lands in a consistent state immediately, not just the
--   ones that get touched after deploy.

-- ── 1. Trigger function ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_employee_user_id_from_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- On DELETE: the member row is going away, so any employee that
  -- WAS pointing at this member should have their user_id nulled.
  IF TG_OP = 'DELETE' THEN
    IF OLD.employee_id IS NOT NULL THEN
      UPDATE public.employees
         SET user_id = NULL
       WHERE id = OLD.employee_id
         AND user_id = OLD.user_id;
    END IF;
    RETURN OLD;
  END IF;

  -- On INSERT / UPDATE: if employee_id is set, copy the user_id over.
  IF NEW.employee_id IS NOT NULL THEN
    UPDATE public.employees
       SET user_id = NEW.user_id
     WHERE id = NEW.employee_id
       AND company_id = NEW.company_id
       AND user_id IS DISTINCT FROM NEW.user_id;
  END IF;

  -- On UPDATE that UNlinks (employee_id was set, now NULL):
  -- nullify the old employee's user_id.
  IF TG_OP = 'UPDATE'
     AND OLD.employee_id IS NOT NULL
     AND (NEW.employee_id IS NULL OR NEW.employee_id <> OLD.employee_id) THEN
    UPDATE public.employees
       SET user_id = NULL
     WHERE id = OLD.employee_id
       AND user_id = OLD.user_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_employee_user_id_from_member() IS
  'v3.74.384 - Mirrors company_members.employee_id <-> employees.user_id so legacy DB functions that still read employees.user_id stay accurate. Never overrides a user_id that already matches.';

-- Three triggers because PostgreSQL doesn't allow combining
-- "UPDATE OF columns" with "OR INSERT/DELETE" in one statement.
DROP TRIGGER IF EXISTS sync_employee_user_id_ins ON public.company_members;
DROP TRIGGER IF EXISTS sync_employee_user_id_upd ON public.company_members;
DROP TRIGGER IF EXISTS sync_employee_user_id_del ON public.company_members;

CREATE TRIGGER sync_employee_user_id_ins
  AFTER INSERT ON public.company_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_employee_user_id_from_member();

CREATE TRIGGER sync_employee_user_id_upd
  AFTER UPDATE OF employee_id, user_id ON public.company_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_employee_user_id_from_member();

CREATE TRIGGER sync_employee_user_id_del
  AFTER DELETE ON public.company_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_employee_user_id_from_member();

-- ── 2. One-shot sync of existing data ──────────────────────────
-- For every employee in every company, set user_id to whichever
-- member is linked to them via company_members.employee_id (or NULL
-- if no member is linked). This brings every company into a
-- consistent state immediately on apply.
WITH desired AS (
  SELECT e.id AS employee_id,
         cm.user_id AS desired_user_id
    FROM public.employees e
    LEFT JOIN public.company_members cm
      ON cm.company_id = e.company_id
     AND cm.employee_id = e.id
)
UPDATE public.employees e
   SET user_id = d.desired_user_id
  FROM desired d
 WHERE e.id = d.employee_id
   AND e.user_id IS DISTINCT FROM d.desired_user_id;

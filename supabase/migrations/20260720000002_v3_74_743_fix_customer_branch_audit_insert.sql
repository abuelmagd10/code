-- v3.74.743 — the owner's right to reassign a customer's branch has never
-- worked. Not restricted, not hard to reach: broken.
--
-- protect_customer_branch_id() checks the role correctly, then writes its audit
-- row listing the columns `entity` and `entity_id`. Both are GENERATED ALWAYS
-- mirrors of target_table and record_id, so PostgreSQL refuses the insert:
--
--     cannot insert a non-DEFAULT value into column "entity"
--
-- The exception aborts the whole UPDATE. Every branch reassignment by an owner
-- has failed since this trigger was written, with an error mentioning neither
-- branches nor permissions.
--
-- Found by simulating the update as the owner instead of assuming the role
-- check was the only obstacle. The role check passed; the audit write killed it.
--
-- The insert also omitted target_table, which is NOT NULL. Writing to the real
-- columns lets the generated ones populate themselves, as intended.
--
-- NOTE on the action value: it must stay exactly
-- 'customer_branch_changed_by_trigger'. audit_logs_action_check enumerates the
-- permitted actions, and a first attempt here shortened it to
-- 'customer_branch_changed' — which swapped one broken insert for another.
-- Identifiers that something else validates against are not free to tidy.
--
-- Verified by running all three paths as real users:
--   owner changing branch      → allowed, audit row written (entity=customers)
--   staff changing branch      → GOVERNANCE_VIOLATION
--   no actual change to branch → early return, untouched
CREATE OR REPLACE FUNCTION public.protect_customer_branch_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  user_role     TEXT;
  allowed_roles TEXT[] := ARRAY['owner', 'admin', 'general_manager', 'gm',
                                'super_admin', 'superadmin', 'generalmanager'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.branch_id IS NOT DISTINCT FROM NEW.branch_id THEN
      RETURN NEW;
    END IF;

    SELECT role INTO user_role
    FROM company_members
    WHERE user_id = auth.uid() AND company_id = NEW.company_id
    LIMIT 1;

    user_role := LOWER(TRIM(REPLACE(COALESCE(user_role, 'staff'), ' ', '_')));

    IF user_role = ANY(allowed_roles) THEN
      INSERT INTO audit_logs (
        company_id, user_id, action, target_table, record_id,
        record_identifier, old_data, new_data, metadata
      ) VALUES (
        NEW.company_id,
        auth.uid(),
        'customer_branch_changed_by_trigger',
        'customers',
        NEW.id,
        NEW.name,
        jsonb_build_object('branch_id', OLD.branch_id, 'customer_name', OLD.name),
        jsonb_build_object('branch_id', NEW.branch_id, 'customer_name', NEW.name),
        jsonb_build_object(
          'changed_by_role', user_role,
          'changed_at', NOW(),
          'trigger_name', 'protect_customer_branch_id'
        )
      );

      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'GOVERNANCE_VIOLATION: Cannot change customer branch_id. Only Owner or General Manager can modify branch assignment. Your role: %',
      user_role;
  END IF;

  RETURN NEW;
END;
$function$;

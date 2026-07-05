-- v3.74.531 — Payment approval was throwing 500 because the trigger
-- chain ends at bill_branch_manager_notify_trg calling
-- notify_branch_manager with hardcoded NULL as p_actor_id, which then
-- writes NULL into notifications.created_by (NOT NULL constraint).
--
-- Trigger chain:
--   process_payment_approval_stage  (owner clicks approve)
--     → UPDATE payments SET status='approved'
--       → recalc_bill_on_payment_change AFTER trigger
--         → fn_recalc_bill_paid_status
--           → UPDATE bills SET paid_amount, status
--             → bill_branch_manager_notify_trg AFTER trigger
--               → notify_branch_manager(..., p_actor_id=NULL, ...)
--                 → INSERT notifications (created_by=NULL) — FAILS
--
-- The whole chain rolls back, owner sees "Internal Server Error".
--
-- Fix layered in two places:
--
-- 1. bill_branch_manager_notify_trg: build v_actor with a fallback chain
--      auth.uid()
--      → NEW.last_edited_by_user_id
--      → NEW.created_by_user_id
--      → NEW.created_by
--    Pass v_actor everywhere (INSERT and status-change branches).
--    The INSERT branch was already using COALESCE — status-change was
--    hardcoding NULL, which was the actual bug.
--
-- 2. notify_branch_manager (defence in depth): if p_actor_id arrives
--    NULL from ANY caller, resolve via auth.uid() then fall back to
--    any owner in the same company. If we still can't resolve, skip
--    the notification insert rather than blowing up the caller's
--    transaction — a missing notification is much cheaper than a
--    rolled-back payment approval.
--
-- No API/Node changes; already applied on production DB via MCP.
--
-- Note: the analogous invoice notify trigger (customer/sales side)
-- was NOT touched by this migration. Bill's sibling might have the
-- same latent bug; auditing that is a follow-up.

CREATE OR REPLACE FUNCTION public.bill_branch_manager_notify_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_supplier_name text;
  v_currency text;
  v_actor uuid;
BEGIN
  v_currency := COALESCE(NEW.currency_code, 'EGP');
  BEGIN
    SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = NEW.supplier_id;
  EXCEPTION WHEN OTHERS THEN v_supplier_name := NULL; END;

  v_actor := COALESCE(
    auth.uid(),
    NEW.last_edited_by_user_id,
    NEW.created_by_user_id,
    NEW.created_by
  );

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_branch_manager(
      NEW.company_id, NEW.branch_id,
      'bill', NEW.id, v_actor,
      'نشاط فرعك: تم إنشاء فاتورة مشتريات',
      'تم إنشاء فاتورة ' || NEW.bill_number ||
      CASE WHEN v_supplier_name IS NOT NULL THEN ' من المورد ' || v_supplier_name ELSE '' END ||
      ' بقيمة ' || NEW.total_amount::text || ' ' || v_currency || ' فى فرعك.'
    );
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status IN ('paid', 'partially_paid', 'voided') THEN
    PERFORM public.notify_branch_manager(
      NEW.company_id, NEW.branch_id,
      'bill', NEW.id, v_actor,
      'نشاط فرعك: تغيّرت حالة فاتورة المورد',
      'فاتورة ' || NEW.bill_number ||
      CASE WHEN v_supplier_name IS NOT NULL THEN ' من المورد ' || v_supplier_name ELSE '' END ||
      ' أصبحت الحالة "' || NEW.status || '".'
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_branch_manager(
  p_company_id uuid, p_branch_id uuid, p_reference_type text,
  p_reference_id uuid, p_actor_id uuid,
  p_title text, p_message text,
  p_severity text DEFAULT 'info'::text, p_priority text DEFAULT 'normal'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_manager_id uuid;
  v_actor uuid;
BEGIN
  IF p_branch_id IS NULL THEN RETURN; END IF;

  v_actor := p_actor_id;
  IF v_actor IS NULL THEN v_actor := auth.uid(); END IF;
  IF v_actor IS NULL THEN
    SELECT user_id INTO v_actor
    FROM public.company_members
    WHERE company_id = p_company_id AND role = 'owner' AND user_id IS NOT NULL
    LIMIT 1;
  END IF;
  IF v_actor IS NULL THEN RETURN; END IF;

  FOR v_manager_id IN
    SELECT user_id FROM public.company_members
     WHERE company_id = p_company_id
       AND branch_id  = p_branch_id
       AND role       = 'manager'
       AND user_id    IS NOT NULL
       AND user_id <> v_actor
  LOOP
    INSERT INTO public.notifications (
      company_id, reference_type, reference_id, created_by,
      assigned_to_user, title, message,
      priority, severity, category, channel, created_at
    ) VALUES (
      p_company_id, p_reference_type, p_reference_id, v_actor,
      v_manager_id, p_title, p_message,
      p_priority, p_severity, 'branch_activity', 'in_app', NOW()
    );
  END LOOP;
END;
$function$;

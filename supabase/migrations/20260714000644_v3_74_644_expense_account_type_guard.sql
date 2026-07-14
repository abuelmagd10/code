-- v3.74.644 — Prevent expenses from being booked to COGS/purchases accounts
-- ------------------------------------------------------------------
-- A user recorded an operating expense against the COGS account (5100), which
-- inflated COGS and distorted gross profit (net profit unaffected). Two layers
-- now prevent this at input time:
--   Layer 1 (UI, app/expenses/new): the "expense account" dropdown hides COGS /
--     purchases accounts (sub_type cogs/cost_of_goods_sold/purchases/... or codes
--     5100/5110/5120/5130), so the user cannot pick them.
--   Layer 2 (DB, this migration): a BEFORE INSERT/UPDATE trigger that blocks
--     linking an expense to a COGS/purchases account. It only fires when
--     expense_account_id is being SET or CHANGED, so legacy rows (e.g. a past
--     mis-posted expense) are not disturbed by unrelated updates.
-- Applied live via MCP; captured in supabase/schema/functions.sql by the dump.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expense_account_type_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_bad boolean;
BEGIN
  IF NEW.expense_account_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.expense_account_id IS NOT DISTINCT FROM OLD.expense_account_id THEN
    RETURN NEW;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.chart_of_accounts ca
    WHERE ca.id = NEW.expense_account_id
      AND (
        lower(coalesce(ca.sub_type,'')) IN ('cogs','cost_of_goods_sold','purchases','purchase_returns','purchase_discounts')
        OR ca.account_code IN ('5100','5110','5120','5130')
      )
  ) INTO v_bad;
  IF v_bad THEN
    RAISE EXCEPTION 'لا يَصِح رَبط المَصروف بحساب تكلفة مبيعات/مشتريات. اختَر حساب مصروف تشغيلي.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_expense_account_type_guard ON public.expenses;
CREATE TRIGGER trg_expense_account_type_guard
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expense_account_type_guard();

-- Data (applied live): notniche EXP-0003 (2,300) reclassified from COGS (5100)
-- to Other Expenses (5300) via a balanced reclassification journal entry
-- (reference_type 'expense_reclassification'). Net profit unchanged; gross
-- profit corrected from 8,400 to 10,700.

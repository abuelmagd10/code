-- v3.74.643 — Permanent guard: an expense can never be paid/posted without a journal
-- ------------------------------------------------------------------
-- Root cause of the recurring "Approved expense without journal_entry_id":
--   * approval could silently fail to post a journal when expense/payment
--     accounts were not configured, leaving the expense 'approved' with no GL;
--   * the "Mark as Paid" button then set status='paid' WITHOUT posting a journal.
--
-- Fixes (app layer, in app/expenses):
--   * handleMarkAsPaid now posts the Dr Expense / Cr Cash journal before marking
--     paid (resolving expense/payment accounts, incl. company defaults / 5000-1010),
--     and blocks with a clear message if accounts cannot be resolved.
--   * handleApprove reverts the expense to 'pending_approval' if no journal could
--     be posted (instead of leaving it 'approved' without a journal).
--
-- Backstop (this migration, DB layer): a BEFORE UPDATE trigger that hard-blocks
-- moving any expense to paid/posted while journal_entry_id is NULL and amount > 0.
-- UPDATE-only so restore/imports (which insert historical rows) are unaffected.
-- Applied live via MCP and captured in supabase/schema/functions.sql by the dump.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expense_paid_requires_journal_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status IN ('paid','posted')
     AND NEW.journal_entry_id IS NULL
     AND COALESCE(NEW.amount, 0) > 0 THEN
    RAISE EXCEPTION 'لا يُمكِن تَعليم المَصروف كمَدفوع/مُرحَّل بدون قَيد مُحاسَبي. رحِّل القَيد أولاً (تأكَّد من إعداد حساب المَصروف وحساب الدَّفع).'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_expense_paid_requires_journal ON public.expenses;
CREATE TRIGGER trg_expense_paid_requires_journal
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expense_paid_requires_journal_guard();

-- Data (applied live, recorded here): notniche default expense/payment accounts
-- were configured (company_expenses_settings) and the two legacy paid-without-journal
-- expenses (EXP-0005, EXP-0006) were backfilled with journals via
-- create_journal_entry_atomic. EXP-0007 (from the v3.74.641 regression) likewise.

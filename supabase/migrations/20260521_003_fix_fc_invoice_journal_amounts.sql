-- v3.23.0: Convert existing FC invoice/bill journals from FC amounts to base currency.
--
-- Bug: prepareInvoiceRevenueJournal / createPurchaseInventoryJournal in
-- lib/accrual-accounting-engine.ts posted debit_amount/credit_amount using
-- invoice.total_amount (FC) instead of total × exchange_rate (base).
-- This violated IAS 21 — journal entries must be in base currency.
--
-- This migration multiplies existing FC journal amounts by exchange_rate and
-- stores the FC values in original_debit / original_credit / original_currency /
-- exchange_rate_used columns for IAS 21 disclosure.
--
-- Skips: rows where original_debit/credit are already populated (touched by
-- the v3.23.0 code path or a previous migration run).
--
-- Status: Applied to Production on 2026-05-21.
-- Verified: IAS21-TEST-1779282655 went from AR debit 100 (USD) → 5000 (EGP).

DO $$
BEGIN
  PERFORM set_config('app.allow_direct_post', 'true', true);

  WITH fc_invoices AS (
    SELECT
      je.id AS journal_id,
      i.currency_code,
      i.exchange_rate
    FROM journal_entries je
    JOIN invoices i ON i.id = je.reference_id
    WHERE je.reference_type = 'invoice'
      AND i.exchange_rate IS NOT NULL
      AND i.exchange_rate <> 1
      AND UPPER(COALESCE(i.currency_code, '')) NOT IN ('', 'EGP')
  )
  UPDATE journal_entry_lines jel
  SET
    debit_amount = ROUND((jel.debit_amount * fi.exchange_rate)::numeric, 2),
    credit_amount = ROUND((jel.credit_amount * fi.exchange_rate)::numeric, 2),
    original_debit = jel.debit_amount,
    original_credit = jel.credit_amount,
    original_currency = fi.currency_code,
    exchange_rate_used = fi.exchange_rate
  FROM fc_invoices fi
  WHERE jel.journal_entry_id = fi.journal_id
    AND (jel.original_debit IS NULL OR jel.original_credit IS NULL);

  WITH fc_bills AS (
    SELECT
      je.id AS journal_id,
      b.currency_code,
      b.exchange_rate
    FROM journal_entries je
    JOIN bills b ON b.id = je.reference_id
    WHERE je.reference_type = 'bill'
      AND b.exchange_rate IS NOT NULL
      AND b.exchange_rate <> 1
      AND UPPER(COALESCE(b.currency_code, '')) NOT IN ('', 'EGP')
  )
  UPDATE journal_entry_lines jel
  SET
    debit_amount = ROUND((jel.debit_amount * fb.exchange_rate)::numeric, 2),
    credit_amount = ROUND((jel.credit_amount * fb.exchange_rate)::numeric, 2),
    original_debit = jel.debit_amount,
    original_credit = jel.credit_amount,
    original_currency = fb.currency_code,
    exchange_rate_used = fb.exchange_rate
  FROM fc_bills fb
  WHERE jel.journal_entry_id = fb.journal_id
    AND (jel.original_debit IS NULL OR jel.original_credit IS NULL);

  PERFORM set_config('app.allow_direct_post', 'false', true);
END $$;

-- v3.23.0 followup: fix invoice_payment journals for CROSS-CURRENCY receipts
-- (payment in FC for an invoice/bill that is in base currency).
--
-- Bug: when a customer paid 0.20 USD on a 10 EGP invoice, the invoice_payment
-- journal posted AR credit and cash debit as 0.20 (in FC) instead of 10.68
-- (= 0.20 × 53.39 EGP).
--
-- Reference path resolution: invoice_payment journals reference either
-- payments.id (legacy) or advance_applications.id (modern allocation flow);
-- this migration handles both.
--
-- Skips:
-- - Same-currency payments (no conversion needed)
-- - FC invoices (more complex — requires FX gain/loss handling, separate)
-- - Journals that already have a reversal posted (net = 0)
-- - Rows where original_currency is already set (already processed)
--
-- Status: Applied to Production on 2026-05-21.

DO $$
BEGIN
  PERFORM set_config('app.allow_direct_post', 'true', true);

  WITH cross_currency_payment_journals AS (
    SELECT
      je.id AS journal_id,
      p.id AS payment_id,
      p.exchange_rate AS payment_rate,
      p.currency_code AS payment_currency,
      i.currency_code AS invoice_currency,
      i.exchange_rate AS invoice_rate
    FROM journal_entries je
    LEFT JOIN payments p_direct ON p_direct.id = je.reference_id
    LEFT JOIN advance_applications aa ON aa.id = je.reference_id
    LEFT JOIN payments p_via_aa ON p_via_aa.id = aa.payment_id
    CROSS JOIN LATERAL (
      SELECT COALESCE(p_direct.id, p_via_aa.id) AS id,
             COALESCE(p_direct.exchange_rate, p_via_aa.exchange_rate) AS exchange_rate,
             COALESCE(p_direct.currency_code, p_via_aa.currency_code) AS currency_code,
             COALESCE(p_direct.invoice_id, p_via_aa.invoice_id, aa.invoice_id) AS invoice_id,
             COALESCE(p_direct.bill_id, p_via_aa.bill_id, aa.bill_id) AS bill_id
    ) p
    LEFT JOIN invoices i ON i.id = p.invoice_id
    LEFT JOIN bills b ON b.id = p.bill_id
    WHERE je.reference_type = 'invoice_payment'
      AND je.status = 'posted'
      AND (je.is_deleted IS NULL OR je.is_deleted = false)
      AND p.id IS NOT NULL
      AND UPPER(COALESCE(p.currency_code, '')) <> UPPER(COALESCE(i.currency_code, b.currency_code, ''))
      AND p.exchange_rate IS NOT NULL
      AND p.exchange_rate <> 1
      AND COALESCE(i.exchange_rate, b.exchange_rate, 1) = 1
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries r
        WHERE r.reference_type = 'reversal'
          AND r.reference_id = je.id
          AND r.status = 'posted'
      )
  )
  UPDATE journal_entry_lines jel
  SET
    debit_amount = ROUND((jel.debit_amount * ccp.payment_rate)::numeric, 2),
    credit_amount = ROUND((jel.credit_amount * ccp.payment_rate)::numeric, 2),
    original_debit = jel.debit_amount,
    original_credit = jel.credit_amount,
    original_currency = ccp.payment_currency,
    exchange_rate_used = ccp.payment_rate
  FROM cross_currency_payment_journals ccp
  WHERE jel.journal_entry_id = ccp.journal_id
    AND (jel.original_debit IS NULL OR jel.original_credit IS NULL);

  PERFORM set_config('app.allow_direct_post', 'false', true);
END $$;

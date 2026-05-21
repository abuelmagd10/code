-- v3.22.0: Fix invoice.paid_amount for cross-currency payments and unsynced legacy payments.
--
-- BUG (fixed in code v3.22.0):
--   applyAllocation() in customer-payment-command.service.ts was adding the payment's
--   FC amount (e.g. 0.20 USD) directly to invoice.paid_amount (which is stored in
--   invoice currency e.g. EGP) without converting. So a 0.20 USD payment at rate 53.39
--   on a 10 EGP invoice was leaving paid_amount = 0.20 EGP instead of 10.68 EGP.
--
-- This migration repairs the affected rows by recomputing the correct paid_amount.
--
-- Formula:
--   correct_paid = SUM_over_contributions(
--     applied_in_payment_ccy ×
--     CASE WHEN payment.currency = invoice.currency THEN 1
--          ELSE payment.exchange_rate / invoice.exchange_rate END
--   )
--
-- Contributions come from two sources:
--   1. advance_applications.amount_applied — modern allocation flow
--   2. payments.invoice_id — legacy direct link (only when no advance_applications row)
--
-- Status: Applied to Production on 2026-05-21.
-- Affected: INV-00003 (0.20 → 10.68 EGP), INV-0057 (0.00 → 2100 EGP).
--
-- Note: We do NOT touch `original_paid` because the prevent_paid_invoice_modification
-- trigger blocks changes to it on paid/partially_paid invoices. The trigger allows
-- updates to paid_amount and status, which is sufficient for display correctness.

WITH payment_contribution AS (
  SELECT
    aa.invoice_id,
    aa.amount_applied AS applied_in_payment_ccy,
    p.currency_code AS payment_currency,
    p.exchange_rate AS payment_rate
  FROM advance_applications aa
  JOIN payments p ON p.id = aa.payment_id
  WHERE aa.invoice_id IS NOT NULL
  UNION ALL
  SELECT
    p.invoice_id,
    p.amount AS applied_in_payment_ccy,
    p.currency_code AS payment_currency,
    p.exchange_rate AS payment_rate
  FROM payments p
  WHERE p.invoice_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM advance_applications aa2 WHERE aa2.payment_id = p.id)
),
recalculated AS (
  SELECT
    pc.invoice_id,
    SUM(
      CASE
        WHEN UPPER(COALESCE(pc.payment_currency, '')) = UPPER(COALESCE(i.currency_code, ''))
          OR pc.payment_currency IS NULL
          OR i.currency_code IS NULL
        THEN pc.applied_in_payment_ccy
        ELSE pc.applied_in_payment_ccy *
             (COALESCE(pc.payment_rate, 1) / NULLIF(COALESCE(i.exchange_rate, 1), 0))
      END
    ) AS correct_paid
  FROM payment_contribution pc
  JOIN invoices i ON i.id = pc.invoice_id
  GROUP BY pc.invoice_id
)
UPDATE invoices i
SET
  paid_amount = ROUND(r.correct_paid::numeric, 4),
  status = CASE
    WHEN r.correct_paid >= (COALESCE(i.total_amount, 0) - COALESCE(i.returned_amount, 0)) - 0.01
      THEN 'paid'
    WHEN r.correct_paid > 0
      THEN 'partially_paid'
    ELSE i.status
  END
FROM recalculated r
WHERE i.id = r.invoice_id
  AND ABS(COALESCE(i.paid_amount, 0) - r.correct_paid) > 0.01
  AND i.status NOT IN ('cancelled', 'draft');

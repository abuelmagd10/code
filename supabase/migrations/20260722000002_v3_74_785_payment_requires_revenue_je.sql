-- ============================================================================
-- v3.74.785 — التحصيل بعد التسليم فقط (قاعدة المالك)
--
-- Owner rule (2026-07-22): «التحصيل بعد التسليم فقط». Under the new
-- revenue-at-delivery sequencing, a 'sent' invoice awaiting warehouse
-- dispatch approval has NO revenue journal yet. A payment recorded against
-- it would credit AR that was never debited — broken balance by design.
--
-- The sibling guard require_revenue_je_before_paid already blocks the
-- STATUS from reaching 'paid' without a revenue JE. This guard blocks the
-- PAYMENT ROW itself — the money never enters the books out of order.
--
-- Scope: payments linked to a sales invoice (invoice_id IS NOT NULL).
--   - Bill payments (bill_id) are untouched.
--   - Unlinked customer receipts (advances) are untouched — they remain
--     possible and are governed by their own credit-ledger flow.
--   - Honors app.skip_je_check, the same transaction-local escape hatch
--     require_revenue_je_before_paid honors, so sanctioned admin flows
--     use ONE consistent switch.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.payment_requires_revenue_je_trg()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF NEW.invoice_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Same escape hatch as require_revenue_je_before_paid (transaction-local).
  IF current_setting('app.skip_je_check', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.reference_type = 'invoice'
      AND je.reference_id   = NEW.invoice_id
      AND je.status         = 'posted'
      AND (je.is_deleted IS NULL OR je.is_deleted = false)
  ) THEN
    RAISE EXCEPTION
      'PAYMENT_BEFORE_DELIVERY: لا يمكن تسجيل دفعة على الفاتورة قبل اعتماد مسؤول المخزن تسليم البضاعة — قيد إيراد الفاتورة يُنشأ عند اعتماد التسليم.'
      USING HINT = 'اعتمد إخراج البضاعة من المخزن أولاً، ثم سجّل التحصيل.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_payment_requires_revenue_je ON public.payments;

CREATE TRIGGER trg_payment_requires_revenue_je
  BEFORE INSERT OR UPDATE OF invoice_id ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.payment_requires_revenue_je_trg();

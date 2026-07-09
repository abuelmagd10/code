-- =====================================================================
-- v3.74.587 — Customer-refund integrity: cleanup + auto-cancel guards
-- (applied to production via Supabase MCP on 2026-07-09; mirrored here)
--
-- Owner spotted an approved 500 EGP customer refund request still
-- sitting "ready to execute". Verified orphan: it references the
-- hard-deleted test invoice INV-2026-00001 (id 9e09589d…) AND a
-- deleted payment; never executed; no refund account; customer credit
-- balance 0. Executing it would have paid out real money against
-- nothing. Same root cause as the v3.74.585 bonus orphan: the full
-- cleanup of test booking BKG-2026-00001 missed request tables.
--
-- (1) hard-delete the orphan (matches the "as if never existed"
--     cleanup; it has no accounting footprint).
-- (2) prevention: deleting an invoice auto-cancels its UNEXECUTED
--     customer refund requests; deleting a payment auto-cancels
--     UNEXECUTED refund + vendor-correction requests that reference it
--     as original payment. Executed ones are left untouched (they have
--     real accounting and must go through proper correction flows).
--
-- Post-cleanup sweep verified ZERO remaining references to the deleted
-- invoice/booking across discount_approvals, sales_return_requests,
-- customer_refund_requests, user_bonuses, booking_bundle_selections,
-- booking_extra_items, inventory_transactions, journal_entries.
-- =====================================================================

-- (1) cleanup
DELETE FROM public.customer_refund_requests
WHERE id = '5f5e800a-63d3-4f5e-9ea1-3061914ec087'
  AND status IN ('pending','approved')
  AND reversal_payment_id IS NULL;

-- (2a) invoice delete → cancel unexecuted refund requests
CREATE OR REPLACE FUNCTION public.cancel_refund_requests_on_invoice_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.customer_refund_requests
     SET status = 'cancelled',
         cancelled_at = NOW(),
         rejection_reason = COALESCE(rejection_reason,'') ||
           CASE WHEN COALESCE(rejection_reason,'')='' THEN '' ELSE ' | ' END ||
           'إلغاء آلى: حُذفت الفاتورة المصدر ' || COALESCE(OLD.invoice_number, OLD.id::text),
         updated_at = NOW()
   WHERE invoice_id = OLD.id
     AND status IN ('pending','approved')
     AND reversal_payment_id IS NULL;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS refunds_cancel_on_invoice_delete ON public.invoices;
CREATE TRIGGER refunds_cancel_on_invoice_delete
BEFORE DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.cancel_refund_requests_on_invoice_delete();

-- (2b) payment delete → cancel unexecuted refund + correction requests
CREATE OR REPLACE FUNCTION public.cancel_requests_on_payment_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.customer_refund_requests
     SET status = 'cancelled',
         cancelled_at = NOW(),
         rejection_reason = COALESCE(rejection_reason,'') ||
           CASE WHEN COALESCE(rejection_reason,'')='' THEN '' ELSE ' | ' END ||
           'إلغاء آلى: حُذفت الدفعة المصدر',
         updated_at = NOW()
   WHERE original_payment_id = OLD.id
     AND status IN ('pending','approved')
     AND reversal_payment_id IS NULL;

  UPDATE public.vendor_payment_correction_requests
     SET status = 'cancelled',
         cancelled_at = NOW(),
         rejection_reason = COALESCE(rejection_reason,'') ||
           CASE WHEN COALESCE(rejection_reason,'')='' THEN '' ELSE ' | ' END ||
           'إلغاء آلى: حُذفت الدفعة المصدر',
         updated_at = NOW()
   WHERE original_payment_id = OLD.id
     AND status IN ('pending','approved')
     AND reversal_payment_id IS NULL;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS requests_cancel_on_payment_delete ON public.payments;
CREATE TRIGGER requests_cancel_on_payment_delete
BEFORE DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.cancel_requests_on_payment_delete();

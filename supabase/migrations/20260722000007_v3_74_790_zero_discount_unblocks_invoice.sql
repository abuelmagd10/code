-- ============================================================================
-- v3.74.790b — تصفير الخصم بعد الرفض يولّد الفاتورة (سد الطريق المسدود)
--
-- The rejection notification tells the employee: «احذف الخصم أو غيّره».
-- Changing it opens a new approval whose approval births the invoice.
-- REMOVING it entirely hit a verified dead end: so_evaluate's zero branch
-- cancels the pending row and returns — nothing ever creates the invoice,
-- and the order hangs invoiceless forever.
--
-- Surgical fix inside that zero branch only: when a prior approval row
-- exists (rejected, or pending-just-cancelled) and the order has no invoice
-- yet but has real items, create_auto_invoice_from_sales_order runs.
-- Fresh no-discount orders have no approval row and never enter this path,
-- so the normal creation flow is untouched. Anchor-verified patch.
--
-- APPLIED to test + prod 2026-07-22 via MCP; this file is the repo record.
-- Rehearsed on test: SO (discount 5) → approval rejected → discount zeroed
-- → invoice born automatically with its items and zero discount.
-- ============================================================================

DO $patch$
DECLARE
  d text;
  a text := $anchor$  IF v_total_discount_amt <= 0 THEN
    IF FOUND AND v_last_status = 'pending' THEN
      UPDATE public.discount_approvals
         SET status = 'cancelled',
             decision_note = COALESCE(decision_note, 'Discount removed from the sales order.'),
             updated_at = NOW()
       WHERE id = v_last_id;
    END IF;
    RETURN;
  END IF;$anchor$;
  r text;
  n int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='public' AND p.proname='so_evaluate_discount_approval'
  LIMIT 1;

  IF d LIKE '%zero-discount unblock%' THEN
    RAISE NOTICE 'so_evaluate_discount_approval already patched — skipping';
    RETURN;
  END IF;

  n := (length(d) - length(replace(d, a, ''))) / length(a);
  IF n <> 1 THEN
    RAISE EXCEPTION 'anchor matched % times, expected exactly 1 — aborting', n;
  END IF;

  r := $repl$  IF v_total_discount_amt <= 0 THEN
    IF FOUND AND v_last_status = 'pending' THEN
      UPDATE public.discount_approvals
         SET status = 'cancelled',
             decision_note = COALESCE(decision_note, 'Discount removed from the sales order.'),
             updated_at = NOW()
       WHERE id = v_last_id;
    END IF;
    -- v3.74.790 — zero-discount unblock: the employee followed the rejection
    -- hint and REMOVED the discount. A prior approval row (rejected, or the
    -- pending one just cancelled above) proves this order went through the
    -- approval gate; with no invoice yet and real items, the invoice must be
    -- born NOW or the order hangs forever. Fresh no-discount orders have no
    -- approval row and never reach this — their route creates the invoice.
    IF FOUND
       AND v_so.invoice_id IS NULL
       AND EXISTS (SELECT 1 FROM public.sales_order_items WHERE sales_order_id = p_so_id) THEN
      BEGIN
        PERFORM public.create_auto_invoice_from_sales_order(p_so_id);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'zero-discount invoice creation failed for SO %: %', p_so_id, SQLERRM;
      END;
    END IF;
    RETURN;
  END IF;$repl$;

  EXECUTE replace(d, a, r);
  RAISE NOTICE 'so_evaluate_discount_approval patched';
END $patch$;

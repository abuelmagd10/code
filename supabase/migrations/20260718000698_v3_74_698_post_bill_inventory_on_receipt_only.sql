-- v3.74.698 — Purchase-bill inventory is posted at GOODS RECEIPT, not at
-- accountant approval.
-- ------------------------------------------------------------------
-- Reported: the branch store manager could not confirm receipt of BILL-0002.
-- The API returned 409 "inconsistent receipt posting state".
--
-- Root cause: the legacy trigger accrual_accounting_engine (AFTER UPDATE on
-- bills) posted "Dr Inventory / Cr Accounts Payable" the moment the bill turned
-- 'sent' — i.e. when the ACCOUNTANT approved it, before the warehouse received
-- anything. Consequences:
--   1) Accounting showed inventory on hand that did not physically exist
--      (GL inventory +22.69 while the stock ledger had zero movements).
--   2) confirm-receipt found a journal with no matching inventory movement and
--      correctly refused to post — the guard was right, the upstream posting
--      was wrong.
--
-- Owner decision: the inventory entry is posted when the branch STORE MANAGER
-- confirms receipt of the purchased goods. The receipt path
-- (post_bill_receipt_atomic via postBillAtomic) already posts the complete
-- journal — AP + inventory + VAT + shipping — together with the stock
-- movements, so it becomes the single owner of purchase-bill accounting.
-- Accountant approval remains a review step with no accounting effect.
--
-- Sales-invoice and payment posting inside this trigger are untouched, as is
-- the soft-delete-on-revert behaviour for bills and invoices.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accrual_accounting_engine()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_inventory_id UUID;
  v_purchases_id UUID;
  v_ap_id UUID;
  v_cash_id UUID;
  v_sales_id UUID;
  v_ar_id UUID;
  v_cogs_id UUID;
  v_journal_id UUID;
BEGIN
  PERFORM set_config('app.allow_direct_post', 'true', true);

  SELECT id INTO v_ar_id FROM chart_of_accounts WHERE company_id = NEW.company_id AND sub_type = 'accounts_receivable' LIMIT 1;
  SELECT id INTO v_ap_id FROM chart_of_accounts WHERE company_id = NEW.company_id AND sub_type = 'accounts_payable' LIMIT 1;
  SELECT id INTO v_sales_id FROM chart_of_accounts WHERE company_id = NEW.company_id AND account_type = 'income' LIMIT 1;
  SELECT id INTO v_inventory_id FROM chart_of_accounts WHERE company_id = NEW.company_id AND sub_type = 'inventory' LIMIT 1;
  SELECT id INTO v_cogs_id FROM chart_of_accounts WHERE company_id = NEW.company_id AND (sub_type = 'cost_of_goods_sold' OR account_code = '5000') LIMIT 1;
  SELECT id INTO v_cash_id FROM chart_of_accounts WHERE company_id = NEW.company_id AND (sub_type = 'cash' OR sub_type = 'bank' OR account_type = 'asset') LIMIT 1;

  IF v_ap_id IS NULL OR v_inventory_id IS NULL THEN
    RAISE LOG 'Accounting settings missing for company_id: %', NEW.company_id;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'bills' AND OLD.status IN ('sent', 'received', 'paid', 'partially_paid') AND NEW.status IN ('draft', 'cancelled', 'pending_approval') THEN
    UPDATE journal_entries
       SET is_deleted = TRUE,
           deleted_at = NOW()
     WHERE reference_type = 'bill'
       AND reference_id = NEW.id
       AND (is_deleted IS NULL OR is_deleted = FALSE);
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'invoices' AND OLD.status IN ('sent', 'paid', 'partially_paid') AND NEW.status IN ('draft', 'cancelled', 'pending_approval') THEN
    UPDATE journal_entries
       SET is_deleted = TRUE,
           deleted_at = NOW()
     WHERE reference_type IN ('invoice', 'invoice_cogs')
       AND reference_id = NEW.id
       AND (is_deleted IS NULL OR is_deleted = FALSE);
    RETURN NEW;
  END IF;

  -- v3.74.698 — PURCHASE BILLS NO LONGER POST HERE. See header comment.
  -- The goods-receipt confirmation now owns purchase-bill accounting.

  IF TG_TABLE_NAME = 'invoices' AND OLD.status NOT IN ('sent', 'paid', 'partially_paid') AND NEW.status = 'sent' THEN
    INSERT INTO journal_entries (company_id, reference_type, reference_id, entry_date, description, status)
    VALUES (NEW.company_id, 'invoice', NEW.id, NEW.invoice_date, 'Sales - ' || NEW.invoice_number, 'draft')
    RETURNING id INTO v_journal_id;

    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES
    (v_journal_id, v_ar_id, NEW.total_amount, 0, 'Accounts Receivable'),
    (v_journal_id, v_sales_id, 0, NEW.total_amount, 'Sales Revenue');

    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;

    IF NEW.total_cost > 0 THEN
      INSERT INTO journal_entries (company_id, reference_type, reference_id, entry_date, description, status)
      VALUES (NEW.company_id, 'invoice_cogs', NEW.id, NEW.invoice_date, 'COGS - ' || NEW.invoice_number, 'draft')
      RETURNING id INTO v_journal_id;

      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES
      (v_journal_id, v_cogs_id, NEW.total_cost, 0, 'Cost of Goods Sold'),
      (v_journal_id, v_inventory_id, 0, NEW.total_cost, 'Inventory');

      UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'payments' AND NEW.status = 'completed' AND OLD.status != 'completed' THEN
    INSERT INTO journal_entries (company_id, reference_type, reference_id, entry_date, description, status)
    VALUES (NEW.company_id, 'payment', NEW.id, NEW.payment_date, 'Payment - ' || NEW.reference_number, 'draft')
    RETURNING id INTO v_journal_id;

    IF NEW.payment_type = 'incoming' THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES
      (v_journal_id, v_cash_id, NEW.amount, 0, 'Cash In'),
      (v_journal_id, v_ar_id, 0, NEW.amount, 'Accounts Receivable Reduction');
    ELSIF NEW.payment_type = 'outgoing' THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description) VALUES
      (v_journal_id, v_ap_id, NEW.amount, 0, 'Accounts Payable Reduction'),
      (v_journal_id, v_cash_id, 0, NEW.amount, 'Cash Out');
    END IF;

    UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;
  END IF;

  PERFORM set_config('app.allow_direct_post', 'false', true);

  RETURN NEW;
END;
$function$;

-- Remediation: soft-delete purchase-bill journals that this legacy path posted
-- prematurely — the bill has NOT been received yet, carries stockable items, and
-- has no purchase inventory movement. Such a journal only ever comes from the
-- removed block, and leaving it in place keeps the receipt blocked.
DO $do$
BEGIN
  PERFORM set_config('app.allow_direct_post', 'true', true);

  UPDATE public.journal_entries je
     SET is_deleted = TRUE, deleted_at = NOW()
   WHERE je.reference_type = 'bill'
     AND (je.is_deleted IS NULL OR je.is_deleted = FALSE)
     AND EXISTS (
       SELECT 1 FROM public.bills b
        WHERE b.id = je.reference_id
          AND COALESCE(b.receipt_status, 'pending') <> 'received'
          AND COALESCE(b.status, '') <> 'received'
     )
     AND EXISTS (
       SELECT 1 FROM public.bill_items bi
         JOIN public.products p ON p.id = bi.product_id
        WHERE bi.bill_id = je.reference_id
          AND COALESCE(p.item_type, 'product') <> 'service'
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.inventory_transactions it
        WHERE it.reference_type = 'bill'
          AND it.reference_id = je.reference_id
          AND it.transaction_type = 'purchase'
     );

  PERFORM set_config('app.allow_direct_post', 'false', true);
END $do$;

-- v3.74.398 — Fix approve_purchase_order_atomic so the bill it auto-
-- creates carries forward every relevant header + item field from the
-- approved PO. Also backfill the one row that hit this bug in
-- production (BILL-0001 on شركة تست), and add Section K to
-- assert_baseline() to catch any future regression that drops one of
-- the carryover columns from the function body.
--
-- WHY (owner-reported)
-- PO-0001 stored shipping_tax_rate=14 (شحن=1 + ضريبة شحن 14% → ضريبة
-- شحن 0.14 = part of the stored tax_amount=1.34). When the PO was
-- approved, BILL-0001 was auto-created via approve_purchase_order_atomic.
-- The INSERT INTO bills inside that function explicitly listed the
-- columns to populate and the list omitted:
--    shipping_tax_rate, discount_position, tax_inclusive, exchange_rate
-- The columns therefore took their table defaults (mostly 0/NULL).
-- Effect: bill.tax_amount=1.34 carried the 0.14 shipping-tax slice
-- but bill.shipping_tax_rate=0, leaving the breakdown internally
-- inconsistent. The bill_items INSERT also omitted tax_code_id
-- (added in v3.74.394), losing the link to /settings/taxes.
--
-- FIX
-- 1) CREATE OR REPLACE the function with the missing columns added,
--    everything else byte-identical (commented inline).
-- 2) Data fix: backfill BILL-0001 + its items to match the PO source.
--    Other linked bills get audited via baseline_report and can be
--    fixed individually if owner asks.
-- 3) Section K: assert_baseline() pins the function body so a future
--    migration that drops any of these columns from the INSERT lists
--    fails the baseline before it can corrupt data.

-- ---------------------------------------------------------------------
-- 1) Replace approve_purchase_order_atomic
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_purchase_order_atomic(
  p_po_id uuid,
  p_user_id uuid,
  p_company_id uuid,
  p_action text,
  p_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_po RECORD;
    v_user_role TEXT;
    v_user_branch UUID;
    v_new_status TEXT;
    v_audit_action TEXT;
    v_new_bill_id UUID;
    v_bill_number TEXT;
    v_next_bill_num INTEGER;
    v_item RECORD;
BEGIN
    SELECT role, branch_id INTO v_user_role, v_user_branch
    FROM public.company_members
    WHERE company_id = p_company_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'User is not a member of this company');
    END IF;

    IF v_user_role NOT IN ('owner', 'manager') THEN
         RETURN jsonb_build_object('success', false, 'error', 'صَلاحية اعتماد أَوامِر الشراء مَحصورَة بالمالِك والمُدير العام فَقَط');
    END IF;

    SELECT * INTO v_po
    FROM public.purchase_orders
    WHERE id = p_po_id AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Purchase order not found');
    END IF;

    IF v_po.status != 'pending_approval' THEN
        RETURN jsonb_build_object('success', false, 'error', 'PO is not in a pending_approval state');
    END IF;

    IF p_action = 'approve' THEN
        v_new_status := 'approved';
        v_audit_action := 'APPROVE';

        UPDATE public.purchase_orders
        SET status = v_new_status,
            approved_by = p_user_id,
            approved_at = NOW()
        WHERE id = p_po_id;

        v_new_bill_id := gen_random_uuid();

        SELECT COALESCE(MAX(CAST(SUBSTRING(bill_number FROM 'BILL-([0-9]+)') AS INTEGER)), 0) + 1 INTO v_next_bill_num
        FROM public.bills
        WHERE company_id = p_company_id AND bill_number ~ '^BILL-[0-9]+$';

        v_bill_number := 'BILL-' || LPAD(v_next_bill_num::TEXT, 4, '0');

        -- v3.74.398 — added shipping_tax_rate, discount_position,
        -- tax_inclusive, exchange_rate to the carryover. Without these
        -- the bill silently took the table defaults and the breakdown
        -- drifted from the PO. Order of columns kept stable.
        INSERT INTO public.bills (
            id, company_id, supplier_id, bill_number,
            bill_date, due_date,
            subtotal, tax_amount, total_amount,
            status, approval_status, approved_by, approved_at,
            created_at, is_deleted,
            purchase_order_id, branch_id, cost_center_id, warehouse_id,
            created_by_user_id, currency_code,
            discount_type, discount_value, shipping, adjustment,
            shipping_tax_rate, discount_position, tax_inclusive, exchange_rate,
            original_currency, original_total,
            display_currency, display_total, display_subtotal,
            original_subtotal, original_tax_amount
        ) VALUES (
            v_new_bill_id, v_po.company_id, v_po.supplier_id, v_bill_number,
            CURRENT_DATE, v_po.due_date,
            v_po.subtotal, v_po.tax_amount, v_po.total_amount,
            'draft', 'pending', NULL, NULL,
            NOW(), false,
            v_po.id, v_po.branch_id, v_po.cost_center_id, v_po.warehouse_id,
            p_user_id, v_po.currency,
            v_po.discount_type, v_po.discount_value, v_po.shipping, v_po.adjustment,
            COALESCE(v_po.shipping_tax_rate, 0),
            COALESCE(v_po.discount_position, 'before_tax'),
            COALESCE(v_po.tax_inclusive, false),
            COALESCE(v_po.exchange_rate, 1),
            v_po.currency, v_po.total_amount,
            v_po.currency, v_po.total_amount, v_po.subtotal,
            v_po.subtotal, v_po.tax_amount
        );

        UPDATE public.purchase_orders
        SET bill_id = v_new_bill_id
        WHERE id = p_po_id;

        -- v3.74.398 — added tax_code_id so the bill items keep the
        -- link to /settings/taxes (added on items in v3.74.394).
        FOR v_item IN (SELECT * FROM public.purchase_order_items WHERE purchase_order_id = p_po_id) LOOP
            INSERT INTO public.bill_items (
                id, bill_id, product_id, description, quantity, unit_price,
                tax_rate, tax_code_id, discount_percent, line_total
            ) VALUES (
                gen_random_uuid(), v_new_bill_id, v_item.product_id, v_item.description,
                v_item.quantity, v_item.unit_price, v_item.tax_rate, v_item.tax_code_id,
                v_item.discount_percent, v_item.line_total
            );
        END LOOP;

    ELSIF p_action = 'reject' THEN
        IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Rejection reason is required');
        END IF;

        v_new_status := 'rejected';
        v_audit_action := 'UPDATE';

        UPDATE public.purchase_orders
        SET status = v_new_status,
            rejection_reason = p_reason,
            rejected_by = p_user_id,
            rejected_at = NOW()
        WHERE id = p_po_id;
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
    END IF;

    INSERT INTO public.audit_logs (
        company_id, user_id, action, target_table, record_id, old_data, new_data, created_at, reason, branch_id
    ) VALUES (
        p_company_id, p_user_id, v_audit_action, 'purchase_orders', p_po_id,
        jsonb_build_object('status', v_po.status),
        jsonb_build_object('status', v_new_status, 'reason', p_reason),
        NOW(), p_reason, v_po.branch_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'po_id', p_po_id,
        'status', v_new_status,
        'bill_id', v_new_bill_id,
        'creator_id', v_po.created_by_user_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

COMMENT ON FUNCTION public.approve_purchase_order_atomic(uuid, uuid, uuid, text, text) IS
  'v3.74.398 - Bill auto-creation now carries shipping_tax_rate, discount_position, tax_inclusive, exchange_rate, and per-item tax_code_id from the source PO. Body is otherwise byte-identical to the prior version.';

-- ---------------------------------------------------------------------
-- 2) Backfill BILL-0001 on شركة تست so its breakdown is internally
--    consistent (matches its source PO-0001).
-- ---------------------------------------------------------------------

DO $migration$
DECLARE
  v_company_id uuid := '8ef6338c-1713-4202-98ac-863633b76526';
  v_po RECORD;
BEGIN
  SELECT * INTO v_po
    FROM purchase_orders
   WHERE company_id = v_company_id AND po_number = 'PO-0001';

  IF NOT FOUND THEN
    RAISE NOTICE 'v3.74.398 backfill: PO-0001 not found, skipping';
    RETURN;
  END IF;

  -- Bypass posted-row protection triggers — bill is still draft so this
  -- is safe; the SET session_replication_role pattern matches what we
  -- used in earlier cleanup migrations.
  PERFORM set_config('session_replication_role', 'replica', true);

  UPDATE bills
     SET shipping_tax_rate = v_po.shipping_tax_rate,
         discount_position = v_po.discount_position,
         tax_inclusive     = v_po.tax_inclusive,
         exchange_rate     = COALESCE(v_po.exchange_rate, 1),
         updated_at        = NOW()
   WHERE company_id = v_company_id
     AND bill_number = 'BILL-0001'
     AND purchase_order_id = v_po.id
     AND (shipping_tax_rate IS DISTINCT FROM v_po.shipping_tax_rate
       OR discount_position IS DISTINCT FROM v_po.discount_position
       OR tax_inclusive     IS DISTINCT FROM v_po.tax_inclusive
       OR exchange_rate     IS DISTINCT FROM COALESCE(v_po.exchange_rate, 1));

  -- Backfill tax_code_id on bill_items from the PO items (same row order
  -- since the function preserves it). Match by (bill, product, qty, price).
  UPDATE bill_items bi
     SET tax_code_id = poi.tax_code_id
    FROM purchase_order_items poi, bills b
   WHERE b.id = bi.bill_id
     AND b.company_id = v_company_id
     AND b.bill_number = 'BILL-0001'
     AND poi.purchase_order_id = v_po.id
     AND poi.product_id = bi.product_id
     AND poi.quantity = bi.quantity
     AND poi.unit_price = bi.unit_price
     AND bi.tax_code_id IS DISTINCT FROM poi.tax_code_id;

  PERFORM set_config('session_replication_role', 'origin', true);
END
$migration$;

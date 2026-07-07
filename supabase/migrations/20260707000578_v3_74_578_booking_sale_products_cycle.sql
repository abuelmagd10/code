-- =====================================================================
-- v3.74.578 — Split booking completion into two cycles (owner decision):
-- (applied to production via Supabase MCP on 2026-07-07; mirrored here)
--
--  Case 1: booking has WALK-IN SALE PRODUCTS (booking_extra_items):
--    * execution deducts ONLY service materials (bundle) — sale products
--      are delivered later through the sales warehouse cycle.
--    * invoice stays DRAFT (no accounting) → accountant posts it via the
--      standard sales flow → store manager confirms goods-out (deducts
--      product stock there).
--    * post-execution edit window while the invoice is draft: assigned
--      staff (and owner/admin/GM) may amend addons; invoice+inventory
--      resync automatically; accountant re-notified + FYI notifications
--      to owner / general_manager / branch manager.
--    * booking_officer loses edit rights once the booking is executed.
--
--  Case 2: service-only booking → unchanged: accounting + sent/paid at
--    execution; accountant only handles payment.
--
--  Also fixes trg_auto_approve_service_only_invoice: it fired AFTER
--  INSERT on invoices (before items exist → 0 goods lines → auto-
--  approved EVERY invoice, silently skipping the store manager). Now an
--  invoice_items-level trigger keeps warehouse_status truthful while
--  the invoice is still draft.
-- =====================================================================

-- (1) extras are no longer execution-time deductions
CREATE OR REPLACE FUNCTION public.get_booking_line_additions(p_booking_id uuid)
 RETURNS TABLE(kind text, product_id uuid, quantity numeric, unit_price numeric, discount_percent numeric, tax_rate numeric, auto_deduct_inventory boolean, price_handling text, bundle_item_id uuid, extra_item_id uuid, description text)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH booking AS (
    SELECT b.id AS booking_id, b.company_id, b.quantity AS booking_qty,
           s.product_catalog_id AS parent_product_id
      FROM public.bookings b
      JOIN public.services s ON s.id = b.service_id
     WHERE b.id = p_booking_id
  ),
  mandatory AS (
    SELECT 'bundle_mandatory'::text AS kind,
           pbi.child_product_id     AS product_id,
           (pbi.quantity * bk.booking_qty)::numeric AS quantity,
           CASE COALESCE(pbi.price_handling,'included')
             WHEN 'included'  THEN 0
             WHEN 'free_gift' THEN 0
             ELSE COALESCE(p.unit_price, 0)
           END AS unit_price,
           0::numeric AS discount_percent,
           0::numeric AS tax_rate,
           COALESCE(pbi.auto_deduct_inventory, false) AS auto_deduct_inventory,
           COALESCE(pbi.price_handling,'included') AS price_handling,
           pbi.id AS bundle_item_id,
           NULL::uuid AS extra_item_id,
           p.name AS description
      FROM booking bk
      JOIN public.product_bundle_items pbi
        ON pbi.parent_product_id = bk.parent_product_id
       AND pbi.company_id = bk.company_id
      JOIN public.products p ON p.id = pbi.child_product_id
     WHERE COALESCE(pbi.is_optional, false) = false
  ),
  optional AS (
    SELECT 'bundle_optional'::text AS kind,
           pbi.child_product_id    AS product_id,
           COALESCE(bbs.quantity_override, pbi.quantity * bk.booking_qty)::numeric AS quantity,
           CASE COALESCE(pbi.price_handling,'included')
             WHEN 'included'  THEN 0
             WHEN 'free_gift' THEN 0
             ELSE COALESCE(p.unit_price, 0)
           END AS unit_price,
           0::numeric AS discount_percent,
           0::numeric AS tax_rate,
           COALESCE(pbi.auto_deduct_inventory, false) AS auto_deduct_inventory,
           COALESCE(pbi.price_handling,'included') AS price_handling,
           pbi.id AS bundle_item_id,
           NULL::uuid AS extra_item_id,
           p.name AS description
      FROM booking bk
      JOIN public.booking_bundle_selections bbs
        ON bbs.booking_id = bk.booking_id
      JOIN public.product_bundle_items pbi
        ON pbi.id = bbs.bundle_item_id
      JOIN public.products p ON p.id = pbi.child_product_id
  ),
  extras AS (
    SELECT 'extra'::text AS kind,
           bei.product_id,
           bei.quantity,
           bei.unit_price,
           bei.discount_percent,
           bei.tax_rate,
           -- v3.74.578: sale products are dispatched via the warehouse
           -- cycle, NOT consumed at execution.
           false::boolean AS auto_deduct_inventory,
           'added'::text AS price_handling,
           NULL::uuid AS bundle_item_id,
           bei.id AS extra_item_id,
           COALESCE(bei.notes, p.name) AS description
      FROM public.booking_extra_items bei
      JOIN public.products p ON p.id = bei.product_id
     WHERE bei.booking_id = p_booking_id
  )
  SELECT * FROM mandatory
  UNION ALL SELECT * FROM optional
  UNION ALL SELECT * FROM extras;
$function$;

-- (2) completion: two-path finish
CREATE OR REPLACE FUNCTION public.complete_booking_atomic(
  p_company_id uuid, p_booking_id uuid, p_completed_by uuid,
  p_invoice_date date DEFAULT CURRENT_DATE, p_due_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booking public.bookings; v_service public.services; v_branch public.branches;
  v_invoice_id UUID; v_invoice_number TEXT; v_year TEXT := TO_CHAR(NOW(), 'YYYY');
  v_invoice_seq INTEGER; v_service_subtotal NUMERIC; v_addon_total NUMERIC := 0;
  v_new_total NUMERIC; v_warehouse_id UUID; v_cost_center_id UUID;
  v_deducted int := 0; v_lines_added int := 0;
  v_has_sale_products boolean := false;
  con RECORD;
BEGIN
  PERFORM set_config('app.skip_discount_approval', 'booking', true);

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found. booking_id=%', p_booking_id USING ERRCODE='P0001'; END IF;
  IF v_booking.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Booking must be in_progress to complete. Current: %. booking_id=%',
      v_booking.status, p_booking_id USING ERRCODE='P0001';
  END IF;
  IF v_booking.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Booking already has invoice_id=%.', v_booking.invoice_id USING ERRCODE='P0001';
  END IF;

  SELECT * INTO v_service FROM public.services WHERE id = v_booking.service_id;
  SELECT * INTO v_branch  FROM public.branches WHERE id = v_booking.branch_id;

  v_warehouse_id := v_branch.default_warehouse_id;
  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses WHERE company_id = p_company_id LIMIT 1;
  END IF;
  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'No warehouse found for company. company_id=%', p_company_id USING ERRCODE='P0001';
  END IF;

  v_cost_center_id := COALESCE(v_booking.cost_center_id, v_service.cost_center_id, v_branch.default_cost_center_id);
  IF v_cost_center_id IS NULL THEN
    SELECT id INTO v_cost_center_id FROM public.cost_centers WHERE company_id = p_company_id LIMIT 1;
  END IF;

  SELECT COALESCE(MAX(
    CASE WHEN invoice_number LIKE 'INV-' || v_year || '-%'
          AND REGEXP_REPLACE(invoice_number, '^INV-[0-9]{4}-', '') ~ '^[0-9]+$'
         THEN CAST(REGEXP_REPLACE(invoice_number, '^INV-[0-9]{4}-', '') AS INTEGER)
         ELSE 0 END), 0) + 1
  INTO v_invoice_seq FROM public.invoices WHERE company_id = p_company_id;
  v_invoice_number := 'INV-' || v_year || '-' || LPAD(v_invoice_seq::TEXT, 5, '0');

  v_service_subtotal := COALESCE(v_booking.unit_price, 0) * COALESCE(v_booking.quantity, 1);

  -- v3.74.578 — sale products (walk-in extras) drive the two-path finish.
  v_has_sale_products := EXISTS (
    SELECT 1 FROM public.booking_extra_items
    WHERE booking_id = p_booking_id AND company_id = p_company_id
  );

  SELECT COALESCE(SUM(
           (unit_price * quantity) * (1 - COALESCE(discount_percent,0)/100)
         ), 0)
    INTO v_addon_total
    FROM public.get_booking_line_additions(p_booking_id)
   WHERE unit_price > 0;

  v_new_total := v_service_subtotal + v_addon_total
               - COALESCE(v_booking.discount_amount, 0)
               + COALESCE(v_booking.tax_amount, 0);

  INSERT INTO public.invoices (
    company_id, customer_id, invoice_number, invoice_date, due_date,
    subtotal, tax_amount, discount_value, discount_type, total_amount, paid_amount,
    status, notes, branch_id, warehouse_id, cost_center_id
  ) VALUES (
    p_company_id, v_booking.customer_id, v_invoice_number, p_invoice_date, p_due_date,
    v_service_subtotal + v_addon_total, v_booking.tax_amount, COALESCE(v_booking.discount_amount,0),
    'amount', v_new_total, v_booking.paid_amount, 'draft',
    COALESCE(p_notes, 'فاتورة خدمة: ' || v_service.service_name || ' — حجز ' || v_booking.booking_no),
    v_booking.branch_id, v_warehouse_id, v_cost_center_id
  ) RETURNING id INTO v_invoice_id;

  -- Service line (Path A) or GL-only (Path B)
  IF v_service.product_catalog_id IS NOT NULL THEN
    INSERT INTO public.invoice_items (
      invoice_id, product_id, quantity, unit_price, tax_rate,
      discount_percent, line_total, returned_quantity, item_type
    ) VALUES (
      v_invoice_id, v_service.product_catalog_id, v_booking.quantity, v_booking.unit_price,
      COALESCE(v_service.tax_rate, 0), 0, v_service_subtotal, 0, 'service'
    );
    v_lines_added := v_lines_added + 1;
  END IF;

  -- bundle materials + walk-in extras as invoice lines
  FOR con IN SELECT * FROM public.get_booking_line_additions(p_booking_id) LOOP
    INSERT INTO public.invoice_items (
      invoice_id, product_id, quantity, unit_price, tax_rate,
      discount_percent, line_total, returned_quantity, item_type
    ) VALUES (
      v_invoice_id, con.product_id, con.quantity, con.unit_price,
      con.tax_rate, con.discount_percent,
      con.unit_price * con.quantity * (1 - COALESCE(con.discount_percent,0)/100),
      0,
      -- v3.74.578: bundle lines are consumed service materials (never
      -- dispatched); ONLY walk-in extras are warehouse goods.
      CASE WHEN con.kind = 'extra' THEN 'product' ELSE 'service' END
    );
    v_lines_added := v_lines_added + 1;

    -- Execution-time deduction: service materials only.
    IF con.kind <> 'extra' AND con.auto_deduct_inventory AND con.quantity > 0 THEN
      INSERT INTO public.inventory_transactions (
        company_id, branch_id, warehouse_id, cost_center_id,
        product_id, transaction_type, quantity_change,
        reference_type, reference_id, notes
      ) VALUES (
        p_company_id, v_booking.branch_id, v_warehouse_id, v_cost_center_id,
        con.product_id, 'service_consumption', -(CEIL(con.quantity)::int),
        'booking_invoice', v_invoice_id,
        con.kind || ' — ' || COALESCE(con.description,'') || ' — حجز ' || v_booking.booking_no
      );
      v_deducted := v_deducted + 1;
    END IF;
  END LOOP;

  IF v_has_sale_products THEN
    -- Case 1: full sales cycle — stay DRAFT (accountant posts, store
    -- manager dispatches). Warehouse must wait for dispatch.
    UPDATE public.invoices
       SET warehouse_status = 'pending'
     WHERE id = v_invoice_id;
  ELSE
    -- Case 2: service-only — post immediately as before.
    IF v_service.product_catalog_id IS NOT NULL THEN
      PERFORM public.execute_sales_invoice_accounting(v_invoice_id);
    END IF;
    UPDATE public.invoices
       SET status = CASE WHEN v_booking.paid_amount >= v_new_total THEN 'paid' ELSE 'sent' END,
           warehouse_status = 'approved'
     WHERE id = v_invoice_id;
  END IF;

  UPDATE public.booking_payments SET invoice_id = v_invoice_id
   WHERE booking_id = p_booking_id AND invoice_id IS NULL;

  UPDATE public.bookings SET
    total_amount = v_new_total,
    status = 'completed', invoice_id = v_invoice_id,
    payment_status = CASE WHEN v_booking.paid_amount >= v_new_total THEN 'paid'
                          WHEN v_booking.paid_amount > 0 THEN 'partially_paid'
                          ELSE COALESCE(v_booking.payment_status,'unpaid') END,
    completed_by = p_completed_by, completed_at = NOW(), updated_by = p_completed_by
   WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true, 'booking_id', p_booking_id, 'status', 'completed',
    'invoice_id', v_invoice_id, 'invoice_no', v_invoice_number,
    'service_subtotal', v_service_subtotal,
    'addon_total', v_addon_total,
    'new_total', v_new_total,
    'invoice_lines', v_lines_added,
    'inventory_deductions', v_deducted,
    'has_sale_products', v_has_sale_products,
    'invoice_status', CASE WHEN v_has_sale_products THEN 'draft'
                           WHEN v_booking.paid_amount >= v_new_total THEN 'paid'
                           ELSE 'sent' END
  );
END;
$$;

-- (3) edit lock: completed booking editable ONLY while its invoice is draft
CREATE OR REPLACE FUNCTION public.assert_booking_editable_for_bundle(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE
AS $$
DECLARE v_status text; v_inv_status text;
BEGIN
  SELECT b.status, i.status INTO v_status, v_inv_status
  FROM public.bookings b
  LEFT JOIN public.invoices i ON i.id = b.invoice_id
  WHERE b.id = p_booking_id;

  IF v_status IS NULL THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF v_status IN ('cancelled','no_show') THEN
    RAISE EXCEPTION 'BOOKING_LOCKED: cannot modify addons after status=%', v_status;
  END IF;
  IF v_status = 'completed' AND v_inv_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'BOOKING_LOCKED: الفاتورة معتمدة — أى تعديل بعد الاعتماد يتم عبر مرتجع المبيعات';
  END IF;
END;
$$;

-- (4) stage-aware role gate: booking_officer edits only BEFORE execution
CREATE OR REPLACE FUNCTION public.assert_booking_addons_permission(
  p_company_id uuid,
  p_booking_id uuid
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_member_branch uuid;
  v_booking public.bookings;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT cm.role, cm.branch_id INTO v_role, v_member_branch
  FROM public.company_members cm
  WHERE cm.company_id = p_company_id AND cm.user_id = v_uid
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'ADDONS_FORBIDDEN: لست عضواً فى هذه الشركة';
  END IF;

  IF v_role IN ('owner','admin','general_manager') THEN RETURN; END IF;

  SELECT * INTO v_booking FROM public.bookings b
  WHERE b.id = p_booking_id AND b.company_id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;

  -- Booking officer: branch scope, and ONLY until execution.
  IF v_role = 'booking_officer'
     AND (v_member_branch IS NULL OR v_member_branch = v_booking.branch_id) THEN
    IF v_booking.status = 'completed' THEN
      RAISE EXCEPTION 'ADDONS_FORBIDDEN: بعد تنفيذ أمر الحجز يقتصر التعديل على الموظف المنفذ (ما دامت الفاتورة مسودة)';
    END IF;
    RETURN;
  END IF;

  -- The assigned executor: before AND after execution (draft window is
  -- enforced by assert_booking_editable_for_bundle).
  IF v_booking.staff_user_id = v_uid
     OR EXISTS (
       SELECT 1 FROM public.booking_staff_assignments bsa
       WHERE bsa.booking_id = p_booking_id AND bsa.user_id = v_uid
     ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'ADDONS_FORBIDDEN: تعديل إضافات الحجز متاح فقط للمالك/الإدارة، مسئول الحجز فى فرعه (قبل التنفيذ)، والموظف المكلف بهذا الحجز';
END;
$$;

-- (5) resync a completed booking's DRAFT invoice after an addon edit
CREATE OR REPLACE FUNCTION public.resync_booking_invoice(
  p_company_id uuid, p_booking_id uuid, p_actor uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booking public.bookings; v_service public.services; v_invoice public.invoices;
  v_service_subtotal NUMERIC; v_addon_total NUMERIC := 0; v_new_total NUMERIC;
  v_goods int := 0; v_lines int := 0; v_deducted int := 0;
  v_actor uuid := COALESCE(auth.uid(), p_actor);
  con RECORD;
BEGIN
  SELECT * INTO v_booking FROM public.bookings
  WHERE id = p_booking_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF v_booking.status <> 'completed' OR v_booking.invoice_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'booking_not_completed');
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = v_booking.invoice_id FOR UPDATE;
  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION 'INVOICE_NOT_DRAFT: الفاتورة معتمدة — أى تعديل يتم عبر مرتجع المبيعات';
  END IF;

  SELECT * INTO v_service FROM public.services WHERE id = v_booking.service_id;

  v_service_subtotal := COALESCE(v_booking.unit_price, 0) * COALESCE(v_booking.quantity, 1);
  SELECT COALESCE(SUM((unit_price * quantity) * (1 - COALESCE(discount_percent,0)/100)), 0)
    INTO v_addon_total
    FROM public.get_booking_line_additions(p_booking_id)
   WHERE unit_price > 0;
  v_new_total := v_service_subtotal + v_addon_total
               - COALESCE(v_booking.discount_amount, 0)
               + COALESCE(v_booking.tax_amount, 0);

  -- Rebuild lines + execution-time consumption from current truth.
  DELETE FROM public.invoice_items WHERE invoice_id = v_invoice.id;
  DELETE FROM public.inventory_transactions
   WHERE company_id = p_company_id
     AND reference_type = 'booking_invoice'
     AND reference_id = v_invoice.id;

  IF v_service.product_catalog_id IS NOT NULL THEN
    INSERT INTO public.invoice_items (
      invoice_id, product_id, quantity, unit_price, tax_rate,
      discount_percent, line_total, returned_quantity, item_type
    ) VALUES (
      v_invoice.id, v_service.product_catalog_id, v_booking.quantity, v_booking.unit_price,
      COALESCE(v_service.tax_rate, 0), 0, v_service_subtotal, 0, 'service'
    );
    v_lines := v_lines + 1;
  END IF;

  FOR con IN SELECT * FROM public.get_booking_line_additions(p_booking_id) LOOP
    INSERT INTO public.invoice_items (
      invoice_id, product_id, quantity, unit_price, tax_rate,
      discount_percent, line_total, returned_quantity, item_type
    ) VALUES (
      v_invoice.id, con.product_id, con.quantity, con.unit_price,
      con.tax_rate, con.discount_percent,
      con.unit_price * con.quantity * (1 - COALESCE(con.discount_percent,0)/100),
      0,
      CASE WHEN con.kind = 'extra' THEN 'product' ELSE 'service' END
    );
    v_lines := v_lines + 1;
    IF con.kind = 'extra' THEN v_goods := v_goods + 1; END IF;

    IF con.kind <> 'extra' AND con.auto_deduct_inventory AND con.quantity > 0 THEN
      INSERT INTO public.inventory_transactions (
        company_id, branch_id, warehouse_id, cost_center_id,
        product_id, transaction_type, quantity_change,
        reference_type, reference_id, notes
      ) VALUES (
        p_company_id, v_booking.branch_id, v_invoice.warehouse_id, v_invoice.cost_center_id,
        con.product_id, 'service_consumption', -(CEIL(con.quantity)::int),
        'booking_invoice', v_invoice.id,
        con.kind || ' — ' || COALESCE(con.description,'') || ' — حجز ' || v_booking.booking_no || ' (مزامنة تعديل)'
      );
      v_deducted := v_deducted + 1;
    END IF;
  END LOOP;

  UPDATE public.invoices
     SET subtotal = v_service_subtotal + v_addon_total,
         total_amount = v_new_total,
         warehouse_status = CASE WHEN v_goods > 0 THEN 'pending' ELSE 'approved' END,
         updated_at = NOW()
   WHERE id = v_invoice.id;

  UPDATE public.bookings
     SET total_amount = v_new_total,
         payment_status = CASE WHEN COALESCE(paid_amount,0) >= v_new_total THEN 'paid'
                               WHEN COALESCE(paid_amount,0) > 0 THEN 'partially_paid'
                               ELSE 'unpaid' END,
         updated_by = v_actor, updated_at = NOW()
   WHERE id = p_booking_id;

  -- Notifications: accountant to act + FYI to owner/GM/branch manager.
  PERFORM public.create_notification(
    p_company_id, 'booking', p_booking_id,
    'تعديل فاتورة حجز ' || v_booking.booking_no,
    'عدّل الموظف المنفذ إضافات أمر الحجز ' || v_booking.booking_no ||
    ' — تمت مزامنة الفاتورة ' || v_invoice.invoice_number ||
    ' (الإجمالى الجديد: ' || TO_CHAR(v_new_total, 'FM999999990.00') || '). برجاء مراجعتها واستكمال الدورة.',
    v_actor, v_booking.branch_id, NULL, NULL,
    'accountant', NULL, 'high',
    'booking_resync_acct:' || v_invoice.id || ':' || TO_CHAR(NOW(), 'YYYYMMDDHH24MI'),
    'warning', 'bookings');

  PERFORM public.create_notification(
    p_company_id, 'booking', p_booking_id,
    'للعلم: تعديل بعد التنفيذ على حجز ' || v_booking.booking_no,
    'تم تعديل إضافات أمر الحجز ' || v_booking.booking_no || ' بعد التنفيذ وقبل اعتماد الفاتورة ' ||
    v_invoice.invoice_number || '. الإجمالى الجديد: ' || TO_CHAR(v_new_total, 'FM999999990.00') || '.',
    v_actor, v_booking.branch_id, NULL, NULL,
    'owner', NULL, 'normal',
    'booking_resync_owner:' || v_invoice.id || ':' || TO_CHAR(NOW(), 'YYYYMMDDHH24MI'),
    'info', 'bookings');

  PERFORM public.create_notification(
    p_company_id, 'booking', p_booking_id,
    'للعلم: تعديل بعد التنفيذ على حجز ' || v_booking.booking_no,
    'تم تعديل إضافات أمر الحجز ' || v_booking.booking_no || ' بعد التنفيذ وقبل اعتماد الفاتورة ' ||
    v_invoice.invoice_number || '. الإجمالى الجديد: ' || TO_CHAR(v_new_total, 'FM999999990.00') || '.',
    v_actor, v_booking.branch_id, NULL, NULL,
    'general_manager', NULL, 'normal',
    'booking_resync_gm:' || v_invoice.id || ':' || TO_CHAR(NOW(), 'YYYYMMDDHH24MI'),
    'info', 'bookings');

  PERFORM public.create_notification(
    p_company_id, 'booking', p_booking_id,
    'للعلم: تعديل بعد التنفيذ على حجز ' || v_booking.booking_no,
    'تم تعديل إضافات أمر الحجز ' || v_booking.booking_no || ' بعد التنفيذ وقبل اعتماد الفاتورة ' ||
    v_invoice.invoice_number || '. الإجمالى الجديد: ' || TO_CHAR(v_new_total, 'FM999999990.00') || '.',
    v_actor, v_booking.branch_id, NULL, NULL,
    'manager', NULL, 'normal',
    'booking_resync_mgr:' || v_invoice.id || ':' || TO_CHAR(NOW(), 'YYYYMMDDHH24MI'),
    'info', 'bookings');

  RETURN jsonb_build_object(
    'success', true, 'invoice_id', v_invoice.id, 'new_total', v_new_total,
    'lines', v_lines, 'goods_lines', v_goods, 'consumption_rows', v_deducted
  );
END;
$$;

-- (6) hook resync into the 4 addon RPCs (post-execution edits)
CREATE OR REPLACE FUNCTION public.add_booking_bundle_selection(
  p_company_id uuid, p_booking_id uuid, p_bundle_item_id uuid,
  p_selected_by uuid, p_quantity_override numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.assert_booking_editable_for_bundle(p_booking_id);
  PERFORM public.assert_booking_addons_permission(p_company_id, p_booking_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.product_bundle_items pbi
     WHERE pbi.id = p_bundle_item_id AND pbi.company_id = p_company_id
       AND pbi.is_optional = true
  ) THEN
    RAISE EXCEPTION 'BUNDLE_ITEM_NOT_OPTIONAL_OR_NOT_FOUND';
  END IF;
  INSERT INTO public.booking_bundle_selections
    (company_id, booking_id, bundle_item_id, quantity_override, selected_by)
  VALUES (p_company_id, p_booking_id, p_bundle_item_id, p_quantity_override,
          COALESCE(auth.uid(), p_selected_by))
  ON CONFLICT (booking_id, bundle_item_id) DO UPDATE
     SET quantity_override = EXCLUDED.quantity_override,
         selected_by = EXCLUDED.selected_by,
         selected_at = NOW()
  RETURNING id INTO v_id;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE id = p_booking_id AND status = 'completed') THEN
    PERFORM public.resync_booking_invoice(p_company_id, p_booking_id, COALESCE(auth.uid(), p_selected_by));
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_booking_bundle_selection(
  p_company_id uuid, p_booking_id uuid, p_bundle_item_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_booking_editable_for_bundle(p_booking_id);
  PERFORM public.assert_booking_addons_permission(p_company_id, p_booking_id);
  DELETE FROM public.booking_bundle_selections
   WHERE booking_id = p_booking_id
     AND bundle_item_id = p_bundle_item_id
     AND company_id = p_company_id;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE id = p_booking_id AND status = 'completed') THEN
    PERFORM public.resync_booking_invoice(p_company_id, p_booking_id, auth.uid());
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_booking_extra_item(
  p_company_id uuid, p_booking_id uuid, p_product_id uuid,
  p_quantity numeric, p_unit_price numeric, p_added_by uuid,
  p_discount_percent numeric DEFAULT 0, p_tax_rate numeric DEFAULT 0,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.assert_booking_editable_for_bundle(p_booking_id);
  PERFORM public.assert_booking_addons_permission(p_company_id, p_booking_id);
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'QTY_MUST_BE_POSITIVE'; END IF;
  IF p_unit_price IS NULL OR p_unit_price < 0 THEN RAISE EXCEPTION 'PRICE_MUST_BE_NON_NEGATIVE'; END IF;
  INSERT INTO public.booking_extra_items
    (company_id, booking_id, product_id, quantity, unit_price,
     discount_percent, tax_rate, notes, added_by)
  VALUES
    (p_company_id, p_booking_id, p_product_id, p_quantity, p_unit_price,
     COALESCE(p_discount_percent,0), COALESCE(p_tax_rate,0), p_notes,
     COALESCE(auth.uid(), p_added_by))
  RETURNING id INTO v_id;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE id = p_booking_id AND status = 'completed') THEN
    PERFORM public.resync_booking_invoice(p_company_id, p_booking_id, COALESCE(auth.uid(), p_added_by));
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_booking_extra_item(
  p_company_id uuid, p_booking_id uuid, p_extra_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_booking_editable_for_bundle(p_booking_id);
  PERFORM public.assert_booking_addons_permission(p_company_id, p_booking_id);
  DELETE FROM public.booking_extra_items
   WHERE id = p_extra_id
     AND booking_id = p_booking_id
     AND company_id = p_company_id;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE id = p_booking_id AND status = 'completed') THEN
    PERFORM public.resync_booking_invoice(p_company_id, p_booking_id, auth.uid());
  END IF;
END;
$$;

-- (7) FIX: warehouse auto-approve fired on invoice INSERT before any
-- items existed → every invoice got auto-approved, skipping the store
-- manager. Keep the insert-time trigger (0 items = service-only so far)
-- but re-evaluate from invoice_items while the invoice is still draft.
CREATE OR REPLACE FUNCTION public.sync_invoice_warehouse_from_items_trg()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_id uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_inv record;
  v_goods integer;
BEGIN
  SELECT id, status, warehouse_status INTO v_inv
  FROM public.invoices WHERE id = v_invoice_id;
  IF v_inv.id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  -- Only self-correct while the document is still a draft; after posting
  -- the warehouse flow owns this column.
  IF v_inv.status <> 'draft' THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COUNT(*) INTO v_goods
    FROM public.invoice_items
   WHERE invoice_id = v_invoice_id
     AND COALESCE(item_type, 'product') NOT IN ('service');

  IF v_goods = 0 AND COALESCE(v_inv.warehouse_status,'') = 'pending' THEN
    UPDATE public.invoices SET warehouse_status = 'approved', updated_at = NOW()
     WHERE id = v_invoice_id;
  ELSIF v_goods > 0 AND COALESCE(v_inv.warehouse_status,'') = 'approved' THEN
    UPDATE public.invoices SET warehouse_status = 'pending', updated_at = NOW()
     WHERE id = v_invoice_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS invoice_items_sync_warehouse_status ON public.invoice_items;
CREATE TRIGGER invoice_items_sync_warehouse_status
AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_warehouse_from_items_trg();

-- ════════════════════════════════════════════════════════════════════════════
-- v3.74.862 — حركات العهدة: تكلفةٌ مسجَّلة، ورابطٌ إلى قيدها
-- ════════════════════════════════════════════════════════════════════════════
--
-- 🔴 **الفجوة** (رُصدت أثناء تتبّع تكلفة الشراء فى ٨٦١):
--
--   حركات «خروج عهدة للفنّى» و«إرجاع عهدة» تُسجَّل:
--     • **بلا تكلفة وحدة ولا إجمالى** (`unit_cost` و`total_cost` غائبتان عن
--       جملة الإدخال أصلاً — لا مُهملتين بل غير مذكورتين).
--     • **وبلا `journal_entry_id`** رغم أن القيد يُنشأ فعلاً بعدها بأسطر،
--       ومعرّفه محفوظٌ فى `v_entry`. لم يكن ينقص إلا سطرُ ربطٍ واحد.
--
-- ⇒ فالحركة موجودة، والقيد موجود، **ولا شىء يصلهما**. ومن يفتح سجل صنفٍ
--   خرج فى عهدة لا يرى قيمته، ولا يصل منه إلى أثره المحاسبى.
--
-- ⇒ والدالتان تحسبان القيمة بالفعل (`v_value` من `calculate_fifo_cost`)
--   وتستعملانها فى القيد — ثم **لا تكتبانها فى الحركة**. المعلومة كانت فى
--   اليد ولم تُسجَّل.
--
-- 🟢 **الإصلاح** — إضافتان لا أكثر، ولا تمسّان أى منطقٍ قائم:
--
--   ١) `unit_cost` و`total_cost` فى جملة الإدخال.
--      والإشارة تتبع العُرف القائم فى المشروع: الإجمالى **موجب** للحركة
--      الخارجة كما فى `production_issue` (كمية −١ · تكلفة ١٠ · إجمالى ١٠).
--
--   ٢) `UPDATE ... SET journal_entry_id = v_entry` بعد نجاح القيد — وهو
--      الأسلوب المعتمَد نفسه المستعمل فى مواضع أخرى بالمشروع.
--
--      ⚠️ وهذا التحديث **لا يصطدم** بحارس `prevent_linked_inventory_modification`:
--         الحارس يمنع تعديل حركةٍ رابطُها **قائمٌ بالفعل** لقيدٍ مُرحَّل، وهنا
--         الرابط `NULL` وقت التحديث. أى أننا نملأ فراغاً ولا نغيّر ثابتاً.
--
-- ⚠️ **ولا تُصحَّح الحركات التاريخية**: بعضها مرتبطٌ بقيودٍ مُرحَّلة، والحارس
--    يمنع تعديلها بلا مَخرج — وهى نفس فلسفة «القيد يُعكَس ولا يُحرَّر».
--    تبقى موثَّقة، والحارس الجديد يبدأ من تاريخ هذا الترحيل.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- ١) خروج العهدة
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_post_booking_custody_out(p_withdrawal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  w public.booking_stock_withdrawals;
  v_booking public.bookings;
  v_service public.services;
  v_branch public.branches;
  v_tracked boolean; v_cost numeric; v_qty int; v_value numeric; v_fifo numeric;
  v_custody_acct uuid; v_inv_acct uuid; v_cc uuid; v_je jsonb;
  v_valued boolean;
  v_trace uuid;
  v_inv_txn uuid;
  v_entry uuid;
BEGIN
  -- v3.74.749 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access_by_row('booking_stock_withdrawals', p_withdrawal_id);

  SELECT * INTO w FROM public.booking_stock_withdrawals WHERE id = p_withdrawal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF w.status <> 'approved' THEN RETURN jsonb_build_object('ok',false,'reason','not_approved'); END IF;
  IF COALESCE(w.custody_status,'none') = 'out' THEN RETURN jsonb_build_object('ok',true,'reason','already_out'); END IF;

  SELECT COALESCE(track_inventory,false), COALESCE(cost_price,0)
    INTO v_tracked, v_cost FROM public.products WHERE id = w.product_id;
  v_qty := CEIL(COALESCE(w.quantity,0))::int;

  -- Only a non-stocked item or a zero quantity may legitimately move nothing.
  IF NOT COALESCE(v_tracked,false) OR v_qty <= 0 THEN
    UPDATE public.booking_stock_withdrawals SET custody_status='none' WHERE id = p_withdrawal_id;
    RETURN jsonb_build_object('ok',true,'reason','not_tracked_or_zero_qty');
  END IF;

  -- v3.74.774 — open the audit trace before anything moves, so the links below
  -- have something to attach to. Failure here must not stop the operation.
  BEGIN
    v_trace := public.create_financial_operation_trace(
      w.company_id,
      'booking_stock_withdrawal',
      w.id,
      'booking_custody_out',
      auth.uid(),
      'booking_custody_out:' || w.id::text,
      NULL,
      jsonb_build_object('withdrawal_id', w.id, 'booking_id', w.booking_id,
                         'product_id', w.product_id, 'quantity', v_qty),
      CASE WHEN auth.uid() IS NULL
           THEN jsonb_build_array('auto_approved_no_store_manager')
           ELSE NULL END
    );
    PERFORM public.link_financial_operation_trace(
      v_trace, 'booking_stock_withdrawal', w.id, 'source', 'booking_custody_out');
    PERFORM public.link_financial_operation_trace(
      v_trace, 'booking', w.booking_id, 'booking', 'booking_custody_out');
  EXCEPTION WHEN OTHERS THEN
    v_trace := NULL;
    RAISE WARNING 'CUSTODY_OUT_TRACE_FAILED: withdrawal % — %', p_withdrawal_id, SQLERRM;
  END;

  -- Value the custody from the FIFO batches. calculate_fifo_cost COMPUTES ONLY —
  -- it does not consume. The batches must stay intact until the service is really
  -- executed, otherwise custody-out would deplete stock it has not consumed.
  v_fifo := public.calculate_fifo_cost(w.product_id, w.warehouse_id, v_qty);
  IF COALESCE(v_fifo, 0) > 0 THEN
    v_value := v_fifo;
  ELSE
    v_value := v_qty * COALESCE(v_cost, 0);
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = w.booking_id;
  SELECT * INTO v_service FROM public.services WHERE id = v_booking.service_id;
  SELECT * INTO v_branch  FROM public.branches WHERE id = w.branch_id;

  SELECT id INTO v_custody_acct FROM public.chart_of_accounts
    WHERE company_id = w.company_id AND is_active
      AND (account_code = '1145' OR sub_type = 'inventory_in_custody')
    ORDER BY CASE WHEN account_code='1145' THEN 0 ELSE 1 END LIMIT 1;
  SELECT id INTO v_inv_acct FROM public.chart_of_accounts
    WHERE company_id = w.company_id AND is_active AND sub_type = 'inventory' LIMIT 1;

  v_cc := COALESCE(v_booking.cost_center_id, v_service.cost_center_id, v_branch.default_cost_center_id);
  IF v_cc IS NULL THEN SELECT id INTO v_cc FROM public.cost_centers WHERE company_id = w.company_id LIMIT 1; END IF;

  -- Physical movement: unconditional once the item is stocked and the quantity real.
  -- v3.74.862 — القيمة كانت محسوبةً أعلاه وتُستعمل فى القيد، ولا تُكتب هنا.
  -- الإجمالى موجب للحركة الخارجة، اتّباعاً لعُرف `production_issue`.
  INSERT INTO public.inventory_transactions (
    company_id, branch_id, warehouse_id, cost_center_id, product_id,
    transaction_type, quantity_change, reference_type, reference_id, notes,
    unit_cost, total_cost
  ) VALUES (
    w.company_id, w.branch_id, w.warehouse_id, v_cc, w.product_id,
    'booking_custody_out', -v_qty, 'booking_stock_withdrawal', w.id,
    'خروج عهدة للفنّي — حجز ' || COALESCE(v_booking.booking_no,''),
    CASE WHEN v_qty > 0 THEN ROUND(v_value / v_qty, 6) ELSE NULL END,
    v_value
  )
  RETURNING id INTO v_inv_txn;

  v_valued := (v_value > 0 AND v_custody_acct IS NOT NULL AND v_inv_acct IS NOT NULL);

  IF v_valued THEN
    v_je := public.create_journal_entry_atomic(
      w.company_id, 'booking_custody_out', w.id, CURRENT_DATE,
      'خروج مواد لعهدة الفنّي — حجز ' || COALESCE(v_booking.booking_no,''),
      w.branch_id, v_cc, w.warehouse_id,
      jsonb_build_array(
        jsonb_build_object('account_id', v_custody_acct, 'debit_amount', v_value, 'credit_amount', 0, 'description','مواد في عهدة الفنّي'),
        jsonb_build_object('account_id', v_inv_acct, 'debit_amount', 0, 'credit_amount', v_value, 'description','تخفيض المخزون - عهدة')
      )
    );
    IF NOT COALESCE((v_je->>'success')::boolean, false) THEN
      RAISE EXCEPTION 'CUSTODY_OUT_JE_FAILED: %', COALESCE(v_je->>'error','unknown');
    END IF;
    v_entry := (v_je->>'entry_id')::uuid;

    -- v3.74.862 — 🔗 السطر الذى كان ناقصاً: تُربط الحركة بقيدها.
    -- لا يصطدم بحارس `prevent_linked_inventory_modification` لأن الرابط `NULL`
    -- الآن: نملأ فراغاً ولا نغيّر ثابتاً. وفشله لا يُسقط عمليةً تمّت بالفعل.
    IF v_inv_txn IS NOT NULL AND v_entry IS NOT NULL THEN
      BEGIN
        UPDATE public.inventory_transactions
           SET journal_entry_id = v_entry
         WHERE id = v_inv_txn AND journal_entry_id IS NULL;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'CUSTODY_OUT_LINK_FAILED: movement % ← entry % — %', v_inv_txn, v_entry, SQLERRM;
      END;
    END IF;
  ELSE
    -- Stock moved but could not be valued. Never silent: this surfaces in the logs
    -- and in the returned payload so it can be corrected, instead of the old
    -- behaviour where the whole movement vanished behind ok=true.
    RAISE WARNING 'CUSTODY_OUT_UNVALUED: withdrawal % moved % unit(s) of product % with no cost basis',
      p_withdrawal_id, v_qty, w.product_id;
  END IF;

  -- v3.74.774 — attach what was actually produced. Wrapped for the same reason
  -- as above: the movement and the entry are already committed facts.
  IF v_trace IS NOT NULL THEN
    BEGIN
      IF v_inv_txn IS NOT NULL THEN
        PERFORM public.link_financial_operation_trace(
          v_trace, 'inventory_transaction', v_inv_txn, 'inventory_transaction', 'booking_custody_out');
      END IF;
      IF v_entry IS NOT NULL THEN
        PERFORM public.link_financial_operation_trace(
          v_trace, 'journal_entry', v_entry, 'journal_entry', 'booking_custody_out');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'CUSTODY_OUT_TRACE_LINK_FAILED: withdrawal % — %', p_withdrawal_id, SQLERRM;
    END;
  END IF;

  UPDATE public.booking_stock_withdrawals
     SET custody_status='out', custody_value=v_value, custody_out_at=now()
   WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object('ok',true,'value',v_value,'qty',v_qty,'valued',v_valued,
                            'trace_id', v_trace);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ٢) إرجاع العهدة
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_post_booking_custody_return(p_withdrawal_id uuid, p_note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  w public.booking_stock_withdrawals;
  v_booking public.bookings; v_service public.services; v_branch public.branches;
  v_qty int; v_value numeric; v_custody_acct uuid; v_inv_acct uuid; v_cc uuid; v_je jsonb;
  v_trace uuid; v_inv_txn uuid; v_entry uuid;
BEGIN
  -- v3.74.749 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access_by_row('booking_stock_withdrawals', p_withdrawal_id);

  SELECT * INTO w FROM public.booking_stock_withdrawals WHERE id = p_withdrawal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF COALESCE(w.custody_status,'none') <> 'out' THEN RETURN jsonb_build_object('ok',true,'reason','nothing_out'); END IF;

  v_qty := CEIL(COALESCE(w.quantity,0))::int;
  v_value := COALESCE(w.custody_value, 0);

  -- v3.74.775 — open the trace before anything moves.
  BEGIN
    v_trace := public.create_financial_operation_trace(
      w.company_id, 'booking_stock_withdrawal', w.id, 'booking_custody_return',
      auth.uid(),
      'booking_custody_return:' || w.id::text,
      NULL,
      jsonb_build_object('withdrawal_id', w.id, 'booking_id', w.booking_id,
                         'product_id', w.product_id, 'quantity', v_qty, 'note', p_note),
      CASE WHEN auth.uid() IS NULL
           THEN jsonb_build_array('auto_returned_no_store_manager') ELSE NULL END
    );
    PERFORM public.link_financial_operation_trace(
      v_trace, 'booking_stock_withdrawal', w.id, 'source', 'booking_custody_return');
    PERFORM public.link_financial_operation_trace(
      v_trace, 'booking', w.booking_id, 'booking', 'booking_custody_return');
  EXCEPTION WHEN OTHERS THEN
    v_trace := NULL;
    RAISE WARNING 'CUSTODY_RETURN_TRACE_FAILED: withdrawal % — %', p_withdrawal_id, SQLERRM;
  END;

  SELECT * INTO v_booking FROM public.bookings WHERE id = w.booking_id;
  SELECT * INTO v_service FROM public.services WHERE id = v_booking.service_id;
  SELECT * INTO v_branch  FROM public.branches WHERE id = w.branch_id;

  SELECT id INTO v_custody_acct FROM public.chart_of_accounts
    WHERE company_id = w.company_id AND is_active
      AND (account_code = '1145' OR sub_type = 'inventory_in_custody')
    ORDER BY CASE WHEN account_code='1145' THEN 0 ELSE 1 END LIMIT 1;
  SELECT id INTO v_inv_acct FROM public.chart_of_accounts
    WHERE company_id = w.company_id AND is_active AND sub_type = 'inventory' LIMIT 1;

  v_cc := COALESCE(v_booking.cost_center_id, v_service.cost_center_id, v_branch.default_cost_center_id);
  IF v_cc IS NULL THEN SELECT id INTO v_cc FROM public.cost_centers WHERE company_id = w.company_id LIMIT 1; END IF;

  IF v_qty > 0 THEN
    -- v3.74.862 — القيمة (`custody_value`) كانت معروفةً ولا تُكتب فى الحركة.
    INSERT INTO public.inventory_transactions (
      company_id, branch_id, warehouse_id, cost_center_id, product_id,
      transaction_type, quantity_change, reference_type, reference_id, notes,
      unit_cost, total_cost
    ) VALUES (
      w.company_id, w.branch_id, w.warehouse_id, v_cc, w.product_id,
      'booking_custody_return', v_qty, 'booking_stock_withdrawal', w.id,
      'إرجاع عهدة للمخزن — حجز ' || COALESCE(v_booking.booking_no,'') || COALESCE(' — ' || p_note,''),
      CASE WHEN v_qty > 0 THEN ROUND(v_value / v_qty, 6) ELSE NULL END,
      v_value
    )
    RETURNING id INTO v_inv_txn;
  END IF;

  IF v_value > 0 AND v_custody_acct IS NOT NULL AND v_inv_acct IS NOT NULL THEN
    v_je := public.create_journal_entry_atomic(
      w.company_id, 'booking_custody_return', w.id, CURRENT_DATE,
      'إرجاع مواد من عهدة الفنّي للمخزن — حجز ' || COALESCE(v_booking.booking_no,''),
      w.branch_id, v_cc, w.warehouse_id,
      jsonb_build_array(
        jsonb_build_object('account_id', v_inv_acct, 'debit_amount', v_value, 'credit_amount', 0, 'description','عودة المخزون من العهدة'),
        jsonb_build_object('account_id', v_custody_acct, 'debit_amount', 0, 'credit_amount', v_value, 'description','تصفية عهدة الفنّي')
      )
    );
    IF NOT COALESCE((v_je->>'success')::boolean, false) THEN
      RAISE EXCEPTION 'CUSTODY_RETURN_JE_FAILED: %', COALESCE(v_je->>'error','unknown');
    END IF;
    v_entry := (v_je->>'entry_id')::uuid;

    -- v3.74.862 — 🔗 الربط الناقص. انظر شرحه فى دالة الخروج أعلاه.
    IF v_inv_txn IS NOT NULL AND v_entry IS NOT NULL THEN
      BEGIN
        UPDATE public.inventory_transactions
           SET journal_entry_id = v_entry
         WHERE id = v_inv_txn AND journal_entry_id IS NULL;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'CUSTODY_RETURN_LINK_FAILED: movement % ← entry % — %', v_inv_txn, v_entry, SQLERRM;
      END;
    END IF;
  END IF;

  -- v3.74.775 — link what was produced. Wrapped: both are committed facts.
  IF v_trace IS NOT NULL THEN
    BEGIN
      IF v_inv_txn IS NOT NULL THEN
        PERFORM public.link_financial_operation_trace(
          v_trace, 'inventory_transaction', v_inv_txn, 'inventory_transaction', 'booking_custody_return');
      END IF;
      IF v_entry IS NOT NULL THEN
        PERFORM public.link_financial_operation_trace(
          v_trace, 'journal_entry', v_entry, 'journal_entry', 'booking_custody_return');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'CUSTODY_RETURN_TRACE_LINK_FAILED: withdrawal % — %', p_withdrawal_id, SQLERRM;
    END;
  END IF;

  UPDATE public.booking_stock_withdrawals
     SET custody_status='returned', custody_returned_at=now()
   WHERE id = p_withdrawal_id;
  RETURN jsonb_build_object('ok',true,'value',v_value,'qty',v_qty,'trace_id',v_trace);
END;
$function$;

COMMIT;

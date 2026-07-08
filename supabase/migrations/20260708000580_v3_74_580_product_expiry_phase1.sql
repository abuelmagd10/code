-- =====================================================================
-- v3.74.580 — Product expiry tracking, Phase 1 (owner-approved scope)
-- (applied to production via Supabase MCP on 2026-07-08; mirrored here)
--
--   * expiry lives on the FIFO lot (batch), not the product
--   * products.shelf_life_days (optional) auto-stamps expiry on every
--     new lot from ANY source (purchase, opening, manufacturing,
--     return-reversal) via a BEFORE INSERT trigger on fifo_cost_lots
--   * update_lot_expiry() RPC for manual per-lot correction (report UI)
--   * daily pg_cron job creates idempotent notifications (event_key per
--     lot per stage) for lots expiring within 30 days / expired,
--     addressed to store_manager/warehouse_manager/manager (branch) +
--     owner
--   READ/ENTRY ONLY: no costing, posting, or sales-flow behavior change.
-- =====================================================================

-- (1) columns
ALTER TABLE public.fifo_cost_lots
  ADD COLUMN IF NOT EXISTS expiry_date date NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS shelf_life_days integer NULL
  CHECK (shelf_life_days IS NULL OR shelf_life_days > 0);

CREATE INDEX IF NOT EXISTS idx_fifo_lots_expiry
  ON public.fifo_cost_lots (company_id, expiry_date)
  WHERE expiry_date IS NOT NULL AND remaining_quantity > 0;

-- (2) auto-stamp expiry on every new lot when the product has a
--     default shelf life and no explicit expiry was provided.
CREATE OR REPLACE FUNCTION public.auto_stamp_lot_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE v_days integer;
BEGIN
  IF NEW.expiry_date IS NULL THEN
    SELECT shelf_life_days INTO v_days FROM public.products WHERE id = NEW.product_id;
    IF v_days IS NOT NULL AND v_days > 0 THEN
      NEW.expiry_date := COALESCE(NEW.lot_date, CURRENT_DATE) + v_days;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fifo_lot_auto_expiry_trg ON public.fifo_cost_lots;
CREATE TRIGGER fifo_lot_auto_expiry_trg
BEFORE INSERT ON public.fifo_cost_lots
FOR EACH ROW EXECUTE FUNCTION public.auto_stamp_lot_expiry();

-- (3) manual per-lot expiry correction (used by the live expiry report)
CREATE OR REPLACE FUNCTION public.update_lot_expiry(
  p_company_id uuid, p_lot_id uuid, p_expiry_date date
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text; v_member_branch uuid; v_lot_branch uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT cm.role, cm.branch_id INTO v_role, v_member_branch
    FROM public.company_members cm
    WHERE cm.company_id = p_company_id AND cm.user_id = v_uid
    LIMIT 1;
    IF v_role IS NULL THEN
      RAISE EXCEPTION 'EXPIRY_FORBIDDEN: لست عضواً فى هذه الشركة';
    END IF;
    IF v_role NOT IN ('owner','admin','general_manager','store_manager','warehouse_manager') THEN
      RAISE EXCEPTION 'EXPIRY_FORBIDDEN: تعديل صلاحية الدفعات متاح للإدارة ومسئولى المخازن فقط';
    END IF;
    IF v_role IN ('store_manager','warehouse_manager') AND v_member_branch IS NOT NULL THEN
      SELECT branch_id INTO v_lot_branch FROM public.fifo_cost_lots
      WHERE id = p_lot_id AND company_id = p_company_id;
      IF v_lot_branch IS DISTINCT FROM v_member_branch THEN
        RAISE EXCEPTION 'EXPIRY_FORBIDDEN: الدفعة خارج نطاق فرعك';
      END IF;
    END IF;
  END IF;

  UPDATE public.fifo_cost_lots
     SET expiry_date = p_expiry_date, updated_at = NOW()
   WHERE id = p_lot_id AND company_id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
END;
$$;

-- (4) daily expiry check → idempotent notifications
CREATE OR REPLACE FUNCTION public.check_product_expiry_notifications()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec RECORD;
  v_owner uuid;
  v_stage text;
  v_title text;
  v_msg text;
  v_sent int := 0;
  v_role text;
BEGIN
  FOR rec IN
    SELECT l.id AS lot_id, l.company_id, l.branch_id, l.warehouse_id,
           l.expiry_date, l.remaining_quantity,
           p.name AS product_name, p.sku,
           b.name AS branch_name
    FROM public.fifo_cost_lots l
    JOIN public.products p ON p.id = l.product_id
    LEFT JOIN public.branches b ON b.id = l.branch_id
    WHERE l.expiry_date IS NOT NULL
      AND l.remaining_quantity > 0
      AND l.expiry_date <= CURRENT_DATE + 30
  LOOP
    v_stage := CASE WHEN rec.expiry_date < CURRENT_DATE THEN 'expired' ELSE 'expiring' END;

    IF v_stage = 'expired' THEN
      v_title := '⛔ انتهت صلاحية دفعة: ' || rec.product_name;
      v_msg := 'انتهت صلاحية دفعة من «' || rec.product_name || '» (' || COALESCE(rec.sku,'') || ') فى '
        || TO_CHAR(rec.expiry_date, 'YYYY-MM-DD')
        || ' — الكمية المتبقية: ' || rec.remaining_quantity
        || COALESCE(' · الفرع: ' || rec.branch_name, '')
        || '. يُنصح بحصرها وإهلاكها عبر دورة إهلاك المخزون.';
    ELSE
      v_title := '⚠️ اقتراب انتهاء صلاحية: ' || rec.product_name;
      v_msg := 'دفعة من «' || rec.product_name || '» (' || COALESCE(rec.sku,'') || ') تنتهى صلاحيتها فى '
        || TO_CHAR(rec.expiry_date, 'YYYY-MM-DD')
        || ' (خلال ' || (rec.expiry_date - CURRENT_DATE) || ' يوم)'
        || ' — الكمية المتبقية: ' || rec.remaining_quantity
        || COALESCE(' · الفرع: ' || rec.branch_name, '')
        || '. يُنصح بتصريفها أولاً.';
    END IF;

    SELECT user_id INTO v_owner FROM public.company_members
    WHERE company_id = rec.company_id AND role = 'owner' LIMIT 1;

    FOREACH v_role IN ARRAY ARRAY['store_manager','warehouse_manager','manager','owner'] LOOP
      BEGIN
        PERFORM public.create_notification(
          rec.company_id, 'inventory', rec.lot_id,
          v_title, v_msg,
          v_owner, rec.branch_id, NULL, rec.warehouse_id,
          v_role, NULL,
          CASE WHEN v_stage = 'expired' THEN 'high' ELSE 'normal' END,
          'lot_expiry:' || rec.lot_id || ':' || v_stage || ':' || v_role,
          CASE WHEN v_stage = 'expired' THEN 'error' ELSE 'warning' END,
          'inventory');
        v_sent := v_sent + 1;
      EXCEPTION WHEN OTHERS THEN
        -- notification failures must never kill the sweep
        NULL;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'notifications_attempted', v_sent, 'ran_at', NOW());
END;
$$;

-- (5) schedule daily at 05:00 UTC (before the working day in Egypt)
SELECT cron.schedule(
  'daily-product-expiry-check',
  '0 5 * * *',
  $$SELECT public.check_product_expiry_notifications()$$
);

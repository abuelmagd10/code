-- =====================================================================
-- v3.74.586 — Carton packaging + lot numbers + receipt lot-splitting
-- (applied to production via Supabase MCP on 2026-07-09; mirrored here)
--
--  * products.units_per_carton (optional) → UI shows qty as cartons
--  * fifo_cost_lots.lot_number: short human-writable code (L2607-0001)
--    auto-assigned per company via a counter table (existing lots
--    backfilled oldest-first)
--  * split_fifo_lot(): store manager splits an UNCONSUMED lot into
--    sub-lots (one per carton batch) each with its own expiry; unit
--    cost/branch/warehouse copied — costing totals unchanged
--  * FEFO is advisory (guidance in UI), NOT enforced in dispatch
-- =====================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS units_per_carton integer NULL
  CHECK (units_per_carton IS NULL OR units_per_carton > 0);

ALTER TABLE public.fifo_cost_lots
  ADD COLUMN IF NOT EXISTS lot_number text NULL;

-- per-company lot counter
CREATE TABLE IF NOT EXISTS public.lot_number_counters (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  last_value bigint NOT NULL DEFAULT 0
);
ALTER TABLE public.lot_number_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lot_counters_company_members ON public.lot_number_counters;
CREATE POLICY lot_counters_company_members ON public.lot_number_counters
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = lot_number_counters.company_id
              AND cm.user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.next_lot_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE v_next bigint;
BEGIN
  INSERT INTO public.lot_number_counters (company_id, last_value)
  VALUES (p_company_id, 1)
  ON CONFLICT (company_id) DO UPDATE
    SET last_value = lot_number_counters.last_value + 1
  RETURNING last_value INTO v_next;
  RETURN 'L' || TO_CHAR(NOW(), 'YYMM') || '-' || LPAD(v_next::text, 4, '0');
END;
$$;

-- auto-assign lot_number on new lots (alongside the v3.74.580 expiry stamp)
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
  -- v3.74.586 — human-writable lot code for the physical carton
  IF NEW.lot_number IS NULL THEN
    NEW.lot_number := public.next_lot_number(NEW.company_id);
  END IF;
  RETURN NEW;
END;
$$;

-- backfill numbers for existing lots (oldest first, stable order)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, company_id FROM public.fifo_cost_lots
           WHERE lot_number IS NULL ORDER BY created_at, id LOOP
    UPDATE public.fifo_cost_lots
       SET lot_number = public.next_lot_number(r.company_id)
     WHERE id = r.id;
  END LOOP;
END $$;

-- =====================================================================
-- split an unconsumed lot into sub-lots (per-carton expiry)
-- p_splits: jsonb array [{"quantity": 10, "expiry_date": "2027-07-01"}, ...]
-- =====================================================================
CREATE OR REPLACE FUNCTION public.split_fifo_lot(
  p_company_id uuid, p_lot_id uuid, p_splits jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text; v_member_branch uuid;
  v_lot public.fifo_cost_lots;
  v_sum numeric := 0;
  v_item jsonb;
  v_qty numeric;
  v_first boolean := true;
  v_created int := 0;
  v_numbers text[] := '{}';
  v_new_id uuid;
BEGIN
  -- role gate (mirror of update_lot_expiry v3.74.580)
  IF v_uid IS NOT NULL THEN
    SELECT cm.role, cm.branch_id INTO v_role, v_member_branch
    FROM public.company_members cm
    WHERE cm.company_id = p_company_id AND cm.user_id = v_uid LIMIT 1;
    IF v_role IS NULL THEN
      RAISE EXCEPTION 'LOT_SPLIT_FORBIDDEN: لست عضواً فى هذه الشركة';
    END IF;
    IF v_role NOT IN ('owner','admin','general_manager','store_manager','warehouse_manager') THEN
      RAISE EXCEPTION 'LOT_SPLIT_FORBIDDEN: تقسيم الدفعات متاح للإدارة ومسئولى المخازن فقط';
    END IF;
  END IF;

  SELECT * INTO v_lot FROM public.fifo_cost_lots
  WHERE id = p_lot_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;

  IF v_uid IS NOT NULL AND v_role IN ('store_manager','warehouse_manager')
     AND v_member_branch IS NOT NULL
     AND v_lot.branch_id IS DISTINCT FROM v_member_branch THEN
    RAISE EXCEPTION 'LOT_SPLIT_FORBIDDEN: الدفعة خارج نطاق فرعك';
  END IF;

  -- only untouched lots can be split (no consumptions yet)
  IF v_lot.remaining_quantity <> v_lot.original_quantity
     OR EXISTS (SELECT 1 FROM public.fifo_lot_consumptions c WHERE c.lot_id = p_lot_id) THEN
    RAISE EXCEPTION 'LOT_SPLIT_NOT_ALLOWED: لا يمكن تقسيم دفعة بدأ الصرف منها — قسّمها فور الاستلام';
  END IF;

  IF p_splits IS NULL OR jsonb_typeof(p_splits) <> 'array' OR jsonb_array_length(p_splits) < 2 THEN
    RAISE EXCEPTION 'LOT_SPLIT_INVALID: التقسيم يحتاج سطرين على الأقل';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'LOT_SPLIT_INVALID: كل سطر يجب أن يحمل كمية موجبة'; END IF;
    v_sum := v_sum + v_qty;
  END LOOP;
  IF v_sum <> v_lot.original_quantity THEN
    RAISE EXCEPTION 'LOT_SPLIT_INVALID: مجموع الكميات (%) لا يساوى كمية الدفعة (%)', v_sum, v_lot.original_quantity;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    v_qty := (v_item->>'quantity')::numeric;
    IF v_first THEN
      -- first split keeps the original row (and its lot_number)
      UPDATE public.fifo_cost_lots
         SET original_quantity = v_qty,
             remaining_quantity = v_qty,
             expiry_date = COALESCE((v_item->>'expiry_date')::date, expiry_date),
             updated_at = NOW()
       WHERE id = p_lot_id;
      v_numbers := array_append(v_numbers, v_lot.lot_number);
      v_first := false;
    ELSE
      INSERT INTO public.fifo_cost_lots (
        company_id, product_id, lot_date, lot_type, reference_type, reference_id,
        original_quantity, remaining_quantity, unit_cost, notes,
        branch_id, warehouse_id, purchase_date, expiry_date
      ) VALUES (
        v_lot.company_id, v_lot.product_id, v_lot.lot_date, v_lot.lot_type,
        v_lot.reference_type, v_lot.reference_id,
        v_qty, v_qty, v_lot.unit_cost,
        COALESCE(v_lot.notes,'') || ' (مقسمة من ' || COALESCE(v_lot.lot_number,'?') || ')',
        v_lot.branch_id, v_lot.warehouse_id, v_lot.purchase_date,
        (v_item->>'expiry_date')::date
      ) RETURNING id INTO v_new_id;
      v_created := v_created + 1;
      v_numbers := array_append(v_numbers,
        (SELECT lot_number FROM public.fifo_cost_lots WHERE id = v_new_id));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true, 'lots_created', v_created + 1,
    'lot_numbers', to_jsonb(v_numbers)
  );
END;
$$;

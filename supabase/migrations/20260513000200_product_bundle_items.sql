-- ==============================================================================
-- Req 2 / Phase B.1 — Product Bundle Items
-- ==============================================================================
-- Purpose:
--   New sidecar table that lets any product (parent) ship with a flat list of
--   accompanying products (children) on each sale — without touching
--   invoice_items, sales_order_items, or the accounting / inventory pipeline.
--
-- Design constraints (agreed):
--   * NEVER modify products, invoice_items, sales_order_items, or any
--     accounting / inventory RPC. Bundles are a NEW layer above the existing
--     pipeline.
--   * The UI expands the bundle into independent line rows BEFORE submitting
--     an invoice or sales order; the DB-side validator is a defensive guard
--     for non-UI callers (mobile, API, scripts).
--   * Pricing is always read from products at expansion time
--     (Single Source of Truth — same philosophy as Req 1).
--   * No recursive bundles (level-1 prevention is enough to make level-N
--     impossible by induction).
--
-- Contents:
--   1. CREATE TABLE product_bundle_items + indexes + constraints
--   2. RLS policies (mirrors products: is_company_member / can_modify_data /
--      can_delete_data, with an extra owner fallback)
--   3. Triggers:
--        * bdl_set_updated_at
--        * bdl_validate_company_match
--        * bdl_no_recursion
--   4. Helper RPCs:
--        * bdl_expand_product_bundle(p_product_id, p_parent_qty, p_company_id)
--            → JSONB array ready to merge into invoice items
--        * bdl_validate_bundle_completeness(p_items jsonb, p_company_id)
--            → JSONB { complete, missing[] } for defensive API guard
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1) Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_bundle_items (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant isolation
  company_id               UUID         NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- The product the customer buys
  parent_product_id        UUID         NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,

  -- The product that gets added alongside it
  child_product_id         UUID         NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,

  -- How many child units per ONE parent unit (final qty = quantity × parent_qty)
  quantity                 NUMERIC(18,4) NOT NULL DEFAULT 1,

  -- Behaviour flags
  is_optional              BOOLEAN      NOT NULL DEFAULT false,
  auto_deduct_inventory    BOOLEAN      NOT NULL DEFAULT true,

  -- Pricing handling on the resulting invoice line
  --   'add_to_total' → child sold at its own catalog price (adds to total)
  --   'included'     → child line at 0 (already paid via parent)
  --   'free'         → child line at 0 (gift); COGS still posts
  price_handling           TEXT         NOT NULL DEFAULT 'add_to_total',

  -- Presentation
  display_order            INTEGER      NOT NULL DEFAULT 0,
  notes                    TEXT,

  -- Audit
  created_by               UUID,
  updated_by               UUID,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- A given child appears at most once under a given parent
  CONSTRAINT uq_pbi_parent_child UNIQUE (parent_product_id, child_product_id),

  -- Sanity checks
  CONSTRAINT chk_pbi_parent_not_child CHECK (parent_product_id <> child_product_id),
  CONSTRAINT chk_pbi_quantity_positive CHECK (quantity > 0),
  CONSTRAINT chk_pbi_price_handling CHECK (price_handling IN ('add_to_total','included','free'))
);

COMMENT ON TABLE public.product_bundle_items IS
  'Sales bundle items — children products attached to a parent for invoicing. NOT to be confused with manufacturing_bom_lines.';
COMMENT ON COLUMN public.product_bundle_items.auto_deduct_inventory IS
  'When true, child inventory is deducted on invoice posting (respects products.track_inventory). When false, item is sold without inventory impact (e.g., service add-ons).';
COMMENT ON COLUMN public.product_bundle_items.price_handling IS
  'add_to_total: child price added to invoice. included: child price is 0 (already in parent price). free: gift, price is 0.';
COMMENT ON COLUMN public.product_bundle_items.notes IS
  'Internal notes for the bundle line (visible in the bundle editor UI only).';

-- ------------------------------------------------------------------------------
-- 2) Indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pbi_parent ON public.product_bundle_items (parent_product_id);
CREATE INDEX IF NOT EXISTS idx_pbi_child  ON public.product_bundle_items (child_product_id);
CREATE INDEX IF NOT EXISTS idx_pbi_company_parent
  ON public.product_bundle_items (company_id, parent_product_id);

-- ------------------------------------------------------------------------------
-- 3) RLS — mirrors products
-- ------------------------------------------------------------------------------
ALTER TABLE public.product_bundle_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pbi_select"         ON public.product_bundle_items;
DROP POLICY IF EXISTS "pbi_insert"         ON public.product_bundle_items;
DROP POLICY IF EXISTS "pbi_update"         ON public.product_bundle_items;
DROP POLICY IF EXISTS "pbi_delete"         ON public.product_bundle_items;
DROP POLICY IF EXISTS "pbi_owner_select"   ON public.product_bundle_items;
DROP POLICY IF EXISTS "pbi_owner_dml"      ON public.product_bundle_items;

-- Members can read
CREATE POLICY "pbi_select" ON public.product_bundle_items FOR SELECT
  USING (public.is_company_member(company_id));

-- Members with write permission can insert
CREATE POLICY "pbi_insert" ON public.product_bundle_items FOR INSERT
  WITH CHECK (public.can_modify_data(company_id));

-- Members with write permission can update
CREATE POLICY "pbi_update" ON public.product_bundle_items FOR UPDATE
  USING (public.can_modify_data(company_id))
  WITH CHECK (public.can_modify_data(company_id));

-- Members with delete permission can delete
CREATE POLICY "pbi_delete" ON public.product_bundle_items FOR DELETE
  USING (public.can_delete_data(company_id));

-- Company owner fallback (matches products_owner_select / products_owner_dml)
CREATE POLICY "pbi_owner_select" ON public.product_bundle_items FOR SELECT
  USING (company_id IN (
    SELECT id FROM public.companies WHERE user_id = auth.uid()
  ));

CREATE POLICY "pbi_owner_dml" ON public.product_bundle_items FOR ALL
  USING (company_id IN (
    SELECT id FROM public.companies WHERE user_id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT id FROM public.companies WHERE user_id = auth.uid()
  ));

-- ------------------------------------------------------------------------------
-- 4) Triggers
-- ------------------------------------------------------------------------------

-- 4a) updated_at maintenance
CREATE OR REPLACE FUNCTION public.bdl_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bdl_trg_set_updated_at ON public.product_bundle_items;
CREATE TRIGGER bdl_trg_set_updated_at
  BEFORE UPDATE ON public.product_bundle_items
  FOR EACH ROW EXECUTE FUNCTION public.bdl_set_updated_at();

-- 4b) parent + child must belong to the same company as the row
CREATE OR REPLACE FUNCTION public.bdl_validate_company_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent_company UUID;
  v_child_company  UUID;
BEGIN
  SELECT company_id INTO v_parent_company FROM public.products WHERE id = NEW.parent_product_id;
  SELECT company_id INTO v_child_company  FROM public.products WHERE id = NEW.child_product_id;

  IF v_parent_company IS NULL THEN
    RAISE EXCEPTION 'parent_product_id (%) does not exist', NEW.parent_product_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_child_company IS NULL THEN
    RAISE EXCEPTION 'child_product_id (%) does not exist', NEW.child_product_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_parent_company <> NEW.company_id OR v_child_company <> NEW.company_id THEN
    RAISE EXCEPTION
      'Bundle items must all belong to the same company (row=%, parent=%, child=%)',
      NEW.company_id, v_parent_company, v_child_company
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bdl_trg_company_match ON public.product_bundle_items;
CREATE TRIGGER bdl_trg_company_match
  BEFORE INSERT OR UPDATE ON public.product_bundle_items
  FOR EACH ROW EXECUTE FUNCTION public.bdl_validate_company_match();

-- 4c) No recursion (level-1 prevents level-N by induction)
--   Rule 1: A product that is already a CHILD anywhere cannot be a PARENT
--   Rule 2: A product that is already a PARENT anywhere cannot be a CHILD
CREATE OR REPLACE FUNCTION public.bdl_no_recursion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- NEW.parent is a child elsewhere?
  IF EXISTS (
    SELECT 1 FROM public.product_bundle_items
     WHERE child_product_id = NEW.parent_product_id
       AND (TG_OP = 'INSERT' OR id <> NEW.id)
  ) THEN
    RAISE EXCEPTION
      'Recursive bundles are not allowed: product % is already a bundle child, it cannot be a parent.',
      NEW.parent_product_id
      USING ERRCODE = 'P0001';
  END IF;

  -- NEW.child is a parent elsewhere?
  IF EXISTS (
    SELECT 1 FROM public.product_bundle_items
     WHERE parent_product_id = NEW.child_product_id
       AND (TG_OP = 'INSERT' OR id <> NEW.id)
  ) THEN
    RAISE EXCEPTION
      'Recursive bundles are not allowed: product % already has its own bundle children, it cannot be a bundle child.',
      NEW.child_product_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bdl_trg_no_recursion ON public.product_bundle_items;
CREATE TRIGGER bdl_trg_no_recursion
  BEFORE INSERT OR UPDATE ON public.product_bundle_items
  FOR EACH ROW EXECUTE FUNCTION public.bdl_no_recursion();

-- ------------------------------------------------------------------------------
-- 5) Helper RPC: expand a bundle into invoice-ready rows
-- ------------------------------------------------------------------------------
--   Returns JSONB[] with one entry per bundle child, with effective pricing
--   already applied. The caller (UI / API) merges these rows directly into the
--   invoice items array.
--
--   Output shape per row:
--     {
--       child_product_id, name, sku,
--       quantity            (= parent_qty × bundle_qty),
--       unit_price          (raw catalog price, for display),
--       effective_unit_price (0 when included/free, else unit_price),
--       cost_price,
--       is_optional, auto_deduct_inventory, price_handling,
--       income_account_id, expense_account_id,
--       display_order,
--       description_hint    ("childName (مرفق مع: parentName)" in Arabic),
--       parent_product_id, parent_name
--     }
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bdl_expand_product_bundle(
  p_product_id   uuid,
  p_parent_qty   numeric DEFAULT 1,
  p_company_id   uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent_name TEXT;
  v_result      jsonb;
BEGIN
  IF p_parent_qty IS NULL OR p_parent_qty <= 0 THEN
    p_parent_qty := 1;
  END IF;

  SELECT name INTO v_parent_name
    FROM public.products
   WHERE id = p_product_id
     AND (p_company_id IS NULL OR company_id = p_company_id);

  IF v_parent_name IS NULL THEN
    RETURN jsonb_build_array();  -- parent not found / inaccessible
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY display_order, is_optional, child_name), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        b.display_order,
        b.is_optional,
        cp.name AS child_name,
        jsonb_build_object(
          'child_product_id',      b.child_product_id,
          'parent_product_id',     b.parent_product_id,
          'parent_name',           v_parent_name,
          'name',                  cp.name,
          'sku',                   cp.sku,
          'quantity',              (b.quantity * p_parent_qty),
          'unit_price',            COALESCE(cp.unit_price, 0),
          'effective_unit_price',
            CASE b.price_handling
              WHEN 'add_to_total' THEN COALESCE(cp.unit_price, 0)
              ELSE 0
            END,
          'cost_price',            COALESCE(cp.cost_price, 0),
          'is_optional',           b.is_optional,
          'auto_deduct_inventory', b.auto_deduct_inventory,
          'price_handling',        b.price_handling,
          'income_account_id',     cp.income_account_id,
          'expense_account_id',    cp.expense_account_id,
          'display_order',         b.display_order,
          'description_hint',      cp.name || ' (مرفق مع: ' || v_parent_name || ')'
        ) AS row
      FROM public.product_bundle_items b
      JOIN public.products cp ON cp.id = b.child_product_id
      WHERE b.parent_product_id = p_product_id
        AND (p_company_id IS NULL OR b.company_id = p_company_id)
    ) AS expanded;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

-- ------------------------------------------------------------------------------
-- 6) Helper RPC: defensive completeness validator for /api/invoices &
--    /api/sales-orders POST handlers.
--
--    Input  : p_items   = jsonb array, each element MUST have at least
--                         { product_id, quantity }
--             p_company_id (for scoping)
--    Output : jsonb {
--               complete: bool,
--               missing:  [ {
--                 parent_product_id, parent_name,
--                 child_product_id,  child_name,
--                 required_quantity
--               } ]
--             }
--
--   "Mandatory" = product_bundle_items.is_optional = false.
--   A child is considered "present" if its product_id appears anywhere in
--   p_items with quantity >= required_quantity (= bundle_qty × parent_qty).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bdl_validate_bundle_completeness(
  p_items      jsonb,
  p_company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_missing jsonb := '[]'::jsonb;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('complete', true, 'missing', '[]'::jsonb);
  END IF;

  -- Aggregated map of product_id → total quantity present in the request
  WITH item_qty AS (
    SELECT
      (e->>'product_id')::uuid AS product_id,
      SUM(COALESCE((e->>'quantity')::numeric, 0)) AS qty
    FROM jsonb_array_elements(p_items) e
    WHERE e ? 'product_id'
    GROUP BY (e->>'product_id')::uuid
  ),
  -- Required children for every parent in the request that has a bundle
  required AS (
    SELECT
      b.parent_product_id,
      pp.name AS parent_name,
      b.child_product_id,
      cp.name AS child_name,
      (b.quantity * iq.qty) AS required_quantity
    FROM item_qty iq
    JOIN public.product_bundle_items b
      ON b.parent_product_id = iq.product_id
     AND b.company_id        = p_company_id
     AND b.is_optional       = false
    JOIN public.products pp ON pp.id = b.parent_product_id
    JOIN public.products cp ON cp.id = b.child_product_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'parent_product_id', r.parent_product_id,
    'parent_name',       r.parent_name,
    'child_product_id',  r.child_product_id,
    'child_name',        r.child_name,
    'required_quantity', r.required_quantity
  )), '[]'::jsonb)
  INTO v_missing
  FROM required r
  LEFT JOIN item_qty have ON have.product_id = r.child_product_id
  WHERE COALESCE(have.qty, 0) < r.required_quantity;

  RETURN jsonb_build_object(
    'complete', jsonb_array_length(v_missing) = 0,
    'missing',  v_missing
  );
END;
$function$;

COMMIT;

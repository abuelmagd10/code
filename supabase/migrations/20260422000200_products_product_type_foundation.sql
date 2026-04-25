-- ==============================================================================
-- Product Type Foundation - M1
-- Purpose:
--   Add canonical products.product_type, backfill deterministically, and
--   update create_product_atomic for dual-write compatibility.
-- Scope:
--   - products.product_type only
--   - deterministic backfill only
--   - create_product_atomic dual-write only
-- Excludes:
--   - item_type removal
--   - UI changes
--   - manufacturing component/substitute hardening
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Schema
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'products'
       AND column_name = 'product_type'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN product_type TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_products_product_type'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT chk_products_product_type
      CHECK (
        product_type IS NULL OR
        product_type IN ('manufactured', 'raw_material', 'purchased', 'service')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.products.product_type IS
  'Canonical product classification for manufacturing and downstream planning. Allowed values: manufactured, raw_material, purchased, service.';

-- ------------------------------------------------------------------------------
-- 2) Deterministic backfill
-- Order:
--   1. item_type=service -> service
--   2. BOM/Routing owners -> manufactured
--   3. BOM components -> raw_material
--   4. remaining -> purchased
-- Notes:
--   - Manufacturing steps are guarded so this migration remains safe in
--     environments where manufacturing tables are not deployed yet.
-- ------------------------------------------------------------------------------
UPDATE public.products
   SET product_type = 'service'
 WHERE product_type IS NULL
   AND item_type = 'service';

DO $$
BEGIN
  IF to_regclass('public.manufacturing_boms') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE public.products p
         SET product_type = 'manufactured'
       WHERE p.product_type IS NULL
         AND EXISTS (
           SELECT 1
             FROM public.manufacturing_boms b
            WHERE b.product_id = p.id
         );
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.manufacturing_routings') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE public.products p
         SET product_type = 'manufactured'
       WHERE p.product_type IS NULL
         AND EXISTS (
           SELECT 1
             FROM public.manufacturing_routings r
            WHERE r.product_id = p.id
         );
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.manufacturing_bom_lines') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE public.products p
         SET product_type = 'raw_material'
       WHERE p.product_type IS NULL
         AND EXISTS (
           SELECT 1
             FROM public.manufacturing_bom_lines l
            WHERE l.component_product_id = p.id
         );
    $sql$;
  END IF;
END $$;

UPDATE public.products
   SET product_type = 'purchased'
 WHERE product_type IS NULL;

-- ------------------------------------------------------------------------------
-- 3) Dual-write foundation for product creation
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_product_atomic(
  UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, UUID, UUID, TEXT, UUID, UUID, UUID
);

DROP FUNCTION IF EXISTS public.create_product_atomic(
  UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, UUID, UUID, TEXT, UUID, UUID, UUID, TEXT
);

CREATE OR REPLACE FUNCTION public.create_product_atomic(
    p_company_id UUID,
    p_sku TEXT,
    p_name TEXT,
    p_description TEXT,
    p_unit_price NUMERIC,
    p_cost_price NUMERIC,
    p_unit TEXT,
    p_quantity_on_hand NUMERIC,
    p_reorder_level NUMERIC,
    p_item_type TEXT,
    p_income_account_id UUID,
    p_expense_account_id UUID,
    p_tax_code_id TEXT,
    p_branch_id UUID,
    p_warehouse_id UUID,
    p_cost_center_id UUID,
    p_product_type TEXT DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_product_id UUID;
    v_final_cc_id UUID := p_cost_center_id;
    v_final_wh_id UUID := p_warehouse_id;
    v_branch_record RECORD;
    v_result jsonb;
    v_final_product_type TEXT := NULLIF(BTRIM(COALESCE(p_product_type, '')), '');
BEGIN
    -- 1. Fetch branch defaults if provided branch_id and missing cc/wh
    IF p_branch_id IS NOT NULL AND (p_cost_center_id IS NULL OR (p_item_type = 'product' AND p_warehouse_id IS NULL)) THEN
        SELECT default_cost_center_id, default_warehouse_id
          INTO v_branch_record
          FROM branches
         WHERE id = p_branch_id
           AND company_id = p_company_id;

        IF FOUND THEN
            IF p_cost_center_id IS NULL THEN
                v_final_cc_id := v_branch_record.default_cost_center_id;
            END IF;

            IF p_item_type = 'product' AND p_warehouse_id IS NULL THEN
                v_final_wh_id := v_branch_record.default_warehouse_id;
            END IF;
        END IF;
    END IF;

    -- 2. Enforce service rules and derive canonical product_type
    IF p_item_type = 'service' THEN
        v_final_wh_id := NULL;
    END IF;

    IF v_final_product_type IS NULL THEN
        IF p_item_type = 'service' THEN
            v_final_product_type := 'service';
        ELSE
            v_final_product_type := 'purchased';
        END IF;
    END IF;

    IF v_final_product_type NOT IN ('manufactured', 'raw_material', 'purchased', 'service') THEN
        RAISE EXCEPTION 'Invalid product_type. Allowed values: manufactured, raw_material, purchased, service.';
    END IF;

    IF p_item_type = 'service' AND v_final_product_type <> 'service' THEN
        RAISE EXCEPTION 'item_type=service must use product_type=service.';
    END IF;

    IF p_item_type <> 'service' AND v_final_product_type = 'service' THEN
        RAISE EXCEPTION 'product_type=service requires item_type=service.';
    END IF;

    -- 3. Insert Product Atomically
    INSERT INTO products (
        company_id,
        sku,
        name,
        description,
        unit_price,
        cost_price,
        unit,
        quantity_on_hand,
        reorder_level,
        item_type,
        product_type,
        income_account_id,
        expense_account_id,
        tax_code_id,
        branch_id,
        warehouse_id,
        cost_center_id
    ) VALUES (
        p_company_id,
        p_sku,
        p_name,
        p_description,
        p_unit_price,
        p_cost_price,
        p_unit,
        p_quantity_on_hand,
        p_reorder_level,
        p_item_type,
        v_final_product_type,
        p_income_account_id,
        p_expense_account_id,
        p_tax_code_id,
        p_branch_id,
        v_final_wh_id,
        v_final_cc_id
    ) RETURNING id INTO v_product_id;

    v_result := jsonb_build_object(
        'success', true,
        'product_id', v_product_id,
        'final_warehouse_id', v_final_wh_id,
        'final_cost_center_id', v_final_cc_id,
        'product_type', v_final_product_type
    );

    RETURN v_result;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to create product atomically: %', SQLERRM;
END;
$function$;

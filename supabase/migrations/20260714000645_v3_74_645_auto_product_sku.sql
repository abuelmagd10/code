-- v3.74.645 — Auto sequential product SKU per (company, branch, item type)
-- ------------------------------------------------------------------
-- Users entered item codes manually, producing inconsistent, non-sequential,
-- and potentially duplicate SKUs. Now each item type gets its own running
-- series per branch: <BRANCH_CODE>-<PREFIX>-NNNN
--   PRD = product/purchased, RAW = raw_material, SRV = service, MFG = manufactured
--   e.g. MAIN-PRD-0001, BR01-SRV-0001
-- The DB trigger fills the SKU only when it is left empty (a custom SKU is
-- respected). The form previews the next code live (preview_next_product_sku)
-- and, for new untouched items, sends an empty SKU so the trigger assigns it
-- authoritatively (race-safe via advisory lock). A partial unique index now
-- prevents duplicate codes within a company (a gap that existed before).
-- Applied live via MCP; captured in supabase/schema/functions.sql by the dump.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.erp_product_sku_prefix(p_item_type text, p_product_type text)
 RETURNS text LANGUAGE sql IMMUTABLE AS $function$
  SELECT CASE
    WHEN lower(coalesce(p_item_type,'')) = 'service' OR lower(coalesce(p_product_type,'')) = 'service' THEN 'SRV'
    WHEN lower(coalesce(p_product_type,'')) = 'raw_material' THEN 'RAW'
    WHEN lower(coalesce(p_product_type,'')) = 'manufactured' THEN 'MFG'
    ELSE 'PRD'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.erp_branch_sku_code(p_branch_id uuid)
 RETURNS text LANGUAGE sql STABLE AS $function$
  SELECT upper(coalesce(nullif(btrim(b.branch_code),''), nullif(btrim(b.code),''), 'HO'))
  FROM branches b WHERE b.id = p_branch_id;
$function$;

CREATE OR REPLACE FUNCTION public.auto_generate_product_sku()
 RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE v_prefix text; v_branch text; v_pat text; v_max integer; v_lock bigint;
BEGIN
  IF NEW.sku IS NOT NULL AND btrim(NEW.sku) <> '' THEN
    RETURN NEW;
  END IF;
  v_prefix := public.erp_product_sku_prefix(NEW.item_type, NEW.product_type);
  v_branch := coalesce(public.erp_branch_sku_code(NEW.branch_id), 'HO');
  v_lock := hashtext(NEW.company_id::text || '|' || coalesce(NEW.branch_id::text,'') || '|' || v_prefix);
  PERFORM pg_advisory_xact_lock(v_lock);
  v_pat := '^' || v_branch || '-' || v_prefix || '-([0-9]+)$';
  SELECT COALESCE(MAX(CAST(SUBSTRING(sku FROM v_pat) AS integer)), 0) INTO v_max
  FROM products
  WHERE company_id = NEW.company_id
    AND coalesce(branch_id::text,'') = coalesce(NEW.branch_id::text,'')
    AND sku ~ v_pat;
  NEW.sku := v_branch || '-' || v_prefix || '-' || LPAD((v_max + 1)::text, 4, '0');
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_auto_generate_product_sku ON public.products;
CREATE TRIGGER trg_auto_generate_product_sku
  BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.auto_generate_product_sku();

CREATE UNIQUE INDEX IF NOT EXISTS ux_products_company_sku
  ON public.products (company_id, sku)
  WHERE sku IS NOT NULL AND btrim(sku) <> '';

CREATE OR REPLACE FUNCTION public.preview_next_product_sku(p_company_id uuid, p_branch_id uuid, p_item_type text, p_product_type text)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $function$
DECLARE v_prefix text; v_branch text; v_pat text; v_max integer;
BEGIN
  v_prefix := public.erp_product_sku_prefix(p_item_type, p_product_type);
  v_branch := coalesce(public.erp_branch_sku_code(p_branch_id), 'HO');
  v_pat := '^' || v_branch || '-' || v_prefix || '-([0-9]+)$';
  SELECT COALESCE(MAX(CAST(SUBSTRING(sku FROM v_pat) AS integer)), 0) INTO v_max
  FROM products
  WHERE company_id = p_company_id
    AND coalesce(branch_id::text,'') = coalesce(p_branch_id::text,'')
    AND sku ~ v_pat;
  RETURN v_branch || '-' || v_prefix || '-' || LPAD((v_max + 1)::text, 4, '0');
END $function$;

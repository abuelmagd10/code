-- ==============================================================================
-- Services & Booking Module — Req 1: Mandatory Product Catalog Link
-- ==============================================================================
-- Purpose:
--   Make services.product_catalog_id NOT NULL and turn the linked product into
--   the single source of truth for: name, unit_price, cost_price,
--   revenue_account_id, expense_account_id.
--
-- Inheritance rules (both directions):
--   * BEFORE INSERT/UPDATE on services  → pull fresh values from products
--   * AFTER  UPDATE      on products    → push fresh values to all linked
--                                          services (reverse-sync)
--
-- Steps:
--   0. Pre-flight: refuse to enforce NOT NULL if any service is unlinked.
--   1. DROP all overloads of create_service_atomic / update_service_atomic
--      (signature change: removing p_service_name).
--   2. Re-create create_service_atomic — no p_service_name, requires
--      p_product_catalog_id.
--   3. Re-create update_service_atomic — no p_service_name, accepts optional
--      p_product_catalog_id.
--   4. svc_inherit_pricing_from_product() trigger on services
--      (BEFORE INSERT OR UPDATE).
--   5. svc_sync_from_product() trigger on products
--      (AFTER UPDATE) — reverse-sync to linked services.
--   6. ALTER COLUMN services.product_catalog_id SET NOT NULL.
--
-- Behaviour:
--   * service_name, unit_price, cost_price, revenue_account_id,
--     expense_account_id are ALWAYS taken from products. Anything an API or
--     UI tries to write in those columns is silently overwritten by the
--     BEFORE trigger — that's the contract.
--   * service_code, service_type, duration, capacity, scheduling settings,
--     commission_rate, tax_rate, currency_code, color, flags, notes stay
--     local to the service.
--
-- Safety:
--   * Production currently has 1 service, already linked → no backfill.
--   * Pre-flight RAISE guards local / staging / re-runs.
--   * All errors use ERRCODE 'P0001' so the API error mapper produces
--     friendly 400 responses.
--   * Single transaction → atomic, rollback on any failure.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 0) Pre-flight: refuse to run if any service is still unlinked.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_unlinked INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_unlinked
    FROM public.services
   WHERE product_catalog_id IS NULL;

  IF v_unlinked > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce NOT NULL on services.product_catalog_id: % service(s) are still unlinked. Link them to a product (item_type=service) first.',
      v_unlinked
      USING ERRCODE = 'P0001';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 1) Drop all existing overloads of create_service_atomic / update_service_atomic.
--    Signature change (removing p_service_name) requires a DROP+CREATE.
--    We DROP every overload defensively so the migration is idempotent.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('create_service_atomic', 'update_service_atomic')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
  END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 2) create_service_atomic — no p_service_name; product_catalog_id is required.
--    service_name is filled by the BEFORE INSERT trigger from products.name.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_service_atomic(
  p_company_id           uuid,
  p_branch_id            uuid,
  p_created_by           uuid,
  p_product_catalog_id   uuid,                  -- REQUIRED
  p_service_type         text,
  p_duration_minutes     integer,
  p_service_code         text    DEFAULT NULL,
  p_description          text    DEFAULT NULL,
  p_category             text    DEFAULT NULL,
  p_tax_rate             numeric DEFAULT 0,
  p_commission_rate      numeric DEFAULT 0,
  p_capacity             integer DEFAULT 1,
  p_buffer_minutes       integer DEFAULT 0,
  p_advance_booking_days integer DEFAULT 30,
  p_min_advance_hours    integer DEFAULT 1,
  p_cancel_before_hours  integer DEFAULT 24,
  p_cost_center_id       uuid    DEFAULT NULL,
  p_image_url            text    DEFAULT NULL,
  p_color_code           text    DEFAULT NULL,
  p_is_bookable          boolean DEFAULT true,
  p_requires_approval    boolean DEFAULT false,
  p_notes                text    DEFAULT NULL,
  p_currency_code        text    DEFAULT 'EGP'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_service_id   UUID;
  v_service_code TEXT;
BEGIN
  IF p_product_catalog_id IS NULL THEN
    RAISE EXCEPTION 'product_catalog_id is required when creating a service'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.svc_is_valid_service_type(p_service_type) THEN
    RAISE EXCEPTION
      'Invalid service_type: %. Allowed: individual,group,hourly,session,daily',
      p_service_type
      USING ERRCODE = 'P0001';
  END IF;

  IF p_service_code IS NULL OR BTRIM(p_service_code) = '' THEN
    v_service_code := public.svc_generate_service_code(p_company_id);
  ELSE
    v_service_code := BTRIM(p_service_code);
  END IF;

  -- service_name, unit_price, cost_price, revenue_account_id, expense_account_id
  -- are intentionally inserted as placeholders; the BEFORE INSERT trigger
  -- (svc_trg_inherit_pricing) overwrites them with values from products.
  -- NULLs are fine because the trigger fires before the NOT NULL check.
  INSERT INTO public.services (
    company_id, branch_id, cost_center_id, service_code, service_name,
    description, category, service_type,
    unit_price, cost_price, tax_rate, currency_code, commission_rate,
    duration_minutes, capacity, buffer_minutes,
    advance_booking_days, min_advance_hours, cancel_before_hours,
    revenue_account_id, expense_account_id,
    image_url, color_code, is_bookable, is_active, requires_approval,
    notes, created_by, updated_by, product_catalog_id
  ) VALUES (
    p_company_id, p_branch_id, p_cost_center_id, v_service_code, NULL,  -- name filled by trigger
    p_description, p_category, p_service_type,
    0, 0, p_tax_rate, p_currency_code, p_commission_rate,                -- prices filled by trigger
    p_duration_minutes, p_capacity, p_buffer_minutes,
    p_advance_booking_days, p_min_advance_hours, p_cancel_before_hours,
    NULL, NULL,                                                          -- accounts filled by trigger
    p_image_url, p_color_code, p_is_bookable, true, p_requires_approval,
    p_notes, p_created_by, p_created_by, p_product_catalog_id
  ) RETURNING id INTO v_service_id;

  RETURN jsonb_build_object(
    'success',      true,
    'service_id',   v_service_id,
    'service_code', v_service_code
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 3) update_service_atomic — no p_service_name; p_product_catalog_id optional.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_service_atomic(
  p_company_id           uuid,
  p_service_id           uuid,
  p_updated_by           uuid,
  p_description          text    DEFAULT NULL,
  p_category             text    DEFAULT NULL,
  p_service_type         text    DEFAULT NULL,
  p_tax_rate             numeric DEFAULT NULL,
  p_commission_rate      numeric DEFAULT NULL,
  p_duration_minutes     integer DEFAULT NULL,
  p_capacity             integer DEFAULT NULL,
  p_buffer_minutes       integer DEFAULT NULL,
  p_advance_booking_days integer DEFAULT NULL,
  p_min_advance_hours    integer DEFAULT NULL,
  p_cancel_before_hours  integer DEFAULT NULL,
  p_cost_center_id       uuid    DEFAULT NULL,
  p_image_url            text    DEFAULT NULL,
  p_color_code           text    DEFAULT NULL,
  p_currency_code        text    DEFAULT NULL,
  p_is_bookable          boolean DEFAULT NULL,
  p_requires_approval    boolean DEFAULT NULL,
  p_notes                text    DEFAULT NULL,
  p_product_catalog_id   uuid    DEFAULT NULL    -- NULL = leave unchanged
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_service public.services;
BEGIN
  SELECT * INTO v_service
    FROM public.services
   WHERE id = p_service_id AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found or not accessible. service_id=%', p_service_id
      USING ERRCODE = 'P0001';
  END IF;

  IF p_service_type IS NOT NULL AND NOT public.svc_is_valid_service_type(p_service_type) THEN
    RAISE EXCEPTION 'Invalid service_type: %', p_service_type
      USING ERRCODE = 'P0001';
  END IF;

  -- Note: service_name, unit_price, cost_price, revenue_account_id,
  -- expense_account_id are intentionally NOT in the SET list — the BEFORE
  -- UPDATE trigger refreshes them from the linked product on every UPDATE.
  UPDATE public.services SET
    description          = COALESCE(p_description,          description),
    category             = COALESCE(p_category,             category),
    service_type         = COALESCE(p_service_type,         service_type),
    tax_rate             = COALESCE(p_tax_rate,             tax_rate),
    commission_rate      = COALESCE(p_commission_rate,      commission_rate),
    duration_minutes     = COALESCE(p_duration_minutes,     duration_minutes),
    capacity             = COALESCE(p_capacity,             capacity),
    buffer_minutes       = COALESCE(p_buffer_minutes,       buffer_minutes),
    advance_booking_days = COALESCE(p_advance_booking_days, advance_booking_days),
    min_advance_hours    = COALESCE(p_min_advance_hours,    min_advance_hours),
    cancel_before_hours  = COALESCE(p_cancel_before_hours,  cancel_before_hours),
    cost_center_id       = COALESCE(p_cost_center_id,       cost_center_id),
    image_url            = COALESCE(p_image_url,            image_url),
    color_code           = COALESCE(p_color_code,           color_code),
    currency_code        = COALESCE(p_currency_code,        currency_code),
    is_bookable          = COALESCE(p_is_bookable,          is_bookable),
    requires_approval    = COALESCE(p_requires_approval,    requires_approval),
    notes                = COALESCE(p_notes,                notes),
    product_catalog_id   = COALESCE(p_product_catalog_id,   product_catalog_id),
    updated_by           = p_updated_by,
    updated_at           = NOW()
  WHERE id = p_service_id AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'success',    true,
    'service_id', p_service_id
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 4) BEFORE INSERT/UPDATE on services: inherit from products
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svc_inherit_pricing_from_product()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product RECORD;
BEGIN
  -- If no link is set we can't inherit. The NOT NULL constraint on
  -- product_catalog_id will reject the row at write time; here we just
  -- return so the constraint error surfaces with PostgreSQL's standard
  -- message.
  IF NEW.product_catalog_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    name,
    unit_price,
    cost_price,
    income_account_id,
    expense_account_id
  INTO v_product
  FROM public.products
  WHERE id          = NEW.product_catalog_id
    AND company_id  = NEW.company_id
    AND item_type   = 'service';

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'product_catalog_id (%) must reference a product with item_type=''service'' in company (%).',
      NEW.product_catalog_id, NEW.company_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Force-sync the five contractually-inherited fields. Any caller-supplied
  -- value in these columns is intentionally discarded — the linked product
  -- is the single source of truth.
  NEW.service_name        := v_product.name;
  NEW.unit_price          := COALESCE(v_product.unit_price, 0);
  NEW.cost_price          := COALESCE(v_product.cost_price, 0);
  NEW.revenue_account_id  := v_product.income_account_id;
  NEW.expense_account_id  := v_product.expense_account_id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS svc_trg_inherit_pricing ON public.services;
CREATE TRIGGER svc_trg_inherit_pricing
  BEFORE INSERT OR UPDATE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.svc_inherit_pricing_from_product();

-- ------------------------------------------------------------------------------
-- 5) AFTER UPDATE on products: reverse-sync to linked services
--    Fires only for item_type='service' rows AND only when one of the
--    inherited fields actually changed. Triggers UPDATE on services, which
--    in turn re-fires svc_trg_inherit_pricing (harmless — re-reads the same
--    values we just set). No recursion back to products because the
--    services-side trigger only SELECTs from products.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svc_sync_from_product()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.item_type IS DISTINCT FROM 'service' THEN
    RETURN NEW;
  END IF;

  IF OLD.name               IS NOT DISTINCT FROM NEW.name
     AND OLD.unit_price         IS NOT DISTINCT FROM NEW.unit_price
     AND OLD.cost_price         IS NOT DISTINCT FROM NEW.cost_price
     AND OLD.income_account_id  IS NOT DISTINCT FROM NEW.income_account_id
     AND OLD.expense_account_id IS NOT DISTINCT FROM NEW.expense_account_id
  THEN
    RETURN NEW;  -- nothing to propagate
  END IF;

  UPDATE public.services
     SET service_name       = NEW.name,
         unit_price         = COALESCE(NEW.unit_price, 0),
         cost_price         = COALESCE(NEW.cost_price, 0),
         revenue_account_id = NEW.income_account_id,
         expense_account_id = NEW.expense_account_id,
         updated_at         = NOW()
   WHERE product_catalog_id = NEW.id
     AND company_id         = NEW.company_id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS svc_trg_sync_from_product ON public.products;
CREATE TRIGGER svc_trg_sync_from_product
  AFTER UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.svc_sync_from_product();

-- ------------------------------------------------------------------------------
-- 6) Re-point the FK to ON DELETE RESTRICT.
--    Current FK uses ON DELETE SET NULL, which would conflict with the
--    upcoming NOT NULL constraint (you'd get a not-null-violation rather
--    than a clean "cannot delete: referenced by services" error).
--    RESTRICT gives users an actionable message: unlink the service first.
-- ------------------------------------------------------------------------------
ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_product_catalog_id_fkey;

ALTER TABLE public.services
  ADD CONSTRAINT services_product_catalog_id_fkey
  FOREIGN KEY (product_catalog_id) REFERENCES public.products(id)
  ON DELETE RESTRICT;

-- ------------------------------------------------------------------------------
-- 7) Enforce NOT NULL — pre-flight already guarantees no NULLs.
-- ------------------------------------------------------------------------------
ALTER TABLE public.services
  ALTER COLUMN product_catalog_id SET NOT NULL;

COMMIT;

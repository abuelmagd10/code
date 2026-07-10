-- =====================================================================
-- v3.74.597 (+597b) — Per-branch sales outlets, auto-created
-- (applied to production via Supabase MCP on 2026-07-10 as two
--  migrations: v3_74_597_branch_outlets_auto and
--  v3_74_597b_booking_stamps_branch_outlet; mirrored here combined)
--
-- Owner-approved model:
--  * Every branch automatically owns delivery-method provider
--    «منفذ بيع {الفرع}» (code branch_outlet, manual), mapped ONLY to
--    its branch. Existing manual outlets with matching names ADOPTED
--    (منفذ بيع مدينة نصر). Verified seed: outlet per branch, generic
--    v3.74.596 'onsite_pickup' deactivated after re-stamping drafts.
--  * Branch lifecycle triggers: INSERT creates outlet (covers the
--    auto main branch of new companies — pickup call removed from
--    trg_auto_seed_role_permissions); UPDATE syncs name + is_active.
--  * Outlets UNDELETABLE (BEFORE DELETE trigger, Arabic error).
--  * is_shipping_provider_allowed_for_branch semantics now PER
--    PROVIDER: zero mapping rows = GLOBAL provider (all branches);
--    mapped = its branches only. (Was: per company.)
--  * get_branch_outlet(branch) helper; complete_booking_atomic stamps
--    the booking invoice with ITS branch outlet (fallback ensure).
--
-- Governance (enforced in UI + the existing invoice trigger):
--  owner/admin/general_manager choose company-wide; other roles see
--  their branch outlet + branch-mapped couriers + global couriers.
-- =====================================================================

-- (1) ensure/adopt the outlet for one branch
CREATE OR REPLACE FUNCTION public.ensure_branch_outlet(p_branch_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_branch RECORD;
  v_id uuid;
  v_name text;
BEGIN
  SELECT id, company_id, name, COALESCE(is_active, true) AS is_active
  INTO v_branch FROM public.branches WHERE id = p_branch_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_name := 'منفذ بيع ' || v_branch.name;

  SELECT sp.id INTO v_id
  FROM public.shipping_providers sp
  JOIN public.branch_shipping_providers bsp ON bsp.shipping_provider_id = sp.id
  WHERE sp.company_id = v_branch.company_id
    AND sp.provider_code = 'branch_outlet'
    AND bsp.branch_id = p_branch_id
  LIMIT 1;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.shipping_providers
    WHERE company_id = v_branch.company_id
      AND provider_name = v_name
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE public.shipping_providers
         SET provider_code = 'branch_outlet', base_url = COALESCE(base_url, 'manual')
       WHERE id = v_id;
    END IF;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.shipping_providers
      (company_id, provider_name, provider_code, base_url, is_active)
    VALUES
      (v_branch.company_id, v_name, 'branch_outlet', 'manual', v_branch.is_active)
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.branch_shipping_providers (branch_id, shipping_provider_id, is_active)
  SELECT p_branch_id, v_id, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.branch_shipping_providers bsp
    WHERE bsp.branch_id = p_branch_id AND bsp.shipping_provider_id = v_id
  );

  RETURN v_id;
END;
$$;

-- (2) seed all existing branches
DO $$
DECLARE b RECORD;
BEGIN
  FOR b IN SELECT id FROM public.branches LOOP
    PERFORM public.ensure_branch_outlet(b.id);
  END LOOP;
END $$;

-- (3) branch lifecycle triggers (replaces the v3.74.596 pickup mapper)
DROP TRIGGER IF EXISTS branches_map_pickup_provider ON public.branches;

CREATE OR REPLACE FUNCTION public.branch_outlet_lifecycle()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.ensure_branch_outlet(NEW.id);
    RETURN NEW;
  END IF;

  SELECT sp.id INTO v_id
  FROM public.shipping_providers sp
  JOIN public.branch_shipping_providers bsp ON bsp.shipping_provider_id = sp.id
  WHERE sp.company_id = NEW.company_id
    AND sp.provider_code = 'branch_outlet'
    AND bsp.branch_id = NEW.id
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.shipping_providers
       SET provider_name = 'منفذ بيع ' || NEW.name,
           is_active = COALESCE(NEW.is_active, true)
     WHERE id = v_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS branches_outlet_lifecycle ON public.branches;
CREATE TRIGGER branches_outlet_lifecycle
AFTER INSERT OR UPDATE ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.branch_outlet_lifecycle();

-- (4) outlets are undeletable (deactivate instead)
CREATE OR REPLACE FUNCTION public.protect_branch_outlets()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.provider_code = 'branch_outlet' THEN
    RAISE EXCEPTION 'OUTLET_PROTECTED: منافذ بيع الفروع تُنشأ وتُدار تلقائياً ولا تُحذف — يمكن تعطيلها فقط (تتعطل تلقائياً مع تعطيل الفرع)';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS shipping_providers_protect_outlets ON public.shipping_providers;
CREATE TRIGGER shipping_providers_protect_outlets
BEFORE DELETE ON public.shipping_providers
FOR EACH ROW EXECUTE FUNCTION public.protect_branch_outlets();

-- (5) per-provider visibility semantics
CREATE OR REPLACE FUNCTION public.is_shipping_provider_allowed_for_branch(
  p_branch_id uuid, p_shipping_provider_id uuid, p_company_id uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  v_provider_has_mapping BOOLEAN;
BEGIN
  IF p_shipping_provider_id IS NULL THEN RETURN TRUE; END IF;
  IF p_branch_id IS NULL THEN RETURN FALSE; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.branch_shipping_providers bsp
    WHERE bsp.shipping_provider_id = p_shipping_provider_id
  ) INTO v_provider_has_mapping;

  IF NOT v_provider_has_mapping THEN RETURN TRUE; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.branch_shipping_providers bsp
    JOIN public.branches b ON b.id = bsp.branch_id
    WHERE bsp.branch_id = p_branch_id
      AND bsp.shipping_provider_id = p_shipping_provider_id
      AND b.company_id = p_company_id
      AND (bsp.is_active IS NULL OR bsp.is_active = TRUE)
  );
END;
$$;

-- (6) branch-outlet lookup + draft re-stamp + pickup retirement
CREATE OR REPLACE FUNCTION public.get_branch_outlet(p_branch_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT sp.id
  FROM public.shipping_providers sp
  JOIN public.branch_shipping_providers bsp ON bsp.shipping_provider_id = sp.id
  WHERE sp.provider_code = 'branch_outlet'
    AND bsp.branch_id = p_branch_id
  LIMIT 1;
$$;

UPDATE public.invoices i
   SET shipping_provider_id = public.get_branch_outlet(i.branch_id)
 WHERE i.status = 'draft'
   AND i.branch_id IS NOT NULL
   AND i.shipping_provider_id IN (SELECT id FROM public.shipping_providers WHERE provider_code = 'onsite_pickup')
   AND public.get_branch_outlet(i.branch_id) IS NOT NULL;

UPDATE public.shipping_providers
   SET is_active = false
 WHERE provider_code = 'onsite_pickup';

-- (7) v3.74.597b — auto-seed chain drops the pickup call; the branches
--     INSERT trigger covers new companies' auto main branch.
CREATE OR REPLACE FUNCTION public.trg_auto_seed_role_permissions()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  perform public.seed_default_role_permissions(new.id);
  -- v3.74.508 add-on grants
  perform public.seed_purchasing_officer_returns_permissions(new.id);
  -- v3.74.581 reports access matrix
  perform public.seed_reports_access_v581(new.id);
  -- v3.74.597: branch outlets are created by the branches INSERT trigger
  return new;
end;
$$;

-- (8) v3.74.597b — complete_booking_atomic stamps the branch outlet.
--     Full body = the v3.74.596 definition with the delivery lookup:
--       v_delivery_provider := public.get_branch_outlet(v_booking.branch_id);
--       IF v_delivery_provider IS NULL THEN
--         v_delivery_provider := public.ensure_branch_outlet(v_booking.branch_id);
--       END IF;
--     and shipping_provider_id = v_delivery_provider in the invoice
--     INSERT. Authoritative text: MCP migration
--     v3_74_597b_booking_stamps_branch_outlet.

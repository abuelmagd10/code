-- =====================================================================
-- v3.74.608 — Direct (instant) sales returns: owner + GM only
-- (applied to production via Supabase MCP on 2026-07-11; mirrored here)
--
-- Owner decision: keep the invoice-page full/partial return buttons as
-- the top-management express lane (owner + general_manager — same set
-- as supplier-payment approval, v3.74.132), instead of removing them.
-- Everyone else must use the sales-return-request cycle (management
-- approval + warehouse receive), which already notifies all approvers
-- (fixed in v3.74.607).
--
-- Enforcement layer: the direct path runs CLIENT-side (browser inserts
-- into sales_returns) — so the real gate lives here. A BEFORE INSERT
-- trigger allows:
--   * server-side flows (auth.uid() IS NULL — the request-cycle RPCs
--     run under the service role) → untouched
--   * authenticated owner / general_manager → allowed (express lane)
--   * any other authenticated role → clear Arabic rejection pointing
--     to the request cycle
-- =====================================================================

CREATE OR REPLACE FUNCTION public.gate_direct_sales_returns()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;

  SELECT cm.role INTO v_role
  FROM public.company_members cm
  WHERE cm.company_id = NEW.company_id AND cm.user_id = v_uid
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'RETURN_FORBIDDEN: لست عضواً فى هذه الشركة';
  END IF;

  IF v_role NOT IN ('owner','general_manager') THEN
    RAISE EXCEPTION 'RETURN_FORBIDDEN: المرتجع المباشر من صفحة الفاتورة متاح للمالك والمدير العام فقط — استخدم دورة "طلب مرتجع مبيعات" (اعتماد إدارى ثم استلام مخزنى)';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_returns_direct_gate ON public.sales_returns;
CREATE TRIGGER sales_returns_direct_gate
BEFORE INSERT ON public.sales_returns
FOR EACH ROW EXECUTE FUNCTION public.gate_direct_sales_returns();

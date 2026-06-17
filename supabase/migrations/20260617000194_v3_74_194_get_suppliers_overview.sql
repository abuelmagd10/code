-- v3.74.194 — Collapse the suppliers-page N+1 (3 SELECTs per supplier:
-- bills + vendor_credits + advance payments) into a single server-side
-- RPC. The same template that powered get_customers_overview.

CREATE OR REPLACE FUNCTION public.get_suppliers_overview(
  p_company_id uuid,
  p_branch_filter uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_offset integer := GREATEST(0, (COALESCE(p_page, 1) - 1)) * COALESCE(p_page_size, 50);
  v_limit  integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 500);
  v_search text := NULLIF(TRIM(COALESCE(p_search, '')), '');
BEGIN
  RETURN (
    WITH base AS (
      SELECT s.*
      FROM suppliers s
      WHERE s.company_id = p_company_id
        AND (p_branch_filter IS NULL OR s.branch_id = p_branch_filter)
        AND (v_search IS NULL
             OR s.name  ILIKE '%' || v_search || '%'
             OR COALESCE(s.email,'') ILIKE '%' || v_search || '%'
             OR COALESCE(s.phone,'') ILIKE '%' || v_search || '%'
             OR COALESCE(s.tax_id,'') ILIKE '%' || v_search || '%')
    ),
    bill_agg AS (
      SELECT supplier_id,
        COALESCE(SUM(GREATEST(
          GREATEST(COALESCE(total_amount,0) - COALESCE(returned_amount,0), 0)
            - COALESCE(paid_amount,0), 0
        )), 0) AS payables,
        COALESCE(SUM(GREATEST(COALESCE(paid_amount,0) - COALESCE(total_amount,0), 0)), 0) AS overpayments
      FROM bills
      WHERE company_id = p_company_id
        AND COALESCE(status,'') NOT IN ('draft','cancelled','fully_returned')
      GROUP BY supplier_id
    ),
    credit_agg AS (
      SELECT supplier_id,
        COALESCE(SUM(GREATEST(COALESCE(total_amount,0) - COALESCE(applied_amount,0), 0)), 0) AS open_credits
      FROM vendor_credits
      WHERE company_id = p_company_id AND COALESCE(status,'') = 'open'
      GROUP BY supplier_id
    ),
    advance_agg AS (
      SELECT supplier_id,
        COALESCE(SUM(
          CASE WHEN unallocated_amount IS NOT NULL
            THEN GREATEST(COALESCE(unallocated_amount, 0), 0)
            ELSE GREATEST(ABS(COALESCE(amount, 0)), 0)
          END
        ), 0) AS advances
      FROM payments
      WHERE company_id = p_company_id
        AND supplier_id IS NOT NULL
        AND bill_id IS NULL
        AND invoice_id IS NULL
        AND COALESCE(status, '') = 'approved'
        AND COALESCE(is_deleted, false) = false
      GROUP BY supplier_id
    ),
    enriched AS (
      SELECT
        b.*,
        jsonb_build_object('branch_name', br.branch_name) AS branches,
        COALESCE(ba.payables, 0)     AS payables,
        COALESCE(ba.overpayments, 0) AS bill_overpayments,
        COALESCE(ca.open_credits, 0) AS open_credits,
        COALESCE(av.advances, 0)     AS advances
      FROM base b
      LEFT JOIN bill_agg ba    ON ba.supplier_id = b.id
      LEFT JOIN credit_agg ca  ON ca.supplier_id = b.id
      LEFT JOIN advance_agg av ON av.supplier_id = b.id
      LEFT JOIN branches br    ON br.id = b.branch_id
    )
    SELECT jsonb_build_object(
      'total', (SELECT COUNT(*) FROM enriched),
      'page',  COALESCE(p_page, 1),
      'page_size', v_limit,
      'rows', COALESCE(
        (SELECT jsonb_agg(to_jsonb(p))
         FROM (SELECT * FROM enriched ORDER BY name ASC NULLS LAST, created_at DESC LIMIT v_limit OFFSET v_offset) p),
        '[]'::jsonb)
    )
  );
END;
$$;

CREATE INDEX IF NOT EXISTS idx_suppliers_company_branch ON public.suppliers (company_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_bills_supplier ON public.bills (company_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_supplier ON public.vendor_credits (company_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_payments_supplier_advance
  ON public.payments (company_id, supplier_id)
  WHERE bill_id IS NULL AND invoice_id IS NULL;

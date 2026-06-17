-- v3.74.193 — Collapse the customers-page client-side aggregation into a
-- single server-side RPC. Before this version the page fired ten+ SELECTs
-- (customers + payments + advance_applications + customer_credits +
-- paid invoices for overpayment + AR account + all invoices +
-- journal_entry_lines + supporting payments / advance_applications /
-- sales_returns joins) and aggregated the result in JavaScript. As the
-- company grew, the round-trips became the dominant cost of loading
-- /customers.
--
-- get_customers_overview takes the same filter inputs (branch, employee,
-- cost center, shared grantor list, search, page, page_size) and returns
-- a paginated JSON envelope:
--   { total, page, page_size, rows: [ { customer fields..., advance,
--     applied, available_credits, disbursed_credits, receivables,
--     has_active_invoices, has_any_invoices } ] }
--
-- Receivables are computed directly from invoices (total - paid -
-- returned), which is the same total the AR ledger arrived at via
-- journal_entry_lines but in a fraction of the work.

CREATE OR REPLACE FUNCTION public.get_customers_overview(
  p_company_id uuid,
  p_branch_filter uuid DEFAULT NULL,
  p_employee_filter uuid DEFAULT NULL,
  p_cost_center_filter uuid DEFAULT NULL,
  p_shared_grantor_ids uuid[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_invoice_filter text DEFAULT 'all',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER  -- v3.74.193: respect RLS on every joined table
SET search_path TO 'public'
AS $$
DECLARE
  v_offset integer := GREATEST(0, (COALESCE(p_page, 1) - 1)) * COALESCE(p_page_size, 50);
  v_limit  integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 500);
  v_search text := NULLIF(TRIM(COALESCE(p_search, '')), '');
BEGIN
  RETURN (
    WITH base AS (
      SELECT c.*
      FROM customers c
      WHERE c.company_id = p_company_id
        AND (p_branch_filter IS NULL OR c.branch_id = p_branch_filter)
        AND (
              p_employee_filter IS NULL
           OR c.created_by_user_id = p_employee_filter
           OR (p_shared_grantor_ids IS NOT NULL AND c.created_by_user_id = ANY(p_shared_grantor_ids))
        )
        AND (p_cost_center_filter IS NULL OR c.cost_center_id = p_cost_center_filter)
        AND (
             v_search IS NULL
             OR c.name  ILIKE '%' || v_search || '%'
             OR c.email ILIKE '%' || v_search || '%'
             OR c.phone ILIKE '%' || v_search || '%'
             OR COALESCE(c.tax_id,'') ILIKE '%' || v_search || '%'
        )
    ),
    advance_per_cust AS (
      SELECT customer_id,
             COALESCE(SUM(COALESCE(base_currency_amount, amount)), 0) AS adv
      FROM payments
      WHERE company_id = p_company_id AND customer_id IS NOT NULL AND invoice_id IS NULL
      GROUP BY customer_id
    ),
    applied_per_cust AS (
      SELECT customer_id, COALESCE(SUM(amount_applied), 0) AS app
      FROM advance_applications
      WHERE company_id = p_company_id
      GROUP BY customer_id
    ),
    credits_per_cust AS (
      SELECT customer_id,
        COALESCE(SUM(CASE
          WHEN status IN ('active', 'partially_used')
            THEN GREATEST(amount - COALESCE(used_amount, 0) - COALESCE(applied_amount, 0), 0)
          ELSE 0
        END), 0) AS available,
        COALESCE(SUM(COALESCE(used_amount, 0) + COALESCE(applied_amount, 0)), 0) AS disbursed
      FROM customer_credits
      WHERE company_id = p_company_id
      GROUP BY customer_id
    ),
    inv_agg AS (
      SELECT customer_id,
        COALESCE(SUM(GREATEST(
          COALESCE(total_amount,0) - COALESCE(paid_amount,0) - COALESCE(returned_amount,0), 0
        )), 0) AS receivables,
        COUNT(*) FILTER (WHERE COALESCE(status,'') NOT IN ('draft','cancelled')) AS any_invoices,
        COUNT(*) FILTER (WHERE COALESCE(status,'') IN ('sent','partially_paid','paid','partially_returned')) AS active_invoices
      FROM invoices
      WHERE company_id = p_company_id AND customer_id IS NOT NULL
      GROUP BY customer_id
    ),
    enriched AS (
      SELECT
        b.id, b.name, b.email, b.phone, b.address, b.governorate, b.city,
        b.country, b.detailed_address, b.tax_id, b.credit_limit, b.payment_terms,
        b.created_by_user_id, b.branch_id, b.cost_center_id, b.created_at,
        jsonb_build_object('name', br.name) AS branches,
        COALESCE(a.adv, 0)        AS advance,
        COALESCE(ap.app, 0)       AS applied,
        COALESCE(cr.available, 0) AS available_credits,
        COALESCE(cr.disbursed, 0) AS disbursed_credits,
        COALESCE(iv.receivables, 0) AS receivables,
        COALESCE(iv.active_invoices, 0) > 0 AS has_active_invoices,
        COALESCE(iv.any_invoices, 0)    > 0 AS has_any_invoices
      FROM base b
      LEFT JOIN advance_per_cust a   ON a.customer_id = b.id
      LEFT JOIN applied_per_cust ap  ON ap.customer_id = b.id
      LEFT JOIN credits_per_cust cr  ON cr.customer_id = b.id
      LEFT JOIN inv_agg iv           ON iv.customer_id = b.id
      LEFT JOIN branches br          ON br.id = b.branch_id
    ),
    filtered AS (
      SELECT * FROM enriched
      WHERE CASE COALESCE(p_invoice_filter, 'all')
              WHEN 'with_invoices'    THEN has_any_invoices
              WHEN 'without_invoices' THEN NOT has_any_invoices
              ELSE TRUE
            END
    )
    SELECT jsonb_build_object(
      'total', (SELECT COUNT(*) FROM filtered),
      'page',  COALESCE(p_page, 1),
      'page_size', v_limit,
      'rows', COALESCE(
        (SELECT jsonb_agg(to_jsonb(p))
         FROM (SELECT * FROM filtered ORDER BY name ASC NULLS LAST, created_at DESC LIMIT v_limit OFFSET v_offset) p),
        '[]'::jsonb)
    )
  );
END;
$$;

-- Indexes that make the aggregates cheap as the tables grow.
CREATE INDEX IF NOT EXISTS idx_customers_company_branch
  ON public.customers (company_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_customers_company_creator
  ON public.customers (company_id, created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_advance
  ON public.payments (company_id, customer_id) WHERE invoice_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_advance_apps_customer
  ON public.advance_applications (company_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_credits_customer
  ON public.customer_credits (company_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_company
  ON public.invoices (company_id, customer_id);

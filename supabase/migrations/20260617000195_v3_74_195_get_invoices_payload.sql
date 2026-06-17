-- v3.74.195 — Bundles per-invoice supporting data (payments + invoice_items
-- + returned-by-item + employee attribution + active sales-return-requests)
-- into ONE RPC call. The invoices page used to fire 6+ dependent SELECTs
-- against these tables after fetching the invoice list. Page-wide reference
-- lists (customers / products / shipping_providers / customer_credits)
-- stay on their existing one-query loads.

CREATE OR REPLACE FUNCTION public.get_invoices_payload(
  p_company_id uuid,
  p_invoice_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_invoice_ids IS NULL OR array_length(p_invoice_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'payments', '[]'::jsonb,
      'items', '[]'::jsonb,
      'returned_by_item', '[]'::jsonb,
      'invoice_to_employee', '{}'::jsonb,
      'active_return_requests', '{}'::jsonb
    );
  END IF;

  RETURN (
    WITH
    payments_agg AS (
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'invoice_id', invoice_id, 'amount', amount,
        'currency_code', currency_code, 'exchange_rate', exchange_rate,
        'base_currency_amount', base_currency_amount
      )) AS rows
      FROM payments
      WHERE company_id = p_company_id AND invoice_id = ANY(p_invoice_ids)
    ),
    items_agg AS (
      SELECT jsonb_agg(jsonb_build_object(
        'invoice_id', ii.invoice_id, 'quantity', ii.quantity,
        'product_id', ii.product_id, 'returned_quantity', ii.returned_quantity,
        'products', jsonb_build_object('name', p.name)
      )) AS rows
      FROM invoice_items ii
      LEFT JOIN products p ON p.id = ii.product_id
      WHERE ii.invoice_id = ANY(p_invoice_ids)
    ),
    returns_agg AS (
      SELECT jsonb_agg(jsonb_build_object(
        'invoice_id', sr.invoice_id, 'product_id', sri.product_id, 'quantity', sri.quantity
      )) AS rows
      FROM sales_returns sr
      JOIN sales_return_items sri ON sri.sales_return_id = sr.id
      WHERE sr.invoice_id = ANY(p_invoice_ids)
    ),
    emp_map AS (
      SELECT jsonb_object_agg(
        i.id, COALESCE(so.created_by_user_id, i.created_by_user_id)
      ) FILTER (WHERE COALESCE(so.created_by_user_id, i.created_by_user_id) IS NOT NULL) AS map
      FROM invoices i
      LEFT JOIN sales_orders so ON so.id = i.sales_order_id
      WHERE i.id = ANY(p_invoice_ids)
    ),
    active_returns AS (
      SELECT jsonb_object_agg(
        invoice_id, jsonb_build_object('id', id, 'status', status)
      ) AS map
      FROM (
        SELECT DISTINCT ON (invoice_id) id, invoice_id, status, created_at
        FROM sales_return_requests
        WHERE company_id = p_company_id
          AND invoice_id = ANY(p_invoice_ids)
          AND status IN ('pending_approval_level_1','pending_warehouse_approval','pending')
        ORDER BY invoice_id, created_at DESC
      ) latest
    )
    SELECT jsonb_build_object(
      'payments', COALESCE((SELECT rows FROM payments_agg), '[]'::jsonb),
      'items', COALESCE((SELECT rows FROM items_agg), '[]'::jsonb),
      'returned_by_item', COALESCE((SELECT rows FROM returns_agg), '[]'::jsonb),
      'invoice_to_employee', COALESCE((SELECT map FROM emp_map), '{}'::jsonb),
      'active_return_requests', COALESCE((SELECT map FROM active_returns), '{}'::jsonb)
    )
  );
END;
$$;

CREATE INDEX IF NOT EXISTS idx_payments_invoice_company ON public.payments (company_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_invoice ON public.sales_returns (invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_sr ON public.sales_return_items (sales_return_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_requests_invoice_status
  ON public.sales_return_requests (company_id, invoice_id, status);

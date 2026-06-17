-- v3.74.196 — Same pattern as v3.74.195 for the bills page. Replaces the
-- five dependent SELECTs (payments + bill_items + vendor_credits +
-- vendor_credit_items + open VC aggregation) with one round-trip.

CREATE OR REPLACE FUNCTION public.get_bills_payload(
  p_company_id uuid,
  p_bill_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_bill_ids IS NULL OR array_length(p_bill_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'payments', '[]'::jsonb,
      'items', '[]'::jsonb,
      'returned_by_item', '[]'::jsonb,
      'open_vc_by_bill', '{}'::jsonb
    );
  END IF;

  RETURN (
    WITH
    payments_agg AS (
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'bill_id', bill_id, 'amount', amount, 'status', status,
        'currency_code', currency_code, 'exchange_rate', exchange_rate,
        'base_currency_amount', base_currency_amount
      )) AS rows
      FROM payments
      WHERE company_id = p_company_id
        AND bill_id = ANY(p_bill_ids)
        AND status = 'approved'
    ),
    items_agg AS (
      SELECT jsonb_agg(jsonb_build_object(
        'bill_id', bi.bill_id, 'quantity', bi.quantity,
        'product_id', bi.product_id, 'returned_quantity', bi.returned_quantity,
        'products', jsonb_build_object('name', p.name)
      )) AS rows
      FROM bill_items bi
      LEFT JOIN products p ON p.id = bi.product_id
      WHERE bi.bill_id = ANY(p_bill_ids)
    ),
    returns_agg AS (
      SELECT jsonb_agg(jsonb_build_object(
        'bill_id', vc.bill_id, 'product_id', vci.product_id, 'quantity', vci.quantity
      )) AS rows
      FROM vendor_credits vc
      JOIN vendor_credit_items vci ON vci.vendor_credit_id = vc.id
      WHERE vc.bill_id = ANY(p_bill_ids)
    ),
    open_vc AS (
      SELECT jsonb_object_agg(bill_id, open_balance) AS map
      FROM (
        SELECT bill_id,
          SUM(GREATEST(COALESCE(total_amount,0) - COALESCE(applied_amount,0), 0)) AS open_balance
        FROM vendor_credits
        WHERE bill_id = ANY(p_bill_ids) AND status = 'open'
        GROUP BY bill_id
      ) agg
    )
    SELECT jsonb_build_object(
      'payments', COALESCE((SELECT rows FROM payments_agg), '[]'::jsonb),
      'items', COALESCE((SELECT rows FROM items_agg), '[]'::jsonb),
      'returned_by_item', COALESCE((SELECT rows FROM returns_agg), '[]'::jsonb),
      'open_vc_by_bill', COALESCE((SELECT map FROM open_vc), '{}'::jsonb)
    )
  );
END;
$$;

CREATE INDEX IF NOT EXISTS idx_payments_bill_status ON public.payments (bill_id, status);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON public.bill_items (bill_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_bill ON public.vendor_credits (bill_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credit_items_vc ON public.vendor_credit_items (vendor_credit_id);

-- Phase 1B Pre-Migration Checks
-- Run before applying 20260406_002_enterprise_financial_phase1_v2.sql

-- 1) Confirm an open accounting period exists for today
SELECT
  id,
  period_name,
  period_start,
  period_end,
  status,
  is_locked
FROM accounting_periods
WHERE CURRENT_DATE BETWEEN period_start AND period_end
ORDER BY period_start DESC;

-- 2) Find invoice dates not covered by any accounting period
SELECT
  i.id,
  i.invoice_number,
  i.invoice_date
FROM invoices i
LEFT JOIN accounting_periods ap
  ON ap.company_id = i.company_id
 AND i.invoice_date BETWEEN ap.period_start AND ap.period_end
WHERE i.deleted_at IS NULL
  AND i.status IN ('draft', 'sent', 'paid', 'partially_paid', 'partially_returned', 'fully_returned')
  AND ap.id IS NULL
ORDER BY i.invoice_date;

-- 3) Detect orphan invoice references
SELECT
  i.id,
  i.invoice_number,
  i.customer_id,
  i.sales_order_id
FROM invoices i
LEFT JOIN customers c ON c.id = i.customer_id
LEFT JOIN sales_orders so ON so.id = i.sales_order_id
WHERE i.deleted_at IS NULL
  AND (
    (i.customer_id IS NOT NULL AND c.id IS NULL) OR
    (i.sales_order_id IS NOT NULL AND so.id IS NULL)
  );

-- 4) Compare inventory GL against FIFO valuation
WITH inventory_accounts AS (
  SELECT id
  FROM chart_of_accounts
  WHERE is_active = true
    AND sub_type IN ('inventory', 'stock')
),
gl_inventory AS (
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) AS gl_value
  FROM journal_entries je
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.status = 'posted'
    AND COALESCE(je.is_deleted, false) = false
    AND je.deleted_at IS NULL
    AND jel.account_id IN (SELECT id FROM inventory_accounts)
),
fifo_inventory AS (
  SELECT COALESCE(SUM(fcl.remaining_quantity * fcl.unit_cost), 0) AS fifo_value
  FROM fifo_cost_lots fcl
  WHERE fcl.remaining_quantity > 0
)
SELECT
  gl_inventory.gl_value,
  fifo_inventory.fifo_value,
  ABS(gl_inventory.gl_value - fifo_inventory.fifo_value) AS difference
FROM gl_inventory, fifo_inventory;

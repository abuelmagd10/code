-- =============================================
-- TABLE COMMENTS: Commission Attribution Documentation
-- Date: 2026-02-17
-- Purpose: Document commission attribution logic at database level
-- =============================================

-- Commission Ledger Table Comment
COMMENT ON TABLE commission_ledger IS 
'Commission ledger tracking all commission transactions.

CRITICAL ATTRIBUTION RULE:
Commissions are attributed to the SALES ORDER CREATOR (sales_orders.created_by), 
NOT the Invoice creator (invoices.created_by_user_id).

This ensures commission goes to the person who made the sale, regardless of who 
processed the invoice or collected payment.

Fallback: If no sales_order exists, commission is attributed to invoice creator 
for backward compatibility with legacy data.

See: calculate_commission_for_period() function for implementation details.';

-- Commission Ledger Columns Comments
COMMENT ON COLUMN commission_ledger.employee_id IS 
'Employee who EARNED the commission (based on sales_orders.created_by, NOT invoices.created_by_user_id)';

COMMENT ON COLUMN commission_ledger.source_id IS 
'Invoice ID that generated this commission. Join with invoices.sales_order_id to trace back to original sales order.';

COMMENT ON COLUMN commission_ledger.notes IS 
'Audit trail notes. Format: "Commission for Sales Order #XXX" or "Commission for Invoice (no sales order)"';

-- Commission Plans Table Comment
COMMENT ON TABLE commission_plans IS 
'Commission plan definitions with calculation rules.

Plans define:
- Calculation type (flat_percent, tiered_revenue, target_based)
- Calculation basis (before/after discount/VAT)
- Tier type (progressive vs slab)
- Return handling (auto_reverse, manual_adjustment, ignore)

All plans respect the attribution rule: commission goes to Sales Order creator.';

-- Commission Runs Table Comment
COMMENT ON TABLE commission_runs IS 
'Commission calculation workflow header.

Workflow states: draft → reviewed → approved → posted → paid

Each run represents a commission calculation cycle for a specific period.
All commissions in a run are attributed based on Sales Order creator.';

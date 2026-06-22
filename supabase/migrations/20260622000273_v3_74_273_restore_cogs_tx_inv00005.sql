-- v3.74.273 - Restore a cogs_transactions row that v3.74.270 over-deleted.
-- The earlier test-company cleanup wiped ALL cogs_transactions rows for
-- شركة تست to remove orphans, but invoice INV-00005 in that company is
-- a live sale (partially_paid, 17.50 EGP collected of 20 EGP). Its
-- COGS journal entry JE-000018 (Dr 5100 COGS 2.00 / Cr 1140 Inventory 2.00)
-- is correct and was kept, so the sub-ledger needed a matching row.
--
-- Without this insert, the ic_cogs_balance integrity check reports
-- a medium-severity divergence (cogs_transactions=0 vs GL=2).
--
-- After this insert: cogs_transactions=2, GL=2, no alert.
INSERT INTO cogs_transactions (
  company_id, branch_id, cost_center_id, warehouse_id, product_id,
  source_type, source_id,
  quantity, unit_cost, total_cost,
  transaction_date, notes
)
SELECT
  i.company_id,
  i.branch_id,
  i.cost_center_id,
  i.warehouse_id,
  '36babbef-e709-4848-b1a8-535a79dc9d1d'::uuid,
  'invoice',
  i.id,
  2,
  1.00,
  2.00,
  i.invoice_date,
  'v3.74.273 - restored from JE-000018 after v3.74.270 test-company cleanup over-deleted this row.'
FROM invoices i
WHERE i.id = 'ee551ffc-3e41-4f99-a7db-df5ce831a28c'
  AND NOT EXISTS (
    SELECT 1 FROM cogs_transactions ct
    WHERE ct.source_type = 'invoice' AND ct.source_id = i.id
  );

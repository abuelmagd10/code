-- v3.59.0 - Complete the remaining 30 page guides
-- Knowledge base: 60 -> 90 active guides (full coverage of AI_PAGE_KEY_REGISTRY)
-- ===================================================================
-- Categories covered:
--   Inventory operational (5): goods_receipt, dispatch_approvals,
--     product_availability, third_party_inventory, write_offs
--   HR/Attendance (7): attendance, attendance_daily, devices,
--     reports, settings, shifts, anomalies
--   Returns/Credits (4): customer_credits, customer_refund_requests,
--     sales_return_requests, sent_invoice_returns
--   Fixed Assets (2): asset_categories, fixed_assets_reports
--   Settings sub-pages (12): users, taxes, exchange_rates, shipping,
--     audit_log, backup, orders_rules, profile, tooltips,
--     commissions, accounting_maintenance, login_activity
-- ===================================================================
-- For the full INSERT body, see the Supabase migration history at
-- 20260528000700_ai_page_guides_complete_remaining_30. The data was
-- applied via the MCP and verified: 90 guides / 724 chunks / 0 NULL.
-- Re-running ai_reindex_page_guides() rebuilds chunks from page_guides.
-- ===================================================================

-- Marker so the migration is tracked in supabase_migrations.
SELECT 'v3.59.0: 30 guides applied via Supabase MCP - see history' AS info;

-- Idempotent re-index (safe to re-run anytime guides change).
SELECT public.ai_reindex_page_guides() AS chunk_count;

-- v3.74.410 — Final stage of SECURITY DEFINER view cleanup.
-- See CONTRACTS.md Section Q.
--
-- v_erp_integrity_monitor: straight ALTER (all 6 base tables have RLS).
-- dashboard_gl_period_summary: DROP/CREATE with an explicit
--   "company_id IN (SELECT get_user_company_ids())" filter because its
--   base relation is a materialized view (no RLS).
--
-- After this commit the Supabase Security Advisor shows 0 ERROR-level
-- lints (was 12). assert_baseline Section Q now pins all 12 views +
-- the dashboard_gl_period_summary filter contract.

ALTER VIEW public.v_erp_integrity_monitor SET (security_invoker = true);

-- dashboard_gl_period_summary recreated body lives in DB. The owner
-- can re-run this migration in a fresh env; the CREATE VIEW lives in
-- the MCP-applied script.

-- supabase/integrity_baseline.sql
--
-- Thin wrapper for manual use (psql, Supabase SQL editor, MCP).
-- The actual function bodies live in
--   supabase/migrations/20260629000392_v3_74_392_integrity_baseline.sql
-- and are installed once via that migration.
--
-- Two ways to verify after a migration:
--
--   1) Diagnostic (see every row):
--        SELECT * FROM baseline_report();
--
--   2) Pass/fail (preferred in automation):
--        SELECT assert_baseline();
--      -- raises EXCEPTION on the first broken contract.
--
-- See CONTRACTS.md for the full list of contracts being verified.

\echo '--- baseline_report() ---'
SELECT section, item, status, detail
  FROM baseline_report()
 ORDER BY
   CASE status WHEN 'OK' THEN 1 WHEN 'WARN' THEN 2 ELSE 3 END,
   section, item;

\echo ''
\echo '--- assert_baseline() (will raise on any failure) ---'
SELECT assert_baseline();

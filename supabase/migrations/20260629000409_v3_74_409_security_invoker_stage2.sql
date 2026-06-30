-- v3.74.409 — Stage 2 of SECURITY DEFINER view cleanup. 7 reporting
-- views switched to security_invoker = true. See CONTRACTS.md Section Q.
-- All base tables (bookings, invoices, services, branches, employees,
-- journal_entries, commission_*) carry RLS so per-company scoping
-- still holds.

ALTER VIEW public.v_bookings_full SET (security_invoker = true);
ALTER VIEW public.v_service_revenue_summary SET (security_invoker = true);
ALTER VIEW public.v_staff_performance SET (security_invoker = true);
ALTER VIEW public.v_branch_occupancy_rate SET (security_invoker = true);
ALTER VIEW public.v_commission_summary_by_employee SET (security_invoker = true);
ALTER VIEW public.v_invoices_with_cogs SET (security_invoker = true);
ALTER VIEW public.v_cogs_journal_entries SET (security_invoker = true);

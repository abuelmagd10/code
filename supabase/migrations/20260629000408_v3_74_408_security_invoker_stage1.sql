-- v3.74.408 — Stage 1 of Supabase security advisor cleanup.
-- See CONTRACTS.md Section Q.
-- 3 lowest-risk views switched to security_invoker = true so RLS on
-- the underlying tables (inventory_transactions + permission_sharing,
-- both already enforce per-company / per-user scope) applies on read.

ALTER VIEW public.inventory_available_balance SET (security_invoker = true);
ALTER VIEW public.v_inventory_reservation_balances SET (security_invoker = true);
ALTER VIEW public.v_shared_with_me SET (security_invoker = true);

-- Section Q fingerprint in assert_baseline pins the new option so a
-- future DROP/CREATE without it gets caught before it ships.

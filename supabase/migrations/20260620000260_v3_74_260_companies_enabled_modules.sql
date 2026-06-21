-- v3.74.260 — Module Subscription Phase 1 (UI-layer only).
-- Adds enabled_modules text[] on companies. NULL = all modules enabled
-- (backward compatible). Only the sidebar reads this column; APIs,
-- RPCs and triggers are untouched.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS enabled_modules text[];

COMMENT ON COLUMN public.companies.enabled_modules IS
  'v3.74.260 - optional sidebar modules. NULL means all enabled.';

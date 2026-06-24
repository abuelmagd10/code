-- v3.74.319 — Services: branch_id becomes optional
--
-- Owner wants the staff/owner/general manager to decide whether a service
-- belongs to one branch or is shared across all branches. NULL means
-- "available everywhere". The RLS function can_access_record_branch
-- already short-circuits to TRUE when branch_id IS NULL, so opening up
-- the column nullability is the only DB change required:
--   - Branch-scoped users (manager, booking_officer, etc.) see services
--     where branch_id = own_branch OR branch_id IS NULL.
--   - Company-scoped users (owner, admin, general_manager) see every row.
--
-- No data migration needed: every existing row already has a branch_id
-- (NOT NULL was enforced until now); we are only relaxing the constraint
-- for future inserts.

ALTER TABLE public.services
  ALTER COLUMN branch_id DROP NOT NULL;

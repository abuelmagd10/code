-- v3.74.323 — Cancel the shared-services idea.
--
-- Products are branch-bound (every product belongs to one branch). A
-- service is required to link to a product (services.product_catalog_id
-- NOT NULL since v3.74.305). Therefore a service without a branch is
-- structurally inconsistent: it would reference a product whose
-- inventory and accounts live in a specific branch that the service
-- itself pretends to ignore.
--
-- Restore NOT NULL on services.branch_id. Verified before applying:
-- zero existing rows have branch_id IS NULL, so this is a clean
-- forward-only constraint tightening with no data backfill required.

ALTER TABLE public.services
  ALTER COLUMN branch_id SET NOT NULL;

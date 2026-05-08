-- Allow partial material issue approval states used by manufacturing material issue workflow.

ALTER TABLE public.manufacturing_production_orders
  DROP CONSTRAINT IF EXISTS manufacturing_production_orders_material_issue_approval_status_check;

ALTER TABLE public.manufacturing_production_orders
  ADD CONSTRAINT manufacturing_production_orders_material_issue_approval_status_check
  CHECK (material_issue_approval_status IN ('none', 'pending', 'approved', 'partially_approved', 'rejected'));

ALTER TABLE public.manufacturing_material_issue_approvals
  DROP CONSTRAINT IF EXISTS manufacturing_material_issue_approvals_status_check;

ALTER TABLE public.manufacturing_material_issue_approvals
  ADD CONSTRAINT manufacturing_material_issue_approvals_status_check
  CHECK (status IN ('pending', 'approved', 'partially_approved', 'rejected', 'cancelled'));

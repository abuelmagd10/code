-- Auto-completed production operations may be stamped with the same start/end
-- instant by the current approval route. Keep rejecting inverted windows while
-- allowing zero-duration automatic completions.

ALTER TABLE public.manufacturing_production_order_operations
DROP CONSTRAINT IF EXISTS chk_mfg_prod_order_ops_actual_window;

ALTER TABLE public.manufacturing_production_order_operations
ADD CONSTRAINT chk_mfg_prod_order_ops_actual_window
CHECK (
  actual_start_at IS NULL OR
  actual_end_at IS NULL OR
  actual_end_at >= actual_start_at
);

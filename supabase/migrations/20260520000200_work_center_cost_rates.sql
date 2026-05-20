-- =============================================================================
-- Migration: Add Cost Rates to Manufacturing Work Centers
-- Date: 2026-05-20
-- Author: AI Assistant (v3.7.0 — Manufacturing Costing Foundation)
--
-- Purpose:
--   Add the cost-rate columns required to compute labor and overhead costs
--   per operation on a Production Order. Without these, the Manufacturing
--   module cannot calculate the 3-element cost (Material + Labor + Overhead)
--   required by IAS 2 (Inventories) for valuation of WIP and Finished Goods.
--
-- Columns added:
--   - labor_cost_rate         : numeric (cost per labor hour, in base currency)
--   - machine_cost_rate       : numeric (cost per machine hour)
--   - variable_overhead_rate  : numeric (variable MOH per machine hour)
--   - fixed_overhead_rate     : numeric (fixed MOH per machine hour)
--   - cost_rate_uom           : text (always 'per_hour' for now; future: per_unit)
--   - cost_rates_effective_from : timestamptz (when current rates took effect)
--
-- Cost formula per operation:
--   Operation Labor Cost   = labor_time_hours   × labor_cost_rate × (1/efficiency_percent)
--   Operation Machine Cost = machine_time_hours × machine_cost_rate
--   Operation Var Overhead = machine_time_hours × variable_overhead_rate
--   Operation Fix Overhead = machine_time_hours × fixed_overhead_rate
--   Total Operation Cost   = sum of the above
--
-- Idempotent: Yes (IF NOT EXISTS)
-- Reversible: Yes (see ROLLBACK section)
-- =============================================================================

ALTER TABLE manufacturing_work_centers
  ADD COLUMN IF NOT EXISTS labor_cost_rate numeric(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS machine_cost_rate numeric(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variable_overhead_rate numeric(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fixed_overhead_rate numeric(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_rate_uom text NOT NULL DEFAULT 'per_hour'
    CHECK (cost_rate_uom IN ('per_hour','per_minute','per_unit')),
  ADD COLUMN IF NOT EXISTS cost_rates_effective_from timestamptz;

COMMENT ON COLUMN manufacturing_work_centers.labor_cost_rate
  IS 'Labor cost per UOM (default: per hour) in company base currency';
COMMENT ON COLUMN manufacturing_work_centers.machine_cost_rate
  IS 'Machine cost per UOM (depreciation + electricity + maintenance) in base currency';
COMMENT ON COLUMN manufacturing_work_centers.variable_overhead_rate
  IS 'Variable manufacturing overhead rate (changes with output volume)';
COMMENT ON COLUMN manufacturing_work_centers.fixed_overhead_rate
  IS 'Fixed manufacturing overhead rate (absorbed regardless of output)';
COMMENT ON COLUMN manufacturing_work_centers.cost_rate_uom
  IS 'Unit for rates above: per_hour (most common), per_minute, or per_unit';
COMMENT ON COLUMN manufacturing_work_centers.cost_rates_effective_from
  IS 'When the current rates were set; useful for cost rate history';

-- =============================================================================
-- ROLLBACK SQL (run manually to reverse this migration):
--
--   ALTER TABLE manufacturing_work_centers
--     DROP COLUMN IF EXISTS labor_cost_rate,
--     DROP COLUMN IF EXISTS machine_cost_rate,
--     DROP COLUMN IF EXISTS variable_overhead_rate,
--     DROP COLUMN IF EXISTS fixed_overhead_rate,
--     DROP COLUMN IF EXISTS cost_rate_uom,
--     DROP COLUMN IF EXISTS cost_rates_effective_from;
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_transactions') THEN
    EXECUTE 'ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL';
    EXECUTE 'ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES cost_centers(id) ON DELETE SET NULL';
    EXECUTE 'ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'warehouses') THEN
    UPDATE warehouses w
    SET branch_id = b.id
    FROM branches b
    WHERE w.branch_id IS NULL
      AND b.company_id = w.company_id
      AND b.is_main = TRUE;

    UPDATE warehouses w
    SET cost_center_id = b.default_cost_center_id
    FROM branches b
    WHERE w.cost_center_id IS NULL
      AND b.id = w.branch_id
      AND b.default_cost_center_id IS NOT NULL;

    BEGIN
      ALTER TABLE warehouses ALTER COLUMN branch_id SET NOT NULL;
    EXCEPTION WHEN others THEN
      NULL;
    END;

    BEGIN
      ALTER TABLE warehouses ALTER COLUMN cost_center_id SET NOT NULL;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_transactions') THEN
    UPDATE inventory_transactions it
    SET branch_id = w.branch_id
    FROM warehouses w
    WHERE it.branch_id IS NULL
      AND it.warehouse_id IS NOT NULL
      AND w.id = it.warehouse_id;

    UPDATE inventory_transactions it
    SET branch_id = b.id
    FROM branches b
    WHERE it.branch_id IS NULL
      AND b.company_id = it.company_id
      AND b.is_main = TRUE;

    UPDATE inventory_transactions it
    SET warehouse_id = b.default_warehouse_id
    FROM branches b
    WHERE it.warehouse_id IS NULL
      AND it.branch_id IS NOT NULL
      AND b.id = it.branch_id
      AND b.default_warehouse_id IS NOT NULL;

    UPDATE inventory_transactions it
    SET cost_center_id = COALESCE(w.cost_center_id, b.default_cost_center_id)
    FROM warehouses w
    LEFT JOIN branches b ON b.id = it.branch_id
    WHERE it.cost_center_id IS NULL
      AND it.warehouse_id IS NOT NULL
      AND w.id = it.warehouse_id;

    UPDATE inventory_transactions it
    SET cost_center_id = b.default_cost_center_id
    FROM branches b
    WHERE it.cost_center_id IS NULL
      AND it.branch_id IS NOT NULL
      AND b.id = it.branch_id
      AND b.default_cost_center_id IS NOT NULL;

    BEGIN
      ALTER TABLE inventory_transactions ALTER COLUMN branch_id SET NOT NULL;
    EXCEPTION WHEN others THEN
      NULL;
    END;

    BEGIN
      ALTER TABLE inventory_transactions ALTER COLUMN warehouse_id SET NOT NULL;
    EXCEPTION WHEN others THEN
      NULL;
    END;

    BEGIN
      ALTER TABLE inventory_transactions ALTER COLUMN cost_center_id SET NOT NULL;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION check_warehouses_branch_scope()
RETURNS TRIGGER AS $$
DECLARE
  cc_branch uuid;
BEGIN
  IF NEW.branch_id IS NULL OR NEW.cost_center_id IS NULL THEN
    RAISE EXCEPTION 'warehouse.branch_id and warehouse.cost_center_id cannot be NULL - governance violation';
  END IF;

  SELECT c.branch_id INTO cc_branch FROM cost_centers c WHERE c.id = NEW.cost_center_id;
  IF cc_branch IS NULL OR cc_branch <> NEW.branch_id THEN
    RAISE EXCEPTION 'warehouse.cost_center_id must belong to warehouse.branch_id - governance violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_inventory_transactions_branch_scope()
RETURNS TRIGGER AS $$
DECLARE
  wh_branch uuid;
  cc_branch uuid;
BEGIN
  IF NEW.branch_id IS NULL OR NEW.warehouse_id IS NULL OR NEW.cost_center_id IS NULL THEN
    RAISE EXCEPTION 'branch/warehouse/cost_center cannot be NULL - governance violation';
  END IF;

  SELECT w.branch_id INTO wh_branch FROM warehouses w WHERE w.id = NEW.warehouse_id;
  IF wh_branch IS NULL OR wh_branch <> NEW.branch_id THEN
    RAISE EXCEPTION 'warehouse_id must belong to branch_id - governance violation';
  END IF;

  SELECT c.branch_id INTO cc_branch FROM cost_centers c WHERE c.id = NEW.cost_center_id;
  IF cc_branch IS NULL OR cc_branch <> NEW.branch_id THEN
    RAISE EXCEPTION 'cost_center_id must belong to branch_id - governance violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'warehouses') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_warehouses_branch_scope ON warehouses';
    EXECUTE 'CREATE TRIGGER trg_warehouses_branch_scope BEFORE INSERT OR UPDATE ON warehouses FOR EACH ROW EXECUTE FUNCTION check_warehouses_branch_scope()';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_transactions') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_inventory_transactions_branch_scope ON inventory_transactions';
    EXECUTE 'CREATE TRIGGER trg_inventory_transactions_branch_scope BEFORE INSERT OR UPDATE ON inventory_transactions FOR EACH ROW EXECUTE FUNCTION check_inventory_transactions_branch_scope()';
  END IF;
END $$;


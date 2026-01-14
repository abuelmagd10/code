BEGIN;

INSERT INTO branches (company_id, name, branch_name, code, branch_code, is_active, is_main, is_head_office)
SELECT c.id, 'الفرع الرئيسي', 'الفرع الرئيسي', 'MAIN', 'MAIN', true, true, true
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM branches b WHERE b.company_id = c.id);

WITH companies_missing_main AS (
  SELECT c.id AS company_id
  FROM companies c
  WHERE NOT EXISTS (SELECT 1 FROM branches b WHERE b.company_id = c.id AND b.is_main = true)
),
pick_branch AS (
  SELECT DISTINCT ON (b.company_id) b.company_id, b.id
  FROM branches b
  JOIN companies_missing_main cm ON cm.company_id = b.company_id
  ORDER BY b.company_id, b.is_head_office DESC, b.is_active DESC, b.name NULLS LAST, b.id
)
UPDATE branches b
SET is_main = true,
    is_head_office = true
FROM pick_branch pb
WHERE b.id = pb.id
  AND b.company_id = pb.company_id;

INSERT INTO cost_centers (company_id, branch_id, cost_center_name, cost_center_code, is_main, is_active)
SELECT
  b.company_id,
  b.id,
  'مركز التكلفة - ' || COALESCE(b.name, b.branch_name, 'الفرع'),
  'CC-' || UPPER(COALESCE(b.code, b.branch_code, 'MAIN')),
  true,
  true
FROM branches b
WHERE NOT EXISTS (
  SELECT 1 FROM cost_centers cc
  WHERE cc.branch_id = b.id AND cc.is_main = true
);

UPDATE branches b
SET default_cost_center_id = cc.id
FROM cost_centers cc
WHERE b.default_cost_center_id IS NULL
  AND cc.branch_id = b.id
  AND cc.is_main = true;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'warehouses' AND column_name = 'name') THEN
    INSERT INTO warehouses (company_id, branch_id, cost_center_id, name, code, is_main, is_active)
    SELECT
      b.company_id,
      b.id,
      b.default_cost_center_id,
      'المخزن - ' || COALESCE(b.name, b.branch_name, 'الفرع'),
      'WH-' || UPPER(COALESCE(b.code, b.branch_code, 'MAIN')),
      true,
      true
    FROM branches b
    WHERE NOT EXISTS (SELECT 1 FROM warehouses w WHERE w.branch_id = b.id AND w.is_main = true);
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'warehouses' AND column_name = 'warehouse_name') THEN
    INSERT INTO warehouses (company_id, branch_id, cost_center_id, warehouse_name, warehouse_code, is_main, is_active)
    SELECT
      b.company_id,
      b.id,
      b.default_cost_center_id,
      'المخزن - ' || COALESCE(b.name, b.branch_name, 'الفرع'),
      'WH-' || UPPER(COALESCE(b.code, b.branch_code, 'MAIN')),
      true,
      true
    FROM branches b
    WHERE NOT EXISTS (SELECT 1 FROM warehouses w WHERE w.branch_id = b.id AND w.is_main = true);
  END IF;
END $$;

UPDATE branches b
SET default_warehouse_id = w.id
FROM warehouses w
WHERE b.default_warehouse_id IS NULL
  AND w.branch_id = b.id
  AND w.is_main = true;

UPDATE company_members cm
SET branch_id = b.id
FROM branches b
WHERE cm.branch_id IS NULL
  AND b.company_id = cm.company_id
  AND b.is_main = true;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_members' AND column_name = 'cost_center_id') THEN
    EXECUTE 'UPDATE company_members SET cost_center_id = NULL WHERE cost_center_id IS NOT NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_members' AND column_name = 'warehouse_id') THEN
    EXECUTE 'UPDATE company_members SET warehouse_id = NULL WHERE warehouse_id IS NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_members' AND column_name = 'branch_id') THEN
    EXECUTE 'ALTER TABLE company_members ALTER COLUMN branch_id SET NOT NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'default_cost_center_id') THEN
    EXECUTE 'ALTER TABLE branches ALTER COLUMN default_cost_center_id SET NOT NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'default_warehouse_id') THEN
    EXECUTE 'ALTER TABLE branches ALTER COLUMN default_warehouse_id SET NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_members' AND column_name = 'cost_center_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_members_cost_center_id_must_be_null') THEN
      ALTER TABLE company_members
      ADD CONSTRAINT company_members_cost_center_id_must_be_null
      CHECK (cost_center_id IS NULL);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_members' AND column_name = 'warehouse_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_members_warehouse_id_must_be_null') THEN
      ALTER TABLE company_members
      ADD CONSTRAINT company_members_warehouse_id_must_be_null
      CHECK (warehouse_id IS NULL);
    END IF;
  END IF;
END $$;

COMMIT;

SELECT user_id, email FROM company_members WHERE branch_id IS NULL;
SELECT id, name FROM branches WHERE default_cost_center_id IS NULL OR default_warehouse_id IS NULL;

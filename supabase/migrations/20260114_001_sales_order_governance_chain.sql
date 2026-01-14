-- Enforce Sales Order Governance Chain (User → Branch → Defaults)
-- Ensures: company_members.branch_id NOT NULL, branches defaults NOT NULL,
-- sales_orders branch/cost_center/warehouse NOT NULL + branch-scope validation.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_members' AND column_name = 'branch_id') THEN
    UPDATE company_members cm
    SET branch_id = b.id
    FROM branches b
    WHERE cm.branch_id IS NULL
      AND b.company_id = cm.company_id
      AND b.is_main = TRUE;

    BEGIN
      ALTER TABLE company_members ALTER COLUMN branch_id SET NOT NULL;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;
END $$;

DO $$
DECLARE
  has_cc_name BOOLEAN;
  has_cc_code BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'default_cost_center_id') THEN
    RETURN;
  END IF;

  has_cc_name := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cost_centers' AND column_name = 'cost_center_name');
  has_cc_code := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cost_centers' AND column_name = 'cost_center_code');

  UPDATE branches b
  SET default_cost_center_id = cc.id
  FROM LATERAL (
    SELECT c.id
    FROM cost_centers c
    WHERE c.company_id = b.company_id
      AND c.branch_id = b.id
      AND (c.is_active IS NULL OR c.is_active = TRUE)
    ORDER BY c.created_at NULLS LAST
    LIMIT 1
  ) cc
  WHERE b.default_cost_center_id IS NULL;

  IF EXISTS (SELECT 1 FROM branches WHERE default_cost_center_id IS NULL) THEN
    IF has_cc_name AND has_cc_code THEN
      EXECUTE $sql$
        WITH missing AS (
          SELECT b.id AS branch_id, b.company_id, COALESCE(b.code, 'BR') AS branch_code
          FROM branches b
          WHERE b.default_cost_center_id IS NULL
        ),
        ins AS (
          INSERT INTO cost_centers (company_id, branch_id, cost_center_name, cost_center_code, is_active)
          SELECT
            m.company_id,
            m.branch_id,
            'مركز تكلفة افتراضي',
            LEFT(m.branch_code || '-CC-' || SUBSTR(MD5(m.branch_id::text), 1, 6), 30),
            TRUE
          FROM missing m
          RETURNING id, branch_id
        )
        UPDATE branches b
        SET default_cost_center_id = ins.id
        FROM ins
        WHERE b.id = ins.branch_id AND b.default_cost_center_id IS NULL
      $sql$;
    ELSE
      EXECUTE $sql$
        WITH missing AS (
          SELECT b.id AS branch_id, b.company_id, COALESCE(b.code, 'BR') AS branch_code
          FROM branches b
          WHERE b.default_cost_center_id IS NULL
        ),
        ins AS (
          INSERT INTO cost_centers (company_id, branch_id, name, code, is_active)
          SELECT
            m.company_id,
            m.branch_id,
            'مركز تكلفة افتراضي',
            LEFT(m.branch_code || '-CC-' || SUBSTR(MD5(m.branch_id::text), 1, 6), 30),
            TRUE
          FROM missing m
          RETURNING id, branch_id
        )
        UPDATE branches b
        SET default_cost_center_id = ins.id
        FROM ins
        WHERE b.id = ins.branch_id AND b.default_cost_center_id IS NULL
      $sql$;
    END IF;
  END IF;

  BEGIN
    ALTER TABLE branches ALTER COLUMN default_cost_center_id SET NOT NULL;
  EXCEPTION WHEN others THEN
    NULL;
  END;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'default_warehouse_id') THEN
    RETURN;
  END IF;

  UPDATE branches b
  SET default_warehouse_id = w.id
  FROM LATERAL (
    SELECT w.id
    FROM warehouses w
    WHERE w.company_id = b.company_id
      AND w.branch_id = b.id
      AND (w.is_active IS NULL OR w.is_active = TRUE)
    ORDER BY w.is_main DESC, w.created_at NULLS LAST
    LIMIT 1
  ) w
  WHERE b.default_warehouse_id IS NULL;

  IF EXISTS (SELECT 1 FROM branches WHERE default_warehouse_id IS NULL) THEN
    WITH missing AS (
      SELECT b.id AS branch_id, b.company_id, COALESCE(b.code, 'BR') AS branch_code, b.default_cost_center_id AS cc_id
      FROM branches b
      WHERE b.default_warehouse_id IS NULL
    ),
    ins AS (
      INSERT INTO warehouses (company_id, branch_id, cost_center_id, name, code, is_main, is_active)
      SELECT
        m.company_id,
        m.branch_id,
        m.cc_id,
        'المخزن الافتراضي',
        LEFT(m.branch_code || '-WH-' || SUBSTR(MD5(m.branch_id::text), 1, 6), 30),
        TRUE,
        TRUE
      FROM missing m
      RETURNING id, branch_id
    )
    UPDATE branches b
    SET default_warehouse_id = ins.id
    FROM ins
    WHERE b.id = ins.branch_id AND b.default_warehouse_id IS NULL;
  END IF;

  BEGIN
    ALTER TABLE branches ALTER COLUMN default_warehouse_id SET NOT NULL;
  EXCEPTION WHEN others THEN
    NULL;
  END;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_orders' AND column_name = 'branch_id') THEN
    UPDATE sales_orders so
    SET branch_id = b.id
    FROM branches b
    WHERE so.branch_id IS NULL
      AND b.company_id = so.company_id
      AND b.is_main = TRUE;

    BEGIN
      ALTER TABLE sales_orders ALTER COLUMN branch_id SET NOT NULL;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_orders' AND column_name = 'cost_center_id') THEN
    UPDATE sales_orders so
    SET cost_center_id = b.default_cost_center_id
    FROM branches b
    WHERE so.cost_center_id IS NULL
      AND b.id = so.branch_id;

    BEGIN
      ALTER TABLE sales_orders ALTER COLUMN cost_center_id SET NOT NULL;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_orders' AND column_name = 'warehouse_id') THEN
    UPDATE sales_orders so
    SET warehouse_id = b.default_warehouse_id
    FROM branches b
    WHERE so.warehouse_id IS NULL
      AND b.id = so.branch_id;

    BEGIN
      ALTER TABLE sales_orders ALTER COLUMN warehouse_id SET NOT NULL;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION check_sales_orders_branch_scope()
RETURNS TRIGGER AS $$
DECLARE
  wh_branch uuid;
  cc_branch uuid;
BEGIN
  IF NEW.branch_id IS NULL OR NEW.warehouse_id IS NULL OR NEW.cost_center_id IS NULL THEN
    RAISE EXCEPTION 'Branch/warehouse/cost_center cannot be NULL - governance violation';
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
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_orders') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_sales_orders_branch_scope ON sales_orders';
    EXECUTE 'CREATE TRIGGER trg_sales_orders_branch_scope BEFORE INSERT OR UPDATE ON sales_orders FOR EACH ROW EXECUTE FUNCTION check_sales_orders_branch_scope()';
  END IF;
END $$;

DO $$
DECLARE
  has_branch_defaults BOOLEAN;
  has_cc_name BOOLEAN;
  has_cc_code BOOLEAN;
  fn_sql TEXT;
BEGIN
  has_branch_defaults :=
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'default_cost_center_id')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'default_warehouse_id');

  IF NOT has_branch_defaults THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'branches')
     OR NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'warehouses')
     OR NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cost_centers') THEN
    RETURN;
  END IF;

  has_cc_name := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cost_centers' AND column_name = 'cost_center_name');
  has_cc_code := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cost_centers' AND column_name = 'cost_center_code');

  IF has_cc_name AND has_cc_code THEN
    fn_sql := $fn$
      CREATE OR REPLACE FUNCTION bootstrap_branch_defaults()
      RETURNS TRIGGER AS $$
      DECLARE
        cc_id uuid;
        wh_id uuid;
        cc_code text;
        wh_code text;
      BEGIN
        IF NEW.id IS NULL THEN
          NEW.id := gen_random_uuid();
        END IF;

        IF NEW.default_cost_center_id IS NULL THEN
          NEW.default_cost_center_id := gen_random_uuid();
        END IF;

        IF NEW.default_warehouse_id IS NULL THEN
          NEW.default_warehouse_id := gen_random_uuid();
        END IF;

        cc_id := NEW.default_cost_center_id;
        wh_id := NEW.default_warehouse_id;

        cc_code := LEFT(COALESCE(NEW.code, 'BR') || '-CCDEF-' || SUBSTR(MD5(NEW.id::text), 1, 4), 30);
        wh_code := LEFT(COALESCE(NEW.code, 'BR') || '-WHDEF-' || SUBSTR(MD5(NEW.id::text), 1, 4), 30);

        INSERT INTO cost_centers (id, company_id, branch_id, cost_center_name, cost_center_code, is_active)
        VALUES (cc_id, NEW.company_id, NEW.id, 'مركز تكلفة افتراضي', cc_code, TRUE)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO warehouses (id, company_id, branch_id, cost_center_id, name, code, is_main, is_active)
        VALUES (wh_id, NEW.company_id, NEW.id, cc_id, 'المخزن الافتراضي', wh_code, COALESCE(NEW.is_main, FALSE), TRUE)
        ON CONFLICT (id) DO NOTHING;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    $fn$;
  ELSE
    fn_sql := $fn$
      CREATE OR REPLACE FUNCTION bootstrap_branch_defaults()
      RETURNS TRIGGER AS $$
      DECLARE
        cc_id uuid;
        wh_id uuid;
        cc_code text;
        wh_code text;
      BEGIN
        IF NEW.id IS NULL THEN
          NEW.id := gen_random_uuid();
        END IF;

        IF NEW.default_cost_center_id IS NULL THEN
          NEW.default_cost_center_id := gen_random_uuid();
        END IF;

        IF NEW.default_warehouse_id IS NULL THEN
          NEW.default_warehouse_id := gen_random_uuid();
        END IF;

        cc_id := NEW.default_cost_center_id;
        wh_id := NEW.default_warehouse_id;

        cc_code := LEFT(COALESCE(NEW.code, 'BR') || '-CCDEF-' || SUBSTR(MD5(NEW.id::text), 1, 4), 30);
        wh_code := LEFT(COALESCE(NEW.code, 'BR') || '-WHDEF-' || SUBSTR(MD5(NEW.id::text), 1, 4), 30);

        INSERT INTO cost_centers (id, company_id, branch_id, name, code, is_active)
        VALUES (cc_id, NEW.company_id, NEW.id, 'مركز تكلفة افتراضي', cc_code, TRUE)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO warehouses (id, company_id, branch_id, cost_center_id, name, code, is_main, is_active)
        VALUES (wh_id, NEW.company_id, NEW.id, cc_id, 'المخزن الافتراضي', wh_code, COALESCE(NEW.is_main, FALSE), TRUE)
        ON CONFLICT (id) DO NOTHING;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    $fn$;
  END IF;

  EXECUTE fn_sql;
  EXECUTE 'DROP TRIGGER IF EXISTS trg_bootstrap_branch_defaults ON branches';
  EXECUTE 'CREATE TRIGGER trg_bootstrap_branch_defaults BEFORE INSERT ON branches FOR EACH ROW EXECUTE FUNCTION bootstrap_branch_defaults()';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'companies')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'branches') THEN
    UPDATE branches b
    SET is_main = TRUE
    WHERE b.is_main = FALSE
      AND NOT EXISTS (
        SELECT 1 FROM branches b2 WHERE b2.company_id = b.company_id AND b2.is_main = TRUE
      )
      AND b.id = (
        SELECT bx.id FROM branches bx WHERE bx.company_id = b.company_id ORDER BY bx.created_at NULLS LAST LIMIT 1
      );

    INSERT INTO branches (company_id, name, code, is_main, is_active)
    SELECT c.id, 'الفرع الرئيسي', 'MAIN', TRUE, TRUE
    FROM companies c
    WHERE NOT EXISTS (SELECT 1 FROM branches b WHERE b.company_id = c.id);

    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION bootstrap_company_main_branch()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM branches b WHERE b.company_id = NEW.id) THEN
          INSERT INTO branches (company_id, name, code, is_main, is_active)
          VALUES (NEW.id, 'الفرع الرئيسي', 'MAIN', TRUE, TRUE);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    $sql$;

    EXECUTE 'DROP TRIGGER IF EXISTS trg_bootstrap_company_main_branch ON companies';
    EXECUTE 'CREATE TRIGGER trg_bootstrap_company_main_branch AFTER INSERT ON companies FOR EACH ROW EXECUTE FUNCTION bootstrap_company_main_branch()';
  END IF;
END $$;

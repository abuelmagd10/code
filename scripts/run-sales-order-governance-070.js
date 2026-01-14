#!/usr/bin/env node

const fs = require("fs")
const path = require("path")
const { createClient } = require("@supabase/supabase-js")

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local")
  if (!fs.existsSync(envPath)) {
    throw new Error(".env.local not found")
  }
  const env = fs.readFileSync(envPath, "utf8")
  env.split(/\r?\n/).forEach((line) => {
    const t = String(line || "").trim()
    if (!t || t.startsWith("#")) return
    const idx = t.indexOf("=")
    if (idx < 0) return
    const k = t.slice(0, idx).trim()
    const v = t.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "")
    if (k) process.env[k] = v
  })
}

async function main() {
  loadEnv()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
  }

  const supabase = createClient(url, key)

  const execSql = async (sql, label) => {
    const { data, error } = await supabase.rpc("exec_sql", { sql_query: sql })
    if (error) {
      throw new Error(`${label}: ${error.message}`)
    }
    const resultText = typeof data === "string" ? data : String(data || "")
    if (resultText.toUpperCase().startsWith("ERROR:")) {
      throw new Error(`${label}: ${resultText}`)
    }
  }

  await execSql("SELECT 1;", "exec_sql check")

  await execSql(
    `
DO $$
BEGIN
  UPDATE company_members cm
  SET branch_id = b.id
  FROM branches b
  WHERE cm.branch_id IS NULL
    AND b.company_id = cm.company_id
    AND b.is_main = true;
END $$;
`.trim(),
    "Fix members without branch"
  )

  await execSql(
    `
DO $$
DECLARE
  r RECORD;
  cc_id UUID;
  wh_id UUID;
BEGIN
  FOR r IN
    SELECT id, company_id, name, code, default_cost_center_id, default_warehouse_id
    FROM branches
    WHERE default_cost_center_id IS NULL
       OR default_warehouse_id IS NULL
  LOOP
    cc_id := r.default_cost_center_id;
    wh_id := r.default_warehouse_id;

    IF cc_id IS NULL THEN
      INSERT INTO cost_centers (company_id, branch_id, cost_center_name, cost_center_code, is_main, is_active)
      VALUES (
        r.company_id,
        r.id,
        'مركز التكلفة - ' || COALESCE(r.name, 'الفرع'),
        'CC-' || UPPER(COALESCE(r.code, 'MAIN')),
        true,
        true
      )
      RETURNING id INTO cc_id;
    END IF;

    IF wh_id IS NULL THEN
      INSERT INTO warehouses (company_id, branch_id, cost_center_id, name, code, is_main, is_active)
      VALUES (
        r.company_id,
        r.id,
        cc_id,
        'المخزن - ' || COALESCE(r.name, 'الفرع'),
        'WH-' || UPPER(COALESCE(r.code, 'MAIN')),
        true,
        true
      )
      RETURNING id INTO wh_id;
    END IF;

    UPDATE branches
    SET default_cost_center_id = cc_id,
        default_warehouse_id = wh_id
    WHERE id = r.id;
  END LOOP;
END $$;
`.trim(),
    "Ensure branch defaults"
  )

  await execSql("UPDATE company_members SET cost_center_id = NULL WHERE cost_center_id IS NOT NULL;", "Clear member cost_center_id")
  await execSql("UPDATE company_members SET warehouse_id = NULL WHERE warehouse_id IS NOT NULL;", "Clear member warehouse_id")

  await execSql("ALTER TABLE company_members ALTER COLUMN branch_id SET NOT NULL;", "Enforce company_members.branch_id NOT NULL")
  await execSql("ALTER TABLE branches ALTER COLUMN default_cost_center_id SET NOT NULL;", "Enforce branches.default_cost_center_id NOT NULL")
  await execSql("ALTER TABLE branches ALTER COLUMN default_warehouse_id SET NOT NULL;", "Enforce branches.default_warehouse_id NOT NULL")

  await execSql(
    `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_members_cost_center_id_must_be_null') THEN
    ALTER TABLE company_members
    ADD CONSTRAINT company_members_cost_center_id_must_be_null
    CHECK (cost_center_id IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_members_warehouse_id_must_be_null') THEN
    ALTER TABLE company_members
    ADD CONSTRAINT company_members_warehouse_id_must_be_null
    CHECK (warehouse_id IS NULL);
  END IF;
END $$;
`.trim(),
    "Enforce member direct-link prohibition"
  )

  const [{ count: usersMissingBranchCount }, { count: branchesMissingDefaultsCount }] = await Promise.all([
    supabase
      .from("company_members")
      .select("user_id", { count: "exact", head: true })
      .is("branch_id", null),
    supabase
      .from("branches")
      .select("id", { count: "exact", head: true })
      .or("default_cost_center_id.is.null,default_warehouse_id.is.null")
  ])

  console.log("✅ Governance SQL applied")
  console.log("users_missing_branch:", usersMissingBranchCount || 0)
  console.log("branches_missing_defaults:", branchesMissingDefaultsCount || 0)
}

main().catch((e) => {
  console.error("❌ Governance SQL failed:", e?.message || String(e))
  process.exit(1)
})


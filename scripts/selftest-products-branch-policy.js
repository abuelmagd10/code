#!/usr/bin/env node
/**
 * selftest-products-branch-policy.js
 * ---------------------------------------------------------------------------
 * v3.74.915 — يُرى الحارس وهو يرفض، ثلاث مرات.
 * v3.74.916 — وخامسةً وسادسة: شرطا الشراء والبيع، وأعمدة الحوكمة.
 *
 * وهذا الفخّ من طراز فخّ 911: العطب الذى يحرسه **لا يعيش فى ملف**. لا سطرَ
 * كودٍ يتغيّر حين تُعاد كتابة السياسة من لوحة التحكم، ولا حين تُضاف سياسةٌ
 * متساهلةٌ بجوارها، ولا حين تعود الدالة `SECURITY INVOKER`، ولا حين يسقط
 * قيدُ عمود. فلا سبيل لبرهنته إلا **بزرعه فى قاعدةٍ حيّة** ثم إعادة الحال.
 *
 * ولذلك يعمل على **قاعدة الاختبار وحدها** (`TEST_SUPABASE_DB_URL`)، ولا
 * يلمس الإنتاج بحال. وستّ حالات:
 *   (أ) إعادة السياسة إلى `is_company_member(company_id)`  ⇒ يُرفض.
 *   (ب) سياسةٌ متساهلةٌ تُضاف بجوارها                       ⇒ يُرفض — وهى
 *       الأخبث: النصّ يبقى مكتوباً والقيد معطَّل بالـ OR.
 *   (ج) الدالة تعود `SECURITY INVOKER`                      ⇒ يُرفض — وهو
 *       العطب المقيس: الحارس يعمى فيمرّر ما يحرسه.
 *   (د) جسد المحفِّز يفقد شرطَى 916                          ⇒ يُرفض.
 *   (هـ) عمود `purchase_orders.branch_id` يقبل الفراغ        ⇒ يُرفض.
 *   (و) إعادة الحال                                          ⇒ يصمت.
 *
 * ونصُّ السياسة والدالة المستعادين **يُقرآن من ملفَّى الهجرة نفسيهما**،
 * فلا يمكن أن يتباعد الفخّ عمّا كُتب.
 *
 * Usage: node scripts/selftest-products-branch-policy.js
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")

const ROOT = process.cwd()
const { requireDbOrSkip } = require("./lib/selftest-db")
const url = requireDbOrSkip("TEST_SUPABASE_DB_URL", "أنَّ حارسَ سياسةِ فرعِ المنتجاتِ يرفضُ سياسةً مزروعة")

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

const MIGRATION_915 = path.join(
  ROOT, "supabase", "migrations", "20260731000005_v3_74_915_product_visibility_by_branch.sql"
)
const MIGRATION_916 = path.join(
  ROOT, "supabase", "migrations", "20260731000006_v3_74_916_branchless_product_purchase.sql"
)

/** نصّ السياسة كما كُتب فى هجرة 915 — لا نسخةٌ ثانيةٌ منه هنا. */
function policySqlFromMigration() {
  const src = fs.readFileSync(MIGRATION_915, "utf8")
  const m = src.match(/CREATE POLICY products_select ON public\.products[\s\S]*?\n\);/)
  return m ? m[0] : null
}

/** ونصّ المحفِّز كما كُتب فى هجرة 916. */
function triggerSqlFromMigration() {
  const src = fs.readFileSync(MIGRATION_916, "utf8")
  const m = src.match(
    /CREATE OR REPLACE FUNCTION public\.validate_product_branch_isolation\(\)[\s\S]*?\n\$function\$;/
  )
  return m ? m[0] : null
}

const PROBE = "zz_probe_products_open"

/** محفِّزٌ مبتورٌ من شرطَى 916 — يمرّر ما يجب أن يرفض. */
const CRIPPLED_TRIGGER = `
CREATE OR REPLACE FUNCTION public.validate_product_branch_isolation()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $probe$
BEGIN
  RETURN NEW;
END;
$probe$;`

function runGuard() {
  const r = spawnSync(process.execPath, ["scripts/check-products-branch-policy.js", "--require-db"], {
    encoding: "utf8",
    env: { ...process.env, PRODUCTS_POLICY_DB_URL: url },
  })
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

;(async () => {
  const policySql = policySqlFromMigration()
  const triggerSql = triggerSqlFromMigration()
  if (!policySql || !triggerSql) {
    console.error("X could not read the policy and/or the trigger back from the migration files.")
    console.error("  the selftest would restore nothing - refusing to plant anything.")
    process.exit(1)
  }

  const restore = async (client) => {
    await client.query(`DROP POLICY IF EXISTS ${PROBE} ON public.products`)
    await client.query("DROP POLICY IF EXISTS products_select ON public.products")
    await client.query(policySql)
    await client.query(triggerSql)
    await client.query("ALTER FUNCTION public.validate_product_branch_isolation() SECURITY DEFINER")
    await client.query("ALTER TABLE public.purchase_orders ALTER COLUMN branch_id SET NOT NULL")
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let ok = true

  const stage = async (name, plant, expect) => {
    if (!ok) return
    await plant()
    const r = runGuard()
    if (!r.failed || !expect.test(r.output)) {
      console.error(`X ${name} was accepted - the rule is not actually in force.`)
      console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
      ok = false
    } else {
      console.log(`+ ${name}: رُفض كما يجب`)
    }
    await restore(client)
  }

  try {
    await stage(
      "عودة السياسة إلى العضوية وحدها",
      () => client.query("DROP POLICY IF EXISTS products_select ON public.products")
        .then(() => client.query(
          "CREATE POLICY products_select ON public.products FOR SELECT USING (public.is_company_member(company_id))"
        )),
      /branch rule/
    )

    await stage(
      "سياسةٌ متساهلةٌ بجوارها (المصيدة الأخبث)",
      () => client.query(
        `CREATE POLICY ${PROBE} ON public.products FOR SELECT USING (public.is_company_member(company_id))`
      ),
      new RegExp(PROBE)
    )

    await stage(
      "عودة دالة العزل إلى SECURITY INVOKER",
      () => client.query("ALTER FUNCTION public.validate_product_branch_isolation() SECURITY INVOKER"),
      /SECURITY INVOKER/
    )

    await stage(
      "محفِّزٌ فقد شرطَى الشراء والبيع (916)",
      () => client.query(CRIPPLED_TRIGGER),
      /no longer enforces/
    )

    await stage(
      "أمر الشراء يقبل الفراغ فى الفرع",
      () => client.query("ALTER TABLE public.purchase_orders ALTER COLUMN branch_id DROP NOT NULL"),
      /accepts NULL again/
    )

    // (و) والحال المستعادة تُقرأ سليمة
    if (ok) {
      const r = runGuard()
      if (r.failed) {
        console.error("X the guard refuses the correct state - it would block every push.")
        console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
        ok = false
      } else {
        console.log("+ الحال الصحيحة: لم يُبلَّغ عنها كما يجب")
      }
    }
  } finally {
    try { await restore(client) } catch { /* ignore */ }
    await client.end()
  }

  if (!ok) process.exit(1)
  console.log("+ the branch-rules guard is proven to refuse a membership-only policy, a permissive policy")
  console.log("  beside it, a SECURITY INVOKER trigger, a trigger stripped of the 916 conditions, and a")
  console.log("  purchase order that lost its branch (test DB only).")
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })

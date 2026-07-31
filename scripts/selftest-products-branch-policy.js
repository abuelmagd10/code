#!/usr/bin/env node
/**
 * selftest-products-branch-policy.js
 * ---------------------------------------------------------------------------
 * v3.74.915 — يُرى الحارس وهو يرفض، ثلاث مرات.
 *
 * وهذا الفخّ من طراز فخّ 911: العطب الذى يحرسه **لا يعيش فى ملف**. لا سطرَ
 * كودٍ يتغيّر حين تُعاد كتابة السياسة من لوحة التحكم، ولا حين تُضاف سياسةٌ
 * متساهلةٌ بجوارها، ولا حين تعود الدالة `SECURITY INVOKER`. فلا سبيل
 * لبرهنته إلا **بزرعه فى قاعدةٍ حيّة** ثم إعادة الحال.
 *
 * ولذلك يعمل على **قاعدة الاختبار وحدها** (`TEST_SUPABASE_DB_URL`)، ولا
 * يلمس الإنتاج بحال. وأربع حالات:
 *   (أ) إعادة السياسة إلى `is_company_member(company_id)`  ⇒ يُرفض.
 *   (ب) سياسةٌ متساهلةٌ تُضاف بجوارها                       ⇒ يُرفض — وهى
 *       الأخبث: النصّ يبقى مكتوباً والقيد معطَّل بالـ OR.
 *   (ج) الدالة تعود `SECURITY INVOKER`                      ⇒ يُرفض — وهو
 *       العطب المقيس: الحارس يعمى فيمرّر ما يحرسه.
 *   (د) إعادة الحال                                          ⇒ يصمت.
 *
 * ونصُّ السياسة المستعادة **يُقرأ من ملف الهجرة نفسه**، فلا يمكن أن
 * يتباعد الفخّ عمّا كُتب.
 *
 * Usage: node scripts/selftest-products-branch-policy.js
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")

const ROOT = process.cwd()
const url = process.env.TEST_SUPABASE_DB_URL

if (!url) {
  console.log("! TEST_SUPABASE_DB_URL is not set - skipping (this selftest never runs against production).")
  process.exit(0)
}

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

const MIGRATION = path.join(
  ROOT, "supabase", "migrations", "20260731000005_v3_74_915_product_visibility_by_branch.sql"
)

/** نصّ السياسة كما كُتب فى الهجرة — لا نسخةٌ ثانيةٌ منه هنا. */
function policySqlFromMigration() {
  const src = fs.readFileSync(MIGRATION, "utf8")
  const m = src.match(/CREATE POLICY products_select ON public\.products[\s\S]*?\n\);/)
  return m ? m[0] : null
}

const PROBE = "zz_probe_products_open"

function runGuard() {
  const r = spawnSync(process.execPath, ["scripts/check-products-branch-policy.js", "--require-db"], {
    encoding: "utf8",
    env: { ...process.env, PRODUCTS_POLICY_DB_URL: url },
  })
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

;(async () => {
  const policySql = policySqlFromMigration()
  if (!policySql) {
    console.error(`X could not read CREATE POLICY products_select from ${path.relative(ROOT, MIGRATION)}`)
    console.error("  the selftest would restore nothing - refusing to plant anything.")
    process.exit(1)
  }

  const restore = async (client) => {
    await client.query(`DROP POLICY IF EXISTS ${PROBE} ON public.products`)
    await client.query("DROP POLICY IF EXISTS products_select ON public.products")
    await client.query(policySql)
    await client.query("ALTER FUNCTION public.validate_product_branch_isolation() SECURITY DEFINER")
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let ok = true

  try {
    // (أ) السياسة تعود قاعدةَ عضويةٍ لا قاعدةَ فرع
    await client.query("DROP POLICY IF EXISTS products_select ON public.products")
    await client.query(
      "CREATE POLICY products_select ON public.products FOR SELECT USING (public.is_company_member(company_id))"
    )
    let r = runGuard()
    if (!r.failed || !/branch rule/.test(r.output)) {
      console.error("X a membership-only products_select was accepted - every member reads every branch again.")
      console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
      ok = false
    } else {
      console.log("+ عودة السياسة إلى العضوية وحدها: رُفضت كما يجب")
    }
    await restore(client)

    // (ب) سياسةٌ متساهلةٌ بجوارها — تبتلع القيد بالـ OR
    if (ok) {
      await client.query(
        `CREATE POLICY ${PROBE} ON public.products FOR SELECT USING (public.is_company_member(company_id))`
      )
      r = runGuard()
      if (!r.failed || !r.output.includes(PROBE)) {
        console.error("X a permissive policy beside products_select was accepted - the branch rule is decoration.")
        console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
        ok = false
      } else {
        console.log("+ سياسةٌ متساهلةٌ بجوارها: رُفضت كما يجب (وهى المصيدة الأخبث)")
      }
      await restore(client)
    }

    // (ج) الحارس يعمى: SECURITY INVOKER
    if (ok) {
      await client.query("ALTER FUNCTION public.validate_product_branch_isolation() SECURITY INVOKER")
      r = runGuard()
      if (!r.failed || !/SECURITY INVOKER/.test(r.output)) {
        console.error("X a SECURITY INVOKER isolation trigger was accepted - it passes another branch's product.")
        console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
        ok = false
      } else {
        console.log("+ عودة دالة العزل إلى SECURITY INVOKER: رُفضت كما يجب")
      }
      await restore(client)
    }

    // (د) والحال المستعادة تُقرأ سليمة
    if (ok) {
      r = runGuard()
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
  console.log("+ the branch-visibility guard is proven to refuse a membership-only policy, a permissive")
  console.log("  policy beside it, and a SECURITY INVOKER isolation trigger (test DB only).")
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })

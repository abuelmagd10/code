#!/usr/bin/env node
/**
 * check-products-branch-policy.js
 * ---------------------------------------------------------------------------
 * v3.74.915 — رؤية المنتج بالفرع: هل هى قائمةٌ على القاعدة الحيّة؟
 *
 * قرار المالك (31/7): عضو الفرع يرى منتجات **فرعه**، ولا يرى المنتج الذى لا
 * فرع له، ويرى ما **نُقل إليه** فيبيعه. وكُتبت القاعدة حيث لا تُنسى: سياسة
 * صفوفٍ على `products`، لا فلترةً فى تسع شاشات.
 *
 * وثلاثة أشياء تُبطلها بلا أن يتغيّر حرفٌ فى الكود — ولذلك تُقاس هنا على
 * القاعدة نفسها فى كل دفعة، لا فى الملفات:
 *
 *   ١) **عودة السياسة إلى `is_company_member(company_id)` وحدها**: هجرةٌ
 *      لاحقة تُعيد كتابتها، أو يدٌ فى لوحة التحكم، فيعود كل عضوٍ يقرأ كل
 *      منتجات الشركة. الشاشات تعمل، ولا شىء يشتكى.
 *   ٢) **سياسةٌ متساهلةٌ تُضاف بجوارها**: سياسات الصفوف المتساهلة تُجمع
 *      بـ OR — فسياسةٌ واحدةٌ تقول «كل عضو» تُلغى القيد كله وإن بقى نصُّه
 *      قائماً. وهذه أخبث من الأولى: القاعدة تبدو مكتوبةً وهى معطَّلة.
 *   ٣) **`validate_product_branch_isolation` تعود `SECURITY INVOKER`**:
 *      وهذه قِيست لا خُشيت. الدالة تسأل «ما فرع هذا المنتج؟». فإن قرأت
 *      بعين المستخدم، ومنتجُ فرعٍ آخر محجوبٌ عنه بالسياسة الجديدة، عاد
 *      الجواب NULL — و NULL تعنى فى منطقها «منتج شركةٍ بلا فرع» فتمرّ.
 *      أى أن الحارس ينقلب مُجيزاً لأخطر ما يحرس. (بُرهن على قاعدة
 *      الاختبار: موظف فرعٍ يضع صنف فرعٍ آخر على فاتورته ⇒ PASSED مع
 *      INVOKER، وREFUSED مع DEFINER.)
 *
 * Usage: node scripts/check-products-branch-policy.js [--require-db] [--list]
 * Env:   PRODUCTS_POLICY_DB_URL — قاعدةٌ بديلة (يستعملها الفخّ الذاتى على
 *        قاعدة الاختبار، فلا يمسّ الإنتاج).
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
const verbose = process.argv.includes("--list")

const url = process.env.PRODUCTS_POLICY_DB_URL || process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "no database URL - cannot read the live policy."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
  process.exit(0)
}

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

/**
 * السياسات المتساهلة المسموح بها بجوار `products_select` — وكلتاهما
 * مقصورةٌ على **المالك المسجَّل** فى `companies.user_id`، لا على العضوية.
 * وأى سياسةٍ أخرى تُقرأ هنا خطأً حتى تُراجَع: المتساهلة تُجمع بـ OR.
 */
const ALLOWED_BESIDE = new Set(["products_select", "products_owner_select", "products_owner_dml"])

/** العلامات الثلاث التى تجعل السياسة قاعدةَ فرعٍ لا قاعدةَ عضوية. */
const REQUIRED_MARKS = [
  { mark: /cm\.branch_id IS NULL/i,                 what: "عضو الشركة (بلا فرع) يبقى بلا قيد" },
  { mark: /cm\.branch_id = products\.branch_id/i,   what: "عضو الفرع يرى منتجات فرعه" },
  { mark: /inventory_transactions/i,                what: "وما تحرّك فى فرعه (المنقول إليه)" },
]

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let policies, fn
  try {
    ;({ rows: policies } = await client.query(
      `SELECT policyname, cmd, permissive, COALESCE(qual::text, '') AS qual
         FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'products'`
    ))
    ;({ rows: fn } = await client.query(
      `SELECT p.prosecdef
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'validate_product_branch_isolation'`
    ))
  } finally { await client.end() }

  const problems = []

  // (١) السياسة قائمةٌ وتقيس الفرع
  const sel = policies.find((p) => p.policyname === "products_select")
  if (!sel) {
    problems.push("products_select is gone from products - nothing scopes a branch user's product list")
  } else {
    for (const { mark, what } of REQUIRED_MARKS) {
      if (!mark.test(sel.qual)) {
        problems.push(`products_select no longer says: ${what} - the branch rule is not what 915 wrote`)
      }
    }
  }

  // (٢) ولا سياسةَ متساهلةٍ تبتلعها بالـ OR
  for (const p of policies) {
    if (!["SELECT", "ALL"].includes(p.cmd)) continue
    if (p.permissive !== "PERMISSIVE") continue
    if (ALLOWED_BESIDE.has(p.policyname)) continue
    problems.push(
      `a permissive ${p.cmd} policy sits beside products_select: ${p.policyname} - ` +
      `permissive policies are OR-ed, so this can hand back every product the branch rule withheld`
    )
  }

  // (٣) وحارس عزل الفروع يقرأ الحقيقة لا ما يُسمح للمستخدم برؤيته
  if (fn.length === 0) {
    problems.push("validate_product_branch_isolation is missing - branch isolation on document lines is off")
  } else if (fn[0].prosecdef !== true) {
    problems.push(
      "validate_product_branch_isolation is SECURITY INVOKER again - it reads products through the " +
      "caller's eyes, so another branch's product returns NULL and the guard PASSES what it must refuse"
    )
  }

  if (problems.length > 0) {
    console.error(`X product visibility by branch is not in force (${problems.length}):`)
    for (const p of problems) console.error(`  - ${p}`)
    console.error("  Fix with supabase/migrations/20260731000005_v3_74_915_product_visibility_by_branch.sql")
    process.exit(1)
  }

  if (verbose) {
    console.log(`  policies on products: ${policies.map((p) => `${p.policyname}(${p.cmd})`).join(", ")}`)
  }
  console.log(
    "+ products_select scopes a branch member to his branch AND what moved into it; no permissive policy " +
    "sits beside it; and the isolation trigger reads the product branch as SECURITY DEFINER."
  )
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })

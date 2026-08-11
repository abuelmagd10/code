#!/usr/bin/env node
/**
 * check-products-branch-policy.js
 * ---------------------------------------------------------------------------
 * v3.74.915 — رؤية المنتج بالفرع: هل هى قائمةٌ على القاعدة الحيّة؟
 * v3.74.916 — ومعها إنفاذُ الشراء والبيع على المنتج الذى بلا فرع.
 *
 * قرار المالك (31/7): عضو الفرع يرى منتجات **فرعه**، ولا يرى المنتج الذى لا
 * فرع له، ويرى ما **نُقل إليه** فيبيعه. والمنتج الذى بلا فرع **لا يشتريه**
 * إلا المالك والمدير العام، و**لا يُباع** من فرعٍ حتى تصله بضاعتُه.
 * وكُتب كلُّه حيث لا يُنسى: سياسةُ صفوفٍ ومحفِّزٌ على القاعدة، لا فلترةً فى
 * تسع شاشات.
 *
 * وستةُ أشياء تُبطل ذلك بلا أن يتغيّر حرفٌ فى الكود — ولذلك تُقاس هنا على
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
 *   ٤) **شرط الشراء يسقط من جسد المحفِّز** (916): سطرٌ يُحذف عند أول
 *      إعادة كتابةٍ للدالة، فيعود مسئول مشتريات الفرع يشترى منتج الشركة.
 *   ٥) **شرط البيع يسقط** (916): فيُباع منتج الشركة من فرعٍ لم تصله
 *      بضاعتُه — وهو ما اختار المالك منعَه ليبقى رصيد الفرع صادقاً.
 *   ٦) **أعمدة الحوكمة تعود تقبل الفراغ** فى مستندات الشراء: وعليها يقوم
 *      التصميم كله — «عملية الشراء مرتبطة بفرع»، وبه تدخل البضاعة مخزن
 *      ذلك الفرع فيراها أهلُه وحدهم. أمرُ شراءٍ بلا فرع يُفلت من كل ما
 *      سبق.
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
try { ({ Client } = require("./lib/live-db")) } catch {
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

/** وما يجب أن يبقى فى جسد المحفِّز نفسه (916). */
const TRIGGER_MARKS = [
  { mark: /can_purchase_branchless_product/,        what: "الشراء على منتجٍ بلا فرع للمالك/المدير العام وحدهما" },
  { mark: /BRANCHLESS_PRODUCT_NOT_IN_BRANCH/,       what: "ولا يُباع من فرعٍ حتى تصله بضاعتُه" },
  { mark: /t\.quantity_change > 0/,                 what: "والوصول يُقاس بحركةٍ موجبة مسجَّلة، لا بنيّة نقل" },
]

/** أعمدة الحوكمة التى يقوم عليها التصميم كله. */
const GOVERNANCE_COLUMNS = [
  ["purchase_orders", "branch_id"], ["purchase_orders", "cost_center_id"], ["purchase_orders", "warehouse_id"],
  ["bills", "branch_id"], ["bills", "cost_center_id"], ["bills", "warehouse_id"],
]

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let policies, fn, helper, cols
  try {
    ;({ rows: policies } = await client.query(
      `SELECT policyname, cmd, permissive, COALESCE(qual::text, '') AS qual
         FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'products'`
    ))
    ;({ rows: fn } = await client.query(
      `SELECT p.prosecdef, p.prosrc
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'validate_product_branch_isolation'`
    ))
    ;({ rows: helper } = await client.query(
      `SELECT p.prosecdef
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'can_purchase_branchless_product'`
    ))
    ;({ rows: cols } = await client.query(
      `SELECT table_name, column_name, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('purchase_orders', 'bills')
          AND column_name IN ('branch_id', 'cost_center_id', 'warehouse_id')`
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
  } else {
    if (fn[0].prosecdef !== true) {
      problems.push(
        "validate_product_branch_isolation is SECURITY INVOKER again - it reads products through the " +
        "caller's eyes, so another branch's product returns NULL and the guard PASSES what it must refuse"
      )
    }
    // (٤)(٥) وشرطا 916 باقيان فى جسدها
    for (const { mark, what } of TRIGGER_MARKS) {
      if (!mark.test(fn[0].prosrc)) {
        problems.push(`validate_product_branch_isolation no longer enforces: ${what}`)
      }
    }
  }

  if (helper.length === 0) {
    problems.push("can_purchase_branchless_product is missing - the purchase rule has nothing to ask")
  } else if (helper[0].prosecdef !== true) {
    problems.push(
      "can_purchase_branchless_product is SECURITY INVOKER - it reads companies/company_members " +
      "through the caller, so a member who cannot read his own row would be judged 'not entitled'"
    )
  }

  // (٦) وأعمدة الحوكمة لا تقبل الفراغ
  for (const [table, column] of GOVERNANCE_COLUMNS) {
    const row = cols.find((c) => c.table_name === table && c.column_name === column)
    if (!row) {
      problems.push(`${table}.${column} does not exist - the purchase document has lost its branch scope`)
    } else if (row.is_nullable !== "NO") {
      problems.push(
        `${table}.${column} accepts NULL again - a purchase with no branch escapes every rule above ` +
        `(the goods would land nowhere, and no branch member could be told they own them)`
      )
    }
  }

  if (problems.length > 0) {
    console.error(`X the branch rules for products are not in force (${problems.length}):`)
    for (const p of problems) console.error(`  - ${p}`)
    console.error("  Fix with supabase/migrations/20260731000005_v3_74_915_product_visibility_by_branch.sql")
    console.error("  and supabase/migrations/20260731000006_v3_74_916_branchless_product_purchase.sql")
    process.exit(1)
  }

  if (verbose) {
    console.log(`  policies on products: ${policies.map((p) => `${p.policyname}(${p.cmd})`).join(", ")}`)
    console.log(`  governance columns pinned NOT NULL: ${GOVERNANCE_COLUMNS.length}`)
  }
  console.log(
    "+ products_select scopes a branch member to his branch AND what moved into it; no permissive policy " +
    "sits beside it; the isolation trigger is SECURITY DEFINER and still refuses a branchless purchase " +
    "and a sale before arrival; and purchase documents cannot lose their branch."
  )
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })

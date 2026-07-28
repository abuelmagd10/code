#!/usr/bin/env node
/**
 * check-subtype-tenant-divergence.js
 * ---------------------------------------------------------------------------
 * v3.74.879 — تصنيفٌ يبحث به الكود يجب أن يكون **فى كل الشركات أو فى لا شركة**.
 *
 * **الحادثة**: حساب `1180` «سلف ومقدمات للموردين» — ونوعه `asset` فى الشركات
 * الخمس — كان يحمل تصنيفاً فرعياً اسمه `vendor_credit_liability`، **فى شركتين
 * فقط**. والكود يبحث بهذا التصنيف بعينه:
 *
 *     app/purchase-returns/new/page.tsx
 *       findAcct("vendor_credit_liability", …) || findAcct("ap_contra", …) || apAccount
 *
 * فالنتيجة تختلف باختلاف الشركة:
 *
 *     شركتان   ⇒ تجده  ⇒ يُقيَّد المرتجع على **أصل**
 *     ثلاث     ⇒ لا تجده ⇒ يُقيَّد على **حساب الموردين**
 *
 * أى أن **نفس المرتجع يُقيَّد على حسابين مختلفين حسب الشركة**. ولم يظهر لأن
 * إشعارات الدائن كانت معطَّلة أصلاً (٨٦٥ ثم ٨٧١) — صفر سطرٍ مُرحَّل على `1180`.
 *
 * ⇒ **الدرس**: البحث بالمعنى (`sub_type`) أصحّ من البحث بالرقم — وهو ما قرّره
 *   فحص ٨٤٧. لكنه يصير خطراً حين لا يكون المعنى **مضموناً فى كل مستأجر**:
 *   فالبحث الذى يجد فى شركةٍ ولا يجد فى أخرى **لا يفشل**، بل ينجح على
 *   الحساب الخطأ. **والنجاح على الخطأ لا يُبلَّغ عنه أحد.**
 *
 * وهذا الفحص يمسك ذلك: يستخرج كل تصنيفٍ يبحث به الكود، ثم يسأل الإنتاج عن
 * توزّعه. الحكم واحد: **إما فى كل شركةٍ لها دليل حسابات، وإما فى لا واحدة.**
 * والوجود الجزئى وحده هو الإنذار — لا الغياب، ولا الوفرة.
 *
 * ── حكمٌ ثانٍ صُمِّم ثم حُذف، والحذف مقصود ─────────────────────────────────
 * أضفتُ أولاً حكماً يقول: «تصنيفٌ اسمه يحوى `liability` يجب أن يجلس على
 * حسابٍ من نوع `liability`» — لأن `vendor_credit_liability` كان على `asset`.
 * ثم قِسته على الإنتاج قبل شحنه، **فأنذر ثلاثاً وكلّها صحيحة محاسبياً**:
 *
 *     prepaid_expense   على asset      ← المصروف المدفوع مقدماً **أصلٌ فعلاً**
 *     unearned_revenue  على liability  ← الإيراد المؤجَّل **التزامٌ فعلاً**
 *     sales_revenue     على income     ← المشروع يسمّى النوع `income`
 *
 * فالكلمة وحدها لا تحكم: `prepaid_` و`unearned_` تقلبان المعنى. وحارسٌ يصيح
 * كذباً ثلاث مرات من ثلاث **يُدرّب قارئه على تجاهله**، فيُسكت إنذاره الصادق
 * يوم يأتى. ⇒ **قاعدةٌ لا تنجو من القياس تُحذف، لا تُموَّه بقائمة استثناءات**
 * — فالقائمة تُخفى أن القاعدة نفسها خطأ.
 *
 * Usage: node scripts/check-subtype-tenant-divergence.js [--require-db]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const path = require("path")

const requireDb = process.argv.includes("--require-db")
const root = process.env.SUBTYPE_SCAN_ROOT
  ? path.resolve(process.env.SUBTYPE_SCAN_ROOT)
  : path.resolve(__dirname, "..")
const url = process.env.PRODUCTION_SUPABASE_DB_URL

const SCAN_DIRS = ["app", "lib", "components"]
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage"])

/**
 * الأشكال التى يُطلب بها الحساب بمعناه. كلها تنتهى إلى نصٍّ حرفىٍّ واحد،
 * فما لم يكن حرفياً لا يُقاس — والقياس على ما لا يُرى تخمين.
 */
const PATTERNS = [
  // .eq("sub_type", "x")  ·  { sub_type: "x" }  ·  sub_type: 'x'
  /sub_type["']?\s*[,:]\s*["']([a-z0-9_]+)["']/gi,
  // sub_type === "x"
  /sub_type\s*={2,3}\s*["']([a-z0-9_]+)["']/gi,
  // findAcct("x", …) — المُعِين المحلّى فى شاشات المرتجعات والفواتير
  /findAcct\(\s*["']([a-z0-9_]+)["']/g,
]

// `.in("sub_type", ["a","b"])` — تُلتقط بمفردها لأن قوسها يحمل عدة نصوص.
const IN_PATTERN = /sub_type["']\s*,\s*\[([^\]]*)\]/gi

// `.not("…sub_type", "in", "(cogs,cost_of_goods_sold)")` — الموضع الذى يلى
// اسم العمود هنا **مُعامِل** لا تصنيف. والتقاطه غير ضارّ (لا شركة تحمله فيمرّ)
// لكنه يُضخّم العدد المُعلَن، والعدد الذى يحوى وهماً لا يُوثق به.
const POSTGREST_OPERATORS = new Set([
  "in", "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "not", "cs", "cd",
])

// وقائمة القيم التى تلى المُعامِل تُلتقط بمفردها: `"(a,b)"`.
const NOT_IN_PATTERN = /sub_type["']\s*,\s*["']in["']\s*,\s*["']\(([^)]*)\)["']/gi

/**
 * تصنيفاتٌ يبحث بها الكود ويُقبل غيابها الجزئى **بسببٍ مكتوب**. تُحذف من
 * هنا بزوال سببها — فالاستثناء الباقى بعد سببه ثقبٌ دائم (درس ٨٥٧).
 */
const ALLOWED_PARTIAL = new Map([
  // (فارغة اليوم — والحفاظ عليها فارغةً هو المقصود)
])

function walk(dir, out) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      walk(path.join(dir, e.name), out)
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      out.push(path.join(dir, e.name))
    }
  }
}

/** @returns {Map<string, string[]>} التصنيف ⇒ الملفات التى تبحث به */
function collectSubTypesUsedByCode() {
  const files = []
  for (const d of SCAN_DIRS) walk(path.join(root, d), files)

  const found = new Map()
  const note = (name, rel) => {
    if (!name || POSTGREST_OPERATORS.has(name)) return
    if (!found.has(name)) found.set(name, [])
    const list = found.get(name)
    if (!list.includes(rel)) list.push(rel)
  }

  for (const file of files) {
    let src
    try { src = fs.readFileSync(file, "utf8") } catch { continue }
    if (!src.includes("sub_type") && !src.includes("findAcct")) continue
    const rel = path.relative(root, file).replace(/\\/g, "/")

    for (const re of PATTERNS) {
      re.lastIndex = 0
      for (const m of src.matchAll(re)) note(m[1], rel)
    }
    IN_PATTERN.lastIndex = 0
    for (const m of src.matchAll(IN_PATTERN)) {
      for (const lit of m[1].matchAll(/["']([a-z0-9_]+)["']/g)) note(lit[1], rel)
    }
    NOT_IN_PATTERN.lastIndex = 0
    for (const m of src.matchAll(NOT_IN_PATTERN)) {
      for (const lit of m[1].split(",")) note(lit.trim(), rel)
    }
  }
  return found
}

const SQL_SPREAD = `
  WITH co AS (SELECT DISTINCT company_id FROM public.chart_of_accounts)
  SELECT s.name AS sub_type,
         (SELECT count(*) FROM co)::int AS total,
         (SELECT count(*) FROM co c
           WHERE EXISTS (SELECT 1 FROM public.chart_of_accounts a
                          WHERE a.company_id = c.company_id AND a.sub_type = s.name))::int AS present
    FROM unnest($1::text[]) AS s(name)
`

/**
 * الحكم نفسه، معزولاً عن القاعدة كى يُختبر بلا شبكة ولا بيانات.
 * الوجود الجزئى وحده إنذار: `0` غيابٌ متساوٍ يُرى، و`total` وجودٌ متساوٍ يعمل.
 * @param {{sub_type:string, present:number, total:number}[]} spread
 * @param {Map<string,string[]>} used
 * @returns {string[]}
 */
function findDivergences(spread, used) {
  const out = []
  for (const r of spread) {
    if (r.present === 0 || r.present === r.total) continue
    if (ALLOWED_PARTIAL.has(r.sub_type)) continue
    out.push(
      `  - "${r.sub_type}" exists in ${r.present} of ${r.total} companies\n` +
      `      searched for by: ${(used.get(r.sub_type) || []).join(", ")}\n` +
      `      => the same document posts to a DIFFERENT account depending on the company.`
    )
  }
  return out
}

module.exports = { collectSubTypesUsedByCode, findDivergences }

if (require.main !== module) return

;(async () => {
  const used = collectSubTypesUsedByCode()
  const names = [...used.keys()].sort()

  if (names.length === 0) {
    console.error("X no sub_type lookups found in the source - the scanner is broken, not the code")
    process.exit(1)
  }

  if (!url) {
    const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot compare sub_types across companies."
    if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
    console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
    process.exit(0)
  }

  let Client
  try { ({ Client } = require("pg")) } catch {
    console.error("X npm install pg --save-dev"); process.exit(1)
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let spread = []
  try {
    ;({ rows: spread } = await client.query(SQL_SPREAD, [names]))
  } finally { await client.end() }

  // الوجود الجزئى: يجد فى شركةٍ ولا يجد فى أخرى
  const failures = findDivergences(spread, used)

  if (failures.length > 0) {
    console.error(`X ${failures.length} sub_type problem(s):\n`)
    for (const f of failures) console.error(f)
    console.error(
      "\n  Asking for an account by its MEANING is right (v3.74.847). It becomes a\n" +
      "  trap the moment the meaning is not guaranteed in every tenant: a lookup\n" +
      "  that finds in one company and misses in another does NOT fail - it\n" +
      "  succeeds on the wrong account, and nobody is told.\n\n" +
      "  Fix by backfilling the sub_type everywhere it belongs (a migration that\n" +
      "  verifies itself), NOT by adding an exception here."
    )
    process.exit(1)
  }

  const total = spread[0] ? spread[0].total : 0
  console.log(
    `+ all ${names.length} sub_type(s) searched for by the code are present in ` +
    `every company or in none (${total} companies).`
  )
})().catch((err) => {
  console.error(
    "X failed:",
    String(err.message || err).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://<redacted>")
  )
  process.exit(1)
})

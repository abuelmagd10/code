#!/usr/bin/env node
/**
 * check-products-select-star.js
 * ---------------------------------------------------------------------------
 * v3.74.908 — لا نجمة على `products`، والقائمة المسمّاة لا تكذب على الشاشات.
 *
 * **لماذا**: قرار 906 هو حجب تكلفة الشراء. والحجب الحقيقى هو سحب `SELECT`
 * على أعمدة التكلفة من `authenticated`. وعندها **كل** `select("*")` على
 * `products` يسقط بخطأ صلاحية — لأن النجمة تطلب العمود المسحوب أيضاً.
 * وقياساً وقتها: ١٢ موضعاً، منها خمسة مسارات تصنيع تعمل بجلسة المستخدم لا
 * بمفتاح الخدمة. ⇒ الحجب بلا هذه التصفية يعنى شاشاتٍ تنكسر لا تكلفةً تُحجب.
 *
 * ويفحص الحارس أمرين، لأن أحدهما بلا الآخر يُطمئن كذباً:
 *
 *   (١) **لا نجمة**: لا `select("*")` ولا `select("*, join(...)")` على
 *       `products` فى `app/` و`lib/` و`components/` و`hooks/`. والشكل الثانى
 *       هو ما كان فى `app/api/products-list/route.ts` حرفياً، ولولا فحصه
 *       لمرّت النجمة متخفّيةً خلف ربطٍ بريء.
 *
 *   (٢) **القائمة تطابق الجدول**: `PRODUCT_COLUMNS_NO_COST` = أعمدة الجدول
 *       الحىّ ناقص أعمدة التكلفة، و`PRODUCT_COLUMNS_WITH_COST` = الجدول
 *       كاملاً. فعمودٌ يُضاف إلى `products` غداً ولا يُضاف إلى القائمة يجعل
 *       الشاشات تفقده صامتةً — وهو بالضبط العطب الذى تحرسه النجمةُ اليوم
 *       بلا قصد. الحارس يرث تلك الحماية بدل أن يُلغيها.
 *
 * خط الأساس صفر، ولا يُرخى.
 *
 * Usage: node scripts/check-products-select-star.js [--require-db] [--list]
 * Env:   PRODUCTS_COLUMNS_PATH — لتوجيهه إلى نسخةٍ مؤقتة (يستعمله الفخّ الذاتى).
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const path = require("path")

const requireDb = process.argv.includes("--require-db")
const verbose = process.argv.includes("--list")
const ROOT = process.cwd()
const ROOTS = ["app", "lib", "components", "hooks"]
const COLUMNS_FILE =
  process.env.PRODUCTS_COLUMNS_PATH || path.join(ROOT, "lib", "products-columns.ts")

/** يُزيل التعليقات كى لا يُحاكَم ملفٌ على شرحٍ يصف السلوك القديم. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n")
}

/**
 * المشى بـ`statSync` لا بنوع `dirent`.
 *
 * وهذا ليس تفضيلاً: `withFileTypes` يعتمد على `d_type` الذى تتركه بعض
 * أنظمة الملفات (وكل وصلات FUSE تقريباً) بقيمة UNKNOWN — فتصير كل مجلدة
 * «ليست مجلدة»، فلا يُنزل الحارس فى الشجرة، **ويطبع «صفر» وهو لم يفحص شيئاً**.
 * اصطدتُ هذا فى الفخّ الذاتى قبل الدفع: الحارس أعلن نظافةً بينما النجمة
 * المزروعة تحت عينه. وصفرٌ من حارسٍ أعمى أخطر من لا حارس.
 */
function walk(dir, out = []) {
  let names
  try { names = fs.readdirSync(dir) } catch { return out }
  for (const name of names) {
    if (name === "node_modules" || name === ".next") continue
    const p = path.join(dir, name)
    let st
    try { st = fs.statSync(p) } catch { continue }
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

// ── (١) النجمة ───────────────────────────────────────────────────────────
const FROM_PRODUCTS = /from\(\s*['"]products['"]\s*\)/g
const offenders = []

for (const root of ROOTS) {
  for (const file of walk(path.join(ROOT, root))) {
    const raw = fs.readFileSync(file, "utf8")
    if (!raw.includes("products")) continue
    const code = stripComments(raw)
    for (const m of code.matchAll(FROM_PRODUCTS)) {
      // السلسلة قد تُكتب على أسطر، فيُقرأ ما بعدها لا السطر وحده.
      const seg = code.slice(m.index + m[0].length, m.index + m[0].length + 260)
      // **أول** `.select(` بعد `from("products")` وحده هو المقصود. البحث عن
      // أول `select` بين علامتى اقتباس كان يقفز فوق قائمةٍ مسمّاة (ثابت بلا
      // اقتباس) ليقع على نجمة جدولٍ آخر فى نفس `Promise.all` — فيتّهم بريئاً.
      const sel = seg.match(/\.select\(\s*([\s\S]{0,80}?)[),]/)
      if (!sel) continue
      const arg = sel[1].trim()
      if (!/^['"`]/.test(arg)) continue   // ثابتٌ مسمّى أو قالبٌ نصّى — ليس نجمة
      // تُنزع علامة الفتح **وعلامة الإغلاق**. نسيانُ الإغلاق يجعل القيمة
      // `*"` فلا تساوى `*` — فيمرّ العطب من حارسٍ يظنّ نفسه ممسكاً به.
      const cols = arg.slice(1).replace(/['"`]\s*$/, "").trim()
      if (cols === "*" || /^\*\s*(,|$)/.test(cols)) {
        offenders.push({
          file: path.relative(ROOT, file),
          line: code.slice(0, m.index).split("\n").length,
          cols: cols.length > 46 ? `${cols.slice(0, 46)}…` : cols,
        })
      }
    }
  }
}

if (offenders.length > 0) {
  console.error(`X ${offenders.length} select(*) on products - the cost hide would break each one:`)
  for (const o of offenders) console.error(`  - ${o.file}:${o.line}  select("${o.cols}")`)
  console.error("  Use PRODUCT_COLUMNS_NO_COST (or PRODUCT_COLUMNS_WITH_COST where the")
  console.error("  screen genuinely shows cost today) from lib/products-columns.ts.")
  process.exit(1)
}
console.log(`+ no select(*) on products (${ROOTS.join(", ")} scanned).`)

// ── (٢) القائمة مقابل الجدول الحىّ ───────────────────────────────────────
const url = process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot compare the named list with the live table."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
  process.exit(0)
}

let Client
try { ({ Client } = require("./lib/live-db")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

if (!fs.existsSync(COLUMNS_FILE)) {
  console.error(`X the named-column list is missing: ${path.relative(ROOT, COLUMNS_FILE)}`)
  process.exit(1)
}

/** يقرأ القوائم من الملف نصّاً — لا استيراد، فالملف TypeScript. */
function parseColumnLists(src) {
  const cost = []
  const costBlock = src.match(/PRODUCT_COST_COLUMNS\s*=\s*\[([\s\S]*?)\]/)
  if (costBlock) for (const m of costBlock[1].matchAll(/['"]([a-z0-9_]+)['"]/g)) cost.push(m[1])

  // الشكلان مقبولان: مصفوفةٌ تُوصَل، أو **نصٌّ حرفىٌّ واحد** — وهو الشكل
  // الذى فرضه `supabase-js` (نوع الصف يُستنتج من نص select وقت الترجمة).
  const noCost = []
  const arrayBlock = src.match(/PRODUCT_COLUMNS_NO_COST\s*=\s*\[([\s\S]*?)\]\s*\.join/)
  if (arrayBlock) {
    for (const m of arrayBlock[1].matchAll(/['"]([a-z0-9_]+)['"]/g)) noCost.push(m[1])
  } else {
    const literal = src.match(/PRODUCT_COLUMNS_NO_COST\s*=\s*['"]([^'"]+)['"]/)
    if (literal) for (const c of literal[1].split(",")) { const t = c.trim(); if (t) noCost.push(t) }
  }

  return { cost, noCost }
}

;(async () => {
  const { cost, noCost } = parseColumnLists(fs.readFileSync(COLUMNS_FILE, "utf8"))
  if (cost.length === 0 || noCost.length === 0) {
    console.error("X could not read PRODUCT_COST_COLUMNS / PRODUCT_COLUMNS_NO_COST from the file.")
    process.exit(1)
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let live = []
  try {
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products'
        ORDER BY ordinal_position`
    )
    live = rows.map((r) => r.column_name)
  } finally { await client.end() }

  const liveSet = new Set(live)
  const costSet = new Set(cost)
  const expected = live.filter((c) => !costSet.has(c))

  const missing = expected.filter((c) => !noCost.includes(c))   // فى الجدول وغائبٌ عن القائمة
  const phantom = noCost.filter((c) => !liveSet.has(c))          // فى القائمة ولا وجود له
  const costNotLive = cost.filter((c) => !liveSet.has(c))

  if (missing.length || phantom.length || costNotLive.length) {
    if (missing.length) {
      console.error(`X ${missing.length} product column(s) live but missing from the named list:`)
      for (const c of missing) console.error(`  - ${c}   (every screen would silently lose it)`)
    }
    if (phantom.length) {
      console.error(`X ${phantom.length} column(s) named but not in the table:`)
      for (const c of phantom) console.error(`  - ${c}   (the query would fail outright)`)
    }
    if (costNotLive.length) {
      console.error(`X ${costNotLive.length} cost column(s) named but not in the table:`)
      for (const c of costNotLive) console.error(`  - ${c}`)
    }
    console.error("  Fix lib/products-columns.ts, then re-run.")
    process.exit(1)
  }

  if (verbose) console.log(`  live=${live.length} named=${noCost.length} cost=${cost.length}`)
  console.log(
    `+ the named list matches the live table (${live.length} columns: ${noCost.length} named + ${cost.length} cost).`
  )
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })

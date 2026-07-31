#!/usr/bin/env node
/**
 * check-product-cost-direct-read.js
 * ---------------------------------------------------------------------------
 * v3.74.909 — تكلفة المنتج تُقرأ من المسار المخوَّل، لا من الجدول.
 *
 * القاعدة فى `can_view_purchase_cost` (906)، والمسار المخوَّل
 * `product_costs(ids)` (909)، ووجهه فى الكود `lib/product-costs.ts`.
 * وهذا الحارس يمنع عودة القراءة المباشرة — سواء طلبت العمود من `products`
 * أو من داخل ربطٍ متداخل (`products(name, cost_price)`)، وهو الشكل الذى
 * كان يُفلت من كل فحصٍ سطحى.
 *
 * **ولماذا يهمّ الآن وقبل السحب؟** لأن الإصدار التالى يسحب `SELECT` على
 * الأعمدة الثلاثة من `authenticated`، فيصير كل قارئٍ مباشرٍ خطأ صلاحية فى
 * وجه مستخدمٍ حقيقى. من يُضاف اليوم يُكتشف بعد الدفع.
 *
 * ═══ الدَّين الذى كان، وقد فُرِّغ ═══
 *
 * كان أربعة مواضع تقرأ التكلفة **لا لتعرضها بل لتحسب بها**، كلها بجلسة
 * المستخدم — فتحويلها إلى المسار المخوَّل كان يعنى ترحيل قيدٍ بتكلفة صفر
 * لمن لا يرى التكلفة: إفسادُ دفترٍ باسم الحجب. وقد أُفرغت كلها فى 910:
 *
 *   accounting-transaction-service — أُلغيت التكلفة الاحتياطية أصلاً: ما
 *       عجز FIFO عن تكلفته يُرفض بصوتٍ عالٍ (وقياس الإنتاج: ذلك المسار
 *       لم يُستعمل قطّ، ولا منتجَ له رصيدٌ بلا طبقات).
 *   third-party-inventory — التكلفة صارت من `invoice_posted_unit_costs`،
 *       أى مما رُحّل فعلاً؛ وسقط معها اختراع «٧٠٪ من سعر البيع».
 *   currency-conversion-system — الضربُ صار داخل القاعدة
 *       (`convert_product_display_prices` / `snapshot_product_original_prices`)،
 *       فلا تخرج التكلفة إلى المتصفح لأجل تغيير عملة العرض.
 *
 * ⇒ القائمة أدناه **فارغة، وتبقى فارغة**. إضافةُ اسمٍ إليها قرارُ مالكٍ
 *   لا اختصارُ مبرمج: معناها أن دفتراً سيُرحَّل بتكلفةٍ قد تكون صفراً.
 *
 * Usage: node scripts/check-product-cost-direct-read.js [--list]
 * ---------------------------------------------------------------------------
 */
const fs = require("fs")
const path = require("path")

const verbose = process.argv.includes("--list")
const ROOT = process.cwd()
const ROOTS = ["app", "lib", "components", "hooks"]
const COST = ["cost_price", "display_cost_price", "original_cost_price"]

/**
 * فارغةٌ منذ 910 — ولا تُملأ. كل موضعٍ يقرأ التكلفة مباشرةً يُرفض الآن،
 * بلا استثناء، لأن الإصدار التالى يسحب الصلاحية فيصير الرفض من القاعدة
 * نفسها بدل الحارس.
 */
const KNOWN_DEBT = new Set([])

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n")
}

// المشى بـ`statSync` لا بنوع `dirent` (درس 908: مجلدٌ بلا `d_type` يجعل
// الحارس يطبع «صفر» وهو لم ينزل فى الشجرة أصلاً).
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

const SELECT = /\.select\(\s*(['"`])([\s\S]{0,600}?)\1/g

/**
 * v3.74.912 — وقائمةُ أعمدةٍ تحمل التكلفة ممنوعةٌ هى الأخرى.
 *
 * الثغرة التى كلّفتنا شاشةً فارغة: كان الحجب يُقاس على **نصّ** `select`،
 * وموضعان يمرّران **ثابتاً** اسمه `PRODUCT_COLUMNS_WITH_COST` — فلم يرَ
 * الحارس فيه اسم عمودٍ فمرّ. ولمّا سُحبت الصلاحية سقط الاستعلام كله عند
 * كل مستخدم.
 *
 * ⇒ لا يكفى منعُ ذكر العمود فى النصّ: يُمنع أن **يحمل أى ثابتٍ مُصدَّر**
 *   اسم عمود تكلفة، فلا يوجد شىءٌ يُمرَّر ويُخفى ما فيه.
 */
{
  const columnsFile = path.join(ROOT, "lib", "products-columns.ts")
  if (fs.existsSync(columnsFile)) {
    const src = stripComments(fs.readFileSync(columnsFile, "utf8"))
    for (const m of src.matchAll(/export const (\w+)\s*=\s*([\s\S]{0,2000}?)(?:\n\n|$)/g)) {
      const [, name, value] = m
      if (name === "PRODUCT_COST_COLUMNS") continue   // تعريفُ الأعمدة المحجوبة نفسها
      const named = COST.filter((c) => value.includes(c))
      if (named.length > 0) {
        console.error(
          `X lib/products-columns.ts exports ${name} carrying ${named.join(", ")} - ` +
          "any select given that constant asks for a revoked column, and the WHOLE query fails."
        )
        console.error("  A hidden column does not blank a field; it drops the entire row.")
        process.exit(1)
      }
    }
  }
}

const offenders = []
const debts = []

for (const root of ROOTS) {
  for (const file of walk(path.join(ROOT, root))) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/")
    // ملف القوائم المسمّاة يذكر الأعمدة تعريفاً لا قراءةً.
    if (rel === "lib/products-columns.ts" || rel === "lib/product-costs.ts") continue
    const raw = fs.readFileSync(file, "utf8")
    if (!COST.some((c) => raw.includes(c))) continue
    const code = stripComments(raw)
    for (const m of code.matchAll(SELECT)) {
      const cols = m[2]
      if (!COST.some((c) => cols.includes(c))) continue
      const entry = { file: rel, line: code.slice(0, m.index).split("\n").length }
      if (KNOWN_DEBT.has(rel)) debts.push(entry)
      else offenders.push(entry)
    }
  }
}

if (offenders.length > 0) {
  console.error(`X ${offenders.length} direct read(s) of product cost - each one breaks when the hide lands:`)
  for (const o of offenders) console.error(`  - ${o.file}:${o.line}`)
  console.error("  Read it through attachProductCosts()/fetchProductCostMap() in lib/product-costs.ts,")
  console.error("  which calls product_costs(ids) and applies the owner's rule from 906.")
  process.exit(1)
}

console.log(`+ no new direct product-cost reads (${ROOTS.join(", ")} scanned).`)
if (debts.length > 0) {
  console.log(`! ${debts.length} measured posting-path read(s) remain - documented debt, not approved:`)
  const seen = new Set()
  for (const d of debts) {
    if (!verbose && seen.has(d.file)) continue
    seen.add(d.file)
    console.log(`    ${d.file}${verbose ? `:${d.line}` : ""}`)
  }
  console.log("    The ledger must take its cost from FIFO layers in the database (owner's decision)")
  console.log("    BEFORE the SELECT grant is revoked - otherwise a hidden cost posts as zero.")
}

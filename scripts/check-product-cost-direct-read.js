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
 * ═══ الدَّين المعلوم، بأسمائه ═══
 *
 * أربعة مواضع تقرأ التكلفة **لا لتعرضها بل لتحسب بها**، وكلها تعمل بجلسة
 * المستخدم. وتحويلها إلى المسار المخوَّل يعنى أن من لا يرى التكلفة يُرحّل
 * قيداً بتكلفةٍ **صفر** — أى إفسادُ دفترٍ باسم الحجب:
 *
 *   lib/accounting-transaction-service.ts — تكلفة مبيعاتٍ احتياطية حين لا
 *       تكفى طبقات FIFO (السطر ٦٣٥: `fallbackUnitCost`).
 *   lib/third-party-inventory.ts — تكلفة حركة بضاعة الغير، وبديلها اليوم
 *       **مُختلَق**: `unit_price * 0.7` (السطر ١٤٠).
 *   lib/currency-conversion-system.ts (موضعان) — يُعيد حساب أسعار العرض
 *       من التكلفة عند تغيير عملة الشركة؛ فاعلٌ لا يرى التكلفة يكتب صفراً
 *       فوق البيانات.
 *
 * القرار (بنص المالك): **تُحسب التكلفة فى القاعدة من طبقات FIFO** فيستغنى
 * الترحيل عن عمود العرض نهائياً — إصدارٌ قائمٌ بذاته قبل السحب. وحتى ذلك
 * الحين تُسمَّى هنا ديناً موثَّقاً لا استثناءً صامتاً، والعدد **لا يزيد**.
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
 * الدَّين المُقاس — يُسمَّى بالملف لا بالعدد، كى لا يتسلّل موضعٌ جديد تحت
 * رقمٍ قديم. ولا يُضاف إلى هذه القائمة شىء: تُفرَّغ ولا تُملأ.
 */
const KNOWN_DEBT = new Set([
  "lib/accounting-transaction-service.ts",
  "lib/third-party-inventory.ts",
  "lib/currency-conversion-system.ts",
])

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

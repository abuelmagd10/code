#!/usr/bin/env node
/**
 * check-purchase-money-direct-read.js
 * ---------------------------------------------------------------------------
 * v3.74.936 — الشاشةُ المحوَّلة لا تعود تسأل الجدولَ عن مبلغ شراء.
 *
 * المرحلةُ الثانية من حجب أسعار الشراء تُحوَّل **دفعةً دفعة**: كلُّ إصدارٍ
 * ينقل شاشاتٍ إلى المنافذ المقنَّعة (`..._masked`)، والباقى يقرأ الجداولَ
 * كما كان. فحارسٌ يقول «لا قراءةَ مباشرةً فى المشروع كله» سيكون كاذباً
 * اليوم وصحيحاً بعد شهر — ولا ينفع فى الطريق.
 *
 * فهذا حارسُ **سقّاطة**: قائمةٌ من الملفات المحوَّلة تُذكر بالاسم، ويُشترط
 * فيها **صفرُ قراءةٍ مباشرة**. وتطول القائمةُ بكل دفعة، ولا تقصر أبداً.
 * فالمحوَّلُ لا يرتدّ، والمتبقّى مذكورٌ بعدده لا مسكوتٌ عنه.
 *
 * ═══ وما الذى يُعدّ «قراءةً مباشرة»؟ ═══
 *
 * `.from("bills").select(...)` وأخواتُها على الجداول الستة. أما الكتابةُ
 * (`insert` · `update` · `delete`) فتبقى على الجدول نفسه — **النافذةُ
 * للقراءة وحدها**، ولا يُكتب فى نافذة.
 *
 * ⚠️ **والتضمينُ المتداخل يُعدّ قراءةً أيضاً**: `bill_items(...)` داخل
 * `select` تقرأ الجدولَ لا النافذة. ولو حُوِّل الرأسُ وتُرك البندُ
 * لصار الحجبُ نصفَه مفتوح — الرأسُ محجوبٌ والسعرُ ظاهر. ولذلك يُشترط أن
 * يُكتب التضمينُ باسمٍ مستعار: `bill_items:bill_items_masked(...)` —
 * فيبقى مفتاحُ الاستجابة كما هو ولا ينكسر القارئ.
 *
 * Usage: node scripts/check-purchase-money-direct-read.js [--list]
 * Env:   PURCHASE_MONEY_SCAN_ROOT — جذرٌ بديل (يستعمله الفخّ الذاتى).
 * ---------------------------------------------------------------------------
 */

const fs = require("fs")
const path = require("path")

const verbose = process.argv.includes("--list")
const ROOT = process.env.PURCHASE_MONEY_SCAN_ROOT || process.cwd()

/** الجداولُ الستة التى صارت لها منافذُ مقنَّعة فى 933. */
const TABLES = [
  "bills", "bill_items",
  "purchase_orders", "purchase_order_items",
  "purchase_returns", "purchase_return_items",
]

/**
 * الملفاتُ المحوَّلة. **تطول ولا تقصر.**
 * v3.74.936 — الدفعة الأولى: قائمةُ فواتير الشراء وشاشةُ تحريرها.
 */
const CONVERTED = [
  "app/bills/page.tsx",
  "app/bills/[id]/edit/page.tsx",
  // v3.74.937 — الدفعة الثانية: شاشةُ الفاتورة نفسها.
  "app/bills/[id]/page.tsx",
]

const problems = []
const notes = []

const readsOf = (src) => {
  const found = []
  // (١) .from("t").select(
  const fromRe = /\.from\(\s*(['"`])([a-z_]+)\1\s*\)/g
  let m
  while ((m = fromRe.exec(src))) {
    if (!TABLES.includes(m[2])) continue
    const tail = src.slice(m.index + m[0].length, m.index + m[0].length + 60)
    if (/^\s*\.select\(/.test(tail)) found.push({ kind: "from", table: m[2], at: m.index })
  }
  // (٢) تضمينٌ متداخل — **ويُفتَّش داخل نصِّ `select` وحده، لا فى الملف كله**.
  //
  // ⚠️ أولُ كتابةٍ لهذا الحارس فتّشت الملفَ كلَّه، فاصطادت جملةً فى تعليق:
  // «(bills list, supplier ledger…)» وقالت إنها تضمين. وهذه رابعُ مرةٍ يقع
  // فيها هذا الشكلُ بعينه (930 · 932 · 934): **التعليقُ ليس تعليمة**.
  // والعلاجُ الجذرىُّ ليس استثناءَ التعليقات، بل **ألا يُفتَّش إلا حيث
  // يمكن أن يوجد التضمينُ أصلاً**: داخل النصّ الممرَّر إلى `select`.
  const selectRe = /\.select\(\s*(['"`])([\s\S]*?)\1/g
  let sm
  while ((sm = selectRe.exec(src))) {
    const literal = sm[2]
    const base = sm.index + sm[0].indexOf(literal)
    for (const t of TABLES) {
      const embedRe = new RegExp(`(^|[^\\w:])(${t})\\s*(!inner|!left)?\\s*\\(`, "g")
      let e
      while ((e = embedRe.exec(literal))) {
        found.push({ kind: "embed", table: t, at: base + e.index })
      }
    }
  }
  return found
}

for (const rel of CONVERTED) {
  const file = path.join(ROOT, rel)
  if (!fs.existsSync(file)) {
    problems.push(`${rel} is listed as converted but does not exist`)
    continue
  }
  const src = fs.readFileSync(file, "utf8")
  const hits = readsOf(src)
  for (const h of hits) {
    const line = src.slice(0, h.at).split("\n").length
    problems.push(
      h.kind === "from"
        ? `${rel}:${line} reads ${h.table} directly - it was converted to ${h.table}_masked`
        : `${rel}:${line} embeds ${h.table} without an alias to ${h.table}_masked - ` +
          `the head would be masked while the line price stays visible`)
  }
  if (verbose) notes.push(`  ${rel}: ${hits.length} direct read(s)`)
}

// وما لم يُحوَّل بعد: يُعدّ ويُقال، ولا يُسكت عنه.
let remaining = 0
const walk = (dir) => {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue
      walk(p)
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      const rel = path.relative(ROOT, p).replace(/\\/g, "/")
      if (CONVERTED.includes(rel)) continue
      const src = fs.readFileSync(p, "utf8")
      remaining += readsOf(src).filter((h) => h.kind === "from").length
    }
  }
}
for (const d of ["app", "lib", "components", "hooks"]) walk(path.join(ROOT, d))

if (problems.length > 0) {
  console.error(`X a converted screen went back to reading a table directly (${problems.length}):`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error("  Read through the masked view; write to the table. Nested embeds need an alias.")
  process.exit(1)
}

if (verbose) for (const n of notes) console.log(n)
console.log(
  `+ all ${CONVERTED.length} converted screen(s) read purchase money through the masked path only. ` +
  `${remaining} direct read(s) remain in screens not yet converted - counted, not hidden.`)

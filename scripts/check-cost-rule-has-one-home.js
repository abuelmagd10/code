#!/usr/bin/env node
/**
 * check-cost-rule-has-one-home.js
 * ---------------------------------------------------------------------------
 * v3.74.934 — لقاعدة رؤية التكلفة بيتٌ واحد: `can_view_purchase_cost`.
 *
 * الحادثة التى وُلد منها هذا الحارس: صفحةُ المنتجات كانت تقرّر إظهارَ حقل
 * **سعر التكلفة** بسطرٍ واحد: `setCanViewCOGS(isUpperRole)`. و
 * `UPPER_ROLES` ثلاثةٌ فقط — المالك والمدير العام والمشرف. فكانت الشاشةُ
 * **نسخةً ثانيةً من الحكم** تخالف الأصلَ المكتوب فى القاعدة منذ 906:
 * الوضعُ المقيَّد يُدخل المحاسبَ ومديرَ الفرع ومسئولَ المشتريات، كلاًّ فى
 * حدود فرعه.
 *
 * والأثر: **مسئولُ المشتريات يُنشئ أمرَ الشراء لفرعه ولا يجد حقلَ سعر
 * الشراء أصلاً** حين يسجّل الصنف. لا خطأ يظهر، ولا رسالة تُقال — حقلٌ
 * غائبٌ فحسب. ولا يكشف هذا اختبارٌ ولا مراجعةُ فرق: كِلا السطرين يبدو
 * سليماً على حدة.
 *
 * ═══ والقاعدة العامة التى يحرسها ═══
 *
 * **حكمُ الأمن يُنادى، ولا يُعاد كتابته.** وهو نفسُ درس الأبواب المتساهلة
 * المتجاورة (921 · 928 · 929 · 930 · 931) فى ثوبٍ آخر: هناك سياستان
 * تقولان الشىءَ نفسه فتُعدَّل إحداهما وتبقى الأخرى؛ وهنا حكمٌ فى القاعدة
 * وصداه فى المتصفح، فيُصحَّح الأصلُ ويبقى الصدى كاذباً.
 *
 * فيمنع هذا الحارس شكلين:
 *   ١) **قرارُ تكلفةٍ يُؤخذ من قائمة أدوار** فى الواجهة (`isUpperRole` أو
 *      `UPPER_ROLES` تُسند إلى راية تكلفة).
 *   ٢) **الشاشةُ التى تُدخل التكلفة لا تسأل القاعدة** — أى لا تُنادى
 *      `can_view_purchase_cost`.
 *
 * ولا يقيس هذا الحارس القاعدةَ نفسَها: صوابُها محروسٌ بـ
 * `check-purchase-cost-masked-path.js` و`check-product-cost-grant.js`
 * بالانتحال على القاعدة الحيّة. هذا يحرس **وحدانيتَها**.
 *
 * Usage: node scripts/check-cost-rule-has-one-home.js [--list]
 * Env:   COST_RULE_SCAN_ROOT — جذرٌ بديل (يستعمله الفخّ الذاتى).
 * ---------------------------------------------------------------------------
 */

const fs = require("fs")
const path = require("path")

const verbose = process.argv.includes("--list")
const ROOT = process.env.COST_RULE_SCAN_ROOT || process.cwd()
const DIRS = ["app", "lib", "components", "hooks"]

/** الرايةُ التى تحكم ظهورَ التكلفة فى الواجهة، بأى تسميةٍ شائعة. */
const COST_FLAG = /(canViewCOGS|canViewCost|canSeeCost|showCostPrice|mayViewCost|maySeeCost)/i
/** ومصدرُ القرار الممنوع: قائمةُ أدوارٍ مكتوبةٌ فى الواجهة. */
const ROLE_LIST = /(isUpperRole|UPPER_ROLES)/

/** الشاشةُ التى تُدخل سعرَ التكلفة يجب أن تسأل القاعدة. */
const MUST_ASK = ["app/products/page.tsx"]

function walk(dir, out = []) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue
      walk(p, out)
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      out.push(p)
    }
  }
  return out
}

const problems = []
const homes = []

for (const d of DIRS) {
  for (const file of walk(path.join(ROOT, d))) {
    let src
    try { src = fs.readFileSync(file, "utf8") } catch { continue }
    const rel = path.relative(ROOT, file).replace(/\\/g, "/")

    src.split("\n").forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "")
      if (!COST_FLAG.test(code)) return

      // شكل (١): رايةُ تكلفةٍ تُسند من قائمة أدوار.
      const isAssignment = /(set[A-Z]\w*\s*\(|=\s*)/.test(code)
      if (isAssignment && ROLE_LIST.test(code)) {
        problems.push(
          `${rel}:${i + 1} decides cost visibility from a role list, not from the rule\n` +
          `      ${code.trim().slice(0, 120)}\n` +
          `      The database rule (can_view_purchase_cost) also admits the accountant, the branch\n` +
          `      manager and the purchasing officer - each within his own branch. A role list here\n` +
          `      is a second copy of the rule, and it will drift.`)
      }
    })

    if (/rpc\(\s*["'`]can_view_purchase_cost["'`]/.test(src)) homes.push(rel)
  }
}

// شكل (٢): الشاشةُ التى تُدخل التكلفة لا تسأل القاعدة.
for (const rel of MUST_ASK) {
  const file = path.join(ROOT, rel)
  if (!fs.existsSync(file)) continue
  const src = fs.readFileSync(file, "utf8")
  if (!/rpc\(\s*["'`]can_view_purchase_cost["'`]/.test(src)) {
    problems.push(
      `${rel} never calls can_view_purchase_cost - it is deciding who may enter a purchase\n` +
      `      price by some other means, and that means is a second copy of the rule.`)
  }
}

if (problems.length > 0) {
  console.error(`X the cost-visibility rule has more than one home (${problems.length}):`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error("  The rule lives in can_view_purchase_cost. Screens ASK it; they do not restate it.")
  process.exit(1)
}

if (verbose) for (const h of homes) console.log(`  asks the rule: ${h}`)
console.log(
  `+ the cost-visibility rule has one home: no screen decides it from a role list, ` +
  `and ${homes.length} caller(s) ask can_view_purchase_cost directly.`)

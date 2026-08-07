#!/usr/bin/env node
/**
 * check-masked-money-is-not-formatted-raw.js
 * ---------------------------------------------------------------------------
 * v3.74.974 — الرقمُ المحجوبُ لا يُنسَّق خاماً، ولا يُقلَب صفراً.
 *
 * ═══ المرضُ الذى وُلد منه ═══
 *
 * المصادرُ المقنَّعة (bills_masked · bill_items_masked · purchase_orders_masked)
 * تُعيد **فارغاً** لمن لا يحقُّ له رؤيةُ سعر الشراء. وللفارغ مصيران، وكلاهما
 * خطأ:
 *
 *   ‏(١) **الانهيار**: `it.unit_price.toFixed(2)` على فارغٍ يُسقط الصفحةَ
 *       كلَّها. وقع ذلك فعلاً على مسؤول المخزن، وأثبته سجلُّ المتصفّح.
 *
 *   ‏(٢) **الصفرُ الكاذب**: `Number(x.total_amount).toFixed(2)` لا ينهار —
 *       بل يكتب «0.00» مكان مبلغٍ موجود. وهذا **أخطر**، لأنّ الانهيار يُرى
 *       ويُبلَّغ عنه، والصفرَ الكاذبَ يُصدَّق ويُبنى عليه.
 *
 * ═══ تصحيحُ قياسٍ سابق، ويُذكر لأنّه يخصّ صدقَ الأرقام ═══
 *
 * قِيس فى ٩٧١ أنّ فى المشروع «١٦٣ موضعاً بلا حماية». وكان الماسحُ يومَها
 * فظّاً: يعدّ كلَّ `.toFixed(` فى أىِّ ملفٍّ يذكر مصدراً مقنَّعاً. وأُعيد
 * القياسُ بدقّة فكان العددُ **٢٧**، ثمّ فُحص كلُّ واحدٍ منها بيده:
 *
 *   • خمسةَ عشرَ منها **خلف بوّابةِ إذن**: شاشاتُ التحرير والإنشاء ونافذةُ
 *     المرتجع تسأل can_view_purchase_cost أوّلاً وتردّ المحجوبَ برسالةٍ
 *     صريحة، فلا يبلغها أصلاً.
 *   • وثلاثةٌ **خلف شرطٍ ثلاثىٍّ يعرض «—»** فى سطرٍ مجاور.
 *   • وأربعةٌ على **متغيّراتٍ محلّيّة** لا حقولِ صفوف.
 *   • وثلاثةٌ على حقولِ **مبيعاتٍ لا تُحجب أصلاً**.
 *   • وبقى **اثنان** حقيقيّان — صفران كاذبان فى صفحة الفاتورة، وهما ما
 *     تُصلحه هذه الدفعة.
 *
 * فالرقمُ الكبيرُ لم يكن كذباً، لكنّه كان **قياساً بأداةٍ فظّة**. والعددُ
 * الذى لا يُفحص واحداً واحداً ليس قياساً بل انطباع.
 *
 * ═══ وهذا حارسُ سقّاطة ═══
 *
 * يُحاسب الملفاتِ المذكورةَ بالاسم فقط، وتطول القائمةُ ولا تقصر.
 *
 * Usage: node scripts/check-masked-money-is-not-formatted-raw.js [--list] [--selftest]
 * Env:   MASKED_MONEY_SCAN_ROOT
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const path = require("path")
const os = require("os")

const ROOT = process.env.MASKED_MONEY_SCAN_ROOT || process.cwd()
const VERBOSE = process.argv.includes("--list")
const SELFTEST = process.argv.includes("--selftest")

/** الحقولُ التى تُفرَّغ فى المصادر المقنَّعة — مقروءةٌ من تعريفها لا مخمَّنة. */
const MASKABLE = ["unit_price", "line_total", "subtotal", "tax_amount", "total_amount",
  "discount_value", "shipping", "adjustment", "paid_amount", "returned_amount",
  "base_currency_total", "original_total", "display_total", "display_subtotal",
  "original_subtotal", "original_tax_amount", "pre_receipt_refund_amount"]

/** الملفاتُ المحوَّلة. تطول ولا تقصر. */
const RATCHET = ["app/bills/[id]/page.tsx"]

/** ما يدلّ على أنّ الفراغَ عولج فى هذا الموضع. */
const GUARD = /HIDDEN_MONEY|isHiddenMoney|rowMoneyHidden|\bmoney\s*\(|\?\?\s*HIDDEN|==\s*null\s*\?|!=\s*null\s*\?/

/**
 * علامةُ استثناءٍ **مُعلَنةٌ ومعدودة**.
 *
 * موضعٌ يبنى مبلغاً لا يعرضه — حمولةُ كتابةٍ مثلاً — وفعلُه كلُّه خلف بوّابةِ
 * إذنٍ تردّ المحجوبَ قبل أن يبلغه. فلا يُسكَت عنه بحذفه من القياس، بل يُعلَن
 * فى الشيفرة بعلامةٍ تُسمّى البوّابة، ويُعدّ فى كلِّ تشغيل.
 *
 * ولا تُعفى العلامةُ من **الانهيار** أبداً: صفحةٌ تسقط لا عذرَ لها.
 */
const EXEMPT_MARK = "masked-money-exempt"

/**
 * يُقنّع التعليقاتِ بمسافات **ويُبقى الأسطرَ كما هى**.
 *
 * ⚠️ درسٌ من هذه الدفعة: ماسحٌ سابقٌ كان يحذف التعليقاتِ حذفاً فتُزاح أرقامُ
 * الأسطر، فأشار إلى مواضعَ ليست هى. والحارسُ الذى يُسمّى سطراً خطأً يُفقد
 * الثقةَ فيه كلِّها. فالتعليقُ يُقنَّع ولا يُحذف.
 */
function maskComments(src) {
  const a = src.split("")
  let i = 0
  while (i < a.length) {
    const two = src.slice(i, i + 2)
    if (two === "//" && src[i - 1] !== ":") {
      let k = i
      while (k < a.length && a[k] !== "\n") { a[k] = " "; k++ }
      i = k
      continue
    }
    if (two === "/*") {
      const k = src.indexOf("*/", i + 2)
      const end = k === -1 ? a.length : k + 2
      for (let j = i; j < end; j++) if (a[j] !== "\n") a[j] = " "
      i = end
      continue
    }
    i++
  }
  return a.join("")
}

function offendersIn(src) {
  const raw = src.split(/\r?\n/)
  const lines = maskComments(src).split(/\r?\n/)
  const hits = []
  let exempt = 0
  const crashRe = new RegExp("(?<![\\w$.])[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*\\.(?:" +
    MASKABLE.join("|") + ")\\.toFixed\\s*\\(")

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.includes(".toFixed(")) continue

    // نافذةُ الحماية: هذا السطرُ وسطران قبله — فالشرطُ الثلاثىُّ يُكتب موزّعاً.
    const window = lines.slice(Math.max(0, i - 2), i + 1).join("\n")
    const guarded = GUARD.test(window)

    if (crashRe.test(line)) {
      // الانهيارُ لا يُستثنى ولو حملت العلامة: صفحةٌ تسقط لا عذرَ لها.
      hits.push({ line: i + 1, why: "انهيار: تنسيقُ حقلٍ قابلٍ للحجب مباشرةً" })
      continue
    }
    if (guarded) continue

    // الصفرُ الكاذب: Number(حقلٌ قابلٌ للحجب) ثمّ toFixed بلا علاجٍ للفراغ.
    const idx = line.indexOf(".toFixed(")
    const before = line.slice(0, idx)
    if (/Number\s*\(/.test(before) && MASKABLE.some((f) => before.includes(f))) {
      // العلامةُ تُقبل على السطر نفسِه أو فى سطرين قبله — فالتعليقُ الذى
      // يُسمّى البوّابةَ لا يسع سطراً واحداً.
      const declared = [i, i - 1, i - 2].some((k) => (raw[k] || "").includes(EXEMPT_MARK))
      if (declared) { exempt++; continue }
      hits.push({ line: i + 1, why: "صفرٌ كاذب: Number(محجوب) يكتب 0.00 مكان مبلغٍ موجود" })
    }
  }
  hits.exempt = exempt
  return hits
}

function scan(root) {
  const bad = []
  bad.exempt = 0
  for (const rel of RATCHET) {
    const abs = path.join(root, rel)
    if (!fs.existsSync(abs)) { bad.push({ file: rel, hits: [], why: "الملفُّ غيرُ موجود" }); continue }
    const hits = offendersIn(fs.readFileSync(abs, "utf8"))
    bad.exempt += hits.exempt || 0
    if (hits.length > 0) bad.push({ file: rel, hits })
  }
  return bad
}

// -- الفخُّ الذاتى ------------------------------------------------------------
function selftest() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "masked-money-"))
  const rel = RATCHET[0]
  const abs = path.join(base, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  const w = (s) => fs.writeFileSync(abs, s)

  w('const a = money(it.unit_price, 2)\nconst b = money(bill.total_amount, 2)\n' +
    'const c = it.quantity.toFixed(2)\nconst d = row.tax_rate.toFixed(0)\n')
  const p1 = scan(base).length === 0

  w("const a = it.unit_price.toFixed(2)\n")
  const p2 = scan(base).length > 0

  w("const v = Number(bill.returned_amount).toFixed(2)\n")
  const p3 = scan(base).length > 0

  w("// it.unit_price.toFixed(2) داخل تعليق\nconst a = 1\n")
  const p4 = scan(base).length === 0

  w("const c = it.quantity.toFixed(2)\nconst d = row.tax_rate.toFixed(0)\n")
  const p5 = scan(base).length === 0

  // شرطٌ ثلاثىٌّ موزّعٌ على أسطر: الحمايةُ فى سطرٍ سابق - لا يُصرَخ عليه
  w("{moneyHidden\n  ? HIDDEN_MONEY\n  : `${Number(po.discount_value).toFixed(2)}%`}\n")
  const p6 = scan(base).length === 0

  // ورقمُ السطر يجب أن يكون حقيقيّاً بعد تعليقٍ كتلىّ
  w("/* تعليق\n   كتلى */\nconst a = it.unit_price.toFixed(2)\n")
  const found = scan(base)
  const p7 = found.length === 1 && found[0].hits.length === 1 && found[0].hits[0].line === 3

  // العلامةُ المُعلَنة تُعفى من الصفر الكاذب وتُعدّ...
  w("// masked-money-exempt: الفعلُ خلف بوّابةِ إذن\n" +
    "const v = Number(it.unit_price || 0).toFixed(2)\n")
  const r9 = scan(base)
  const p9 = r9.length === 0 && r9.exempt === 1

  // ...ولا تُعفى من الانهيار أبداً
  w("// masked-money-exempt: لا يشفع لانهيار\n" +
    "const v = it.unit_price.toFixed(2)\n")
  const p10 = scan(base).length > 0

  fs.rmSync(abs)
  const p8 = scan(base).length > 0

  console.log((p1 ? "  ok  " : "  X   ") + "يمرّ حين يُنادى البيتُ الواحد money()")
  console.log((p2 ? "  ok  " : "  X   ") + "يرفض الانهيار: تنسيقُ حقلٍ محجوبٍ مباشرةً")
  console.log((p3 ? "  ok  " : "  X   ") + "يرفض الصفرَ الكاذب: Number(محجوب).toFixed")
  console.log((p4 ? "  ok  " : "  X   ") + "لا يصرخ على ذكرٍ داخل تعليق")
  console.log((p5 ? "  ok  " : "  X   ") + "لا يصرخ على حقلٍ لا يُحجب (كمية · نسبة ضريبة)")
  console.log((p6 ? "  ok  " : "  X   ") + "لا يصرخ على شرطٍ ثلاثىٍّ حمايتُه فى سطرٍ سابق")
  console.log((p7 ? "  ok  " : "  X   ") + "يُسمّى رقمَ السطر الحقيقىَّ بعد تعليقٍ كتلىّ")
  console.log((p9 ? "  ok  " : "  X   ") + "العلامةُ المُعلَنة تُعفى من الصفر الكاذب وتُعدّ")
  console.log((p10 ? "  ok  " : "  X   ") + "ولا تشفع العلامةُ لانهيارٍ أبداً")
  console.log((p8 ? "  ok  " : "  X   ") + "يقول إن اختفى الملفُّ ولا يصمت")

  try { fs.rmSync(base, { recursive: true, force: true }) } catch { /* لا يهمّ */ }
  return p1 && p2 && p3 && p4 && p5 && p6 && p7 && p8 && p9 && p10
}

if (SELFTEST) {
  console.log("# الفخُّ الذاتى - check-masked-money-is-not-formatted-raw")
  process.exit(selftest() ? 0 : 1)
}

const bad = scan(ROOT)
if (bad.length === 0) {
  console.log("ok - لا انهيارَ ولا صفرَ كاذباً فى " + RATCHET.length + " ملفاً محوَّلاً" +
    (bad.exempt ? "، و" + bad.exempt + " موضعاً مستثنًى بعلامةٍ مُعلَنةٍ تُسمّى بوّابتَها (معدودٌ لا مسكوتٌ عنه)." : "."))
  process.exit(0)
}
console.error("")
console.error("X v3.74.974 - رقمٌ محجوبٌ يُنسَّق خاماً أو يُقلَب صفراً.")
console.error("")
for (const b of bad) {
  if (b.why) { console.error("  - " + b.file + "  " + b.why); continue }
  for (const h of b.hits) console.error("  - " + b.file + " سطر " + h.line + ": " + h.why)
}
console.error("")
console.error("  العلاج: money(القيمة, عددُ الأرقام) من lib/purchase-money — تعرض «—» للمحجوب.")
console.error("")
process.exit(1)

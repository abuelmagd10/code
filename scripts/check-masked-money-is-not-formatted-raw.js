#!/usr/bin/env node
/**
 * check-masked-money-is-not-formatted-raw.js
 * ---------------------------------------------------------------------------
 * v3.74.971 - الرقمُ المحجوبُ لا يُنسَّق خاماً.
 *
 * المصادرُ المقنَّعة (bills_masked · bill_items_masked) تُعيد **فارغاً** لمن
 * لا يحقُّ له رؤيةُ سعر الشراء. وتنسيقُ الفارغ بـ toFixed يُسقط الصفحةَ
 * كلَّها - وقع ذلك فعلاً على مسؤول المخزن، وأثبته سجلُّ المتصفّح.
 *
 * وقائمةُ الحقول ليست تخميناً: مقروءةٌ من تعريف المصادر المقنَّعة نفسِها.
 *
 * وهذا حارسُ **سقّاطة**: يُحاسب الملفاتِ المذكورةَ بالاسم فقط، وتطول
 * القائمةُ مع كلِّ دفعةٍ ولا تقصر. فالمحوَّلُ لا يرتدّ، والباقى معدودٌ لا
 * مسكوتٌ عنه - وقد قِيس اليوم أنّ فى المشروع عشرَ شاشاتٍ تقرأ مصادرَ
 * مقنَّعة، وفيها ١٦٣ موضعَ تنسيقٍ بلا حمايةٍ من الفراغ.
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

const MASKABLE = ["unit_price","line_total","subtotal","tax_amount","total_amount",
  "discount_value","shipping","adjustment","paid_amount","returned_amount",
  "base_currency_total","original_total","display_total","display_subtotal",
  "original_subtotal","original_tax_amount","pre_receipt_refund_amount"]

/** الملفاتُ المحوَّلة. تطول ولا تقصر. */
const RATCHET = ["app/bills/[id]/page.tsx"]

function stripJs(src) {
  let out = "", i = 0
  const n = src.length
  while (i < n) {
    const two = src.slice(i, i + 2)
    if (two === "//" && src[i - 1] !== ":") { const k = src.indexOf("\n", i); i = k === -1 ? n : k; continue }
    if (two === "/*") { const k = src.indexOf("*/", i + 2); i = k === -1 ? n : k + 2; out += " "; continue }
    out += src[i]; i++
  }
  return out
}

function offendersIn(src) {
  const code = stripJs(src)
  const re = new RegExp("(?<![\\w$.])[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*\\.(?:" +
    MASKABLE.join("|") + ")\\.toFixed\\(", "g")
  const hits = []
  let m
  while ((m = re.exec(code)) !== null) {
    hits.push(code.slice(0, m.index).split("\n").length)
  }
  return hits
}

function scan(root) {
  const bad = []
  for (const rel of RATCHET) {
    const abs = path.join(root, rel)
    if (!fs.existsSync(abs)) { bad.push({ file: rel, lines: [], why: "الملفُّ غيرُ موجود" }); continue }
    const src = fs.readFileSync(abs, "utf8")
    const hits = offendersIn(src)
    if (hits.length > 0) bad.push({ file: rel, lines: hits, why: "تنسيقُ حقلٍ قابلٍ للحجب بلا حماية" })
  }
  return bad
}

function selftest() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "masked-money-"))
  const rel = RATCHET[0]
  const abs = path.join(base, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })

  fs.writeFileSync(abs, "const a = maskedFixed(it.unit_price, 2)\n" +
    "const b = maskedFixed(bill.total_amount, 2)\n" +
    "const c = it.quantity.toFixed(2)\n" +
    "const d = it.tax_rate.toFixed(0)\n")
  const p1 = scan(base).length === 0

  fs.writeFileSync(abs, "const a = it.unit_price.toFixed(2)\n")
  const p2 = scan(base).length > 0

  fs.writeFileSync(abs, "// it.unit_price.toFixed(2) داخل تعليق\nconst a = 1\n")
  const p3 = scan(base).length === 0

  fs.writeFileSync(abs, "const c = it.quantity.toFixed(2)\nconst d = row.tax_rate.toFixed(0)\n")
  const p4 = scan(base).length === 0

  fs.rmSync(abs)
  const p5 = scan(base).length > 0

  console.log((p1 ? "  ok  " : "  X   ") + "يمرّ حين يكون التنسيقُ محمياً")
  console.log((p2 ? "  ok  " : "  X   ") + "يرفض تنسيقَ حقلٍ قابلٍ للحجب خاماً")
  console.log((p3 ? "  ok  " : "  X   ") + "لا يصرخ على ذكرٍ داخل تعليق")
  console.log((p4 ? "  ok  " : "  X   ") + "لا يصرخ على حقلٍ لا يُحجب (كمية · نسبة ضريبة)")
  console.log((p5 ? "  ok  " : "  X   ") + "يقول إن اختفى الملفُّ ولا يصمت")

  try { fs.rmSync(base, { recursive: true, force: true }) } catch { /* لا يهمّ */ }
  return p1 && p2 && p3 && p4 && p5
}

if (SELFTEST) {
  console.log("# الفخُّ الذاتى - check-masked-money-is-not-formatted-raw")
  process.exit(selftest() ? 0 : 1)
}

const bad = scan(ROOT)
if (bad.length === 0) {
  if (VERBOSE) console.log("ok - لا حقلَ قابلاً للحجب يُنسَّق خاماً فى " + RATCHET.length + " ملفاً محوَّلاً.")
  process.exit(0)
}
console.error("")
console.error("X v3.74.971 - رقمٌ محجوبٌ يُنسَّق خاماً - الصفحةُ ستسقط عند أوّل مستخدمٍ محجوب.")
console.error("")
for (const b of bad) console.error("  - " + b.file + "  " + b.why + (b.lines.length ? "  (سطر " + b.lines.join(", ") + ")" : ""))
console.error("")
console.error("  استعمل maskedFixed(القيمة, عددُ الأرقام) - يعرض شرطةً للمحجوب.")
console.error("")
process.exit(1)

#!/usr/bin/env node
/**
 * check-purchase-line-total-payload.js — حارسُ ٩٥١.
 * ---------------------------------------------------------------------------
 * بعد ٩٥٠ صار الخادمُ صاحبَ `line_total` فى جدولَى بنود الشراء. وهذا الحارس
 * يمنع عودةَ المتصفح إلى تأليف الرقم.
 *
 * ولا يحرس **شكلاً نصياً** بل **خاصيةً**: أربعةُ ملفاتٍ بأعيانها هى التى
 * تكتب فى `bill_items` و`purchase_order_items` من المتصفح، وقد فُرزت
 * بالقياس من ٩٧ موضعاً. فيها لا يجوز أن يظهر `line_total` مفتاحَ كائن.
 *
 * ومبيعاتٌ ومرتجعاتٌ وتقديراتٌ خارجَ القائمة عمداً: لها جداولُها ولها
 * حرّاسُها، وحارسٌ يصيح على البرىء يُطفأ.
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const path = require("path")

const ROOT = process.cwd()

/** الملفاتُ التى تكتب فى جدولَى بنود الشراء من المتصفح. */
const OWNED = [
  "app/bills/[id]/edit/page.tsx",
  "app/purchase-orders/[id]/edit/page.tsx",
  "app/purchase-orders/new/page.tsx",
  "app/api/purchase-orders/route.ts",
]

const offenders = []
let checked = 0

for (const rel of OWNED) {
  const p = path.join(ROOT, rel)
  if (!fs.existsSync(p)) {
    console.error("X " + rel + " غيرُ موجود — أنُقل الملفُّ دون تحديث الحارس؟")
    process.exit(1)
  }
  checked++
  const lines = fs.readFileSync(p, "utf8").split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (l.trim().startsWith("//")) continue          // شرحٌ يذكر الاسم ليس تأليفاً
    if (!/(^|[{,\s])line_total\s*:/.test(l)) continue
    offenders.push(rel + ":" + (i + 1) + "  " + l.trim())
  }
}

if (offenders.length > 0) {
  console.error("")
  console.error("X v3.74.951: المتصفحُ يؤلّف سعرَ بند الشراء ثانيةً — " + offenders.length + " موضعاً:")
  for (const o of offenders) console.error("   " + o)
  console.error("")
  console.error("   الخادمُ هو صاحبُ الرقم منذ ٩٥٠ (purchase_line_net + المُشغِّل).")
  console.error("   احذف المفتاحَ من الحمولة؛ العمودُ يُملأ قبل فحص NOT NULL.")
  process.exit(1)
}

console.log("ok  " + checked + " ملفاتٍ لا يؤلّف أىٌّ منها سعرَ بند الشراء.")

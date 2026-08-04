#!/usr/bin/env node
/**
 * check-realtime-filter-single-condition.js — حارسُ ٩٥٨.
 * ---------------------------------------------------------------------------
 * قناةُ Supabase Realtime تحمل شرطاً واحداً لا أكثر. ومن ألحق شرطاً ثانياً
 * بـ «.and.» جعل القاعدةَ تقرأ الشرطين كقيمةٍ واحدة، فتردّ
 * invalid input syntax for type uuid وتسقط القناةُ **بصمت**: لا خطأَ يظهر
 * للمستخدم، ولا تحديثَ يصله. وهذا وقع فعلاً وأبقى صفحاتِ الفروع قديمة.
 *
 * والمحروسُ خاصيةٌ لا نصّ: نصُّ فلترٍ يحمل أكثرَ من شرط.
 * والفلترةُ التفصيلية مكانُها shouldProcessEvent — وهو ما يقوله الملفُّ
 * نفسُه فى ستّةَ عشرَ موضعاً ويفعله.
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const path = require("path")

const ROOT = process.cwd()
const OWNED = ["lib/realtime-manager.ts"]
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
    if (l.trim().startsWith("//") || l.trim().startsWith("*")) continue
    if (!/\.and\.[a-z_]+\.eq\.|\.or\.[a-z_]+\.eq\./.test(l)) continue
    offenders.push(rel + ":" + (i + 1) + "  " + l.trim().slice(0, 110))
  }
}

if (offenders.length > 0) {
  console.error("")
  console.error("X v3.74.958: فلترُ قناةٍ يحمل أكثرَ من شرط — " + offenders.length + " موضعاً:")
  for (const o of offenders) console.error("   " + o)
  console.error("")
  console.error("   القناةُ تقبل شرطاً واحداً. والشرطُ الثانى يُقرأ داخلَ قيمة الأوّل،")
  console.error("   فتردّ القاعدةُ invalid input syntax for type uuid وتسقط القناةُ بصمت.")
  console.error("   ضع شرطَ الشركة وحدَه، وصفِّ الباقىَ فى shouldProcessEvent.")
  process.exit(1)
}

console.log("ok  " + checked + " ملفاً، ولا فلترَ قناةٍ يحمل أكثرَ من شرط.")

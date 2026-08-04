#!/usr/bin/env node
/**
 * check-seats-screen-names-its-dates.js — حارسُ ٩٥٧.
 * ---------------------------------------------------------------------------
 * شاشةُ المقاعد تعرض تاريخين مختلفَى المعنى: انتهاءَ فترة اشتراك الشركة،
 * وصلاحيةَ رخصةِ المقعد. وحين عُرضا بنفس الوزن وبلا اسمٍ صريح، قرأ صاحبُ
 * العمل «مُوقَف» و«تجديد فى ٣١ يوليو» و«ينتهى ١ يناير ٢٠٢٧» فلم يفهم شيئاً،
 * ولم يعرف أنّ اشتراكه توقّف رغم ستّةِ تحذيراتٍ سبقته.
 *
 * والمحروسُ خاصيةٌ لا نصّ: **اسمُ التاريخ يُشتقّ من الحالة، لا يُثبَّت**.
 * فلو عاد الاسمُ ثابتاً، عاد الوعدُ الكاذبُ تحت تاريخٍ مضى.
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const path = require("path")

const ROOT = process.cwd()
const REL = "app/settings/seats/page.tsx"
const p = path.join(ROOT, REL)

if (!fs.existsSync(p)) {
  console.error("X " + REL + " غيرُ موجود — أنُقلت الشاشةُ دون تحديث الحارس؟")
  process.exit(1)
}

const src = fs.readFileSync(p, "utf8")
const code = src.split(/\r?\n/).filter((l) => !l.trim().startsWith("//")).join("\n")
const fail = []

if (!/const\s+periodLabel\s*=/.test(code)) {
  fail.push("periodLabel غائب — اسمُ التاريخ لم يعد مشتقاً من الحالة.")
}
if (!/const\s+subIsStopped\s*=/.test(code) || !/const\s+subIsLapsed\s*=/.test(code)) {
  fail.push("subIsStopped/subIsLapsed غائبان — الشاشةُ لا تعرف أنّ الاشتراك متوقف.")
}
if (!/\{periodLabel\}/.test(code)) {
  fail.push("periodLabel معرَّفٌ ولا يُستعمل — الاسمُ ما زال مثبَّتاً فى الشاشة.")
}
if (/\?\s*'تنتهى فى'\s*:\s*'تجديد فى'/.test(code)) {
  fail.push("عاد الاسمُ الثابت «تنتهى فى / تجديد فى» داخل الشاشة.")
}
if (!/صلاحية رخصة المقعد/.test(code)) {
  fail.push("تاريخُ المقعد بلا اسمٍ صريح — يُقرأ كأنّه تاريخُ الاشتراك.")
}

if (fail.length > 0) {
  console.error("")
  console.error("X v3.74.957: شاشةُ المقاعد لا تُسمّى تواريخَها — " + fail.length + " موضعاً:")
  for (const f of fail) console.error("   - " + f)
  console.error("")
  console.error("   الاشتراكُ شىءٌ ورخصةُ المقعد شىءٌ آخر، وتاريخٌ مضى لا يُقال عنه «تجديد فى».")
  process.exit(1)
}

console.log("ok  شاشةُ المقاعد تُسمّى كلَّ تاريخٍ باسمه وتشتقّ الاسمَ من الحالة.")

#!/usr/bin/env node
/**
 * check-error-ar-carries-reason.js — حارسُ ٩٥٤.
 * ---------------------------------------------------------------------------
 * يمنع عودةَ الخاصية: ردٌّ يحمل سببَ القاعدة فى error ويحمل بجواره error_ar
 * نصّاً ثابتاً. والشاشةُ تُفضّل العربىَّ، فيُعرض الأفقر ويضيع السبب.
 *
 * ولا يحرس نصّاً: ردٌّ جانباه ثابتان (تحقّقُ مدخلات) يمرّ، لأنّه لا سببَ فيه
 * يُحمل أصلاً. وردٌّ عربيُّه يحمل قالباً حيّاً يمرّ. المقصودُ وحده هو
 * **الفقرُ فى جانبٍ والغنى فى الآخر**.
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const path = require("path")

const ROOT = process.cwd()
const DIR = path.join(ROOT, "app", "api")
if (!fs.existsSync(DIR)) { console.error("X app/api غيرُ موجود."); process.exit(1) }

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

const offenders = []
let files = 0

for (const abs of walk(DIR, [])) {
  const src = fs.readFileSync(abs, "utf8")
  if (!src.includes("error_ar")) continue
  files++
  const rel = path.relative(ROOT, abs).split(path.sep).join("/")
  const lines = src.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(^|[\s{,])error_ar\s*:\s*(["'])((?:(?!\2).)*)\2/)
    if (!m) continue
    const before = lines[i].slice(0, m.index + 1)
    const liveHere = /\berror\s*:\s*[A-Za-z_$][\w$]*\s*\.\s*message\b/.test(before)
    if (liveHere) { offenders.push(rel + ":" + (i + 1) + "  «" + m[3].slice(0, 50) + "»"); continue }
    if (/\berror\s*:/.test(before)) continue
    for (let k = i - 1; k >= Math.max(0, i - 5); k--) {
      if (/^\s*[})]/.test(lines[k])) break
      if (!/\berror\s*:/.test(lines[k])) continue
      const live = /\berror\s*:\s*[A-Za-z_$][\w$]*\s*\.\s*message\b/.test(lines[k]) ||
                   /\berror\s*:\s*`[^`]*${/.test(lines[k])
      if (live) offenders.push(rel + ":" + (i + 1) + "  «" + m[3].slice(0, 50) + "»")
      break
    }
  }
}

if (offenders.length > 0) {
  console.error("")
  console.error("X v3.74.954: الجانبُ العربىُّ أفقرُ من الإنجليزى — " + offenders.length + " موضعاً:")
  for (const o of offenders) console.error("   " + o)
  console.error("")
  console.error("   الشاشةُ تعرض error_ar وتُهمل error، فيضيع سببُ القاعدة.")
  console.error('   استعمل: error_ar: arabicReason(<متغيّرُ الخطأ>, "<النصُّ الاحتياطى>")')
  process.exit(1)
}

console.log("ok  " + files + " ملفاً فيه error_ar، ولا واحدَ منها يُفقر الجانبَ العربى.")

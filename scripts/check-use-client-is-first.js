#!/usr/bin/env node
/**
 * check-use-client-is-first.js — والتوجيهُ يسبقُ كلَّ شىء.
 * ---------------------------------------------------------------------------
 *   node scripts/check-use-client-is-first.js [--selftest]
 *
 * ═══ لماذا وُجد ═══
 *
 * فى ٣.٧٥.٠ وضعت أداةُ النقلِ سطرَ استيرادٍ **قبل** توجيه `"use client"` فى
 * ملفٍّ يبدأ بتعليقٍ طويل. والتوجيهُ إن سبقَه استيرادٌ **بطَل**: يُقرأ الملفُّ
 * على أنّه مكوّنُ خادمٍ وهو مكوّنُ عميل، فينهار البناءُ كلُّه.
 *
 * وفحصُ الأنواعِ مرَّ، وستّةٌ وسبعون حارساً مرّوا — **ولا واحدَ منهم يعرف
 * حدَّ العميلِ والخادم**. فسقط البناءُ على الخادمِ بعد الدفع.
 *
 * > **وفحصُ الأنواعِ ليس بناءً، وما لا يفحصه أحدٌ يسقطُ عند أوّلِ بناء.**
 *
 * ═══ الخاصّيّةُ الممنوعة ═══
 *
 * **توجيهٌ (`"use client"` أو `"use server"`) يسبقُه أمرٌ تنفيذىّ.**
 * والتعليقاتُ والأسطرُ الفارغةُ لا تُبطله — فلا تُحاكَم.
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const path = require("path")

const DIR = /^\s*(["'])use (client|server)\1\s*;?\s*$/

/** يعيد سببَ السقوطِ أو null. يُحاكم الأمرَ التنفيذىَّ وحدَه قبل التوجيه. */
function judge(src) {
  const L = src.split(/\r?\n/)
  const at = L.findIndex((l) => DIR.test(l))
  if (at === -1) return null
  let inBlock = false
  for (let i = 0; i < at; i++) {
    let t = L[i].trim()
    if (inBlock) { if (t.indexOf("*/") !== -1) { inBlock = false; t = t.slice(t.indexOf("*/") + 2).trim() } else continue }
    if (t === "") continue
    if (t.startsWith("//")) continue
    if (t.startsWith("/*")) { if (t.indexOf("*/") === -1) inBlock = true; continue }
    if (t.startsWith("*")) continue
    return { line: i + 1, text: t.slice(0, 90), dirLine: at + 1 }
  }
  return null
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["يمرّ حين يكون التوجيهُ أوّلَ سطر", '"use client"\nimport x from "y"\n', 0],
    ["ويمرّ حين يسبقه تعليقٌ كتلىٌّ طويل", "/**\n * شرح\n */\n\n'use client'\nimport x from 'y'\n", 0],
    ["ويمرّ حين يسبقه تعليقٌ سطرىّ", '// شرح\n"use client"\n', 0],
    ["ويرفض استيراداً قبل التوجيه", 'import { a } from "b"\n"use client"\n', 1],
    ["ويرفض استيراداً بعد تعليقٍ وقبل التوجيه", "/** شرح */\nimport { a } from \"b\"\n\"use client\"\n", 1],
    ["ويرفض ثابتاً قبل التوجيه", 'const x = 1\n"use client"\n', 1],
    ["ولا يحاكم ملفّاً بلا توجيه", 'import { a } from "b"\nconst x = 1\n', 0],
    ["ويرى use server كما يرى use client", 'import { a } from "b"\n"use server"\n', 1],
  ]
  let fail = 0
  for (const [name, src, exp] of cases) {
    const got = judge(src) ? 1 : 0
    if (got !== exp) fail++
    console.log((got === exp ? "  ok  " : "  X   ") + name + "  (توقّعتُ " + exp + " فجاء " + got + ")")
  }
  if (fail) { console.error("X سقط الفخُّ الذاتىّ فى " + fail + " اتّجاه."); process.exit(1) }
  console.log("  الفخُّ الذاتىّ: " + cases.length + " اتّجاهاً، كلُّها صحيحة.")
  process.exit(0)
}

const ROOT = process.cwd()
function walk(d, o) {
  let e
  try { e = fs.readdirSync(d, { withFileTypes: true }) } catch { return o }
  for (const x of e) {
    const p = path.join(d, x.name)
    if (/node_modules|[\\/]\.next|[\\/]\.git/.test(p)) continue
    if (x.isDirectory()) walk(p, o)
    else if (/\.(ts|tsx|js|jsx)$/.test(x.name)) o.push(p)
  }
  return o
}
const files = []
for (const d of ["app", "components", "lib", "hooks"]) {
  const abs = path.join(ROOT, d)
  if (fs.existsSync(abs)) walk(abs, files)
}
if (files.length === 0) { console.error("X لم أقرأ ملفّاً واحداً — **بحثٌ لا يجد ليس دليلَ غياب.**"); process.exit(1) }

let withDir = 0
const bad = []
for (const abs of files) {
  const src = fs.readFileSync(abs, "utf8")
  if (!DIR.test(src.split(/\r?\n/).find((l) => DIR.test(l)) || "")) continue
  withDir++
  const v = judge(src)
  if (v) bad.push({ rel: path.relative(ROOT, abs).split(path.sep).join("/"), ...v })
}

console.log("  ملفّاتٌ فيها توجيهُ عميلٍ أو خادم: " + withDir)
if (bad.length) {
  console.error("\nX توجيهٌ يسبقُه أمرٌ تنفيذىٌّ فيبطُل (" + bad.length + "):")
  bad.forEach((b) => console.error("   " + b.rel + ":" + b.line + "  قبل التوجيه (سطر " + b.dirLine + ")  " + b.text))
  console.error("\n   العلاج: انقلِ التوجيهَ إلى أوّلِ الملفّ، أو انقلِ الأمرَ إلى ما بعده.")
  process.exit(1)
}
console.log("  ok  التوجيهُ يسبقُ كلَّ أمرٍ فى كلِّ ملفّ — ولا مكوّنَ عميلٍ يُقرأ خادماً.")

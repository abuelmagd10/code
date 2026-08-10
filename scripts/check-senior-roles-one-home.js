#!/usr/bin/env node
/**
 * check-senior-roles-one-home.js — الأدوارُ العليا تُنادى ولا تُكتَب بيدها.
 * ---------------------------------------------------------------------------
 *   node scripts/check-senior-roles-one-home.js
 *   node scripts/check-senior-roles-one-home.js --selftest
 *
 * ═══ لماذا وُجد ═══
 *
 * «المالكُ أو المديرُ العامّ» كانت مكتوبةً بيدها فى **٢٠٤ مواضعَ** فى الكود
 * (وفى ١٠٢ دالّةٍ فى قاعدة البيانات). ومن أراد يوماً أن يُضيف رتبةً عليا
 * ثالثة، أو يسحبَ من المديرِ العامِّ باباً، كان عليه أن يلمسَ كلَّ موضعٍ
 * منها — **ومن نسىَ واحداً فتحَ باباً لا يراه أحد.**
 *
 * > **وقاعدةٌ لها مئتا بيتٍ ليست قاعدة.**
 *
 * ═══ الخاصّيّةُ الممنوعة ═══
 *
 * **قائمةُ أدوارٍ أو سلسلةُ مقارناتٍ مجموعتُها بالضبط {owner, admin}،
 * مكتوبةٌ خارج `lib/roles.ts`.**
 *
 * وليست الخاصّيّةُ «سطرٌ فيه owner و admin»: قائمةٌ فيها `manager` معهما
 * ليست الأدوارَ العليا بل قائمةٌ أخرى، ولا تُحاكَم. **وحارسٌ يصرخ على
 * البرىء يُطفأ ثمّ لا يحرس شيئاً.**
 *
 * ═══ ولا يُهدَم الدَّينُ القديمُ فجأة ═══
 *
 * البقيّةُ تُحوَّل على دفعاتٍ مقيسة، وكلُّ دفعةٍ تُنزل خطَّ الأساس. فالحارسُ
 * يرفضُ **الزيادة** ولا يرفضُ الباقى، ويقول العددَ فى كلِّ مرّة:
 * **معدودٌ لا مُوافَقٌ عليه.**
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const path = require("path")

const HOME = "lib/roles.ts"
const BASELINE = Number(process.env.SENIOR_PAIR_BASELINE ?? 0)

const ARR = /\[\s*(['"])([a-z_]+)\1\s*,\s*(['"])([a-z_]+)\3\s*\]/g
const CMP = /([\w$.?[\]]+)\s*===\s*(['"])([a-z_]+)\2\s*\|\|\s*\1\s*===\s*(['"])([a-z_]+)\4/g

function isSeniorPair(a, b) {
  const s = [a, b].sort().join(",")
  return s === "admin,owner"
}

/** يعيد مواضعَ «الزوجِ العلوىِّ المكتوبِ بيده» فى نصٍّ واحد. */
function pairsIn(src) {
  const out = []
  src.split(/\r?\n/).forEach((ln, i) => {
    const t = ln.trim()
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return
    let m
    ARR.lastIndex = 0
    while ((m = ARR.exec(ln))) if (isSeniorPair(m[2], m[4])) out.push({ line: i + 1, form: "قائمة", text: t.slice(0, 110) })
    CMP.lastIndex = 0
    while ((m = CMP.exec(ln))) if (isSeniorPair(m[3], m[5])) out.push({ line: i + 1, form: "مقارنة", text: t.slice(0, 110) })
  })
  return out
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["يرى القائمةَ المكتوبةَ بيدها", 'if (["owner", "admin"].includes(role)) return true\n', 1],
    ["ويراها بعلامةٍ مفردة وبترتيبٍ مقلوب", "const R = ['admin', 'owner']\n", 1],
    ["ويرى سلسلةَ المقارنات", "if (role === 'owner' || role === 'admin') {\n", 1],
    ["ولا يحاكم قائمةً فيها دورٌ ثالث", 'const R = ["owner", "admin", "manager"]\n', 0],
    ["ولا قائمةً ليست أدواراً عليا", 'const R = ["draft", "sent"]\n', 0],
    ["ولا يحاكم تعليقاً", '// ["owner", "admin"].includes(role)\n', 0],
    ["ولا يحاكم النداءَ على البيت", "if (isSeniorRole(role)) return true\n", 0],
    ["ولا القائمةَ المنشورةَ من البيت", "const R = [...SENIOR_ROLES]\n", 0],
    ["ولا مقارنةً لمتغيّرين مختلفين", "if (a === 'owner' || b === 'admin') {\n", 0],
  ]
  let fail = 0
  for (const [name, src, exp] of cases) {
    const got = pairsIn(src).length
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
    else if (/\.(ts|tsx)$/.test(x.name)) o.push(p)
  }
  return o
}

const files = []
for (const d of ["app", "components", "lib", "hooks"]) {
  const abs = path.join(ROOT, d)
  if (fs.existsSync(abs)) walk(abs, files)
}
if (files.length === 0) {
  console.error("X لم أقرأ ملفّاً واحداً — **بحثٌ لا يجد ليس دليلَ غياب.**")
  process.exit(1)
}

const found = []
for (const abs of files) {
  const rel = path.relative(ROOT, abs).split(path.sep).join("/")
  if (rel === HOME) continue
  for (const h of pairsIn(fs.readFileSync(abs, "utf8"))) found.push({ rel, ...h })
}

console.log("  الزوجُ العلوىُّ مكتوباً بيده: " + found.length + "   (خطُّ الأساس " + BASELINE + ")")
if (found.length > BASELINE) {
  console.error("")
  console.error("X زاد الدَّين " + (found.length - BASELINE) + " موضعاً — قاعدةٌ جديدةٌ كُتبت بيدها بدل النداءِ على بيتها:")
  found.slice(0, 40).forEach((f) => console.error("   " + f.rel + ":" + f.line + "  [" + f.form + "]  " + f.text))
  console.error("")
  console.error("   العلاج: isSeniorRole(الدور) أو [...SENIOR_ROLES] من @/lib/roles.")
  process.exit(1)
}
if (found.length < BASELINE) {
  console.log("  + انخفض الدَّينُ " + (BASELINE - found.length) + " موضعاً — أنزِلْ SENIOR_PAIR_BASELINE فى هذا الملفّ.")
  process.exit(1)
}
console.log("  ok  لم يزد الدَّين. " + found.length + " موضعاً قديماً باقياً — **معدودٌ لا مُوافَقٌ عليه**، يُحوَّل على دفعاتٍ مقيسة.")

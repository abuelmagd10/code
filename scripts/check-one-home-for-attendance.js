#!/usr/bin/env node
/**
 * check-one-home-for-attendance.js — بيتٌ واحدٌ يبنى سجلَّ الحضور.
 * ---------------------------------------------------------------------------
 *   node scripts/check-one-home-for-attendance.js
 *   node scripts/check-one-home-for-attendance.js --selftest
 *
 * ═══ الحكاية ═══
 *
 * كان فى المشروع **محرِّكا حضورٍ اثنان** يكتبان سجلَّ الحضور من البصمات:
 *
 *   • `lib/attendance-processing-engine.ts` — يعرف الورديّات، ويحسب التأخيرَ
 *     والوقتَ الإضافىَّ والانصرافَ المبكّر، ويعالج ورديّةَ ما بعد منتصف الليل،
 *     ويُبقى البصمةَ الشاذّةَ موسومةً بدل أن يبتلعها. **ولا ينادِيه أحد.**
 *
 *   • `lib/core/queue/jobs/process-attendance-job.ts` — مُجمِّعٌ بدائىٌّ يأخذ
 *     أوّلَ دخولٍ وآخرَ خروج. **وهو الموصولُ بمسار البصمة** — وكان يكتب فى
 *     جدولٍ لا وجودَ له، وبحالةٍ يرفضها الجدول، ويُعلِّم بصماتِ اليوم كلَّها
 *     «مُعالَجة» ولو لم يُكتب شىء.
 *
 * فالجيّدُ معزولٌ والمعطوبُ موصول. وعُولج فى ٩٨٠ بأن صار جسمُ المهمّة
 * **تفويضاً** إلى المحرِّك، لا نسخةً ثانيةً منه.
 *
 * ═══ الخاصّيّتان الممنوعتان ═══
 *
 * ١) **كاتبٌ ثالثٌ لسجلّ الحضور.** مَن يكتب `attendance_records` يجب أن يكون
 *    أحدَ بيتين معلَنَين: المحرِّكُ الآلىّ، ومسارُ الإدخال اليدوىِّ للموارد
 *    البشريّة (وهو قرارُ إنسانٍ لا معالجةَ بصمة). وثالثٌ يعنى عودةَ الازدواج.
 *
 * ٢) **مهمّةُ الطابور تعود تبنى بنفسها.** يجب أن تُفوِّض — أى تنادى
 *    `processAttendanceBatch` — وألّا تكتب سجلَّ حضورٍ بيدها.
 *
 * والقراءةُ ليست كتابة: مَن يقرأ `attendance_records` للتقارير أو الرواتب
 * لا يُحاكَم. وحارسٌ يصرخ على قارئٍ يُطفأ ثمّ لا يحرس شيئاً.
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const path = require("path")

/** البيتان المعلَنان — ولا ثالث. */
const HOMES = {
  "lib/attendance-processing-engine.ts": "المحرِّكُ الآلىُّ: البيتُ الوحيدُ الذى يبنى الحضورَ من البصمات",
  "app/api/hr/attendance/route.ts": "الإدخالُ اليدوىُّ للموارد البشريّة — قرارُ إنسانٍ لا معالجةُ بصمة",
}
const JOB = "lib/core/queue/jobs/process-attendance-job.ts"

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

/** مواضعُ **الكتابة** فى سجلّ الحضور — لا القراءة. */
function writeSites(src) {
  const out = []
  const masked = maskComments(src)
  const re = /\.from\(\s*(["'`])attendance_records\1\s*\)/g
  let m
  while ((m = re.exec(masked)) !== null) {
    // ما يلى النداءَ مباشرةً يحدّد أهو كتابةٌ أم قراءة.
    const after = masked.slice(m.index + m[0].length, m.index + m[0].length + 220)
    if (/^\s*[\r\n]*\s*\.(insert|update|upsert|delete)\s*\(/.test(after)) {
      const line = masked.slice(0, m.index).split("\n").length
      out.push({ line })
    }
  }
  return out
}

// ───────────────────────────── الفخُّ الذاتىّ ─────────────────────────────

if (process.argv.includes("--selftest")) {
  const cases = [
    ["يرى الكتابةَ المباشرة",
     'await supabase.from("attendance_records").insert({ a: 1 })\n', 1],
    ["ويراها على سطرٍ تالٍ",
     'await supabase.from("attendance_records")\n  .update({ a: 1 })\n  .eq("id", x)\n', 1],
    ["ولا يعدّ القراءةَ كتابةً",
     'const { data } = await supabase.from("attendance_records").select("*").eq("company_id", c)\n', 0],
    ["ولا يعدّ upsert على جدولٍ آخر",
     'await supabase.from("attendance_shifts").upsert({ a: 1 })\n', 0],
    ["ولا يحكم على ذكرٍ داخل تعليق",
     '// supabase.from("attendance_records").insert({})\nconst x = 1\n', 0],
    ["ويرى الحذفَ أيضاً — فهو تغييرٌ للسجلّ",
     'await supabase.from("attendance_records").delete().eq("id", x)\n', 1],
  ]
  let bad = 0
  for (const [name, src, expected] of cases) {
    const got = writeSites(src).length
    const ok = got === expected
    if (!ok) bad++
    console.log((ok ? "  ok  " : "  X   ") + name + "  (توقّعتُ " + expected + " فجاء " + got + ")")
  }
  if (bad > 0) { console.error("X سقط الفخُّ الذاتىّ فى " + bad + " اتّجاه."); process.exit(1) }
  console.log("  الفخُّ الذاتىّ: " + cases.length + " اتّجاهاتٍ، كلُّها صحيحة.")
  process.exit(0)
}

// ───────────────────────────── التشغيل ─────────────────────────────

const ROOT = process.cwd()
function walk(d, out) {
  let e
  try { e = fs.readdirSync(d, { withFileTypes: true }) } catch { return out }
  for (const x of e) {
    const p = path.join(d, x.name)
    if (/node_modules|[\\/]\.next|[\\/]\.git/.test(p)) continue
    if (x.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(x.name)) out.push(p)
  }
  return out
}

const files = [
  ...walk(path.join(ROOT, "app"), []),
  ...walk(path.join(ROOT, "lib"), []),
  ...walk(path.join(ROOT, "components"), []),
]

let fail = 0
const strangers = []
const seenHomes = new Set()

for (const abs of files) {
  const rel = path.relative(ROOT, abs).split(path.sep).join("/")
  const src = fs.readFileSync(abs, "utf8")
  if (src.indexOf("attendance_records") === -1) continue
  const sites = writeSites(src)
  if (sites.length === 0) continue
  if (Object.prototype.hasOwnProperty.call(HOMES, rel)) { seenHomes.add(rel); continue }
  for (const s of sites) strangers.push({ rel, line: s.line })
}

// ١) لا كاتبَ ثالث
if (strangers.length > 0) {
  console.error("")
  console.error("X بيتٌ ثالثٌ يبنى سجلَّ الحضور — وازدواجُ المحرِّكات هو بعينه ما عولج فى ٩٨٠:")
  for (const s of strangers) console.error("   " + s.rel + ":" + s.line)
  console.error("")
  console.error("   العلاج: فوِّض إلى processAttendanceBatch بدل أن تكتب بيدك.")
  fail++
}

// ٢) البيتان المعلَنان موجودان فعلاً — قائمةٌ تسمّى ما لا وجود له ليست قائمة
for (const rel of Object.keys(HOMES)) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    console.error("X بيتٌ معلَنٌ غيرُ موجود: " + rel + " — صحّح القائمة فى هذا الحارس.")
    fail++
  }
}

// ٣) مهمّةُ الطابور تُفوِّض ولا تبنى
{
  const abs = path.join(ROOT, JOB)
  if (!fs.existsSync(abs)) {
    console.error("X مهمّةُ الطابور غيرُ موجودة: " + JOB)
    fail++
  } else {
    const src = maskComments(fs.readFileSync(abs, "utf8"))
    if (src.indexOf("processAttendanceBatch") === -1) {
      console.error("X مهمّةُ الطابور لا تُفوِّض إلى المحرِّك — عادت تبنى بنفسها.")
      fail++
    }
    if (writeSites(src).length > 0) {
      console.error("X مهمّةُ الطابور تكتب سجلَّ الحضور بيدها — بيتان من جديد.")
      fail++
    }
    if (/\.from\(\s*["'`]daily_attendance["'`]\s*\)/.test(src)) {
      console.error("X مهمّةُ الطابور ما زالت تنادى daily_attendance — وهو جدولٌ لا وجودَ له.")
      fail++
    }
  }
}

if (fail > 0) process.exit(1)

console.log("  بيوتٌ معلَنة: " + Object.keys(HOMES).length + "  ·  منها كاتبةٌ فعلاً: " + seenHomes.size)
for (const rel of Object.keys(HOMES)) {
  console.log("     " + rel + (seenHomes.has(rel) ? "   — " : "   (لا يكتب اليوم) — ") + HOMES[rel])
}
console.log("  ok  بيتٌ واحدٌ يبنى الحضورَ من البصمات، ومهمّةُ الطابور تُفوِّض إليه.")

#!/usr/bin/env node
/**
 * check-ps-git-output-is-not-paged.js — دفعةٌ لا تنتظر ضغطةَ زرّ.
 * ---------------------------------------------------------------------------
 *   node scripts/check-ps-git-output-is-not-paged.js
 *   node scripts/check-ps-git-output-is-not-paged.js --selftest
 *
 * ═══ ماذا حدث فى ٩٧٧ ═══
 *
 * مرّ سبعةٌ وستّون حارساً فى مئتَى ثانية، ثمّ **توقّف السكربتُ صامتاً**. لم
 * يكن معطوباً: كان `git diff --cached --name-only` قد أخرج ثلاثةً وثلاثين
 * سطراً، فتجاوز ارتفاعَ النافذة، فشغّل git **عارضَ الصفحات** تلقائيّاً
 * وانتظر ضغطةَ `q`. والدفعاتُ السابقة كانت ثلاثةَ ملفّاتٍ فلم يظهر العارض.
 *
 * وهذا أخبثُ ما فى العلّة: **لا تظهر إلّا حين يكبر العمل**. تمرّ فى كلِّ
 * تجربةٍ صغيرةٍ ثمّ تُوقف الدفعةَ الكبيرة، وصاحبُها ينظر إلى شاشةٍ ساكنةٍ
 * لا يدرى أنجحت أم فشلت.
 *
 * ═══ الخاصّيّةُ الممنوعة ═══
 *
 * **نداءُ git فى موضعِ جملةٍ — أى مخرجاتُه ذاهبةٌ إلى الشاشة — بأمرٍ فرعىٍّ
 * يستعمل العارض، بلا `--no-pager`.**
 *
 * وهى خاصّيّةٌ لا شكل. فما كان مخرجُه مُلتقَطاً فى متغيّر — `$x = git ...`
 * أو `@(git ...)` — لا يمرّ بالعارض أصلاً، فلا يُحاكَم. ومن يمنع «كلَّ ذكرٍ
 * لـ git diff» يصرخ على البرىء، وحارسٌ يصرخ على البرىء يُطفأ ثمّ لا يحرس شيئاً.
 *
 * ═══ ولا يُحاكَم الماضى بأثرٍ رجعىّ ═══
 *
 * القاعدةُ وُلدت فى 3.74.978، فتُحاكَم سكربتاتُ الدفع من هذا الرقم فصاعداً،
 * وما قبلَها **يُعدُّ ولا يُحاكم** — ويُطبع عددُه فى كلِّ تشغيل.
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const path = require("path")

const BORN = [3, 74, 978]

/** أوامرُ git التى تُخرج إلى عارض الصفحات افتراضاً. */
const PAGED = new Set([
  "log", "diff", "show", "shortlog", "blame", "grep", "tag", "branch",
  "whatchanged", "diff-tree", "reflog", "stash",
])

/** خياراتٌ عامّةٌ تسبق الأمرَ الفرعىّ فتُتخطّى للوصول إليه. */
function subcommandOf(tokens) {
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === "-c" || t === "-C" || t === "--git-dir" || t === "--work-tree" || t === "--exec-path") { i++; continue }
    if (t.startsWith("-")) continue
    return t
  }
  return null
}

/** يُفرّغ تعليقاتِ PowerShell ونصوصَه مع حفظ الأسطر. */
function maskPs(src) {
  const a = src.split("")
  let i = 0
  let inBlock = false
  while (i < a.length) {
    const two = src.slice(i, i + 2)
    if (!inBlock && two === "<#") { inBlock = true; a[i] = " "; a[i + 1] = " "; i += 2; continue }
    if (inBlock) {
      if (two === "#>") { a[i] = " "; a[i + 1] = " "; inBlock = false; i += 2; continue }
      if (a[i] !== "\n") a[i] = " "
      i++
      continue
    }
    if (a[i] === "#") {
      let k = i
      while (k < a.length && a[k] !== "\n") { a[k] = " "; k++ }
      i = k
      continue
    }
    if (a[i] === '"' || a[i] === "'") {
      const q = a[i]
      let j = i + 1
      while (j < a.length && a[j] !== q && a[j] !== "\n") { a[j] = " "; j++ }
      i = j + 1
      continue
    }
    i++
  }
  return a.join("")
}

/** مواضعُ الخرق فى نصِّ سكربتٍ واحد. */
function offences(rel, raw) {
  const bad = []
  const masked = maskPs(raw).split(/\r?\n/)
  const lines = raw.split(/\r?\n/)
  for (let i = 0; i < masked.length; i++) {
    const m = masked[i].trim()
    if (!/^git\s/.test(m)) continue                 // ليس فى موضع جملة (أو مُلتقَط، أو تعليق)
    const tokens = m.split(/\s+/)
    if (tokens.indexOf("--no-pager") !== -1) continue
    const sub = subcommandOf(tokens)
    if (sub === null || !PAGED.has(sub)) continue
    bad.push({ rel, line: i + 1, sub, text: lines[i].trim().slice(0, 110) })
  }
  return bad
}

/** رقمُ الإصدار من اسم الملفّ: push_v3.74.978.ps1 → [3,74,978] */
function versionOf(name) {
  const m = /^push_v(\d+)\.(\d+)\.(\d+)(?:[-.].*)?\.ps1$/i.exec(name)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}
function isOlderThanBorn(v) {
  if (v === null) return false
  for (let i = 0; i < 3; i++) {
    if (v[i] < BORN[i]) return true
    if (v[i] > BORN[i]) return false
  }
  return false
}

// ───────────────────────────── الفخُّ الذاتىّ ─────────────────────────────

if (process.argv.includes("--selftest")) {
  const cases = [
    ["يرفض عرضَ diff بلا --no-pager",
     'git --no-optional-locks diff --cached --name-only\n', 1],
    ["يعفو حين يُوضع --no-pager",
     'git --no-optional-locks --no-pager diff --cached --name-only\n', 0],
    ["يعفو عن مخرجٍ مُلتقَطٍ فى متغيّر — لا يمرّ بالعارض أصلاً",
     '$staged = @(git --no-optional-locks diff --cached --name-only)\n', 0],
    ["يعفو عن أمرٍ لا يستعمل العارض",
     'git add -- lib/version.ts\ngit commit -F $msgFile\ngit push\n', 0],
    ["يرفض git log فى موضع جملة",
     'git log --oneline -5\n', 1],
    ["لا يحكم على تعليق",
     '# git diff --cached --name-only يُعرض هنا\ngit push\n', 0],
    ["ولا يخدعه نصٌّ داخل سلسلةِ حروف",
     'Write-Host "git diff --cached"\n', 0],
    ["يرى الأمرَ الفرعىَّ خلف خيارٍ عامٍّ ذى قيمة",
     'git -c core.pager=less show HEAD\n', 1],
    ["ولا يُحاكم ما قبل 3.74.978 بأثرٍ رجعىّ",
     null, 0],
  ]
  let bad = 0
  for (const [name, src, expected] of cases) {
    let got
    if (src === null) got = isOlderThanBorn(versionOf("push_v3.74.977.ps1")) ? 0 : 1
    else got = offences("selftest.ps1", src).length
    const ok = got === expected
    if (!ok) bad++
    console.log((ok ? "  ok  " : "  X   ") + name + "  (توقّعتُ " + expected + " فجاء " + got + ")")
  }
  if (bad > 0) { console.error("X سقط الفخُّ الذاتىّ فى " + bad + " اتّجاه."); process.exit(1) }
  console.log("  الفخُّ الذاتىّ: " + cases.length + " اتّجاهاً، كلُّها صحيحة.")
  process.exit(0)
}

// ───────────────────────────── التشغيل ─────────────────────────────

const ROOT = process.cwd()
let files = []
try {
  files = fs.readdirSync(ROOT).filter((f) => /^push_v.*\.ps1$/i.test(f))
} catch { files = [] }

let judged = 0
let counted = 0
let bad = []

for (const name of files) {
  const v = versionOf(name)
  if (isOlderThanBorn(v)) { counted++; continue }
  judged++
  const raw = fs.readFileSync(path.join(ROOT, name), "utf8")
  bad = bad.concat(offences(name, raw))
}

console.log("  سكربتات دفعٍ محكومة: " + judged + "  ·  أقدمُ من 3.74.978 فتُعدّ ولا تُحاكم: " + counted)

if (bad.length > 0) {
  console.error("")
  console.error("X مخرجُ git يذهب إلى الشاشة بلا --no-pager — فتتوقّف الدفعةُ تنتظر ضغطةَ زرّ متى كبرت القائمة:")
  for (const b of bad) console.error("   " + b.rel + ":" + b.line + "  (" + b.sub + ")  " + b.text)
  console.error("")
  console.error("   العلاج: git --no-pager " + "…  أو التقاطُ المخرج فى متغيّر إن لم يكن للعرض.")
  process.exit(1)
}

console.log("  ok  لا دفعةَ تنتظر ضغطةَ زرّ.")

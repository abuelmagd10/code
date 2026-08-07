#!/usr/bin/env node
/**
 * check-one-name-per-role.js — بابٌ واحدٌ لا يُفتح بمفتاحين.
 * ---------------------------------------------------------------------------
 *   node scripts/check-one-name-per-role.js
 *   node scripts/check-one-name-per-role.js --selftest
 *
 * ═══ الحكاية ═══
 *
 * دورُ «المدير العام» كان له فى المشروع **مفتاحان داخليّان**: `admin` وهو ما
 * تُنتجه شاشةُ الأعضاء، و`general_manager` وهو ما تفحصه معظمُ الأبواب. فمن
 * عُيّن «مدير عام» من الشاشة يُخزَّن `admin`، ثمّ يقف أمام بابٍ يسأل عن
 * `general_manager` فيُمنع. والعطبُ لا يظهر فى شاشةٍ ولا فى سجلٍّ — يظهر
 * كرجلٍ لا يستطيع أن يعتمد ولا يعرف لماذا.
 *
 * ═══ الخاصّيّةُ الممنوعة ═══
 *
 * **قائمةُ أدوارٍ تسمّى `general_manager` ولا تسمّى `admin`.**
 *
 * والمقياسُ هو **القائمة**، لا السطر. قوائمُ الأدوار تُكتب على أسطرٍ متعدّدة،
 * فيُبحث عن القوسِ المحيطِ بالكلمة — `[` أو `(` أو `{` — ويُفحص ما بينهما.
 * (وفى أوّل صياغةٍ لى فحصتُ «أربعةَ أسطرٍ حولَها»، فتخطّيتُ قائمةً لأنّ
 *  ثابتاً **آخرَ** فوقها بسطرٍ فيه `admin`. الجوارُ ليس انتماءً.)
 *
 * ═══ وثلاثةُ استثناءاتٍ معلَنةٌ ومعدودةٌ لا مسكوتٌ عنها ═══
 *
 * ١) **قوائمُ مُخطَرين بالإشعارات.** قِيست دالّةُ القراءة فى قاعدة البيانات
 *    `get_user_notifications`، وفيها: مَن دورُه `owner` يرى أيضاً ما وُجّه
 *    إلى `admin`. فإضافةُ `admin` إلى قائمةِ مُخطَرين فيها `owner` تُرسل إلى
 *    المالك **إشعارين عن حدثٍ واحد**. هذه ليست سلطةً تُوسَّع بل بريدٌ يُكرَّر.
 *
 * ٢) **`BRANCH_LEVEL_ROLES`** — غيرُ قابلةٍ للبلوغ أصلاً: `FULL_ACCESS_ROLES`
 *    تُفحص قبلها وفيها `general_manager`، فيعود قبل أن يبلغها.
 *
 * ٣) **ملفّاتٌ لا يستوردها أحد** — تُعدّ ولا تُصلَح، فإصلاحُ الميّت ادّعاء.
 *
 * وكلُّ استثناءٍ **يُطبع عددُه فى كلِّ تشغيل**. الاستثناءُ الصامت ثقب.
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const path = require("path")

const DEAD_FILES = ["lib/data-visibility-control-backup.ts"]
const DELIBERATE = [
  { needle: "BRANCH_LEVEL_ROLES", why: "غيرُ قابلٍ للبلوغ — FULL_ACCESS_ROLES تُفحص قبله" },
]

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

function maskStringBodies(src) {
  const a = src.split("")
  let i = 0
  while (i < a.length) {
    const c = a[i]
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1
      while (j < a.length) {
        if (a[j] === "\\") { a[j] = " "; if (a[j + 1] !== "\n") a[j + 1] = " "; j += 2; continue }
        if (a[j] === c) break
        if (a[j] !== "\n") a[j] = " "
        j++
      }
      i = j + 1
      continue
    }
    i++
  }
  return a.join("")
}

function enclosingSpan(skeleton, at) {
  let depth = 0
  let start = -1
  for (let i = at - 1; i >= 0; i--) {
    const c = skeleton[i]
    if (c === ")" || c === "]" || c === "}") depth++
    else if (c === "(" || c === "[" || c === "{") {
      if (depth === 0) { start = i; break }
      depth--
    }
  }
  if (start === -1) return [Math.max(0, at - 400), Math.min(skeleton.length, at + 400)]
  const open = skeleton[start]
  const close = open === "(" ? ")" : open === "[" ? "]" : "}"
  let d = 0
  let end = skeleton.length
  for (let i = start + 1; i < skeleton.length; i++) {
    const c = skeleton[i]
    if (c === "(" || c === "[" || c === "{") d++
    else if (c === ")" || c === "]" || c === "}") {
      if (d === 0) { if (c === close) end = i; break }
      d--
    }
  }
  return [start, end]
}

function isNotifyContext(lines, i) {
  if (/resolveRoleRecipients\s*\(/.test(lines[i])) return true
  for (let k = Math.max(0, i - 6); k < i; k++) {
    if (/resolveRoleRecipients\s*\(\s*$/.test(lines[k].trimEnd())) return true
  }
  if (/^\s*for\s*\(/.test(lines[i])) {
    const body = lines.slice(i + 1, Math.min(lines.length, i + 26)).join("\n")
    if (/p_assigned_to_role|sendNotification\s*\(|create_notification/.test(body)) return true
  }
  return false
}

/** يعود بمواضعِ الخرق فى نصِّ ملفٍّ واحد. */
function offences(rel, raw) {
  const out = { bad: [], notify: 0, deliberate: 0 }
  if (raw.indexOf("general_manager") === -1) return out
  const maskedSrc = maskComments(raw)
  const masked = maskedSrc.split(/\r?\n/)
  const lines = raw.split(/\r?\n/)
  const skeleton = maskStringBodies(maskedSrc)
  const lineStart = []
  { let acc = 0; for (const L of maskedSrc.split("\n")) { lineStart.push(acc); acc += L.length + 1 } }

  for (let i = 0; i < lines.length; i++) {
    const col = masked[i].indexOf("general_manager")
    if (col === -1) continue
    const [s, e] = enclosingSpan(skeleton, (lineStart[i] || 0) + col)
    if (/\badmin\b/.test(maskedSrc.slice(s, e))) continue
    if (isNotifyContext(masked, i)) { out.notify++; continue }
    if (DELIBERATE.some((d) => lines[i].indexOf(d.needle) !== -1)) { out.deliberate++; continue }
    out.bad.push({ rel, line: i + 1, text: lines[i].trim().slice(0, 110) })
  }
  return out
}

// ───────────────────────────── الفخُّ الذاتىّ ─────────────────────────────

function selftest() {
  const cases = [
    ["يرفض قائمةً بمفتاحٍ واحد",
     'const R = ["owner", "general_manager"]\n', 1],
    ["يعفو عن قائمةٍ فيها admin",
     'const R = ["owner", "admin", "general_manager"]\n', 0],
    ["يعفو عن قائمةٍ متعدّدةِ الأسطر وadmin فى سطرٍ آخرَ منها",
     'const R = [\n  "store_manager", "owner", "admin",\n  "general_manager", "warehouse_manager",\n]\n', 0],
    ["يرفض حين يكون admin فى قائمةٍ **أخرى** فوقها بسطر",
     'const A = new Set(["owner","admin","manager"])\nconst B = new Set(["owner","general_manager"])\n', 1],
    ["يعفو عن قائمةِ مُخطَرين بالإشعارات",
     'const rec = resolver.resolveRoleRecipients(["owner", "general_manager"], null, null, null)\n', 0],
    ["يعفو عن حلقةِ إخطارٍ جسمُها يُنشئ إشعاراً",
     'for (const t of ["owner", "general_manager"]) {\n  await s.rpc("create_notification", { p_assigned_to_role: t })\n}\n', 0],
    ["لا يحكم على تعليق",
     '// نُبقى general_manager هنا للتوثيق\nconst R = ["owner", "admin"]\n', 0],
    ["ولا يخدعه نصٌّ داخل سلسلةِ حروف",
     'const msg = "general_manager"\n', 1],
  ]
  let fail = 0
  for (const [name, src, expected] of cases) {
    const got = offences("selftest.ts", src).bad.length
    const ok = got === expected
    if (!ok) fail++
    console.log((ok ? "  ok  " : "  X   ") + name + "  (توقّعتُ " + expected + " فجاء " + got + ")")
  }
  if (fail > 0) { console.error("X سقط الفخُّ الذاتىّ فى " + fail + " اتّجاه."); process.exit(1) }
  console.log("  الفخُّ الذاتىّ: " + cases.length + " اتّجاهاً، كلُّها صحيحة.")
  process.exit(0)
}

if (process.argv.includes("--selftest")) selftest()

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

let bad = []
let notify = 0
let deliberate = 0
let dead = 0

for (const abs of files) {
  const rel = path.relative(ROOT, abs).split(path.sep).join("/")
  const raw = fs.readFileSync(abs, "utf8")
  if (raw.indexOf("general_manager") === -1) continue
  if (DEAD_FILES.indexOf(rel) !== -1) {
    dead += raw.split(/\r?\n/).filter((L) => L.indexOf("general_manager") !== -1).length
    continue
  }
  const r = offences(rel, raw)
  bad = bad.concat(r.bad)
  notify += r.notify
  deliberate += r.deliberate
}

console.log("  استثناءاتٌ معلَنة: إشعاراتٌ " + notify + " · غيرُ قابلٍ للبلوغ " + deliberate + " · ملفّاتٌ ميّتة " + dead)

if (bad.length > 0) {
  console.error("")
  console.error("X بابٌ يقبل general_manager ولا يقبل admin — ومن عُيّن «مدير عام» من الشاشة يُخزَّن admin:")
  for (const b of bad) console.error("   " + b.rel + ":" + b.line + "  " + b.text)
  console.error("")
  console.error("   العلاج: أضِف \"admin\" إلى القائمة نفسِها. ولو كانت قائمةَ إشعاراتٍ فلا تُضِف — راجع رأسَ هذا الملفّ.")
  process.exit(1)
}

console.log("  ok  لا بابَ بمفتاحين — كلُّ قائمةٍ تسمّى المديرَ العامَّ تقبل admin.")

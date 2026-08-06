#!/usr/bin/env node
/**
 * check-ps-path-is-literal.js
 * ---------------------------------------------------------------------------
 * v3.74.971 — القوسُ المعقوفُ فى المسار اسمٌ، لا نمطُ بحث.
 *
 * ═══ المرضُ الذى وُلد منه هذا الحارس ═══
 *
 * سكربتُ الدفع v3.74.971 توقّف قائلاً: «app/bills/[id]/page.tsx غير موجود» —
 * والملفُّ موجودٌ على القرص، قرأتُه بنفسى.
 *
 * السببُ أنّ PowerShell يعامل [ ] فى المسار **نمطَ بحث**: فـ [id] عنده يعنى
 * «حرفٌ واحدٌ إمّا i أو d»، لا مجلَّداً اسمُه [id]. ومشروعُ Next.js مبنىٌّ على
 * مجلَّداتٍ أسماؤها هكذا: [id] · [slug] … فكلُّ Test-Path أو Resolve-Path على
 * مسارٍ فيه قوسٌ معقوف **يكذب صامتاً** ويقول «غير موجود».
 *
 * وهذا ليس أوّلَ مرّة: فى push_v3.74.22-26.ps1 عولج الموضعُ الواحدُ بـ
 * -LiteralPath ثمّ لم يُصَر قاعدةً — فعاد المرضُ بعد مئاتِ الدفعات. مسكّنٌ
 * أُعطى مرّةً، والقاعدةُ لم تُكتب. فهذا الحارسُ هو كتابةُ القاعدة.
 *
 * ═══ الخاصّيّةُ الممنوعة (لا شكلُ نصّ) ═══
 *
 * أمرٌ من أوامر المسار فى PowerShell يأخذ مساراً **نصّاً صريحاً فيه مجموعةُ
 * أقواسٍ معقوفة** [ … ] بلا -LiteralPath.
 *
 * ولماذا الأقواسُ وحدَها دون * و ؟:
 *   لأنّ * و ? يُكتبان **عمداً** بحثاً عن عدّة ملفات (Get-ChildItem *.ps1)،
 *   فمنعُهما يصرخ على البرىء. أمّا [id] فى هذا المستودع فاسمُ مجلَّدٍ حقيقىّ
 *   لا نمطٌ يُقصد. وحارسٌ يصرخ على البرىء يُطفأ، ثمّ لا يحرس شيئاً.
 *
 * ═══ نطاقُه — سقّاطةٌ لا محاكمةٌ بأثرٍ رجعىّ ═══
 *
 * يحكم على سكربتات الدفع من الإصدار 3.74.971 فصاعداً (يُقرأ الرقمُ من اسم
 * الملفّ)، وعلى ما يُضاف إلى RATCHET صراحةً. وما عداها **معدودٌ لا مسكوتٌ
 * عنه**: يُطبع عددُه ليُعلم أنّه باقٍ.
 *
 * Usage: node scripts/check-ps-path-is-literal.js [--list] [--selftest]
 * Env:   PS_LITERAL_SCAN_ROOT — جذرٌ بديل (يستعمله الفخّ الذاتى).
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const path = require("path")
const os = require("os")

const ROOT = process.env.PS_LITERAL_SCAN_ROOT || process.cwd()
const VERBOSE = process.argv.includes("--list")
const SELFTEST = process.argv.includes("--selftest")

/** أوّلُ إصدارٍ يُحاسَب. ما قبله معدودٌ لا محكومٌ عليه. */
const BORN = [3, 74, 971]

/** ملفّاتٌ حُوّلت يدوياً وتُحاسَب مهما كان اسمُها. القائمةُ تكبر ولا تصغر. */
const RATCHET = []

/** أوامرُ PowerShell التى تأخذ مساراً. */
const CMDLETS = [
  "Test-Path", "Resolve-Path", "Get-Content", "Set-Content", "Add-Content",
  "Get-Item", "Get-ChildItem", "Remove-Item", "Copy-Item", "Move-Item",
  "Rename-Item", "New-Item", "Out-File", "Select-String", "Import-Csv",
  "Export-Csv", "Unblock-File",
]

/** يمحو تعليقات # خارج النصوص. التعليقُ ليس تعليمة. */
function stripComments(line) {
  let out = ""
  let q = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      out += c
      if (c === q) q = null
      continue
    }
    if (c === '"' || c === "'") { q = c; out += c; continue }
    if (c === "#") break
    out += c
  }
  return out
}

/** يقرأ رقمَ الإصدار من اسم سكربت الدفع. */
function releaseOf(name) {
  const m = /^push_v(\d+)\.(\d+)\.(\d+)/.exec(name)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function gte(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true
    if (a[i] < b[i]) return false
  }
  return true
}

/** أفيه مجموعةُ أقواسٍ معقوفة؟ */
function hasBracketGroup(s) {
  return /\[[^\]]*\]/.test(s)
}

/** يقرأ أوّلَ رمزٍ من نصّ الوسائط. */
function firstToken(region) {
  const s = region.replace(/^[\s(]+/, "")
  if (s.startsWith('"')) {
    const e = s.indexOf('"', 1)
    return e < 0 ? null : { kind: "lit", value: s.slice(1, e) }
  }
  if (s.startsWith("'")) {
    const e = s.indexOf("'", 1)
    return e < 0 ? null : { kind: "lit", value: s.slice(1, e) }
  }
  const v = /^\$([A-Za-z_][\w]*)/.exec(s)
  if (v) return { kind: "var", value: v[1] }
  const w = /^([^\s;|)]+)/.exec(s)
  if (w) return { kind: "bare", value: w[1] }
  return null
}

/** يجمع الإسنادات النصّيّة الصريحة: $x = "..." */
function literalVars(lines) {
  const map = new Map()
  for (const raw of lines) {
    const line = stripComments(raw)
    const m = /^\s*\$([A-Za-z_][\w]*)\s*=\s*(["'])([^"']*)\2\s*$/.exec(line)
    if (m) map.set(m[1].toLowerCase(), m[3])
  }
  return map
}

function inspectPs(src) {
  const lines = src.split(/\r?\n/)
  const vars = literalVars(lines)
  const hits = []

  for (let i = 0; i < lines.length; i++) {
    const line = stripComments(lines[i])
    for (const cmd of CMDLETS) {
      const re = new RegExp("(^|[\\s(|{;=])(" + cmd + ")\\b", "gi")
      let m
      while ((m = re.exec(line)) !== null) {
        const after = line.slice(m.index + m[0].length)
        // نهايةُ الجملة: | أو ; — وما بعدها ليس من وسائط هذا الأمر
        const region = after.split(/[;|]/)[0]
        if (/-LiteralPath\b/i.test(region)) continue

        // أين المسار؟ إمّا بعد -Path وإمّا أوّلُ رمزٍ ليس مفتاحاً
        let tokenSrc = null
        const pm = /-Path\s+/i.exec(region)
        if (pm) {
          tokenSrc = region.slice(pm.index + pm[0].length)
        } else {
          let rest = region
          // تخطَّ المفاتيحَ التى لا تأخذ قيمة، ومفاتيحَ ليست مساراً
          for (;;) {
            const sm = /^\s*-([A-Za-z]+)\b/.exec(rest)
            if (!sm) break
            const sw = sm[1].toLowerCase()
            rest = rest.slice(sm[0].length)
            // مفاتيحُ لها قيمةٌ ليست مساراً: تُتخطّى مع قيمتها
            if (["filter", "include", "exclude", "pattern", "encoding", "delimiter"].includes(sw)) {
              const t = firstToken(rest)
              if (t) {
                const cut = rest.replace(/^[\s(]+/, "")
                rest = cut.slice(t.kind === "lit" ? t.value.length + 2 : t.value.length + (t.kind === "var" ? 1 : 0))
              }
            }
          }
          tokenSrc = rest
        }
        if (tokenSrc === null) continue
        const tok = firstToken(tokenSrc)
        if (!tok) continue

        let value = null
        if (tok.kind === "lit") value = tok.value
        else if (tok.kind === "var") value = vars.has(tok.value.toLowerCase()) ? vars.get(tok.value.toLowerCase()) : null
        else if (tok.kind === "bare") value = tok.value
        if (value === null) continue

        if (hasBracketGroup(value)) {
          hits.push({ line: i + 1, cmd: m[2], value, text: lines[i].trim().slice(0, 140) })
        }
      }
    }
  }
  return hits
}

function check(root) {
  const problems = []
  const outOfScope = []
  let entries = []
  try { entries = fs.readdirSync(root, { withFileTypes: true }) } catch { return { problems: ["لا أستطيع قراءة الجذر: " + root], outOfScope: [] } }

  const ps1 = entries.filter((e) => e.isFile() && /\.ps1$/i.test(e.name)).map((e) => e.name)
  if (ps1.length === 0) return { problems: [], outOfScope: [] }

  for (const name of ps1) {
    const rel = releaseOf(name)
    const inScope = RATCHET.includes(name) || (rel !== null && gte(rel, BORN))
    if (!inScope) { outOfScope.push(name); continue }
    let src
    try { src = fs.readFileSync(path.join(root, name), "utf8") } catch { continue }
    for (const h of inspectPs(src)) {
      problems.push(
        name + " سطر " + h.line + ": " + h.cmd + " على مسارٍ فيه قوسٌ معقوف «" + h.value +
        "» بلا -LiteralPath — سيقول «غير موجود» وهو موجود."
      )
    }
  }
  return { problems, outOfScope }
}

// -- الفخُّ الذاتى ------------------------------------------------------------
const GOOD = [
  '$page = "app/bills/[id]/page.tsx"',
  'if (-not (Test-Path -LiteralPath $page)) { Fail "ناقص" }',
  'else { $t = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $page).Path) }',
  '$mig = Get-ChildItem -Path "supabase/migrations" -Filter "*v3_74_971*"',
  'Get-ChildItem *.ps1 | ForEach-Object { $_.Name }',
  '# Test-Path "app/bills/[id]/page.tsx"   <- ذكرٌ فى تعليق لا أمر',
  'if (Test-Path "lib/version.ts") { Pass "موجود" }',
].join("\n")

const BAD_LITERAL = [
  '$x = 1',
  'if (-not (Test-Path "app/bills/[id]/page.tsx")) { Fail "ناقص" }',
].join("\n")

const BAD_VAR = [
  '$page = "app/bills/[id]/page.tsx"',
  'if (-not (Test-Path $page)) { Fail "ناقص" }',
].join("\n")

const BAD_RESOLVE = [
  '$page = "app/purchase-orders/[id]/page.tsx"',
  '$t = ReadText((Resolve-Path $page).Path)',
].join("\n")

function seed(base, name, content) {
  fs.mkdirSync(base, { recursive: true })
  fs.writeFileSync(path.join(base, name), content)
}

function selftest() {
  const okDir = fs.mkdtempSync(path.join(os.tmpdir(), "pslit-ok-"))
  seed(okDir, "push_v3.74.971.ps1", GOOD)
  const p1 = check(okDir).problems.length === 0

  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "pslit-lit-"))
  seed(d2, "push_v3.74.971.ps1", BAD_LITERAL)
  const p2 = check(d2).problems.length > 0

  const d3 = fs.mkdtempSync(path.join(os.tmpdir(), "pslit-var-"))
  seed(d3, "push_v3.74.972.ps1", BAD_VAR)
  const p3 = check(d3).problems.length > 0

  const d4 = fs.mkdtempSync(path.join(os.tmpdir(), "pslit-res-"))
  seed(d4, "push_v3.74.971.ps1", BAD_RESOLVE)
  const p4 = check(d4).problems.length > 0

  // خارجَ النطاق: سكربتٌ قديم بنفس العيب — يُعدّ ولا يُحاكَم
  const d5 = fs.mkdtempSync(path.join(os.tmpdir(), "pslit-old-"))
  seed(d5, "push_v3.74.22-26.ps1", BAD_LITERAL)
  const r5 = check(d5)
  const p5 = r5.problems.length === 0 && r5.outOfScope.length === 1

  console.log((p1 ? "  ok  " : "  X   ") + "يمرّ على -LiteralPath، ولا يصرخ على * المقصودة ولا على تعليق")
  console.log((p2 ? "  ok  " : "  X   ") + "يرفض المسارَ النصّىَّ ذا القوس المعقوف")
  console.log((p3 ? "  ok  " : "  X   ") + "يتتبّع المتغيّرَ إلى نصّه ويرفضه")
  console.log((p4 ? "  ok  " : "  X   ") + "يرفض Resolve-Path المتداخل داخل قوسين")
  console.log((p5 ? "  ok  " : "  X   ") + "لا يحاكم ما قبل 3.74.971 بأثرٍ رجعىّ بل يعدّه")

  for (const d of [okDir, d2, d3, d4, d5]) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* لا يهمّ */ }
  }
  return p1 && p2 && p3 && p4 && p5
}

if (SELFTEST) {
  console.log("# الفخُّ الذاتى - check-ps-path-is-literal")
  process.exit(selftest() ? 0 : 1)
}

const res = check(ROOT)
if (res.problems.length === 0) {
  if (VERBOSE) {
    console.log("ok - كلُّ مسارٍ ذى قوسٍ معقوف فى سكربتات الدفع المحاسَبة يستعمل -LiteralPath.")
    console.log("     خارجَ النطاق (معدودٌ لا مسكوتٌ عنه): " + res.outOfScope.length + " سكربتاً أقدمَ من 3.74.971.")
  }
  process.exit(0)
}

console.error("")
console.error("X القوسُ المعقوفُ فى المسار عاد نمطَ بحث.")
console.error("")
for (const p of res.problems) console.error("  - " + p)
console.error("")
console.error("  العلاج: -LiteralPath مع Test-Path و Resolve-Path وأخواتهما.")
console.error("")
process.exit(1)

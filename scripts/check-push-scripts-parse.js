#!/usr/bin/env node
/**
 * check-push-scripts-parse.js — **ولا يُرسَلُ سكربتُ دفعٍ لم يمرَّ على محلِّلِ اللغة.**
 * ---------------------------------------------------------------------------
 *   node scripts/check-push-scripts-parse.js [--selftest]
 *
 * ═══ الحادثةُ التى وُلد منها هذا الحارس — دفعةُ v3.75.29 ═══
 *
 *     At push_v3.75.29.ps1:157 char:38
 *     +   "written in v3.75.27's own hand: \"a declared debt, ...
 *     +                                      ~
 *     Unexpected token 'a' in expression or statement.
 *
 * كُتبت `\"` داخلَ نصٍّ فى PowerShell — **وPowerShell لا يعرفُ الشرطةَ المائلةَ
 * حرفَ هروب**. فسقطَ السكربتُ **عندَ التحليلِ قبلَ أن ينفّذَ سطراً واحداً**،
 * وكانت الدفعةُ كلُّها جاهزة.
 *
 * والعطبُ لم يكنِ الحرفَ بل أنّ **صاحبَ المشروعِ كان أوّلَ من يشغّلُ السكربت**:
 * يُكتَبُ ثمّ يُرسَلُ ثمّ يُجرَّبُ عندَه. **وحارسٌ يُكتَشَفُ عطبُه على المستخدِمِ
 * ليس حارساً.** فصار لكلِّ سكربتِ دفعٍ محلِّلٌ يقرؤُه قبلَ أن يصلَ إليه.
 *
 * ═══ ولا يُبنى بيتٌ ثانٍ ═══
 *
 * لا يُعادُ هنا تأليفُ قواعدِ لغةِ PowerShell — **البيتُ الوحيدُ الذى يعرفُ
 * هل النصُّ PowerShell سليمٌ هو محلِّلُ PowerShell نفسُه**:
 * `[System.Management.Automation.Language.Parser]::ParseInput`.
 * ويُنادى **مرّةً واحدةً** لكلِّ السكربتات، فلا يُثقِلُ الطابور.
 *
 * ═══ ولا يُحاكَمُ ما قبلَ الولادةِ بأثرٍ رجعىّ ═══
 *
 * القاعدةُ وُلدت فى 3.75.30. فما قبلَها **يُعدُّ ولا يُحاكَم** — لأنّ سكربتاتِ
 * الدفعِ القديمةَ سجلٌّ يحكى ما كان، ومحاكمتُها اليومَ تُوقفُ دفعةً بريئةً على
 * تاريخٍ لا يُشغَّلُ ثانية. **ومعدودٌ لا مسكوتٌ عنه.**
 *
 * ═══ وفحصٌ يمكن تخطّيه ليس فحصاً ═══
 *
 * إن لم يُوجَدْ محلِّلٌ على هذا الجهاز **رفضَ الحارسُ ولم يمرّ**: الجهازُ الذى
 * لا يستطيعُ تحليلَ PowerShell لا يستطيعُ تشغيلَ سكربتِ الدفعِ أصلاً، فالصمتُ
 * هنا **طمأنينةٌ كاذبة**.
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawnSync } = require("child_process")

const BORN = [3, 75, 30]
const ROOT = process.cwd()

/** رقمُ الإصدار من اسم الملفّ: push_v3.75.30.ps1 → [3,75,30] */
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

/**
 * **المحلِّلُ يُعرَفُ بقدرتِه لا باسمِه**: يُجرَّبُ كلُّ اسمٍ معروفٍ ويُقبَلُ
 * أوّلُ من يُثبتُ أنّه يحلّل. فلا يُفترَضُ ويندوز ولا لينكس.
 */
function findPowerShell() {
  for (const exe of ["pwsh", "pwsh.exe", "powershell", "powershell.exe", "/opt/pwsh/pwsh"]) {
    const r = spawnSync(exe, ["-NoProfile", "-Command", "exit 0"], { timeout: 30000 })
    if (r.status === 0) return exe
  }
  return null
}

/** نصُّ المحلِّل: يقرأُ كلَّ ملفٍّ يُمرَّرُ إليه ويقولُ حكمَه سطراً سطراً. */
const PARSER_PS = [
  "$ErrorActionPreference = 'Stop'",
  "$bad = 0",
  "foreach ($p in $args) {",
  "  $t = [System.IO.File]::ReadAllText($p)",
  "  $e = $null",
  "  [void][System.Management.Automation.Language.Parser]::ParseInput($t, [ref]$null, [ref]$e)",
  "  $n = [System.IO.Path]::GetFileName($p)",
  "  if ($e -and $e.Count -gt 0) {",
  "    $bad = $bad + 1",
  "    Write-Output ('BAD|' + $n + '|' + $e[0].Extent.StartLineNumber + '|' + $e[0].Message)",
  "  } else { Write-Output ('OK|' + $n) }",
  "}",
  "Write-Output ('TOTAL|' + $bad)",
].join("\n")

/**
 * يحلّلُ الملفّاتِ المُمرَّرةَ بنداءٍ واحد. يعيدُ {ok, bad:[{name,line,message}]}
 * أو {error} إن تعذّرَ التحليلُ أصلاً.
 */
function parseAll(exe, files) {
  if (files.length === 0) return { ok: [], bad: [] }
  const helper = path.join(os.tmpdir(), "erb_ps_parse_" + process.pid + ".ps1")
  fs.writeFileSync(helper, PARSER_PS, "utf8")
  let r
  try {
    r = spawnSync(exe, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", helper].concat(files), {
      encoding: "utf8", timeout: 120000,
    })
  } finally {
    try { fs.unlinkSync(helper) } catch { /* لا يهمّ */ }
  }
  if (!r || r.status === null || typeof r.stdout !== "string") {
    return { error: (r && r.stderr) || "لم يُجبِ المحلِّل" }
  }
  const ok = []
  const bad = []
  let total = null
  for (const raw of r.stdout.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split("|")
    if (parts[0] === "OK") ok.push(parts[1])
    else if (parts[0] === "BAD") bad.push({ name: parts[1], line: parts[2], message: parts.slice(3).join("|") })
    else if (parts[0] === "TOTAL") total = Number(parts[1])
  }
  // **ولا يُقرأُ فراغٌ ويُسمّى سلاماً**: لو لم يقلِ المحلِّلُ حكمَه على كلِّ ملفّ.
  if (total === null || ok.length + bad.length !== files.length) {
    return { error: "المحلِّلُ لم يحكمْ على كلِّ ملفّ (" + (ok.length + bad.length) + " من " + files.length + ")" }
  }
  return { ok, bad }
}

// ───────────────────────────── الفخُّ الذاتىّ ─────────────────────────────
// **وفخٌّ لا يُشغَّل ليس فخّاً**: يُكتَبُ سكربتٌ معطوبٌ عمداً — بنفسِ العطبِ
// الذى وقع — وسكربتٌ سليم، ويُطلَبُ من المحلِّلِ الحكمُ عليهما.

if (process.argv.includes("--selftest")) {
  const exe = findPowerShell()
  if (!exe) {
    console.error("X لا محلِّلَ PowerShell على هذا الجهاز — ولا يُقاسُ فخٌّ بلا أداةٍ يقيسُ بها.")
    process.exit(1)
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "erb_ps_selftest_"))
  const broken = path.join(dir, "push_v9.9.9.ps1")
  const sound = path.join(dir, "push_v9.9.8.ps1")
  // العطبُ بعينِه: شرطةٌ مائلةٌ تُستعمَلُ حرفَ هروبٍ داخلَ نصٍّ مزدوج.
  fs.writeFileSync(broken, '$m = @(\n  "he said: \\"yes\\" and left",\n)\n', "utf8")
  fs.writeFileSync(sound, "$m = @(\n  'he said: \"yes\" and left'\n)\nWrite-Host $m\n", "utf8")

  const res = parseAll(exe, [broken, sound])
  let bad = 0
  const t = (label, got, exp) => {
    const ok = JSON.stringify(got) === JSON.stringify(exp)
    if (!ok) bad++
    console.log((ok ? "  ok  " : "  X   ") + label + "  (توقّعتُ " + JSON.stringify(exp) + " فجاء " + JSON.stringify(got) + ")")
  }

  t("يجدُ محلِّلاً بقدرتِه لا باسمِه", typeof exe === "string" && exe.length > 0, true)
  t("ولا عطبَ فى النداءِ نفسِه", res.error === undefined, true)
  t("ويرى السكربتَ المعطوبَ بعينِه", (res.bad || []).map((b) => b.name), ["push_v9.9.9.ps1"])
  t("ويقولُ رقمَ السطر", Number((res.bad || [{}])[0].line) > 0, true)
  t("ولا يصرخُ على السليم", (res.ok || []).indexOf("push_v9.9.8.ps1") !== -1, true)
  t("ويحكمُ على كلِّ ملفٍّ مُرَّرَ إليه", (res.ok || []).length + (res.bad || []).length, 2)

  t("ويحاكمُ ما وُلد بعدَ القاعدة", isOlderThanBorn(versionOf("push_v3.75.30.ps1")), false)
  t("ولا يحاكمُ ما قبلَها بأثرٍ رجعىّ", isOlderThanBorn(versionOf("push_v3.75.29.ps1")), true)
  t("ولا يخدعه اسمٌ ليس سكربتَ دفع", versionOf("deploy-fix.ps1"), null)
  t("ويقرأُ الاسمَ الممتدَّ أيضاً", isOlderThanBorn(versionOf("push_v3.74.22-25.ps1")), true)

  try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* لا يهمّ */ }
  if (bad > 0) { console.error("X سقط الفخُّ الذاتىّ فى " + bad + " اتّجاه."); process.exit(1) }
  console.log("  الفخُّ الذاتىّ: 10 اتّجاهاتٍ، كلُّها صحيحة.")
  process.exit(0)
}

// ───────────────────────────── التشغيل ─────────────────────────────

let names = []
try {
  names = fs.readdirSync(ROOT).filter((f) => /^push_v.*\.ps1$/i.test(f))
} catch { names = [] }

const judged = []
let counted = 0
for (const name of names.sort()) {
  if (isOlderThanBorn(versionOf(name))) { counted++; continue }
  judged.push(path.join(ROOT, name))
}

console.log(
  "  سكربتات دفعٍ تُحلَّل: " + judged.length +
  "  ·  أقدمُ من 3.75.30 فتُعدّ ولا تُحاكم: " + counted
)

if (judged.length === 0) {
  console.log("+ لا سكربتَ دفعٍ جديداً يُحلَّل.")
  process.exit(0)
}

const exe = findPowerShell()
if (!exe) {
  console.error(
    "X لا محلِّلَ PowerShell على هذا الجهاز — ولا يُقالُ «سليم» لسكربتٍ لم يُقرَأ.\n" +
    "  والجهازُ الذى لا يحلّلُ PowerShell لا يشغّلُ سكربتَ الدفعِ أصلاً."
  )
  process.exit(1)
}

const res = parseAll(exe, judged)
if (res.error) {
  console.error("X تعذّرَ تحليلُ سكربتاتِ الدفع: " + String(res.error).split("\n")[0])
  process.exit(1)
}
if (res.bad.length > 0) {
  console.error("X " + res.bad.length + " سكربتَ دفعٍ لا يُحلَّل — يسقطُ قبلَ أن ينفّذَ سطراً:\n")
  for (const b of res.bad) console.error("  - " + b.name + "  سطر " + b.line + ": " + b.message)
  console.error(
    "\n  وPowerShell لا يعرفُ الشرطةَ المائلةَ حرفَ هروب: تُكتَبُ العلامةُ المزدوجةُ\n" +
    "  داخلَ نصٍّ مزدوجٍ بمضاعفتِها (\"\") أو بالعلامةِ الخلفيّة، ويُفضَّلُ نصٌّ مفردٌ\n" +
    "  ('...') فهو لا يفسّرُ شيئاً — والعلامةُ المفردةُ داخلَه تُضاعَف ('')."
  )
  process.exit(1)
}

console.log("+ كلُّ سكربتِ دفعٍ محكومٍ يُحلَّلُ بلا خطأ (" + res.ok.length + " سكربتاً، بمحلِّلِ PowerShell نفسِه).")

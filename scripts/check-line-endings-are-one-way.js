#!/usr/bin/env node
/**
 * check-line-endings-are-one-way.js
 * ---------------------------------------------------------------------------
 * v3.74.943 — **نهاياتُ السطور واحدة، فتصير كلمةُ «معدَّل» تعنى معدَّلاً.**
 *
 * قِيس قبل هذا الإصدار: ٣٦٤٢ ملفاً متتبَّعاً، **ولا `.gitattributes`**،
 * و`core.autocrlf` غيرُ مضبوطٍ فى أى نطاق. فـ٢٥٣٨ ملفاً تظهر «معدَّلة» فى
 * كل تشغيلة بفرقٍ بحجم الملف كلِّه.
 *
 * وهذا ليس إزعاجاً تجميلياً. **الفرقُ الحقيقىُّ يمرّ من تحت الضجيج** — وخطأ
 * 938 الذى أفرغ قائمةَ فواتير الشراء على المستخدمين مرّ من هنا بعينه.
 *
 * ═══ وهذا الحارسُ يقيس الفهرسَ لا مجلد العمل ═══
 *
 * `git ls-files --eol` يقول ما هو **مخزَّنٌ فى git** (`i/…`) وما هو **فى
 * القرص** (`w/…`). والذى يهمّ هنا الأولُ: مجلدُ العمل على ويندوز سيبقى
 * CRLF بعد الخروج، **وهذا هو المقصود** — الاتفاقُ على ما يُخزَّن لا على ما
 * يُكتب على القرص.
 *
 * ثلاثةُ أسئلة:
 *   ‏(أ) هل القاعدةُ مكتوبة؟ `* text=auto eol=lf` فى `.gitattributes`.
 *   ‏(ب) هل بقى ملفٌ مخزَّنٌ CRLF؟ **سقّاطة: تنقص ولا تزيد.**
 *   ‏(ج) هل ظهر ملفُ UTF-16 جديد؟ الأربعةَ عشرَ مثبَّتةٌ بالاسم، ولا يُزاد.
 *
 * ولا يحتاج قاعدةَ بيانات: يقرأ git وحده.
 *
 * Usage: node scripts/check-line-endings-are-one-way.js [--list]
 * ---------------------------------------------------------------------------
 */
const { execFileSync } = require("child_process")
const fs = require("fs")
const path = require("path")

const verbose = process.argv.includes("--list")
const ROOT = process.env.LINE_ENDING_SCAN_ROOT || process.cwd()

const problems = []
const notes = []

/** القاعدةُ التى لا يجوز أن تختفى. */
const RULE = "* text=auto eol=lf"

/**
 * ملفاتُ UTF-16 المعروفة (ناتجُ إعادةِ توجيهٍ من PowerShell).
 *
 * **تنقص ولا تزيد.** وكلُّها ملفاتُ تشخيصٍ قديمةٌ لا مصدرٌ للبرنامج —
 * دَينٌ مُسجَّل: مكانُها خارجَ المستودع. وتسميتُها هنا تمنع إفسادَها اليوم،
 * **ولا تباركُ بقاءها**.
 */
const PINNED_UTF16 = [
  "DEPLOYMENT_COMPLETE.md",
  "ap_breakdown.txt",
  "check_bills.sql",
  "check_triggers.sql",
  "diff.txt",
  "get_func.sql",
  "get_func_list.sql",
  "jes_output.json",
  "out.txt",
  "output2.txt",
  "output3.txt",
  "output4.txt",
  "supabase_mig_err.txt",
  "test-supplier.js",
]

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
}

// ── (أ) القاعدةُ مكتوبة ────────────────────────────────────────────────────
const attrPath = path.join(ROOT, ".gitattributes")
if (!fs.existsSync(attrPath)) {
  problems.push(
    "there is no .gitattributes - every checkout decides line endings for itself, and " +
    "thousands of files read as modified when nothing changed.")
} else {
  const attrs = fs.readFileSync(attrPath, "utf8")
  const bare = attrs.split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n")
  if (!bare.includes(RULE)) {
    problems.push(`.gitattributes no longer carries the one rule: \`${RULE}\``)
  }
  for (const f of PINNED_UTF16) {
    if (!bare.includes(f)) {
      problems.push(
        `${f} is a UTF-16 file but is no longer named in .gitattributes - git's implicit ` +
        `detection would be the only thing protecting it, and that changes when the file is re-saved.`)
    }
  }
}

// ── (ب) والفهرسُ يُقاس ────────────────────────────────────────────────────
let eol = ""
try {
  eol = git(["ls-files", "--eol"])
} catch (e) {
  console.error(`X could not read git ls-files --eol: ${e.message}`)
  process.exit(1)
}

const rows = eol.split("\n").filter(Boolean).map((line) => {
  // i/lf    w/crlf  attr/text=auto eol=lf<TAB>path/with spaces
  //
  // ⚠️ **حقلُ الصفات يحوى مسافة** («text=auto eol=lf»)، فتقسيمُه بالمسافات
  // يبتلع أولَ كلمةٍ منه ويُلحق الباقىَ بالمسار. أمسك الفخُّ هذا: ملفُ
  // UTF-16 مزروعٌ لم يُبلَّغ عنه لأن الحارسَ ذهب يقرأ ملفاً بالاسم
  // «eol=lf \tsneaky.ts» فلم يجده، **فمرّ بصمت**. والفاصلُ الموثوق هو
  // المِفتاحُ (TAB): كلُّ ما بعده مسارٌ حرفياً.
  const tab = line.indexOf("\t")
  if (tab < 0) return null
  const file = line.slice(tab + 1)
  const m = /^(\S+)\s+(\S+)\s+(.*)$/.exec(line.slice(0, tab))
  return m ? { index: m[1], work: m[2], attr: m[3].trim(), file } : null
}).filter(Boolean)

const storedCrlf = rows.filter((r) => r.index === "i/crlf")
const binaries = rows.filter((r) => r.index === "i/-text")

for (const r of storedCrlf) {
  problems.push(`${r.file} is stored with CRLF in the index - the normalisation missed it, or it came back.`)
}

// ── (ج) ولا ملفَ UTF-16 جديد ──────────────────────────────────────────────
const newUtf16 = []
for (const r of binaries) {
  let head
  try { head = fs.readFileSync(path.join(ROOT, r.file)).subarray(0, 2).toString("hex") } catch { continue }
  if (head !== "fffe" && head !== "feff") continue
  if (!PINNED_UTF16.includes(r.file)) newUtf16.push(r.file)
}
for (const f of newUtf16) {
  problems.push(
    `${f} is a NEW UTF-16 file - it is unreadable to every text guard in this repo ` +
    `(a regex over it matches nothing, and the guard passes in silence).`)
}

// ── التقرير ───────────────────────────────────────────────────────────────
const census = rows.reduce((acc, r) => { acc[r.index] = (acc[r.index] || 0) + 1; return acc }, {})
notes.push(
  `${rows.length} tracked file(s): ` +
  Object.entries(census).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(", ") + ".")
notes.push(
  `${PINNED_UTF16.length} pinned UTF-16 file(s) remain - diagnostic output that belongs outside the ` +
  `repository, named so it cannot be corrupted and cannot grow.`)

if (verbose) {
  for (const r of storedCrlf) console.log(`  stored CRLF: ${r.file}`)
  for (const f of PINNED_UTF16) console.log(`  pinned UTF-16: ${f}`)
}

if (problems.length > 0) {
  console.error("X line endings are not one way:")
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
for (const n of notes) console.log(`  ${n}`)
console.log(
  "+ line endings are one way: the rule is written down, ZERO files are stored with CRLF, " +
  "and no new UTF-16 file has appeared - so \"modified\" means modified.")

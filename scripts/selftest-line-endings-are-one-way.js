#!/usr/bin/env node
/**
 * selftest-line-endings-are-one-way.js
 * ---------------------------------------------------------------------------
 * v3.74.943 — يُرى الحارسُ وهو يرفض، **وهو يُبقى الحالَ الصحيحة**.
 *
 * ولا يُزرع شىءٌ فى مستودع المشروع: يُبنى **مستودعٌ مؤقتٌ كامل** فى مجلدٍ
 * مؤقت، ويُوجَّه إليه الحارسُ بـ`LINE_ENDING_SCAN_ROOT`. فلا فهرسَ يُلمس،
 * ولا قفلَ يُترك، ولا ملفَ فى الشجرة يُنتظر أن يُنظَّف بعد الفحص.
 *
 *   ‏(أ) لا `.gitattributes` إطلاقاً            ⇒ يُرفض.
 *   ‏(ب) القاعدةُ حُذفت من الملف                ⇒ يُرفض.
 *   ‏(ج) ملفٌ مخزَّنٌ CRLF فى الفهرس            ⇒ يُرفض (السقّاطة عادت).
 *   ‏(د) ملفُ UTF-16 جديدٌ غيرُ مثبَّت           ⇒ يُرفض — **وهذا أخبثُها**:
 *       الملفُ يبدو نصاً للعين، وكلُّ حارسٍ نصّىٍّ فى المستودع يقرؤه فراغاً
 *       فيمرّ بصمت.
 *   ‏(هـ) ملفٌ مثبَّتٌ بترميز UTF-16            ⇒ **يُترك** (وإلا رفض البرىء).
 *   ‏(و) الحالُ الصحيحة                          ⇒ يصمت.
 *
 * Usage: node scripts/selftest-line-endings-are-one-way.js
 * ---------------------------------------------------------------------------
 */
const { execFileSync, spawnSync } = require("child_process")
const fs = require("fs")
const os = require("os")
const path = require("path")

// v3.75.81 — والزرعُ يُثبَتُ قبلَ الحُكم: قاعدةٌ فى `.gitattributes` قد تُعادُ
// صياغتُها يوماً، فلا يجوزُ أن يُضعِفَها الفخُّ فى الظاهرِ ولا يُضعِفُ شيئاً.
const { plantedText } = require("./lib/selftest-plant")

const GUARD = path.join(process.cwd(), "scripts", "check-line-endings-are-one-way.js")
const ATTRS = path.join(process.cwd(), ".gitattributes")

if (!fs.existsSync(GUARD)) { console.error(`X ${GUARD} does not exist - nothing to prove.`); process.exit(1) }
if (!fs.existsSync(ATTRS)) { console.error("X .gitattributes does not exist - nothing to copy from."); process.exit(1) }

const realAttrs = fs.readFileSync(ATTRS, "utf8")

let ok = true

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
}

/** مستودعٌ نظيفٌ بقواعد المشروع نفسِها، فى مجلدٍ مؤقت. */
function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eol-selftest-"))
  git(root, ["init", "-q"])
  git(root, ["config", "user.email", "selftest@local"])
  git(root, ["config", "user.name", "selftest"])
  // لا `core.autocrlf`: نفسُ حال المشروع، فالقياسُ على نفس النطاق.
  fs.writeFileSync(path.join(root, ".gitattributes"), realAttrs)
  fs.writeFileSync(path.join(root, "plain.ts"), "const a = 1\nconst b = 2\n")
  git(root, ["add", "-A"])
  git(root, ["commit", "-qm", "base"])
  return root
}

function runGuard(root) {
  const r = spawnSync(process.execPath, [GUARD], {
    encoding: "utf8",
    env: { ...process.env, LINE_ENDING_SCAN_ROOT: root },
    cwd: root,
  })
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

function stage(title, mutate, needle, expectRefusal = true) {
  if (!ok) return
  const root = makeRepo()
  try {
    mutate(root)
    const r = runGuard(root)
    if (expectRefusal) {
      if (!r.failed || !new RegExp(needle).test(r.output)) {
        console.error(`X ${title}: the guard did NOT refuse (looked for /${needle}/).`)
        console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
        ok = false
      } else console.log(`+ ${title}: رُفض كما يجب`)
    } else {
      if (r.failed) {
        console.error(`X ${title}: the guard refused something it must spare.`)
        console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
        ok = false
      } else console.log(`+ ${title}: لم يُبلَّغ عنه كما يجب`)
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

/** يكتب ملفاً ويُدرجه فى الفهرس **بلا تطبيع** — فيُخزَّن كما هو حرفياً. */
function commitRaw(root, rel, buf) {
  fs.writeFileSync(path.join(root, rel), buf)
  // `-text` يمنع أى تحويل عند الإضافة، فيدخل الفهرسَ ببايتاته.
  const attrs = fs.readFileSync(path.join(root, ".gitattributes"), "utf8")
  fs.writeFileSync(path.join(root, ".gitattributes"), attrs + `\n${rel} -text\n`)
  git(root, ["add", "-A"])
  git(root, ["commit", "-qm", `add ${rel}`])
  // ثم تُعاد القواعدُ كما كانت: الملفُ باقٍ فى الفهرس ببايتاته، وقد صار
  // خاضعاً للقاعدة العامة مرةً أخرى — وهو بالضبط شكلُ «ملفٍ نجا من التطبيع».
  fs.writeFileSync(path.join(root, ".gitattributes"), attrs)
  git(root, ["add", ".gitattributes"])
  git(root, ["commit", "-qm", "restore attrs"])
}

;(async () => {
  // (أ)
  stage("no .gitattributes at all",
    (root) => { fs.rmSync(path.join(root, ".gitattributes")); git(root, ["add", "-A"]); git(root, ["commit", "-qm", "drop"]) },
    "there is no .gitattributes")

  // (ب)
  stage("the one rule deleted from .gitattributes",
    (root) => {
      const a = plantedText(
        fs.readFileSync(path.join(root, ".gitattributes"), "utf8"),
        "* text=auto eol=lf", "# removed", "إضعافُ القاعدةِ الواحدةِ فى .gitattributes")
      fs.writeFileSync(path.join(root, ".gitattributes"), a)
      git(root, ["add", "-A"]); git(root, ["commit", "-qm", "weaken"])
    },
    "no longer carries the one rule")

  // (ج)
  stage("a file stored with CRLF in the index",
    (root) => commitRaw(root, "regressed.ts", Buffer.from("const a = 1\r\nconst b = 2\r\n", "utf8")),
    "stored with CRLF in the index")

  // (د) الأخبث: يبدو نصاً، ولا يقرؤه حارسٌ نصّى.
  stage("a NEW UTF-16 file nobody pinned",
    (root) => commitRaw(root, "sneaky.ts", Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("const a = 1\n", "utf16le")])),
    "is a NEW UTF-16 file")

  // (هـ) البرىء: ملفٌ مثبَّتٌ بالاسم، بنفس الترميز.
  stage("a PINNED UTF-16 file, exactly as it is today",
    (root) => commitRaw(root, "out.txt", Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("probe\n", "utf16le")])),
    "", false)

  // (و) الحالُ الصحيحة.
  stage("a clean repository under the project's own rules", () => {}, "", false)

  if (!ok) process.exit(1)
  console.log("+ the line-ending guard is proven refusing a missing rule, a weakened rule, a file that")
  console.log("  regressed to CRLF in the index, and a new UTF-16 file that every text guard would read")
  console.log("  as empty - while sparing the pinned ones and a clean tree. No file in this repository")
  console.log("  was touched: every shape was planted in a throwaway repository of its own.")
})()

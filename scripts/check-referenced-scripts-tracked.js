#!/usr/bin/env node
/**
 * v3.74.828 — كل سكربت يعتمد عليه package.json أو الـCI يجب أن يكون داخل git.
 *
 * **الحادثة التى وُلد منها هذا الفحص:**
 *   وظيفة `AI Governance Audit` فى الـCI ظلت تفشل، ومعها يُتخطى النشر —
 *   لا لعطب فى الكود، بل لأن `scripts/ai-governance-audit.js` **لم يُضف إلى
 *   git أصلاً**. يعمل على جهاز المطور، ويختفى على خادم البناء:
 *       Error: Cannot find module '.../scripts/ai-governance-audit.js'
 *
 * **ولماذا لم يُضف؟** لأن سكربتات النشر عندنا تستخدم `git add -- <ملفات
 * محددة>` عمداً — وهو انضباط أنقذنا مراراً من رفع نسخة احتياطية أو ملف
 * أسرار. لكن ثمنه أن أى ملف **جديد** لا يذكره أحد فى القائمة يسقط صامتاً.
 * الانضباط سليم؛ الناقص كان حارساً يمسك ما يسقط منه.
 *
 * يفحص هذا السكربت كل ملف يناديه:
 *   - أمر فى `package.json` → `node|tsx|ts-node <file>`
 *   - خطوة فى `.github/workflows/*.yml` → `node <file>`
 * ويفشل إن كان الملف موجوداً على القرص لكنه غير متتبَّع فى git، أو مذكوراً
 * ولا وجود له إطلاقاً.
 */
const fs = require("fs")
const path = require("path")
const { execFileSync } = require("child_process")

const root = path.resolve(__dirname, "..")
const refs = new Map() // file -> where it was referenced

function note(file, where) {
  if (!refs.has(file)) refs.set(file, new Set())
  refs.get(file).add(where)
}

const SCRIPT_RE = /(?:^|[\s"'=])(?:node|tsx|ts-node)\s+([\w./-]+\.(?:js|mjs|cjs|ts))/g

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
  for (const m of String(cmd).matchAll(SCRIPT_RE)) note(m[1], `package.json → ${name}`)
}

const wfDir = path.join(root, ".github", "workflows")
if (fs.existsSync(wfDir)) {
  for (const f of fs.readdirSync(wfDir).filter((x) => /\.ya?ml$/.test(x))) {
    const src = fs.readFileSync(path.join(wfDir, f), "utf8")
    for (const m of src.matchAll(SCRIPT_RE)) note(m[1], `.github/workflows/${f}`)
  }
}

// v3.74.832 — لا السكربتات وحدها: **ما تقرؤه** أيضاً.
//
// بعد رفع `ai-governance-audit.js` (828) فشل الـCI مرة أخرى — هذه المرة
// لأن السكربت يقرأ `knowledge/api/routes.md` وهو غير مرفوع كذلك:
//     ENOENT: no such file or directory, open '.../knowledge/api/routes.md'
// السكربت وصل، ومدخلاته لم تصل. فالفحص يشمل الآن ملفات البيانات التى
// تذكرها السكربتات نصاً (knowledge/ · docs/ · supabase/schema/).
// الشرطة البادئة اختيارية: المراجع تُكتب غالباً `root + "/knowledge/…"`.
const DATA_REF_RE = /["'`]\.?\/?((?:knowledge|docs|supabase\/schema)\/[\w./-]+\.\w{2,4})["'`]/g
const scriptsDir = path.join(root, "scripts")
if (fs.existsSync(scriptsDir)) {
  const walkScripts = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { walkScripts(p); continue }
      if (!/\.(js|mjs|cjs)$/.test(e.name)) continue
      // تُجرَّد التعليقات أولاً: التعليق الشارح يقتبس المسار ليشرحه، فيلتقطه
      // البحث ويُبلّغ عن مرجع لا وجود له فى الكود. (فخ التعليق — سادس مرة
      // فى هذا المشروع؛ القاعدة: افحص الكود، لا ما يُقال عنه.)
      const src = fs.readFileSync(p, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/.*$/gm, "$1")
      for (const m of src.matchAll(DATA_REF_RE)) {
        note(m[1], `${path.relative(root, p)} reads it`)
      }
    }
  }
  walkScripts(scriptsDir)
}

function isTracked(rel) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", rel], { cwd: root, stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

const missing = []
const untracked = []

for (const [rel, wheres] of refs) {
  const abs = path.join(root, rel)
  const where = [...wheres].join(", ")
  if (!fs.existsSync(abs)) {
    missing.push({ rel, where })
  } else if (!isTracked(rel)) {
    untracked.push({ rel, where })
  }
}

if (untracked.length === 0 && missing.length === 0) {
  console.log(`+ All ${refs.size} referenced scripts exist and are tracked by git.`)
  process.exit(0)
}

if (untracked.length > 0) {
  console.error(`\nX ${untracked.length} file(s) exist locally but are NOT tracked by git.`)
  console.error("  CI will fail (MODULE_NOT_FOUND for a script, ENOENT for a data file),")
  console.error("  and the deploy job will be skipped with it:\n")
  for (const u of untracked) console.error(`    ${u.rel}\n      referenced by: ${u.where}`)
  console.error("\n  Fix: git add " + untracked.map((u) => u.rel).join(" "))
}

if (missing.length > 0) {
  console.error(`\nX ${missing.length} script(s) are referenced but do not exist at all:\n`)
  for (const m of missing) console.error(`    ${m.rel}\n      referenced by: ${m.where}`)
}

process.exit(1)

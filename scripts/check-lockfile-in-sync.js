#!/usr/bin/env node
/**
 * v3.74.831 — package.json و package-lock.json يجب أن يتحركا معاً.
 *
 * **الحادثة**: الـCI يفشل عند `npm ci`:
 *     `npm ci` can only install packages when your package.json and
 *     package-lock.json are in sync.
 *     Missing: pg@8.22.0 from lock file
 *
 * الحزمة `pg` أُضيفت إلى `package.json` ورُفعت، بينما `package-lock.json`
 * ظل معدَّلاً **محلياً بـ77 سطراً لم تُرفع قط**. و`npm ci` — على عكس
 * `npm install` — يرفض أى تفاوت، فيسقط البناء كله قبل أن يبدأ.
 *
 * **وهذه ثالث صورة لنفس الجذر فى يومين**: سكربتات النشر تستخدم
 * `git add -- <ملفات محددة>` (انضباط يمنع رفع النسخ الاحتياطية والأسرار،
 * ويُحفظ)، لكنه **يُسقط صامتاً كل ملف لا يذكره أحد**. أُصيب به:
 *   1. `scripts/ai-governance-audit.js` — لم يُرفع أصلاً (828)
 *   2. `scripts/check-phantom-columns.js` — أمسكه الحارس قبل النشر (830)
 *   3. `package-lock.json` — هذه المرة (831)
 *
 * يقارن هذا الفحص تبعيات `package.json` بما يسجّله القفل لجذر المشروع،
 * فيمسك التفاوت **قبل** الدفع بدل أن يكتشفه خادم البناء.
 */
const fs = require("fs")
const path = require("path")

const root = path.resolve(__dirname, "..")
const pkgPath = path.join(root, "package.json")
const lockPath = path.join(root, "package-lock.json")

if (!fs.existsSync(lockPath)) {
  console.log("+ No package-lock.json - nothing to compare.")
  process.exit(0)
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"))

// lockfileVersion >= 2: الجذر مسجَّل تحت packages[""] بتبعياته المعلنة
const rootEntry = (lock.packages && lock.packages[""]) || null
if (!rootEntry) {
  console.log("+ Lockfile has no root package entry (v1 lockfile?) - skipping.")
  process.exit(0)
}

const problems = []

for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
  const declared = pkg[field] || {}
  const locked = rootEntry[field] || {}

  for (const [name, range] of Object.entries(declared)) {
    if (!(name in locked)) {
      problems.push(`${name}@${range} is in package.json (${field}) but not recorded in the lockfile`)
      continue
    }
    if (locked[name] !== range) {
      problems.push(`${name}: package.json wants ${range}, lockfile records ${locked[name]}`)
      continue
    }
    // التبعية معلنة ومطابقة — تأكد أن لها إدخالاً منصّباً فعلاً
    if (!lock.packages[`node_modules/${name}`]) {
      problems.push(`${name}@${range} has no resolved entry in the lockfile`)
    }
  }

  for (const name of Object.keys(locked)) {
    if (!(name in declared)) {
      problems.push(`${name} is recorded in the lockfile (${field}) but no longer in package.json`)
    }
  }
}

// ── الفحص الذى كان سيمسك حادثة 831 فعلاً ─────────────────────────────
//
// المقارنة أعلاه تقرأ **ملفات العمل**، وهى متطابقة على جهاز المطور دائماً
// (لأنه شغّل npm install). لكن الـCI يرى **المرفوع** — وهناك كان النقص.
// فالسؤال الحقيقى ليس «هل الملفان متطابقان عندى؟» بل «هل التطابق سيصل؟».
// دقة المرساة هنا مهمة: `git status --porcelain` يُبلّغ عن التغييرات
// **المجهَّزة أيضاً** — فملف قفل جُهِّز للرفع (وسيصل فعلاً) يبدو عطباً.
// المطلوب هو التغييرات **غير المجهَّزة** وحدها: `git diff` (العمل مقابل
// الفهرس). المجهَّز سيصل، وغير المجهَّز هو ما يسقط صامتاً.
const { execFileSync } = require("child_process")
try {
  const unstaged = execFileSync("git", ["diff", "--name-only", "--", "package-lock.json"], {
    cwd: root, encoding: "utf8",
  }).trim()
  if (unstaged) {
    problems.push(
      "package-lock.json has UNSTAGED changes — it is in sync HERE but those " +
      "changes will not arrive. Stage it with package.json, or `npm ci` fails in CI.")
  }
} catch {
  /* لا git متاح: نكتفى بمقارنة الملفات */
}

if (problems.length === 0) {
  console.log("+ package.json and package-lock.json are in sync, and the lockfile is committed.")
  process.exit(0)
}

console.error(`\nX package.json and package-lock.json are OUT OF SYNC (${problems.length} issue(s)):\n`)
for (const p of problems) console.error(`    ${p}`)
console.error("\n  CI runs `npm ci`, which refuses any mismatch and fails the whole build.")
console.error("  Fix: run `npm install` locally, then COMMIT package-lock.json with package.json.")
process.exit(1)

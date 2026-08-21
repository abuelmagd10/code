#!/usr/bin/env node
/**
 * selftest-schema-snapshot-matches-db.js
 * ---------------------------------------------------------------------------
 * v3.74.867 — **يجب أن يُرى الحارس وهو يرفض، وأن يُسمِّى ما زُرع له.**
 *
 * ثلاثة فخاخٍ موجبة ومعكوسٌ واحد:
 *
 *   (أ) حذف كتلة جدولٍ من اللقطة     ← يجب أن يسقط ويُسمّى الجدول
 *   (ب) حذف عمودٍ من كتلة قائمة       ← يجب أن يسقط ويُسمّى العمود
 *   (ج) إضافة جدولٍ لا وجود له حياً    ← يجب أن يسقط ويُسمّى الجدول
 *   (د) اللقطة كما هى                  ← يجب أن يصمت
 *
 * ولا يُمسّ `supabase/schema/schema.sql` إطلاقاً: يُنسخ إلى ملفٍ مؤقت خارج
 * الشجرة، ويُوجَّه الحارس إليه بـ`SCHEMA_SNAPSHOT_PATH`. فالفخّ الذى يعدّل
 * ملفاً متتبَّعاً بحجم ١.٥ ميجابايت يكفى أن ينقطع مرّةً ليترك الشجرة مشوَّهة.
 *
 * ⚠️ ودرس ٨٦٥ مطبَّقٌ هنا: **لا يُقبل السقوط ما لم يُذكر المزروع بالاسم.**
 * فالحارس بلا قاعدة بيانات ينهار ويخرج بحالة ١ — وقراءة ذلك رفضاً تجعل
 * الفخّ يُرضى بتعطيل الحارس بدل عمله.
 *
 * Usage: node scripts/selftest-schema-snapshot-matches-db.js
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawnSync } = require("child_process")

const { requireDbOrSkip } = require("./lib/selftest-db")
requireDbOrSkip("PRODUCTION_SUPABASE_DB_URL", "أنَّ حارسَ اللقطةِ يرفضُ جدولاً ناقصاً وعموداً ناقصاً وجدولاً لا وجودَ له")

const root = path.resolve(__dirname, "..")
const realSnapshot = path.join(root, "supabase", "schema", "schema.sql")
const original = fs.readFileSync(realSnapshot, "utf8")

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erb-snap-"))
const tmpSnapshot = path.join(tmpDir, "schema.sql")

function runGuard() {
  const r = spawnSync(
    process.execPath,
    ["scripts/check-schema-snapshot-matches-db.js", "--require-db"],
    { encoding: "utf8", cwd: root, env: { ...process.env, SCHEMA_SNAPSHOT_PATH: tmpSnapshot } }
  )
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

/** يقصّ كتلة CREATE TABLE كاملةً لجدولٍ بعينه. */
function blockOf(sql, table) {
  const re = new RegExp(
    `CREATE TABLE (?:IF NOT EXISTS )?(?:"?public"?\\.)?"?${table}"?\\s*\\([\\s\\S]*?\\n\\);`
  )
  const m = sql.match(re)
  return m ? m[0] : null
}

// جدولٌ صغيرٌ مستقر يُستعمل كهدفٍ للفخاخ.
const TARGET = "warehouses"

const cases = []

{
  const block = blockOf(original, TARGET)
  if (!block) {
    console.error(`X could not locate the ${TARGET} block in the snapshot - selftest cannot run`)
    process.exit(1)
  }
  cases.push({
    name: `حذف جدول «${TARGET}» من اللقطة`,
    build: () => original.replace(block, ""),
    expectFail: true,
    needle: TARGET,
  })

  // احذف آخر عمودٍ من الكتلة (السطر قبل `);`).
  const lines = block.split("\n")
  const lastCol = lines[lines.length - 2]
  const droppedName = (lastCol.trim().match(/^"?([a-z0-9_]+)"?\s/i) || [])[1]
  const withoutCol = lines.slice(0, -2).join("\n").replace(/,\s*$/, "") + "\n);"
  cases.push({
    name: `حذف عمود «${droppedName}» من كتلة ${TARGET}`,
    build: () => original.replace(block, withoutCol),
    expectFail: true,
    needle: droppedName,
  })
}

cases.push({
  name: "جدولٌ فى اللقطة لا وجود له حياً",
  build: () =>
    original +
    "\n\nCREATE TABLE IF NOT EXISTS public.zz_table_that_never_existed (\n  id uuid,\n  company_id uuid\n);\n",
  expectFail: true,
  needle: "zz_table_that_never_existed",
})

cases.push({
  name: "اللقطة كما هى (معكوس)",
  build: () => original,
  expectFail: false,
})

let ok = true
try {
  for (const c of cases) {
    fs.writeFileSync(tmpSnapshot, c.build(), "utf8")
    const r = runGuard()

    if (c.expectFail && !r.failed) {
      console.error(`X الحارس لم يرفض: ${c.name}\n  ---- خرج الحارس ----\n${r.output}`)
      ok = false
    } else if (c.expectFail && c.needle && !r.output.includes(c.needle)) {
      console.error(
        `X الحارس سقط على «${c.name}» لكنه لم يذكر «${c.needle}» —\n` +
          `  فهذا انهيارٌ لا رفض.\n  ---- خرج الحارس ----\n${r.output}`
      )
      ok = false
    } else if (!c.expectFail && r.failed) {
      console.error(
        `X الحارس سقط على لقطةٍ سليمة — إنذارٌ كاذب.\n  ---- خرج الحارس ----\n${r.output}`
      )
      ok = false
    } else {
      console.log(`+ ${c.name}: ${c.expectFail ? "رُفض كما يجب" : "لم يُبلَّغ عنه كما يجب"}`)
    }
  }
} finally {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  // الملف الحقيقى لم يُفتح للكتابة أصلاً — وهذا تأكيدٌ لا إصلاح.
  if (fs.readFileSync(realSnapshot, "utf8") !== original) {
    console.error("X the real snapshot changed during the selftest - it must never be touched")
    process.exit(1)
  }
}

if (!ok) process.exit(1)
console.log("+ snapshot/database guard proven to refuse a missing table, a missing column and a stale one - and to stay silent on a clean snapshot.")

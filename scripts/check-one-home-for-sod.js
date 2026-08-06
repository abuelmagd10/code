#!/usr/bin/env node
/**
 * check-one-home-for-sod.js
 * ---------------------------------------------------------------------------
 * v3.74.966 — لقاعدة «مَن كتب لا يوقّع» بيتٌ واحد.
 *
 * ═══ المرضُ الذى وُلد منه هذا الحارس ═══
 *
 * كان فى القاعدة ثلاثةُ حرّاسٍ لفصلِ المهامّ، كلٌّ مكتوبٌ بيده:
 *   expense_sod_guard · bank_voucher_sod_guard · mmia_sod_guard
 * يحمون ثلاثةَ جداول من أصلِ ستّةٍ وعشرين فيها اعتماد. والباقى — أمرُ
 * الشراء، فاتورةُ الشراء، مرتجعاتُ الشراء والبيع، أوامرُ الإنتاج، الخصومات،
 * الإهلاك، التحويلاتُ المخزنية، مسحوباتُ الشركاء، أجورُ العمالة… — بلا حارس.
 * فمَن أنشأ المستندَ كان يستطيع اعتمادَه بنفسه.
 *
 * وثلاثةُ حرّاسٍ لقاعدةٍ واحدة تفترق: نصُّ الرسالة اختلف، وشرطُ الاستثناء
 * كُتب ثلاثَ مرات. وكلَّما أُضيفت دورةُ اعتمادٍ جديدة نُسى لها الحارس.
 *
 * ═══ ما يحرسه — خاصّيةٌ لا صياغة ═══
 *
 * الممنوعُ أن تُكتب **دالّةُ فصلِ مهامٍّ ثانية**. القاعدةُ الآن فى دالّةٍ
 * واحدة public.erp_sod_guard() تقرأ العمودين والرسالةَ من وسائطِ المُشغِّل،
 * فتوسيعُ الحماية إلى جدولٍ جديد سطرُ CREATE TRIGGER لا دالّةٌ جديدة.
 *
 * والتعرّفُ: تعريفُ دالّةٍ اسمُها ينتهى بـ _sod_guard وليست erp_sod_guard.
 *
 * ═══ لماذا يبدأ من هجرته هو ═══
 *
 * الهجراتُ الأقدمُ تحمل الحرّاسَ الثلاثةَ بحكم التاريخ — وقد هُدموا فى ٩٦٦.
 * فلو صرخ عليها لصرخ كلَّ يومٍ بلا سبب، **وحارسٌ يصرخ بلا سبب يُطفأ**.
 *
 * ═══ التعليقُ ليس تعليمة ═══
 *
 * التعليقاتُ والسلاسلُ تُنزع قبل البحث. ونصُّ هجرةِ ٩٦٦ نفسِها يذكر أسماءَ
 * الثلاثةِ القدامى فى سطور DROP — وهذا **هدمٌ لا بناء**، فيُستثنى صراحةً.
 *
 * Usage: node scripts/check-one-home-for-sod.js [--list] [--selftest]
 * Env:   SOD_SCAN_ROOT — جذرٌ بديل (يستعمله الفخّ الذاتى).
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const path = require("path")
const os = require("os")

const ROOT = process.env.SOD_SCAN_ROOT || process.cwd()
const VERBOSE = process.argv.includes("--list")
const SELFTEST = process.argv.includes("--selftest")

const BORN = "20260806000001"
const HOME_FN = "erp_sod_guard"

/** تعريفُ دالّةِ فصلِ مهامٍّ ليست البيتَ الوحيد. */
const BANNED = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([A-Za-z_]\w*_sod_guard)\b/gi

function stripSqlNoise(sql) {
  let out = "", i = 0
  const n = sql.length
  while (i < n) {
    const two = sql.slice(i, i + 2)
    if (two === "--") { const k = sql.indexOf("\n", i); i = k === -1 ? n : k; continue }
    if (two === "/*") { const k = sql.indexOf("*/", i + 2); i = k === -1 ? n : k + 2; out += " "; continue }
    if (sql[i] === "'") {
      i++
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue }
        if (sql[i] === "'") { i++; break }
        i++
      }
      out += " '' "
      continue
    }
    const d = /^\$([A-Za-z_]\w*)?\$/.exec(sql.slice(i, i + 40))
    if (d) {
      const tag = d[0]
      const end = sql.indexOf(tag, i + tag.length)
      if (end === -1) { out += sql.slice(i); break }
      out += " " + stripSqlNoise(sql.slice(i + tag.length, end)) + " "
      i = end + tag.length
      continue
    }
    out += sql[i]; i++
  }
  return out
}

function listMigrations(root) {
  const dir = path.join(root, "supabase", "migrations")
  let names = []
  try { names = fs.readdirSync(dir) } catch { return [] }
  return names
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => (f.match(/^(\d{14})/) || [])[1] >= BORN)
    .sort()
    .map((f) => path.join(dir, f))
}

function scan(root) {
  const offenders = []
  for (const abs of listMigrations(root)) {
    let raw
    try { raw = fs.readFileSync(abs, "utf8") } catch { continue }
    const code = stripSqlNoise(raw)
    const found = new Set()
    BANNED.lastIndex = 0
    let m
    while ((m = BANNED.exec(code)) !== null) {
      if (m[1].toLowerCase() !== HOME_FN) found.add(m[1])
    }
    if (found.size > 0) {
      offenders.push({ file: path.relative(root, abs).split(path.sep).join("/"), fns: [...found].sort() })
    }
  }
  return offenders
}

// -- الفخُّ الذاتى ------------------------------------------------------------
function selftest() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "sod-home-"))
  const dir = path.join(base, "supabase", "migrations")
  fs.mkdirSync(dir, { recursive: true })

  fs.writeFileSync(path.join(dir, "20991231000001_guilty.sql"),
    "CREATE OR REPLACE FUNCTION public.payment_sod_guard() RETURNS trigger AS $$\n" +
    "BEGIN RETURN NEW; END $$ LANGUAGE plpgsql;\n")

  fs.writeFileSync(path.join(dir, "20991231000002_innocent_home.sql"),
    "CREATE OR REPLACE FUNCTION public.erp_sod_guard() RETURNS trigger AS $$\n" +
    "BEGIN RETURN NEW; END $$ LANGUAGE plpgsql;\n" +
    "CREATE TRIGGER aa_erp_sod_guard BEFORE INSERT ON public.x\n" +
    "  FOR EACH ROW EXECUTE FUNCTION public.erp_sod_guard('a|b|رسالة');\n")

  fs.writeFileSync(path.join(dir, "20991231000003_comment_only.sql"),
    "-- هذه الهجرة تشرح expense_sod_guard ولا تُنشئها.\n" +
    "/* CREATE FUNCTION public.other_sod_guard() -- داخل تعليق */\n" +
    "DO $$ BEGIN RAISE NOTICE 'CREATE FUNCTION public.fake_sod_guard()'; END $$;\n")

  fs.writeFileSync(path.join(dir, "20991231000004_demolition.sql"),
    "DROP TRIGGER IF EXISTS trg_expense_sod_guard ON public.expenses;\n" +
    "DROP FUNCTION IF EXISTS public.expense_sod_guard();\n" +
    "DROP FUNCTION IF EXISTS public.mmia_sod_guard();\n")

  fs.writeFileSync(path.join(dir, "20240101000001_history.sql"),
    "CREATE OR REPLACE FUNCTION public.expense_sod_guard() RETURNS trigger AS $$\n" +
    "BEGIN RETURN NEW; END $$ LANGUAGE plpgsql;\n")

  const names = scan(base).map((o) => path.basename(o.file))
  const p1 = names.includes("20991231000001_guilty.sql")
  const p2 = !names.includes("20991231000002_innocent_home.sql")
  const p3 = !names.includes("20991231000003_comment_only.sql")
  const p4 = !names.includes("20991231000004_demolition.sql")
  const p5 = !names.includes("20240101000001_history.sql")

  console.log((p1 ? "  ok  " : "  X   ") + "يرفض دالّةَ فصلِ مهامٍّ ثانية")
  console.log((p2 ? "  ok  " : "  X   ") + "يُبرّئ البيتَ الوحيد erp_sod_guard وتركيبَ مُشغِّلٍ عليه")
  console.log((p3 ? "  ok  " : "  X   ") + "لا يصرخ على ذكرٍ فى تعليقٍ أو نصِّ رسالة")
  console.log((p4 ? "  ok  " : "  X   ") + "لا يصرخ على هجرةِ الهدم (DROP للحرّاس القدامى)")
  console.log((p5 ? "  ok  " : "  X   ") + "لا يصرخ على التاريخ (هجرةٌ أقدمُ من " + BORN + ")")

  try { fs.rmSync(base, { recursive: true, force: true }) } catch { /* لا يهمّ */ }
  return p1 && p2 && p3 && p4 && p5
}

if (SELFTEST) {
  console.log("# الفخُّ الذاتى - check-one-home-for-sod")
  process.exit(selftest() ? 0 : 1)
}

const offenders = scan(ROOT)
if (offenders.length === 0) {
  if (VERBOSE) {
    console.log("ok - بيتٌ واحدٌ لفصلِ المهامّ. (فُحصت " + listMigrations(ROOT).length + " هجرةً من " + BORN + " فصاعداً)")
  }
  process.exit(0)
}

console.error("")
console.error("X v3.74.966 - دالّةُ فصلِ مهامٍّ ثانية.")
console.error("")
console.error("  القاعدةُ لها بيتٌ واحد: public.erp_sod_guard()")
console.error("  وتوسيعُ الحماية إلى جدولٍ جديد سطرُ CREATE TRIGGER لا دالّةٌ جديدة:")
console.error("")
console.error("      CREATE TRIGGER aa_erp_sod_guard BEFORE INSERT OR UPDATE ON public.<الجدول>")
console.error("        FOR EACH ROW EXECUTE FUNCTION public.erp_sod_guard('<الأوّل>|<الثانى>|<الرسالة>');")
console.error("")
for (const o of offenders) console.error("  - " + o.file + "  (" + o.fns.join(", ") + ")")
console.error("")
process.exit(1)

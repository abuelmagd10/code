#!/usr/bin/env node
/**
 * check-bill-line-follows-its-head.js
 * ---------------------------------------------------------------------------
 * v3.74.970 — بندُ الفاتورة يتبع رأسَها، والرأسُ يسأل شاشةَ الصلاحيات.
 *
 * ═══ المرضُ الذى وُلد منه هذا الحارس ═══
 *
 * حين أنزلنا منعَ رؤية فواتير الشراء إلى قاعدة البيانات، حجبنا **رأسَ**
 * الفاتورة ونسينا **بندَها**. وقِيس على قاعدة الاختبار قبل الشحن: مسؤولُ
 * المشتريات صار يرى **صفرَ فواتير** — **وأربعةَ بنودٍ** فيها الأصنافُ
 * والأسعار. بابٌ نصفُ مغلقٍ أسوأُ من بابٍ مفتوح، لأنّه يُوهم بالإغلاق.
 *
 * والسببُ أنّ لكلٍّ منهما دالّةَ حراسةٍ مستقلّة: الرأسُ يسأل سؤالاً،
 * والبندُ يسأل سؤالاً أضيق. وقاعدةٌ واحدةٌ فى بيتين تفترق.
 *
 * ═══ ما يحرسه — خاصّيتان ═══
 *
 * ‏(١) can_access_bill_items يجب أن يُفوّض إلى can_access_bill، فلا يُعيد
 *     كتابةَ الحكم بنفسه. **البندُ يتبع الرأس.**
 * ‏(٢) can_access_bill_row يجب أن يسأل can_view_resource، وإلا عاد المنعُ
 *     إلى الشاشة وحدَها وصارت شاشةُ الصلاحيات زينة.
 *
 * ═══ ولا يصرخ على التاريخ ولا على التعليق ═══
 *
 * يفحص هجراتِ هذا الإصدار فما بعده فقط، وينزع التعليقاتِ والسلاسلَ قبل
 * البحث — درسٌ تكرّر ستَّ مراتٍ فى هذا المشروع.
 *
 * Usage: node scripts/check-bill-line-follows-its-head.js [--list] [--selftest]
 * Env:   BILL_LINE_SCAN_ROOT
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const path = require("path")
const os = require("os")

const ROOT = process.env.BILL_LINE_SCAN_ROOT || process.cwd()
const VERBOSE = process.argv.includes("--list")
const SELFTEST = process.argv.includes("--selftest")
const BORN = "20260806000004"

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
  return names.filter((f) => f.endsWith(".sql"))
    .filter((f) => (f.match(/^(\d{14})/) || [])[1] >= BORN)
    .sort().map((f) => path.join(dir, f))
}

/** يقتطع تعريفَ الدالّة المسمّاة من CREATE إلى نهاية جسدها بعلامة الدولار. */
function functionBody(code, name) {
  const re = new RegExp("CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?" + name + "\\b", "i")
  const m = re.exec(code)
  if (!m) return null
  const rest = code.slice(m.index)
  const tag = /\$([A-Za-z_]\w*)?\$/.exec(rest)
  if (!tag) return rest.slice(0, 1500)
  const start = rest.indexOf(tag[0]) + tag[0].length
  const end = rest.indexOf(tag[0], start)
  return end === -1 ? rest.slice(start) : rest.slice(start, end)
}

function scan(root) {
  const offenders = []
  for (const abs of listMigrations(root)) {
    let raw
    try { raw = fs.readFileSync(abs, "utf8") } catch { continue }
    const code = stripSqlNoise(raw)
    const file = path.relative(root, abs).split(path.sep).join("/")

    const items = functionBody(code, "can_access_bill_items")
    if (items !== null && !/can_access_bill\s*\(/.test(items)) {
      offenders.push({ file, why: "can_access_bill_items لا يُفوّض إلى can_access_bill — البندُ لا يتبع الرأس." })
    }
    const row = functionBody(code, "can_access_bill_row")
    if (row !== null && !/can_view_resource\s*\(/.test(row)) {
      offenders.push({ file, why: "can_access_bill_row لا يسأل can_view_resource — شاشةُ الصلاحيات صارت زينة." })
    }
  }
  return offenders
}

function selftest() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "bill-line-"))
  const dir = path.join(base, "supabase", "migrations")
  fs.mkdirSync(dir, { recursive: true })
  const W = (n, s) => fs.writeFileSync(path.join(dir, n), s)

  W("20991231000001_good.sql",
    "CREATE OR REPLACE FUNCTION public.can_access_bill_row(a uuid, b uuid) RETURNS boolean AS $$\n" +
    "  SELECT public.can_view_resource(a, 'bills');\n$$ LANGUAGE sql;\n" +
    "CREATE OR REPLACE FUNCTION public.can_access_bill_items(p uuid) RETURNS boolean AS $$\n" +
    "  SELECT public.can_access_bill(p);\n$$ LANGUAGE sql;\n")

  W("20991231000002_line_alone.sql",
    "CREATE OR REPLACE FUNCTION public.can_access_bill_items(p uuid) RETURNS boolean AS $$\n" +
    "  SELECT public.can_access_record_branch(x, y);\n$$ LANGUAGE sql;\n")

  W("20991231000003_row_ignores_screen.sql",
    "CREATE OR REPLACE FUNCTION public.can_access_bill_row(a uuid, b uuid) RETURNS boolean AS $$\n" +
    "  SELECT public.can_access_record_branch(a, b);\n$$ LANGUAGE sql;\n")

  W("20991231000004_comment_only.sql",
    "-- CREATE FUNCTION public.can_access_bill_items(p uuid) بلا تفويض — داخل تعليق\n" +
    "SELECT 1;\n")

  W("20240101000001_history.sql",
    "CREATE OR REPLACE FUNCTION public.can_access_bill_items(p uuid) RETURNS boolean AS $$\n" +
    "  SELECT public.can_access_record_branch(x, y);\n$$ LANGUAGE sql;\n")

  const names = scan(base).map((o) => path.basename(o.file))
  const p1 = !names.includes("20991231000001_good.sql")
  const p2 = names.includes("20991231000002_line_alone.sql")
  const p3 = names.includes("20991231000003_row_ignores_screen.sql")
  const p4 = !names.includes("20991231000004_comment_only.sql")
  const p5 = !names.includes("20240101000001_history.sql")

  console.log((p1 ? "  ok  " : "  X   ") + "يمرّ على الصياغة السليمة")
  console.log((p2 ? "  ok  " : "  X   ") + "يرفض بندًا لا يتبع رأسَه")
  console.log((p3 ? "  ok  " : "  X   ") + "يرفض رأسًا لا يسأل شاشةَ الصلاحيات")
  console.log((p4 ? "  ok  " : "  X   ") + "لا يصرخ على ذكرٍ داخل تعليق")
  console.log((p5 ? "  ok  " : "  X   ") + "لا يصرخ على التاريخ (أقدمُ من " + BORN + ")")

  try { fs.rmSync(base, { recursive: true, force: true }) } catch { /* لا يهمّ */ }
  return p1 && p2 && p3 && p4 && p5
}

if (SELFTEST) {
  console.log("# الفخُّ الذاتى - check-bill-line-follows-its-head")
  process.exit(selftest() ? 0 : 1)
}

const offenders = scan(ROOT)
if (offenders.length === 0) {
  if (VERBOSE) console.log("ok - بندُ الفاتورة يتبع رأسَها، والرأسُ يسأل شاشةَ الصلاحيات.")
  process.exit(0)
}
console.error("")
console.error("X v3.74.970 - بابٌ نصفُ مغلق.")
console.error("")
for (const o of offenders) console.error("  - " + o.file + "\n      " + o.why)
console.error("")
process.exit(1)

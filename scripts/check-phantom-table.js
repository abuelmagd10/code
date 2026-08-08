#!/usr/bin/env node
/**
 * check-phantom-table.js — لا يُنادَى جدولٌ لا وجودَ له.
 * ---------------------------------------------------------------------------
 *   node scripts/check-phantom-table.js [--require-db]
 *   node scripts/check-phantom-table.js --selftest
 *
 * ═══ لماذا وُجد ═══
 *
 * قِيست أسماءُ الجداول المذكورة فى الشيفرة كلِّها ضدّ قاعدة الإنتاج، فوُجد
 * **سبعةُ أسماءٍ لا وجودَ لها**، مذكورةً فى أربعةَ عشرَ موضعاً عبر أحدَ عشرَ
 * ملفاً. وأخطرُ ما فيها أنّها **لا تُصدر خطأً يراه أحد**: النداءُ يعود
 * بخطأٍ من Supabase، فتُقرأ نتيجتُه فارغةً، فتمضى الشاشةُ كأنّ شيئاً لم يكن.
 *
 * وأحدُها كان يُصيب مستعمِلاً اليوم: صفحةُ تحويلات المخزون تسأل جدولاً اسمُه
 * `profiles` عن اسم مَن أنشأ الطلب، والجدولُ غيرُ موجود، فتقول الرسالة
 * «لا يُلغيه إلّا مَن أنشأه: **Unknown**» — تمنعُك وتأبى أن تقول لك مِمَّن
 * تطلب. عُولج فى ٩٧٩ بقراءة الاسم من بيتٍ واحدٍ حقيقىّ.
 *
 * ═══ الخاصّيّةُ الممنوعة ═══
 *
 * **`.from("اسم")` باسمٍ ليس فى قاعدة البيانات** — جدولاً كان أو رؤية.
 *
 * والأسماءُ الحيّةُ تُقرأ من القاعدة نفسِها وقتَ التشغيل، لا من لقطةٍ
 * مكتوبةٍ فى المستودع: فاللقطةُ تشيخ، والقاعدةُ لا تكذب.
 *
 * ═══ حارسُ سقّاطة ═══
 *
 * المواضعُ المعروفةُ اليومَ **مثبَّتةٌ بالاسم** مع سببِ بقائها. وأىُّ موضعٍ
 * جديدٍ يُوقف البناء. والقائمةُ **لا تكبر إلّا بيدٍ تكتبها**، ويُطبع عددُ
 * الباقى فى كلِّ تشغيل — فلا يختفى دَينٌ فى الصمت.
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const path = require("path")

/**
 * مواضعُ معروفةٌ قِيست واحداً واحداً. لكلٍّ سببُه — ولا واحدَ منها مُوافَقٌ
 * عليه، كلُّها **مُتتبَّعةٌ بانتظار قرارِ حذفٍ أو إحياء**.
 */
const BASELINE = [
  ["components/AdvancedPermissionsManager.tsx", "advanced_permissions",
   "مكوِّنٌ لا يستورده أىُّ ملفّ - شاشةٌ لا يبلغها أحد"],
  ["lib/governance-layer.ts", "audit_trail",
   "getAuditTrail مُصدَّرةٌ ولا يستوردها أحد - وسجلُّ التدقيق الحىُّ اسمُه audit_logs ويعمل"],
  ["lib/governance-layer.ts", "refund_requests",
   "دالّتان مُصدَّرتان لا يستوردهما أحد"],
  ["lib/core/queue/jobs/process-attendance-job.ts", "daily_attendance",
   "وظيفةٌ مسجَّلةٌ فى الطابور ويبلغها مسارُ البصمة - لكن البصمةَ غيرُ مستعملة: صفرُ جهازٍ وصفرُ سجلٍّ خام"],
  ["app/api/refund-requests/route.ts", "refund_requests", "محرّكُ استردادٍ ثانٍ لا تنادِيه شاشة"],
  ["app/api/refund-requests/approve/route.ts", "refund_requests", "محرّكُ استردادٍ ثانٍ لا تنادِيه شاشة"],
  ["app/api/refund-requests/reject/route.ts", "refund_requests", "محرّكُ استردادٍ ثانٍ لا تنادِيه شاشة"],
  ["app/api/refund-requests/reopen/route.ts", "refund_requests", "محرّكُ استردادٍ ثانٍ لا تنادِيه شاشة"],
  ["app/api/refund-requests/disburse/route.ts", "refund_requests", "محرّكُ استردادٍ ثانٍ لا تنادِيه شاشة"],
  ["app/api/refund-requests/disburse/route.ts", "disbursement_vouchers", "محرّكُ استردادٍ ثانٍ لا تنادِيه شاشة"],
  ["lib/refund-policy-engine.ts", "refund_requests", "محرّكُ الاسترداد الثانى نفسُه"],
  ["lib/refund-policy-engine.ts", "refund_audit_logs", "محرّكُ الاسترداد الثانى نفسُه"],
]
const PINNED = new Set(BASELINE.map(([f, t]) => f + "::" + t))

// ───────────────────────────── القياس ─────────────────────────────

/** يُفرّغ التعليقات مسافاتٍ مع حفظ الأسطر — فلا يزحف رقمُ سطر. */
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

/**
 * الأسماءُ المنادَاة فى نصِّ ملفّ.
 * وتُشترط النقطةُ قبل from ليُستثنى `Array.from(...)` — وهو ليس نداءَ جدول.
 */
function tablesIn(src) {
  const out = []
  const masked = maskComments(src)
  const re = /\.from\(\s*(["'`])([a-z_][a-z0-9_]*)\1\s*\)/g
  const lines = masked.split("\n")
  let acc = 0
  const starts = lines.map((L) => { const s = acc; acc += L.length + 1; return s })
  let m
  while ((m = re.exec(masked)) !== null) {
    let line = 1
    for (let i = 0; i < starts.length; i++) { if (starts[i] <= m.index) line = i + 1; else break }
    out.push({ table: m[2], line })
  }
  return out
}

// ───────────────────────────── الفخُّ الذاتىّ ─────────────────────────────

if (process.argv.includes("--selftest")) {
  const cases = [
    ["يجد اسمَ جدولٍ بعلامتَى اقتباس مزدوجتين",
     'const { data } = await supabase.from("invoices").select("*")\n', ["invoices"]],
    ["ويجده بعلامةٍ مفردة",
     "supabase.from('bills').select()\n", ["bills"]],
    ["ولا يخلط Array.from بنداءِ جدول",
     'const u = Array.from(new Set(values))\n', []],
    ["ولا يحكم على ذكرٍ داخل تعليق",
     '// supabase.from("phantom_table")\nsupabase.from("products").select()\n', ["products"]],
    ["ويتخطّى اسماً مبنيّاً لا نصّاً صريحاً",
     'supabase.from(tableName).select()\n', []],
    ["ويُسمّى رقمَ السطر الصحيح بعد تعليقٍ كتلىّ",
     '/* سطر\nسطر\nسطر */\nsupabase.from("payments").select()\n', ["payments"]],
  ]
  let bad = 0
  for (const [name, src, expected] of cases) {
    const got = tablesIn(src).map((x) => x.table)
    const ok = JSON.stringify(got) === JSON.stringify(expected)
    if (!ok) bad++
    console.log((ok ? "  ok  " : "  X   ") + name + "  (توقّعتُ [" + expected + "] فجاء [" + got + "])")
  }
  // اتّجاهٌ سابعٌ: رقمُ السطر لا يزحف
  {
    const got = tablesIn('/* أ\nب\nج */\nsupabase.from("payments").select()\n')
    const ok = got.length === 1 && got[0].line === 4
    if (!ok) bad++
    console.log((ok ? "  ok  " : "  X   ") + "ويُبقى رقمَ السطر صادقاً (توقّعتُ 4 فجاء " + (got[0] && got[0].line) + ")")
  }
  if (bad > 0) { console.error("X سقط الفخُّ الذاتىّ فى " + bad + " اتّجاه."); process.exit(1) }
  console.log("  الفخُّ الذاتىّ: 7 اتّجاهاتٍ، كلُّها صحيحة.")
  process.exit(0)
}

// ───────────────────────────── التشغيل ─────────────────────────────

require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
const url = process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL غير مضبوط - لا يمكن معرفة الجداول الحيّة."
  if (requireDb) { console.error("X " + msg); process.exit(1) }
  console.log("! " + msg + " تُخطّى (مرّر --require-db لجعلها قاتلة).")
  process.exit(0)
}

let Client
try { ({ Client } = require("pg")) } catch { console.error("X npm install pg --save-dev"); process.exit(1) }

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

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let live
  try {
    const { rows } = await client.query(`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','p','f')`)
    live = new Set(rows.map((r) => r.relname))
  } finally {
    await client.end()
  }
  if (live.size === 0) {
    console.error("X القاعدة لم تُعطِ اسمَ جدولٍ واحد - لا أحكم على شىءٍ بلا مقياس.")
    process.exit(1)
  }

  const files = [
    ...walk(path.join(ROOT, "app"), []),
    ...walk(path.join(ROOT, "lib"), []),
    ...walk(path.join(ROOT, "components"), []),
  ]

  const fresh = []
  const seenPinned = new Set()
  for (const abs of files) {
    const rel = path.relative(ROOT, abs).split(path.sep).join("/")
    const src = fs.readFileSync(abs, "utf8")
    if (src.indexOf(".from(") === -1) continue
    for (const hit of tablesIn(src)) {
      if (live.has(hit.table)) continue
      const key = rel + "::" + hit.table
      if (PINNED.has(key)) { seenPinned.add(key); continue }
      fresh.push({ rel, line: hit.line, table: hit.table })
    }
  }

  const gone = BASELINE.filter(([f, t]) => !seenPinned.has(f + "::" + t))
  console.log("Found: " + fresh.length + "   Baseline: " + seenPinned.size + "/" + BASELINE.length + "   (" + live.size + " اسماً حيّاً فى القاعدة)")

  if (fresh.length > 0) {
    console.error("")
    console.error("X نداءُ جدولٍ لا وجودَ له - ولا يُصدر خطأً يراه أحد، فتمضى الشاشةُ كأنّ شيئاً لم يكن:")
    for (const f of fresh) console.error("   " + f.rel + ":" + f.line + "   .from(\"" + f.table + "\")")
    console.error("")
    console.error("   إمّا أن يكون الاسمُ خطأً فيُصحَّح إلى الجدول الحقيقىّ،")
    console.error("   وإمّا أن يكون الجدولُ ناقصاً فتُكتب له هجرة. ولا ثالثَ يُسكت عنه.")
    process.exit(1)
  }

  if (gone.length > 0) {
    console.log("  " + gone.length + " موضعاً مثبَّتاً لم يعد موجوداً - احذفه من BASELINE فى هذا الملفّ (القائمة لا تكبر ولا تكذب):")
    for (const [f, t] of gone) console.log("     " + f + "  ::  " + t)
  }

  console.log("+ لا نداءَ جديداً لجدولٍ غيرِ موجود. " + seenPinned.size + " موضعاً قديماً باقياً - متتبَّعٌ لا مُوافَقٌ عليه:")
  for (const [f, t, why] of BASELINE) {
    if (seenPinned.has(f + "::" + t)) console.log("     " + f + "  ::  " + t + "   — " + why)
  }
})().catch((e) => {
  console.error("X فشل: " + ((e && e.message) || e))
  process.exit(1)
})

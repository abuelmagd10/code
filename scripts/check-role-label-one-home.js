#!/usr/bin/env node
/**
 * check-role-label-one-home.js — لوظيفةٍ واحدةٍ اسمٌ واحد، ومكتوبٌ فى بيتٍ واحد.
 * ---------------------------------------------------------------------------
 *   node scripts/check-role-label-one-home.js [--require-db]
 *   node scripts/check-role-label-one-home.js --selftest
 *
 * ═══ الحكاية ═══
 *
 * كان اسمُ الوظيفةِ المعروضُ للمستخدم يُكتَبُ فى **ستّةَ عشرَ موضعاً مستقلّاً**،
 * وكانت المواضعُ تتناقض:
 *
 *   • `admin` يُكتَبُ «مدير عام» فى ستّةِ مواضعَ و«مدير» فى عشرة.
 *   • `manager` يُكتَبُ «مدير» فى ثمانية.
 *
 * فكان المديرُ العامُّ ومديرُ الفرعِ يظهرانِ **بالكلمةِ نفسِها** على سبعِ شاشات،
 * ومن يُسنِدُ الوظائفَ لا يُفرّقُ بينهما.
 *
 *   • و`viewer` «مشاهد» فى سبعةٍ و«عرض فقط» فى أربعة.
 *   • وخمسُ شاشاتٍ تحملُ قوائمَ قديمةً لا تعرفُ الوظائفَ الأربعَ الجديدة، فتعرضُ
 *     للمستخدمِ المفتاحَ الإنجليزىَّ نفسَه: `hr_officer`.
 *
 * **واسمانِ لوظيفةٍ واحدةٍ ليسا اسماً — هما وظيفتانِ فى ذهنِ القارئ.**
 * **وقائمةٌ تنقصُ اسماً لا تصمت — تعرضُ لغةً لا يفهمها صاحبُها.**
 *
 * ═══ الخاصّيّةُ الممنوعة ═══
 *
 * **اسمٌ عربىٌّ لوظيفةٍ مكتوبٌ خارج `lib/roles.ts`.**
 *
 * وليست الخاصّيّةُ «سطرٌ فيه عربىٌّ واسمُ وظيفة» — هذا شكلُ نصّ. الخاصّيّةُ أن
 * يكونَ السطرُ **يُسمّى** الوظيفة: مفتاحُ وظيفةٍ يُقابَل باسمٍ عربىّ (`admin:
 * "مدير عام"`) أو مقارنةٌ تُنتِج اسماً (`role === 'admin' ? 'مدير عام' :`).
 * أمّا رسالةُ خطأٍ تقول «لا يمكن إزالة آخر مالك» بجوارِ `=== "owner"` فليست
 * تسميةً، ولا تُحاكَم. **وحارسٌ يصرخُ على البرىءِ يُطفأ ثمّ لا يحرسُ شيئاً.**
 *
 * ═══ وما ليس وظيفةً يُعلَن ولا يُسكت ═══
 *
 * فى المشروعِ خريطةُ **مقاطعِ الروابط** (`/admin` → «الإدارة»)، ومفتاحُها
 * `admin` مصادفةً. فهو جزءٌ من عنوانٍ لا اسمُ وظيفة. ولا يُترك بلا قاعدة:
 * يُعلَن هنا بالملفِّ والمفتاحِ والنصِّ والسبب، فإن تغيّر النصُّ سقط الإعلانُ
 * وعاد السطرُ إلى المحاكمة. **واستثناءٌ بلا اسمٍ ثقبٌ، واستثناءٌ مُعلَنٌ عقد.**
 *
 * ═══ وما يُفحص أيضاً ═══
 *
 *   ١) البيتُ نفسُه سليم: لا اسمَ عربىٌّ مكرَّرٌ لوظيفتين، ولا ترتيبَ مكرَّر،
 *      والترتيبُ متّصلٌ من ١ إلى العدد، وفيه رتبةٌ عليا ورتبةٌ عادية.
 *   ٢) (بـ`--require-db`) مفاتيحُ البيتِ تُطابق **مفرداتِ العضويّةِ فى قاعدة
 *      البيانات** تمام المطابقة فى الاتّجاهين، وكتالوجُ `public.roles` يقول
 *      الأسماءَ نفسَها والترتيبَ نفسَه.
 * ---------------------------------------------------------------------------
 */
"use strict"

const fs = require("fs")
const path = require("path")

const HOME = "lib/roles.ts"
const AR = /[؀-ۿ]/

/**
 * استثناءاتٌ مُعلَنة: مواضعُ يظهرُ فيها مفتاحٌ يُشبه اسمَ وظيفةٍ ومعه نصٌّ عربىّ،
 * وليست تسميةَ وظيفة. الشرط: الملفُّ والمفتاحُ والنصُّ كما هى — فإن تغيّر النصُّ
 * سقط الإعلان.
 */
const DECLARED = [
  {
    file: "components/SmartBreadcrumbs.tsx",
    key: "admin",
    label: "الإدارة",
    why: "خريطةُ مقاطعِ الروابط لا خريطةُ وظائف: الصفحةُ /admin اسمُها «الإدارة». والمفتاحُ جزءٌ من عنوانٍ لا اسمُ وظيفة.",
  },
]

// ───────────────────────── قراءةُ البيتِ الواحد ─────────────────────────

function parseHome(src) {
  const out = []
  const re = /\{\s*key:\s*"([a-z_]+)",\s*ar:\s*"([^"]+)",\s*en:\s*"([^"]+)",\s*tier:\s*"(senior|normal)",\s*order:\s*(\d+),/g
  let m
  while ((m = re.exec(src))) {
    out.push({ key: m[1], ar: m[2], en: m[3], tier: m[4], order: Number(m[5]) })
  }
  return out
}

function judgeHome(roles) {
  const bad = []
  if (roles.length === 0) {
    // **بحثٌ لا يجد ليس دليلَ غياب** — قراءةٌ فارغةٌ عطبٌ فى الأداة لا براءةٌ فى الملفّ.
    bad.push("لم أقرأ وظيفةً واحدةً من " + HOME + " — إمّا تغيّر شكلُ الملفّ أو الأداةُ عمياء.")
    return bad
  }
  const seen = {}
  for (const r of roles) {
    if (seen[r.key]) bad.push("مفتاحٌ مكرَّر: " + r.key)
    seen[r.key] = true
  }
  const byAr = {}
  for (const r of roles) {
    if (byAr[r.ar]) bad.push('اسمٌ عربىٌّ واحدٌ لوظيفتين: "' + r.ar + '" لـ ' + byAr[r.ar] + " ولـ " + r.key)
    byAr[r.ar] = r.key
  }
  const byEn = {}
  for (const r of roles) {
    if (byEn[r.en]) bad.push('اسمٌ إنجليزىٌّ واحدٌ لوظيفتين: "' + r.en + '" لـ ' + byEn[r.en] + " ولـ " + r.key)
    byEn[r.en] = r.key
  }
  const orders = roles.map((r) => r.order).sort((a, b) => a - b)
  for (let i = 0; i < orders.length; i++) {
    if (orders[i] !== i + 1) {
      bad.push("الترتيبُ ليس متّصلاً من ١ إلى " + orders.length + " — وجدتُ: " + orders.join(", "))
      break
    }
  }
  if (!roles.some((r) => r.tier === "senior")) bad.push("لا رتبةَ عليا فى البيت — ومن لا عليا له لا يعتمدُ أحد.")
  if (!roles.some((r) => r.tier === "normal")) bad.push("لا رتبةَ عاديّةَ فى البيت.")
  return bad
}

// ───────────────────────── الخاصّيّةُ الممنوعة ─────────────────────────

/**
 * هل هذا السطرُ **يُسمّى** وظيفةً؟
 * يُعيد قائمةَ {key, label} لكلِّ تسميةٍ وجدها فى السطر.
 */
function namingsInLine(line, keys) {
  const res = []
  const trimmed = line.trim()
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return res
  if (!AR.test(line)) return res

  // النصوصُ العربيّةُ فى السطر ومواضعُها
  const lits = []
  const litRe = /(['"])((?:(?!\1)[^\\]|\\.)*)\1/g
  let lm
  while ((lm = litRe.exec(line))) {
    if (AR.test(lm[2])) lits.push({ at: lm.index, text: lm[2] })
  }
  if (!lits.length) return res

  for (const k of keys) {
    // (أ) شكلُ المفتاح: `admin: "..."` أو `admin: cond ? "..." : "..."`
    const keyRe = new RegExp("(?:^|[{,\\s])" + k + "\\s*:")
    const km = keyRe.exec(line)
    if (km) {
      const after = lits.filter((l) => l.at > km.index)
      if (after.length) {
        res.push({ key: k, label: after[after.length - 1].text, form: "مفتاح" })
        continue
      }
    }
    // (ب) شكلُ المقارنةِ المُنتِجة: `role === 'admin' ? 'مدير عام'`
    const cmpRe = new RegExp("[=!]==?\\s*['\"]" + k + "['\"]|['\"]" + k + "['\"]\\s*[=!]==?")
    const cm = cmpRe.exec(line)
    if (cm) {
      const q = line.indexOf("?", cm.index + cm[0].length)
      if (q === -1) continue // شرطٌ لا يُنتِج اسماً — رسالةٌ أو حراسة، لا تسمية
      const after = lits.filter((l) => l.at > q)
      if (after.length) res.push({ key: k, label: after[0].text, form: "مقارنة" })
    }
  }
  return res
}

function scan(files, keys, readFile) {
  const hits = []
  for (const rel of files) {
    if (rel.replace(/\\/g, "/") === HOME) continue
    const src = readFile(rel)
    src.split(/\r?\n/).forEach((line, i) => {
      for (const n of namingsInLine(line, keys)) {
        hits.push({ file: rel.replace(/\\/g, "/"), line: i + 1, key: n.key, label: n.label, form: n.form, text: line.trim() })
      }
    })
  }
  return hits
}

function undeclared(hits) {
  return hits.filter(
    (h) => !DECLARED.some((d) => d.file === h.file && d.key === h.key && d.label === h.label),
  )
}

// ───────────────────────────── الفخُّ الذاتىّ ─────────────────────────────

if (process.argv.includes("--selftest")) {
  const KEYS = ["owner", "admin", "manager", "viewer", "hr_officer"]
  const one = (src) => scan(["x.ts"], KEYS, () => src).length
  const cases = [
    ["يرى بيتاً ثانياً بشكل المفتاح", '  const m = { admin: "مدير عام", manager: "مدير" }\n', 2],
    ["ويرى بيتاً ثانياً بشكل المقارنة", "  const s = role === 'admin' ? 'مدير عام' : 'موظف'\n", 1],
    ["ولا يحاكم رسالةَ خطأٍ بجوار مقارنة", '  if (m.role === "owner") setError("لا يمكن إزالة آخر مالك")\n', 0],
    ["ولا يحاكم تعليقاً", '  // admin: "مدير عام"\n', 0],
    ["ولا يحاكم سطراً بلا عربىّ", '  const m = { admin: "General Manager" }\n', 0],
    ["ولا يحاكم نصّاً عربيّاً بلا مفتاح وظيفة", '  const t = "مرحباً بك"\n', 0],
    ["ويرى الوظيفةَ الجديدةَ كما يرى القديمة", '  const m = { hr_officer: "مسؤول الموارد البشرية" }\n', 1],
  ]
  let fail = 0
  for (const [name, src, expected] of cases) {
    const got = one(src)
    const ok = got === expected
    if (!ok) fail++
    console.log((ok ? "  ok  " : "  X   ") + name + "  (توقّعتُ " + expected + " فجاء " + got + ")")
  }

  // الاتّجاهُ الثانى: البيتُ المعطوب يجب أن يُرفض
  const homeCases = [
    ["بيتٌ سليم", '{ key: "owner", ar: "المالك", en: "Owner", tier: "senior", order: 1,\n{ key: "staff", ar: "موظف", en: "Staff", tier: "normal", order: 2,', 0],
    ["اسمٌ عربىٌّ واحدٌ لوظيفتين", '{ key: "admin", ar: "مدير", en: "GM", tier: "senior", order: 1,\n{ key: "manager", ar: "مدير", en: "BM", tier: "normal", order: 2,', 1],
    ["ترتيبٌ مكسور", '{ key: "owner", ar: "المالك", en: "Owner", tier: "senior", order: 1,\n{ key: "staff", ar: "موظف", en: "Staff", tier: "normal", order: 7,', 1],
    ["بلا رتبةٍ عليا", '{ key: "staff", ar: "موظف", en: "Staff", tier: "normal", order: 1,', 1],
    ["بيتٌ لا يُقرأ", "const x = 1", 1],
  ]
  for (const [name, src, expected] of homeCases) {
    const got = judgeHome(parseHome(src)).length
    const ok = expected === 0 ? got === 0 : got >= 1
    if (!ok) fail++
    console.log((ok ? "  ok  " : "  X   ") + name + "  (توقّعتُ " + (expected ? "رفضاً" : "قبولاً") + " فجاء " + got + ")")
  }

  if (fail > 0) {
    console.error("X سقط الفخُّ الذاتىّ فى " + fail + " اتّجاه.")
    process.exit(1)
  }
  console.log("  الفخُّ الذاتىّ: " + (cases.length + homeCases.length) + " اتّجاهاً، كلُّها صحيحة.")
  process.exit(0)
}

// ───────────────────────────── التشغيل ─────────────────────────────

const ROOT = process.cwd()

function walk(d, o) {
  let e
  try {
    e = fs.readdirSync(d, { withFileTypes: true })
  } catch {
    return o
  }
  for (const x of e) {
    const p = path.join(d, x.name)
    if (/node_modules|[\\/]\.next|[\\/]\.git/.test(p)) continue
    if (x.isDirectory()) walk(p, o)
    else if (/\.(ts|tsx)$/.test(x.name)) o.push(p)
  }
  return o
}

const homeAbs = path.join(ROOT, HOME)
if (!fs.existsSync(homeAbs)) {
  console.error("X البيتُ الواحدُ غيرُ موجود: " + HOME)
  process.exit(1)
}
const roles = parseHome(fs.readFileSync(homeAbs, "utf8"))
const homeBad = judgeHome(roles)
if (homeBad.length) {
  console.error("X البيتُ الواحدُ نفسُه معطوب:")
  homeBad.forEach((b) => console.error("   - " + b))
  process.exit(1)
}
const KEYS = roles.map((r) => r.key)
console.log("  البيتُ الواحد: " + roles.length + " وظيفةً، " + roles.filter((r) => r.tier === "senior").length + " عليا و" + roles.filter((r) => r.tier === "normal").length + " عادية.")

const files = []
for (const d of ["app", "components", "lib", "hooks"]) {
  const abs = path.join(ROOT, d)
  if (fs.existsSync(abs)) walk(abs, files)
}
const rels = files.map((f) => path.relative(ROOT, f))
const hits = scan(rels, KEYS, (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8"))
const bad = undeclared(hits)

// إعلانٌ لا يجدُ موضعَه سقط
const orphan = DECLARED.filter(
  (d) => !hits.some((h) => h.file === d.file && h.key === d.key && h.label === d.label),
)

console.log("  المواضعُ المُسمِّية خارج البيت: " + hits.length + " (منها " + (hits.length - bad.length) + " معلَنة).")

if (orphan.length) {
  console.error("X إعلانٌ لم يعد له موضع — استثناءٌ بلا سببٍ حاضرٍ يُحذف:")
  orphan.forEach((d) => console.error("   - " + d.file + " [" + d.key + "] \"" + d.label + "\""))
  process.exit(1)
}

if (bad.length) {
  console.error("X أسماءُ وظائفَ مكتوبةٌ خارج بيتها الواحد (" + bad.length + "):")
  bad.forEach((h) => console.error("   - " + h.file + ":" + h.line + "  [" + h.key + " → \"" + h.label + "\"]  " + h.text.slice(0, 100)))
  console.error("   العلاج: نادِ على roleLabel() من @/lib/roles، أو أعلِنِ الموضعَ فى DECLARED مع سببه.")
  process.exit(1)
}

// ───────────────── المطابقةُ مع قاعدة البيانات (اختياريّة) ─────────────────

require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })
const requireDb = process.argv.includes("--require-db")
const url = process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL غير مضبوط - لا يمكن مطابقة البيت بمفردات القاعدة."
  if (requireDb) {
    console.error("X " + msg)
    process.exit(1)
  }
  console.log("! " + msg + " تُخطّى (مرّر --require-db لجعلها قاتلة).")
  console.log("OK اسمٌ واحدٌ لوظيفةٍ واحدة، وبيتٌ واحدٌ يقولُه.")
  process.exit(0)
}

let Client
try {
  ;({ Client } = require("pg"))
} catch {
  console.error("X npm install pg --save-dev")
  process.exit(1)
}

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    const vocab = (await client.query("SELECT unnest(public.erp_membership_roles()) AS r")).rows.map((x) => x.r)
    if (!vocab.length) {
      console.error("X مفرداتُ العضويّةِ فى القاعدةِ فارغة — قراءةٌ فارغةٌ عطبٌ لا براءة.")
      process.exit(1)
    }
    const missing = vocab.filter((v) => !KEYS.includes(v))
    const extra = KEYS.filter((k) => !vocab.includes(k))
    if (missing.length || extra.length) {
      console.error("X البيتُ والقاعدةُ لا يقولانِ قولاً واحداً:")
      if (missing.length) console.error("   - تقبلُها القاعدةُ ولا يعرفُها البيت: " + missing.join(", "))
      if (extra.length) console.error("   - يعرفُها البيتُ ولا تقبلُها القاعدة: " + extra.join(", "))
      process.exit(1)
    }

    const cat = (await client.query("SELECT name, title_ar, title_en, priority FROM public.roles")).rows
    const byName = {}
    cat.forEach((r) => (byName[r.name] = r))
    const mismatch = []
    for (const r of roles) {
      const c = byName[r.key]
      if (!c) {
        mismatch.push(r.key + ": لا صفَّ له فى كتالوج الأدوار")
        continue
      }
      if (c.title_ar !== r.ar) mismatch.push(r.key + ': الاسمُ العربىُّ فى الكتالوج "' + c.title_ar + '" وفى البيت "' + r.ar + '"')
      if (c.title_en !== r.en) mismatch.push(r.key + ': الاسمُ الإنجليزىُّ فى الكتالوج "' + c.title_en + '" وفى البيت "' + r.en + '"')
      if (Number(c.priority) !== r.order) mismatch.push(r.key + ": الترتيبُ فى الكتالوج " + c.priority + " وفى البيت " + r.order)
    }
    const catExtra = cat.filter((c) => !KEYS.includes(c.name)).map((c) => c.name)
    if (catExtra.length) mismatch.push("فى الكتالوجِ وظائفُ لا يعرفُها البيت: " + catExtra.join(", "))

    if (mismatch.length) {
      console.error("X الشاشةُ والكتالوجُ يقولانِ اسمين (" + mismatch.length + "):")
      mismatch.forEach((m) => console.error("   - " + m))
      process.exit(1)
    }
    console.log("  القاعدةُ والبيتُ يقولانِ قولاً واحداً: " + vocab.length + " وظيفةً، أسماءً وترتيباً.")
    console.log("OK اسمٌ واحدٌ لوظيفةٍ واحدة، وبيتٌ واحدٌ يقولُه.")
  } finally {
    await client.end()
  }
})().catch((e) => {
  console.error("X " + (e && e.message ? e.message : String(e)))
  process.exit(1)
})

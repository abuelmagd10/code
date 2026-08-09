#!/usr/bin/env node
/**
 * check-role-name-can-be-held.js — لا يُسأل عن وظيفةٍ لا يستطيع أحدٌ أن يشغلها.
 * ---------------------------------------------------------------------------
 *   node scripts/check-role-name-can-be-held.js [--require-db]
 *   node scripts/check-role-name-can-be-held.js --selftest
 *
 * ═══ الحكاية ═══
 *
 * لنظامك **اثنتا عشرةَ وظيفةً رسميّة** لا ثالثةَ عشرةَ لها — القاعدةُ نفسُها
 * ترفض أىَّ اسمٍ خارجها. ومع ذلك كانت أبوابُ العمولات تسأل عن وظيفةٍ اسمها
 * `finance`. **لا يستطيع أحدٌ أن يشغلها ولو أراد المالك.**
 *
 * والنتيجةُ أنّ صرفَ العمولات وترحيلَها كانا للمالك وحدَه، ومحاسبُ الشركة —
 * وهو المقصودُ بـ«المسؤول المالى» — مرفوضٌ من بابٍ كُتب له. **ولا رسالةَ خطأٍ
 * تقول له لماذا**: البابُ يقول «ممنوع» ولا يقول «لأنّ الاسمَ الذى أسأل عنه
 * لا وجودَ له».
 *
 * ═══ الخاصّيّةُ الممنوعة ═══
 *
 * **اسمُ وظيفةٍ فى بابِ صلاحيّةٍ لا تقبله قاعدةُ البيانات.**
 *
 * والقائمةُ الرسميّةُ تُقرأ من **قيد القاعدة نفسِه** وقتَ التشغيل، لا من نسخةٍ
 * مكتوبةٍ هنا: فمن يضيف وظيفةً غداً لا يحتاج أن يتذكّر هذا الملفّ.
 *
 * ═══ وما ليس باباً لا يُحاكَم ═══
 *
 * لا يُفحص كلُّ نصٍّ يشبه اسمَ وظيفة. تُقرأ **ثلاثةُ أشكالٍ فقط** يكتب بها
 * هذا المشروعُ بابَ صلاحيّة: قائمةٌ باسم allowRoles · قائمةٌ يُسأل عنها
 * `.includes(دور)` · ومقارنةٌ `دور === "..."`. أمّا تصنيفُ إشعارٍ اسمُه
 * «مبيعات»، أو رسالةُ ذكاءٍ اصطناعىٍّ دورُها `user`، أو حالةُ مقعدٍ اسمُها
 * `expired` — فليست أبواباً، ولا تُحاكَم. **وحارسٌ يصرخ على البرىء يُطفأ ثمّ
 * لا يحرس شيئاً.**
 *
 * ═══ والتهجئاتُ الأخرى تُعلَن ولا تُسكت ═══
 *
 * فى المشروع مواضعُ تسمّى الوظيفةَ بتهجئةٍ أخرى —
 * `gm` و`superadmin` و`warehouse_manager` وأخواتها. وهى **غيرُ ضارّةٍ لأنّ
 * الاسمَ الصحيحَ مكتوبٌ فى الباب نفسِه**، فلا يُرفض أحد. لكنّها لا تُترك بلا
 * قاعدة: كلُّ تهجئةٍ معلَنةٌ هنا ومعها اسمُها الحقيقىّ، **ويُشترط أن يكون
 * الاسمُ الحقيقىُّ حاضراً فى نفس الباب**. فإن غاب — كما غاب فى العمولات —
 * يسقط البناء.
 * ---------------------------------------------------------------------------
 */
"use strict"
const fs = require("fs")
const path = require("path")

/**
 * تهجئاتٌ أخرى لوظائفَ حقيقيّة. الشرط: الاسمُ الحقيقىُّ حاضرٌ فى نفس الباب.
 */
const ALIASES = {
  // v3.74.993 — كانت هاتان تُنسبان إلى `general_manager`. ورُفع الاسمُ من
  // مفردات العضويّة (صفرُ عضوٍ، ولا صفَّ له فى كتالوج الأدوار، وكلُّ بابٍ
  // يسمّيه يسمّى `admin` معه). فصارتا تُنسبان إلى الاسم الحىّ.
  // **وتهجئةٌ تُنسب إلى اسمٍ محذوفٍ تُطمئن ولا تحرس.**
  gm: "admin",
  generalmanager: "admin",
  superadmin: "admin",
  super_admin: "admin",
  finance: "accountant",
  finance_manager: "accountant",
  chief_accountant: "accountant",
  warehouse_manager: "store_manager",
  branch_manager: "manager",
  sales: "staff",
  employee: "staff",
  mgr: "manager",
}

/**
 * أسماءٌ لا مقابلَ لها فى القائمة الرسميّة. تُقبل بشرطٍ واحد: أن يسمّى البابُ
 * وظيفةً حقيقيّةً واحدةً على الأقلّ — أى ألّا يكون باباً مغلقاً على الجميع.
 */
const NO_EQUIVALENT = {
  supervisor: "مشرف - لا وظيفةَ بهذا الاسم فى النظام، والبابُ يسمّى المحاسبَ معه فلا يُرفض أحد",
}

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

/** أبوابُ الصلاحيّة وحدَها — ثلاثةُ أشكالٍ لا رابعَ لها. */
function roleGates(src) {
  const m = maskComments(src)
  const out = []
  const lineAt = (idx) => m.slice(0, idx).split("\n").length
  const push = (list, idx, form) => {
    const toks = [...list.matchAll(/["']([a-z][a-z0-9_]*)["']/g)].map((t) => t[1])
    if (toks.length > 0) out.push({ toks, line: lineAt(idx), form })
  }

  let r
  const reAllow = /allowRoles\s*:\s*\[([^\]]*)\]/g
  while ((r = reAllow.exec(m)) !== null) push(r[1], r.index, "allowRoles")

  const reIncl = /\[([^\]\n]*)\]\s*\.includes\(\s*([^)]*)\)/g
  while ((r = reIncl.exec(m)) !== null) if (/\brole\b|Role\b/.test(r[2])) push(r[1], r.index, "includes(role)")

  const reSet = /new Set\(\s*\[([^\]]*)\]\s*\)\s*\.has\(\s*([^)]*)\)/g
  while ((r = reSet.exec(m)) !== null) if (/\brole\b|Role\b/.test(r[2])) push(r[1], r.index, "Set.has(role)")

  // مقارناتُ الدور تُجمع بالسطر: `role === 'a' || role === 'b'` بابٌ واحد.
  const byLine = {}
  const reCmp = /\b(?:[A-Za-z_$][\w$]*[Rr]ole|role)\b\s*(?:===|!==)\s*["']([a-z][a-z0-9_]*)["']/g
  while ((r = reCmp.exec(m)) !== null) {
    const L = lineAt(r.index)
    ;(byLine[L] = byLine[L] || []).push(r[1])
  }
  for (const L of Object.keys(byLine)) out.push({ toks: byLine[L], line: Number(L), form: "role ===" })

  return out
}

/** الحكمُ على بابٍ واحد. */
function judgeGate(gate, allowed) {
  const real = gate.toks.filter((t) => allowed.has(t))
  const strange = gate.toks.filter((t) => !allowed.has(t))
  if (strange.length === 0) return { ok: true, aliases: [] }
  // بابٌ لا يسمّى وظيفةً حقيقيّةً واحدة ليس باباً بل حائط - ولا يُحاكَم هنا:
  // فالأغلبُ أنّه ليس بابَ صلاحيّةٍ أصلاً (دورُ رسالة، حالةُ مقعد).
  if (real.length === 0) return { ok: true, aliases: [] }

  const bad = []
  const aliases = []
  for (const s of strange) {
    if (Object.prototype.hasOwnProperty.call(NO_EQUIVALENT, s)) { aliases.push(s); continue }
    const good = ALIASES[s]
    if (!good) { bad.push({ tok: s, why: "اسمٌ غيرُ معروفٍ ولا تقبله القاعدة" }); continue }
    if (!gate.toks.includes(good)) { bad.push({ tok: s, why: "الاسمُ الحقيقىُّ «" + good + "» غائبٌ عن هذا الباب - فصاحبُه مرفوض" }); continue }
    aliases.push(s)
  }
  return { ok: bad.length === 0, bad, aliases }
}

// ───────────────────────────── الفخُّ الذاتىّ ─────────────────────────────

if (process.argv.includes("--selftest")) {
  const A = new Set(["owner", "admin", "manager", "accountant", "staff", "store_manager"])
  const one = (src) => {
    const gates = roleGates(src)
    let bad = 0
    for (const g of gates) { const v = judgeGate(g, A); if (!v.ok) bad += v.bad.length }
    return bad
  }
  const cases = [
    ["يرفض بابَ العمولات: اسمٌ لا يشغله أحدٌ والمحاسبُ غائب",
     "if (!['owner', 'admin', 'finance'].includes(m.role)) return\n", 1],
    ["ويعفو حين يكون المحاسبُ حاضراً بجانبه",
     'allowRoles: ["owner", "admin", "finance", "accountant"]\n', 0],
    ["ويرفض اسماً لم يُعلَن أصلاً",
     "if (!['owner', 'chief_of_staff'].includes(m.role)) return\n", 1],
    ["ولا يحاكم دورَ رسالةٍ فى الذكاء الاصطناعىّ",
     "if (msg.role === 'user' || msg.role === 'assistant') return\n", 0],
    ["ولا حالةَ مقعدٍ اسمُها expired",
     "if (seat.role === 'free_owner' || seat.role === 'expired') return\n", 0],
    ["ويجمع المقارناتِ على السطر الواحد باباً واحداً",
     "const isStaff = userRole === 'staff' || userRole === 'sales'\n", 0],
    ["ولا يحكم على ذكرٍ داخل تعليق",
     "// allowRoles: [\"owner\", \"finance\"]\nconst x = 1\n", 0],
    ["ويرى القائمةَ المسمّاة allowRoles",
     'allowRoles: ["owner", "finance"]\n', 1],
  ]
  let fail = 0
  for (const [name, src, expected] of cases) {
    const got = one(src)
    const ok = got === expected
    if (!ok) fail++
    console.log((ok ? "  ok  " : "  X   ") + name + "  (توقّعتُ " + expected + " فجاء " + got + ")")
  }
  if (fail > 0) { console.error("X سقط الفخُّ الذاتىّ فى " + fail + " اتّجاه."); process.exit(1) }
  console.log("  الفخُّ الذاتىّ: " + cases.length + " اتّجاهاتٍ، كلُّها صحيحة.")
  process.exit(0)
}

// ───────────────────────────── التشغيل ─────────────────────────────

require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
const url = process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL غير مضبوط - لا يمكن قراءة الوظائف الرسميّة."
  if (requireDb) { console.error("X " + msg); process.exit(1) }
  console.log("! " + msg + " تُخطّى (مرّر --require-db لجعلها قاتلة).")
  process.exit(0)
}

let Client
try { ({ Client } = require("pg")) } catch { console.error("X npm install pg --save-dev"); process.exit(1) }

const ROOT = process.cwd()
function walk(d, o) {
  let e
  try { e = fs.readdirSync(d, { withFileTypes: true }) } catch { return o }
  for (const x of e) {
    const p = path.join(d, x.name)
    if (/node_modules|[\\/]\.next|[\\/]\.git/.test(p)) continue
    if (x.isDirectory()) walk(p, o)
    else if (/\.(ts|tsx)$/.test(x.name)) o.push(p)
  }
  return o
}

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let allowed
  try {
    const { rows } = await client.query(`
      SELECT pg_get_constraintdef(c.oid) AS def
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = 'public' AND t.relname = 'company_members' AND c.contype = 'c'
         AND pg_get_constraintdef(c.oid) ILIKE '%role%'
       LIMIT 1`)
    const def = rows[0] && rows[0].def
    allowed = new Set(def ? [...def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]) : [])
  } finally {
    await client.end()
  }
  if (allowed.size === 0) {
    console.error("X لم أقرأ الوظائفَ الرسميّةَ من القاعدة - لا أحكم على شىءٍ بلا مقياس.")
    process.exit(1)
  }

  const files = [...walk(path.join(ROOT, "app"), []), ...walk(path.join(ROOT, "lib"), []), ...walk(path.join(ROOT, "components"), [])]
  const offences = []
  let aliasCount = 0
  const aliasSeen = {}

  for (const abs of files) {
    const rel = path.relative(ROOT, abs).split(path.sep).join("/")
    const src = fs.readFileSync(abs, "utf8")
    if (!/allowRoles|\.includes\(|===|!==/.test(src)) continue
    for (const g of roleGates(src)) {
      const v = judgeGate(g, allowed)
      for (const a of v.aliases) { aliasCount++; aliasSeen[a] = (aliasSeen[a] || 0) + 1 }
      if (!v.ok) for (const b of v.bad) offences.push({ rel, line: g.line, form: g.form, ...b })
    }
  }

  console.log("  الوظائفُ الرسميّةُ فى القاعدة: " + allowed.size + "   ·   تهجئاتٌ أخرى معلَنةٌ ومقبولة: " + aliasCount)
  const parts = Object.entries(aliasSeen).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + " " + n)
  if (parts.length > 0) console.log("     " + parts.join(" · "))

  if (offences.length > 0) {
    console.error("")
    console.error("X بابٌ يسأل عن وظيفةٍ لا يستطيع أحدٌ أن يشغلها - فيُرفض صاحبُ الحقّ بلا أن يعرف لماذا:")
    for (const o of offences) console.error("   " + o.rel + ":" + o.line + "   «" + o.tok + "»   " + o.why)
    console.error("")
    console.error("   العلاج: اكتب الاسمَ الرسمىَّ الذى تقبله القاعدة، أو أضِفه بجانب التهجئة.")
    process.exit(1)
  }

  console.log("  ok  كلُّ اسمٍ فى كلِّ بابِ صلاحيّةٍ يستطيع أحدٌ أن يشغله.")
})().catch((e) => {
  console.error("X فشل: " + ((e && e.message) || e))
  process.exit(1)
})

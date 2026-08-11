#!/usr/bin/env node
/**
 * check-db-no-door-to-nobody.js — لا بابَ فى قاعدةِ البيانات مفتوحٌ على لا أحد.
 * ---------------------------------------------------------------------------
 *   node scripts/check-db-no-door-to-nobody.js [--require-db]
 *   node scripts/check-db-no-door-to-nobody.js --selftest
 *
 * ═══ لماذا وُجد ═══
 *
 * فى سياسةِ تعديلِ المصروفات شرطٌ يقول: «أو مَن وظيفتُه general_manager أو gm
 * أو generalmanager». وهذه الأسماءُ الثلاثةُ **لا يقبلها قيدُ الوظائف أصلاً**،
 * فالشرطُ يُنفَّذ على كلِّ صفٍّ يُقرأ **ولا يُدخل أحداً أبداً**.
 *
 * وهذا أخطرُ من الخطأِ الصريح: قارئُ السياسةِ يظنُّ أنّ للمديرِ العامِّ باباً،
 * فيبنى عليه قراراً — والبابُ مرسومٌ على الحائط.
 * **والطمأنينةُ الكاذبة أسوأُ من الغياب.**
 *
 * ═══ الخاصّيّةُ المحكومة ═══
 *
 * **سياسةُ الرؤية بابٌ دائماً** — لا فحصٌ ولا خريطةٌ ولا رسالة. فكلُّ مقارنةٍ
 * فى سياسةٍ بين عمودِ وظيفةٍ ومجموعةِ أسماءٍ **كلُّها خارجَ المفرداتِ الحيّة**
 * بابٌ على لا أحد، وتُسقِط البناءَ باسمها.
 *
 * **ووظيفةُ الجلسةِ ليست وظيفةَ الموظّف:** `auth.role() = 'service_role'` تسألُ
 * عن هويّةِ الاتّصالِ بقاعدةِ البيانات لا عن وظيفةِ العضوِ فى الشركة. وتُميَّز
 * بخاصّيّةٍ لا بشكل: بعدَها قوسٌ — فهى نداءُ دالّةٍ لا عمودُ جدول.
 *
 * ولا يُحاكَم ما ليس وظيفةً: `status`, `p_demand_type`, `category` — ولا قائمةٌ
 * فيها اسمٌ حىٌّ واحدٌ على الأقلّ (تلك تهجئاتٌ ميّتةٌ يتولّاها حارسٌ آخر).
 * **وحارسٌ يصرخ على البرىء يُطفأ ثمّ لا يحرس شيئاً.**
 *
 * وتُحكم السياساتُ وحدَها، لا أجسامُ الدوالّ: فى الدوالِّ فحوصٌ مرجعيّةٌ
 * تُسمّى الاسمَ الميّتَ **لتُثبت أنّ أحداً لا يشغله** — وهى نقيضُ الباب.
 * **ولا يُحاكَم فحصٌ بتهمةِ ما يفحصه.**
 * ---------------------------------------------------------------------------
 */
"use strict"

/**
 * يستخرج مقارناتِ الوظيفةِ من نصِّ سياسة.
 * يقبل: cm.role = ANY (ARRAY[...]) · role IN ('a','b') · cm.role = 'a'::text
 *       lower(TRIM(BOTH FROM cm.role)) = ANY (ARRAY[...])
 */
function roleComparisons(sql) {
  const out = []
  // (?<!['"]) — ليس اسماً داخل نصّ مثل current_setting('role')
  // (?!\s*\()  — ليس نداءَ دالّةٍ مثل auth.role()  **ووظيفةُ الجلسةِ ليست وظيفةَ الموظّف**
  const RE = /(?<!['"])\brole\b(?!\s*\()[^=<>!]{0,60}?(?:=\s*ANY\s*\(\s*ARRAY\s*\[([^\]]*)\]|=\s*('[a-z_]+')|IN\s*\(\s*((?:'[a-z_]+'\s*(?:::text)?\s*,?\s*)+)\))/gi
  let m
  while ((m = RE.exec(sql))) {
    const body = m[1] || m[2] || m[3] || ""
    const toks = [...body.matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
    if (toks.length) out.push({ at: m.index, toks })
  }
  return out
}

/** بابٌ على لا أحد: لا اسمَ واحدٌ من المجموعةِ فى المفرداتِ الحيّة. */
function isDoorToNobody(toks, liveVocab) {
  return toks.length > 0 && !toks.some((t) => liveVocab.includes(t))
}

if (process.argv.includes("--selftest")) {
  const V = ["owner", "admin", "manager", "accountant", "staff", "viewer", "store_manager"]
  const count = (sql, vocab) =>
    roleComparisons(sql).filter((g) => isDoorToNobody(g.toks, vocab || V)).length
  const cases = [
    ["يرى البابَ المفتوحَ على لا أحد", "cm.role = ANY (ARRAY['general_manager'::text, 'gm'::text, 'generalmanager'::text])", 1],
    ["ويراه باسمٍ واحدٍ ميّت", "cm.role = 'zz_nobody'::text", 1],
    ["ولا يحاكم باباً فيه اسمٌ حىٌّ واحد", "cm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'general_manager'::text])", 0],
    ["ولا باباً حيّاً بحته", "cm.role = 'admin'::text", 0],
    ["ولا حالةَ مستندٍ ليست وظيفة", "status = ANY (ARRAY['draft'::text, 'rejected'::text])", 0],
    ["ولا نوعَ طلبٍ اسمُه sales", "p_demand_type = 'sales'::text", 0],
    ["ويرى الشكلَ المُطبَّعَ بـ lower/TRIM", "lower(TRIM(BOTH FROM cm.role)) = ANY (ARRAY['gm'::text])", 1],
    ["ولا يحاكمه إن كان فيه حىّ", "lower(TRIM(BOTH FROM cm.role)) = ANY (ARRAY['owner'::text, 'general_manager'::text])", 0],
    ["ويرى شكلَ IN", "role IN ('gm', 'generalmanager')", 1],
    ["ولا يحاكم عمودَ معرّفٍ لا وظيفة", "role_id = ANY (ARRAY['a1b2'::uuid])", 0],
    ["ولا وظيفةَ الجلسةِ auth.role()", "(auth.role() = 'service_role'::text)", 0],
    ["ولا auth.role() بقائمة", "auth.role() = ANY (ARRAY['service_role'::text, 'authenticated'::text])", 0],
    ["ولا اسماً داخل نصٍّ current_setting('role')", "current_setting('role') = 'zz_nobody'::text", 0],
    ["ويظلّ يرى العمودَ المؤهَّلَ بجدوله", "company_members.role = ANY (ARRAY['gm'::text])", 1],
  ]
  let fail = 0
  for (const [name, sql, exp] of cases) {
    const got = count(sql)
    if (got !== exp) fail++
    console.log((got === exp ? "  ok  " : "  X   ") + name + "  (توقّعتُ " + exp + " فجاء " + got + ")")
  }
  // الاتّجاهُ الحاسم: تُحذف وظيفةٌ من المفردات، فينقلبُ بابُها إلى بابٍ على لا أحد
  const got = count("cm.role = 'accountant'::text", V.filter((r) => r !== "accountant"))
  const ok = got === 1
  if (!ok) fail++
  console.log((ok ? "  ok  " : "  X   ") + "ويسقط حين تُحذف وظيفةٌ من المفردات ويبقى بابُها  (توقّعتُ 1 فجاء " + got + ")")
  if (fail) { console.error("X سقط الفخُّ الذاتىّ فى " + fail + " اتّجاه."); process.exit(1) }
  console.log("  الفخُّ الذاتىّ: " + (cases.length + 1) + " اتّجاهاً، كلُّها صحيحة.")
  process.exit(0)
}

require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })
const requireDb = process.argv.includes("--require-db")
const url = process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL غير مضبوط - لا يمكن قراءة السياسات الحيّة."
  if (requireDb) { console.error("X " + msg); process.exit(1) }
  console.log("! " + msg + " تُخطّى (مرّر --require-db لجعلها قاتلة).")
  process.exit(0)
}
let Client
try { ({ Client } = require("./lib/live-db")) } catch { console.error("X npm install pg --save-dev"); process.exit(1) }

;(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()
  try {
    const vocab = (await c.query("SELECT unnest(public.erp_membership_roles()) AS r")).rows.map((x) => x.r)
    if (!vocab.length) { console.error("X مفرداتٌ فارغةٌ من القاعدة — عطبٌ لا براءة."); process.exit(1) }

    const pols = (await c.query(`SELECT n.nspname||'.'||c.relname||' / '||pol.polname AS name,
        coalesce(pg_get_expr(pol.polqual,pol.polrelid),'')||' ||| '||coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),'') AS def
      FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','storage')`)).rows

    let comparisons = 0
    const bad = []
    for (const p of pols) {
      for (const g of roleComparisons(p.def)) {
        comparisons++
        if (isDoorToNobody(g.toks, vocab)) bad.push(p.name + "  [" + g.toks.join(", ") + "]")
      }
    }
    console.log("  المفرداتُ الحيّة: " + vocab.length + " وظيفة")
    console.log("  سياساتٌ مفحوصة: " + pols.length + "   ·   مقارناتُ وظيفةٍ داخلها: " + comparisons)
    if (pols.length === 0 || comparisons === 0) {
      console.error("X لم أجد مقارنةَ وظيفةٍ واحدة — **بحثٌ لا يجد ليس دليلَ غياب.**")
      process.exit(1)
    }
    if (bad.length) {
      console.error("\nX بابٌ مفتوحٌ على لا أحد (" + bad.length + ") — يُنفَّذ على كلِّ صفٍّ ولا يُدخل أحداً:")
      bad.forEach((b) => console.error("   " + b))
      console.error("\n   العلاج: احذفِ الشرطَ كلَّه (لا الأسماءَ وحدَها، فقائمةٌ فارغةٌ ملتبسة)،")
      console.error("   أو صحّحِ الاسمَ إلى وظيفةٍ يقبلها النظام.")
      process.exit(1)
    }
    console.log("  ok  كلُّ بابٍ فى السياساتِ يستطيع أحدٌ أن يدخله — ولا بابَ مرسومٌ على الحائط.")
  } finally { await c.end() }
})().catch((e) => { console.error("X " + ((e && e.message) || e)); process.exit(1) })

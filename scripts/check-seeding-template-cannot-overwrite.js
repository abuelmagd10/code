#!/usr/bin/env node
/**
 * check-seeding-template-cannot-overwrite.js — القالبُ أرضيّةٌ لا سقف.
 * ---------------------------------------------------------------------------
 *   node scripts/check-seeding-template-cannot-overwrite.js [--require-db]
 *   node scripts/check-seeding-template-cannot-overwrite.js --selftest
 *
 * ═══ لماذا وُجد ═══
 *
 * عند ميلادِ كلِّ شركةٍ يعملُ بذّاران: يدوىٌّ مكتوبٌ فى دوالّ، وقالبٌ يُقرأ من
 * كتالوجِ الصلاحيّات. وقِيس تصادمُهما بتجربةٍ حقيقيّةٍ أُلغيت: يتداخلانِ فى
 * **٣٤ زوجاً** ويختلفانِ فى **٢٥**. ومُشغِّلُ القالبِ يعملُ **بعد** اليدوىِّ
 * (ترتيبُ الأسماء) وكان يستعملُ `DO UPDATE` — **فيكتبُ فوقَه صامتاً**.
 *
 * وكان الأثرُ حيّاً: مسؤولُ المخزنِ صار **عرضاً فقط** على المخزونِ فى الشركاتِ
 * الأحدث، ومديرُ الفرعِ صار يملكُ **الحذفَ** على إحدى عشرةَ شاشةً خلافاً
 * للمواصفةِ المكتوبةِ فى `lib/role-default-pages.ts`.
 *
 * ═══ الخاصّيّتانِ المحكومتان ═══
 *
 * **(أ) القالبُ لا يملكُ المحو:** `copy_default_permissions_for_company` يجب
 * ألّا يحملَ `ON CONFLICT … DO UPDATE`. فهو يملأُ الفراغَ ولا يمحو قراراً —
 * لا قرارَ بذّارٍ سبقَه، **ولا قرارَ صاحبِ البيتِ فى شاشتِه**.
 *
 * **(ب) الترتيبُ يبقى:** اسمُ مُشغِّلِ البذرِ اليدوىِّ يجب أن يسبقَ اسمَ مُشغِّلِ
 * القالبِ أبجديّاً — فبهذا يُنفَّذ أوّلاً، ومع `DO NOTHING` يبقى قولُه.
 *
 * ولا يُحاكَمُ **مقدارُ** الصلاحيّة: قِيمُ الأعلامِ اختيارُ المالكِ فى شاشتِه.
 * **ولا يُحاكَم قرارٌ يملكُه صاحبُه** — المحروسُ هنا البنيةُ لا القيمة.
 * ---------------------------------------------------------------------------
 */
"use strict"

const OVERWRITE = /ON\s+CONFLICT[^;]*DO\s+UPDATE/i
const FILLONLY = /ON\s+CONFLICT[^;]*DO\s+NOTHING/i

/** **التعليقُ ليس تعليمة**: تُطرح أسطرُ التعليقِ قبلَ الحكم. */
function stripComments(sql) {
  return String(sql).replace(/--[^\n]*/g, " ")
}

function judgeTemplate(sql) {
  const s = stripComments(sql)
  if (OVERWRITE.test(s)) return "يكتبُ فوقَ صفٍّ قائم"
  if (!FILLONLY.test(s)) return "بلا شرطِ تعارضٍ معروف"
  return null
}

/** اليدوىُّ يجب أن يسبقَ القالبَ أبجديّاً. */
function judgeOrder(handTrigger, templateTrigger) {
  if (!handTrigger || !templateTrigger) return "أحدُ مُشغِّلَى البذرِ غائب"
  if (handTrigger >= templateTrigger) return "القالبُ صار يسبقُ اليدوىَّ: " + templateTrigger + " ثمّ " + handTrigger
  return null
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["يقبل قالباً يملأُ الفراغ", judgeTemplate("insert into t values (1) on conflict (a,b) do nothing;"), null],
    ["ويرفض قالباً يمحو", judgeTemplate("insert into t values (1) on conflict (a,b) do update set x = 1;") !== null, true],
    ["ويرفض قالباً بلا شرطِ تعارض", judgeTemplate("insert into t values (1);") !== null, true],
    ["ولا يحكم على تعليقٍ يذكرُ ما كان", judgeTemplate("-- كان do update فتغيّر\ninsert into t values (1) on conflict (a) do nothing;"), null],
    ["ولا يخدعه تعليقٌ بعدَ الجملة", judgeTemplate("insert into t values (1) on conflict (a) do nothing; -- كان on conflict do update"), null],
    ["ويرى المحوَ ولو بأحرفٍ كبيرة", judgeTemplate("INSERT INTO t VALUES (1) ON CONFLICT (a) DO UPDATE SET x=1;") !== null, true],
    ["ويقبل الترتيبَ الصحيح", judgeOrder("trg_auto_seed", "trg_copy_permissions"), null],
    ["ويرفض الترتيبَ المقلوب", judgeOrder("trg_zzz_seed", "trg_copy_permissions") !== null, true],
    ["ويرفض غيابَ مُشغِّل", judgeOrder(null, "trg_copy_permissions") !== null, true],
  ]
  let fail = 0
  for (const [name, got, exp] of cases) {
    const ok = got === exp
    if (!ok) fail++
    console.log((ok ? "  ok  " : "  X   ") + name + "  (توقّعتُ " + exp + " فجاء " + got + ")")
  }
  if (fail) { console.error("X سقط الفخُّ الذاتىّ فى " + fail + " اتّجاه."); process.exit(1) }
  console.log("  الفخُّ الذاتىّ: " + cases.length + " اتّجاهاً، كلُّها صحيحة.")
  process.exit(0)
}

require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })
const requireDb = process.argv.includes("--require-db")
const url = process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL غير مضبوط - لا يمكن قراءة البذّارَين."
  if (requireDb) { console.error("X " + msg); process.exit(1) }
  console.log("! " + msg + " تُخطّى (مرّر --require-db لجعلها قاتلة).")
  process.exit(0)
}
let Client
try { ({ Client } = require("pg")) } catch { console.error("X npm install pg --save-dev"); process.exit(1) }

;(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()
  try {
    const tpl = (await c.query(`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='copy_default_permissions_for_company'`)).rows[0]
    if (!tpl) { console.error("X بذّارُ القالبِ غائبٌ من القاعدة — عطبٌ لا براءة."); process.exit(1) }

    const trg = (await c.query(`SELECT t.tgname, p.proname
      FROM pg_trigger t JOIN pg_class c2 ON c2.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
      WHERE c2.relname='companies' AND NOT t.tgisinternal
        AND p.proname IN ('trg_auto_seed_role_permissions','trigger_copy_permissions_on_company_create')`)).rows
    const hand = (trg.find((r) => r.proname === "trg_auto_seed_role_permissions") || {}).tgname
    const tplTrg = (trg.find((r) => r.proname === "trigger_copy_permissions_on_company_create") || {}).tgname

    const bad1 = judgeTemplate(tpl.prosrc)
    const bad2 = judgeOrder(hand, tplTrg)

    console.log("  مُشغِّلُ البذرِ اليدوىّ : " + (hand || "(غائب)"))
    console.log("  مُشغِّلُ القالب        : " + (tplTrg || "(غائب)"))
    console.log("  شرطُ التعارضِ فى القالب: " + (FILLONLY.test(stripComments(tpl.prosrc)) ? "DO NOTHING" : OVERWRITE.test(stripComments(tpl.prosrc)) ? "DO UPDATE" : "(بلا شرط)"))

    let bad = 0
    if (bad1) { bad++; console.error("\nX القالبُ ليس أرضيّةً: " + bad1) }
    if (bad2) { bad++; console.error("\nX ترتيبُ البذر: " + bad2) }
    if (bad) {
      console.error("\n   العلاج: DO NOTHING فى بذّارِ القالب، وإبقاءُ اسمِ مُشغِّلِ اليدوىِّ سابقاً أبجديّاً.")
      console.error("   **ولا يُكتَب فوقَ اختيارِ صاحبِ البيت.**")
      process.exit(1)
    }
    console.log("  ok  القالبُ يملأُ الفراغَ ولا يمحو قراراً، واليدوىُّ يسبقُه — فقولُه هو الباقى.")
  } finally { await c.end() }
})().catch((e) => { console.error("X " + ((e && e.message) || e)); process.exit(1) })

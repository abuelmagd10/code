#!/usr/bin/env node
/**
 * check-the-template-says-what-is-granted.js
 * **وقالبٌ يمنحُ أكثرَ ممّا يمنحُه الواقعُ قنبلةٌ موقوتة.**
 * ---------------------------------------------------------------------------
 *   node scripts/check-the-template-says-what-is-granted.js [--require-db]
 *   node scripts/check-the-template-says-what-is-granted.js --selftest
 *
 * ═══ الحادثةُ التى وُلد منها ═══
 *
 * وصفةُ الشركةِ الجديدةِ كانت مكتوبةً فى مكانَين: **قالبٌ مُعلَنٌ** فى جدولَى
 * `permissions` و`role_default_permissions`، و**تِسعُ دوالِّ بذرٍ مكتوبةٍ بيد**.
 *
 * فوُلِدت شركةٌ حقيقيّةٌ فى معاملةٍ أُلغيت، ثمّ مُحِيَت صفوفُها وشُغِّل القالبُ
 * وحدَه، وقُورن الاثنان. والمولودُ ينالُ **٢٥٧** صفّاً بـ**١١** وظيفةً و**٥٤**
 * مورداً؛ والقالبُ وحدَه كان ينتجُ **٢٠٢**، ويجهلُ **أربعَ وظائفَ كاملة**.
 *
 * والأخطرُ أنّ الخلافَ كان فى اتّجاهَين: **فى ثلاثةَ عشرَ زوجاً كان القالبُ
 * أسخى من الواقع**، منها اثنا عشرَ لـ`manager` — مديرِ الفرع. فالقالبُ يقولُ
 * إنّه يُنشئ ويعدّلُ **ويحذفُ** الفواتيرَ والمدفوعاتِ وأوامرَ الشراءِ والموردين؛
 * والواقعُ يعطيه **العرضَ فقط**.
 *
 * ولم يظهرْ أثرُه لأنّ البذّارَ اليدوىَّ يسبقُه و`DO NOTHING` تحميه. لكنّ أىَّ
 * زوجٍ ناقصٍ يُملأُ من القالب — **فيُمنحُ مديرُ الفرعِ حذفَ الفواتيرِ بلا أن
 * يقرّرَ ذلك أحد**.
 *
 * ═══ الخاصّيّةُ المحكومة ═══
 *
 * **(أ)** كتالوجُ الصلاحيّاتِ لا يتخلّفُ عن الواقع: كلُّ موردٍ تحملُه شركةٌ حيّةٌ
 *        له بيتٌ فى `permissions`. **وقالبٌ لا يعرفُ المورد لا يستطيع أن يبذرَه.**
 *
 * **(ب)** والقالبُ يعرفُ كلَّ وظيفةٍ حيّة — لا سبعاً من إحدى عشرة.
 *
 * **(ج)** ولا يعرفُ القالبُ وظيفةً أو فعلاً بلا بيت. (يحرسُه الرباطُ منذ v3.75.13،
 *        ويُقاسُ هنا أيضاً — **وحارسٌ واحدٌ ليس حارسَين**.)
 *
 * **(د)** ولا يذكرُ القالبُ مورداً لا تحملُه شركةٌ واحدةٌ حيّة — **فقالبٌ يمنحُ
 *        ما لا وجودَ له يمنحُ فى الظلام**.
 *
 * ⚠️ وأمّا المقارنةُ الكاملةُ — **ولادةٌ حقيقيّةٌ تُقاسُ ثمّ تُلغى** — فمكانُها
 * الفحصُ المرجعىُّ `assert_baseline_v3_75_14_check`، لأنّها تكتبُ فى القاعدةِ
 * ثمّ تتراجع. وهذا الحارسُ يقيسُ ما يُقاسُ **بلا كتابةِ صفٍّ واحد**.
 *
 * ═══ وما ليس من هذا الحكم ═══
 *
 *   • `allowed_actions` الدقيقُ يبقى للبذّار: **الأفعالُ التفصيليّةُ ليست قالباً**،
 *     والمضبوطُ هى الأعلامُ الخمسةُ التى يُبنى عليها الحكم.
 *   • و`all_access` **لا يُشتقُّ من القالبِ أصلاً** بل يحسبُه الناسخُ من اسمِ
 *     الوظيفة — فلا يُحاكَمُ هنا. **والفحصُ لا يحاكمُ ما لا يملكُه المفحوص.**
 * ---------------------------------------------------------------------------
 */
"use strict"

// **ولا يُنادى اسمٌ يسكنُه غيرُه** — حكمُ الاتّصالِ وإعادتُه فى بيتٍ واحد.
const { withLiveDatabase } = require("./lib/live-db")

/**
 * (أ) موردٌ تحملُه شركةٌ حيّةٌ ولا يعرفُه الكتالوج.
 * @returns {string[]} أسماءُ الموارد اليتيمة
 */
function judgeCatalogueBehind(usedResources, catalogueResources) {
  const cat = new Set((catalogueResources || []).map(String))
  return (usedResources || []).map(String).filter((r) => !cat.has(r)).sort()
}

/** (ب) وظيفةٌ حيّةٌ لا يعرفُها القالب. */
function judgeTemplateBlindToRoles(liveRoles, templateRoles) {
  const tpl = new Set((templateRoles || []).map(String))
  return (liveRoles || []).map(String).filter((r) => !tpl.has(r)).sort()
}

/** (ج) اسمٌ فى القالبِ لا بيتَ له — وظيفةً كان أو فعلاً. */
function judgeTemplateOrphans(templateRoles, liveRoles, templateActions, catalogueActions) {
  const live = new Set((liveRoles || []).map(String))
  const cat = new Set((catalogueActions || []).map(String))
  const out = []
  for (const r of (templateRoles || []).map(String)) if (!live.has(r)) out.push("وظيفة: " + r)
  for (const a of (templateActions || []).map(String)) if (!cat.has(a)) out.push("فعل: " + a)
  return out.sort()
}

/** (د) موردٌ فى القالبِ لا تحملُه شركةٌ واحدة. */
function judgeTemplateInTheDark(templateResources, usedResources) {
  const used = new Set((usedResources || []).map(String))
  return (templateResources || []).map(String).filter((r) => !used.has(r)).sort()
}

if (process.argv.includes("--selftest")) {
  const cases = []
  const t = (name, got, exp) => cases.push([name, got, exp])

  // ── (أ) الكتالوجُ يتخلّفُ عن الواقع، فى الاتّجاهين ───────────────────────
  t("يرى مورداً يحملُه الواقعُ ولا يعرفُه الكتالوج",
    judgeCatalogueBehind(["invoices", "expenses"], ["invoices"]).length, 1)
  t("ويُسمّيه بعينِه", judgeCatalogueBehind(["invoices", "expenses"], ["invoices"])[0], "expenses")
  t("ويعدُّ خمسةَ عشرَ خمسةَ عشر",
    judgeCatalogueBehind(Array.from({ length: 15 }, (_, i) => "r" + i), []).length, 15)
  t("ولا يصرخُ حين يغطّى الكتالوجُ كلَّ شىء",
    judgeCatalogueBehind(["invoices"], ["invoices", "expenses"]).length, 0)
  t("ويقبلُ الفراغ", judgeCatalogueBehind([], ["invoices"]).length, 0)
  t("ولا يخدعه كتالوجٌ فارغٌ وواقعٌ فارغ", judgeCatalogueBehind([], []).length, 0)

  // ── (ب) القالبُ أعمى عن وظيفة، فى الاتّجاهين ────────────────────────────
  t("يرى وظيفةً حيّةً لا يعرفُها القالب",
    judgeTemplateBlindToRoles(["owner", "hr_officer"], ["owner"]).length, 1)
  t("ويُسمّيها", judgeTemplateBlindToRoles(["owner", "hr_officer"], ["owner"])[0], "hr_officer")
  t("ويرى الأربعَ التى كانت غائبة",
    judgeTemplateBlindToRoles(["booking_officer", "hr_officer", "manufacturing_officer", "purchasing_officer"], []).length, 4)
  t("ولا يصرخُ حين يعرفُها كلَّها",
    judgeTemplateBlindToRoles(["owner", "admin"], ["owner", "admin", "staff"]).length, 0)

  // ── (ج) اسمٌ فى القالبِ بلا بيت، فى الاتّجاهين ──────────────────────────
  t("يرى وظيفةً فى القالبِ لا بيتَ لها",
    judgeTemplateOrphans(["zz_ghost"], ["owner"], [], []).length, 1)
  t("ويُسمّيها وظيفةً لا فعلاً",
    /^وظيفة: /.test(judgeTemplateOrphans(["zz_ghost"], ["owner"], [], [])[0]), true)
  t("ويرى فعلاً لا بيتَ له",
    judgeTemplateOrphans([], [], ["banking:update"], ["banking:read"]).length, 1)
  t("ويُسمّيه فعلاً",
    /^فعل: /.test(judgeTemplateOrphans([], [], ["banking:update"], ["banking:read"])[0]), true)
  t("ويجمعُ الاثنين",
    judgeTemplateOrphans(["zz"], ["owner"], ["a:b"], ["c:d"]).length, 2)
  t("ولا يصرخُ على قالبٍ سليم",
    judgeTemplateOrphans(["owner"], ["owner"], ["a:b"], ["a:b"]).length, 0)

  // ── (د) موردٌ فى القالبِ لا وجودَ له، فى الاتّجاهين ─────────────────────
  t("يرى مورداً يمنحُه القالبُ ولا تحملُه شركة",
    judgeTemplateInTheDark(["invoices", "zz_nowhere"], ["invoices"]).length, 1)
  t("ويُسمّيه", judgeTemplateInTheDark(["invoices", "zz_nowhere"], ["invoices"])[0], "zz_nowhere")
  t("ولا يصرخُ على قالبٍ كلُّه مستعمَل",
    judgeTemplateInTheDark(["invoices"], ["invoices", "expenses"]).length, 0)

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
  const msg = "PRODUCTION_SUPABASE_DB_URL غير مضبوط - لا يمكن قراءة القالب."
  if (requireDb) { console.error("X " + msg); process.exit(1) }
  console.log("! " + msg + " تُخطّى (مرّر --require-db لجعلها قاتلة).")
  process.exit(0)
}

;(async () => {
  const d = await withLiveDatabase(url, async (c) => {
    const r = (await c.query(`
      SELECT
        (SELECT array_agg(DISTINCT resource) FROM public.company_role_permissions)::text[]   AS used_resources,
        (SELECT array_agg(DISTINCT resource) FROM public.permissions)::text[]                AS cat_resources,
        (SELECT array_agg(action) FROM public.permissions)::text[]                           AS cat_actions,
        (SELECT array_agg(name) FROM public.roles)::text[]                                   AS live_roles,
        (SELECT array_agg(DISTINCT role_name) FROM public.role_default_permissions)::text[]   AS tpl_roles,
        (SELECT array_agg(DISTINCT split_part(permission_action, ':', 1))
           FROM public.role_default_permissions)::text[]                                     AS tpl_resources,
        (SELECT array_agg(DISTINCT permission_action) FROM public.role_default_permissions)::text[] AS tpl_actions,
        (SELECT count(*) FROM public.role_default_permissions)::int                          AS tpl_rows,
        (SELECT count(*) FROM public.companies)::int                                         AS companies,
        (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'assert_baseline_v3_75_14_check')::int  AS baseline_there,
        (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'assert_baseline_v3_75_14_check'
            AND (has_function_privilege('anon', p.oid, 'EXECUTE')
              OR has_function_privilege('authenticated', p.oid, 'EXECUTE')))::int            AS baseline_open`)).rows[0]
    return r
  })

  const problems = []

  // **ولا يُقرأُ فراغٌ ويُسمّى سلاماً**
  if (!d.companies) problems.push(["لا شركةَ واحدةً فى القاعدة — بحثٌ لا يجد ليس دليلَ غياب", []])
  if (!d.tpl_rows) problems.push(["القالبُ فارغٌ تماماً — بحثٌ لا يجد ليس دليلَ غياب", []])

  const behind = judgeCatalogueBehind(d.used_resources, d.cat_resources)
  if (behind.length) problems.push(["موردٌ تحملُه شركةٌ حيّةٌ ولا بيتَ له فى الكتالوج", behind])

  const blind = judgeTemplateBlindToRoles(d.live_roles, d.tpl_roles)
  if (blind.length) problems.push(["وظيفةٌ حيّةٌ لا يعرفُها القالب — فتُولدُ الشركةُ ناقصةً لو غابَ البذّار", blind])

  const orphans = judgeTemplateOrphans(d.tpl_roles, d.live_roles, d.tpl_actions, d.cat_actions)
  if (orphans.length) problems.push(["اسمٌ فى القالبِ بلا بيت", orphans])

  const dark = judgeTemplateInTheDark(d.tpl_resources, d.used_resources)
  if (dark.length) problems.push(["موردٌ يمنحُه القالبُ ولا تحملُه شركةٌ واحدة", dark])

  if (!Number(d.baseline_there)) {
    problems.push(["الفحصُ المرجعىُّ assert_baseline_v3_75_14_check غائب — وهو وحدَه يقيسُ الولادةَ الحقيقيّة", []])
  } else if (Number(d.baseline_open)) {
    problems.push(["الفحصُ المرجعىُّ يبلغُه زائرٌ أو مستخدم — **وحارسٌ يُفتَحُ بابُه ليس حارساً**", []])
  }

  console.log("  الموارد: " + (d.used_resources || []).length + " مستعمَلة  ·  " +
    (d.cat_resources || []).length + " فى الكتالوج  ·  " + (d.tpl_resources || []).length + " فى القالب")
  console.log("  الوظائف: " + (d.live_roles || []).length + " حيّة  ·  " +
    (d.tpl_roles || []).length + " يعرفُها القالب   ·   صفوفُ القالب: " + d.tpl_rows)

  if (problems.length) {
    for (const [title, lines] of problems) {
      console.error("\nX " + title + (lines.length ? " (" + lines.length + "):" : ":"))
      lines.forEach((x) => console.error("   " + x))
    }
    console.error("\n   العلاج: يُنقَلُ الواقعُ إلى القالبِ — ما يفعلُه بذّارُ الشركاتِ يُكتَبُ بياناً، ولا يُخترَعُ قالبٌ جديد.")
    process.exit(1)
  }
  console.log("  -   الأفعالُ التفصيليّةُ (allowed_actions) تبقى للبذّار، و all_access يحسبُه الناسخُ من اسمِ الوظيفة — فلا يُحاكمانِ هنا.")
  console.log("  ok  الكتالوجُ لا يتخلّفُ عن الواقع، والقالبُ يعرفُ كلَّ وظيفةٍ حيّةٍ ولا يمنحُ اسماً بلا بيت.")
})().catch((e) => { console.error("X " + ((e && e.message) || e)); process.exit(1) })

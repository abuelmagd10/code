#!/usr/bin/env node
/**
 * check-every-company-carries-every-resource.js
 * ولا شركةَ تحملُ باباً تجهلُه أختُها، ولا بابَ يحملُه القديمُ ولا يُولَدُ به الجديد.
 * ---------------------------------------------------------------------------
 *   node scripts/check-every-company-carries-every-resource.js [--require-db]
 *   node scripts/check-every-company-carries-every-resource.js --selftest
 *
 * ═══ لماذا وُجد ═══
 *
 * بذّارُ القالبِ يقرأ كتالوجَ الصلاحيّات، فما ليس فى الكتالوجِ لا يُنتجُه أبداً.
 * وتُرك خمسةَ عشرَ مورداً لبذّارٍ مكتوبٍ بيده — **وهذا البذّارُ كبِرَ مع الزمن
 * ولم يلحقْ به القديم**:
 *
 *   • ثلاثةُ مواردَ كانت فى الشركتينِ الأحدثِ فقط، وناقصةً فى أربعٍ ولدت قبلها.
 *   • ومورَدانِ فى شركةٍ واحدةٍ بمنحٍ قديم، **لا يعرفُهما أىُّ بذّار** — فلن
 *     تصلا إلى شركةٍ جديدةٍ أبداً.
 *   • وثالثٌ (`financial_reports`) فى الشركاتِ كلِّها بهجرةٍ قديمة، ولا بذّارَ
 *     يعرفُه — فشركةٌ تولدُ غداً لا تأخذُه.
 *
 * ═══ الخاصّيّتانِ المحكومتان ═══
 *
 * **(أ) اتّساقُ القديم:** موردٌ موجودٌ فى شركةٍ يجب أن يوجدَ فى كلِّ شركة.
 * ولا يُعارضُ ذلك قرارَ المالك: شاشةُ «صلاحيّات الأدوار» **تُحدِّث ولا تحذف**،
 * فاختيارُه يسكنُ فى الأعلام (`can_access`) لا فى وجودِ الصفّ.
 * **ومن لا صفَّ له لا يملكُ أن يقول لا.**
 *
 * **(ب) ميلادُ الجديد:** كلُّ موردٍ تحملُه الشركاتُ يجب أن يعرفَه مسارُ البذر —
 * إمّا باسمِه فى دالّةٍ يناديها مُشغِّلُ الإنشاء، أو بوجودِه فى كتالوجِ
 * الصلاحيّاتِ الذى يقرأُ منه بذّارُ القالب. وإلّا **وُلدت الشركةُ التاليةُ بلا
 * هذا الباب ولن يشتكىَ أحد**.
 *
 * **وما يُصلَح للقديمِ يجب أن يُولَدَ به الجديد.**
 * ---------------------------------------------------------------------------
 */
"use strict"

/** (أ) موردٌ موجودٌ فى شركةٍ وغائبٌ عن أخرى. */
function coverageGaps(companies, rows) {
  const have = new Set(rows.map((r) => r.company_id + " " + r.resource))
  const resources = [...new Set(rows.map((r) => r.resource))]
  const out = []
  for (const res of resources) {
    const missing = companies.filter((c) => !have.has(c.id + " " + res))
    if (missing.length) out.push({ resource: res, missing: missing.map((c) => c.name) })
  }
  return out
}

/** (ب) موردٌ لا يعرفُه مسارُ البذر: لا فى نصوصِ البذّارين ولا فى الكتالوج. */
function unbornResources(rows, seedSources, catalogue) {
  const blob = seedSources.join("\n")
  const cat = new Set(catalogue)
  return [...new Set(rows.map((r) => r.resource))].filter(
    (res) => !cat.has(res) && !new RegExp("['\"]" + res + "['\"]").test(blob)
  )
}

if (process.argv.includes("--selftest")) {
  const C = [{ id: "c1", name: "أ" }, { id: "c2", name: "ب" }]
  const full = C.flatMap((c) => ["invoices", "expenses"].map((r) => ({ company_id: c.id, resource: r })))
  const cases = []
  const t = (name, got, exp) => cases.push([name, got, exp])

  t("يمرّ حين يحمل الجميعُ كلَّ مورد", coverageGaps(C, full).length, 0)
  t("ويرى موردًا ناقصًا عن شركة", coverageGaps(C, full.filter((x) => !(x.company_id === "c2" && x.resource === "expenses"))).length, 1)
  t("ويُسمّى الشركةَ الناقصة", coverageGaps(C, full.filter((x) => !(x.company_id === "c2" && x.resource === "expenses")))[0].missing[0], "ب")
  t("ويرى موردًا فى شركةٍ واحدةٍ فقط", coverageGaps(C, full.concat([{ company_id: "c1", resource: "bookings" }])).length, 1)
  t("ولا يشتكى من مورد فى الكتالوج", unbornResources(full, [], ["invoices", "expenses"]).length, 0)
  t("ولا من مورد يسمّيه البذّار", unbornResources(full, ["insert ... 'invoices' ... 'expenses'"], []).length, 0)
  t("ويرى موردًا لا يعرفه أحد", unbornResources(full, ["'invoices'"], []).length, 1)
  t("ويُسمّيه بالاسم", unbornResources(full, ["'invoices'"], [])[0], "expenses")
  t("ويقبل الجمعَ بين المصدرين", unbornResources(full, ["'invoices'"], ["expenses"]).length, 0)

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
  const msg = "PRODUCTION_SUPABASE_DB_URL غير مضبوط - لا يمكن قراءة الشركات والموارد."
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
    const companies = (await c.query("SELECT id, name FROM public.companies")).rows
    const rows = (await c.query("SELECT DISTINCT company_id, resource FROM public.company_role_permissions")).rows
    const catalogue = (await c.query("SELECT DISTINCT resource FROM public.permissions")).rows.map((x) => x.resource)
    const seedSources = (await c.query(`
      SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND (
        p.proname = 'trg_auto_seed_role_permissions'
        OR p.proname IN (
          SELECT m[1] FROM pg_proc q, LATERAL regexp_matches(q.prosrc, 'perform\\s+public\\.([a-z_]+)\\s*\\(', 'gi') m
          WHERE q.proname = 'trg_auto_seed_role_permissions'
        ))`)).rows.map((x) => x.prosrc)

    if (!companies.length || !rows.length) {
      console.error("X لا شركةَ أو لا صفّ — **بحثٌ لا يجد ليس دليلَ غياب.**")
      process.exit(1)
    }

    const resources = [...new Set(rows.map((r) => r.resource))]
    const gaps = coverageGaps(companies, rows)
    const unborn = unbornResources(rows, seedSources, catalogue)

    console.log("  الشركات: " + companies.length + "   ·   الموارد المستعمَلة: " + resources.length +
      "   ·   أزواجٌ مفحوصة: " + companies.length * resources.length)
    console.log("  يعرفُها مسارُ البذر: " + (resources.length - unborn.length) + " من " + resources.length)

    let bad = 0
    if (gaps.length) {
      bad++
      console.error("\nX موردٌ موجودٌ فى شركةٍ وغائبٌ عن أخرى (" + gaps.length + "):")
      gaps.forEach((g) => console.error("   " + g.resource + "  ←  ينقص: " + g.missing.join(" · ")))
    }
    if (unborn.length) {
      bad++
      console.error("\nX موردٌ تحملُه الشركاتُ ولا يعرفُه مسارُ البذر (" + unborn.length + ")")
      console.error("   — والشركةُ التاليةُ تُولدُ بلا هذا الباب ولن يشتكىَ أحد:")
      unborn.forEach((u) => console.error("   " + u))
    }
    if (bad) {
      console.error("\n   العلاج: بيتُ بذرٍ يُسمّى المورد، يُنادى من المُشغِّل، ويُنادى للشركاتِ القائمة.")
      process.exit(1)
    }
    console.log("  ok  كلُّ شركةٍ تحملُ كلَّ مورد، وكلُّ موردٍ يعرفُه مسارُ البذر — فالقديمُ والجديدُ سواء.")
  } finally { await c.end() }
})().catch((e) => { console.error("X " + ((e && e.message) || e)); process.exit(1) })

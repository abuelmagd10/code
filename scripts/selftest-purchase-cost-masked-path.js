#!/usr/bin/env node
/**
 * selftest-purchase-cost-masked-path.js
 * ---------------------------------------------------------------------------
 * v3.74.933 — يُرى الحارسُ وهو يرفض، على ستةِ أشكالٍ تُبطل حجبَ التكلفة.
 *
 * وكلُّ شكلٍ منها **لا يعيش فى ملف**: النافذةُ تُعاد كتابتُها بيدٍ فى لوحة
 * التحكم، أو الصلاحيةُ تُمنح، أو السياسةُ تُستبدل — ولا يتغيّر حرفٌ فى
 * الكود. فالفحصُ النصّى يقول «سليم» بينما المالُ مكشوف. ولا سبيل لبرهنة
 * حارسٍ كهذا إلا **بزرع العطب فى قاعدةٍ حيّة ثم النظر: أيرفض أم يمرّ؟**
 *
 * ويعمل على **قاعدة الاختبار وحدها** (`TEST_SUPABASE_DB_URL`)، ولا يلمس
 * الإنتاج بحال. وستُّ زراعات:
 *   (أ) النافذةُ تقرأ `unit_price` من الجدول مباشرةً   ⇒ يُرفض.
 *   (ب) النافذةُ بلا `security_invoker`                 ⇒ يُرفض (وهذا أخطرها:
 *       تلتفّ على كل عزل الفروع وهى تعمل بلا شكوى).
 *   (ج) `anon` يُمنح قراءةَ النافذة                     ⇒ يُرفض.
 *   (د) `anon` يُمنح تنفيذَ دالة المال                  ⇒ يُرفض.
 *   (هـ) السياسةُ تكتب الحكمَ بيدها بدل أن تُناديه      ⇒ يُرفض (انفصالُ
 *       الحكم إلى نسختين).
 *   (و) عمودٌ يسقط من النافذة                           ⇒ يُرفض (الانحراف).
 *   (ز) شاهدُ الحجب يصير يقبل الفراغ                     ⇒ يُرفض (v3.74.938:
 *       الواجهةُ تقرأ `null` فتقول «محجوب»، فلو قَبِل العمودُ الفراغَ أصلاً
 *       التبس «محجوبٌ عنك» بـ«لا قيمةَ هنا»).
 *   (ح) ثم تُعاد الحال                                   ⇒ يصمت الحارس.
 *
 * والاستعادةُ لا تُكتب بيدى: تُلتقط `pg_get_viewdef` قبل الزرع وتُعاد
 * حرفياً بعده — فلا تنحرف نسخةُ الفخّ عن نسخة الهجرة أبداً.
 *
 * Usage: node scripts/selftest-purchase-cost-masked-path.js
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const { spawnSync } = require("child_process")

const { requireDbOrSkip } = require("./lib/selftest-db")
const url = requireDbOrSkip("TEST_SUPABASE_DB_URL", "أنَّ حارسَ مسارِ تكلفةِ الشراءِ المحجوبِ يرفضُ مساراً مزروعاً")

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

const VIEWS = ["bills_masked", "bill_items_masked"]

function runGuard() {
  const r = spawnSync(process.execPath, ["scripts/check-purchase-cost-masked-path.js", "--require-db"], {
    encoding: "utf8",
    env: { ...process.env, PURCHASE_MASK_DB_URL: url },
  })
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

const grantsOf = (view) => `
  REVOKE ALL   ON public.${view} FROM PUBLIC, anon, authenticated;
  GRANT SELECT ON public.${view} TO authenticated, service_role;`

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let ok = true

  // لقطةُ الحال الصحيحة، لتُستعاد حرفياً مهما زُرع.
  const snap = {}
  for (const v of VIEWS) {
    const { rows } = await client.query(
      `SELECT pg_get_viewdef($1::regclass, true) AS def,
              (SELECT reloptions FROM pg_class WHERE oid = $1::regclass) AS opts`, [`public.${v}`])
    if (rows.length === 0) { console.error(`X ${v} does not exist - nothing to prove.`); process.exit(1) }
    snap[v] = rows[0].def
  }
  const { rows: pol } = await client.query(
    `SELECT qual FROM pg_policies
      WHERE schemaname='public' AND tablename='bills' AND policyname='bills_select_branch_isolation'`)
  if (pol.length === 0) { console.error("X bills_select_branch_isolation is missing - nothing to prove."); process.exit(1) }

  const restoreView = async (v) => {
    await client.query(`DROP VIEW IF EXISTS public.${v}`)
    await client.query(`CREATE VIEW public.${v} WITH (security_invoker = true) AS ${snap[v]}`)
    await client.query(grantsOf(v))
  }
  const restorePolicy = async () => {
    await client.query("DROP POLICY IF EXISTS bills_select_branch_isolation ON public.bills")
    await client.query(
      `CREATE POLICY bills_select_branch_isolation ON public.bills
       FOR SELECT USING (public.can_access_bill(id))`)
  }
  const restoreFn = async () => {
    await client.query("REVOKE ALL ON FUNCTION public.bill_money(uuid) FROM PUBLIC, anon")
    await client.query("GRANT EXECUTE ON FUNCTION public.bill_money(uuid) TO authenticated, service_role")
  }

  const stage = async (title, plant, needle, undo) => {
    if (!ok) return
    await plant()
    const r = runGuard()
    await undo()
    if (!r.failed || !new RegExp(needle).test(r.output)) {
      console.error(`X ${title}: the guard did NOT refuse (looked for /${needle}/).`)
      console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
      ok = false
    } else {
      console.log(`+ ${title}: رُفض كما يجب`)
    }
  }

  try {
    // (أ) النافذةُ تقرأ عمودَ المال من الجدول مباشرةً
    await stage(
      "a view that reads unit_price straight from the table",
      async () => {
        await client.query("DROP VIEW IF EXISTS public.bill_items_masked")
        await client.query(`CREATE VIEW public.bill_items_masked WITH (security_invoker = true) AS
          SELECT b.id, b.bill_id, b.product_id, b.description, b.quantity,
                 b.unit_price, b.tax_rate, b.discount_percent, b.line_total,
                 b.created_at, b.returned_quantity, b.item_type, b.tax_code_id
            FROM public.bill_items b`)
        await client.query(grantsOf("bill_items_masked"))
      },
      "straight from bill_items",
      () => restoreView("bill_items_masked"))

    // (ب) النافذةُ بحقوق مالكها — تلتفّ على عزل الفروع كلِّه
    await stage(
      "a view without security_invoker (it would step over every branch policy)",
      async () => {
        await client.query("DROP VIEW IF EXISTS public.bill_items_masked")
        await client.query(`CREATE VIEW public.bill_items_masked AS ${snap["bill_items_masked"]}`)
        await client.query(grantsOf("bill_items_masked"))
      },
      "NOT security_invoker",
      () => restoreView("bill_items_masked"))

    // (ج) anon يقرأ النافذة
    await stage(
      "anon granted read on a masked view",
      () => client.query("GRANT SELECT ON public.bills_masked TO anon"),
      "granted SELECT to anon",
      () => client.query(grantsOf("bills_masked")))

    // (د) anon ينفّذ دالة المال
    await stage(
      "anon granted execute on the money function",
      () => client.query("GRANT EXECUTE ON FUNCTION public.bill_money(uuid) TO anon"),
      "executable by anon",
      restoreFn)

    // (هـ) السياسةُ تكتب الحكمَ بيدها بدل أن تُناديه
    await stage(
      "the policy writing the rule by hand instead of calling it",
      async () => {
        await client.query("DROP POLICY IF EXISTS bills_select_branch_isolation ON public.bills")
        await client.query(
          `CREATE POLICY bills_select_branch_isolation ON public.bills
           FOR SELECT USING (
             company_id IN (SELECT public.get_user_company_ids())
             AND public.can_access_record_branch(company_id, branch_id))`)
      },
      // ⚠️ v3.75.81 — هنا كان العطبُ الثانى، ومن نفسِ الفصيلة.
      //
      // كان المطلوبُ عبارةً نثريّةً بعينِها: «no longer calls can_access_bill».
      // والحارسُ **يرفضُ فعلاً وكما يجب**، لكنّه صارَ يقولُها بصياغةٍ أخرى منذ
      // v3.74.973 حين تحوّلَ حكمُه من الاسمِ إلى الخاصّيّة. فصارَ الفخُّ يقرأُ
      // رفضاً صحيحاً ويحسبُه قبولاً — **وهذا أسوأُ من ألّا يوجدَ فخّ**، لأنه
      // يتّهمُ البرىءَ ويدفعُ صاحبَه إلى الالتفافِ عليه.
      //
      // وقِيسَ التاريخُ: العبارتان **لم تتطابقا يوماً** منذ دخلَ الملفّان
      // المستودعَ فى v3.75.4. أى أنَّ هذا الفخَّ لم يكنْ أخضرَ قطّ، ولم يقلْ
      // ذلك أحدٌ لأنّه بلا مُنادٍ.
      //
      // والعلاجُ: **يُعرَفُ الرفضُ بالأسماءِ التى سُمِّيَتْ فيه لا بعبارتِه** —
      // اسمُ السياسةِ المخالفةِ واسمُ البيتِ الذى هجرَتْه، فى سطرٍ واحد.
      // فالصياغةُ تتغيَّرُ والأسماءُ لا تتغيَّرُ إلّا بتغيُّرِ الشىءِ نفسِه.
      "bills_select_branch_isolation[^\\n]*can_access_bill",
      restorePolicy)

    // (و) عمودٌ يسقط من النافذة
    await stage(
      "a column dropped from a masked view",
      async () => {
        await client.query("DROP VIEW IF EXISTS public.bill_items_masked")
        await client.query(`CREATE VIEW public.bill_items_masked WITH (security_invoker = true) AS
          SELECT b.id, b.bill_id, b.product_id, b.description, b.quantity,
                 m.unit_price, b.tax_rate, b.discount_percent, m.line_total,
                 b.created_at, b.returned_quantity, b.item_type
            FROM public.bill_items b
            LEFT JOIN LATERAL public.bill_item_money(b.id) m ON TRUE`)
        await client.query(grantsOf("bill_items_masked"))
      },
      "drifted from bill_items",
      () => restoreView("bill_items_masked"))

    // (ز) شاهدُ الحجب يصير يقبل الفراغ
    //
    // v3.74.938 — الشاشاتُ تُميّز «محجوبٌ عنك» عن «لا قيمةَ هنا» بعمودٍ
    // `NOT NULL` واحد. ولو أُسقط القيدُ فى هجرةٍ تالية لصار الفراغُ غامضاً
    // **بلا أن يتغيّر حرفٌ فى الكود** — وهذا بالضبط ما لا يمسكه فحصٌ نصّى.
    await stage(
      "the hidden-money witness column turned nullable",
      () => client.query("ALTER TABLE public.bills ALTER COLUMN total_amount DROP NOT NULL"),
      "is nullable",
      () => client.query("ALTER TABLE public.bills ALTER COLUMN total_amount SET NOT NULL"))

    // (ح) والحال الصحيحة تُقرأ سليمة
    if (ok) {
      const r = runGuard()
      if (r.failed) {
        console.error("X the guard refuses the correct state - it would block every push.")
        console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
        ok = false
      } else {
        console.log("+ الحال الصحيحة: لم يُبلَّغ عنها كما يجب")
      }
    }
  } finally {
    try {
      for (const v of VIEWS) await restoreView(v)
      await restorePolicy()
      await restoreFn()
      // v3.74.938 — والقيدُ يُعاد مهما وقع: فخٌّ يترك جدولاً أرخى من قبله
      // أسوأُ من فخٍّ لا يوجد.
      await client.query("ALTER TABLE public.bills ALTER COLUMN total_amount SET NOT NULL")
    } catch (e) { console.error(`! restore failed: ${e.message}`) }
    await client.end()
  }

  if (!ok) process.exit(1)
  console.log("+ the masked-path guard is proven refusing all seven shapes that would undo the hide,")
  console.log("  and staying silent on the correct state (test database only).")
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })

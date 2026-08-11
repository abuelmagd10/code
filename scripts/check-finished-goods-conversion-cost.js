#!/usr/bin/env node
/**
 * check-finished-goods-conversion-cost.js
 * ---------------------------------------------------------------------------
 * v3.74.853 — لا منتج تام يدخل المخزون بتكلفة مواده وحدها بينما مركز عمله
 * له أسعار.
 *
 * **الحادثة**: أكمل المالك دورة إنتاج (MPO-202607-000030) بعد أن فعّل نسخة
 * المسار الصحيحة — ودخل المنتج بتكلفة **٦٠٫٠٠** بدل **١١٨٫٥٠**.
 *
 * والسبب أن **أمر الإنتاج يُثبّت نسخة المسار عند إنشائه**، وهذا سليم: أمرٌ
 * بدأ لا تتغيّر تكلفته تحته. لكن الأمر كان مربوطاً بـ`ROUT-002 v1` وزمنها
 * صفر، فتفعيل v2 لاحقاً لم يمسّه. وحارس ٨٤٥ يفحص **عند اعتماد المسار
 * وتفعيله** — أى بوابة أخرى تماماً.
 *
 * ⇒ **الدرس (الرابع من عائلته)**: الحارس عند بوابة لا يحمى بوابة أخرى.
 *   فأُضيف `mpoe_assert_order_routing_is_costable` إلى مسار **الاستلام**
 *   نفسه، وهذا الفحص يمسك ما دخل قبل ذلك.
 *
 * ولماذا فحصٌ منفصل والحارس موجود؟ لأن الحارس يمنع الجديد ولا يرى القديم.
 * وأثر العطب لا يظهر عند الإنتاج بل **عند البيع**: ربحٌ أعلى من حقيقته
 * بفارق التكلفة، ومخزونٌ مُقوَّم بأقل من قيمته.
 *
 * Usage: node scripts/check-finished-goods-conversion-cost.js [--require-db]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
const url = process.env.PRODUCTION_SUPABASE_DB_URL

// لا قائمة استثناءات مكتوبة باليد: الأمر المُصحَّح يُعرَف **بقيد التصحيح
// الخاص به** فى الدفاتر. القائمة اليدوية تتقادم ويُنسى تحديثها؛ والقيد لا
// يُنسى لأنه هو الإصلاح نفسه.
const EXCLUDE_BY_CORRECTION_ENTRY = true

if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot check finished-goods costing."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
  process.exit(0)
}

let Client
try { ({ Client } = require("./lib/live-db")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

// ⚠️ المحاولة الأولى قارنت التكلفة الفعلية بـ«تكلفة التحويل المتوقَّعة من
// نسخة المسار» — وهو **منطق دائرى**: المشكلة أن النسخة زمنها صفر، فالمتوقَّع
// منها صفر، فلا فرق يظهر ولا شىء يُمسَك. جرّبتُه على الإنتاج فأعطى «سليمة»
// للأوامر الثلاثة، ومنها الذى دخل بـ٦٠ بدل ١١٨٫٥٠.
// ⇒ يُقاس **الشرط الذى سبّب العطب** لا نتيجته: أمرٌ مكتمل مربوط بنسخة مسار
//   مراكزُ عملها لها أسعار **وأزمنتها صفر** ⇒ استحال تحميل أى تكلفة تحويل.
const SQL = `
  WITH bound AS (
    SELECT po.id AS po_id, po.order_no,
           rt.routing_code || ' v' || rv.version_no AS routing,
           SUM(
             (COALESCE(ro.labor_time_minutes,0)   / 60.0) * COALESCE(wc.labor_cost_rate,0)
           + (COALESCE(ro.machine_time_minutes,0) / 60.0) * COALESCE(wc.machine_cost_rate,0)
           + (CASE WHEN wc.overhead_absorption_base = 'labour_hours'
                     THEN COALESCE(ro.labor_time_minutes,0)   / 60.0
                     ELSE COALESCE(ro.machine_time_minutes,0) / 60.0 END)
             * (COALESCE(wc.variable_overhead_rate,0) + COALESCE(wc.fixed_overhead_rate,0))
           ) AS conversion_per_unit,
           SUM(COALESCE(wc.labor_cost_rate,0) + COALESCE(wc.machine_cost_rate,0)
             + COALESCE(wc.variable_overhead_rate,0) + COALESCE(wc.fixed_overhead_rate,0)) AS rates
      FROM public.manufacturing_production_orders po
      JOIN public.manufacturing_routing_versions rv   ON rv.id = po.routing_version_id
      JOIN public.manufacturing_routings rt           ON rt.id = rv.routing_id
      JOIN public.manufacturing_routing_operations ro ON ro.routing_version_id = rv.id
      JOIN public.manufacturing_work_centers wc       ON wc.id = ro.work_center_id
     WHERE po.status = 'completed'
       -- ⚠️ الأسعار السارية **وقت اكتمال الأمر**، لا أسعار اليوم.
       -- بدون هذا الشرط أبلغ الفحص عن MPO-202607-000028 خطأً: أسعار مركز
       -- عمله ضُبطت ٢٧ يوليو ١١:٠٧ والأمر اكتمل ٢٤ يوليو — فلم يكن للمصنع
       -- سعر حين أُنتج، والمواد وحدها كانت التكلفة الصادقة وقتها. وتحميله
       -- الآن **إعادة كتابة للتاريخ**: التكلفة المعيارية تسرى على ما بعدها
       -- لا على ما قبلها.
       AND wc.cost_rates_effective_from IS NOT NULL
       AND wc.cost_rates_effective_from <= po.completed_at
     GROUP BY po.id, po.order_no, rt.routing_code, rv.version_no
  )
  SELECT b.order_no, b.routing,
         ROUND(b.rates, 2)               AS work_centre_rates,
         ROUND(fl.unit_cost, 2)          AS actual_unit_cost,
         ROUND(fl.remaining_quantity, 2) AS still_in_stock
    FROM bound b
    JOIN public.production_order_receipt_lines rl ON rl.production_order_id = b.po_id
    JOIN public.fifo_cost_lots fl                ON fl.id = rl.fifo_cost_lot_id
   WHERE b.rates > 0                    -- المصنع مُسعَّر
     AND b.conversion_per_unit <= 0     -- ومع ذلك لا تكلفة تحويل ممكنة
     -- ويُستثنى ما صُحِّح فعلاً: القيد نفسه هو الدليل، لا قائمة تُحدَّث يدوياً
     AND NOT EXISTS (
       SELECT 1 FROM public.journal_entries je
        WHERE je.reference_type = 'manufacturing_conversion_cost_correction'
          AND je.reference_id = b.po_id
          AND je.status = 'posted'
          AND COALESCE(je.is_deleted, false) = false
     )
   ORDER BY b.order_no
`

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let rows = []
  try { ({ rows } = await client.query(SQL)) } finally { await client.end() }

  const offenders = rows

  if (offenders.length > 0) {
    console.error(
      `X ${offenders.length} completed production order(s) could not absorb any ` +
        `conversion cost - the finished goods hold materials only:\n`
    )
    for (const o of offenders) {
      console.error(
        `  - ${o.order_no}  routing ${o.routing}\n` +
          `      work-centre rates: ${o.work_centre_rates}` +
          `   but routing times are zero` +
          `   -> unit cost ${o.actual_unit_cost}, still in stock ${o.still_in_stock}`
      )
    }
    console.error(
      "\n  A production order freezes its routing version when it is created, so\n" +
        "  activating a corrected version later does NOT fix an order already\n" +
        "  running. The product enters stock at materials only - and the error\n" +
        "  surfaces at SALE, as profit higher than it really is.\n\n" +
        "  Post an absorption correction (Dr Inventory / Cr 5415 + 5410) AND\n" +
        "  raise the FIFO lot's unit cost - the journal alone leaves the stock\n" +
        "  still valued wrong. The correction entry is what clears this check;\n" +
        "  there is no list to remember to update."
    )
    process.exit(1)
  }

  console.log(
    "+ every completed production order could absorb its conversion cost " +
      "(orders already corrected are cleared by their correction entry)."
  )
})().catch((err) => {
  console.error(
    "X failed:",
    String(err.message || err).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://<redacted>")
  )
  process.exit(1)
})

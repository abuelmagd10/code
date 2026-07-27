#!/usr/bin/env node
/**
 * check-movement-cost-matches-ledger.js
 * ---------------------------------------------------------------------------
 * v3.74.861 — تكلفة حركة الشراء تساوى ما تحمله الدفاتر وFIFO.
 *
 * **الحادثة**: كانت تُحسب تكلفة واقعة الشراء الواحدة **مرّتين بطريقتين**:
 *
 *   الدفاتر    ← `bills.subtotal + bills.shipping`                    ✔
 *   FIFO       ← `fn_bill_item_landed_unit_cost()` (مُشغِّل فى القاعدة) ✔
 *   سجل الحركة ← `bill_items.unit_price` الخام من TypeScript          ✘
 *
 * و`lib/purchase-posting.ts:287` **لا يجلب `discount_percent` أصلاً** — فالخصم
 * غير مرئىٍّ لذلك المسار بنيوياً. النتيجة على الإنتاج كانت قاطعة:
 *
 *   فاتورة بخصم   ⇒ فارقٌ دائماً  (٦.٠٠ · ٤.٠٨ · ١.١٠ · ٠.٥٦)
 *   فاتورة بلا خصم ⇒ مطابقةٌ تامة  (٦٠٬٠٠٠ = ٦٠٬٠٠٠)
 *
 * ⇒ الدفاتر سليمة؛ المختلّ **سجل الحركة**. فأى تقرير يقرأ تكلفة الحركة مباشرةً
 *   يُظهر تكلفة مشتريات مبالغاً فيها، **والخصم يختفى من سجل الصنف**.
 *
 * 🔒 **ولماذا يبدأ الفحص من تاريخٍ معيّن؟**
 *
 * السجلات الثمانية القديمة **لا يمكن تصحيحها**: القاعدة تمنع تعديل حركةٍ
 * مرتبطةٍ بقيدٍ مُرحَّل (`prevent_linked_inventory_modification`) — بلا مَخرج،
 * وهى نفس فلسفة «القيد يُعكَس ولا يُحرَّر». **ولن تُضعَّف الحماية.**
 * فيبدأ الفحص من تاريخ الترحيل: خط أساسه **صفر** لما يحكمه المُشغِّل الجديد،
 * ولا يُخفى عطباً جديداً خلف رقمٍ ثابتٍ يتعوّد القارئ على تجاهله.
 *
 * Usage: node scripts/check-movement-cost-matches-ledger.js [--require-db] [--list]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
const verbose = process.argv.includes("--list")
const url = process.env.PRODUCTION_SUPABASE_DB_URL

/** تاريخ ترحيل v3.74.861 — قبله لا سلطة للمُشغِّل، وبعده لا عذر. */
const ENFORCED_FROM = process.env.MOVEMENT_COST_ENFORCED_FROM || "2026-07-27"

if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot verify movement costs."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
  process.exit(0)
}

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

/**
 * كل حركة شراء أُنشئت بعد سريان المُشغِّل ويختلف فيها المسجَّل عن المحمَّل.
 * المقارنة بالدالة نفسها — لا بصيغةٍ ثانية، وإلا عاد الانقسام من باب الفحص.
 */
const SQL = `
  SELECT t.id,
         t.created_at::date AS on_date,
         coalesce(b.bill_number, '(بلا فاتورة)') AS bill_number,
         coalesce(p.name, '(بلا صنف)')           AS product_name,
         t.quantity_change                        AS qty,
         t.unit_cost                              AS stored_cost,
         public.fn_bill_item_landed_unit_cost(t.reference_id, t.product_id) AS landed_cost
    FROM public.inventory_transactions t
    LEFT JOIN public.bills    b ON b.id = t.reference_id
    LEFT JOIN public.products p ON p.id = t.product_id
   WHERE t.transaction_type = 'purchase'
     AND coalesce(t.is_deleted, false) = false
     AND t.created_at >= $1::date
     AND t.reference_id IS NOT NULL
     AND t.product_id  IS NOT NULL
     AND public.fn_bill_item_landed_unit_cost(t.reference_id, t.product_id) IS NOT NULL
     AND abs(coalesce(t.unit_cost, -1)
             - public.fn_bill_item_landed_unit_cost(t.reference_id, t.product_id)) > 0.0001
   ORDER BY t.created_at
`

/** عددُ الحركات التاريخية المعروفة قبل السريان — للعلم لا للحكم. */
const LEGACY_SQL = `
  SELECT count(*)::int AS n,
         coalesce(sum(abs(coalesce(t.unit_cost,0)
           - public.fn_bill_item_landed_unit_cost(t.reference_id, t.product_id))
           * abs(coalesce(t.quantity_change,0))), 0)::numeric AS overstated
    FROM public.inventory_transactions t
   WHERE t.transaction_type = 'purchase'
     AND coalesce(t.is_deleted, false) = false
     AND t.created_at < $1::date
     AND t.reference_id IS NOT NULL AND t.product_id IS NOT NULL
     AND public.fn_bill_item_landed_unit_cost(t.reference_id, t.product_id) IS NOT NULL
     AND abs(coalesce(t.unit_cost, -1)
             - public.fn_bill_item_landed_unit_cost(t.reference_id, t.product_id)) > 0.0001
`

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let rows = []
  let legacy = { n: 0, overstated: 0 }
  try {
    ;({ rows } = await client.query(SQL, [ENFORCED_FROM]))
    const l = await client.query(LEGACY_SQL, [ENFORCED_FROM])
    legacy = l.rows[0] || legacy
  } finally { await client.end() }

  if (verbose && Number(legacy.n) > 0) {
    console.log(
      `  · ${legacy.n} حركة تاريخية قبل ${ENFORCED_FROM} تحمل تكلفةً أعلى بمقدار ` +
        `${Number(legacy.overstated).toFixed(2)} — محميّة من التعديل بحكم ارتباطها بقيدٍ مُرحَّل، وموثَّقة.`
    )
  }

  if (rows.length > 0) {
    console.error(
      `X ${rows.length} purchase movement(s) carry a cost that disagrees with the ledger and FIFO:\n`
    )
    for (const r of rows) {
      console.error(
        `  - ${r.on_date}  ${r.bill_number}  ${r.product_name}\n` +
          `      stored ${Number(r.stored_cost).toFixed(6)} x ${r.qty}` +
          `   should be ${Number(r.landed_cost).toFixed(6)}`
      )
    }
    console.error(
      `\n  The ledger and FIFO both use fn_bill_item_landed_unit_cost. A movement that\n` +
        `  disagrees means a second, independent cost computation crept back in - which is\n` +
        `  exactly the defect v3.74.861 removed: the TypeScript path wrote the raw\n` +
        `  bill_items.unit_price and never even selected discount_percent, so every\n` +
        `  discounted purchase overstated the movement while the books stayed correct.\n` +
        `  Fix: let the BEFORE INSERT trigger own the cost. One authority, not two.`
    )
    process.exit(1)
  }

  console.log(
    `+ every purchase movement since ${ENFORCED_FROM} costs exactly what the ledger and FIFO say` +
      (Number(legacy.n) > 0
        ? ` (${legacy.n} older movement(s) documented and immutable by design).`
        : ".")
  )
})().catch((e) => {
  console.error(`X check-movement-cost-matches-ledger failed: ${e.message}`)
  process.exit(1)
})

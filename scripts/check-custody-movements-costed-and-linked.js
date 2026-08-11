#!/usr/bin/env node
/**
 * check-custody-movements-costed-and-linked.js
 * ---------------------------------------------------------------------------
 * v3.74.862 — حركة العهدة تحمل تكلفتها ورابطَ قيدها.
 *
 * **الحادثة** (رُصدت أثناء تتبّع تكلفة الشراء فى ٨٦١): حركات «خروج عهدة
 * للفنّى» و«إرجاع عهدة» على الإنتاج تُسجَّل:
 *   • بلا `unit_cost` ولا `total_cost` — العمودان **غائبان عن جملة الإدخال**
 *     أصلاً، لا مُهملَين.
 *   • وبلا `journal_entry_id` رغم أن القيد يُنشأ بعدها بأسطر ومعرّفه محفوظٌ
 *     فى متغيّر. **لم يكن ينقص إلا سطرُ ربطٍ واحد.**
 *
 * ⇒ الحركة موجودة، والقيد موجود، **ولا شىء يصلهما**. ومن يفتح سجل صنفٍ خرج
 *   فى عهدة لا يرى قيمته ولا يصل منه إلى أثره المحاسبى.
 *
 * ⇒ والدالتان **تحسبان القيمة بالفعل** وتستعملانها فى القيد ثم لا تكتبانها.
 *   المعلومة كانت فى اليد ولم تُسجَّل — وهذا أسوأ من غيابها.
 *
 * 🔒 **ولماذا يبدأ الفحص من تاريخٍ معيّن؟** الحركات التاريخية بعضها مرتبطٌ
 *    بقيودٍ مُرحَّلة، و`prevent_linked_inventory_modification` يمنع تعديلها
 *    بلا مَخرج — وهى نفس فلسفة «القيد يُعكَس ولا يُحرَّر». **ولن تُضعَّف.**
 *    فيبقى خط الأساس **صفراً حقيقياً** لما يحكمه الإصلاح الجديد.
 *
 * Usage: node scripts/check-custody-movements-costed-and-linked.js [--require-db] [--list]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
const verbose = process.argv.includes("--list")
const url = process.env.PRODUCTION_SUPABASE_DB_URL

/** تاريخ ترحيل v3.74.862 — قبله لا سلطة للإصلاح، وبعده لا عذر. */
const ENFORCED_FROM = process.env.CUSTODY_LINK_ENFORCED_FROM || "2026-07-28"

if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot verify custody movements."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
  process.exit(0)
}

let Client
try { ({ Client } = require("./lib/live-db")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

/**
 * ⚠️ الحركة غير المقيَّمة مسموحة **بشرط**: الدالة تُصدر تحذيراً صريحاً
 *    (`CUSTODY_OUT_UNVALUED`) حين لا يوجد أساس تكلفة. فلا يُطلب رابطُ قيدٍ
 *    لحركةٍ قيمتها صفر — إذ لا قيد لها أصلاً. لكن **التكلفة تُكتب دائماً**.
 */
const SQL = `
  SELECT t.id,
         t.created_at::date        AS on_date,
         t.transaction_type        AS kind,
         coalesce(p.name,'(بلا صنف)') AS product_name,
         t.quantity_change         AS qty,
         t.unit_cost               AS unit_cost,
         t.total_cost              AS total_cost,
         t.journal_entry_id        AS je_id,
         (t.unit_cost IS NULL OR t.total_cost IS NULL) AS missing_cost,
         (t.journal_entry_id IS NULL AND coalesce(t.total_cost,0) > 0) AS missing_link
    FROM public.inventory_transactions t
    LEFT JOIN public.products p ON p.id = t.product_id
   WHERE t.transaction_type IN ('booking_custody_out','booking_custody_return')
     AND coalesce(t.is_deleted,false) = false
     AND t.created_at >= $1::date
     AND ( t.unit_cost IS NULL
        OR t.total_cost IS NULL
        OR (t.journal_entry_id IS NULL AND coalesce(t.total_cost,0) > 0) )
   ORDER BY t.created_at
`

const LEGACY_SQL = `
  SELECT count(*)::int AS n
    FROM public.inventory_transactions t
   WHERE t.transaction_type IN ('booking_custody_out','booking_custody_return')
     AND coalesce(t.is_deleted,false) = false
     AND t.created_at < $1::date
     AND ( t.unit_cost IS NULL OR t.journal_entry_id IS NULL )
`

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let rows = []
  let legacy = 0
  try {
    ;({ rows } = await client.query(SQL, [ENFORCED_FROM]))
    const l = await client.query(LEGACY_SQL, [ENFORCED_FROM])
    legacy = Number(l.rows[0]?.n || 0)
  } finally { await client.end() }

  if (verbose && legacy > 0) {
    console.log(
      `  · ${legacy} حركة عهدة تاريخية قبل ${ENFORCED_FROM} بلا تكلفة أو بلا رابط — ` +
        `محميّة من التعديل بحكم ارتباطها بقيدٍ مُرحَّل، وموثَّقة.`
    )
  }

  if (rows.length > 0) {
    console.error(`X ${rows.length} custody movement(s) are incomplete:\n`)
    for (const r of rows) {
      const what = [
        r.missing_cost ? "no cost recorded" : null,
        r.missing_link ? "no journal link" : null,
      ].filter(Boolean).join(" + ")
      console.error(`  - ${r.on_date}  ${r.kind}  ${r.product_name}  qty ${r.qty}\n      ${what}`)
    }
    console.error(
      `\n  Both values are already known inside the posting function: the cost is\n` +
        `  computed from the FIFO batches and used in the journal entry, and the\n` +
        `  entry id is returned into a variable. Writing them down is one column\n` +
        `  list and one UPDATE. Information held and not recorded is worse than\n` +
        `  information absent - it looks like the system does not know.`
    )
    process.exit(1)
  }

  console.log(
    `+ every custody movement since ${ENFORCED_FROM} carries its cost and its journal link` +
      (legacy > 0 ? ` (${legacy} older one(s) documented and immutable by design).` : ".")
  )
})().catch((e) => {
  console.error(`X check-custody-movements-costed-and-linked failed: ${e.message}`)
  process.exit(1)
})

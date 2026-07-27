#!/usr/bin/env node
/**
 * check-inventory-movement-coverage.js
 * ---------------------------------------------------------------------------
 * v3.74.852 — كل نوع حركة يُغيّر المخزون **له عمود** فى تقرير حالة المخزون.
 *
 * **الحادثة، وهى الثالثة من نوعها**:
 *   · v3.74.714 — حركات العهدة (`booking_custody_*`, `service_consumption`)
 *     كانت تُنقص المخزون بلا عمود يذكرها.
 *   · v3.74.716 — ثم أُضيف العمودان بلا خليتَى إجمالى، فانزاحت كل الأرقام
 *     بعد «الهالك» تحت عناوين خاطئة.
 *   · v3.74.852 — والتصنيع كرّرها: `production_issue` و`production_receipt`
 *     تُحرّكان المخزون منذ شهور بلا أى عمود. فقرأ المالك صفاً يقول:
 *         «قاعدة ماتور — مشتريات ٣ · مبيعات ٠ · مرتجعات ٠ · هالك ٠ · متاح ٠»
 *     حسابٌ لا يُغلَق، ولا سبيل لمعرفة أين ذهبت الثلاثة.
 *
 * ⇒ **الدرس**: الصف الذى لا تُغلَق حسبته يُفقد الثقة فى التقرير كله، ولو كان
 *   رصيده صحيحاً. والعطب يتكرّر لأن إضافة نوع حركة جديد فى القاعدة **لا
 *   تُجبر أحداً** على إضافة عمود له.
 *
 * يقارن هذا الفحص أنواع الحركات **الموجودة فعلاً فى القاعدة** بالأنواع التى
 * تُصنَّف فى `app/inventory/page.tsx`. فأى نوع يتحرّك ولا يُصنَّف ⇒ فشل.
 *
 * ويقرأ القاعدة لا الكود وحده — لأن الحارس الذى يفحص الكود بالكود لا يرى
 * إلا ما تخيّله كاتبه (درس ٨٥١).
 *
 * Usage: node scripts/check-inventory-movement-coverage.js [--require-db]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const path = require("path")

const requireDb = process.argv.includes("--require-db")
const url = process.env.PRODUCTION_SUPABASE_DB_URL
const pagePath = path.resolve(__dirname, "..", "app", "inventory", "page.tsx")

// أنواع تدخل الرصيد مباشرةً عبر `quantity_change` ولا تحتاج عموداً مستقلاً،
// لأن لها عمودَيها الخاصين المبنيين من جدول التحويلات لا من الحركات.
const COVERED_ELSEWHERE = new Set(["transfer_in", "transfer_out"])

if (!fs.existsSync(pagePath)) {
  console.log("+ inventory page not found - skipping.")
  process.exit(0)
}

if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot list live movement types."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
  process.exit(0)
}

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

const src = fs.readFileSync(pagePath, "utf8")

// الأنواع المُصنَّفة: كل `type === 'x'` داخل حلقة التجميع.
const classified = new Set(
  [...src.matchAll(/type\s*===\s*['"]([a-z_]+)['"]/g)].map((m) => m[1])
)

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let rows = []
  try {
    ;({ rows } = await client.query(`
      SELECT transaction_type,
             count(*)                AS movements,
             SUM(quantity_change)    AS net_qty
        FROM public.inventory_transactions
       WHERE COALESCE(is_deleted, false) = false
         AND COALESCE(quantity_change, 0) <> 0
       GROUP BY transaction_type
       ORDER BY 2 DESC
    `))
  } finally { await client.end() }

  const missing = rows.filter(
    (r) => !classified.has(r.transaction_type) && !COVERED_ELSEWHERE.has(r.transaction_type)
  )

  if (missing.length > 0) {
    console.error(
      `X ${missing.length} movement type(s) change stock but appear in no column ` +
        `of the inventory report:\n`
    )
    for (const m of missing) {
      console.error(
        `  - ${m.transaction_type.padEnd(28)} ${String(m.movements).padStart(5)} movement(s), ` +
          `net ${m.net_qty}`
      )
    }
    console.error(
      "\n  A row that reads \"bought 3, sold 0, no returns, no write-offs,\n" +
        "  available 0\" is arithmetic that does not close, and the user has no\n" +
        "  way to find where the units went. It costs trust in the whole report.\n\n" +
        "  In app/inventory/page.tsx add: a bucket in the aggregation loop, a\n" +
        "  state pair, a column, AND a footer cell. The footer is hand-built one\n" +
        "  cell per column - miss it and every later figure shifts under the\n" +
        "  wrong heading (that is what v3.74.716 had to repair)."
    )
    process.exit(1)
  }

  console.log(
    `+ every live movement type has a column ` +
      `(${rows.length} type(s) in use, ${COVERED_ELSEWHERE.size} covered by the transfers table).`
  )
})().catch((err) => {
  console.error(
    "X failed:",
    String(err.message || err).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://<redacted>")
  )
  process.exit(1)
})

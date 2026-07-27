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

// الأنواع المُصنَّفة فى **أعمدة** الجدول: كل `type === 'x'` داخل حلقة التجميع.
const classified = new Set(
  [...src.matchAll(/type\s*===\s*['"]([a-z_]+)['"]/g)].map((m) => m[1])
)

// v3.74.852 — والأنواع التى لها **خيار فى فلتر الحركة**.
// عمودٌ بلا خيار فلتر نصفُ إصلاح: يرى المستخدم الرقم ولا يستطيع عزله ولا
// مراجعة حركاته. وكان الفلتر يعرض ثلاثة خيارات بينما الجدول تسعة أعمدة.
const filterMapBlock = src.slice(
  src.indexOf("MOVEMENT_FILTER_GROUPS"),
  src.indexOf("function matchesMovementFilter")
)
const filterable = new Set(
  [...filterMapBlock.matchAll(/['"]([a-z_]+)['"]/g)].map((m) => m[1])
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

  const noColumn = rows.filter(
    (r) => !classified.has(r.transaction_type) && !COVERED_ELSEWHERE.has(r.transaction_type)
  )
  const noFilter = rows.filter((r) => !filterable.has(r.transaction_type))

  if (noColumn.length > 0 || noFilter.length > 0) {
    if (noColumn.length > 0) {
      console.error(
        `X ${noColumn.length} movement type(s) change stock but appear in NO COLUMN:\n`
      )
      for (const m of noColumn) {
        console.error(
          `  - ${m.transaction_type.padEnd(28)} ${String(m.movements).padStart(5)} movement(s), ` +
            `net ${m.net_qty}`
        )
      }
      console.error(
        "\n  A row that reads \"bought 3, sold 0, no returns, no write-offs,\n" +
          "  available 0\" is arithmetic that does not close, and the user has no\n" +
          "  way to find where the units went. It costs trust in the whole report.\n\n" +
          "  Add: a bucket in the aggregation loop, a state pair, a column, AND a\n" +
          "  footer cell. The footer is hand-built one cell per column - miss it\n" +
          "  and every later figure shifts under the wrong heading (v3.74.716).\n"
      )
    }
    if (noFilter.length > 0) {
      console.error(
        `X ${noFilter.length} movement type(s) have NO OPTION in the movement filter:\n`
      )
      for (const m of noFilter) {
        console.error(
          `  - ${m.transaction_type.padEnd(28)} ${String(m.movements).padStart(5)} movement(s)`
        )
      }
      console.error(
        "\n  A column without a filter option is half a fix: the number is visible\n" +
          "  but cannot be isolated or reviewed. Add the type to\n" +
          "  MOVEMENT_FILTER_GROUPS and give it an <option> in the dropdown.\n"
      )
    }
    process.exit(1)
  }

  console.log(
    `+ every live movement type has a column AND a filter option ` +
      `(${rows.length} type(s) in use, ${COVERED_ELSEWHERE.size} covered by the transfers table).`
  )
})().catch((err) => {
  console.error(
    "X failed:",
    String(err.message || err).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://<redacted>")
  )
  process.exit(1)
})

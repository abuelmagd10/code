#!/usr/bin/env node
/**
 * check-trigger-silently-cancels-delete.js
 * ---------------------------------------------------------------------------
 * v3.74.881 — مُشغِّل `BEFORE DELETE` يُعيد `NEW` يُلغى الحذف بصمت.
 *
 * **الحادثة**: حذف قيد يومية **مسودَّة** لم يكن يفشل ولم يكن يقع. أُثبت على
 * الإنتاج داخل معاملةٍ مُلغاة:
 *
 *     chart_of_accounts : rows left after DELETE = 0   (حُذف كما يجب)
 *     journal_entries   : rows left after DELETE = 1   *** ابتُلع بصمت ***
 *
 * والسبب أن `prevent_posted_journal_modification()` تنتهى بـ`RETURN NEW`، و
 * فى عملية حذف **لا وجود لـ`NEW`** فتكون `NULL` — وPostgreSQL يفهم `NULL`
 * من مُشغِّل BEFORE على أنها **«ألغِ هذه العملية»**.
 *
 * فالدالة تعرف كيف **ترفض** حذفاً، ولا تعرف كيف **تُتمّه**.
 *
 * ⇒ **الرفض يُرى، والإلغاء الصامت لا يُرى.** وخطأٌ صريح أرحم من نجاحٍ كاذب:
 *   الأول يوقفك، والثانى يمضى بك.
 *
 * ── الحكم، وقد ضُيِّق مرتين بالقياس ──────────────────────────────────────
 * (١) «كل مُشغِّل BEFORE DELETE ينتهى بـ`RETURN NEW`» ⇒ **١٧**، وستةَ عشرَ
 *     منها سليمة: فرع الحذف فيها يبدأ بـ`RETURN OLD`، والسطر الأخير لا
 *     يُبلَغ أصلاً فى الحذف.
 * (٢) «لا تُعيد `OLD` فى أى مسار» ⇒ **٣**، منها اثنتان تُرفعان خطأً **دائماً**
 *     (`ir_guard_consumption_immutable`, `prevent_audit_log_modification`) —
 *     وجدولٌ لا يُحذف منه أبداً لا مسار صامت فيه.
 * (٣) **الحكم النهائى**: فيها مخرجٌ لا يرفع خطأً (`RETURN NEW`) **و**لا تُعيد
 *     `OLD` ولا `COALESCE(NEW, OLD)` فى أى مسار ⇒ **١**، وهى المعطوبة.
 *
 * ⇒ **الحارس يُضيَّق حتى يُصيب واحداً بعينه، لا حتى يسكت.** والفرق أن
 *   التضييق الأول يُبقى قدرته على الإمساك، والثانى يُلغيها.
 *
 * الأساس اليوم: **صفر**.
 *
 * Usage: node scripts/check-trigger-silently-cancels-delete.js [--require-db]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
const url = process.env.PRODUCTION_SUPABASE_DB_URL

/**
 * استثناءاتٌ مكتوبةٌ بأسبابها، تُحذف بزوال سببها (درس ٨٥٧). فارغةٌ اليوم،
 * والحفاظ عليها فارغةً هو المقصود: **لا سبب يجعل الحذف يُلغى بصمت.**
 */
const ALLOWED = new Map([])

const SQL = `
  SELECT c.relname AS table_name,
         t.tgname   AS trigger_name,
         p.proname  AS fn
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc  p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE NOT t.tgisinternal
     AND n.nspname = 'public'
     AND (t.tgtype & 2) <> 0          -- BEFORE
     AND (t.tgtype & 8) <> 0          -- DELETE
     -- مخرجٌ لا يرفع خطأً:
     AND pg_get_functiondef(p.oid) ~ 'RETURN NEW'
     -- ولا سبيل لإنهاء الحذف إنهاءً صحيحاً:
     AND pg_get_functiondef(p.oid) !~ 'RETURN OLD'
     AND pg_get_functiondef(p.oid) !~ 'RETURN COALESCE\\(NEW, OLD\\)'
   ORDER BY c.relname, t.tgname
`

/**
 * الحكم معزولاً عن القاعدة كى يُختبر بلا شبكة.
 * @param {{table_name:string,trigger_name:string,fn:string}[]} rows
 * @returns {string[]}
 */
function findSilentCancellers(rows) {
  const out = []
  for (const r of rows) {
    if (ALLOWED.has(r.fn)) continue
    out.push(
      `  - ${r.table_name}: trigger ${r.trigger_name} runs ${r.fn}(),\n` +
      `      a BEFORE DELETE function with a non-raising exit that never returns OLD.\n` +
      `      => on DELETE, NEW is NULL, and a BEFORE trigger returning NULL\n` +
      `         CANCELS the row operation. The delete does not fail. It does\n` +
      `         not happen either, and the caller is told it worked.`
    )
  }
  return out
}

module.exports = { findSilentCancellers, SQL }

if (require.main !== module) return

;(async () => {
  if (!url) {
    const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot inspect BEFORE DELETE triggers."
    if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
    console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
    process.exit(0)
  }

  let Client
  try { ({ Client } = require("./lib/live-db")) } catch {
    console.error("X npm install pg --save-dev"); process.exit(1)
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let rows = []
  let total = 0
  try {
    ;({ rows } = await client.query(SQL))
    const { rows: t } = await client.query(`
      SELECT count(*)::int AS n
        FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE NOT t.tgisinternal AND n.nspname = 'public'
         AND (t.tgtype & 2) <> 0 AND (t.tgtype & 8) <> 0
    `)
    total = t[0] ? t[0].n : 0
  } finally { await client.end() }

  if (total === 0) {
    console.error("X no BEFORE DELETE trigger found at all - the query is broken, not the schema")
    process.exit(1)
  }

  const failures = findSilentCancellers(rows)

  if (failures.length > 0) {
    console.error(`X ${failures.length} trigger(s) can cancel a DELETE in silence:\n`)
    for (const f of failures) console.error(f)
    console.error(
      "\n  Fix: end the function with RETURN COALESCE(NEW, OLD), or return OLD in\n" +
      "  the DELETE branch. Do NOT add an exception here - there is no reason for\n" +
      "  a delete to be cancelled without saying so. If the delete should be\n" +
      "  refused, RAISE. Refusal is visible; silence is not."
    )
    process.exit(1)
  }

  console.log(
    `+ no BEFORE DELETE trigger cancels a delete in silence ` +
    `(${total} BEFORE DELETE trigger(s) inspected).`
  )
})().catch((err) => {
  console.error(
    "X failed:",
    String(err.message || err).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://<redacted>")
  )
  process.exit(1)
})

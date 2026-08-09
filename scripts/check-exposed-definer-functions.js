#!/usr/bin/env node
/**
 * check-exposed-definer-functions.js
 * ---------------------------------------------------------------------------
 * v3.74.919 — دالةٌ تكتب بصلاحياتٍ كاملة تُسأل: من يملك نداءها؟
 *
 * وُلد هذا الحارس من عطبٍ **صنعتُه بيدى بالأمس**: أنشأتُ فى 918 دالة
 * `inventory_transfer_post_journal` — `SECURITY DEFINER` (وهو لازم: تكتب
 * قيداً وتُحدّث حركات المخزون) — ومنحتُ تنفيذها لدور `authenticated` بلا
 * أن تسأل عن هوية المُنادى. فأى مستخدمٍ مسجَّل كان يستطيع نداءها بمعرِّف
 * حركةٍ من **شركةٍ أخرى** فيُرحّل قيداً فى دفاترها.
 *
 * ولم يكشفه أحدٌ فى الدفعة: كشفته **لوحة سلامة النظام لدى المالك** بعد
 * ساعتين من النشر. وذلك تأخيرٌ لا يجوز فى بابٍ أمنى — واللوحة تقرير، أما
 * الدفعة فبوابة. فنُقل الفحص إلى البوابة.
 *
 * ═══ ما يقيسه، بنفس منطق فاحص اللوحة `ic_exposed_definer_functions` ═══
 *
 * دالةٌ فى `public`، `SECURITY DEFINER`، ليست محفِّزاً، تأخذ وسيطاً من نوع
 * `uuid` (أى تعمل على سجلٍّ بعينه)، وجسدُها فيه `INSERT`/`UPDATE`/`DELETE`،
 * **ولا يذكر** واحداً من: `assert_company_access` · `assert_is_self` ·
 * `user_has_company_access` · `company_members` · `auth.uid()` —
 * ثم هى مع ذلك قابلةٌ للتنفيذ من `authenticated` أو `anon`.
 *
 * والعلاج أحدُ اثنين، وكلاهما مقبول: أن تسأل عن الهوية، أو أن تُقصر على
 * `service_role` إن كان التطبيق لا يناديها أصلاً. والأفضل الاثنان معاً.
 *
 * Usage: node scripts/check-exposed-definer-functions.js [--require-db] [--list]
 * Env:   DEFINER_AUDIT_DB_URL — قاعدةٌ بديلة (يستعملها الفخّ الذاتى).
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

// v3.74.990 — كان الفخُّ الذاتىُّ لهذا الحارس فى ملفٍّ اسمُه selftest-*،
// **والدفعةُ لا تُشغّل إلّا ما اسمُه check-***. ففخٌّ لا يُشغَّل ليس فخّاً:
// يُنادى من هنا فيمرّ على كلِّ دفعة.
if (process.argv.includes("--selftest")) {
  const { spawnSync } = require("child_process")
  const r = spawnSync(process.execPath, [require("path").join(__dirname, "selftest-exposed-definer-functions.js")], {
    stdio: "inherit",
  })
  process.exit(typeof r.status === "number" ? r.status : 1)
}

const requireDb = process.argv.includes("--require-db")
const verbose = process.argv.includes("--list")

const url = process.env.DEFINER_AUDIT_DB_URL || process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "no database URL - cannot audit definer functions."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
  process.exit(0)
}

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

// v3.74.990 — كان الاستعلامُ مكتوباً هنا **ويقيس شكلاً لا خاصّيّة**:
//   • يشترط وسيطاً من نوع uuid — فمن يُخفى رقمَ الشركة داخل حمولة jsonb
//     يمرُّ من تحته (وهو ما حدث فى create_sales_invoice_atomic).
//   • ويشترط كتابةً صريحةً فى جسدها — فمن يُفوِّض الكتابةَ يبدو برىئاً.
// فصارت الخاصّيّةُ فى **بيتٍ واحدٍ فى القاعدة** تُقرأ ولا تُنسخ، ومعها:
// **ومن فوَّض إلى من يسأل فقد سأل** — فلا يُتَّهم برىء.
const SQL = `SELECT proname, args, writes_directly, writes_via_callee
               FROM public.erp_doors_that_do_not_ask()`

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let rows
  try { ({ rows } = await client.query(SQL)) } finally { await client.end() }

  if (rows.length > 0) {
    console.error(
      `X ${rows.length} SECURITY DEFINER function(s) write into a company and never ask whether the`
    )
    console.error(`  caller belongs to it - and every one of them is callable by an end user:`)
    for (const r of rows) {
      const how = r.writes_directly ? "writes directly" : "writes through a callee"
      console.error(`  - ${r.proname}(${r.args}) - ${how}`)
    }
    console.error("  Fix EITHER by asking the question (assert_company_access / assert_company_access_by_row /")
    console.error("  assert_is_self - whichever fits), OR by restricting it to service_role if the application")
    console.error("  never calls it. Both together is better: a revoked grant can come back with one migration.")
    console.error("  See supabase/migrations/20260808000009_v3_74_990_every_door_asks_the_question_itself.sql")
    process.exit(1)
  }

  console.log(
    "+ every door that writes into a company asks whether its caller belongs to it - measured by " +
      "property, not by shape: the id may travel as a uuid or inside a payload, the write may be direct " +
      "or delegated, and delegating to a door that asks counts as asking."
  )
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })

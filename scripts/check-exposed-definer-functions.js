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

const SQL = `
  SELECT p.proname,
         pg_get_function_identity_arguments(p.oid) AS args,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') AS by_authenticated,
         has_function_privilege('anon',          p.oid, 'EXECUTE') AS by_anon
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     AND p.prosecdef
     AND p.prorettype <> 'trigger'::regtype
     AND p.proname NOT LIKE 'assert\\_%'
     AND pg_get_function_identity_arguments(p.oid) ILIKE '%uuid%'
     AND (p.prosrc ILIKE '%INSERT INTO%'
       OR p.prosrc ~* '\\mUPDATE\\s+\\w'
       OR p.prosrc ~* '\\mDELETE\\s+FROM')
     AND p.prosrc NOT ILIKE '%company_members%'
     AND p.prosrc NOT ILIKE '%auth.uid()%'
     AND p.prosrc NOT ILIKE '%user_has_company_access%'
     AND p.prosrc NOT ILIKE '%assert_company_access%'
     AND p.prosrc NOT ILIKE '%assert_is_self%'
   ORDER BY p.proname`

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let rows
  try { ({ rows } = await client.query(SQL)) } finally { await client.end() }

  const exposed = rows.filter((r) => r.by_authenticated || r.by_anon)

  if (exposed.length > 0) {
    console.error(`X ${exposed.length} SECURITY DEFINER function(s) write with full rights and never ask who is calling:`)
    for (const r of exposed) {
      const who = [r.by_anon ? "anon" : null, r.by_authenticated ? "authenticated" : null]
        .filter(Boolean).join(" + ")
      console.error(`  - ${r.proname}(${r.args}) - callable by ${who}`)
    }
    console.error("  Fix EITHER by asking the question (assert_company_access / assert_company_access_by_row /")
    console.error("  assert_is_self - whichever fits), OR by restricting it to service_role if the application")
    console.error("  never calls it. Both together is better: a revoked grant can come back with one migration.")
    console.error("  See supabase/migrations/20260731000009_v3_74_919_transfer_journal_caller_identity.sql")
    process.exit(1)
  }

  if (verbose && rows.length > 0) {
    console.log(`  ${rows.length} definer writer(s) with no identity check, all restricted to service_role:`)
    for (const r of rows) console.log(`    ${r.proname}`)
  }
  console.log(
    `+ no SECURITY DEFINER writer is exposed to end users (${rows.length} function(s) lack an identity ` +
    `check and every one of them is service_role only).`
  )
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })

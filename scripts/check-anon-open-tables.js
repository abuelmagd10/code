#!/usr/bin/env node
/**
 * check-anon-open-tables.js
 * ---------------------------------------------------------------------------
 * v3.74.857 — لا جدول يُترك مفتوحاً للزائر المجهول.
 *
 * **الحادثة**: أثناء تنظيف روتينى لسجلات معلَّقة، تبيّن أن ١٢ جدولاً كانت
 * مقروءة — وبعضها قابلاً للحذف والتعديل — لأى زائر يحمل المفتاح العام
 * (وهو منشور فى المتصفح بطبيعته). من بينها ١٧٤٬٣٩٥ صفّاً من `system_logs`،
 * وبريد كل عميل سجَّل شركة، وجداول الاشتراكات والفوترة.
 *
 * **السبب الجذرى الأول — الذراع (أ)**:
 *   سياساتٌ سُمّيت `*_service_role` / `*_service_write` لكنها كُتبت بلا
 *   `TO service_role`. وفى Postgres، السياسة المتساهلة بلا تحديد دور تسرى
 *   على `PUBLIC` — أى على `anon` أيضاً. والسياسات المتساهلة تُجمَع بـ«أو»،
 *   فسياسةٌ واحدة `USING (true)` تُبطل كل السياسات المحكمة بجوارها.
 *
 * ── v3.74.892 — الذراع (ب): البقعة العمياء التى عاشت تحت هذا الحارس ────
 * **الحادثة الثانية (891)**: جدولا القيود الدورية كانا مفتوحَين للمجهول
 * بالكامل (قراءة/كتابة/حذف/TRUNCATE) — **وهذا الحارس أخضر**. لماذا؟
 * لأن ذراعه الوحيدة كانت تفحص `pg_policy`: سياسات متساهلة مفتوحة.
 * والجدولان كانا **بلا RLS أصلاً** ⇒ لا سياسات ⇒ لا صفوف فى الاستعلام
 * ⇒ صمت. حارسُ «السياسات المفتوحة» لا يرى «غياب الحماية كلها» —
 * درس 845 حرفياً: رقمُ صفرٍ من حارسٍ لم يفحص الشكل ليس معلومة.
 *
 * ⇒ الذراع (ب): كل جدول فى public بـ`relrowsecurity = false` وممنوحٍ
 *   لـ`anon` **أو** لـ`authenticated` (فبلا RLS يصير كل مستخدمٍ مسجَّل
 *   فى أى شركة قادراً على عبور بيانات الشركات كلها) — مخالفةٌ إلا
 *   باستثناء مسمّى.
 *
 * ⇒ ودرس 845 يُطبَّق على الحارس نفسه: وضع `--prove` يزرع العطبين —
 *   جدولاً بلا RLS بمنحة anon، وجدولاً بسياسة مفتوحة — داخل معاملة
 *   تُلغى، ويجب أن يراهما الحارس **قبل** أن يُصدَّق صمته على الحقيقى.
 *
 * الفحص: (أ) كل سياسة متساهلة، موجَّهة إلى PUBLIC أو إلى anon صراحةً،
 * شرطها `true` (أو غائب)، على جدول ممنوح لـ`anon`. (ب) كل جدول بلا RLS
 * ممنوح لـanon أو authenticated.
 *
 * خط الأساس: **صفر**. لا يُرفع أبداً — يُضاف الاستثناء بالاسم وبسببه فقط.
 *
 * Usage: node scripts/check-anon-open-tables.js [--require-db] [--prove]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
const prove = process.argv.includes("--prove")
const url = process.env.PRODUCTION_SUPABASE_DB_URL

/**
 * بياناتٌ مرجعية عامة — قراءةٌ فقط، ولا تخصّ عميلاً بعينه، ويحتاجها
 * المتصفح **قبل** تسجيل الدخول (شاشة التسجيل تعرض العملات والخطط والدول).
 * كل سطر هنا مبرَّرٌ بذاته؛ الإضافة إليه قرارٌ لا إجراء.
 */
const ALLOWED_PUBLIC_READ = new Map([
  ["country_vat_rates", "نسب الضريبة حسب الدولة — تُعرض فى شاشة التسجيل قبل الدخول"],
  ["global_currencies", "قائمة العملات — تُعرض فى شاشة التسجيل قبل الدخول"],
  ["subscription_plans", "خطط الاشتراك — صفحة الأسعار العامة"],
  ["volume_discount_tiers", "شرائح خصم الحجم — صفحة الأسعار العامة"],
  ["permissions", "تعريفات الصلاحيات — قاموس ثابت بلا بيانات عملاء"],
  ["roles", "تعريفات الأدوار — قاموس ثابت بلا بيانات عملاء"],
  ["role_default_permissions", "الربط الافتراضى دور↔صلاحية — قاموس ثابت"],
  ["integrity_check_definitions", "تعريفات فحوص السلامة — قاموس ثابت"],
])

/** استثناءات كتابة للمجهول — يجب أن تبقى نادرة جداً ومبرَّرة سطراً بسطر. */
const ALLOWED_ANON_WRITE = new Map([
  [
    "pending_companies:INSERT",
    "حفظ اسم الشركة يحدث فى شاشة التسجيل قبل وجود الحساب أصلاً. " +
      "الإدخال فقط — لا قراءة ولا تعديل ولا حذف (v3.74.857).",
  ],
])

/**
 * استثناءات الذراع (ب): جداول بلا RLS عمداً. **فارغة الآن، ويُرجى أن
 * تبقى كذلك** — جدول بلا RLS ممنوح لأدوار PostgREST هو بابٌ بلا قفل.
 */
const ALLOWED_RLS_OFF = new Map([])

if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot check anon-open tables."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
  process.exit(0)
}

let Client
try { ({ Client } = require("./lib/live-db")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

const SQL = `
  SELECT c.relname AS table_name,
         p.polname  AS policy_name,
         CASE p.polcmd
           WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
           WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END AS cmd,
         COALESCE(
           (SELECT string_agg(r.rolname, '+') FROM pg_roles r WHERE r.oid = ANY (p.polroles)),
           'PUBLIC') AS target_roles,
         COALESCE(
           (SELECT string_agg(DISTINCT g.privilege_type, ',' ORDER BY g.privilege_type)
              FROM information_schema.role_table_grants g
             WHERE g.table_name = c.relname
               AND g.table_schema = 'public'
               AND g.grantee = 'anon'
               AND g.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')),
           '') AS anon_grants,
         COALESCE((SELECT s.n_live_tup FROM pg_stat_user_tables s WHERE s.relid = c.oid), 0) AS approx_rows
    FROM pg_policy p
    JOIN pg_class     c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   WHERE p.polpermissive
     -- موجَّهة للعموم، أو لـanon صراحةً
     AND (p.polroles = '{0}'::oid[]
          OR EXISTS (SELECT 1 FROM pg_roles r
                      WHERE r.oid = ANY (p.polroles) AND r.rolname = 'anon'))
     -- شرطها مفتوح تماماً
     AND COALESCE(pg_get_expr(p.polqual,      p.polrelid), 'true') = 'true'
     AND COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), 'true') = 'true'
     -- والجدول ممنوح فعلاً لـanon (وإلا فالسياسة بلا أثر)
     AND EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                  WHERE g.table_name = c.relname AND g.table_schema = 'public'
                    AND g.grantee = 'anon'
                    AND g.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE'))
   ORDER BY approx_rows DESC, c.relname, p.polname
`

/**
 * v3.74.892 — الذراع (ب): جداول بلا RLS إطلاقاً، ممنوحة لأدوار PostgREST.
 * بلا RLS لا توجد سياسات أصلاً، فالذراع (أ) عمياء عنها بالبناء.
 */
const SQL_RLS_OFF = `
  SELECT c.relname AS table_name,
         COALESCE(
           (SELECT string_agg(DISTINCT g.privilege_type, ',' ORDER BY g.privilege_type)
              FROM information_schema.role_table_grants g
             WHERE g.table_name = c.relname AND g.table_schema = 'public'
               AND g.grantee = 'anon'
               AND g.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')),
           '') AS anon_grants,
         COALESCE(
           (SELECT string_agg(DISTINCT g.privilege_type, ',' ORDER BY g.privilege_type)
              FROM information_schema.role_table_grants g
             WHERE g.table_name = c.relname AND g.table_schema = 'public'
               AND g.grantee = 'authenticated'
               AND g.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')),
           '') AS auth_grants,
         COALESCE((SELECT s.n_live_tup FROM pg_stat_user_tables s WHERE s.relid = c.oid), 0) AS approx_rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   WHERE c.relkind = 'r'
     AND NOT c.relrowsecurity
     AND EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                  WHERE g.table_name = c.relname AND g.table_schema = 'public'
                    AND g.grantee IN ('anon','authenticated')
                    AND g.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE'))
   ORDER BY approx_rows DESC, c.relname
`

/** يُوسَّع 'ALL' إلى الأربع، ويُقاطَع مع ما هو ممنوح لـanon فعلاً. */
function effectiveCommands(row) {
  const granted = new Set(String(row.anon_grants || "").split(",").filter(Boolean))
  const fromPolicy = row.cmd === "ALL"
    ? ["SELECT", "INSERT", "UPDATE", "DELETE"]
    : [row.cmd]
  return fromPolicy.filter((c) => granted.has(c))
}

/** حكم الذراع (أ) — كما كان. */
function judgePolicyRows(rows) {
  const offenders = []
  let allowedCount = 0
  for (const row of rows) {
    const cmds = effectiveCommands(row)
    if (cmds.length === 0) continue      // سياسة بلا منحة تسندها = بلا أثر

    const writes = cmds.filter((c) => c !== "SELECT")
    const reads = cmds.filter((c) => c === "SELECT")
    const unjustified = []

    // القراءة: مسموحة فقط للبيانات المرجعية العامة المسمّاة بالاسم
    if (reads.length > 0 && !ALLOWED_PUBLIC_READ.has(row.table_name)) {
      unjustified.push("SELECT")
    }
    // الكتابة: مسموحة فقط بمفتاح "جدول:أمر" مسجَّل صراحةً
    for (const w of writes) {
      if (!ALLOWED_ANON_WRITE.has(`${row.table_name}:${w}`)) unjustified.push(w)
    }

    if (unjustified.length > 0) offenders.push({ kind: "open-policy", ...row, unjustified })
    else allowedCount++
  }
  return { offenders, allowedCount }
}

/** حكم الذراع (ب): بلا RLS + منح = مخالفة إلا باستثناء مسمّى. */
function judgeRlsOffRows(rows) {
  const offenders = []
  for (const row of rows) {
    if (ALLOWED_RLS_OFF.has(row.table_name)) continue
    const exposure = []
    if (row.anon_grants) exposure.push(`anon: ${row.anon_grants}`)
    if (row.auth_grants) exposure.push(`any logged-in user of ANY company: ${row.auth_grants}`)
    if (exposure.length === 0) continue
    offenders.push({ kind: "rls-off", ...row, exposure })
  }
  return offenders
}

async function runOnce(client) {
  const { rows: policyRows } = await client.query(SQL)
  const { rows: rlsOffRows } = await client.query(SQL_RLS_OFF)
  const a = judgePolicyRows(policyRows)
  const b = judgeRlsOffRows(rlsOffRows)
  return { offenders: [...a.offenders, ...b], allowedCount: a.allowedCount }
}

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()

  try {
    if (prove) {
      // درس 845: الحارس لا يُصدَّق حتى يُرى يفشل. نزرع العطبين داخل
      // معاملة تُلغى: (أ) سياسة مفتوحة + منحة anon، (ب) جدول بلا RLS
      // بمنحة anon — ويجب أن تلتقطهما الذراعان قبل تصديق الصمت.
      await client.query("BEGIN")
      let proved = false
      try {
        await client.query(
          "CREATE TABLE public.zz_probe_892_rls_off (id int, secret text)")
        // مُشغِّل الأحداث ensure_rls يفعّل RLS تلقائياً على كل جدول جديد —
        // (اكتُشف أثناء برهنة هذا الوضع نفسه: المسبار الأول خرج محمياً
        // رغماً عنه!). نعطّله صراحةً لإعادة الحالة التاريخية للعطب.
        await client.query(
          "ALTER TABLE public.zz_probe_892_rls_off DISABLE ROW LEVEL SECURITY")
        await client.query("GRANT SELECT ON public.zz_probe_892_rls_off TO anon")
        await client.query(
          "CREATE TABLE public.zz_probe_892_open_policy (id int, secret text)")
        await client.query(
          "ALTER TABLE public.zz_probe_892_open_policy ENABLE ROW LEVEL SECURITY")
        await client.query(
          "CREATE POLICY zz_probe_open ON public.zz_probe_892_open_policy FOR SELECT USING (true)")
        await client.query("GRANT SELECT ON public.zz_probe_892_open_policy TO anon")

        const { offenders } = await runOnce(client)
        const sawRlsOff = offenders.some(
          (o) => o.kind === "rls-off" && o.table_name === "zz_probe_892_rls_off")
        const sawPolicy = offenders.some(
          (o) => o.kind === "open-policy" && o.table_name === "zz_probe_892_open_policy")

        if (!sawRlsOff) {
          console.error("X PROVE FAILED: a planted RLS-OFF table with an anon grant was NOT detected - arm (b) is blind")
          process.exit(1)
        }
        if (!sawPolicy) {
          console.error("X PROVE FAILED: a planted open policy with an anon grant was NOT detected - arm (a) is blind")
          process.exit(1)
        }
        proved = true
      } finally {
        await client.query("ROLLBACK")
      }
      if (proved) {
        console.log("+ anon-open guard seen refusing BOTH shapes: a wide-open policy AND a table with no RLS at all (probes rolled back).")
      }
    }

    const { offenders, allowedCount } = await runOnce(client)

    if (offenders.length > 0) {
      console.error(
        `X ${offenders.length} table(s)/policy(ies) leave data open ` +
          `(the public key is published in the browser - "anon" means anyone on the internet):\n`
      )
      for (const o of offenders) {
        if (o.kind === "rls-off") {
          console.error(
            `  - ${o.table_name}  [NO ROW LEVEL SECURITY AT ALL]\n` +
              `      exposed to -> ${o.exposure.join("  |  ")}\n` +
              `      rows exposed (approx): ${o.approx_rows}`
          )
        } else {
          console.error(
            `  - ${o.table_name}  [${o.policy_name}]\n` +
              `      anonymous can: ${o.unjustified.join(", ")}\n` +
              `      policy targets: ${o.target_roles}   anon grants: ${o.anon_grants || "(none)"}\n` +
              `      rows exposed (approx): ${o.approx_rows}`
          )
        }
      }
      console.error(
        `\n  Two ways a table ends up open:\n` +
          `  (a) a permissive policy written without TO service_role targets PUBLIC - anon\n` +
          `      included - and one USING(true) policy overrides every careful one beside it.\n` +
          `  (b) v3.74.892: the table has NO RLS AT ALL, so there are no policies for arm (a)\n` +
          `      to inspect - and PostgREST default grants hand it to anon AND to every\n` +
          `      logged-in user of every company.\n` +
          `  Fix: ENABLE ROW LEVEL SECURITY with company-scoped policies, REVOKE the anon\n` +
          `  grants, and only then - if truly public reference data - add a named exception.`
      )
      process.exit(1)
    }

    console.log(
      `+ no table is open to anonymous visitors, and no table lacks RLS ` +
        `(${allowedCount} documented public-reference/pre-signup exception(s)).`
    )
  } finally {
    await client.end()
  }
})().catch((e) => {
  console.error(`X check-anon-open-tables failed: ${e.message}`)
  process.exit(1)
})

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
 * **السبب الجذرى — وهو ما يحرسه هذا الملف**:
 *   سياساتٌ سُمّيت `*_service_role` / `*_service_write` لكنها كُتبت بلا
 *   `TO service_role`. وفى Postgres، السياسة المتساهلة بلا تحديد دور تسرى
 *   على `PUBLIC` — أى على `anon` أيضاً. والسياسات المتساهلة تُجمَع بـ«أو»،
 *   فسياسةٌ واحدة `USING (true)` تُبطل كل السياسات المحكمة بجوارها.
 *
 *   والمفارقة أن `service_role` له `rolbypassrls = true` — يتخطى الحماية
 *   أصلاً — فهذه السياسات لم تُفِد أحداً قط، وأثرها الوحيد كان فتح الباب.
 *
 * ⇒ **لماذا لم يكشفها الحارس السابق؟** لأن `check-anon-reachable-readers`
 *   يفحص **الدوال** المفتوحة للمجهولين لا **الجداول**. حارسٌ على بابٍ لا
 *   يحمى باباً آخر — وهذا الدرس تكرَّر فى ٨٣٣ و٨٤٥ و٨٥١ و٨٥٣.
 *
 * الفحص: كل سياسة متساهلة، موجَّهة إلى PUBLIC أو إلى anon صراحةً،
 * شرطها `true` (أو غائب)، على جدول ممنوح لـ`anon`.
 *
 * خط الأساس: **صفر**. لا يُرفع أبداً — يُضاف الاستثناء بالاسم وبسببه فقط.
 *
 * Usage: node scripts/check-anon-open-tables.js [--require-db]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
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

if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot check anon-open tables."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
  process.exit(0)
}

let Client
try { ({ Client } = require("pg")) } catch {
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

/** يُوسَّع 'ALL' إلى الأربع، ويُقاطَع مع ما هو ممنوح لـanon فعلاً. */
function effectiveCommands(row) {
  const granted = new Set(String(row.anon_grants || "").split(",").filter(Boolean))
  const fromPolicy = row.cmd === "ALL"
    ? ["SELECT", "INSERT", "UPDATE", "DELETE"]
    : [row.cmd]
  return fromPolicy.filter((c) => granted.has(c))
}

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let rows = []
  try { ({ rows } = await client.query(SQL)) } finally { await client.end() }

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

    if (unjustified.length > 0) {
      offenders.push({ ...row, unjustified })
    } else {
      allowedCount++
    }
  }

  if (offenders.length > 0) {
    console.error(
      `X ${offenders.length} table policy/policies leave data open to ANONYMOUS visitors ` +
        `(the public key is published in the browser - "anon" means anyone on the internet):\n`
    )
    for (const o of offenders) {
      console.error(
        `  - ${o.table_name}  [${o.policy_name}]\n` +
          `      anonymous can: ${o.unjustified.join(", ")}\n` +
          `      policy targets: ${o.target_roles}   anon grants: ${o.anon_grants || "(none)"}\n` +
          `      rows exposed (approx): ${o.approx_rows}`
      )
    }
    console.error(
      `\n  A policy named "*_service_role" does NOT restrict anything unless it says\n` +
        `  TO service_role. Written without a role it targets PUBLIC - which includes anon.\n` +
        `  And service_role has rolbypassrls=true, so it never needed the policy at all.\n` +
        `  Fix: DROP the policy (service_role still works), keep the company-scoped ones,\n` +
        `  and REVOKE the anon grant. Only then add an entry here - with its reason.`
    )
    process.exit(1)
  }

  console.log(
    `+ no table is open to anonymous visitors ` +
      `(${allowedCount} documented public-reference/pre-signup exception(s)).`
  )
})().catch((e) => {
  console.error(`X check-anon-open-tables failed: ${e.message}`)
  process.exit(1)
})

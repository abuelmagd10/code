#!/usr/bin/env node
/**
 * check-users-without-company.js
 * ---------------------------------------------------------------------------
 * v3.74.856 — لا عميل يبقى بحساب مؤكَّد **بلا شركة**.
 *
 * **الحادثة**: أبلغ المالك أن عميلاً يسجّل «جريس تاون للمقاولات» يرى شاشة
 * واقفة على «جارى التحميل...» بعد الدخول. وبالفحص: الحساب موجود، والبريد
 * مؤكَّد، والدخول ناجح — و**صفر شركات**.
 *
 * والسبب أن الشركة **لا تُنشأ لحظة التسجيل**: يُحفظ اسمها فقط، وتُنشأ عند
 * إدخال كود التأكيد فى `/auth/callback`. وهناك كان السجل الاحتياطى
 * (`pending_companies`) يُحذف **فور قراءته**، والشركة تُنشأ بعده بعشرات
 * الأسطر — فأى تعثّر بينهما يُتلف الاحتياطى قبل نجاح ما يعتمد عليه، ويترك
 * العميل بلا شركة وبلا ما يُعاد منه.
 *
 * ⇒ **ولماذا فحصٌ منفصل والإصلاح تمّ؟** لأن العطب **لا يُبلَّغ عنه**: العميل
 *   لا يرى خطأً، والنظام لا يسجّل شيئاً، والمالك لا يعلم إلا إذا اتصل به
 *   العميل. وهذه أول شاشة يراها المشترك الجديد — أغلى لحظة فى المنتج كله.
 *
 * فليُقَس الأثر مباشرةً: **هل يوجد اليوم حسابٌ مؤكَّد بلا شركة؟**
 *
 * Usage: node scripts/check-users-without-company.js [--require-db]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
const url = process.env.PRODUCTION_SUPABASE_DB_URL

// مهلة سماح: من أكّد بريده للتوّ قد يكون فى منتصف شاشة الإعداد الآن.
// ساعة تكفى لأى إعداد طبيعى، ولا تُخفى عطباً حقيقياً أكثر من ساعة.
const GRACE_MINUTES = Number(process.env.NO_COMPANY_GRACE_MINUTES ?? 60)

// حسابات موروثة سبقت الإصلاح — مسجَّلة بالاسم لا مسكوت عنها.
// تُزال من هنا متى أنشأ أصحابها شركاتهم أو حُذفت حساباتهم.
const KNOWN = new Set([
  // الحادثة نفسها. يُزال من هنا بمجرد أن يُكمل الإعداد بعد النشر.
  "maxaboelmagd@gmail.com",   // جريس تاون للمقاولات
  // حسابٌ من ٧ نوفمبر ٢٠٢٥ — **سابق لمسار الإعداد الحالى**، وبلا اسم شركة
  // فى بياناته أصلاً ولا دعوة معلَّقة. كشفه هذا الفحص ولم نكن نعلم به:
  // دليلٌ عملى على أن العطب كان يمرّ صامتاً بلا أن يُبلَّغ عنه أحد.
  "vitaslims1@gmail.com",
])

if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot check for stranded users."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
  process.exit(0)
}

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

// الشرط: بريدٌ مؤكَّد (فقد أتمّ التسجيل فعلاً) + لا عضوية + لا شركة يملكها
// + مضى على التأكيد أكثر من مهلة السماح.
const SQL = `
  SELECT u.email,
         u.created_at,
         u.email_confirmed_at,
         u.last_sign_in_at,
         u.raw_user_meta_data->>'company_name' AS intended_company,
         EXISTS (SELECT 1 FROM public.pending_companies p
                  WHERE lower(p.user_email) = lower(u.email)) AS has_pending_backup
    FROM auth.users u
   WHERE u.email_confirmed_at IS NOT NULL
     AND u.email_confirmed_at < now() - ($1 || ' minutes')::interval
     AND NOT EXISTS (SELECT 1 FROM public.company_members m WHERE m.user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM public.companies c      WHERE c.user_id = u.id)
   ORDER BY u.email_confirmed_at DESC
`

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let rows = []
  try { ({ rows } = await client.query(SQL, [GRACE_MINUTES])) } finally { await client.end() }

  const offenders = rows.filter((r) => !KNOWN.has(String(r.email || "").toLowerCase()))

  if (offenders.length > 0) {
    console.error(
      `X ${offenders.length} confirmed account(s) have NO company - they hit a dead end ` +
        `on the first screen after signing in:\n`
    )
    for (const o of offenders) {
      console.error(
        `  - ${o.email}\n` +
          `      intended company: ${o.intended_company || "(unknown)"}\n` +
          `      confirmed: ${o.email_confirmed_at}   last sign-in: ${o.last_sign_in_at || "never"}\n` +
          `      pending backup still available: ${o.has_pending_backup ? "yes" : "NO - the name is lost"}`
      )
    }
    console.error(
      "\n  A company is NOT created at sign-up - only its name is stored. It is\n" +
        "  created when the confirmation code is entered, in /auth/callback. A\n" +
        "  failure anywhere in that step leaves a real customer with an account\n" +
        "  and nothing to use, and nobody is told.\n\n" +
        "  Since v3.74.856 such a user is redirected to /onboarding and can finish\n" +
        "  setup themselves. If someone still appears here, that redirect or the\n" +
        "  onboarding screen itself is failing - investigate before adding to KNOWN."
    )
    process.exit(1)
  }

  console.log(
    `+ no confirmed account is left without a company ` +
      `(${GRACE_MINUTES}m grace, ${KNOWN.size} documented legacy account(s)).`
  )
})().catch((err) => {
  console.error(
    "X failed:",
    String(err.message || err).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://<redacted>")
  )
  process.exit(1)
})

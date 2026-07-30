#!/usr/bin/env node
/**
 * check-je-default-status.js
 * ---------------------------------------------------------------------------
 * v3.74.893 — لا دالةَ قاعدةِ بيانات جديدة تعتمد على افتراضى
 * `journal_entries.status` بصمت.
 *
 * **القياس الذى أنجب هذا الحارس** (مرشَّح درس 883: قلب الافتراضى
 * `posted` → `draft`):
 *   * كود TS كله يصرّح بالحالة — صفر اعتماد على الافتراضى.
 *   * ١١ موضع INSERT فى ١٠ دوال قاعدة بيانات تعتمد عليه. من بينها مسار
 *     حى واحد يعمل (`auto_create_cogs_journal` — قيود COGS لكل بيع،
 *     تحت سياق موثوق يضبط `app.allow_direct_post`)، ومساران حيّان
 *     **مكسوران أصلاً** لأنهما يولّدان posted بلا سياق موثوق فيرفضهما
 *     حارس `enforce_je_integrity`:
 *       - `cancel_approved_write_off` (أُصلح فى 893 — خرج من القائمة)
 *       - `update_bill_on_credit_application` (أُصلح فى 894 بالتصميم
 *         المحاسبى الصحيح — صار يقيّد عبر الدالة الذرّية عند الحاجة
 *         فقط، وخرج من القائمة. القائمة انكمشت 9→8).
 *   * **القرار**: الافتراضى يبقى `posted`. قلبه إلى `draft` كان سيحوّل
 *     قيود COGS الحية إلى مسودّات صامتة خارج الدفاتر — إفسادٌ صامت
 *     للمسار الأهم. والاعتماد الصامت نفسه هو الشكل الممنوع: كل INSERT
 *     جديد يجب أن يصرّح بالحالة.
 *
 * الفحص: كل دالة فى public تُدرِج فى journal_entries بقائمة أعمدة لا
 * تذكر `status`. القائمة أدناه هى المخزون التاريخى المُقاس — **لا تُضاف
 * إليها أسماء جديدة أبداً**؛ تقليصها هو الهدف.
 *
 * نقطة عمياء معلومة: INSERT بلا قائمة أعمدة أو عبر SQL ديناميكى لا يراه
 * النمط — الحصر اليدوى (2026-07-29) أثبت خلوّ القاعدة منهما.
 *
 * Usage: node scripts/check-je-default-status.js [--require-db] [--prove]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const requireDb = process.argv.includes("--require-db")
const prove = process.argv.includes("--prove")
const url = process.env.PRODUCTION_SUPABASE_DB_URL

/**
 * المخزون التاريخى المُقاس (2026-07-29) — كل سطر باسمه وسببه.
 * الإضافة ممنوعة؛ الحذف (بعد إصلاح الدالة لتصرّح بالحالة) هو التقدم.
 */
const MEASURED_LEGACY = new Map([
  ["accrual_invoice_accounting", "محرك استحقاق قديم (موضعان) — خلفه execute_sales_invoice_accounting؛ لا مستدعى TS"],
  ["approve_write_off", "قديم — الاعتماد يجرى فى مسار TS عبر الدوال الذرّية (888)؛ لا مستدعى TS"],
  ["auto_create_cogs_journal", "حى: قيد COGS لكل بيع (trigger) — يعمل فقط تحت مستدعين موثوقين يضبطون app.allow_direct_post؛ الافتراضى posted جزء من عمله"],
  ["create_missing_invoice_journals_safe", "أداة إصلاح إدارية — تُستدعى يدوياً فقط"],
  ["merge_duplicate_accounts_safe", "أداة إصلاح إدارية — تُستدعى يدوياً فقط"],
  ["reclassify_account_safe", "أداة إصلاح إدارية — تُستدعى يدوياً فقط"],
  ["record_payment", "قديم — خلفه create_*_payment_entry الذرّية؛ لا مستدعى TS"],
  ["register_asset_addition", "قديم — خلفه post_fixed_asset_acquisition_atomic؛ لا مستدعى TS"],
])

if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot check journal_entries status omission."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
  process.exit(0)
}

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

/**
 * كل دالة فى public يظهر فى جسدها INSERT INTO journal_entries بقائمة
 * أعمدة صريحة لا تذكر status — أى تعتمد على افتراضى العمود بصمت.
 */
const SQL = `
  WITH defs AS (
    SELECT p.oid, p.proname, lower(pg_get_functiondef(p.oid)) AS def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND lower(pg_get_functiondef(p.oid)) LIKE '%journal_entries%'
  ), ins AS (
    SELECT proname,
           (regexp_matches(def,
              'insert\\s+into\\s+(?:public\\.)?journal_entries\\s*\\(([^)]*)\\)',
              'g'))[1] AS collist
      FROM defs
  )
  SELECT proname, count(*)::int AS omitting_inserts
    FROM ins
   WHERE collist !~ '(^|,|\\s)status(\\s|,|$)'
   GROUP BY proname
   ORDER BY proname
`

async function runOnce(client) {
  const { rows } = await client.query(SQL)
  const offenders = rows.filter((r) => !MEASURED_LEGACY.has(r.proname))
  const shrunk = [...MEASURED_LEGACY.keys()].filter(
    (name) => !rows.some((r) => r.proname === name)
  )
  return { rows, offenders, shrunk }
}

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()

  try {
    if (prove) {
      // درس 845: الحارس لا يُصدَّق حتى يُرى يفشل. نزرع دالةً تعتمد على
      // الافتراضى داخل معاملة تُلغى — تُعرَّف ولا تُستدعى أبداً —
      // ويجب أن يلتقطها الفحص قبل تصديق صمته على الحقيقى.
      await client.query("BEGIN")
      let proved = false
      try {
        await client.query(`
          CREATE FUNCTION public.zz_probe_893_je_default() RETURNS uuid
          LANGUAGE plpgsql AS $probe$
          DECLARE v_id uuid;
          BEGIN
            INSERT INTO public.journal_entries (company_id, reference_type, reference_id, entry_date, description)
            VALUES (gen_random_uuid(), 'zz_probe', gen_random_uuid(), CURRENT_DATE, 'probe - never executed')
            RETURNING id INTO v_id;
            RETURN v_id;
          END; $probe$`)
        const { offenders } = await runOnce(client)
        if (!offenders.some((o) => o.proname === "zz_probe_893_je_default")) {
          console.error("X PROVE FAILED: a planted function relying on the journal_entries.status default was NOT detected - the guard is blind")
          process.exit(1)
        }
        proved = true
      } finally {
        await client.query("ROLLBACK")
      }
      if (proved) {
        console.log("+ je-default-status guard seen refusing a planted status-omitting function (probe rolled back).")
      }
    }

    const { rows, offenders, shrunk } = await runOnce(client)

    if (offenders.length > 0) {
      console.error(
        `X ${offenders.length} NEW function(s) INSERT into journal_entries without naming status:\n`
      )
      for (const o of offenders) {
        console.error(`  - ${o.proname}  (${o.omitting_inserts} omitting INSERT(s))`)
      }
      console.error(
        `\n  Relying on the column default is the forbidden shape (v3.74.893 measurement):\n` +
          `  born-'posted' without app.allow_direct_post is refused by enforce_je_integrity\n` +
          `  (DIRECT_POST_BLOCKED - a raw error in the customer's face), and if the default\n` +
          `  ever changed, the entry would silently stay a draft outside the books.\n` +
          `  Fix: state status explicitly ('posted' inside a trusted atomic context that\n` +
          `  sets app.allow_direct_post, or 'draft' + a deliberate posting step), or use\n` +
          `  create_journal_entry_atomic(). Never add a name to MEASURED_LEGACY.`
      )
      process.exit(1)
    }

    if (shrunk.length > 0) {
      console.log(
        `+ progress: ${shrunk.length} formerly-listed function(s) no longer rely on the default: ${shrunk.join(", ")} - remove them from MEASURED_LEGACY.`
      )
    }
    console.log(
      `+ no new function relies on the journal_entries.status default ` +
        `(${rows.length} measured legacy site(s) pinned by name).`
    )
  } finally {
    await client.end()
  }
})().catch((e) => {
  console.error(`X check-je-default-status failed: ${e.message}`)
  process.exit(1)
})

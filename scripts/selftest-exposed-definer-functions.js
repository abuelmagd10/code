#!/usr/bin/env node
/**
 * selftest-exposed-definer-functions.js
 * ---------------------------------------------------------------------------
 * v3.74.919 — يُرى الحارس وهو يرفض العطب الذى وقع بالأمس.
 *
 * يزرع نسخةً من الخطأ نفسه: دالة `SECURITY DEFINER` تأخذ `uuid` وتكتب فى
 * جدول، بلا سؤالٍ عن هوية المُنادى، وممنوحةً لدور `authenticated` — وهو
 * حرفياً ما فعلتُه بـ`inventory_transfer_post_journal` فى 918.
 *
 * وثلاث حالات، على **قاعدة الاختبار وحدها** (`TEST_SUPABASE_DB_URL`):
 *   (أ) الدالة المكشوفة              ⇒ يُرفض ويُسمّى الاسم.
 *   (ب) تُقصر على `service_role`     ⇒ يصمت (العلاج الأول: أقلّ صلاحية).
 *   (ج) تُمنح ثانيةً ولكن تسأل عن الهوية ⇒ يصمت (العلاج الثانى: السؤال).
 *
 * وبهما معاً يُبرهن أن الحارس لا يقيس المنحة وحدها ولا النصّ وحده، بل
 * **اجتماعهما**: كتابةٌ بصلاحيات كاملة + بلا سؤال + مكشوفة للمستخدم.
 *
 * ⚠️ ومصيدةٌ أوقعتنى فى أول تشغيل، مكتوبةٌ هنا كى تُعرف: **Postgres يمنح
 *    `EXECUTE` لـ`PUBLIC` تلقائياً عند إنشاء أى دالة**. فسحبُها من
 *    `authenticated` وحده لا يكفى — تبقى مقروءةً لـ`anon` بالوراثة عن
 *    PUBLIC. ولهذا يبدأ الزرع بـ`REVOKE ... FROM PUBLIC` ليكون خطُّ
 *    الأساس نظيفاً، فيُقاس ما نزرعه لا ما ورثناه. (وهجرة 918 كانت تسحب من
 *    PUBLIC وanon بالفعل، فلم يُكشف الإنتاج للزائر المجهول قط.)
 *
 *
 * Usage: node scripts/selftest-exposed-definer-functions.js
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const { spawnSync } = require("child_process")

const url = process.env.TEST_SUPABASE_DB_URL
if (!url) {
  console.log("! TEST_SUPABASE_DB_URL is not set - skipping (this selftest never runs against production).")
  process.exit(0)
}

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

const PROBE = "zz_probe_definer_writer"

/** الشكل المكشوف: تكتب، تأخذ uuid، ولا تسأل عن أحد. */
const EXPOSED = `
CREATE OR REPLACE FUNCTION public.${PROBE}(p_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $probe$
BEGIN
  UPDATE public.companies SET updated_at = updated_at WHERE id = p_id;
END;
$probe$;`

/** والشكل الذى يسأل. */
const GUARDED = `
CREATE OR REPLACE FUNCTION public.${PROBE}(p_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $probe$
BEGIN
  PERFORM public.assert_company_access(p_id);
  UPDATE public.companies SET updated_at = updated_at WHERE id = p_id;
END;
$probe$;`

/**
 * v3.74.990 — والشكلُ الذى كان يمرُّ من تحت الحارس القديم: رقمُ الشركة
 * **داخل حمولة** لا وسيطاً من نوع uuid. فالحارسُ كان يقيس الشكلَ لا
 * الخاصّيّة، وهذا الشكلُ نفسُه هو ما وُجد فى create_sales_invoice_atomic.
 */
const PAYLOAD_SHAPED = `
CREATE OR REPLACE FUNCTION public.${PROBE}_payload(p_payload jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $probe$
BEGIN
  UPDATE public.companies SET updated_at = updated_at
  WHERE id = (p_payload->>'company_id')::uuid;
END;
$probe$;`

function runGuard() {
  const r = spawnSync(process.execPath, ["scripts/check-exposed-definer-functions.js", "--require-db"], {
    encoding: "utf8",
    env: { ...process.env, DEFINER_AUDIT_DB_URL: url },
  })
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  const q = (s) => client.query(s)
  let ok = true

  const drop = async () => {
    await q(`DROP FUNCTION IF EXISTS public.${PROBE}(uuid)`)
    await q(`DROP FUNCTION IF EXISTS public.${PROBE}_payload(jsonb)`)
  }

  const stage = async (name, plant, expectFail, expectText) => {
    if (!ok) return
    await plant()
    const r = runGuard()
    if (expectFail) {
      if (!r.failed || !expectText.test(r.output)) {
        console.error(`X ${name} was accepted - an exposed definer writer could ship again.`)
        console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
        ok = false
      } else { console.log(`+ ${name}: رُفض كما يجب`) }
    } else {
      if (r.failed) {
        console.error(`X ${name} was reported - the guard would block a correct fix.`)
        console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
        ok = false
      } else { console.log(`+ ${name}: لم يُبلَّغ عنه كما يجب`) }
    }
  }

  try {
    await stage(
      "دالةٌ تكتب بصلاحيات كاملة وممنوحةٌ للمستخدم بلا سؤال",
      async () => {
        await q(EXPOSED)
        await q(`REVOKE EXECUTE ON FUNCTION public.${PROBE}(uuid) FROM PUBLIC`)
        await q(`REVOKE EXECUTE ON FUNCTION public.${PROBE}(uuid) FROM anon`)
        await q(`GRANT  EXECUTE ON FUNCTION public.${PROBE}(uuid) TO authenticated`)
      },
      true, new RegExp(PROBE))

    await stage(
      "العلاج الأول — تُقصر على مفتاح الخدمة",
      async () => { await q(`REVOKE EXECUTE ON FUNCTION public.${PROBE}(uuid) FROM authenticated`) },
      false)

    await stage(
      "العلاج الثانى — تُمنح للمستخدم ولكنها تسأل عن هويته",
      async () => {
        await q(GUARDED)
        await q(`REVOKE EXECUTE ON FUNCTION public.${PROBE}(uuid) FROM PUBLIC`)
        await q(`REVOKE EXECUTE ON FUNCTION public.${PROBE}(uuid) FROM anon`)
        await q(`GRANT  EXECUTE ON FUNCTION public.${PROBE}(uuid) TO authenticated`)
      },
      false)

    // v3.74.990 — والشكلُ الذى كان يمرُّ: رقمُ الشركة داخل حمولة.
    await stage(
      "الشكل الذى كان يمرّ — رقمُ الشركة داخل حمولة لا وسيطاً صريحاً",
      async () => {
        await q(PAYLOAD_SHAPED)
        await q(`REVOKE EXECUTE ON FUNCTION public.${PROBE}_payload(jsonb) FROM PUBLIC`)
        await q(`REVOKE EXECUTE ON FUNCTION public.${PROBE}_payload(jsonb) FROM anon`)
        await q(`GRANT  EXECUTE ON FUNCTION public.${PROBE}_payload(jsonb) TO authenticated`)
      },
      true, new RegExp(`${PROBE}_payload`))
  } finally {
    try { await drop() } catch (e) { console.error(`! cleanup: ${e.message}`) }
    await client.end()
  }

  if (!ok) process.exit(1)
  console.log("+ the definer-exposure guard is proven: it refuses a full-rights writer handed to end users,")
  console.log("  and accepts BOTH cures - least privilege, and asking who the caller is (test DB only).")
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })

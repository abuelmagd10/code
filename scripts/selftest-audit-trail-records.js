#!/usr/bin/env node
/**
 * selftest-audit-trail-records.js
 * ---------------------------------------------------------------------------
 * v3.74.859 — **يجب أن يُرى الحارس وهو يرفض.**
 *
 * حارسٌ يقول «صفر» لا يُثبت شيئاً حتى يُرى وهو يرفض العطب الذى كُتب من أجله.
 * وقد كلّفنا هذا الدرس ٨٣٣ و٨٤٥ و٨٥١ و٨٥٣ و٨٥٧ و٨٥٨.
 *
 * يعيد هذا الملف زرع **الصيغة المعطوبة نفسها** من الدالة (تعبير `CASE` يقرأ
 * `NEW.branch_id` بناءً على قائمة أسماء جداول) على **قاعدة الاختبار**، ثم
 * يشترط سقوط الحارس. وتُعاد الصيغة الصحيحة فى `finally` مهما حدث.
 *
 * ⚠️ قاعدة الاختبار فقط (TEST_SUPABASE_DB_URL). لا يقترب من الإنتاج.
 *
 * Usage: node scripts/selftest-audit-trail-records.js
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const { spawnSync } = require("child_process")

const testUrl = process.env.TEST_SUPABASE_DB_URL
if (!testUrl) {
  console.error(
    "X TEST_SUPABASE_DB_URL is not set - cannot prove the guard refuses anything.\n" +
      "  Refusing to ship a guard that has never been seen failing."
  )
  process.exit(1)
}

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

/** الصيغة المعطوبة — قائمة أسماء جداول داخل تعبير CASE. */
const BROKEN = `
CREATE OR REPLACE FUNCTION public.audit_trigger_function()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_catalog' AS $f$
DECLARE
  v_company_id UUID; v_record_id UUID; v_record_identifier TEXT;
  v_old_data JSONB; v_new_data JSONB; v_user_id UUID;
  v_branch_id UUID; v_cost_center_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF TG_OP = 'DELETE' THEN
    v_company_id := OLD.company_id; v_record_id := OLD.id;
    v_branch_id := CASE WHEN TG_TABLE_NAME IN ('invoices','bills') THEN OLD.branch_id ELSE NULL END;
  ELSE
    v_company_id := NEW.company_id; v_record_id := NEW.id;
    v_branch_id := CASE WHEN TG_TABLE_NAME IN ('invoices','bills') THEN NEW.branch_id ELSE NULL END;
  END IF;
  v_record_identifier := TG_TABLE_NAME || '_' || COALESCE(v_record_id::TEXT,'unknown');
  IF TG_OP = 'DELETE' THEN v_old_data := to_jsonb(OLD); v_new_data := NULL;
  ELSIF TG_OP = 'INSERT' THEN v_old_data := NULL; v_new_data := to_jsonb(NEW);
  ELSE v_old_data := to_jsonb(OLD); v_new_data := to_jsonb(NEW); END IF;
  PERFORM create_audit_log_internal(v_company_id, v_user_id, TG_OP, TG_TABLE_NAME,
    v_record_id, v_record_identifier, v_old_data, v_new_data, v_branch_id, v_cost_center_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
EXCEPTION
  WHEN query_canceled THEN
    RAISE WARNING 'Audit log cancelled (57014) on %.%: %', TG_TABLE_NAME, TG_OP, SQLERRM;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  WHEN OTHERS THEN
    RAISE WARNING 'Audit log failed: %', SQLERRM;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $f$;
`

/** الصيغة الصحيحة — نفس نصّ ملف الترحيل ٢٠٢٦٠٧٢٧٠٠٠٠٠٥. */
const FIXED = `
CREATE OR REPLACE FUNCTION public.audit_trigger_function()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_catalog' AS $f$
DECLARE
  v_company_id UUID; v_record_id UUID; v_record_identifier TEXT;
  v_old_data JSONB; v_new_data JSONB; v_user_id UUID;
  v_branch_id UUID; v_cost_center_id UUID;
  v_row JSONB;
BEGIN
  v_user_id := auth.uid();
  IF TG_OP = 'DELETE' THEN v_row := to_jsonb(OLD); ELSE v_row := to_jsonb(NEW); END IF;
  v_company_id     := nullif(v_row ->> 'company_id', '')::UUID;
  v_record_id      := nullif(v_row ->> 'id', '')::UUID;
  v_branch_id      := nullif(v_row ->> 'branch_id', '')::UUID;
  v_cost_center_id := nullif(v_row ->> 'cost_center_id', '')::UUID;
  v_record_identifier := TG_TABLE_NAME || '_' || COALESCE(v_record_id::TEXT,'unknown');
  IF TG_OP = 'DELETE' THEN v_old_data := v_row;  v_new_data := NULL;
  ELSIF TG_OP = 'INSERT' THEN v_old_data := NULL; v_new_data := v_row;
  ELSE v_old_data := to_jsonb(OLD); v_new_data := v_row; END IF;
  PERFORM create_audit_log_internal(v_company_id, v_user_id, TG_OP, TG_TABLE_NAME,
    v_record_id, v_record_identifier, v_old_data, v_new_data, v_branch_id, v_cost_center_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
EXCEPTION
  WHEN query_canceled THEN
    RAISE WARNING 'Audit log cancelled (57014) on %.%: %', TG_TABLE_NAME, TG_OP, SQLERRM;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  WHEN OTHERS THEN
    RAISE WARNING 'Audit log failed: %', SQLERRM;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $f$;
`

function runGuard() {
  const r = spawnSync(
    process.execPath,
    ["scripts/check-audit-trail-actually-records.js", "--require-db"],
    { encoding: "utf8", env: { ...process.env, PRODUCTION_SUPABASE_DB_URL: testUrl } }
  )
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

;(async () => {
  const client = new Client({ connectionString: testUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()

  let refused = false
  let output = ""
  try {
    await client.query(BROKEN)
    const r = runGuard()
    refused = r.failed
    output = r.output
  } finally {
    // تُعاد الصيغة الصحيحة دائماً — حتى لو انهار الفحص فى منتصفه.
    try { await client.query(FIXED) } finally { await client.end() }
  }

  if (!refused) {
    console.error(
      "X the guard did NOT refuse the known-broken audit function.\n" +
        "  A guard that never fails is decoration, not protection.\n" +
        "  ---- guard output ----\n" +
        output.split("\n").map((l) => `  ${l}`).join("\n")
    )
    process.exit(1)
  }

  console.log("+ the guard refused the known-broken audit function (fixed version restored).")
})().catch((e) => {
  console.error(`X audit-trail self-test failed: ${e.message}`)
  process.exit(1)
})

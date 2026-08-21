#!/usr/bin/env node
/**
 * selftest-anon-open-tables.js
 * ---------------------------------------------------------------------------
 * v3.74.857 — **يجب أن يُرى الحارس وهو يرفض.**
 *
 * حارسٌ يقول «صفر» لا يُثبت شيئاً حتى يُرى وهو يرفض العطب الذى كُتب من أجله.
 * وقد كلّفنا هذا الدرس أربعة إصدارات: ٨٣٣، ٨٤٥، ٨٥١، ٨٥٣ — كلها مرّت بجانب
 * حرّاسٍ كانوا نائمين بهدوء ويُبلّغون صفراً. بل إن `check-phantom-selects`
 * نفسه أبلغ صفراً بينما كان فى المشروع ٤٥ عطباً.
 *
 * فهذا الملف يزرع الفخّ عمداً — جدولاً بسياسة `TO public USING (true)`
 * ومنحةٍ لـ`anon`، أى نفس شكل الفجوة بالضبط — ثم يشغّل الحارس ويشترط أن
 * **يسقط**. فإن صمت الحارس، سقط الإصدار.
 *
 * ⚠️ يعمل على **قاعدة الاختبار** (TEST_SUPABASE_DB_URL) لا على الإنتاج.
 *    والتنظيف فى `finally` فلا يبقى أثرٌ حتى لو انهار الفحص فى منتصفه.
 *
 * Usage: node scripts/selftest-anon-open-tables.js
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const { spawnSync } = require("child_process")

const { requireDbOrSkip } = require("./lib/selftest-db")
const testUrl = requireDbOrSkip("TEST_SUPABASE_DB_URL", "أنَّ حارسَ الجداولِ المفتوحةِ للزائرِ يرفضُ جدولاً مزروعاً")

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

const PROBE = "zz_probe_anon_open_857"

const PLANT = `
  CREATE TABLE IF NOT EXISTS public.${PROBE} (id int primary key, secret text);
  ALTER TABLE public.${PROBE} ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS ${PROBE}_service_role ON public.${PROBE};
  -- نفس شكل الفجوة حرفياً: اسمٌ يوحى بحساب الخدمة، وسياسةٌ بلا تحديد دور.
  CREATE POLICY ${PROBE}_service_role ON public.${PROBE}
    AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.${PROBE} TO anon;
`

const CLEANUP = `DROP TABLE IF EXISTS public.${PROBE} CASCADE;`

;(async () => {
  const client = new Client({ connectionString: testUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()

  let guardRefused = false
  let guardOutput = ""

  try {
    await client.query(PLANT)

    // الحارس يقرأ PRODUCTION_SUPABASE_DB_URL — نوجّهه لقاعدة الاختبار فقط
    // أثناء هذا الاختبار، فلا يقترب الفخّ من الإنتاج إطلاقاً.
    const run = spawnSync(
      process.execPath,
      ["scripts/check-anon-open-tables.js", "--require-db"],
      {
        env: { ...process.env, PRODUCTION_SUPABASE_DB_URL: testUrl },
        encoding: "utf8",
      }
    )
    guardOutput = `${run.stdout || ""}${run.stderr || ""}`
    guardRefused = run.status !== 0 && guardOutput.includes(PROBE)
  } finally {
    try { await client.query(CLEANUP) } finally { await client.end() }
  }

  if (!guardRefused) {
    console.error(
      "X the guard did NOT refuse a table left wide open to anonymous visitors.\n" +
        "  A guard that never fails is decoration, not protection.\n" +
        "  ---- guard output ----\n" +
        guardOutput.split("\n").map((l) => `  ${l}`).join("\n")
    )
    process.exit(1)
  }

  console.log("+ the guard refused the planted open table (probe removed).")
})().catch((e) => {
  console.error(`X anon-open-tables self-test failed: ${e.message}`)
  process.exit(1)
})

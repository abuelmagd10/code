#!/usr/bin/env node
/**
 * selftest-purchase-return-priced-by-the-bill.js
 * ---------------------------------------------------------------------------
 * v3.74.941 — يُرى الحارسُ وهو يرفض، **وهو يُبقى الحالَ الصحيحة**.
 *
 * وكلُّ شكلٍ هنا **لا يعيش فى ملف**: تُعاد الدالةُ بيدٍ إلى نسختها القديمة فى
 * لوحة التحكم، أو تُفرَّغ دالةُ الرفض فتصير تمرّ دائماً، أو يُمنح `anon` تنفيذَ
 * بيتِ التسعير — ولا يتغيّر حرفٌ فى الكود. فالفحصُ النصّى يقول «سليم» بينما
 * المرتجعُ يُسعَّر من المتصفح. ولا سبيلَ لبرهنةِ حارسٍ كهذا إلا **بزرع العطب
 * فى قاعدةٍ حيّة ثم النظر: أيرفض أم يمرّ؟**
 *
 * ويعمل على **قاعدة الاختبار وحدها** (`TEST_SUPABASE_DB_URL`).
 *   ‏(أ) الدالةُ تعود تأخذ `unit_price` من الطلب      ⇒ يُرفض.
 *   ‏(ب) دالةُ الرفض تُفرَّغ فتمرّ دائماً              ⇒ يُرفض — **وهذا أخبثُ
 *       الأشكال، لأن كلَّ اسمٍ ما زال فى مكانه والنصُّ يبدو سليماً تماماً.**
 *   ‏(ج) بيتُ التسعير يُمنح لـ`anon`                  ⇒ يُرفض.
 *   ‏(د) `resubmit` تفقد `search_path`                ⇒ يُرفض.
 *   ‏(هـ) بيتُ التسعير يُغيَّر فيخالف الشاشة           ⇒ يُرفض **بوصفه كسراً
 *       للبرىء**: حارسٌ يرفض ما ترسله الشاشةُ يوقف كلَّ المرتجعات، وهذا
 *       عطبٌ لا حماية.
 *   ‏(و) ثم تُعاد الحال                               ⇒ يصمت الحارس.
 *
 * والاستعادةُ لا تُكتب بيدى: يُلتقط `pg_get_functiondef` قبل الزرع ويُعاد
 * حرفياً بعده — فلا تنحرف نسخةُ الفخّ عن نسخة الهجرة أبداً.
 *
 * Usage: node scripts/selftest-purchase-return-priced-by-the-bill.js
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

function runGuard() {
  const r = spawnSync(process.execPath, ["scripts/check-purchase-return-priced-by-the-bill.js", "--require-db"], {
    encoding: "utf8",
    env: { ...process.env, RETURN_PRICING_DB_URL: url },
  })
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

const SNAPSHOT_OF = [
  "process_purchase_return_atomic(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,uuid)",
  "resubmit_purchase_return(uuid,uuid,jsonb,jsonb)",
  "assert_purchase_return_amount(text,numeric,numeric,numeric,text)",
  "purchase_return_priced_line(uuid,uuid,numeric)",
]

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let ok = true

  const snap = {}
  for (const sig of SNAPSHOT_OF) {
    const { rows } = await client.query(`SELECT pg_get_functiondef($1::regprocedure) AS def`, [`public.${sig}`])
    if (rows.length === 0) { console.error(`X public.${sig} does not exist - nothing to prove.`); process.exit(1) }
    snap[sig] = rows[0].def
  }

  const restoreAll = async () => {
    for (const sig of SNAPSHOT_OF) await client.query(snap[sig])
    await client.query("REVOKE ALL ON FUNCTION public.purchase_return_priced_line(uuid,uuid,numeric) FROM PUBLIC, anon, authenticated")
    await client.query("REVOKE ALL ON FUNCTION public.purchase_return_bill_discount_ratio(uuid) FROM PUBLIC, anon, authenticated")
    await client.query("REVOKE ALL ON FUNCTION public.assert_purchase_return_amount(text,numeric,numeric,numeric,text) FROM PUBLIC, anon, authenticated")
  }

  const stage = async (title, plant, needle) => {
    if (!ok) return
    await plant()
    const r = runGuard()
    await restoreAll()
    if (!r.failed || !new RegExp(needle).test(r.output)) {
      console.error(`X ${title}: the guard did NOT refuse (looked for /${needle}/).`)
      console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
      ok = false
    } else {
      console.log(`+ ${title}: رُفض كما يجب`)
    }
  }

  try {
    // (أ) الشكلُ الأصلى: السعرُ يعود من الطلب.
    await stage(
      "the writer takes unit_price from the request again",
      () => client.query(
        snap["process_purchase_return_atomic(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,uuid)"]
          .replace(
            "v_priced.unit_price, v_priced.tax_rate, v_priced.discount_percent, v_priced.line_total\n    );",
            "COALESCE((v_item->>'unit_price')::NUMERIC, 0), v_priced.tax_rate, v_priced.discount_percent,\n      COALESCE((v_item->>'line_total')::NUMERIC, 0)\n    );")),
      "takes unit_price")

    // (ب) الأخبث: كلُّ الأسماء فى مكانها، ودالةُ الرفض لا ترفض.
    await stage(
      "the refusal is emptied out - every name still in place, nothing refused",
      () => client.query(`
        CREATE OR REPLACE FUNCTION public.assert_purchase_return_amount(
          p_field text, p_sent numeric, p_computed numeric,
          p_tolerance numeric DEFAULT 0.01, p_context text DEFAULT NULL)
        RETURNS void LANGUAGE plpgsql IMMUTABLE
        SET search_path TO 'public', 'pg_catalog'
        AS $f$ BEGIN RETURN; END $f$`),
      "was ACCEPTED")

    // (ج) بيتُ التسعير مفتوحٌ لمن ليس مسجّلاً.
    await stage(
      "anon granted execute on the pricing home",
      () => client.query("GRANT EXECUTE ON FUNCTION public.purchase_return_priced_line(uuid,uuid,numeric) TO anon"),
      "executable by anon")

    // (د) دالةٌ بصلاحيات كاملة بلا مسارِ بحثٍ مثبَّت.
    await stage(
      "resubmit loses its search_path",
      () => client.query(
        snap["resubmit_purchase_return(uuid,uuid,jsonb,jsonb)"]
          .replace(/\n\s*SET search_path TO 'public', 'pg_catalog'/, "")),
      "without SET search_path")

    // (هـ) وحارسٌ يرفض البرىء عطبٌ لا حماية: يُغيَّر التسعيرُ فيخالف الشاشة.
    await stage(
      "the pricing home drifts away from what the screen sends",
      () => client.query(
        snap["purchase_return_priced_line(uuid,uuid,numeric)"]
          .replace("line_total := ROUND(v_net * v_ratio, 2);", "line_total := ROUND(v_net * v_ratio, 2) + 5;")),
      "REFUSED|NEW divergence")

    if (ok) {
      const r = runGuard()
      if (r.failed) {
        console.error("X the guard refuses the correct state - it would block every push.")
        console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
        ok = false
      } else {
        console.log("+ الحال الصحيحة: لم يُبلَّغ عنها كما يجب")
      }
    }
  } finally {
    try { await restoreAll() } catch (e) { console.error(`! restore failed: ${e.message}`) }
    await client.end()
  }

  if (!ok) process.exit(1)
  console.log("+ the pricing guard is proven refusing all five shapes that would let the browser price a")
  console.log("  purchase return - including an emptied refusal that leaves every name in place - and")
  console.log("  refusing a rule that has drifted away from the screen, and silent on the correct state.")
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })

#!/usr/bin/env node
/**
 * selftest-product-cost-grant.js
 * ---------------------------------------------------------------------------
 * v3.74.911 — يُرى الحارس وهو يرفض عودة الحجب المفتوح.
 *
 * وهذا الفخّ يختلف عن إخوته: العطب الذى يحرسه **لا يعيش فى ملف**. لا سطر
 * كودٍ يتغيّر حين يُمنح العمود ثانيةً — منحةٌ واحدة من لوحة التحكم، أو
 * هجرةٌ لاحقة تكتب `GRANT SELECT ON products`، ويعود كل شىء مقروءاً بينما
 * كل الفحوص النصّية تقول «سليم». فلا سبيل لبرهنته إلا **بزرعه فى قاعدةٍ
 * حيّة**.
 *
 * ولذلك يعمل على **قاعدة الاختبار وحدها** (`TEST_SUPABASE_DB_URL`)، ولا
 * يلمس الإنتاج بحال. وثلاث حالات:
 *   (أ) منح عمود التكلفة لدور `authenticated`      ⇒ يُرفض ويُسمّى العمود.
 *   (ب) منح صلاحية الجدول كاملة (المصيدة الكبرى)   ⇒ يُرفض — لأن صلاحية
 *       الجدول تبتلع كل سحبٍ على عمود، والحجب يصير حبراً.
 *   (ج) إعادة الحال                                 ⇒ يصمت الحارس.
 *
 * والتنظيف فى `finally` بصيغةٍ تُعيد الصلاحيات إلى ما كانت عليه بالضبط.
 *
 * Usage: node scripts/selftest-product-cost-grant.js
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")

const ROOT = process.cwd()
const { requireDbOrSkip } = require("./lib/selftest-db")
const url = requireDbOrSkip("TEST_SUPABASE_DB_URL", "أنَّ حارسَ منحةِ تكلفةِ المنتجِ يرفضُ منحةً مزروعة")

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

const COLUMNS_FILE = path.join(ROOT, "lib", "products-columns.ts")
const named = (() => {
  const m = fs.readFileSync(COLUMNS_FILE, "utf8").match(/PRODUCT_COLUMNS_NO_COST\s*=\s*['"]([^'"]+)['"]/)
  return m ? m[1].split(",").map((c) => c.trim()).filter(Boolean) : []
})()

const RESTORE = `
  REVOKE SELECT ON public.products FROM authenticated;
  GRANT SELECT (${named.join(", ")}) ON public.products TO authenticated;
`

function runGuard() {
  const r = spawnSync(process.execPath, ["scripts/check-product-cost-grant.js", "--require-db"], {
    encoding: "utf8",
    env: { ...process.env, PRODUCT_GRANT_DB_URL: url },
  })
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

;(async () => {
  if (named.length === 0) {
    console.error("X could not read the named column list - the selftest would restore nothing.")
    process.exit(1)
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let ok = true

  try {
    // (أ) عمود تكلفةٍ يُمنح ثانيةً
    await client.query("GRANT SELECT (cost_price) ON public.products TO authenticated")
    let r = runGuard()
    if (!r.failed || !r.output.includes("cost_price")) {
      console.error("X a re-granted cost column was accepted - the hide could be undone in silence.")
      console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
      ok = false
    } else {
      console.log("+ منح عمود التكلفة ثانيةً: رُفض كما يجب")
    }
    await client.query(RESTORE)

    // (ب) صلاحية الجدول كاملة — المصيدة التى تبتلع كل سحب
    if (ok) {
      await client.query("GRANT SELECT ON public.products TO authenticated")
      r = runGuard()
      if (!r.failed || !/table-wide SELECT/.test(r.output)) {
        console.error("X table-wide SELECT was accepted - every column revoke becomes decoration.")
        console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
        ok = false
      } else {
        console.log("+ صلاحية الجدول كاملةً: رُفضت كما يجب (وهى المصيدة الكبرى)")
      }
      await client.query(RESTORE)
    }

    // (ج) والحال المستعادة تُقرأ سليمة
    if (ok) {
      r = runGuard()
      if (r.failed) {
        console.error("X the guard refuses the correct state - it would block every push.")
        console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
        ok = false
      } else {
        console.log("+ الحال الصحيحة: لم يُبلَّغ عنها كما يجب")
      }
    }
  } finally {
    try { await client.query(RESTORE) } catch { /* ignore */ }
    await client.end()
  }

  if (!ok) process.exit(1)
  console.log("+ product-cost grant guard proven to refuse a re-granted cost column AND a table-wide")
  console.log("  SELECT that would swallow it, and to stay silent on the correct state (test DB only).")
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })

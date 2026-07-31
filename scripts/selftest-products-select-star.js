#!/usr/bin/env node
/**
 * selftest-products-select-star.js
 * ---------------------------------------------------------------------------
 * v3.74.908 — **يجب أن يُرى الحارس وهو يرفض.**
 *
 * حارسٌ يقول «صفر» لا يُثبت شيئاً حتى يُرى وهو يرفض العطب الذى كُتب من أجله
 * (درس ٨٥٨، وقبله ٨٣٣ و٨٤٥ و٨٥١ و٨٥٣ و٨٥٧).
 *
 * يزرع هذا الملف أربع حالات ويشترط سلوكاً معلوماً فى كلٍّ منها:
 *   (أ) نجمةٌ صريحة على `products`            ⇒ يُرفض ويُسمّى الملف.
 *   (ب) نجمةٌ متخفّية خلف ربط: `"*, branch:…"` ⇒ يُرفض كذلك. وهذا هو الشكل
 *       الذى كان فى `products-list` حرفياً، ولولا فحصه لمرّت النجمة بريئةَ
 *       المظهر.
 *   (ج) نفس الملف بأعمدةٍ مسمّاة              ⇒ لا يُبلَّغ عنه (معكوس).
 *   (د) نجمةٌ على جدولٍ آخر (`bills`)          ⇒ لا يُبلَّغ عنه: الحارس يحرس
 *       `products` لا كل نجمةٍ فى المشروع.
 *
 * وحالةٌ خامسة بلا زرعٍ فى الشجرة: قائمة أعمدةٍ **ينقصها عمودٌ حىّ** ⇒ يُرفض
 * حين تتوفر القاعدة، لأن قائمةً ناقصة تُفقد الشاشات حقلاً فى صمت.
 *
 * والتنظيف فى `finally` فلا يبقى أثر.
 *
 * Usage: node scripts/selftest-products-select-star.js
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawnSync } = require("child_process")

const ROOT = process.cwd()
const PROBE_DIR = path.join(ROOT, "app", "api", "zz-probe-908")
const PROBE_FILE = path.join(PROBE_DIR, "route.ts")

const body = (query) => `
import { createClient } from "@/lib/supabase/server"
export async function GET() {
  const supabase = await createClient()
  ${query}
  return Response.json({ data })
}
`

const PROBE_STAR = body(`const { data } = await supabase.from("products").select("*").limit(1)`)
const PROBE_STAR_JOIN = body(
  `const { data } = await supabase.from("products").select("*, branch:branch_id(branch_name)").limit(1)`
)
const PROBE_NAMED = body(
  `const { data } = await supabase.from("products").select("id, sku, name").limit(1)`
)
const PROBE_OTHER_TABLE = body(`const { data } = await supabase.from("bills").select("*").limit(1)`)

function runGuard(env = {}) {
  const r = spawnSync(process.execPath, ["scripts/check-products-select-star.js"], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  })
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

let ok = true
const tmpColumns = path.join(os.tmpdir(), `products-columns-908-${process.pid}.ts`)

function expectRefusal(label, probe) {
  fs.writeFileSync(PROBE_FILE, probe, "utf8")
  const r = runGuard()
  if (!r.failed || !r.output.includes("zz-probe-908")) {
    console.error(`X ${label}: the guard did NOT refuse (or did not name the file).`)
    console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
    return false
  }
  console.log(`+ ${label}: رُفض كما يجب`)
  return true
}

function expectSilence(label, probe) {
  fs.writeFileSync(PROBE_FILE, probe, "utf8")
  const r = runGuard()
  if (r.output.includes("zz-probe-908")) {
    console.error(`X ${label}: the guard reported a clean file.`)
    console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
    return false
  }
  console.log(`+ ${label}: لم يُبلَّغ عنه كما يجب`)
  return true
}

try {
  fs.mkdirSync(PROBE_DIR, { recursive: true })

  if (ok) ok = expectRefusal("نجمةٌ صريحة على products", PROBE_STAR)
  if (ok) ok = expectRefusal("نجمةٌ متخفّية خلف ربط", PROBE_STAR_JOIN)
  if (ok) ok = expectSilence("أعمدةٌ مسمّاة (معكوس)", PROBE_NAMED)
  if (ok) ok = expectSilence("نجمةٌ على جدولٍ آخر (معكوس)", PROBE_OTHER_TABLE)

  // (هـ) قائمةٌ ينقصها عمودٌ حىّ — تحتاج القاعدة، وإلا تُتخطى بصوتٍ مسموع.
  if (ok) {
    fs.rmSync(PROBE_DIR, { recursive: true, force: true })
    if (!process.env.PRODUCTION_SUPABASE_DB_URL) {
      console.log("! لا اتصال بالقاعدة: تُخطّيت حالة «قائمةٌ ناقصة» (وهى الحالة الوحيدة التى تلزمها).")
    } else {
      const real = fs.readFileSync(path.join(ROOT, "lib", "products-columns.ts"), "utf8")
      // يُحذف عمودٌ واحدٌ حقيقى من القائمة — أخبث من حذف عمودٍ وهمى.
      // القائمة نصٌّ حرفىٌّ واحد (فرضه استنتاج نوع الصف فى supabase-js)،
      // فيُنزع منها اسمُ عمودٍ حقيقى — أخبث من اختراع عمودٍ وهمى.
      const doctored = real.replace(/(["`][^"`]*?)\bsku,\s*/, "$1")
      if (doctored === real) {
        console.error("X could not doctor the column list - the selftest would prove nothing.")
        ok = false
      } else {
        fs.writeFileSync(tmpColumns, doctored, "utf8")
        const r = runGuard({ PRODUCTS_COLUMNS_PATH: tmpColumns })
        if (!r.failed || !r.output.includes("sku")) {
          console.error("X a named list missing a live column was accepted - screens would lose it in silence.")
          console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
          ok = false
        } else {
          console.log("+ قائمةٌ ينقصها عمودٌ حىّ: رُفض كما يجب")
        }
      }
    }
  }
} finally {
  try { fs.rmSync(PROBE_DIR, { recursive: true, force: true }) } catch { /* ignore */ }
  try { fs.rmSync(tmpColumns, { force: true }) } catch { /* ignore */ }
}

if (!ok) process.exit(1)
console.log("+ products-select-star guard proven to refuse a star (bare and joined), to spare named columns")
console.log("  and other tables, and to refuse a column list that no longer matches the table.")

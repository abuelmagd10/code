#!/usr/bin/env node
/**
 * selftest-product-cost-direct-read.js
 * ---------------------------------------------------------------------------
 * v3.74.909 — يُرى الحارس وهو يرفض، وإلا فقوله «صفر» بلا قيمة.
 *
 * أربع حالات:
 *   (أ) قراءةٌ مباشرة من `products`               ⇒ يُرفض ويُسمّى الملف.
 *   (ب) قراءةٌ متخفّية داخل ربط `products(...)`    ⇒ يُرفض كذلك — وهذا هو
 *       الشكل الذى كان فى خمسة مواضع حقيقية، ويقرؤه فحصٌ سطحىٌّ بريئاً.
 *   (ج) نفس الملف بلا عمود تكلفة                  ⇒ لا يُبلَّغ عنه.
 *   (د) عمودٌ اسمه يشبهها (`unit_price`) وحده      ⇒ لا يُبلَّغ عنه.
 *
 * وحالةٌ خامسة: الدَّين المعلوم يبقى **مذكوراً بالاسم** فى المخرجات ولا
 * يُسقط الحارس — فالدَّين المعلن ليس عطباً جديداً، لكنه لا يُنسى أيضاً.
 *
 * Usage: node scripts/selftest-product-cost-direct-read.js
 * ---------------------------------------------------------------------------
 */
const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")

const ROOT = process.cwd()
const PROBE_DIR = path.join(ROOT, "app", "api", "zz-probe-909")
const PROBE_FILE = path.join(PROBE_DIR, "route.ts")

const body = (query) => `
import { createClient } from "@/lib/supabase/server"
export async function GET() {
  const supabase = await createClient()
  ${query}
  return Response.json({ data })
}
`

const PROBE_DIRECT = body(
  `const { data } = await supabase.from("products").select("id, name, cost_price").limit(1)`
)
const PROBE_NESTED = body(
  `const { data } = await supabase.from("invoice_items").select("id, products(name, cost_price)").limit(1)`
)
const PROBE_CLEAN = body(
  `const { data } = await supabase.from("products").select("id, name, sku").limit(1)`
)
const PROBE_LOOKALIKE = body(
  `const { data } = await supabase.from("products").select("id, unit_price, display_unit_price").limit(1)`
)

function runGuard() {
  const r = spawnSync(process.execPath, ["scripts/check-product-cost-direct-read.js"], {
    encoding: "utf8",
    env: process.env,
  })
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

let ok = true

function expectRefusal(label, probe) {
  fs.writeFileSync(PROBE_FILE, probe, "utf8")
  const r = runGuard()
  if (!r.failed || !r.output.includes("zz-probe-909")) {
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
  if (r.output.includes("zz-probe-909")) {
    console.error(`X ${label}: the guard reported a clean file.`)
    console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
    return false
  }
  console.log(`+ ${label}: لم يُبلَّغ عنه كما يجب`)
  return true
}

try {
  fs.mkdirSync(PROBE_DIR, { recursive: true })

  if (ok) ok = expectRefusal("قراءةٌ مباشرة من products", PROBE_DIRECT)
  if (ok) ok = expectRefusal("قراءةٌ متخفّية داخل ربط", PROBE_NESTED)
  if (ok) ok = expectSilence("أعمدةٌ بلا تكلفة (معكوس)", PROBE_CLEAN)
  if (ok) ok = expectSilence("سعر البيع وحده (معكوس)", PROBE_LOOKALIKE)

  // (هـ) الدَّين المعلوم يُذكر بالاسم ولا يُسقط الحارس.
  if (ok) {
    fs.rmSync(PROBE_DIR, { recursive: true, force: true })
    const r = runGuard()
    const named = r.output.includes("lib/accounting-transaction-service.ts")
    if (r.failed || !named) {
      console.error("X the documented posting-path debt is either fatal or invisible - it must be neither.")
      console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
      ok = false
    } else {
      console.log("+ الدَّين المعلوم: مذكورٌ بالاسم ولا يُسقط الدفع")
    }
  }
} finally {
  try { fs.rmSync(PROBE_DIR, { recursive: true, force: true }) } catch { /* ignore */ }
}

if (!ok) process.exit(1)
console.log("+ product-cost-read guard proven to refuse a direct read and a nested one, to spare clean")
console.log("  selects, and to keep the measured posting debt visible without failing the push.")

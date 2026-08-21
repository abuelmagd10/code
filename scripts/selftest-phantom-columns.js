#!/usr/bin/env node
/**
 * selftest-phantom-columns.js
 * ---------------------------------------------------------------------------
 * v3.74.863 — **يجب أن يُرى الحارس وهو يرفض** — وأن يُرى وهو **لا يرفض** الشكل
 * الذى كان يُخطئ فيه.
 *
 * فالأداة القديمة لم تكن نائمة، بل **كانت تصرخ فى غير موضعها**: ٥١ بلاغاً،
 * تسعة أعشارها كاذب. ولذلك لا يكفى هنا فخٌّ موجب؛ يلزم معه فخٌّ **معكوس**
 * يُثبت أن العيوب الثلاثة القديمة لم تعد تُنتج إنذاراً:
 *
 *   (أ) كتابةٌ على عمودٍ وهمى حقيقى            ← يجب أن يسقط
 *   (ب) قراءةُ جدولٍ ثم تحديثُ جدولٍ آخر       ← يجب ألّا يسقط  (عيب ١)
 *   (ج) مفاتيحُ داخل كائن jsonb متداخل         ← يجب ألّا يسقط  (عيب ٢)
 *
 * ويُزرع كلٌّ منها فى ملفٍ مؤقت داخل `lib/`، ويُحذف فى `finally`.
 * لا يمسّ قاعدة بيانات ولا ملفاً قائماً.
 *
 * Usage: node scripts/selftest-phantom-columns.js
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")

const { requireDbOrSkip } = require("./lib/selftest-db")
requireDbOrSkip("PRODUCTION_SUPABASE_DB_URL", "أنَّ حارسَ الأعمدةِ الوهميّةِ يرفضُ كتابةً لعمودٍ لا وجودَ له")

const root = path.resolve(__dirname, "..")
const probeDir = path.join(root, "lib", "zz-probe-863")
const probeFile = path.join(probeDir, "probe.ts")

const PROBE_REAL = `
import { createClient } from "@/lib/supabase/server"
export async function run(supabase: any, id: string) {
  await supabase.from("commission_plans").update({ zz_column_that_never_existed: 1 }).eq("id", id)
}
`

// عيب ١ القديم: يقرأ جدولاً ثم يُحدِّث آخر. الأعمدة صحيحة على جدولها.
const PROBE_CROSS_TABLE = `
export async function run(supabase: any, id: string, uid: string) {
  const { data: member } = await supabase
    .from("company_members")
    .select("role")
    .eq("user_id", uid)
    .single()
  if (!member) return
  await supabase
    .from("accounting_periods")
    .update({ is_locked: true, status: "closed", closed_at: new Date().toISOString() })
    .eq("id", id)
}
`

// عيب ٢ القديم: مفاتيح داخل عمود jsonb.
const PROBE_NESTED = `
export async function run(supabase: any, id: string) {
  await supabase.from("notification_outbox_events").update({
    delivery_status: "dispatched",
    last_dispatch_summary: { mode: "x", actor_id: null, notification_count: 3 },
  }).eq("event_id", id)
}
`

// ═══════════════════════════════════════════════════════════════════════════
// v3.74.865 — الفخّان الجديدان: `insert` و`upsert`.
//
// وهذان أهمّ من فخّ `update`: فالإضافة على عمودٍ وهمى **لا تُنشئ الصف
// إطلاقاً**، أى تموت الميزة كلها بصمت. وهو ما وقع فعلاً للقيد اليدوى
// (`journal_entries.created_by`) ولإغلاق الفترة ولحفظ الشحنات.
// ═══════════════════════════════════════════════════════════════════════════
const PROBE_INSERT = `
export async function run(supabase: any, companyId: string) {
  await supabase.from("journal_entries").insert({
    company_id: companyId,
    zz_insert_column_that_never_existed: true,
  })
}
`

const PROBE_UPSERT = `
export async function run(supabase: any, companyId: string) {
  await supabase.from("commission_plans").upsert({
    company_id: companyId,
    zz_upsert_column_that_never_existed: 1,
  }, { onConflict: "company_id" })
}
`

// فخٌّ معكوس للإضافة: إضافةٌ سليمة تماماً يجب ألّا تُبلَّغ.
// فلو أنذر الحارسُ عنها لعاد ضجيجاً — وهو ما أسقط الأداة فى ٨٦٣.
const PROBE_INSERT_CLEAN = `
export async function run(supabase: any, companyId: string, branchId: string) {
  await supabase.from("journal_entries").insert({
    company_id: companyId,
    branch_id: branchId,
    entry_date: "2026-01-01",
    reference_type: "manual_entry",
    description: "probe",
    status: "draft",
    created_by: null,
  })
}
`

// وفخٌّ معكوس لصفحة واجهة (.tsx): المدى تَوسَّع فى ٨٦٥ ليشملها،
// فيجب أن يُثبَت أن التوسّع لم يُدخل معه إنذاراً كاذباً.
const PROBE_TSX_CLEAN = `
export default function Page() {
  const save = async (supabase: any, companyId: string) => {
    await supabase.from("branches").insert({ company_id: companyId, name: "probe" })
  }
  return null
}
`

function runGuard() {
  const r = spawnSync(process.execPath, ["scripts/check-phantom-columns.js", "--require-db"], {
    encoding: "utf8",
    env: { ...process.env, PHANTOM_COLUMN_BASELINE: "0" },
    cwd: root,
  })
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

/**
 * v3.74.865 — **`needle`: لا يُقبل السقوط ما لم يُسمَّ العمود المزروع.**
 *
 * ظهر الخلل حين شُغِّل هذا الفحص بلا اتصالٍ بالقاعدة: انهار الحارس برسالة
 * `getaddrinfo` وخرج بحالة ١، **فقُرئ الانهيار على أنه رفض** ومرّت الحالة
 * الأولى. أى أن الفخّ كان يُثبت «سقط» لا «سقط بسبب ما زرعتُه».
 *
 * ⇒ **حارسٌ يُقاس بخروجه وحده يمكن إرضاؤه بتعطيله.** فصار كل فخٍّ موجب
 *   يشترط أن يذكر خرجُ الحارس اسم العمود بعينه.
 */
const cases = [
  { name: "تعديل على عمودٍ وهمى", src: PROBE_REAL, expectFail: true,
    needle: "zz_column_that_never_existed" },
  { name: "قراءة جدول ثم تحديث آخر (عيب ١)", src: PROBE_CROSS_TABLE, expectFail: false },
  { name: "مفاتيح داخل jsonb متداخل (عيب ٢)", src: PROBE_NESTED, expectFail: false },
  // v3.74.865
  { name: "إضافة على عمودٍ وهمى", src: PROBE_INSERT, expectFail: true,
    needle: "zz_insert_column_that_never_existed" },
  { name: "upsert على عمودٍ وهمى", src: PROBE_UPSERT, expectFail: true,
    needle: "zz_upsert_column_that_never_existed" },
  { name: "إضافة سليمة (معكوس)", src: PROBE_INSERT_CLEAN, expectFail: false },
  { name: "صفحة .tsx سليمة (معكوس)", src: PROBE_TSX_CLEAN, expectFail: false, ext: ".tsx" },
]

let ok = true
try {
  fs.mkdirSync(probeDir, { recursive: true })
  for (const c of cases) {
    // ملفٌ واحد فى كل دورة: تُمسح البقيّة حتى لا يتسرّب فخٌّ إلى فخّ.
    for (const f of fs.readdirSync(probeDir)) fs.rmSync(path.join(probeDir, f), { force: true })
    const target = c.ext ? path.join(probeDir, `probe${c.ext}`) : probeFile
    fs.writeFileSync(target, c.src, "utf8")
    const r = runGuard()
    if (c.expectFail && !r.failed) {
      console.error(`X الحارس لم يرفض: ${c.name}\n  ---- خرج الحارس ----\n${r.output}`)
      ok = false
    } else if (c.expectFail && c.needle && !r.output.includes(c.needle)) {
      console.error(
        `X الحارس سقط على «${c.name}» لكنه لم يذكر «${c.needle}» —\n` +
          `  فهذا انهيارٌ لا رفض. والحارس الذى يُقاس بخروجه وحده يمكن إرضاؤه بتعطيله.\n` +
          `  ---- خرج الحارس ----\n${r.output}`
      )
      ok = false
    } else if (!c.expectFail && r.failed) {
      console.error(
        `X الحارس سقط على «${c.name}» وكان يجب ألّا يسقط — عاد العيب القديم.\n` +
          `  ---- خرج الحارس ----\n${r.output}`
      )
      ok = false
    } else {
      console.log(`+ ${c.name}: ${c.expectFail ? "رُفض كما يجب" : "لم يُبلَّغ عنه كما يجب"}`)
    }
  }
} finally {
  try { fs.rmSync(probeDir, { recursive: true, force: true }) } catch { /* ignore */ }
}

if (!ok) process.exit(1)
console.log(
  "+ phantom-column guard proven to refuse update/insert/upsert on a non-existent column,\n" +
    "  and to stay silent on the three shapes it used to misread plus a clean .tsx page."
)

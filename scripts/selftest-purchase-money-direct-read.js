#!/usr/bin/env node
/**
 * selftest-purchase-money-direct-read.js
 * ---------------------------------------------------------------------------
 * v3.74.936 — يُرى الحارس وهو يرفض، **وهو يُبقى البرىء** — والبرىءُ هنا
 * ليس فرضاً نظرياً: أولُ كتابةٍ للحارس رفضت جملةً فى تعليق.
 * v3.74.938 — وأُضيف البابان الجديدان: مصدرُ `/api` وجدولُ الأدوار المحلى.
 *
 * يبنى شجرةً مؤقتةً بملفٍ واحدٍ مذكورٍ فى قائمة المحوَّل، ويزرع فيها:
 *   (أ) قراءةٌ مباشرة `.from("bills").select(...)`      ⇒ يُرفض.
 *   (ب) تضمينٌ متداخل `bill_items(...)` بلا اسمٍ مستعار ⇒ يُرفض — وهذا
 *       أخبثُ الشكلين: الرأسُ مقنَّعٌ والسعرُ ظاهرٌ تحته.
 *   (ج) التضمينُ باسمٍ مستعارٍ إلى النافذة (معكوس)      ⇒ يصمت.
 *   (د) **تعليقٌ يذكر `bills (` ** (معكوس)               ⇒ يصمت. وهذه
 *       الحالةُ بعينها أوقعت الحارسَ قبل إصلاحه، ورابعُ مرةٍ يقع فيها هذا
 *       الشكلُ فى المشروع (930 · 932 · 934).
 *   (هـ) كتابةٌ على الجدول (معكوس)                       ⇒ يصمت — النافذةُ
 *       للقراءة، والكتابةُ تبقى على الجدول.
 *   (و) شاشةٌ تنادى `/api` يقرأ `GET`ه الجدولَ الخام      ⇒ يُرفض. **وهذه
 *       هى الثغرةُ التى شُحنت فعلاً فى 936 ولم يرها الحارسُ القديم.**
 *   (ز) نفسُ المسار وقد صار يقرأ النافذة (معكوس)         ⇒ يصمت.
 *   (ح) مسارٌ بلا `GET` يقرأ الجدولَ الخام (معكوس)       ⇒ يصمت — عملٌ
 *       خادمىٌّ لا يُسلّم مالاً إلى المتصفح.
 *   (ط) شاشةٌ تنادى `/api` لا وجودَ له                    ⇒ يُرفض — ما لا
 *       يُحلّ لا يُثبت نظافتُه.
 *   (ى) استعمالُ `canViewPurchasePrices` (بيتٌ ثانٍ للقاعدة) ⇒ يُرفض.
 *   (ك) **ذِكرُ الاسم نفسِه فى تعليق أو سلسلة** (معكوس)  ⇒ يصمت — خامسُ
 *       مرةٍ يُختبر فيها هذا الشكل: التعليقُ ليس تعليمة.
 *   (ل) **مسارُ `/api` مذكورٌ فى تعليقٍ وحده** (معكوس)   ⇒ يصمت — والحارسُ
 *       نفسُه كاد يقع فيها: كان يقرأ المساراتِ من النصِّ الخام.
 *
 * Usage: node scripts/selftest-purchase-money-direct-read.js
 * ---------------------------------------------------------------------------
 */

const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawnSync } = require("child_process")

const GUARD = "scripts/check-purchase-money-direct-read.js"
const CONVERTED_FILE = "app/bills/page.tsx"

function runGuard(root) {
  const r = spawnSync(process.execPath, [GUARD], {
    encoding: "utf8",
    env: { ...process.env, PURCHASE_MONEY_SCAN_ROOT: root },
  })
  return { failed: r.status !== 0, output: `${r.stdout || ""}${r.stderr || ""}` }
}

/**
 * قائمةُ المحوَّل **تُقرأ من الحارس نفسه**، لا تُكتب هنا ثانيةً.
 *
 * ⚠️ درسُ 937: كانت مكتوبةً هنا بملفين، فلمّا طالت القائمةُ بملفٍ ثالثٍ
 * فى دفعةٍ تالية اشتكى الحارسُ بحقٍّ أن ملفاً مذكوراً غيرُ موجودٍ فى
 * الشجرة المؤقتة — **فسقط الفخُّ على حالٍ صحيحة**. وهو نفسُ عطب النسخة
 * الثانية من الحكم (934): قائمةٌ فى موضعين تفترق عند أول تعديل.
 */
function convertedList() {
  const src = fs.readFileSync(GUARD, "utf8")
  // ⚠️ الإغلاقُ يُطابَق **فى أول السطر**: أولُ `]` فى القائمة هو الذى داخل
  // `[id]` فى مسار الملف، فلو وقف التعبيرُ عنده لقرأ سطراً واحداً وظنّ
  // الباقىَ غائباً — وهو نفسُ ما وقع لحظةَ كتابته.
  const block = src.match(/const CONVERTED = \[([\s\S]*?)\n\]/)
  if (!block) throw new Error("could not read CONVERTED from the guard")
  return [...block[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1])
}

/** الجسدُ البرىء: يقرأ النافذة ولا ينادى شيئاً. */
const CLEAN = 'const x = supabase.from("bills_masked").select("*")\n'

function tree(body, extra) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "purchase-money-"))
  const write = (rel, text) => {
    const p = path.join(root, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, text)
  }
  for (const rel of convertedList()) {
    // الملفُّ محلُّ الزرع يأخذ الجسدَ المزروع، والبقيةُ نظيفةٌ كى لا
    // يشتكى الحارسُ من غيابها بحق.
    write(rel, rel === CONVERTED_FILE ? body : CLEAN)
  }
  for (const [rel, text] of Object.entries(extra || {})) write(rel, text)
  return root
}

let ok = true
const stage = (title, body, mustFail, needle, extra) => {
  if (!ok) return
  const root = tree(body, extra)
  const r = runGuard(root)
  fs.rmSync(root, { recursive: true, force: true })
  if (mustFail) {
    if (!r.failed || (needle && !r.output.includes(needle))) {
      console.error(`X ${title}: the guard did NOT refuse${needle ? ` (looked for "${needle}")` : ""}.`)
      console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
      ok = false
      return
    }
  } else if (r.failed) {
    console.error(`X ${title}: the guard refused something innocent - it would be switched off in a week.`)
    console.error(r.output.split("\n").map((l) => `  ${l}`).join("\n"))
    ok = false
    return
  }
  console.log(`+ ${title}: ${mustFail ? "رُفض كما يجب" : "لم يُبلَّغ عنه كما يجب"}`)
}

stage("a converted screen reading the table directly",
  'const { data } = await supabase.from("bills").select("id, total_amount")\n',
  true, "reads bills directly")

stage("a nested embed with no alias to the masked view",
  'const { data } = await supabase.from("bills_masked").select("id, bill_items(id, unit_price)")\n',
  true, "without an alias")

stage("the same embed, aliased to the masked view",
  'const { data } = await supabase.from("bills_masked").select("id, bill_items:bill_items_masked(id, unit_price)")\n',
  false)

stage("a comment that merely mentions the table",
  '// stale amounts show wrong figures on every screen that reads them (bills list, supplier ledger)\n' +
  'const { data } = await supabase.from("bills_masked").select("*")\n',
  false)

stage("writes, which stay on the table",
  'await supabase.from("bills").update({ status: "paid" }).eq("id", id)\n' +
  'await supabase.from("bill_items").delete().eq("bill_id", id)\n' +
  'await supabase.from("bill_items").insert(rows)\n',
  false)

// ═══ v3.74.938 — البابُ الثانى: مصدرُ `/api` ══════════════════════════
const RAW_GET = 'export async function GET() {\n' +
  '  const { data } = await supabase.from("bills").select("id, total_amount")\n' +
  '  return Response.json(data)\n}\n'
const MASKED_GET = 'export async function GET() {\n' +
  '  const { data } = await supabase.from("bills_masked").select("id, total_amount")\n' +
  '  return Response.json(data)\n}\n'
const RAW_POST = 'export async function POST() {\n' +
  '  const { data } = await supabase.from("bills").select("id, total_amount")\n' +
  '  return Response.json({ ok: !!data })\n}\n'

stage("a converted screen whose /api source reads the raw table",
  'const res = await fetch(`/api/v9/bills?${params.toString()}`)\n',
  true, "directly and serves a converted screen",
  { "app/api/v9/bills/route.ts": RAW_GET })

stage("the same /api source, once it reads the masked view",
  'const res = await fetch(`/api/v9/bills?${params.toString()}`)\n',
  false, null,
  { "app/api/v9/bills/route.ts": MASKED_GET })

stage("an /api route with no GET, doing server-side work on the raw table",
  'await fetch(`/api/v9/bills/${encodeURIComponent(id)}/void`, { method: "POST" })\n',
  false, null,
  { "app/api/v9/bills/[id]/void/route.ts": RAW_POST })

stage("a converted screen calling an /api path that does not exist",
  'const res = await fetch("/api/v9/ghost")\n',
  true, "no app/api/**/route.ts matches it")

// ⚠️ مسارٌ بمقطعٍ واحد (`/api/my-company`) مسارٌ صحيح. وأولُ كتابةٍ للحارس
// أهملت كلَّ ما كان أقلَّ من مقطعين، فسقط منه مصدرٌ حقيقىٌّ فى الشجرة
// الحقيقية بلا أن يشتكى أحد — **الحارسُ الصامتُ عن بابٍ كاملٍ أسوأ من غيابه**.
stage("a one-segment /api source that reads the raw table",
  'const res = await fetch("/api/whoami")\n',
  true, "directly and serves a converted screen",
  { "app/api/whoami/route.ts": RAW_GET })

// ═══ v3.74.938 — البابُ الثالث: جدولُ أدوارٍ محلى ═════════════════════
stage("a converted screen deciding cost visibility from a local role list",
  'const canSee = canViewPurchasePrices(context)\n' +
  'const { data } = await supabase.from("bills_masked").select("*")\n',
  true, "a second home for a rule")

stage("an /api path that appears only in a comment",
  '// the old list used to call /api/v9/ghost before v3.74.900\n' +
  'const { data } = await supabase.from("bills_masked").select("*")\n',
  false)

stage("the same names, but only in a comment or a string",
  '// v3.74.938 - canViewPurchasePrices was removed; the rule lives in the database now\n' +
  '/* PURCHASE_ORDER_ROLE_PERMISSIONS is gone too */\n' +
  'const label = "isUpperRole is only a string here"\n' +
  'const { data } = await supabase.from("bills_masked").select("*")\n',
  false)

if (!ok) process.exit(1)
console.log("+ the direct-read guard is proven refusing a bare read, an unaliased nested embed,")
console.log("  an /api source that stays raw, an unresolvable /api path, and a local role list -")
console.log("  and sparing an aliased embed, a masked /api source, a POST-only route, every write,")
console.log("  and the same names when they appear only in a comment or a string.")

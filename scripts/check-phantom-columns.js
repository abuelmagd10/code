#!/usr/bin/env node
/**
 * check-phantom-columns.js
 * ---------------------------------------------------------------------------
 * v3.74.830 — **الحادثة الأصلية**: تعديل أمر إنتاج معتمد كان يفشل دائماً:
 *     Could not find the 'cycle_no' column of
 *     'manufacturing_production_orders' in the schema cache
 * ثلاثة مسارات كانت تكتب `cycle_no` على جداولها — وهو عمود يعيش فى
 * `approval_history` وحده. أى أن دورة «عدّل ⇒ يعود للاعتماد» **لم تعمل ولا
 * مرة**. ولم يظهر إلا وقت التشغيل، وفقط إذا كان السجل **معتمداً** — أى فى
 * الحالة الأقل تكراراً أثناء التطوير.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * v3.74.863 — **أُعيدت كتابة الأداة، ولم يُنقَص دَينٌ واحد.**
 *
 * كانت تُبلّغ عن **٥١** كتابة. وبالتدقيق واحدةً واحدة تبيّن أن الغالبية
 * الساحقة **إنذاراتٌ كاذبة**، بثلاثة عيوبٍ مستقلة فى الأداة نفسها:
 *
 *  ١) **نافذةٌ تتخطّى حدود الجُملة** (٢٦ إنذاراً): كانت تقبل حتى ٤٠٠ حرفٍ بين
 *     `.from(x)` و`.update({`، فتلتقط جدولاً وتُلصق به مفاتيح تحديثٍ لجدولٍ
 *     آخر. مثاله الفاضح: `accounting-period-lock.ts` **يقرأ** `company_members`
 *     ثم **يُحدِّث** `accounting_periods` — فنُسبت أعمدة القفل إلى جدول
 *     الأعضاء، وكأن قفل الفترات المحاسبية مكسور. **وهو سليمٌ تماماً.**
 *
 *  ٢) **لا تفرّق بين مستويات الكائن** (١٢ إنذاراً من ملفٍ واحد):
 *     `last_dispatch_summary: { mode, actor_id, … }` مفاتيحُه الداخلية تُكتب
 *     كلها داخل عمود `jsonb` واحد، فعُدَّت أعمدةً وهمية.
 *
 *  ٣) **تقارن بلقطة مخطَّطٍ تتأخر عن القاعدة** (٣ إنذارات): أعمدة
 *     `management_approved_*` أُضيفت فى ٨١٤ وظلّت تظهر «وهمية». وقد كان
 *     التعليق القديم فى هذا الملف يعترف بذلك ويطلب من القارئ التحقق يدوياً —
 *     أى أن الأداة كانت تعلم أنها تكذب أحياناً، ولم يُصلَح السبب.
 *
 * ⇒ **وحارسٌ تسعةُ أعشار بلاغاته ضجيج أسوأ من لا حارس**: يُدرّب قارئه على
 *   تجاهل رقمٍ ثابت، فيمرّ العطب الحقيقى وسط الضجيج دون أن يراه أحد. وهو نفس
 *   درس ٨٥٩ حين أعطى فحصٌ صرفىٌّ ٢١ إنذاراً كاذباً فحُذف واستُبدل بقياس الأثر.
 *
 * **المنهج الجديد:**
 *   • أقرب `.from(` فعلاً — لا يُسمح بأى `.from(` داخل الفجوة.
 *   • مُحلِّلٌ يوازن الأقواس فيأخذ **مفاتيح المستوى الأعلى وحدها**.
 *   • الأعمدة تُقرأ من **القاعدة الحيّة** لا من لقطة قد تتأخر.
 *
 * Usage: node scripts/check-phantom-columns.js [--require-db] [--list]
 * ---------------------------------------------------------------------------
 */
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const path = require("path")

const requireDb = process.argv.includes("--require-db")
const verbose = process.argv.includes("--list")
const root = path.resolve(__dirname, "..")
const url = process.env.PRODUCTION_SUPABASE_DB_URL

/**
 * خط الأساس — يُشدّ ولا يُرخى.
 *
 * السجل الصادق لهذا الرقم:
 *   ٨٤٦: ٥٦ ← ٥٥   (`customer_credits.remaining_amount`)
 *   ٨٤٩: ٥٥ ← ٥١   (زوال كود الاشتراك الميت)
 *   ٨٦٣: أُعيد القياس بأداةٍ سليمة فظهر أن الحقيقى **أربعة** لا ٥١، ثم
 *        أُصلحت الأربعة جميعاً فى نفس الإصدار ⇒ **صفر**.
 *        **الأداة هى التى كانت تكذب؛ والدَّين الحقيقى صغيرٌ وقد زال.**
 */
const BASELINE = Number(process.env.PHANTOM_COLUMN_BASELINE ?? 0)

if (!url) {
  const msg = "PRODUCTION_SUPABASE_DB_URL is not set - cannot read the live schema."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
  process.exit(0)
}

let Client
try { ({ Client } = require("pg")) } catch {
  console.error("X npm install pg --save-dev"); process.exit(1)
}

/**
 * مفاتيح المستوى الأعلى فى كائنٍ حرفى، بموازنة الأقواس.
 * `{ a: 1, b: { c: 2 }, d: [ { e: 3 } ] }`  ⇒  a, b, d
 * ويُتجاهَل النشر `...x` لأنه لا يُسمّى عموداً بعينه.
 */
function topLevelKeys(objBody) {
  const keys = []
  let depth = 0
  let expectKey = true
  let i = 0
  while (i < objBody.length) {
    const ch = objBody[i]
    if (ch === "{" || ch === "[" || ch === "(") { depth++; i++; continue }
    if (ch === "}" || ch === "]" || ch === ")") { depth--; i++; continue }
    if (ch === "," && depth === 0) { expectKey = true; i++; continue }
    if (depth === 0 && expectKey && !/\s/.test(ch)) {
      const rest = objBody.slice(i)
      if (rest.startsWith("...")) { expectKey = false; i += 3; continue }
      const m = rest.match(/^(["'`]?)([A-Za-z_][\w$]*)\1\s*(:|,|$)/)
      if (m) keys.push(m[2])
      expectKey = false
      i += m ? Math.max(m[0].length - 1, 1) : 1
      continue
    }
    i++
  }
  return keys
}

/** يقصّ الكائن الأول ابتداءً من `{` عند `openIndex`، بموازنة الأقواس. */
function sliceObject(src, openIndex) {
  let depth = 0
  for (let i = openIndex; i < src.length; i++) {
    const c = src[i]
    if (c === "{") depth++
    else if (c === "}") { depth--; if (depth === 0) return src.slice(openIndex + 1, i) }
  }
  return null
}

const files = []
function walk(dir) {
  if (!fs.existsSync(dir)) return
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.ts$/.test(e.name)) files.push(p)
  }
}
walk(path.join(root, "app/api"))
walk(path.join(root, "lib"))

;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  const tableColumns = new Map()
  try {
    const { rows } = await client.query(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`
    )
    for (const r of rows) {
      if (!tableColumns.has(r.table_name)) tableColumns.set(r.table_name, new Set())
      tableColumns.get(r.table_name).add(r.column_name)
    }
  } finally { await client.end() }

  const offenders = []

  // ⚠️ الفجوة **لا تحتمل** `.from(` آخر: وإلا نُسبت المفاتيح لجدولٍ سابق —
  //    وهو العيب الذى أنتج وحده ٢٦ إنذاراً كاذباً.
  const RE = /\.from\(\s*["'`]([a-z0-9_]+)["'`]\s*\)((?:(?!\.from\()[\s\S]){0,300}?)\.update\(\s*\{/g

  for (const file of files) {
    const src = fs.readFileSync(file, "utf8")
    for (const m of src.matchAll(RE)) {
      const table = m[1]
      const cols = tableColumns.get(table)
      if (!cols) continue
      const openIndex = m.index + m[0].length - 1
      const body = sliceObject(src, openIndex)
      if (body === null) continue
      for (const key of topLevelKeys(body)) {
        if (cols.has(key)) continue
        offenders.push({ file: path.relative(root, file).replace(/\\/g, "/"), table, column: key })
      }
    }
  }

  if (verbose) {
    for (const o of offenders) console.log(`  - ${o.table}.${o.column}\n      ${o.file}`)
  }

  console.log(`Found: ${offenders.length}   Baseline: ${BASELINE}   (${tableColumns.size} live tables)`)

  if (offenders.length > BASELINE) {
    console.error(`\nX ${offenders.length - BASELINE} NEW write(s) target a column that does not exist:\n`)
    for (const o of offenders) console.error(`    ${o.table}.${o.column}\n      ${o.file}`)
    console.error(
      "\n  These fail at RUNTIME with a PostgREST schema-cache error, and the WHOLE\n" +
        "  statement fails - not merely that one column. They surface only on the code\n" +
        "  path that sets them, which is often the rarest one."
    )
    process.exit(1)
  }

  if (offenders.length < BASELINE) {
    console.log(`\n+ ${BASELINE - offenders.length} fewer than the baseline.`)
    console.log(`  Lower BASELINE to ${offenders.length} so the ground won cannot be given back.`)
    process.exit(0)
  }

  console.log(`\n+ No new phantom-column writes. ${BASELINE} pre-existing one(s) remain - tracked, not approved.`)
})().catch((e) => {
  console.error(`X check-phantom-columns failed: ${e.message}`)
  process.exit(1)
})

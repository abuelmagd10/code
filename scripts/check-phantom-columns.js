#!/usr/bin/env node
/**
 * v3.74.830 — لا مسار يكتب عموداً لا وجود له فى الجدول.
 *
 * **الحادثة**: تعديل أمر إنتاج معتمد كان يفشل دائماً بخطأ 500:
 *     Could not find the 'cycle_no' column of
 *     'manufacturing_production_orders' in the schema cache
 * ثلاثة مسارات (أوامر الإنتاج · نسخ قوائم المواد · نسخ المسارات) كانت
 * تكتب `cycle_no` على جداولها — وهو عمود يعيش فى `approval_history` وحده.
 * أى أن دورة «عدّل ⇒ يعود للاعتماد» **لم تعمل ولا مرة** فى المديولات الثلاثة.
 *
 * لماذا لم يُكتشف؟ لأن الخطأ لا يظهر إلا وقت التشغيل، وفقط إذا كان السجل
 * **معتمداً** — أى فى الحالة الأقل تكراراً أثناء التطوير.
 *
 * يفحص هذا السكربت كل `.from("<table>").update({...})` فى مسارات الـAPI،
 * ويقارن المفاتيح المكتوبة بأعمدة الجدول كما يعرفها snapshot المخطط
 * (`supabase/schema/schema.sql`) — فيمسك العمود الوهمى قبل أن يمسكه المستخدم.
 *
 * ملاحظة: التحليل نصّى ومحافظ — يتجاهل ما لا يستطيع تحليله بثقة بدل
 * إطلاق إنذار كاذب.
 */
const fs = require("fs")
const path = require("path")

const root = path.resolve(__dirname, "..")
const schemaPath = path.join(root, "supabase", "schema", "schema.sql")

if (!fs.existsSync(schemaPath)) {
  console.log("+ Schema snapshot not found - skipping phantom-column check.")
  process.exit(0)
}

// ── 1. أعمدة كل جدول من snapshot المخطط ──────────────────────────────
const schema = fs.readFileSync(schemaPath, "utf8")
const tableColumns = new Map()

const createRe = /CREATE TABLE (?:IF NOT EXISTS )?(?:"?public"?\.)?"?([a-z0-9_]+)"?\s*\(([\s\S]*?)\n\);/gi
for (const m of schema.matchAll(createRe)) {
  const table = m[1]
  const body = m[2]
  const cols = new Set()
  for (const line of body.split("\n")) {
    const t = line.trim()
    if (!t || /^(CONSTRAINT|PRIMARY KEY|FOREIGN KEY|UNIQUE|CHECK|EXCLUDE)\b/i.test(t)) continue
    const cm = t.match(/^"?([a-z0-9_]+)"?\s+/i)
    if (cm) cols.add(cm[1])
  }
  if (cols.size > 0) tableColumns.set(table, cols)
}

if (tableColumns.size === 0) {
  console.log("+ Could not parse any table from the snapshot - skipping.")
  process.exit(0)
}

// ── 2. مسح مسارات الـAPI بحثاً عن كائنات تُكتب على جدول معروف ─────────
const offenders = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) { walk(p); continue }
    if (!/\.ts$/.test(entry.name)) continue
    scan(p)
  }
}

function scan(file) {
  const src = fs.readFileSync(file, "utf8")
  // .from("table") ... .update({ ...keys })  — داخل نافذة قريبة
  const re = /\.from\(\s*["'`]([a-z0-9_]+)["'`]\s*\)([\s\S]{0,400}?)\.update\(\s*\{([\s\S]{0,900}?)\}\s*\)/g
  for (const m of src.matchAll(re)) {
    const table = m[1]
    const cols = tableColumns.get(table)
    if (!cols) continue
    const objBody = m[3]
    // مفاتيح على شكل  key:  فى بداية سطر — نتجاهل التداخل العميق والسبريد
    for (const km of objBody.matchAll(/(?:^|[\n,{])\s*([a-z][a-z0-9_]*)\s*:/g)) {
      const key = km[1]
      if (cols.has(key)) continue
      // تجاهل الكلمات المفتاحية الشائعة داخل التعبيرات
      if (["ascending", "count", "returning", "head", "onConflict"].includes(key)) continue
      offenders.push({ file: path.relative(root, file), table, column: key })
    }
  }
}

for (const dir of ["app/api", "lib"]) {
  const abs = path.join(root, dir)
  if (fs.existsSync(abs)) walk(abs)
}

// خط أساس — نفس منهج check-unchecked-writes: الدين الموروث يُسجَّل، وأى
// كتابة **جديدة** لعمود وهمى تكسر البناء فوراً.
//
// تنبيه على دقة الأداة: المرجع هو snapshot المخطط، وقد يتأخر عن القاعدة
// بعد هجرة حديثة (مثال: management_approved_* أُضيفت فى 814 وتظهر هنا
// زائفةً حتى يُحدَّث الـsnapshot). لذلك الرقم «سقف لا يُتجاوز» لا قائمة
// أخطاء مؤكدة — والتحقق من كل بند يكون بمقارنته بالقاعدة الحية.
// ٨٤٦: ٥٦ ← ٥٥ — كتابة `remaining_amount` على `customer_credits` وهى عمود
// لا وجود له، فكان الإدراج يفشل بالكامل ولا يُسجَّل رصيد دائن صافٍ للعميل قط.
const BASELINE = 55

if (offenders.length === 0) {
  console.log(`+ No route writes a column its table does not have (${tableColumns.size} tables checked).`)
  process.exit(0)
}

console.log(`Found: ${offenders.length}   Baseline: ${BASELINE}`)

if (offenders.length > BASELINE) {
  const extra = offenders.length - BASELINE
  console.error(`\nX ${extra} NEW write(s) target a column that does not exist on the table:\n`)
  for (const o of offenders) {
    console.error(`    ${o.table}.${o.column}`)
    console.error(`      ${o.file}`)
  }
  console.error("\n  These fail at RUNTIME with a PostgREST schema-cache error, and only")
  console.error("  on the code path that sets them - often the rarest one.")
  process.exit(1)
}

if (offenders.length < BASELINE) {
  console.log(`\n+ ${BASELINE - offenders.length} fewer than the baseline.`)
  console.log(`  Lower BASELINE to ${offenders.length} in ${path.basename(__filename)} so the debt cannot return.`)
} else {
  console.log(`\n+ No new phantom-column writes. ${offenders.length} pre-existing ones remain - tracked, not approved.`)
}
process.exit(0)

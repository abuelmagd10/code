#!/usr/bin/env node
/**
 * check-phantom-selects.js
 * ---------------------------------------------------------------------------
 * v3.74.845 — لا شاشة ولا مسار **يقرأ** عموداً لا وجود له فى الجدول.
 *
 * **الحادثة**: شاشة «أجور عمالة أمر الإنتاج» كانت تقرأ:
 *     supabase.from("employees").select("id, name").order("name")
 * و`employees` ليس فيها عمود `name` — الصحيح `full_name`. فكل من اختار
 * «موظفون» رأى **قائمة فارغة بلا رسالة خطأ**، وظنّ أن لا موظفين لديه.
 *
 * ولماذا لم يمسكه شىء؟
 *   - `check-phantom-columns.js` (٨٣٠) يفحص **الكتابة** فقط، وفى مسارات
 *     الـAPI فقط. وهذه **قراءة**، وفى صفحة.
 *   - وأخطر ما فيه أن الفشل **صامت**: الاستعلام يرجع خطأ، والكود يكتب
 *     `setEmployees(e.data || [])`، فتصير النتيجة قائمة خالية.
 *
 * ⇒ **الدرس**: القراءة الفاشلة تبدو كبيانات غير موجودة. لا يُفرَّق بالنظر
 *   بين «فارغ لأنه لا يوجد» و«فارغ لأن العمود وهمى». فيلزم فحص لا نظر.
 *
 * يفحص كل `.from("<table>")...select("<نص حرفى>")` فى المشروع، ويقارن
 * الأعمدة المطلوبة بأعمدة الجدول من snapshot المخطط.
 *
 * التحليل **محافظ عمداً**: يتجاهل كل ما لا يستطيع تحليله بثقة (قوالب نصية،
 * موارد مضمَّنة، دوال تجميع، أسماء جداول متغيّرة) بدل إطلاق إنذار كاذب.
 * وحارس يُنذر على كود سليم يدفع لكسر ما يعمل — وهو أسوأ من ألا يُنذر.
 *
 * Usage: node scripts/check-phantom-selects.js
 * ---------------------------------------------------------------------------
 */
const fs = require("fs")
const path = require("path")

const root = path.resolve(__dirname, "..")
const schemaPath = path.join(root, "supabase", "schema", "schema.sql")

// خط الأساس. الهدف **تقليله** لا تثبيته؛ والبناء يفشل إذا **زاد**، فلا
// يدخل عطب جديد من هذا النوع.
//
// ٨٤٥: ٤٤ مخالفة — فُحصت الاثنتان والثلاثون (جدول.عمود) كلها على قاعدة
//      الإنتاج فكانت **كلها مفقودة فعلاً**، لا snapshot قديم.
// ٨٤٦: ٣١ منها أُصلحت ⇒ ١٣.
// ٨٤٧: قراءتا `payroll_runs.status` أُصلحتا ⇒ ١١. ولم يكن الحل إنشاء العمود:
//      دفتر اليومية هو سجلّ أن المرتب صُرف، و`post_payroll_atomic` يمنع
//      الازدواج به بالفعل — فحُذف الفحص المسبق ولم يُبنَ مصدر حقيقة ثانٍ.
// ٨٤٨: `chart_of_accounts.balance/currency_code` أُصلحتا ⇒ ٩. ولا هنا أيضاً
//      أُنشئ عمود: **الرصيد لا يُخزَّن، يُشتَقّ** — افتتاحى + (مدين − دائن)
//      على القيود المرحَّلة، وهى القاعدة المعتمدة فى المشروع أصلاً.
// والتسع الباقية **ليست أخطاء تسمية**: مزايا كُتب كودها ولم تُنشأ أعمدتها قط —
//   · اشتراك المستخدمين        companies.max_users/monthly_cost/subscription_plan
//   · عمولات مربوطة بالمرتبات  commission_*.payroll_run_id/payout_mode/payment_*
// إصلاحها قرار منتج (تُنشأ الأعمدة أم تُزال الميزة)، لا إعادة تسمية.
const BASELINE = Number(process.env.PHANTOM_SELECT_BASELINE ?? 9)

if (!fs.existsSync(schemaPath)) {
  console.log("+ Schema snapshot not found - skipping phantom-select check.")
  process.exit(0)
}

// ── ١. أعمدة كل جدول من snapshot المخطط ────────────────────────────────
const schema = fs.readFileSync(schemaPath, "utf8")
const tableColumns = new Map()
const createRe = /CREATE TABLE (?:IF NOT EXISTS )?(?:"?public"?\.)?"?([a-z0-9_]+)"?\s*\(([\s\S]*?)\n\);/gi
for (const m of schema.matchAll(createRe)) {
  const cols = new Set()
  for (const line of m[2].split("\n")) {
    const t = line.trim()
    if (!t || /^(CONSTRAINT|PRIMARY KEY|FOREIGN KEY|UNIQUE|CHECK|EXCLUDE)\b/i.test(t)) continue
    const cm = t.match(/^"?([a-z0-9_]+)"?\s+/i)
    if (cm) cols.add(cm[1])
  }
  if (cols.size > 0) tableColumns.set(m[1], cols)
}

// المناظر (views) لا تُنشأ بـCREATE TABLE، فأعمدتها مجهولة هنا. أى اسم
// يبدأ بـ`v_` أو غير موجود فى الخريطة يُتجاوَز، لا يُنذَر عليه.
if (tableColumns.size === 0) {
  console.log("+ Could not parse any table from the snapshot - skipping.")
  process.exit(0)
}

// ── ٢. تفكيك قائمة أعمدة select إلى عناصر على المستوى الأعلى ───────────
function topLevelItems(sel) {
  const items = []
  let depth = 0
  let cur = ""
  for (const ch of sel) {
    if (ch === "(") { depth++; cur += ch; continue }
    if (ch === ")") { depth--; cur += ch; continue }
    if (ch === "," && depth === 0) { items.push(cur); cur = ""; continue }
    cur += ch
  }
  if (cur.trim()) items.push(cur)
  return items
}

/** يعيد اسم العمود المقروء، أو null إذا كان العنصر مما يُتجاوَز. */
function columnOf(rawItem) {
  const item = rawItem.trim()
  if (!item) return null
  if (item.includes("(")) return null          // مورد مضمَّن أو دالة تجميع
  if (item.includes("!")) return null          // مُلمِّح علاقة  table!inner
  if (item === "*") return null
  if (item.startsWith("...")) return null      // spread على مورد مضمَّن

  // alias:column  ⇒  الجزء بعد النقطتين هو العمود
  let col = item.includes(":") ? item.slice(item.lastIndexOf(":") + 1) : item
  col = col.trim().replace(/^"|"$/g, "")

  if (col.includes(".")) return null           // إشارة لجدول أجنبى
  if (col.includes("->")) return null          // مسار داخل JSON
  if (col.includes("::")) col = col.split("::")[0].trim()
  if (!/^[a-z0-9_]+$/i.test(col)) return null
  if (col === "count") return null

  return col
}

// ── ٣. مسح الملفات ────────────────────────────────────────────────────
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage", "supabase"])
const offenders = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".github") continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(full)
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      scan(full)
    }
  }
}

// ‎.from("table")‎ متبوعاً - ولو بعد أسطر - بـ‎.select("...")‎ حرفى.
// النطاق محدود بـ٤٠٠ حرف حتى لا يُنسب select لـfrom بعيد لا صلة له به.
const FROM_RE = /\.from\(\s*["'`]([a-z0-9_]+)["'`]\s*\)/gi

function scan(file) {
  const src = fs.readFileSync(file, "utf8")
  const rel = path.relative(root, file).replace(/\\/g, "/")

  for (const fm of src.matchAll(FROM_RE)) {
    const table = fm[1]
    const cols = tableColumns.get(table)
    if (!cols) continue                        // منظر أو جدول مجهول ⇒ تجاوُز

    // ⚠️ النافذة تبدأ **بعد** ‎.from(...)‎ لا عنده. النسخة الأولى بدأت عنده،
    // فكان شرط «هل ظهر from آخر قبل الـselect؟» يرى الـfrom نفسه فيتجاوز
    // **كل** استعلام — حارس يمرّ دائماً ولا يمسك شيئاً. لم يظهر ذلك إلا حين
    // أعدتُ عطب ٨٤٤ عمداً لأرى الحارس يُطلق، فلم يُطلق.
    // ⇒ الحارس لا يُصدَّق حتى يُرى **يفشل** على العطب الذى كُتب لأجله.
    const winStart = fm.index + fm[0].length
    const window = src.slice(winStart, winStart + 400)
    // أول select بعده مباشرة، بنص حرفى بلا استيفاء `${...}`
    const sm = window.match(/\.select\(\s*(["'`])((?:(?!\1)[\s\S])*?)\1/)
    if (!sm) continue
    const sel = sm[2]
    if (sel.includes("${")) continue            // نص مُركَّب ⇒ تجاوُز

    // لو ظهر ‎.from(‎ آخر قبل الـselect فالـselect ليس لهذا الجدول
    const before = window.slice(0, sm.index)
    if (/\.from\(/.test(before)) continue

    const line = src.slice(0, fm.index).split("\n").length

    for (const item of topLevelItems(sel)) {
      const col = columnOf(item)
      if (col && !cols.has(col)) {
        offenders.push({ rel, line, table, col })
      }
    }
  }
}

walk(root)

// ── ٤. الحكم ──────────────────────────────────────────────────────────
if (offenders.length > BASELINE) {
  console.error(
    `X ${offenders.length} phantom column read(s) - baseline is ${BASELINE}:\n`
  )
  for (const o of offenders) {
    const known = [...(tableColumns.get(o.table) || [])]
    const near = known.filter((k) => k.includes(o.col) || o.col.includes(k)).slice(0, 3)
    console.error(
      `  - ${o.rel}:${o.line}  ${o.table}.select(... ${o.col} ...) - no such column` +
        (near.length ? `  (did you mean: ${near.join(", ")}?)` : "")
    )
  }
  console.error(
    "\n  A failed read returns an error, and `data || []` turns that into an\n" +
      "  empty list. The screen then shows \"no records\" and nobody sees a bug.\n" +
      "  Fix the column name, or - if the snapshot is stale - refresh\n" +
      "  supabase/schema/schema.sql from the database."
  )
  process.exit(1)
}

console.log(
  `+ no phantom column reads (${tableColumns.size} tables in snapshot` +
    (offenders.length ? `, ${offenders.length} at baseline` : "") +
    `).`
)

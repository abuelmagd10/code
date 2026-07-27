#!/usr/bin/env node
/**
 * check-request-body-written-raw.js
 * ---------------------------------------------------------------------------
 * v3.74.858 — لا يُكتب جسم الطلب فى قاعدة البيانات كما وصل.
 *
 * **الحادثة**: المالك يعدّل صنفاً مُصنَّعاً ويضع له صورة، فيرى «فشل خطأ فى
 * تحديث المنتج». وبتتبّع الطلب: `PATCH /rest/v1/products` يعود بـ**٤٠٠**،
 * أى رفضٌ من طبقة الواجهة **قبل** أن تصل الجملة إلى قاعدة البيانات — ولهذا
 * لم يظهر أثرٌ فى سجلات القاعدة، ولا كان للأمر علاقة بالصلاحيات أو الحماية.
 *
 * **السبب**: `app/api/products/[id]/route.ts` كان يكتب `{ ...body }` كما وصل.
 * وشاشة الأصناف تُحمَّل من `/api/products-list` الذى يضيف — منذ v3.74.637 —
 * حقل عرضٍ اسمه `branch_name` (من ربط الفرع). فعند «تعديل» يُنسخ الصفّ كما هو
 * إلى النموذج، ويعود `branch_name` مع الحفظ، ولا عمود بهذا الاسم فى الجدول.
 *
 * ⇒ **لم يكن العطب فى الصورة ولا فى كون الصنف مُصنَّعاً**: أى تعديل لأى صنف من
 *   تلك الشاشة كان يسقط. والرسالة العامة «خطأ فى تحديث المنتج» أخفت السبب.
 *
 * ⇒ **والفجوة بنيوية لا موضعية**: كل حقل عرضٍ يُضاف لأى شاشة — اسم فرع، اسم
 *   مخزن، أى ربط — يصير قنبلةً موقوتة فى شاشة الحفظ المقابلة. ولا يظهر إلا
 *   حين يحاول مستخدمٌ الحفظ، وقد يكون عميلاً.
 *
 * الفحص: مسارات `app/api/**​/route.ts` التى تمرّر إلى `.insert(`/`.update(`/
 * `.upsert(` كائناً يَنشُر جسم الطلب (`...body`) — مباشرةً أو عبر متغيّر وسيط.
 *
 * خط الأساس يُشدّ ولا يُرخى أبداً.
 *
 * Usage: node scripts/check-request-body-written-raw.js [--list]
 * ---------------------------------------------------------------------------
 */
const fs = require("fs")
const path = require("path")

const ROOT = process.cwd()
const API_DIR = path.join(ROOT, "app", "api")

/**
 * خط الأساس: عدد المواضع المسموح ببقائها مؤقتاً.
 * ⚠️ لا يُرفع هذا الرقم أبداً. كل نقصٍ فيه يُثبَّت فوراً.
 */
const BASELINE = Number(process.env.RAW_BODY_WRITE_BASELINE ?? 0)

function walk(dir, out = []) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name === "route.ts" || e.name === "route.tsx") out.push(p)
  }
  return out
}

/** يُزيل التعليقات حتى لا يُحاكَم الملف على شرحٍ يصف السلوك القديم. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n")
}

/** أسماء المتغيّرات التى تحمل جسم الطلب فى هذا الملف. */
function bodyVariableNames(code) {
  const names = new Set()
  // const body = await req.json()   |   const payload = await request.json()
  const re = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+\w+\.json\s*\(\s*\)/g
  let m
  while ((m = re.exec(code))) names.add(m[1])
  return names
}

/**
 * كائناتٌ تَنشُر جسم الطلب:  const X = { ...body, ... }
 * تُعاد كخريطة: اسم المتغيّر ← اسم متغيّر الجسم المنشور.
 */
function objectsSpreadingBody(code, bodyNames) {
  const found = new Map()
  const re = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*\{\s*\.\.\.\s*([A-Za-z_$][\w$]*)\s*[,}]/g
  let m
  while ((m = re.exec(code))) {
    if (bodyNames.has(m[2])) found.set(m[1], m[2])
  }
  return found
}

/** استدعاءات الكتابة وما مُرّر إليها (أول وسيط، مبسّطاً). */
function writeCallArguments(code) {
  const args = []
  const re = /\.(insert|update|upsert)\s*\(/g
  let m
  while ((m = re.exec(code))) {
    // قصّ الوسيط الأول بموازنة الأقواس
    let depth = 1
    let i = re.lastIndex
    const start = i
    while (i < code.length && depth > 0) {
      const ch = code[i]
      if (ch === "(") depth++
      else if (ch === ")") depth--
      i++
    }
    args.push({ method: m[1], text: code.slice(start, i - 1), index: m.index })
  }
  return args
}

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length
}

/**
 * العلاج المعتمَد لهذه الفجوة: دالةُ انتقاءٍ باسمٍ صريح `pick…Fields(...)`
 * تُعرَّف فى نفس الملف ومعها **قائمة أعمدةٍ حرفية**. فمرورُ متغيّر الجسم داخلها
 * ليس تمريراً خاماً — بل هو الحدّ الذى نطلبه بالضبط.
 *
 * ولا يكفى الاسم: يجب أن يحمل الملف قائمةً بالأعمدة (`WRITABLE_… = [ "…" ]`)،
 * وإلا لأمكن تجاوز الحارس بدالةٍ فارغة تُعيد ما أخذته.
 */
function neutraliseAllowListedPicks(argText, fileCode) {
  const hasLiteralColumnList = /WRITABLE_[A-Z_]+\s*=\s*\[[\s\S]*?"[^"]+"/.test(fileCode)
  if (!hasLiteralColumnList) return argText
  return argText.replace(/pick[A-Za-z]*Fields\s*\([^()]*\)/g, "__ALLOW_LISTED__")
}

const files = walk(API_DIR)
const offenders = []

for (const file of files) {
  const raw = fs.readFileSync(file, "utf8")
  const code = stripComments(raw)

  const bodyNames = bodyVariableNames(code)
  if (bodyNames.size === 0) continue

  const spreadObjects = objectsSpreadingBody(code, bodyNames)

  for (const call of writeCallArguments(code)) {
    const arg = neutraliseAllowListedPicks(call.text.trim(), code)

    // (أ) الجسم يمرّ **كاملاً** بأى صورة:
    //       .update(body) · .update({ ...body }) · .update({ ...anyFn(body) })
    //
    //     أما `body.name` فصريحٌ ومقبول — العمود مذكورٌ بالاسم. لذلك تُحذف
    //     الوصول-بالخاصية أولاً، ثم يُبحث عن الاسم مجرَّداً.
    //
    //     ⚠️ الصيغة الأولى كانت تبحث عن `{ ...body` فقط، فمرّت من تحتها
    //        `{ ...pickFakeFields(body) }` — دالةٌ باسمٍ يوحى بالانتقاء وهى
    //        تُعيد ما أخذته. كشفه السكربت التذكيرى قبل الدفع.
    //
    //     ⚠️ ولا يُحاسَب الاختصار: `.insert({ device_id, payload, ... })` يكتب
    //        `payload` فى عمودٍ اسمه `payload` — وهذا ذكرٌ صريح لا تمرير خام.
    //        (أوقعنى فيه مسار البصمة قبل التدقيق.)
    let hit = null
    for (const b of bodyNames) {
      const spread = new RegExp(`\\.\\.\\.\\s*${b}\\s*[,}\\)]`)        // { ...body }
      const passedToFn = new RegExp(`[A-Za-z_$][\\w$]*\\s*\\(\\s*${b}\\s*[,\\)]`) // anyFn(body)
      const wholeArg = new RegExp(`^${b}$`)                             // .update(body)
      if (spread.test(arg) || passedToFn.test(arg) || wholeArg.test(arg.trim())) { hit = b; break }
    }

    // (ب) عبر متغيّر وسيط:  const productData = { ...body }; .update(productData)
    if (!hit) {
      for (const [varName, bodyName] of spreadObjects) {
        if (new RegExp(`(^|[^\\w$])${varName}([^\\w$]|$)`).test(arg)) { hit = bodyName; break }
      }
    }

    if (hit) {
      offenders.push({
        file: path.relative(ROOT, file).replace(/\\/g, "/"),
        line: lineOf(code, call.index),
        method: call.method,
        bodyVar: hit,
      })
    }
  }
}

if (process.argv.includes("--list")) {
  for (const o of offenders) {
    console.log(`${o.file}:${o.line}  .${o.method}()  spreads "${o.bodyVar}"`)
  }
}

if (offenders.length > BASELINE) {
  console.error(
    `X ${offenders.length} database write(s) copy the request body straight through ` +
      `(baseline ${BASELINE}):\n`
  )
  for (const o of offenders) {
    console.error(`  - ${o.file}:${o.line} — .${o.method}() receives { ...${o.bodyVar} }`)
  }
  console.error(
    `\n  The browser decides the columns, not the route. The moment any screen adds a\n` +
      `  display-only field - a joined branch name, a warehouse name, a computed label -\n` +
      `  and that row is loaded back into an edit form, saving fails with a 400 that\n` +
      `  never reaches the database logs. That is exactly how every product edit broke\n` +
      `  silently from v3.74.637 until a customer-facing screen finally showed it.\n` +
      `  Fix: name the writable columns explicitly and pick only those from the body.`
  )
  process.exit(1)
}

if (offenders.length < BASELINE) {
  console.error(
    `X the baseline is stale: ${offenders.length} found but RAW_BODY_WRITE_BASELINE is ${BASELINE}.\n` +
      `  Lower it to ${offenders.length} so the ground that was won cannot be given back.`
  )
  process.exit(1)
}

console.log(
  `+ no route writes the request body straight into the database ` +
    `(${files.length} API route(s) scanned).`
)

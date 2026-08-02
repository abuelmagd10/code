#!/usr/bin/env node
/**
 * check-purchase-money-direct-read.js
 * ---------------------------------------------------------------------------
 * v3.74.936 — الشاشةُ المحوَّلة لا تعود تسأل الجدولَ عن مبلغ شراء.
 * v3.74.938 — **ولا تأخذه من مصدرٍ آخر، ولا تُقرّره بجدول أدوارٍ من عندها.**
 *
 * المرحلةُ الثانية من حجب أسعار الشراء تُحوَّل **دفعةً دفعة**: كلُّ إصدارٍ
 * ينقل شاشاتٍ إلى المنافذ المقنَّعة (`..._masked`)، والباقى يقرأ الجداولَ
 * كما كان. فحارسٌ يقول «لا قراءةَ مباشرةً فى المشروع كله» سيكون كاذباً
 * اليوم وصحيحاً بعد شهر — ولا ينفع فى الطريق.
 *
 * فهذا حارسُ **سقّاطة**: قائمةٌ من الملفات المحوَّلة تُذكر بالاسم، ويُشترط
 * فيها **صفرُ قراءةٍ مباشرة**. وتطول القائمةُ بكل دفعة، ولا تقصر أبداً.
 * فالمحوَّلُ لا يرتدّ، والمتبقّى مذكورٌ بعدده لا مسكوتٌ عنه.
 *
 * ═══ ثلاثةُ أبوابٍ للمال، لا بابٌ واحد ═══
 *
 * **(١) الجدولُ مباشرةً** — `.from("bills").select(...)` وأخواتُها على
 * الجداول الستة. أما الكتابةُ (`insert` · `update` · `delete`) فتبقى على
 * الجدول نفسه — **النافذةُ للقراءة وحدها**، ولا يُكتب فى نافذة.
 *
 * ⚠️ **والتضمينُ المتداخل يُعدّ قراءةً أيضاً**: `bill_items(...)` داخل
 * `select` تقرأ الجدولَ لا النافذة. ولو حُوِّل الرأسُ وتُرك البندُ
 * لصار الحجبُ نصفَه مفتوح — الرأسُ محجوبٌ والسعرُ ظاهر. ولذلك يُشترط أن
 * يُكتب التضمينُ باسمٍ مستعار: `bill_items:bill_items_masked(...)` —
 * فيبقى مفتاحُ الاستجابة كما هو ولا ينكسر القارئ.
 *
 * **(٢) مسارُ `/api/...`** — ⚠️ **وهذه ثغرةٌ شُحنت فعلاً**: حُوِّلت
 * `app/bills/page.tsx` فى 936 لتقرأ من `bills_masked`، **وصفوفُ قائمتها لا
 * تأتى منها أصلاً** — تأتى من `app/api/v2/bills/route.ts` الذى يقرأ الجدولَ
 * الخام. فكان التقنيعُ فى ملفٍ لا يُستدعى. فصار كلُّ `/api/...` تناديه
 * شاشةٌ محوَّلة **ويعرض دالةَ `GET`** محكوماً بنفس الشرط: صفرُ قراءةٍ مباشرة.
 *
 * ويُحكم على **الملف كلِّه** لا على جسد `GET` وحده: نصُّ الـ`select` كثيراً
 * ما يكون ثابتاً على مستوى الوحدة (`BILL_SELECT`)، فقراءةُ الجسد وحده تفوته.
 * ومقيسٌ اليوم أن أربعةَ مساراتٍ فقط تعرض `GET` لهذه الشاشات، اثنان منها
 * يمسّان الجداول الستة — وكلاهما محوَّل. فلو خلط مسارٌ يوماً `GET` بعملٍ
 * خادمىٍّ على المال الخام، فالعلاجُ فصلُهما لا توسيعُ الرؤية.
 *
 * **(٣) جدولُ أدوارٍ محلى** — `canViewPurchasePrices` وأخواتُها: بيتٌ ثانٍ
 * لقاعدةٍ بيتُها `can_view_purchase_cost` فى قاعدة البيانات (درس 934، حين
 * حُذف `isUpperRole` من شاشة المنتجات). وقائمتان لنفس القاعدة تفترقان عند
 * أول تعديل، **والفارقُ يظهر مالاً مكشوفاً**.
 *
 * ⚠️ والبحثُ عن هذه الأسماء يجرى **بعد نزع التعليقات ونصوص السلاسل**:
 * خمسُ مراتٍ فى هذا المشروع (930 · 932 · 934 · 936) اصطاد حارسٌ جملةً فى
 * تعليق. **التعليقُ ليس تعليمة.**
 *
 * Usage: node scripts/check-purchase-money-direct-read.js [--list]
 * Env:   PURCHASE_MONEY_SCAN_ROOT — جذرٌ بديل (يستعمله الفخّ الذاتى).
 * ---------------------------------------------------------------------------
 */

const fs = require("fs")
const path = require("path")

const verbose = process.argv.includes("--list")
const ROOT = process.env.PURCHASE_MONEY_SCAN_ROOT || process.cwd()

/** الجداولُ الستة التى صارت لها منافذُ مقنَّعة فى 933. */
const TABLES = [
  "bills", "bill_items",
  "purchase_orders", "purchase_order_items",
  "purchase_returns", "purchase_return_items",
]

/**
 * أسماءُ «البيت الثانى» للقاعدة: أى دالةٍ أو ثابتٍ يُقرّر رؤيةَ تكلفة الشراء
 * من دورِ المستخدم فى الواجهة بدل سؤال القاعدة.
 */
const LOCAL_ROLE_RULES = [
  "canViewPurchasePrices",
  "PURCHASE_ORDER_ROLE_PERMISSIONS",
  "isUpperRole",
  "UPPER_ROLES",
]

/**
 * الملفاتُ المحوَّلة. **تطول ولا تقصر.**
 * v3.74.936 — الدفعة الأولى: قائمةُ فواتير الشراء وشاشةُ تحريرها.
 */
const CONVERTED = [
  "app/bills/page.tsx",
  "app/bills/[id]/edit/page.tsx",
  // v3.74.937 — الدفعة الثانية: شاشةُ الفاتورة نفسها.
  "app/bills/[id]/page.tsx",
  // v3.74.938 — الدفعة الثالثة: أوامرُ الشراء الثلاث، **ومصدرا صفوفهما**.
  "app/purchase-orders/page.tsx",
  "app/purchase-orders/[id]/page.tsx",
  "app/purchase-orders/[id]/edit/page.tsx",
  "app/api/v2/purchase-orders/route.ts",
  "app/api/v2/bills/route.ts",
]

const problems = []
const notes = []

/**
 * نصُّ الملفِّ بلا تعليقات — وبلا محتوى السلاسل إن طُلب.
 *
 * يمسح `//…` و`/*…*\/`، ومحتوى `'…'` و`"…"` و`` `…` `` حين `strings: true`،
 * **مع إبقاء المواضع كما هى**: كلُّ محرفٍ ممسوحٍ يصير مسافةً ويبقى السطرُ
 * بطوله. وهذا أهمُّ ما فيه: حارسٌ يبلّغ عن سطرٍ خطأ حارسٌ لا يُصدَّق.
 *
 * ⚠️ ولماذا خيارٌ لا حالةٌ واحدة؟ لأن ما نبحث عنه ليس واحداً: اسمُ دالةٍ
 * محلية يُبحث عنه **خارج** السلاسل (وإلا اصطدنا كلمةً فى رسالة)، ومسارُ
 * `/api/...` يُبحث عنه **داخلها** (فهو سلسلةٌ بطبيعته). والتعليقُ يُمسح فى
 * الحالين — **فالتعليقُ ليس تعليمة**، وهذه سادسُ مرةٍ يُكتب فيها هذا السطر.
 */
const strip = (src, { strings }) => {
  const out = src.split("")
  const blank = (i) => { if (out[i] !== "\n") out[i] = " " }
  let i = 0
  while (i < src.length) {
    const c = src[i], d = src[i + 1]
    if (c === "/" && d === "/") {
      while (i < src.length && src[i] !== "\n") blank(i++)
    } else if (c === "/" && d === "*") {
      blank(i++); blank(i++)
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) blank(i++)
      if (i < src.length) { blank(i++); blank(i++) }
    } else if (c === "'" || c === '"' || c === "`") {
      const quote = c
      i++ // علامةُ الفتح تبقى: الشكلُ يبقى شكلَ سلسلة
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") { if (strings) blank(i); i++; if (i < src.length) { if (strings) blank(i); i++ }; continue }
        if (strings) blank(i)
        i++
      }
      i++ // علامةُ الإغلاق
    } else {
      i++
    }
  }
  return out.join("")
}

const readsOf = (src) => {
  const found = []
  // (١) .from("t").select(
  const fromRe = /\.from\(\s*(['"`])([a-z_]+)\1\s*\)/g
  let m
  while ((m = fromRe.exec(src))) {
    if (!TABLES.includes(m[2])) continue
    const tail = src.slice(m.index + m[0].length, m.index + m[0].length + 60)
    if (/^\s*\.select\(/.test(tail)) found.push({ kind: "from", table: m[2], at: m.index })
  }
  // (٢) تضمينٌ متداخل — **ويُفتَّش داخل نصِّ `select` وحده، لا فى الملف كله**.
  //
  // ⚠️ أولُ كتابةٍ لهذا الحارس فتّشت الملفَ كلَّه، فاصطادت جملةً فى تعليق:
  // «(bills list, supplier ledger…)» وقالت إنها تضمين. وهذه رابعُ مرةٍ يقع
  // فيها هذا الشكلُ بعينه (930 · 932 · 934): **التعليقُ ليس تعليمة**.
  // والعلاجُ الجذرىُّ ليس استثناءَ التعليقات، بل **ألا يُفتَّش إلا حيث
  // يمكن أن يوجد التضمينُ أصلاً**: داخل النصّ الممرَّر إلى `select`.
  const selectRe = /\.select\(\s*(['"`])([\s\S]*?)\1/g
  let sm
  while ((sm = selectRe.exec(src))) {
    const literal = sm[2]
    const base = sm.index + sm[0].indexOf(literal)
    for (const t of TABLES) {
      const embedRe = new RegExp(`(^|[^\\w:])(${t})\\s*(!inner|!left)?\\s*\\(`, "g")
      let e
      while ((e = embedRe.exec(literal))) {
        found.push({ kind: "embed", table: t, at: base + e.index })
      }
    }
  }
  return found
}

const lineOf = (src, at) => src.slice(0, at).split("\n").length

// ═══ فهرسُ مسارات `/api` ═══════════════════════════════════════════════
// كلُّ `app/api/**/route.ts` يُحوَّل إلى قائمة مقاطع، والمقطعُ `[x]` يُطابق
// أىَّ شىء — وكذلك المقطعُ الذى فيه `${…}` فى نداء الشاشة.
const apiRoutes = []
const indexApiRoutes = (dir, segs) => {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.isDirectory()) indexApiRoutes(path.join(dir, e.name), segs.concat(e.name))
    else if (/^route\.(ts|tsx|js)$/.test(e.name)) {
      apiRoutes.push({ segs, file: path.join(dir, e.name) })
    }
  }
}
indexApiRoutes(path.join(ROOT, "app", "api"), [])

const resolveApiPath = (p) => {
  // البادئةُ `/api` هى جذرُ الفهرس نفسِه، فتُنزع قبل المقارنة.
  const want = p.replace(/^\/api\//, "").split("/").filter(Boolean)
  return apiRoutes.find((r) =>
    r.segs.length === want.length &&
    r.segs.every((s, i) => /^\[.*\]$/.test(s) || want[i] === "*" || s === want[i]))
}

/**
 * مساراتُ `/api/...` التى يناديها هذا الملف.
 *
 * يُقصّ النصُّ عند أول `?` (سلسلة الاستعلام)، ثم يُقرأ مقطعاً مقطعاً:
 *   • مقطعٌ **يبدأ** بـ`${…}` هو معرِّفٌ متغيّر ⇒ نجمةٌ تُطابق `[id]`.
 *   • مقطعٌ فيه `${…}` **بعد نصٍّ ثابت** هو المقطعُ الأخير وما بعده زائدةٌ
 *     مبنيّةٌ فى النداء (`/api/shipping-providers${qs}`) ⇒ يُقتطع عنده ويقف.
 *
 * ⚠️ وأولُ كتابةٍ لهذه الدالة جعلت كلَّ مقطعٍ فيه فتحةٌ نجمةً، فصار
 * `/api/shipping-providers${…}` هو `/api/*` — **فطابق أولَ مسارٍ ذى مقطعٍ
 * واحدٍ أياً كان**، وفُحص مسارٌ غيرُ الذى يُنادى. مطابقةٌ فضفاضةٌ تُرضى
 * الحارسَ ولا تُثبت شيئاً.
 */
const apiPathsIn = (src) => {
  const out = new Set()
  const re = /['"`](\/api\/[^'"`]*)/g
  let m
  while ((m = re.exec(src))) {
    const segs = []
    for (const seg of m[1].split("?")[0].split("/").filter(Boolean)) {
      if (seg.startsWith("${")) { segs.push("*"); continue }
      const cut = seg.indexOf("${")
      if (cut >= 0) { if (cut > 0) segs.push(seg.slice(0, cut)); break }
      segs.push(seg)
    }
    // مقطعٌ واحدٌ مسارٌ صحيح (`/api/my-company`)؛ والصفرُ وحده يُهمَل.
    if (segs.length > 0) out.add("/" + segs.join("/"))
  }
  return [...out]
}

// ═══ الفحص ════════════════════════════════════════════════════════════
const apiSeen = new Map() // file -> the converted screen that first called it

for (const rel of CONVERTED) {
  const file = path.join(ROOT, rel)
  if (!fs.existsSync(file)) {
    problems.push(`${rel} is listed as converted but does not exist`)
    continue
  }
  const raw = fs.readFileSync(file, "utf8")
  // التعليقاتُ تُمسح قبل كلِّ فحص، والسلاسلُ تبقى أو تُمسح بحسب المطلوب.
  const src = strip(raw, { strings: false })
  const bare = strip(raw, { strings: true })

  // (١) الجدولُ مباشرةً
  const hits = readsOf(src)
  for (const h of hits) {
    problems.push(
      h.kind === "from"
        ? `${rel}:${lineOf(src, h.at)} reads ${h.table} directly - it was converted to ${h.table}_masked`
        : `${rel}:${lineOf(src, h.at)} embeds ${h.table} without an alias to ${h.table}_masked - ` +
          `the head would be masked while the line price stays visible`)
  }

  // (٣) جدولُ أدوارٍ محلى — يُبحث عنه فى النصِّ المجرَّد لا فى التعليقات
  for (const name of LOCAL_ROLE_RULES) {
    const re = new RegExp(`\\b${name}\\b`, "g")
    let m
    while ((m = re.exec(bare))) {
      problems.push(
        `${rel}:${lineOf(bare, m.index)} decides purchase-cost visibility from ${name} - ` +
        `a local role list is a second home for a rule that lives in can_view_purchase_cost`)
    }
  }

  // (٢) مصادرُ `/api/...`
  for (const p of apiPathsIn(src)) {
    const route = resolveApiPath(p)
    if (!route) {
      problems.push(
        `${rel} calls ${p} but no app/api/**/route.ts matches it - ` +
        `an unresolvable source cannot be proven clean`)
      continue
    }
    if (!apiSeen.has(route.file)) apiSeen.set(route.file, `${rel} -> ${p}`)
  }

  if (verbose) notes.push(`  ${rel}: ${hits.length} direct read(s)`)
}

// المسارُ الذى يعرض `GET` يُسلّم بياناتٍ إلى المتصفح، فيُحكم عليه بنفس الشرط.
for (const [routeFile, calledBy] of apiSeen) {
  const src = strip(fs.readFileSync(routeFile, "utf8"), { strings: false })
  if (!/\bexport\s+async\s+function\s+GET\b/.test(strip(src, { strings: true }))) continue
  const rel = path.relative(ROOT, routeFile).replace(/\\/g, "/")
  if (CONVERTED.includes(rel)) continue // فُحص أعلاه بنفسه
  for (const h of readsOf(src)) {
    problems.push(
      `${rel}:${lineOf(src, h.at)} reads ${h.table} directly and serves a converted screen (${calledBy}) - ` +
      `masking the screen while its data source stays raw hides nothing`)
  }
  if (verbose) notes.push(`  ${rel}: GET source for ${calledBy}`)
}

// وما لم يُحوَّل بعد: يُعدّ ويُقال، ولا يُسكت عنه.
let remaining = 0
const walk = (dir) => {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue
      walk(p)
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      const rel = path.relative(ROOT, p).replace(/\\/g, "/")
      if (CONVERTED.includes(rel)) continue
      const src = strip(fs.readFileSync(p, "utf8"), { strings: false })
      remaining += readsOf(src).filter((h) => h.kind === "from").length
    }
  }
}
for (const d of ["app", "lib", "components", "hooks"]) walk(path.join(ROOT, d))

if (problems.length > 0) {
  console.error(`X a converted screen went back to reading a table directly (${problems.length}):`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error("  Read through the masked view; write to the table. Nested embeds need an alias.")
  console.error("  An /api route that hands data to a converted screen is held to the same rule.")
  process.exit(1)
}

if (verbose) for (const n of notes) console.log(n)
console.log(
  `+ all ${CONVERTED.length} converted screen(s) read purchase money through the masked path only, ` +
  `decide nothing from a local role list, and take nothing raw from an /api source. ` +
  `${remaining} direct read(s) remain in screens not yet converted - counted, not hidden.`)

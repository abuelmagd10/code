#!/usr/bin/env node
/**
 * check-every-rpc-call-has-a-door.js
 * ---------------------------------------------------------------------------
 * v3.75.83 — **بابٌ لا يُفتَحُ أبداً ليس باباً، ورقمٌ لم يُقَسْ ليس رقماً.**
 *
 * ═══ الحادثةُ التى وُلد منها هذا الحارس ═══
 *
 * فى v3.75.82 وُجدَ بالمصادفةِ أنَّ مسارَى `/api/accounting-periods/lock` و
 * `/unlock` يُمرِّرانِ وسيطاً (`p_company_id`) **لا تقبلُه أىُّ نسخةٍ منشورة**،
 * فيردُّ PostgREST «لا دالّةَ تُطابق»، **فالمساران لم يعملا مرّةً واحدة**. ولم
 * يقلْ ذلك أحدٌ لأنَّ لا شاشةَ تُناديهما. وكُتب يومَها صراحةً أنَّ مسحَ **كلِّ**
 * نداءٍ فى الشيفرةِ على توقيعاتِ القاعدةِ دفعةٌ قائمةٌ بذاتِها لم تُقَسْ بعد،
 * **ولا يُكتَبُ لها رقمٌ قبلَ أن تُقاس**.
 *
 * فقِيست يومَ ٢٢ أغسطس ٢٠٢٦. والحصيلةُ لم تكنْ بابَين:
 *
 *   • **٤٩٥ نداءً** مكتوبَ الوسائطِ حرفاً فى المستودعِ كلِّه.
 *   • **٨٨ منها لا يجدُ باباً**: ٨٢ تُنادى اسماً **لا وجودَ له فى القاعدةِ
 *     إطلاقاً** (لا فى أىِّ مخطَّطٍ ولا بأىِّ نوع — قِيسَ)، و٦ تُنادى اسماً
 *     موجوداً بوسائطَ لا يقبلُها توقيعٌ منشور.
 *   • **٢٧ من هذه فى كودِ التطبيقِ نفسِه**، بـ١٧ اسماً.
 *
 * ═══ وليس كلُّ بابٍ ميتٍ سواءً: ثلاثُ درجاتٍ قِيست ═══
 *
 *   ‏(أ) **بابٌ يسقطُ فيُسمَع** — يُعادُ الخطأُ فيظهرُ ٥٠٠ أو رسالةٌ صريحة.
 *       سيّئٌ، لكنّه صادق. (مسارُ فحصِ سلامةِ البيانات، ومسارُ التسوية، …)
 *
 *   ‏(ب) **بابٌ يسقطُ فيُبتلَع** — لا يُقرَأُ خطؤُه أصلاً، فتُقرَأُ نتيجتُه فراغاً
 *       ويُبنى عليها. وهذا هو الذى يقتل.
 *
 *   ‏(ج) **وأسوأُ من الاثنين: بابٌ يسقطُ فيُعلَنُ نجاحُه**. وقِيسَ منه ثلاثة:
 *       ١. معاينةُ إقفالِ الفترةِ المحاسبيّة: تعرضُ **صفراً** إيراداً ومصروفاً
 *          وصافىَ ربحٍ على الشاشةِ التى يُقرَّرُ فيها الإقفال.
 *       ٢. حسابُ العمولات: يكتبُ فى `commission_runs` مبالغَ **صفرٍ** ويعودُ
 *          `success: true`. **ورقمٌ كاذبٌ فى جدولِ مالٍ أسوأُ من خطأٍ ظاهر.**
 *       ٣. شاشةُ «تطبيقِ قواعدِ الأوامر»: تقولُ «✅ تمَّ بنجاح، أُنشئت ٣ دوالَّ
 *          و٢ مُشغِّل» **ولم يُنشَأْ شىءٌ قطّ**، وتُعلِنُ حالةَ التزامٍ أربعةَ
 *          حقولٍ مكتوبةً `true` ثابتةً فى النصّ.
 *
 *       والثلاثةُ نُزعَ كذبُها فى هذه الدفعة. **ولم يُبْنَ ما كان ناقصاً**: بناءُ
 *       محرّكِ عمولاتٍ يكتبُ فى الدفتر، أو بيتٍ واحدٍ يحسبُ صافىَ ربحِ الفترة،
 *       أو مُشغِّلٍ يمنعُ تعديلَ أمرٍ بعدَ إرسالِ فاتورتِه — كلُّ واحدٍ منها دفعةٌ
 *       تُقاسُ بذاتِها. **والفرقُ بين نزعِ ادّعاءٍ وبناءِ ميزةٍ فرقٌ يُصان.**
 *
 * ═══ ولماذا حارسٌ لا تصحيحٌ فقط ═══
 *
 * لأنَّ الطرفَينِ لا يعيشانِ فى مكانٍ واحد: التوقيعُ فى القاعدةِ الحيّة، والنداءُ
 * فى ملفّ. يُغيَّرُ توقيعٌ فتصيرُ عشراتُ النداءاتِ يتيمةً **ولا يتغيّرُ حرفٌ فى
 * المستودع**، فيقولُ الفحصُ النصّىُّ «سليم» والبابُ لا يُفتَح. ولا سبيلَ إلّا
 * سؤالُ القاعدةِ نفسِها ومقابلةُ جوابِها بما فى الشيفرة.
 *
 * ═══ القوانينُ الأربعة ═══
 *
 *   ‏(١) **كلُّ نداءٍ يجدُ باباً**: نداءٌ بوسائطَ مكتوبةٍ حرفاً يجبُ أن يقبلَه
 *       توقيعٌ منشورٌ واحدٌ على الأقلّ — أسماؤُه تشملُ ما أُرسل، وما لم يُرسَلْ
 *       له قيمةٌ افتراضيّة.
 *   ‏(٢) **والمُثبَّتُ لا ينمو ولا ينقصُ فى صمت**: الدَّينُ المقيسُ مُثبَّتٌ
 *       بالاسمِ والعدد. بابٌ ميتٌ جديدٌ يُرفَض، وبابٌ أُصلحَ ولم يُنزَعْ من
 *       التثبيتِ يُرفَضُ كذلك — **فلا يُجمَّلُ التاريخُ ولا يُنسى**.
 *   ‏(٣) **ونداءٌ لا يُقرَأُ خطؤُه بابٌ إن أُغلقَ لم يُسمَعْ صوتُه**: عددُ نداءاتِ
 *       التطبيقِ التى تُهمِلُ خطأَها مُثبَّتٌ ولا يُسمَحُ بنموِّه.
 *   ‏(٤) **والمواضعُ التى نُزعَ كذبُها لا تعودُ إليه**: تُقاسُ بأعيانِها.
 *
 * ═══ وبيتٌ واحدٌ لهذا الحكم ═══
 *
 * كان `check-the-period-lock-is-one-home.js` يحملُ نسخةً ضيّقةً من القانونِ (١)
 * على مسارَين. **وقانونٌ فى بيتَين هو العطبُ الذى نُحاربُه**، فنُقلَ الحكمُ إلى
 * هنا كاملاً ونُزعَ من هناك.
 *
 * Usage: node scripts/check-every-rpc-call-has-a-door.js [--require-db] [--selftest]
 * ---------------------------------------------------------------------------
 */
"use strict"
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const path = require("path")

const ROOT = process.cwd()

// مجلَّداتٌ ليست شيفرةَ مشروعٍ أصلاً. و**دوالُّ الحافّةِ تحتَ `supabase/functions`
// مشمولةٌ عن قصد**: نداءٌ ميتٌ فيها يفشلُ فى كلِّ مرّةٍ كما يفشلُ فى أىِّ مسار.
// (وقِيسَ اليومَ: لا نداءَ rpc فيها أصلاً — فالشمولُ للغدِ لا لليوم.)
const SKIP_DIRS = new Set([
  ".git", "node_modules", ".next", "dist", "build", "coverage", ".vercel", "out",
])
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"])

/** ما يُعَدُّ «كودَ التطبيق» — أى ما يعملُ فى يدِ صاحبِ الشأنِ لا فى يدِ مطوّر. */
const APP_DIRS = /^(app|lib|components|hooks|pages|src|utils|services|contexts|middleware)[\\/]/

/**
 * **الدَّينُ المقيسُ يومَ ٢٢ أغسطس ٢٠٢٦ بعدَ نزعِ الكذب**: اسمُ الدالّةِ ⇐ عددُ
 * مواضعِ ندائِها التى لا تجدُ باباً. مجموعُها ٨٥ موضعاً فى ٢٧ اسماً.
 *
 * وأكبرُها ليس عطبَ منطق: `exec_sql` و`execute_sql` بابانِ لتنفيذِ SQL حرٍّ من
 * التطبيق، **وغيابُهما نعمةٌ لا نقص** — فلو وُجدا وأُتيحا لمستخدِمٍ مسجَّلٍ لكانا
 * أخطرَ ثقبٍ فى المشروعِ كلِّه. فالعلاجُ ليس إنشاءَهما، بل نزعُ الاعتمادِ عليهما.
 * وأكثرُ مواضعِهما فى سكربتاتِ صيانةٍ تُشغَّلُ باليد، لا فى المنتَجِ العامل.
 *
 * وما بقىَ من الأسماءِ دوالُّ **لم تُنشَرْ قطُّ** ويُنادِيها كودٌ يفترضُ وجودَها:
 * محرّكُ العمولات، وفحوصُ سلامةِ البيانات، وتسوياتُ الوارد-أوّلاً-صادر-أوّلاً.
 * وكلُّ واحدةٍ منها ميزةٌ ناقصةٌ تُبنى فى دفعتِها ولا تُخلَقُ على عَجَل.
 */
const PINNED_DOORLESS = {
  apply_fifo_consumption_from_invoices: 2,
  apply_purchase_returns_to_fifo: 2,
  apply_write_off_balance_fix: 1,
  backfill_fifo_lots_from_bills: 2,
  calculate_commission_for_period: 10,
  check_user_role: 1,
  comprehensive_data_integrity_check: 1,
  distribute_dividends_atomic: 3,
  exec_sql: 36,
  execute_sql: 7,
  execute_sql_query: 1,
  fix_existing_data_with_opening_balances: 1,
  get_all_triggers: 1,
  get_ap_summary_new: 1,
  get_invoices_trigger_info: 1,
  get_pending_instant_payouts: 3,
  get_table_policies: 1,
  get_table_triggers: 1,
  get_unbalanced_journal_entries: 1,
  pay_commission_run_atomic: 2,
  pay_instant_commissions: 1,
  reverse_commission_for_credit_note: 1,
  verify_accounting_pattern: 1,
  verify_accounts_payable: 1,
  verify_accounts_receivable: 1,
  verify_inventory_integrity: 1,
  verify_journal_entries_balance: 1,
}

/**
 * **نداءٌ لا يُقرَأُ خطؤُه**: قِيسَ **١٠٠** موضعاً فى كودِ التطبيقِ قبلَ هذه الدفعة،
 * ونُزعَ منها **٧** فيها (معاينةُ الإقفالِ ٢، وشاشةُ قواعدِ الأوامرِ ٥)، فبقىَ
 * **٩٣**. ولا يُسمَحُ بنموِّه ولا بنقصِه فى صمت.
 *
 * وأكثرُه `create_notification`: إشعارُ قرارٍ يسقطُ فلا يعلمُ به أحد — وهو بابُ
 * «القراراتِ الفائتة» المعدودِ أصلاً فى المشروع. ومنه كذلك ما هو أدهى:
 * `app/api/data-health-check/route.ts` يُنادى خمسةَ فحوصِ صحّةٍ ولا يقرأُ خطأَ
 * واحدٍ منها، **فلو سقطتْ كلُّها لقالَ «لا مشاكل»**. ودالّاتُها منشورةٌ اليومَ
 * فالسقوطُ لم يقع، لكنَّ الشكلَ هو الشكل. وتصحيحُ الثلاثةِ والتسعينَ موضعاً دفعةٌ
 * تُقاسُ بذاتِها ولا تُخلَطُ بهذه.
 */
const PINNED_ERROR_BLIND = 93

/**
 * **المواضعُ التى نُزعَ كذبُها فى هذه الدفعة** — تُقاسُ بأعيانِها فلا تعود.
 * لكلِّ موضعٍ نصٌّ يجبُ أن يبقى ونصٌّ يجبُ ألّا يعود.
 */
const CURED_SITES = [
  {
    file: "app/accounting/periods/page.tsx",
    mustHave: ["measured: false", "closingPreview.measured"],
    mustNotHave: ["execute_sql"],
    why: "معاينةُ الإقفالِ كانت تعرضُ صفراً لم يُقَسْ على شاشةِ قرارِ الإقفال.",
  },
  {
    file: "app/api/commissions/runs/calculate/route.ts",
    mustHave: ["if (calculated === 0 && failed > 0)", "success: failed === 0"],
    mustNotHave: ["success: true,\n            run_id"],
    why: "حسابُ العمولاتِ كان يكتبُ صفراً فى جدولِ مالٍ ويعودُ بنجاح.",
  },
  {
    file: "app/api/apply-orders-rules/route.ts",
    mustHave: ["if (rpcErr) throw new Error(rpcErr.message)", "sent_orders_locked: results.triggers_created > 0"],
    mustNotHave: ["sent_orders_locked: true"],
    why: "الشاشةُ كانت تُعلنُ تطبيقَ ضوابطَ لم تُنشَأْ قطّ.",
  },
  {
    file: "app/inventory-transfers/[id]/edit/page.tsx",
    mustHave: ["لم يُحذَف البند"],
    mustNotHave: ["delete_transfer_item"],
    why: "حذفُ بندٍ كان يسقطُ مرّتَينِ فى صمتٍ ثمّ يُقالُ «تم الحفظ».",
  },
]

// ═══════════════════════════════════════════════════════════════════════════
// الجزءُ الخالصُ من المنطق — يُختبَرُ بلا قرصٍ ولا قاعدة
// ═══════════════════════════════════════════════════════════════════════════

/** **التعليقُ ليس تعليمة.** يُقنَّعُ بالفراغِ حفظاً لأرقامِ السطور. */
function maskJsComments(src) {
  let out = ""
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]
    if (c === "/" && c2 === "/") {
      while (i < n && src[i] !== "\n") { out += " "; i++ }
    } else if (c === "/" && c2 === "*") {
      out += "  "; i += 2
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++ }
      if (i < n) { out += "  "; i += 2 }
    } else { out += c; i++ }
  }
  return out
}

/**
 * **والنصُّ المقتبَسُ ليس تعليمة.** نداءٌ مكتوبٌ داخلَ نصٍّ حرفىٍّ — كعيّناتِ
 * الفخاخِ فى الحُرّاسِ أنفسِهم — ليس نداءً يُنفَّذ، ولو حُسبَ لاتُّهمَ برىء.
 * @returns {Uint8Array} علامةٌ لكلِّ حرف: أهو داخلَ نصٍّ حرفىٍّ؟
 */
function stringMask(src) {
  const inStr = new Uint8Array(src.length)
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === '"' || c === "'" || c === "`") {
      const q = c
      let j = i + 1
      while (j < src.length) {
        if (src[j] === "\\") { j += 2; continue }
        if (src[j] === q) break
        if (q !== "`" && src[j] === "\n") break // نصٌّ لم يُغلَقْ فى سطرِه: لا يُبتلَعُ الملفُّ كلُّه
        j++
      }
      for (let k = i + 1; k < Math.min(j, src.length); k++) inStr[k] = 1
      i = j + 1
      continue
    }
    i++
  }
  return inStr
}

/**
 * يقرأُ كائناً حرفيّاً يبدأُ عندَ `{` ويُرجِعُ موضعَ إغلاقِه — بعدِّ الأقواسِ
 * وتخطّى النصوصِ الحرفيّة، **فقوسٌ داخلَ نصٍّ لا يخدع**.
 */
function objectEnd(src, start) {
  if (src[start] !== "{") return -1
  let depth = 0
  let i = start
  let inStr = null
  while (i < src.length) {
    const c = src[i]
    if (inStr) {
      if (c === "\\") { i += 2; continue }
      if (c === inStr) inStr = null
      i++
      continue
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; i++; continue }
    if (c === "{" || c === "[" || c === "(") { depth++; i++; continue }
    if (c === "}" || c === "]" || c === ")") {
      depth--
      if (depth === 0 && c === "}") return i
      i++
      continue
    }
    i++
  }
  return -1
}

/**
 * أسماءُ مفاتيحِ المستوى الأوّلِ فى كائنٍ حرفىّ.
 * @returns {{keys:string[]|null, reason?:string}} و`null` يعنى **لا يُحكَمُ عليه**.
 */
function topLevelKeys(objText) {
  const inner = objText.replace(/^\{/, "").replace(/\}$/, "")
  const segs = []
  let depth = 0, inStr = null, seg = ""
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]
    if (inStr) {
      seg += c
      if (c === "\\") { seg += inner[i + 1] || ""; i++; continue }
      if (c === inStr) inStr = null
      continue
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; seg += c; continue }
    if (c === "{" || c === "[" || c === "(") { depth++; seg += c; continue }
    if (c === "}" || c === "]" || c === ")") { depth--; seg += c; continue }
    if (c === "," && depth === 0) { segs.push(seg); seg = ""; continue }
    seg += c
  }
  segs.push(seg)

  const keys = []
  for (const raw of segs) {
    const s = raw.trim()
    if (!s) continue
    if (s.startsWith("...")) return { keys: null, reason: "نشرٌ" }
    if (s.startsWith("[")) return { keys: null, reason: "مفتاحٌ محسوب" }
    const m = s.match(/^(?:(['"])([^'"]+)\1|([A-Za-z_$][\w$]*))\s*:/)
    if (m) { keys.push(m[2] || m[3]); continue }
    const short = s.match(/^([A-Za-z_$][\w$]*)$/)
    if (short) { keys.push(short[1]); continue }
    return { keys: null, reason: "شكلٌ غيرُ مقروء" }
  }
  return { keys }
}

/**
 * كلُّ نداءِ rpc بوسائطَ مكتوبةٍ حرفاً فى نصٍّ واحد.
 * @returns {{fn:string, keys:string[]|null, line:number, form:string}[]}
 */
function literalRpcCalls(src) {
  const code = maskJsComments(src)
  const inStr = stringMask(code)
  const out = []
  const re = /\.rpc\s*(?:<[^>(]*>)?\s*\(\s*(['"`])([A-Za-z_][\w]*)\1\s*/g
  let m
  while ((m = re.exec(code)) !== null) {
    if (inStr[m.index]) continue
    const fn = m[2]
    const line = code.slice(0, m.index).split("\n").length
    let j = m.index + m[0].length
    while (j < code.length && /\s/.test(code[j])) j++
    if (code[j] === ")") { out.push({ fn, keys: [], line, form: "بلا وسائط" }); continue }
    if (code[j] !== ",") { out.push({ fn, keys: null, line, form: "شكلٌ غريب" }); continue }
    j++
    while (j < code.length && /\s/.test(code[j])) j++
    if (code[j] !== "{") { out.push({ fn, keys: null, line, form: "وسيطٌ بمتغيّر" }); continue }
    const end = objectEnd(code, j)
    if (end < 0) { out.push({ fn, keys: null, line, form: "قوسٌ لم يُغلَق" }); continue }
    const r = topLevelKeys(code.slice(j, end + 1))
    if (!r.keys) { out.push({ fn, keys: null, line, form: r.reason }); continue }
    out.push({ fn, keys: [...new Set(r.keys)].sort(), line, form: "حرفىّ" })
  }
  return out
}

/**
 * أيقبلُ توقيعٌ منشورٌ **واحدٌ على الأقلّ** هذه الأسماء؟
 * قاعدةُ PostgREST: الوسائطُ تُرسَلُ بأسمائِها، وما لم يُرسَلْ وجبَ أن تكونَ له
 * قيمةٌ افتراضيّة. والقيمُ الافتراضيّةُ فى بوستجرس فى آخرِ الوسائطِ دائماً.
 * @param {string[]} keys
 * @param {{argnames:string[], nargs:number, ndefaults:number}[]} overloads
 */
function someOverloadAccepts(keys, overloads) {
  return overloads.some((o) => {
    const inArgs = o.argnames.slice(0, o.nargs)
    if (!keys.every((k) => inArgs.includes(k))) return false
    const required = inArgs.slice(0, Math.max(0, inArgs.length - o.ndefaults))
    return required.every((r) => keys.includes(r))
  })
}

/**
 * **هل يُقرَأُ خطأُ هذا النداء؟** يُنظَرُ إلى ما قبلَ `.rpc(` فى جملتِه: إن لم
 * تُذكَرْ فيه كلمةُ `error` فالسقوطُ لا يُسمَع.
 */
function readsItsError(code, idx) {
  let i = idx
  let depth = 0
  while (i > 0) {
    const c = code[i]
    if (c === ")" || c === "}" || c === "]") depth++
    else if (c === "(" || c === "{" || c === "[") { if (depth === 0) break; depth-- }
    else if (c === ";" && depth === 0) break
    else if (c === "\n" && depth === 0) {
      // **ولا يُستعارُ خطأُ جملةٍ سابقة.** أسلوبُ المشروعِ بلا فاصلةٍ منقوطة، فلا
      // تصلحُ الفاصلةُ وحدَها حدّاً بين الجُمَل. والسطرُ التالى إن بدأَ بنقطةٍ فهو
      // تتمّةٌ لما قبلَه (`await supabase\n  .rpc(...)`)، وإلّا فجملةٌ جديدةٌ يُوقَفُ عندَها.
      if (!code.slice(i + 1, idx).trimStart().startsWith(".")) break
    }
    i--
  }
  return /\berror\b/i.test(code.slice(i, idx))
}

/**
 * **معدودٌ لا مسكوتٌ عنه**: يُقابَلُ المقيسُ بالمُثبَّت.
 * @returns {{grew:string[], shrank:string[]}}
 */
function judgeRoster(found, pinned) {
  const grew = []
  const shrank = []
  for (const name of Object.keys(found).sort()) {
    const was = pinned[name] || 0
    if (found[name] > was) grew.push(`${name}: ${was} ⇐ ${found[name]}`)
  }
  for (const name of Object.keys(pinned).sort()) {
    const now = found[name] || 0
    if (now < pinned[name]) shrank.push(`${name}: ${pinned[name]} ⇐ ${now}`)
  }
  return { grew, shrank }
}

/**
 * كلُّ ملفّاتِ شيفرةِ **المشروع** — تُقرَأُ من git لا من القرص.
 *
 * **والجردُ من غيرِ بيتِه جردُ نُفايةٍ لا جردُ مشروع.** فمجلَّدُ العملِ على جهازِ
 * صاحبِ المشروعِ فيه أدواتُ إصداراتٍ سابقةٍ ومُخلَّفاتٌ غيرُ مرفوعة، ولو حُسبت
 * لتحرّكَ الرقمُ المُثبَّتُ من غيرِ أن يتغيّرَ فى المشروعِ حرف. وهذا هو قانونُ
 * `check-code-census-has-one-home.js` نفسُه: **الجردُ يُقرَأُ من git لا من القرص**.
 *
 * ويُقرَأُ الفهرسُ لا القيدُ (`git ls-files`)، فيرى الملفَّ الجديدَ بعدَ ترحيلِه —
 * ولذلك تُرحَّلُ الملفّاتُ الجديدةُ صراحةً قبلَ تشغيلِ الحُرّاسِ (درسُ v3.75.81).
 */
function codeFiles(root) {
  const { execFileSync } = require("child_process")
  let listed
  try {
    listed = execFileSync("git", ["--no-optional-locks", "ls-files", "-z"], {
      cwd: root, maxBuffer: 64 * 1024 * 1024,
    }).toString("utf8")
  } catch (e) {
    throw new Error("تعذّرَ سؤالُ git عن ملفّاتِ المشروع — ولا يُجرَدُ القرصُ بدلاً منه: " + e.message)
  }
  const out = []
  for (const rel of listed.split("\0")) {
    if (!rel) continue
    if (!CODE_EXT.has(path.extname(rel))) continue
    if (SKIP_DIRS.has(rel.split("/")[0])) continue
    const abs = path.join(root, rel)
    if (fs.existsSync(abs)) out.push(abs)
  }
  return out
}

// **ولا يُنسَخُ حكمٌ ليُقاسَ به**: من استوردَ هذا الملفَّ أخذَ نفسَ الدوالِّ التى
// يحكمُ بها الحارس، فلا تُكتَبُ نسخةٌ ثانيةٌ فى أداةِ قياسٍ ثمّ تفترقُ عنه بحرفٍ
// فيصيرُ الرقمُ المُثبَّتُ رقمَ أداةٍ لا رقمَ حارس — **وبيتانِ لحكمٍ واحدٍ هو العطب**.
if (require.main !== module) {
  module.exports = {
    literalRpcCalls, someOverloadAccepts, readsItsError, judgeRoster,
    maskJsComments, stringMask, codeFiles, APP_DIRS,
    PINNED_DOORLESS, PINNED_ERROR_BLIND, CURED_SITES,
  }
  return
}

// ═══════════════════════════════════════════════════════════════════════════
// الفخُّ الذاتىّ — **وحارسٌ لا يُرى وهو يرفض ليس حارساً**
// ═══════════════════════════════════════════════════════════════════════════
if (process.argv.includes("--selftest")) {
  const cases = []
  const t = (name, got, exp) => cases.push([name, JSON.stringify(got), JSON.stringify(exp)])
  const SQ = String.fromCharCode(39)
  const BT = String.fromCharCode(96)

  // ── استخراجُ النداءات ──────────────────────────────────────────────────
  t("يقرأُ اسمَ الدالّةِ ومفاتيحَها",
    literalRpcCalls('await x.rpc("f", { p_a: 1, p_b: y })')[0].keys, ["p_a", "p_b"])
  t("ويقرأُ الاسمَ بعينِه",
    literalRpcCalls('await x.rpc("close_accounting_period", { p_id: i })')[0].fn, "close_accounting_period")
  t("ولا يقرأُ نداءً فى تعليقِ سطر",
    literalRpcCalls('// await x.rpc("f", { p_a: 1 })').length, 0)
  t("ولا فى تعليقِ كتلة",
    literalRpcCalls('/* await x.rpc("f", { p_a: 1 }) */').length, 0)
  t("ولا يحسبُ نداءً داخلَ نصٍّ حرفىٍّ عيّنةً لفخّ",
    literalRpcCalls("const s = " + SQ + 'await x.rpc("f_fixture", { p_a: 1 })' + SQ).length, 0)
  t("ولا داخلَ نصٍّ بعلاماتٍ خلفيّة",
    literalRpcCalls("const s = " + BT + 'await x.rpc("f_tpl", { p_a: 1 })' + BT).length, 0)
  t("ويرى النداءَ الحقيقىَّ بجوارِ عيّنةٍ مقتبَسة",
    literalRpcCalls("const s = " + SQ + 'x.rpc("f_fix", {})' + SQ + '\nawait x.rpc("f_real", { p_a: 1 })')
      .map((c) => c.fn), ["f_real"])
  t("ولا يخدعُه قوسٌ داخلَ نصِّ وسيط",
    literalRpcCalls('await x.rpc("f", { p_a: "} not the end", p_b: 2 })')[0].keys, ["p_a", "p_b"])
  t("ويقرأُ اختصارَ الكائن",
    literalRpcCalls("await x.rpc(\"f\", { p_id })")[0].keys, ["p_id"])
  t("ويقرأُ المفتاحَ المقتبَس",
    literalRpcCalls("await x.rpc(\"f\", { " + SQ + "p_id" + SQ + ": 1 })")[0].keys, ["p_id"])
  t("ولا يحكمُ على وسيطٍ منشور",
    literalRpcCalls('await x.rpc("f", { ...rest, p_a: 1 })')[0].keys, null)
  t("ولا على وسيطٍ بمتغيّر",
    literalRpcCalls('await x.rpc("f", vars)')[0].keys, null)
  t("ويعرفُ النداءَ بلا وسائطَ أصلاً",
    literalRpcCalls('await x.rpc("f")')[0].form, "بلا وسائط")
  t("ويعبرُ الأنواعَ العامّة",
    literalRpcCalls('await x.rpc<Row>("f", { p_a: 1 })')[0].fn, "f")
  t("ويحصى نداءَينِ فى ملفٍّ واحد",
    literalRpcCalls('x.rpc("a", { p: 1 })\nx.rpc("b", { q: 2 })').length, 2)

  // ── مطابقةُ التوقيعات ──────────────────────────────────────────────────
  const OVL = [
    { argnames: ["p_period_id", "p_user_id", "p_notes"], nargs: 3, ndefaults: 1 },
    { argnames: ["p_period_id", "p_closed_by", "p_retained"], nargs: 3, ndefaults: 0 },
  ]
  t("يقبلُ نداءً يُطابقُ توقيعاً", someOverloadAccepts(["p_period_id", "p_user_id"], OVL), true)
  t("ويقبلُ نداءً يملأُ كلَّ الوسائط", someOverloadAccepts(["p_notes", "p_period_id", "p_user_id"], OVL), true)
  t("ويقبلُ عبرَ النسخةِ الثانيةِ من الاسمِ نفسِه",
    someOverloadAccepts(["p_closed_by", "p_period_id", "p_retained"], OVL), true)
  t("ويرفضُ وسيطاً لا يعرفُه توقيعٌ — **وهذا عطبُ v3.75.82 بعينِه**",
    someOverloadAccepts(["p_company_id", "p_period_id", "p_user_id"], OVL), false)
  t("ويرفضُ نداءً أسقطَ وسيطاً إلزاميّاً",
    someOverloadAccepts(["p_period_id"], [{ argnames: ["p_period_id", "p_user_id"], nargs: 2, ndefaults: 0 }]), false)
  t("ويقبلُ إسقاطَ وسيطٍ له قيمةٌ افتراضيّة",
    someOverloadAccepts(["p_period_id"], [{ argnames: ["p_period_id", "p_user_id"], nargs: 2, ndefaults: 1 }]), true)
  t("ولا يخلطُ وسيطَ خرجٍ بوسيطِ دخل",
    someOverloadAccepts(["out_col"], [{ argnames: ["p_a", "out_col"], nargs: 1, ndefaults: 0 }]), false)
  t("ويرفضُ اسماً لا توقيعَ له إطلاقاً", someOverloadAccepts(["p_a"], []), false)
  t("ويقبلُ نداءً بلا وسائطَ لدالّةٍ بلا وسائط",
    someOverloadAccepts([], [{ argnames: [], nargs: 0, ndefaults: 0 }]), true)
  t("ويرفضُ نداءً بلا وسائطَ لدالّةٍ تطلبُها",
    someOverloadAccepts([], [{ argnames: ["p_a"], nargs: 1, ndefaults: 0 }]), false)

  // ── قراءةُ الخطأ ───────────────────────────────────────────────────────
  const withErr = 'const { data, error } = await supabase.rpc("f", { p: 1 })'
  const noErr = 'const { data } = await supabase.rpc("f", { p: 1 })'
  t("يرى النداءَ الذى يقرأُ خطأَه", readsItsError(withErr, withErr.indexOf(".rpc")), true)
  t("ويرى النداءَ الذى يُهملُه", readsItsError(noErr, noErr.indexOf(".rpc")), false)
  const renamed = 'const { data: d, error: e } = await supabase.rpc("f", { p: 1 })'
  t("ولا يخدعُه تغييرُ اسمِ المتغيّر", readsItsError(renamed, renamed.indexOf(".rpc")), true)
  const prevLine = 'const { error } = await a()\nconst { data } = await supabase.rpc("f", { p: 1 })'
  t("ولا يستعيرُ خطأَ الجملةِ السابقة", readsItsError(prevLine, prevLine.lastIndexOf(".rpc")), false)

  // ── السجلُّ المُثبَّت ──────────────────────────────────────────────────
  t("سجلٌّ مطابقٌ لا يُشكى منه", judgeRoster({ a: 2 }, { a: 2 }), { grew: [], shrank: [] })
  t("ويرفضُ بابَ موتٍ جديداً", judgeRoster({ a: 2, b: 1 }, { a: 2 }).grew.length, 1)
  t("ويرفضُ نموَّ عددِ اسمٍ مُثبَّت", judgeRoster({ a: 3 }, { a: 2 }).grew.length, 1)
  t("ويرفضُ نقصاً صامتاً لم يُنزَعْ من التثبيت", judgeRoster({ a: 1 }, { a: 2 }).shrank.length, 1)
  t("ويرفضُ اختفاءً كاملاً لم يُنزَعْ", judgeRoster({}, { a: 2 }).shrank.length, 1)

  // ── التقنيع ────────────────────────────────────────────────────────────
  t("يُبقى أرقامَ السطورِ بعدَ تقنيعِ التعليقات",
    maskJsComments("a\n// c\nb").split("\n").length, 3)

  let fail = 0
  for (const [name, got, exp] of cases) {
    if (got !== exp) { console.error(`  X ${name}: قِيسَ ${got} والمنتظَرُ ${exp}`); fail++ }
  }
  if (fail) { console.error("X سقط الفخُّ الذاتىّ فى " + fail + " اتّجاه."); process.exit(1) }
  console.log("  الفخُّ الذاتىّ: " + cases.length + " اتّجاهاً، كلُّها صحيحة.")
  process.exit(0)
}

// ═══════════════════════════════════════════════════════════════════════════
// القياسُ الحقيقىّ — على القاعدةِ الحيّة
// ═══════════════════════════════════════════════════════════════════════════
const requireDb = process.argv.includes("--require-db")
const url = process.env.RPC_DOORS_DB_URL || process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "no database URL - cannot measure whether every rpc call finds a deployed door."
  if (requireDb) { console.error(`X ${msg}`); process.exit(1) }
  console.log(`! ${msg} Skipping (pass --require-db to make this fatal).`)
  process.exit(0)
}

const { withLiveDatabase } = require("./lib/live-db")

const problems = []
const notes = []

;(async () => {
  await withLiveDatabase(url, async (client) => {
    problems.length = 0
    notes.length = 0

    // ── التوقيعاتُ المنشورةُ كلُّها، مرّةً واحدة ───────────────────────────
    const { rows: sigRows } = await client.query(
      `SELECT p.proname AS name,
              COALESCE((
                SELECT array_agg(nm ORDER BY ord)
                  FROM unnest(p.proargnames) WITH ORDINALITY AS u(nm, ord)
                 WHERE p.proargmodes IS NULL OR (p.proargmodes)[ord] IN ('i','b','v')
              ), ARRAY[]::text[]) AS argnames,
              p.pronargs, p.pronargdefaults
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'`)

    const byName = new Map()
    for (const r of sigRows) {
      const list = byName.get(r.name) || []
      list.push({
        argnames: r.argnames || [],
        nargs: Number(r.pronargs),
        ndefaults: Number(r.pronargdefaults),
      })
      byName.set(r.name, list)
    }

    // ── (١) كلُّ نداءٍ يجدُ باباً · (٣) وكلُّ نداءٍ يُسمَعُ سقوطُه ──────────
    const doorless = {}
    const doorlessWhere = []
    let judged = 0
    let appCalls = 0
    let errorBlind = 0

    for (const abs of codeFiles(ROOT)) {
      const rel = path.relative(ROOT, abs)
      const raw = fs.readFileSync(abs, "utf8")
      const calls = literalRpcCalls(raw)
      if (calls.length === 0) continue
      const code = maskJsComments(raw)
      const isApp = APP_DIRS.test(rel)

      for (const c of calls) {
        if (isApp) {
          appCalls++
          const at = code.split("\n").slice(0, c.line - 1).join("\n").length + 1 +
            (code.split("\n")[c.line - 1] || "").indexOf(".rpc")
          if (!readsItsError(code, at)) errorBlind++
        }
        if (c.keys === null) continue // **لا يُحكَمُ على ما لا يُقرَأُ يقيناً**
        judged++
        const overloads = byName.get(c.fn)
        if (!overloads || !someOverloadAccepts(c.keys, overloads)) {
          doorless[c.fn] = (doorless[c.fn] || 0) + 1
          doorlessWhere.push(`${rel}:${c.line} ⇐ ${c.fn}(${c.keys.join(", ")})`)
        }
      }
    }

    const total = Object.values(doorless).reduce((a, b) => a + b, 0)
    const roster = judgeRoster(doorless, PINNED_DOORLESS)

    for (const g of roster.grew) {
      problems.push(
        `نداءٌ لا يجدُ باباً ولم يكنْ فى الدَّينِ المُثبَّت — ${g}. ` +
        "**وبابٌ لا يُفتَحُ يفشلُ فى كلِّ مرّة**، فإمّا أن تُنشَرَ الدالّةُ وإمّا أن يُنزَعَ النداء.")
    }
    for (const s of roster.shrank) {
      problems.push(
        `دَينٌ مُثبَّتٌ نقصَ ولم يُنزَعْ من التثبيت — ${s}. ` +
        "**والتاريخُ لا يُجمَّل**: يُحدَّثُ PINNED_DOORLESS بالعددِ الجديدِ فى نفسِ الدفعة.")
    }
    if (errorBlind > PINNED_ERROR_BLIND) {
      problems.push(
        `نداءاتٌ لا يُقرَأُ خطؤُها فى كودِ التطبيق: ${errorBlind} والمُثبَّتُ ${PINNED_ERROR_BLIND}. ` +
        "**وبابٌ إن أُغلقَ لم يُسمَعْ صوتُه يُقرَأُ فراغُه رقماً.**")
    }
    if (errorBlind < PINNED_ERROR_BLIND) {
      problems.push(
        `نداءاتٌ لا يُقرَأُ خطؤُها: ${errorBlind} والمُثبَّتُ ${PINNED_ERROR_BLIND} — ` +
        "نقصَ ولم يُنزَعْ من التثبيت. **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه.**")
    }

    // ── (٤) والمواضعُ التى نُزعَ كذبُها لا تعودُ إليه ──────────────────────
    for (const site of CURED_SITES) {
      const abs = path.join(ROOT, site.file)
      if (!fs.existsSync(abs)) { problems.push(`موضعٌ مُداوىً غائب: ${site.file}`); continue }
      const src = fs.readFileSync(abs, "utf8")
      const code = maskJsComments(src)
      for (const need of site.mustHave) {
        if (!src.includes(need)) {
          problems.push(`${site.file} فقدَ «${need}» — ${site.why} **والدواءُ لا يُنزَع.**`)
        }
      }
      for (const banned of site.mustNotHave) {
        if (code.includes(banned)) {
          problems.push(`${site.file} عادَ إليه «${banned}» — ${site.why}`)
        }
      }
    }

    notes.push(`  توقيعاتٌ منشورة: ${sigRows.length} فى ${byName.size} اسماً`)
    notes.push(`  نداءاتٌ حُكِمَ عليها: ${judged} · بلا باب: ${total} (المُثبَّت ${Object.values(PINNED_DOORLESS).reduce((a, b) => a + b, 0)}) فى ${Object.keys(doorless).length} اسماً`)
    notes.push(`  نداءاتُ التطبيق: ${appCalls} · لا يُقرَأُ خطؤُها: ${errorBlind} (المُثبَّت ${PINNED_ERROR_BLIND})`)
  }, { onAttempt: () => { problems.length = 0; notes.length = 0 } })

  if (problems.length > 0) {
    console.error(`X بابٌ لا يُفتَحُ ليس باباً (${problems.length}):`)
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }

  for (const n of notes) console.log(n)
  console.log(
    "+ كلُّ نداءٍ جديدٍ يجدُ باباً منشوراً يقبلُ وسائطَه · والدَّينُ المقيسُ مُثبَّتٌ " +
    "بالاسمِ والعددِ فلا ينمو ولا ينقصُ فى صمت · ولا يعودُ إلى المواضعِ الأربعةِ كذبُها.")
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })

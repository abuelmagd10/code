#!/usr/bin/env node
/**
 * check-foreign-money-is-translated.js
 * ---------------------------------------------------------------------------
 * v3.75.84 — **ولا يُسجَّلُ مالٌ بعملةٍ لم تُترجَم.**
 * v3.75.85 — **وتكلفةُ الصنفِ تُقاسُ بعملةِ الدفترِ لا بعملةِ البائع.**
 *
 * ═══ الحادثةُ التى وُلد منها هذا الحارس ═══
 *
 * سُئل: أمشروعُنا مُجهَّزٌ لشركةٍ مشترياتُها استيرادٌ من الخارج؟ فقِيسَ يومَ ٢٢
 * أغسطس ٢٠٢٦، فإذا الجوابُ نصفان:
 *
 *   • **نصفٌ مبنىٌّ فعلاً**: ٢٦٤ سعرَ صرفٍ فى ٢٢ زوجاً · إعادةُ تقييمٍ حقيقيّةٌ
 *     تُنشئُ قيدَ مسوّدةٍ لحسابَى فروقِ العملة · دفترٌ ثنائىُّ العملةِ فى أعمدتِه ·
 *     **وأمرُ الشراءِ يقبلُ عملةً أجنبيّةً بسعرِ صرفٍ يُجلَبُ حيّاً** · ومصاريفُ
 *     الشحنِ تدخلُ تكلفةَ الصنفِ عبرَ بيتٍ واحدٍ منذ v3.74.704.
 *   • **ونصفٌ غيرُ موجود**: فاتورةُ الشراءِ — الحلقةُ التى تُنشئُ الالتزامَ
 *     وتُسعِّرُ المخزون — **لا تعرفُ العملةَ إطلاقاً**: شاشةُ إنشائِها ومسارُ
 *     خادمِها فيهما صفرُ ذكرٍ للعملة. ولا عمودَ واحدٌ فى القاعدةِ كلِّها اسمُه
 *     جمركٌ أو تخليصٌ أو تأمين.
 *
 * ═══ والخطرُ ليس النقصَ بل الصمت ═══
 *
 * بيتُ التكلفةِ المُنزَلةِ يقرأُ قيمةَ الفاتورةِ والشحنَ **بلا ضربٍ فى سعرِ صرف**.
 * فلو دخلت فاتورةٌ بالدولارِ بأىِّ طريق، لدخلَ الرقمُ الأجنبىُّ إلى مخزونِ
 * الوارد-أوّلاً كأنّه محلّىّ، ومنه إلى تكلفةِ المبيعاتِ ثمّ إلى الربح — **ولم
 * يصرخْ أحد**. ورقمٌ كاذبٌ يُصدَّقُ أسوأُ من خطأٍ ظاهرٍ يُسمَع.
 *
 * فلم تُبْنَ الميزةُ فى هذه الدفعة (العملةُ فى الفاتورة، والجمركُ والتخليصُ
 * والتأمين) — تلك دفعاتٌ تُقاسُ بذاتِها. **بل صارَ الخطأُ الصامتُ مستحيلاً**:
 * مستندٌ بعملةٍ تخالفُ عملةَ الأساسِ يجبُ أن يحملَ سعرَ صرفٍ موجبٍ ومبلغاً
 * مُترجَماً يُطابقُ الأصلَ × السعر — وإلّا رُفض.
 *
 * ═══ ثمّ عُولجَ العمقُ نفسُه فى v3.75.85 ═══
 *
 * وصِدقُ **رأسِ** الفاتورةِ وحدَه لا يكفى. بيتُ التكلفةِ المُنزَلةِ ظلَّ يقرأُ
 * القيمةَ والشحنَ بلا ضربٍ فى سعرِ الصرف، **ورأسٌ صادقٌ وعمقٌ كاذبٌ أخطرُ من
 * كذبٍ ظاهرٍ فى الاثنَين**. فصارَ يسألُ سعرَ الصرفَ ويُترجِمُ كلَّ مخرجٍ له،
 * وقِيسَ قبلَ العلاجِ أنَّ الحسابَ لا يتغيّرُ على الإنتاج: **١٤ زوجاً، صفرٌ منها
 * يتحرّك**، لأنَّ كلَّ الأسعارِ القائمةِ واحدٌ صحيح.
 *
 * ═══ ولماذا حارسٌ لا هجرةٌ فقط ═══
 *
 * لأنَّ المُشغِّلَ يُنزَعُ بسطرٍ واحدٍ فى لوحةِ التحكّم، أو يُنشَأُ جدولُ مالٍ
 * جديدٌ يحملُ عملةً ولا يمرُّ عليه القانون، **ولا يتغيّرُ حرفٌ فى المستودع**.
 * ولا سبيلَ إلّا سؤالُ القاعدةِ الحيّةِ فى كلِّ إصدار.
 *
 * ═══ القوانينُ الستّة ═══
 *
 *   ‏(١) **البيتُ قائمٌ ومحصَّن**: `erp_foreign_money_is_translated` موجودةٌ
 *       بصلاحيّاتٍ كاملةٍ وبمسارِ بحثٍ مضبوط.
 *   ‏(٢) **ويحكمُ بالأثرِ لا بالاسم**: يرفضُ سعرَ صرفٍ غائباً أو غيرَ موجب،
 *       ويرفضُ مبلغاً مُترجَماً غائباً، ويُقابلُ المُترجَمَ بالأصلِ × السعر،
 *       **وسماحُ التقريبِ يُقرَأُ من بيتِ خاناتِ العملةِ لا يُكتَبُ رقماً بيد**.
 *   ‏(٣) **ومُركَّبٌ على كلِّ مستندٍ يستطيعُ أن يُترجِم**: قِيسَ أنّها أربعةٌ —
 *       `bills` · `invoices` · `payments` · `expenses` — بأعمدتِها بأعيانِها.
 *   ‏(٤) **ومن لا يستطيعُ أن يمتثلَ لا يُحاكَمُ بل يُعَدّ**: واحدٌ وعشرون مستنداً
 *       تحملُ عملةً ولا عمودَ ترجمةٍ فيها، **مُثبَّتةٌ بأسمائِها**: لا تزيدُ
 *       صامتةً (مستندُ مالٍ جديدٌ بعملةٍ بلا ترجمة يُرفَض)، ولا تنقصُ صامتةً
 *       (من نالَ عمودَ ترجمةٍ يُنزَلُ من القائمةِ ويُركَّبُ عليه القانون).
 *   ‏(٥) **ولا صفَّ قائمٌ يُخالفُ القانون** — يُقاسُ حيّاً فى كلِّ إصدار.
 *   ‏(٦) **وبيتُ التكلفةِ المُنزَلةِ يسألُ سعرَ الصرف** (v3.75.85): من
 *       `fn_bill_item_landed_unit_cost` تُبنى تكلفةُ وحدةِ الوارد-أوّلاً وتكلفةُ
 *       حركةِ المخزون، ومنهما تكلفةُ المبيعاتِ ثمّ الربح. **بيتٌ واحدٌ لا صيغتان**
 *       · يقرأُ `exchange_rate` · **وسعرٌ غيرُ موجبٍ يُقرَأُ كواحدٍ لا كصفرٍ يمحو
 *       التكلفة** (عطبُ v3.74.702) · والمبلغُ الموزَّعُ مضروبٌ فى السعر ·
 *       **وكلُّ مخرجٍ مُترجَمٌ بما فيه طريقُ الاحتياط**. ثمّ يُقاسُ حيّاً حفظُ
 *       المجموع: تكاليفُ أصنافِ الفاتورةِ تُساوى (القيمة + الشحن) × السعر —
 *       **وهو الوعدُ الذى وُلد له هذا البيتُ منذ v3.74.704**.
 *
 * ═══ وبيتٌ واحدٌ لكلِّ سؤال ═══
 *
 * `erp_currency_is_asked_at_birth` يُجيبُ «ما العملة؟» ويملأُ الفراغَ بعملةِ
 * الأساس. وهذا يُجيبُ «أتُرجِمت؟». سؤالانِ مختلفان، ولا يُنسَخُ أحدُهما فى الآخر.
 * **وقائمةُ المستنداتِ التى تحملُ عملةً تُقرَأُ من وسائطِ ذلك المُشغِّلِ نفسِه**،
 * فلا تُكتَبُ هنا قائمةٌ ثانيةٌ تفترقُ عنه غداً.
 *
 * Usage: node scripts/check-foreign-money-is-translated.js [--require-db] [--selftest]
 * ---------------------------------------------------------------------------
 */
"use strict"
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

/** بيتُ الحكمِ الواحدُ فى القاعدة — ولا يُنادى اسمٌ يسكنُه غيرُه. */
const LAW = "erp_foreign_money_is_translated"

/** بيتُ سؤالِ «ما العملة؟» — منه تُقرَأُ قائمةُ المستنداتِ الحاملةِ لعملة. */
const CURRENCY_HOME = "erp_currency_is_asked_at_birth"

/**
 * **المستنداتُ التى تستطيعُ أن تُترجِمَ بنفسِها** — قِيست يومَ ٢٢ أغسطس ٢٠٢٦:
 * من خمسةٍ وعشرينَ مستنداً يحملُ عملةً، أربعةٌ فقط فيها عمودٌ للمبلغِ المُترجَم.
 * الشكل: الجدول ⇐ [عمودُ العملة، عمودُ السعر، عمودُ المبلغِ المُترجَم، عمودُ الأصل].
 */
const MUST_CARRY_THE_LAW = {
  bills: ["currency_code", "exchange_rate", "base_currency_total", "total_amount"],
  expenses: ["currency_code", "exchange_rate", "base_currency_amount", "amount"],
  invoices: ["currency_code", "exchange_rate", "base_currency_total", "total_amount"],
  payments: ["currency_code", "exchange_rate", "base_currency_amount", "amount"],
}

/**
 * **ومن لا يملكُ أن يمتثلَ لا يُحاكَمُ بل يُعَدّ.** واحدٌ وعشرون مستنداً تحملُ عملةً
 * **ولا عمودَ ترجمةٍ فيها أصلاً**، فلا يُركَّبُ عليها القانونُ اليوم. وأخطرُها
 * الثلاثةُ الأولى: أمرُ الشراءِ يقبلُ عملةً أجنبيّةً بالفعلِ من شاشتِه، وأمرُ
 * البيعِ مثلُه، ومرتجعُ الشراءِ يحملُ سعرَ صرفٍ ولا يحملُ ترجمة.
 *
 * **وهذه هى قائمةُ عملِ دفعةِ الاستيراد**: من نالَ عمودَ ترجمةٍ نزلَ من هنا
 * وصعدَ إلى MUST_CARRY_THE_LAW فى نفسِ الدفعة.
 */
const PINNED_CANNOT_TRANSLATE = [
  "approval_workflows",
  "bank_voucher_requests",
  "booking_payments",
  "bookings",
  "chart_of_accounts",
  "customer_debit_notes",
  "customer_refund_requests",
  "customers",
  "estimates",
  "inventory_write_offs",
  "journal_entries",
  "products",
  "purchase_orders",
  "purchase_requests",
  "purchase_returns",
  "sales_orders",
  "services",
  "shareholder_drawings",
  "suppliers",
  "user_bonuses",
  "vendor_refund_requests",
]

/**
 * **بيتُ التكلفةِ المُنزَلةِ الواحد** — منه تُبنى تكلفةُ وحدةِ الوارد-أوّلاً
 * (`create_fifo_lot_on_purchase`) وتكلفةُ حركةِ المخزون
 * (`fn_set_purchase_movement_landed_cost`)، **ولا صيغةَ ثانيةَ لهما**.
 */
const COST_HOME = "fn_bill_item_landed_unit_cost"

/** عمودُ سعرِ الصرفِ فى الفاتورة، والاسمانِ اللذانِ يحملانِه داخلَ البيت. */
const RATE_COLUMN = "exchange_rate"
const RATE_VAR = "v_rate"
const ALLOC_VAR = "v_allocatable"

// ═══════════════════════════════════════════════════════════════════════════
// الجزءُ الخالصُ من المنطق — يُختبَرُ بلا قرصٍ ولا قاعدة
// ═══════════════════════════════════════════════════════════════════════════

/** **والتعليقُ ليس تعليمة.** يُقنَّعُ تعليقُ SQL قبلَ الحكمِ على جسدِ الدالّة. */
function maskSqlComments(sql) {
  return String(sql || "")
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
}

/**
 * **الحكمُ على الأثرِ لا على الاسم**: أيرفضُ هذا الجسدُ ما وُلد ليرفضَه؟
 * @param {string} def جسدُ الدالّةِ كما هو منشور
 * @returns {string[]} أسبابُ الرفض، وفارغةٌ تعنى سلامةَ الحكم
 */
function judgeTheLaw(def) {
  const body = maskSqlComments(def)
  const problems = []

  if (!/RAISE\s+EXCEPTION/i.test(body)) {
    problems.push(`${LAW} لا ترفعُ استثناءً أصلاً — **وقانونٌ لا يرفضُ ليس قانوناً**.`)
  }
  if (!/erp_company_base_currency\s*\(/i.test(body)) {
    problems.push(
      `${LAW} لا تسألُ بيتَ عملةِ الأساسِ (erp_company_base_currency) — ` +
      "**ولا تُخترَعُ عملةُ أساسٍ بيد**.")
  }
  if (!/erp_currency_decimals\s*\(/i.test(body)) {
    problems.push(
      `${LAW} لا تقرأُ سماحَ التقريبِ من بيتِ خاناتِ العملة (erp_currency_decimals) — ` +
      "**ورقمُ سماحٍ مكتوبٌ بيدٍ يفترقُ عن العملةِ ذاتِ الثلاثِ خانات**.")
  }
  // ولا يمرُّ سعرُ صرفٍ غائبٌ ولا صفرٌ ولا سالب.
  if (!/<=\s*0/.test(body) || !/IS\s+NULL/i.test(body)) {
    problems.push(
      `${LAW} لا ترفضُ سعرَ صرفٍ غائباً أو غيرَ موجب — **وسعرٌ صفرٌ يمحو المالَ كلَّه**.`)
  }
  // ولا يمرُّ مبلغٌ لم يُقابَلْ بالأصلِ × السعر.
  if (!/abs\s*\(/i.test(body)) {
    problems.push(
      `${LAW} لا تُقابلُ المبلغَ المُترجَمَ بالأصلِ × السعر — ` +
      "**وهذا بعينُه العطبُ الصامت: رقمٌ أجنبىٌّ يُكتَبُ كأنّه محلّىّ**.")
  }
  return problems
}

/**
 * **معدودٌ لا مسكوتٌ عنه**: يُقابَلُ المقيسُ بالمُثبَّتِ بالاسمِ لا بالعددِ وحدَه.
 * @returns {{added:string[], gone:string[]}}
 */
function judgeRoster(found, pinned) {
  const f = new Set(found)
  const p = new Set(pinned)
  return {
    added: [...f].filter((x) => !p.has(x)).sort(),
    gone: [...p].filter((x) => !f.has(x)).sort(),
  }
}

/**
 * أتحملُ هذه الجداولُ القانونَ بأعمدتِه بعينِها؟
 * @param {Record<string,string[]>} required الجدول ⇐ الأعمدةُ المنتظَرة
 * @param {Record<string,string[]>} installed الجدول ⇐ الأعمدةُ المُركَّبةُ فعلاً
 * @returns {string[]}
 */
function judgeInstallation(required, installed) {
  const problems = []
  for (const tbl of Object.keys(required).sort()) {
    const want = required[tbl]
    const got = installed[tbl]
    if (!got) {
      problems.push(`${tbl} بلا مُشغِّلِ ${LAW} — **وقانونٌ لا يُركَّبُ ليس قانوناً**.`)
      continue
    }
    if (got.join("|") !== want.join("|")) {
      problems.push(
        `${tbl} يحملُ القانونَ بأعمدةٍ غيرِ المقيسة: (${got.join(", ")}) ` +
        `والمنتظَرُ (${want.join(", ")}) — **وحكمٌ على عمودٍ خطأٍ حكمٌ على لا شىء**.`)
    }
  }
  for (const tbl of Object.keys(installed).sort()) {
    if (!required[tbl]) {
      problems.push(
        `${tbl} رُكِّبَ عليه القانونُ ولم يُعلَنْ فى MUST_CARRY_THE_LAW — ` +
        "**ولا يُوسَّعُ حكمٌ بلا قياس**.")
    }
  }
  return problems
}

/**
 * **وبيتُ التكلفةِ المُنزَلةِ يسألُ سعرَ الصرف** — v3.75.85.
 * يُحكَمُ عليه بأثرِه لا باسمِه: بيتٌ واحدٌ · يقرأُ السعرَ · لا يمحو تكلفةً بسعرٍ
 * غيرِ موجب · يضربُ المبلغَ الموزَّعَ فيه · **ويُترجِمُ كلَّ مخرجٍ له**.
 * @param {string[]} defs أجسادُ كلِّ صيغةٍ منشورةٍ من الدالّة
 * @returns {string[]} أسبابُ الرفض، وفارغةٌ تعنى سلامةَ البيت
 */
function judgeTheCostHome(defs) {
  const problems = []
  const list = (Array.isArray(defs) ? defs : []).filter(Boolean)
  if (list.length === 0) {
    problems.push(
      `${COST_HOME} غائبةٌ من القاعدة — **ومنها تُبنى تكلفةُ المخزونِ والمبيعاتِ كلُّها**.`)
    return problems
  }
  if (list.length > 1) {
    problems.push(
      `${COST_HOME} لها ${list.length} صيغةً منشورة — **وبيتانِ لتكلفةٍ واحدةٍ يفترقانِ يوماً**.`)
  }
  const rate = new RegExp(`\\b${RATE_VAR}\\b`)
  const alloc = new RegExp(`\\b${ALLOC_VAR}\\b`)
  for (const def of list) {
    const body = maskSqlComments(def)
    if (!new RegExp(RATE_COLUMN, "i").test(body)) {
      problems.push(
        `${COST_HOME} لا تقرأُ ${RATE_COLUMN} أصلاً — ` +
        "**فيدخلُ الرقمُ الأجنبىُّ المخزونَ كأنّه محلّىٌّ ولا يصرخُ أحد**.")
      continue
    }
    if (!rate.test(body)) {
      problems.push(`${COST_HOME} لا تحفظُ سعرَ الصرفِ فى ${RATE_VAR} — **ولا يُقاسُ ما لا يُسمّى**.`)
      continue
    }
    if (!/>\s*0\s+THEN/i.test(body) || !/ELSE\s+1\b/i.test(body)) {
      problems.push(
        `${COST_HOME} لا تقرأُ سعراً غيرَ موجبٍ كواحد — ` +
        "**وسعرٌ صفرٌ يمحو التكلفةَ كلَّها، وهو بعينُه عطبُ التكلفةِ الصفريّةِ فى v3.74.702**.")
    }
    const stmt = new RegExp(`SELECT[^;]*?INTO\\s+${ALLOC_VAR}\\b`, "i").exec(body)
    if (!stmt || !rate.test(stmt[0])) {
      problems.push(
        `${COST_HOME}: المبلغُ الموزَّعُ (${ALLOC_VAR}) لا يُضرَبُ فى ${RATE_VAR} — ` +
        "**فيجرى التوزيعُ بعملةِ البائعِ لا بعملةِ الدفتر**.")
    }
    for (const ret of body.match(/RETURN\s+[^;]+/gi) || []) {
      const e = ret.replace(/^RETURN\s+/i, "").trim()
      if (/^(NULL|NEW|OLD|QUERY)\b/i.test(e)) continue
      if (rate.test(e) || alloc.test(e)) continue
      problems.push(
        `${COST_HOME}: مخرجٌ غيرُ مُترجَمٍ «${e.replace(/\s+/g, " ").slice(0, 60)}» — ` +
        "**وطريقُ الاحتياطِ إن لم يُترجَمْ صارَ بابَ الكذبِ الوحيدَ الباقى**.")
    }
  }
  return problems
}

// **ولا يُنسَخُ حكمٌ ليُقاسَ به**: من استوردَ هذا الملفَّ أخذَ دوالَّ الحارسِ عينَها.
if (require.main !== module) {
  module.exports = {
    LAW, CURRENCY_HOME, MUST_CARRY_THE_LAW, PINNED_CANNOT_TRANSLATE,
    COST_HOME, RATE_COLUMN, RATE_VAR, ALLOC_VAR,
    maskSqlComments, judgeTheLaw, judgeRoster, judgeInstallation, judgeTheCostHome,
  }
  return
}

// ═══════════════════════════════════════════════════════════════════════════
// الفخُّ الذاتىّ — **وحارسٌ لا يُرى وهو يرفض ليس حارساً**
// ═══════════════════════════════════════════════════════════════════════════
if (process.argv.includes("--selftest")) {
  const cases = []
  const t = (name, got, exp) => cases.push([name, JSON.stringify(got), JSON.stringify(exp)])

  const GOOD = `
    BEGIN
      v_home := public.erp_company_base_currency(x);
      IF v_rate IS NULL OR v_rate <= 0 THEN RAISE EXCEPTION 'no rate'; END IF;
      v_tol := 0.5 / power(10::numeric, public.erp_currency_decimals(v_home));
      IF abs(v_base - v_amt * v_rate) > v_tol THEN RAISE EXCEPTION 'mismatch'; END IF;
      RETURN NEW;
    END`

  t("يُبرِّئُ قانوناً يسألُ البيوتَ ويرفضُ ما وُلد له", judgeTheLaw(GOOD).length, 0)
  t("ويرفضُ قانوناً لا يرفعُ استثناءً — ولا زينةَ على بابٍ لا يُغلَق",
    judgeTheLaw(GOOD.replace(/RAISE EXCEPTION/g, "-- was")).length > 0, true)
  t("ويرفضُ من يخترعُ عملةَ الأساسِ بيدِه",
    judgeTheLaw(GOOD.replace("public.erp_company_base_currency(x)", "'EGP'")).length > 0, true)
  t("ويرفضُ سماحَ تقريبٍ مكتوباً بيد",
    judgeTheLaw(GOOD.replace("public.erp_currency_decimals(v_home)", "2")).length > 0, true)
  t("ويرفضُ من لا يمنعُ سعرَ صرفٍ غيرَ موجب",
    judgeTheLaw(GOOD.replace("v_rate <= 0", "false")).length > 0, true)
  t("ويرفضُ من لا يُقابلُ المُترجَمَ بالأصلِ × السعر",
    judgeTheLaw(GOOD.replace("abs(", "noop(")).length > 0, true)
  t("ولا يخدعُه القانونُ مكتوباً فى تعليقٍ — والتعليقُ ليس تعليمة",
    judgeTheLaw("-- RAISE EXCEPTION\n-- abs( ) erp_company_base_currency( erp_currency_decimals(").length > 0, true)
  t("ولا فى تعليقٍ كتلىّ",
    judgeTheLaw("/* RAISE EXCEPTION abs( erp_company_base_currency( erp_currency_decimals( */").length > 0, true)
  t("ويُسمّى كلَّ سببٍ على حِدَة",
    judgeTheLaw("BEGIN RETURN NEW; END").length, 5)

  // ── تركيبُ القانون ───────────────────────────────────────────────────────
  const REQ = { bills: ["a", "b", "c", "d"], invoices: ["a", "b", "c", "d"] }
  t("يمرُّ حين رُكِّبَ على الجميعِ بأعمدتِه",
    judgeInstallation(REQ, { bills: ["a", "b", "c", "d"], invoices: ["a", "b", "c", "d"] }).length, 0)
  t("ويمسكُ جدولاً نُزعَ عنه القانون",
    judgeInstallation(REQ, { bills: ["a", "b", "c", "d"] }).length, 1)
  t("ويمسكُ عموداً بُدِّلَ فى الوسائط — وحكمٌ على عمودٍ خطأٍ حكمٌ على لا شىء",
    judgeInstallation(REQ, { bills: ["a", "b", "c", "z"], invoices: ["a", "b", "c", "d"] }).length, 1)
  t("ويمسكُ ترتيباً مقلوباً فى الوسائط",
    judgeInstallation(REQ, { bills: ["b", "a", "c", "d"], invoices: ["a", "b", "c", "d"] }).length, 1)
  t("ويمسكُ توسيعاً لم يُقَسْ",
    judgeInstallation(REQ, { bills: ["a", "b", "c", "d"], invoices: ["a", "b", "c", "d"], zz: ["a"] }).length, 1)
  t("ويرفضُ الجميعَ حين لا تركيبَ أصلاً — وبحثٌ لا يجدُ ليس دليلَ سلامة",
    judgeInstallation(REQ, {}).length, 2)

  // ── السجلُّ المُثبَّت ─────────────────────────────────────────────────────
  t("سجلٌّ يُطابقُ نفسَه", judgeRoster(["a", "b"], ["a", "b"]), { added: [], gone: [] })
  t("ويمسكُ مستندَ مالٍ جديداً بعملةٍ بلا ترجمة",
    judgeRoster(["a", "b", "c"], ["a", "b"]).added, ["c"])
  t("ويمسكُ مستنداً نالَ الترجمةَ ولم يُنزَلْ من القائمة",
    judgeRoster(["a"], ["a", "b"]).gone, ["b"])
  t("ولا يخدعُه ترتيبٌ مختلف", judgeRoster(["b", "a"], ["a", "b"]), { added: [], gone: [] })
  t("والمُثبَّتُ واحدٌ وعشرون اسماً كما قِيست", PINNED_CANNOT_TRANSLATE.length, 21)
  t("ولا اسمَ مُكرَّرٌ فى المُثبَّت",
    new Set(PINNED_CANNOT_TRANSLATE).size, PINNED_CANNOT_TRANSLATE.length)
  t("ولا اسمَ يجمعُ بين القائمتَين — وحكمانِ على حالةٍ واحدةٍ بيتان",
    PINNED_CANNOT_TRANSLATE.filter((x) => MUST_CARRY_THE_LAW[x]).length, 0)
  t("والأربعةُ الحاملةُ للقانونِ لكلٍّ أربعةُ أعمدة",
    Object.values(MUST_CARRY_THE_LAW).every((c) => c.length === 4), true)

  // ── (٦) بيتُ التكلفةِ المُنزَلة ───────────────────────────────────────────
  const GOOD_COST = `
    DECLARE v_rate numeric; v_allocatable numeric;
    BEGIN
      SELECT CASE WHEN COALESCE(b.exchange_rate, 1) > 0 THEN COALESCE(b.exchange_rate, 1) ELSE 1 END
        INTO v_rate FROM bills b WHERE b.id = p_bill_id;
      SELECT (COALESCE(b.subtotal,0) + COALESCE(b.shipping,0)) * v_rate
        INTO v_allocatable FROM bills b WHERE b.id = p_bill_id;
      IF v_qty IS NULL THEN RETURN NULL; END IF;
      IF v_base <= 0 THEN RETURN COALESCE(v_unit_price,0) * COALESCE(v_rate,1); END IF;
      RETURN ROUND((v_allocatable * (v_line_net / v_base)) / v_qty, 6);
    END`

  t("يُبرِّئُ بيتَ تكلفةٍ يسألُ السعرَ ويُترجِمُ كلَّ مخرجٍ له",
    judgeTheCostHome([GOOD_COST]).length, 0)
  t("ويرفضُ غيابَ بيتِ التكلفةِ كلِّه — ومنه تُبنى تكلفةُ المخزونِ كلُّها",
    judgeTheCostHome([]).length, 1)
  t("ويرفضُ صيغتَين لتكلفةٍ واحدة — وبيتانِ يفترقانِ يوماً",
    judgeTheCostHome([GOOD_COST, GOOD_COST]).length > 0, true)
  t("ويرفضُ من لا يقرأُ سعرَ الصرفِ أصلاً",
    judgeTheCostHome([GOOD_COST.replace(/exchange_rate/g, "subtotal")]).length > 0, true)
  t("ويرفضُ من يقرأُ سعراً غيرَ موجبٍ كما هو — وسعرٌ صفرٌ يمحو التكلفة",
    judgeTheCostHome([GOOD_COST.replace("ELSE 1 END", "ELSE 0 END")]).length > 0, true)
  t("ويرفضُ توزيعاً بلا ضربٍ فى السعر — توزيعٌ بعملةِ البائع",
    judgeTheCostHome([GOOD_COST.replace(
      "(COALESCE(b.subtotal,0) + COALESCE(b.shipping,0)) * v_rate",
      "(COALESCE(b.subtotal,0) + COALESCE(b.shipping,0))")]).length, 1)
  t("ويرفضُ طريقَ احتياطٍ غيرَ مُترجَم — وهو بابُ الكذبِ الأخير",
    judgeTheCostHome([GOOD_COST.replace(
      "COALESCE(v_unit_price,0) * COALESCE(v_rate,1)", "COALESCE(v_unit_price,0)")]).length, 1)
  t("ولا يُخطِّئُ مخرجاً فارغاً — ولا تُترجَمُ لا-قيمة",
    judgeTheCostHome([GOOD_COST + "\n RETURN NULL;"]).length, 0)
  t("ولا يخدعُه سعرٌ مكتوبٌ فى تعليق — والتعليقُ ليس تعليمة",
    judgeTheCostHome(["-- exchange_rate v_rate > 0 THEN ELSE 1 v_allocatable"]).length > 0, true)
  t("ويُسمّى بيتَ التكلفةِ فى كلِّ سببٍ يرفعُه",
    judgeTheCostHome(["BEGIN RETURN 1; END"]).every((p) => p.includes(COST_HOME)), true)

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
const url = process.env.FX_TRANSLATED_DB_URL || process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "no database URL - cannot measure whether foreign money is actually translated."
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

    // ── (١) البيتُ قائمٌ ومحصَّن · (٢) ويحكمُ بالأثر ───────────────────────
    const { rows: lawRows } = await client.query(
      `SELECT pg_get_functiondef(p.oid) AS def, p.prosecdef,
              array_to_string(COALESCE(p.proconfig, ARRAY[]::text[]), ',') AS cfg
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = $1`, [LAW])
    if (lawRows.length === 0) {
      problems.push(`${LAW} غائبةٌ من القاعدة — **ولا يُسجَّلُ مالٌ بعملةٍ لم تُترجَم، فمن يمنعُه؟**`)
    } else {
      const r = lawRows[0]
      if (!r.prosecdef) {
        problems.push(`${LAW} ليست بصلاحيّاتٍ كاملة — فقد لا تقرأُ عملةَ الأساسِ لكلِّ مُنادٍ.`)
      }
      if (!/search_path=/.test(r.cfg)) {
        problems.push(`${LAW} بلا مسارِ بحثٍ مضبوط — **وبابٌ بصلاحيّاتٍ كاملةٍ بلا مسارٍ يُزوَّرُ اسمُه**.`)
      }
      problems.push(...judgeTheLaw(r.def))
      notes.push(`  بيتُ الحكم: بصلاحيّاتٍ كاملة=${r.prosecdef ? "نعم" : "لا"} · مسارُ بحثٍ مضبوط=${/search_path=/.test(r.cfg) ? "نعم" : "لا"}`)
    }

    // ── (٣) ومُركَّبٌ على كلِّ مستندٍ يستطيعُ أن يُترجِم ────────────────────
    const { rows: trg } = await client.query(
      `SELECT c.relname AS tbl,
              replace(encode(t.tgargs, 'escape'), '\\000', ' ') AS args,
              (t.tgtype & 4) > 0 AS on_ins, (t.tgtype & 16) > 0 AS on_upd
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE NOT t.tgisinternal AND n.nspname = 'public' AND p.proname = $1`, [LAW])
    const installed = {}
    for (const row of trg) {
      installed[row.tbl] = String(row.args || "").trim().split(/\s+/).filter(Boolean)
      if (!row.on_ins || !row.on_upd) {
        problems.push(
          `${row.tbl}: القانونُ لا يعملُ على ${!row.on_ins ? "الإنشاء" : "التعديل"} — ` +
          "**وبابٌ يُحرَسُ عندَ الدخولِ ويُترَكُ عندَ التبديلِ ليس محروساً**.")
      }
    }
    problems.push(...judgeInstallation(MUST_CARRY_THE_LAW, installed))

    // ── (٤) ومن لا يستطيعُ أن يمتثلَ يُعَدُّ بالاسم ────────────────────────
    // وقائمةُ حاملى العملةِ تُقرَأُ من بيتِها الواحد، لا من قائمةٍ مكتوبةٍ هنا.
    const { rows: ccyTables } = await client.query(
      `SELECT DISTINCT c.relname AS tbl
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE NOT t.tgisinternal AND n.nspname = 'public' AND p.proname = $1`, [CURRENCY_HOME])
    if (ccyTables.length === 0) {
      problems.push(
        `${CURRENCY_HOME} لا مُشغِّلَ له على جدولٍ واحد — **وبحثٌ لا يجدُ ليس دليلَ سلامة**.`)
    }
    const carriers = ccyTables.map((x) => x.tbl)
    const cannot = carriers.filter((x) => !MUST_CARRY_THE_LAW[x]).sort()
    const roster = judgeRoster(cannot, PINNED_CANNOT_TRANSLATE)
    for (const nm of roster.added) {
      problems.push(
        `${nm} يحملُ عملةً ولا عمودَ ترجمةٍ فيه، **ولم يكنْ فى الدَّينِ المُثبَّت** — ` +
        "فإمّا أن يُعطى عمودَ مبلغٍ مُترجَمٍ ويُركَّبَ عليه القانون، وإمّا أن يُثبَّتَ بالاسم.")
    }
    for (const nm of roster.gone) {
      problems.push(
        `${nm} مُثبَّتٌ أنّه لا يستطيعُ الترجمةَ وقد خرجَ من القائمةِ الحيّة — ` +
        "**والتاريخُ لا يُجمَّل**: يُحدَّثُ PINNED_CANNOT_TRANSLATE فى نفسِ الدفعة.")
    }

    // ── (٥) ولا صفَّ قائمٌ يُخالفُ القانون ─────────────────────────────────
    let violators = 0
    for (const tbl of Object.keys(MUST_CARRY_THE_LAW).sort()) {
      const [ccy, rate, base, amt] = MUST_CARRY_THE_LAW[tbl]
      const { rows } = await client.query(
        `SELECT count(*)::int AS n
           FROM public.${tbl} t JOIN public.companies co ON co.id = t.company_id
          WHERE COALESCE(NULLIF(btrim(t.${ccy}), ''), '') <> ''
            AND upper(btrim(t.${ccy})) <> upper(COALESCE(co.base_currency, ''))
            AND COALESCE(t.${amt}, 0) <> 0
            AND ( t.${rate} IS NULL OR t.${rate} <= 0 OR t.${base} IS NULL
                  OR abs(t.${base} - (t.${amt} * t.${rate}))
                     > (0.5 / power(10::numeric, public.erp_currency_decimals(co.base_currency)) + 1e-9) )`)
      if (rows[0].n > 0) {
        violators += rows[0].n
        problems.push(
          `${tbl}: ${rows[0].n} صفّاً بعملةٍ أجنبيّةٍ لم تُترجَم — **والقانونُ لا يُطبَّقُ بأثرٍ رجعىٍّ وحدَه، بل يُقاسُ الأثرُ القائم**.`)
      }
    }

    // ── (٦) وبيتُ التكلفةِ المُنزَلةِ يسألُ سعرَ الصرف ──────────────────────
    const { rows: costRows } = await client.query(
      `SELECT pg_get_functiondef(p.oid) AS def, p.prosecdef,
              array_to_string(COALESCE(p.proconfig, ARRAY[]::text[]), ',') AS cfg
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = $1`, [COST_HOME])
    problems.push(...judgeTheCostHome(costRows.map((r) => r.def)))
    for (const r of costRows) {
      if (!r.prosecdef) {
        problems.push(`${COST_HOME} ليست بصلاحيّاتٍ كاملة — فقد لا تقرأُ الفاتورةَ لكلِّ مُنادٍ.`)
      }
      if (!/search_path=/.test(r.cfg)) {
        problems.push(`${COST_HOME} بلا مسارِ بحثٍ مضبوط — **وبابٌ بصلاحيّاتٍ كاملةٍ بلا مسارٍ يُزوَّرُ اسمُه**.`)
      }
    }

    // **وحفظُ المجموعِ يُقاسُ لا يُوعَدُ به**: تكاليفُ الأصنافِ = (القيمة + الشحن) × السعر.
    // ولا يُحاكَمُ إلّا ما له سعرٌ صالحٌ منشور، فسياسةُ السعرِ غيرِ الموجبِ بيتُها
    // الدالّةُ نفسُها ولا تُنسَخُ هنا لتفترقَ عنها غداً.
    const { rows: cons } = await client.query(
      `WITH s AS (
         SELECT b.id,
                (COALESCE(b.subtotal, 0) + COALESCE(b.shipping, 0)) * b.exchange_rate AS allocatable,
                SUM(public.${COST_HOME}(bi.bill_id, bi.product_id) * bi.quantity) AS lots
           FROM public.bills b JOIN public.bill_items bi ON bi.bill_id = b.id
          WHERE b.exchange_rate IS NOT NULL AND b.exchange_rate > 0
          GROUP BY b.id, b.subtotal, b.shipping, b.exchange_rate)
       SELECT count(*)::int AS bills,
              count(*) FILTER (WHERE lots IS NULL)::int AS blind,
              count(*) FILTER (WHERE allocatable > 0 AND abs(lots - allocatable) > 0.01)::int AS off,
              COALESCE(max(abs(lots - allocatable)), 0)::text AS worst
         FROM s`)
    const cn = cons[0] || { bills: 0, blind: 0, off: 0, worst: "0" }
    if (cn.off > 0) {
      problems.push(
        `${cn.off} فاتورةً مجموعُ تكاليفِ أصنافِها لا يُساوى (القيمة + الشحن) × سعرَ الصرف ` +
        `(أسوأُ فرقٍ ${cn.worst}) — **فإمّا أنَّ الترجمةَ سقطت وإمّا أنَّ التوزيعَ لم يعدْ يحفظُ المجموع**.`)
    }
    notes.push(`  بيتُ التكلفةِ المُنزَلة: صيغةٌ منشورة=${costRows.length} · فواتيرُ حُوسبت=${cn.bills} · بلا تكلفة=${cn.blind} · تُخالفُ حفظَ المجموع=${cn.off} (المطلوبُ صفر) · أسوأُ فرق=${cn.worst}`)

    notes.push(`  مستنداتٌ تحملُ عملة: ${carriers.length} · تحملُ القانون: ${Object.keys(installed).length} · لا تستطيعُ الترجمة: ${cannot.length} (المُثبَّت ${PINNED_CANNOT_TRANSLATE.length})`)
    notes.push(`  صفوفٌ قائمةٌ تُخالفُ القانون: ${violators} (المطلوبُ صفر)`)
  }, { onAttempt: () => { problems.length = 0; notes.length = 0 } })

  if (problems.length > 0) {
    console.error(`X مالٌ بعملةٍ لم تُترجَم (${problems.length}):`)
    for (const p of problems) console.error(`  - ${p}`)
    console.error("  انظر supabase/migrations/20260822000032_v3_75_84_no_money_is_recorded_in_a_currency_that_was_not_translated.sql")
    console.error("  و supabase/migrations/20260822000034_v3_75_85_the_cost_is_measured_in_the_ledgers_currency_not_the_sellers.sql")
    process.exit(1)
  }

  for (const n of notes) console.log(n)
  console.log(
    "+ ولا يُسجَّلُ مالٌ بعملةٍ لم تُترجَم: الحكمُ فى بيتٍ واحدٍ يسألُ عملةَ الأساسِ وخاناتِها " +
    "ولا يخترعُ رقماً · ومُركَّبٌ على المستنداتِ الأربعةِ التى تستطيعُ الترجمةَ إنشاءً وتعديلاً · " +
    "ومن لا يستطيعُ معدودٌ بالاسمِ لا مسكوتٌ عنه · ولا صفَّ قائمٌ يُخالفُه · " +
    "**وبيتُ التكلفةِ المُنزَلةِ يسألُ سعرَ الصرفِ ويُترجِمُ كلَّ مخرجٍ له، وحفظُ المجموعِ مقيسٌ لا موعود**.")
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })

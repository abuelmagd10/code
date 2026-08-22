#!/usr/bin/env node
/**
 * check-foreign-money-is-translated.js
 * ---------------------------------------------------------------------------
 * v3.75.84 — **ولا يُسجَّلُ مالٌ بعملةٍ لم تُترجَم.**
 * v3.75.85 — **وتكلفةُ الصنفِ تُقاسُ بعملةِ الدفترِ لا بعملةِ البائع.**
 * v3.75.86 — **ولا يُقيَّدُ فى الدفترِ رقمٌ بعملةِ البائع.**
 * v3.75.87 — **وتُولَدُ الترجمةُ مع المال.**
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
 * ═══ القوانينُ الثمانية ═══
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
 *   ‏(٧) **ولا يُقيَّدُ فى الدفترِ رقمٌ بعملةِ البائع** (v3.75.86): صِدقُ التكلفةِ
 *       لا يكفى إن كذبَ القيد. `post_bill_receipt_atomic` هو البابُ الذى يكتبُ
 *       قيدَ فاتورةِ الشراءِ وحركةَ مخزونِها، فيجبُ أن **يقرأَ سعرَ الفاتورةِ
 *       ويسألَ بيتَ عملةِ الأساس**، وأن **يضربَ سطورَ القيدَ فيه**، وأن **يحفظَ
 *       الأصلَ بعملةِ البائع** (`original_debit` · `original_credit` ·
 *       `original_currency` · `exchange_rate_used`) — **فرقمٌ مُترجَمٌ بلا أصلٍ
 *       محفوظٍ لا يُراجَع**. و`fn_set_purchase_movement_landed_cost` مثلُه فى
 *       حركةِ المخزون. ثمّ يُقاسُ حيّاً: **لا قيدَ لفاتورةٍ أجنبيّةٍ بلا عملتِها**،
 *       **ولا قيدٌ مُترجَمٌ يخالفُ أصلَه × سعرَه**، **ولا حركةُ شراءٍ جديدةٌ بلا
 *       عملتِها** فوقَ الدَّينِ القديمِ المُثبَّت.
 *   ‏(٨) **وتُولَدُ الترجمةُ مع المال** (v3.75.87): قِيسَ أنَّ **ثلاثةَ مواضعَ فى
 *       الشيفرةِ تضربُ بيدِها** وفاتورةُ الشراءِ لا موضعَ لها، فصارَ الملءُ بيتاً
 *       واحداً فى القاعدة: `erp_foreign_money_is_translated_at_birth` يملأُ
 *       الفراغَ من سعرِ المستندِ نفسِه مُقرَّباً بخاناتِ عملةِ الأساس. **وثلاثةٌ
 *       لا يفعلُها عمداً**: لا يلمسُ عملةَ الأساس · **ولا يخترعُ سعراً لينجىَ
 *       صفّاً** (فيُترَكُ ليرفضَه القاضى) · **ولا يُصحِّحُ رقماً كتبَه المُنادى**
 *       (وحارسٌ يُصلحُ ما يُحاكِمُه لا يُمسكُ أحداً). **والترتيبُ نفسُه قانون**:
 *       يقعُ بينَ بيتِ العملةِ وبيتِ الحكم — **ويُقاسُ من القاعدةِ لا يُفترَض**.
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

/** بابُ ترحيلِ فاتورةِ الشراءِ الواحد — منه يُكتَبُ القيدُ وحركةُ المخزون. */
const POSTING_DOOR = "post_bill_receipt_atomic"

/** بيتُ تكلفةِ حركةِ الشراء — يُترجِمُ منذ v3.75.85 ويحفظُ الأصلَ منذ v3.75.86. */
const MOVEMENT_HOME = "fn_set_purchase_movement_landed_cost"

/**
 * **حركاتُ شراءٍ وُلدت قبلَ أن يُسأَلَ السؤال** — قِيست يومَ ٢٢ أغسطس ٢٠٢٦:
 * ثلاثَ عشرةَ حركةَ شراءٍ بلا عملةٍ أصليّة، أحدثُها ٣١ يوليو ٢٠٢٦. **لا تنمو**:
 * كلُّ حركةِ شراءٍ جديدةٍ تحملُ عملتَها وسعرَها من فاتورتِها.
 */
const PINNED_LEGACY_PURCHASE_MOVES = 13

/** بيتُ ملءِ الترجمةِ عندَ الميلاد — يقعُ بينَ بيتِ العملةِ وبيتِ الحكم. */
const BIRTH_FILL = "erp_foreign_money_is_translated_at_birth"

/** أسماءُ المُشغِّلاتِ الثلاثةِ على المستندِ الواحد، **بترتيبِها الواجب**. */
const TRIGGER_ORDER = [
  "ab_currency_asked_at_birth",
  "abb_foreign_money_is_translated_at_birth",
  "ac_foreign_money_is_translated",
]

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

/**
 * **ولا يُقيَّدُ فى الدفترِ رقمٌ بعملةِ البائع** — v3.75.86.
 * @param {string[]} defs أجسادُ كلِّ صيغةٍ منشورةٍ من بابِ الترحيل
 * @returns {string[]}
 */
function judgeThePostingDoor(defs) {
  const problems = []
  const list = (Array.isArray(defs) ? defs : []).filter(Boolean)
  if (list.length === 0) {
    problems.push(`${POSTING_DOOR} غائبٌ من القاعدة — **ومنه يُكتَبُ قيدُ كلِّ فاتورةِ شراء**.`)
    return problems
  }
  if (list.length > 1) {
    problems.push(
      `${POSTING_DOOR} له ${list.length} صيغةً منشورة — **وبابانِ لقيدٍ واحدٍ يفترقانِ يوماً**.`)
  }
  for (const def of list) {
    const body = maskSqlComments(def)
    // **والاسمُ المركَّبُ ليس الاسم**: `exchange_rate_used` عمودُ حفظٍ لا قراءةُ سعر.
    if (!new RegExp(`\\b${RATE_COLUMN}\\b`, "i").test(body)) {
      problems.push(
        `${POSTING_DOOR} لا يقرأُ ${RATE_COLUMN} من الفاتورة — ` +
        "**فيدخلُ رقمُ البائعِ الدفترَ كأنّه بعملةِ الأساسِ ولا يصرخُ أحد**.")
      continue
    }
    if (!/FROM\s+public\.bills\b/i.test(body)) {
      problems.push(
        `${POSTING_DOOR} لا يقرأُ الفاتورةَ نفسَها — **ولا يُؤخَذُ سعرُ الصرفِ ممّا يُرسِلُه المُنادى**.`)
    }
    if (!/erp_company_base_currency\s*\(/i.test(body)) {
      problems.push(
        `${POSTING_DOOR} لا يسألُ بيتَ عملةِ الأساس — **ولا تُخترَعُ عملةُ أساسٍ بيد**.`)
    }
    if (!new RegExp(`\\*\\s*${RATE_VAR}\\b`).test(body)) {
      problems.push(
        `${POSTING_DOOR} لا يضربُ سطورَ القيدِ فى ${RATE_VAR} — **فالقيدُ بعملةِ البائع**.`)
    }
    for (const col of ["original_debit", "original_credit", "original_currency", "exchange_rate_used"]) {
      if (!new RegExp(`\\b${col}\\b`).test(body)) {
        problems.push(
          `${POSTING_DOOR} لا يحفظُ ${col} — **ورقمٌ مُترجَمٌ بلا أصلٍ محفوظٍ لا يُراجَعُ أبداً**.`)
      }
    }
  }
  return problems
}

/**
 * **وحركةُ المخزونِ تحفظُ أصلَها كما تحفظُ المُترجَم** — v3.75.86.
 * @param {string[]} defs
 * @returns {string[]}
 */
function judgeTheMovementHome(defs) {
  const problems = []
  const list = (Array.isArray(defs) ? defs : []).filter(Boolean)
  if (list.length === 0) {
    problems.push(`${MOVEMENT_HOME} غائبٌ من القاعدة — **ومنه تُسعَّرُ حركةُ الشراء**.`)
    return problems
  }
  if (list.length > 1) {
    problems.push(`${MOVEMENT_HOME} له ${list.length} صيغةً منشورة — **وبيتانِ يفترقانِ يوماً**.`)
  }
  for (const def of list) {
    const body = maskSqlComments(def)
    if (!new RegExp(`${COST_HOME}\\s*\\(`).test(body)) {
      problems.push(
        `${MOVEMENT_HOME} لا ينادى ${COST_HOME} — **فصارت للتكلفةِ صيغةٌ ثانية**.`)
      continue
    }
    for (const col of ["original_unit_cost", "original_currency", "exchange_rate_used"]) {
      if (!new RegExp(`\\b${col}\\b`).test(body)) {
        problems.push(
          `${MOVEMENT_HOME} لا يحفظُ ${col} — **فلا يُعرَفُ بكم اشترينا بعملةِ البائع**.`)
      }
    }
  }
  return problems
}

/**
 * **وتُولَدُ الترجمةُ مع المال** — v3.75.87.
 * @param {string[]} defs أجسادُ كلِّ صيغةٍ منشورةٍ من بيتِ الملء
 * @returns {string[]}
 */
function judgeTheBirthFill(defs) {
  const problems = []
  const list = (Array.isArray(defs) ? defs : []).filter(Boolean)
  if (list.length === 0) {
    problems.push(
      `${BIRTH_FILL} غائبٌ من القاعدة — **فيُولَدُ المالُ الأجنبىُّ بلا ترجمةٍ ويُرفَض**.`)
    return problems
  }
  if (list.length > 1) {
    problems.push(`${BIRTH_FILL} له ${list.length} صيغةً منشورة — **وبيتانِ للملءِ يفترقانِ يوماً**.`)
  }
  for (const def of list) {
    const body = maskSqlComments(def)
    if (!/erp_company_base_currency\s*\(/i.test(body)) {
      problems.push(`${BIRTH_FILL} لا يسألُ بيتَ عملةِ الأساس — **ولا تُخترَعُ عملةُ أساسٍ بيد**.`)
    }
    if (!/erp_currency_decimals\s*\(/i.test(body)) {
      problems.push(
        `${BIRTH_FILL} لا يقرأُ خاناتِ العملةِ من بيتِها — ` +
        "**وتقريبٌ بيدٍ يقعُ خارجَ سماحِ القاضى فيرفضُ ما ملأَه أخوه**.")
    }
    // **ولا يخترعُ سعراً لينجىَ صفّاً**.
    if (!/<=\s*0/.test(body)) {
      problems.push(
        `${BIRTH_FILL} لا يمتنعُ عن سعرٍ غيرِ موجب — ` +
        "**وبابٌ يُفتَحُ بسعرٍ مُخترَعٍ أسوأُ من بابٍ مُقفَل**.")
    }
    // **ولا يُصحِّحُ قولَ المُنادى صامتاً**: مبلغٌ مكتوبٌ يخرجُ كما دخل.
    if (!/IS\s+NOT\s+NULL[\s\S]{0,120}RETURN\s+NEW/i.test(body)) {
      problems.push(
        `${BIRTH_FILL} لا يترُكُ المبلغَ المكتوبَ كما هو — ` +
        "**وحارسٌ يُصلحُ ما يُحاكِمُه لا يُمسكُ أحداً أبداً**.")
    }
    // ولا يلمسُ عملةَ الأساس.
    if (!/v_ccy\s*=\s*v_home/.test(body)) {
      problems.push(
        `${BIRTH_FILL} لا يستثنى مستندَ عملةِ الأساس — **ولا تُترجَمُ عملةٌ إلى نفسِها**.`)
    }
  }
  return problems
}

/**
 * **والترتيبُ نفسُه قانون**: يُملأُ الفراغُ بعدَ أن تُعرَفَ العملةُ وقبلَ أن يُحكَم.
 * @param {string[]} names أسماءُ مُشغِّلاتِ المستندِ كما هى فى القاعدة
 * @param {string} tbl اسمُ الجدولِ للرسالة
 * @returns {string[]}
 */
function judgeTriggerOrder(names, tbl) {
  const problems = []
  const present = TRIGGER_ORDER.filter((n) => (names || []).includes(n))
  for (const want of TRIGGER_ORDER) {
    if (!present.includes(want)) {
      problems.push(`${tbl}: المُشغِّلُ ${want} غائب — **وحلقةٌ ناقصةٌ تكسرُ السلسلةَ كلَّها**.`)
    }
  }
  if (present.length === TRIGGER_ORDER.length) {
    const sorted = [...present].sort()
    if (sorted.join("|") !== TRIGGER_ORDER.join("|")) {
      problems.push(
        `${tbl}: ترتيبُ المُشغِّلاتِ ${sorted.join(" ثمّ ")} وليس ` +
        `${TRIGGER_ORDER.join(" ثمّ ")} — **ومَن يحكمُ قبلَ أن يُملأَ الفراغُ يرفضُ البرىء**.`)
    }
  }
  return problems
}

// **ولا يُنسَخُ حكمٌ ليُقاسَ به**: من استوردَ هذا الملفَّ أخذَ دوالَّ الحارسِ عينَها.
if (require.main !== module) {
  module.exports = {
    LAW, CURRENCY_HOME, MUST_CARRY_THE_LAW, PINNED_CANNOT_TRANSLATE,
    COST_HOME, RATE_COLUMN, RATE_VAR, ALLOC_VAR,
    POSTING_DOOR, MOVEMENT_HOME, PINNED_LEGACY_PURCHASE_MOVES, BIRTH_FILL, TRIGGER_ORDER,
    maskSqlComments, judgeTheLaw, judgeRoster, judgeInstallation, judgeTheCostHome,
    judgeThePostingDoor, judgeTheMovementHome, judgeTheBirthFill, judgeTriggerOrder,
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

  // ── (٧) بابُ الترحيلِ وبيتُ حركةِ المخزون ────────────────────────────────
  const GOOD_DOOR = `
    DECLARE v_rate numeric; v_ccy text; v_home text;
    BEGIN
      SELECT b.currency_code, b.exchange_rate INTO v_ccy, v_rate FROM public.bills b WHERE b.id = p_bill_id;
      v_home := public.erp_company_base_currency(p_company_id);
      INSERT INTO journal_entry_lines (debit_amount, credit_amount, original_debit, original_credit,
                                       original_currency, exchange_rate_used)
      SELECT ROUND(x.d * v_rate, 4), ROUND(x.c * v_rate, 4), x.d, x.c, v_ccy, v_rate FROM src x;
    END`

  const GOOD_MOVE = `
    BEGIN
      v_cost := public.fn_bill_item_landed_unit_cost(NEW.reference_id, NEW.product_id);
      NEW.unit_cost := v_cost;
      NEW.original_currency := v_ccy;
      NEW.exchange_rate_used := v_rate;
      NEW.original_unit_cost := ROUND(v_cost / v_rate, 6);
    END`

  t("يُبرِّئُ باباً يقرأُ السعرَ ويضربُ ويحفظُ الأصل", judgeThePostingDoor([GOOD_DOOR]).length, 0)
  t("ويرفضُ غيابَ بابِ الترحيلِ كلِّه", judgeThePostingDoor([]).length, 1)
  t("ويرفضُ بابَين لقيدٍ واحد", judgeThePostingDoor([GOOD_DOOR, GOOD_DOOR]).length > 0, true)
  t("ويرفضُ باباً لا يذكرُ عمودَ سعرِ الصرفِ أصلاً",
    judgeThePostingDoor([GOOD_DOOR.replace(/exchange_rate,/g, "subtotal,").replace(/b\.exchange_rate/g, "b.subtotal")]).length > 0, true)
  t("ويرفضُ باباً لا يسألُ بيتَ عملةِ الأساس",
    judgeThePostingDoor([GOOD_DOOR.replace("public.erp_company_base_currency(p_company_id)", "'EGP'")]).length, 1)
  t("ويرفضُ باباً لا يقرأُ الفاتورةَ نفسَها — ولا يُؤخَذُ السعرُ ممّا يُرسِلُه المُنادى",
    judgeThePostingDoor([GOOD_DOOR.replace("FROM public.bills b", "FROM nothing n")]).length, 1)
  t("ويرفضُ باباً لا يضربُ السطورَ فى السعر — فالقيدُ بعملةِ البائع",
    judgeThePostingDoor([GOOD_DOOR.replace(/ROUND\(x\.d \* v_rate, 4\), ROUND\(x\.c \* v_rate, 4\)/, "x.d, x.c")]).length, 1)
  t("ويرفضُ باباً يُترجِمُ ولا يحفظُ الأصل — ورقمٌ بلا أصلٍ لا يُراجَع",
    judgeThePostingDoor([GOOD_DOOR.replace(/original_debit, original_credit,\n\s*original_currency, exchange_rate_used/, "branch_id")]).length, 4)
  t("ولا يخدعُه بابٌ كلُّه فى تعليق",
    judgeThePostingDoor(["-- exchange_rate erp_company_base_currency( * v_rate original_debit"]).length > 0, true)
  t("ويُبرِّئُ بيتَ حركةٍ ينادى بيتَ التكلفةِ ويحفظُ الأصل", judgeTheMovementHome([GOOD_MOVE]).length, 0)
  t("ويرفضُ بيتَ حركةٍ كفَّ عن نداءِ بيتِ التكلفة — فصارت صيغةٌ ثانية",
    judgeTheMovementHome([GOOD_MOVE.replace(COST_HOME, "my_own_formula")]).length, 1)
  t("ويرفضُ بيتَ حركةٍ لا يحفظُ الأصل",
    judgeTheMovementHome([GOOD_MOVE.replace(/NEW\.original_unit_cost[^;]*;/, "")]).length, 1)
  t("ويرفضُ غيابَ بيتِ الحركةِ كلِّه", judgeTheMovementHome([]).length, 1)
  t("والدَّينُ القديمُ ثلاثَ عشرةَ حركةً كما قِيست", PINNED_LEGACY_PURCHASE_MOVES, 13)

  // ── (٨) بيتُ ملءِ الترجمةِ عندَ الميلاد ──────────────────────────────────
  const GOOD_FILL = `
    BEGIN
      v_home := public.erp_company_base_currency(x);
      IF v_home = '' OR v_ccy = v_home THEN RETURN NEW; END IF;
      IF v_base IS NOT NULL THEN RETURN NEW; END IF;
      IF v_rate IS NULL OR v_rate <= 0 THEN RETURN NEW; END IF;
      NEW := jsonb_populate_record(NEW, jsonb_build_object(
        v_base_col, round(v_amt * v_rate, public.erp_currency_decimals(v_home))));
      RETURN NEW;
    END`

  t("يُبرِّئُ بيتَ ملءٍ يسألُ البيوتَ ولا يخترعُ ولا يُصحِّح", judgeTheBirthFill([GOOD_FILL]).length, 0)
  t("ويرفضُ غيابَ بيتِ الملءِ كلِّه", judgeTheBirthFill([]).length, 1)
  t("ويرفضُ بيتَين للملء", judgeTheBirthFill([GOOD_FILL, GOOD_FILL]).length > 0, true)
  t("ويرفضُ من يخترعُ عملةَ الأساسِ بيدِه",
    judgeTheBirthFill([GOOD_FILL.replace("public.erp_company_base_currency(x)", "'EGP'")]).length, 1)
  t("ويرفضُ تقريباً مكتوباً بيد — فيقعُ خارجَ سماحِ القاضى",
    judgeTheBirthFill([GOOD_FILL.replace("public.erp_currency_decimals(v_home)", "2")]).length, 1)
  t("**ويرفضُ من يملأُ بسعرٍ غيرِ موجب** — وبابٌ بسعرٍ مُخترَعٍ أسوأُ من بابٍ مُقفَل",
    judgeTheBirthFill([GOOD_FILL.replace("v_rate IS NULL OR v_rate <= 0", "false")]).length, 1)
  t("**ويرفضُ من يُصحِّحُ رقماً كتبَه المُنادى** — وحارسٌ يُصلحُ ما يُحاكِمُه لا يُمسكُ أحداً",
    judgeTheBirthFill([GOOD_FILL.replace("IF v_base IS NOT NULL THEN RETURN NEW; END IF;", "")]).length, 1)
  t("ويرفضُ من يلمسُ مستندَ عملةِ الأساس",
    judgeTheBirthFill([GOOD_FILL.replace("v_home = '' OR v_ccy = v_home", "false")]).length, 1)
  t("ولا يخدعُه بيتٌ كلُّه فى تعليق",
    judgeTheBirthFill(["-- erp_company_base_currency( erp_currency_decimals( <= 0 IS NOT NULL RETURN NEW v_ccy = v_home"]).length > 0, true)

  // ── الترتيبُ نفسُه قانون ─────────────────────────────────────────────────
  t("يُبرِّئُ الترتيبَ الواجب", judgeTriggerOrder(TRIGGER_ORDER, "bills").length, 0)
  t("ولا يخدعُه وجودُ مُشغِّلاتٍ أخرى بينَها",
    judgeTriggerOrder(["aa_other", ...TRIGGER_ORDER, "zz_audit"], "bills").length, 0)
  t("ويمسكُ غيابَ بيتِ الملءِ من الجدول",
    judgeTriggerOrder([TRIGGER_ORDER[0], TRIGGER_ORDER[2]], "bills").length, 1)
  t("ويمسكُ غيابَ القاضى", judgeTriggerOrder([TRIGGER_ORDER[0], TRIGGER_ORDER[1]], "bills").length, 1)
  t("ويمسكُ غيابَ الثلاثةِ جميعاً", judgeTriggerOrder([], "bills").length, 3)
  t("**ويمسكُ اسماً يُرتِّبُ الملءَ بعدَ الحكم** — فيرفضُ البرىء",
    judgeTriggerOrder([TRIGGER_ORDER[0], TRIGGER_ORDER[2], "ad_fill_after_the_judge"], "bills").length, 1)
  t("والأسماءُ الثلاثةُ مرتَّبةٌ أبجديّاً كما كُتبت — وإلّا فالقانونُ يُناقضُ نفسَه",
    [...TRIGGER_ORDER].sort().join("|"), TRIGGER_ORDER.join("|"))

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

    // ── (٧) ولا يُقيَّدُ فى الدفترِ رقمٌ بعملةِ البائع ───────────────────────
    const { rows: doorRows } = await client.query(
      `SELECT pg_get_functiondef(p.oid) AS def
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = $1`, [POSTING_DOOR])
    problems.push(...judgeThePostingDoor(doorRows.map((r) => r.def)))

    const { rows: moveRows } = await client.query(
      `SELECT pg_get_functiondef(p.oid) AS def
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = $1`, [MOVEMENT_HOME])
    problems.push(...judgeTheMovementHome(moveRows.map((r) => r.def)))

    // **ولا قيدَ لفاتورةٍ أجنبيّةٍ بلا عملتِها** — الصمتُ نفسُه يُقاس.
    const { rows: silent } = await client.query(
      `SELECT count(*)::int AS n
         FROM public.journal_entries e
         JOIN public.bills b ON b.id = e.reference_id
        WHERE e.reference_type = 'bill'
          AND COALESCE(btrim(b.currency_code), '') <> ''
          AND upper(btrim(b.currency_code))
              <> upper(COALESCE(public.erp_company_base_currency(b.company_id), ''))
          AND e.original_currency IS DISTINCT FROM upper(btrim(b.currency_code))`)
    if (silent[0].n > 0) {
      problems.push(
        `${silent[0].n} قيداً لفاتورةٍ بعملةٍ أجنبيّةٍ ولا يحملُ عملتَها — ` +
        "**وهذا هو الصمتُ بعينِه: رقمُ البائعِ فى دفترِ عملةِ الأساس**.")
    }

    // **ولا قيدٌ مُترجَمٌ يخالفُ أصلَه × سعرَه** — والسماحُ كسرُ تقريبٍ لا أكثر.
    const { rows: drift } = await client.query(
      `WITH t AS (
         SELECT e.id,
                COALESCE(e.original_total_debit, 0) * COALESCE(e.exchange_rate, 1) AS expected,
                (SELECT COALESCE(SUM(l.debit_amount), 0)
                   FROM public.journal_entry_lines l WHERE l.journal_entry_id = e.id) AS got,
                (SELECT COALESCE(SUM(l.debit_amount), 0) - COALESCE(SUM(l.credit_amount), 0)
                   FROM public.journal_entry_lines l WHERE l.journal_entry_id = e.id) AS diff
           FROM public.journal_entries e
          WHERE e.original_currency IS NOT NULL
            AND e.original_total_debit IS NOT NULL
            AND COALESCE(e.exchange_rate, 1) <> 1)
       SELECT count(*)::int AS judged,
              count(*) FILTER (WHERE abs(got - expected) > 0.01)::int AS off,
              count(*) FILTER (WHERE diff <> 0)::int AS unbalanced
         FROM t`)
    const df = drift[0] || { judged: 0, off: 0, unbalanced: 0 }
    if (df.off > 0) {
      problems.push(
        `${df.off} قيداً مُترجَماً لا يُساوى أصلَه × سعرَه — **والترجمةُ إمّا صادقةٌ وإمّا لا تكون**.`)
    }
    if (df.unbalanced > 0) {
      problems.push(`${df.unbalanced} قيداً مُترجَماً غيرُ متوازن — **وكسرُ التقريبِ لا يُترَكُ معلَّقاً**.`)
    }

    // **وحركةُ شراءٍ بلا عملتِها معدودةٌ لا مسكوتٌ عنها** — ولا تنمو.
    const { rows: legacy } = await client.query(
      `SELECT count(*)::int AS n
         FROM public.inventory_transactions t
        WHERE t.transaction_type = 'purchase'
          AND t.original_currency IS NULL
          AND EXISTS (SELECT 1 FROM public.bills b WHERE b.id = t.reference_id)`)
    const lg = legacy[0].n
    if (lg > PINNED_LEGACY_PURCHASE_MOVES) {
      problems.push(
        `حركاتُ الشراءِ بلا عملةٍ أصليّة ${lg} والمُثبَّتُ ${PINNED_LEGACY_PURCHASE_MOVES} — ` +
        "**وحركةٌ جديدةٌ بلا عملتِها تعنى أنَّ البيتَ كفَّ عن السؤال**.")
    } else if (lg < PINNED_LEGACY_PURCHASE_MOVES) {
      problems.push(
        `حركاتُ الشراءِ بلا عملةٍ أصليّة ${lg} والمُثبَّتُ ${PINNED_LEGACY_PURCHASE_MOVES} — ` +
        "**والتاريخُ لا يُجمَّل**: يُحدَّثُ PINNED_LEGACY_PURCHASE_MOVES فى الدفعةِ التى استحقَّت النقصان.")
    }

    // ── (٨) وتُولَدُ الترجمةُ مع المال ──────────────────────────────────────
    const { rows: fillRows } = await client.query(
      `SELECT pg_get_functiondef(p.oid) AS def, p.prosecdef,
              array_to_string(COALESCE(p.proconfig, ARRAY[]::text[]), ',') AS cfg,
              COALESCE(array_to_string(p.proacl, ','), '(default)') AS acl
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = $1`, [BIRTH_FILL])
    problems.push(...judgeTheBirthFill(fillRows.map((r) => r.def)))
    for (const r of fillRows) {
      if (!r.prosecdef) {
        problems.push(`${BIRTH_FILL} ليس بصلاحيّاتٍ كاملة — فقد لا يقرأُ عملةَ الأساسِ لكلِّ مُنادٍ.`)
      }
      if (!/search_path=/.test(r.cfg)) {
        problems.push(`${BIRTH_FILL} بلا مسارِ بحثٍ مضبوط — **وبابٌ بصلاحيّاتٍ كاملةٍ بلا مسارٍ يُزوَّرُ اسمُه**.`)
      }
      // **ولا يُفتَحُ بابٌ لم يُطلَبْ فتحُه** — يُسوَّى بأخيه القاضى بالضبط.
      if (/\banon=/.test(r.acl) || /\bauthenticated=/.test(r.acl) || /^=/.test(r.acl) || /,=/.test(r.acl)) {
        problems.push(
          `${BIRTH_FILL} يبلغُه زائرٌ أو مستخدِمٌ مسجَّل (${r.acl}) — ` +
          "**وهو مُشغِّلٌ لا ينادِيه إنسان، فيُسوَّى بأخيه لا أوسع**.")
      }
    }

    // **والترتيبُ يُقاسُ من القاعدةِ لا يُفترَض** — على كلِّ مستندٍ يحملُ القانون.
    for (const tbl of Object.keys(MUST_CARRY_THE_LAW).sort()) {
      const { rows: tnames } = await client.query(
        `SELECT t.tgname
           FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE NOT t.tgisinternal AND n.nspname = 'public' AND c.relname = $1`, [tbl])
      problems.push(...judgeTriggerOrder(tnames.map((x) => x.tgname), tbl))
    }

    notes.push(`  بيتُ ملءِ الترجمة: صيغةٌ منشورة=${fillRows.length} · صلاحيّاتُه=${(fillRows[0] || {}).acl || "—"} · والترتيبُ (عملةٌ ثمّ ملءٌ ثمّ حكم) مقيسٌ على المستنداتِ الأربعة`)

    notes.push(`  بابُ الترحيل: صيغةٌ منشورة=${doorRows.length} · بيتُ حركةِ الشراء=${moveRows.length} · قيودٌ أجنبيّةٌ بلا عملتِها=${silent[0].n} (المطلوبُ صفر) · قيودٌ مُترجَمةٌ حُوسبت=${df.judged} تُخالفُ أصلَها=${df.off} غيرُ متوازنة=${df.unbalanced} · حركاتُ شراءٍ بلا عملة=${lg} (المُثبَّت ${PINNED_LEGACY_PURCHASE_MOVES})`)

    notes.push(`  مستنداتٌ تحملُ عملة: ${carriers.length} · تحملُ القانون: ${Object.keys(installed).length} · لا تستطيعُ الترجمة: ${cannot.length} (المُثبَّت ${PINNED_CANNOT_TRANSLATE.length})`)
    notes.push(`  صفوفٌ قائمةٌ تُخالفُ القانون: ${violators} (المطلوبُ صفر)`)
  }, { onAttempt: () => { problems.length = 0; notes.length = 0 } })

  if (problems.length > 0) {
    console.error(`X مالٌ بعملةٍ لم تُترجَم (${problems.length}):`)
    for (const p of problems) console.error(`  - ${p}`)
    console.error("  انظر supabase/migrations/20260822000032_v3_75_84_no_money_is_recorded_in_a_currency_that_was_not_translated.sql")
    console.error("  و supabase/migrations/20260822000034_v3_75_85_the_cost_is_measured_in_the_ledgers_currency_not_the_sellers.sql")
    console.error("  و supabase/migrations/20260822000035_v3_75_86_no_number_is_posted_to_the_ledger_in_the_sellers_currency.sql")
    console.error("  و supabase/migrations/20260822000036_v3_75_87_the_translation_is_born_with_the_money.sql")
    process.exit(1)
  }

  for (const n of notes) console.log(n)
  console.log(
    "+ ولا يُسجَّلُ مالٌ بعملةٍ لم تُترجَم: الحكمُ فى بيتٍ واحدٍ يسألُ عملةَ الأساسِ وخاناتِها " +
    "ولا يخترعُ رقماً · ومُركَّبٌ على المستنداتِ الأربعةِ التى تستطيعُ الترجمةَ إنشاءً وتعديلاً · " +
    "ومن لا يستطيعُ معدودٌ بالاسمِ لا مسكوتٌ عنه · ولا صفَّ قائمٌ يُخالفُه · " +
    "**وبيتُ التكلفةِ المُنزَلةِ يسألُ سعرَ الصرفِ ويُترجِمُ كلَّ مخرجٍ له، وحفظُ المجموعِ مقيسٌ لا موعود** · " +
    "**ولا يُقيَّدُ فى الدفترِ رقمٌ بعملةِ البائع: البابُ يضربُ فى السعرِ ويحفظُ الأصل، ولا قيدَ أجنبىٌّ بلا عملتِه** · " +
    "**وتُولَدُ الترجمةُ مع المال: بيتٌ واحدٌ يملأُ الفراغَ ولا يخترعُ سعراً ولا يُصحِّحُ قولَ مُنادٍ، والترتيبُ مقيسٌ لا مفترَض**.")
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })

#!/usr/bin/env node
/**
 * check-the-period-lock-is-one-home.js
 * ---------------------------------------------------------------------------
 * v3.75.82 — **قفلٌ يُفتَحُ باسمٍ يُرسلُه الطارقُ ليس قفلاً.**
 *
 * ═══ الحادثةُ التى وُلد منها هذا الحارس ═══
 *
 * قِيسَ يومَ ٢١ أغسطس ٢٠٢٦ أنَّ ضابطَ إقفالِ الفترةِ المحاسبيّةِ — وهو ضابطٌ
 * محاسبىٌّ لا ميزة — كان مكسوراً من ثلاثِ جهاتٍ فى وقتٍ واحد:
 *
 *   ‏(١) **الثقب**: `unlock_accounting_period` بصلاحيّاتٍ كاملةٍ وممنوحةٌ لكلِّ
 *       مستخدِمٍ مسجَّل، وتقرِّرُ الإذنَ من وسيطٍ يكتبُه المُنادى (`p_user_id`)
 *       لا من الجلسة. والأسوأ: `NULL <> 'owner'` تُساوى NULL، و`IF NULL`
 *       لا يعملُ فرعُه — **فغيرُ العضوِ كان يمرُّ من ثقبِ الفراغِ إلى الفتح**.
 *       (مقيسٌ على الإنتاج: `GUARD SKIPPED - falls through`.)
 *
 *   ‏(٢) **بيتان لسؤالٍ واحد**: «هل الفترةُ مقفولة؟» يُجيبُ عنه البيتُ المُقرُّ
 *       `validate_transaction_period`، وكان مُشغِّلُ **سطورِ** القيدِ يكتبُ
 *       نسخةً أضيقَ بيدِه تُسقِطُ حالةَ `locked` وتُسقِطُ الفتراتِ الماليّةَ
 *       كلَّها. **وقفلٌ يمنعُ الرأسَ ويتركُ السطورَ ليس قفلاً**، لأنَّ المالَ
 *       يسكنُ السطور.
 *
 *   ‏(٣) **بابان ميّتان**: مسارا `/api/accounting-periods/lock` و`/unlock`
 *       يُمرِّرانِ وسيطاً (`p_company_id`) **لا تقبلُه أىُّ نسخةٍ منشورة**،
 *       فيفشلانِ فى كلِّ مرّة. ولا شاشةَ تُنادِيهما، فلم يُكتشَفْ ذلك قطّ.
 *       **وهذه الثالثةُ لم تبقَ هنا**: قِيسَ المشروعُ كلُّه فى v3.75.83 فوُجدَ
 *       ٨٨ نداءً بلا باب، فانتقلَ حكمُها إلى بيتِه الواحدِ ولم يبقَ منه ههنا شىء.
 *
 * ═══ وما وجدَه الحارسُ أوّلَ مرّةٍ شُغِّلَ على القاعدةِ الحيّة ═══
 *
 * رفضَ الدفعةَ التى وُلدَ فيها، وسمّى **ثمانىَ دوالَّ** تكتبُ حكمَ «الفترةُ
 * مقفولة» بأيديها. وقِيست الثمانى واحدةً واحدةً:
 *
 *   • **سبعٌ مُدانةٌ فعلاً** — تُقارِنُ الحالةَ بمفردةِ إقفالٍ ثمّ ترفضُ العمل،
 *     ولا واحدةَ منها تنادى البيتَ المُقرّ. وهى مُثبَّتةٌ أدناه بأسمائِها.
 *   • **وواحدةٌ بريئة**: `seed_accounting_periods_for_company` تكتبُ فتراتٍ
 *     جديدةً بـ`is_locked = false` ولا تُقارِنُ شيئاً، وخطؤُها عن رقمِ شركةٍ
 *     فارغ. **فضُيِّقَ الحكمُ إلى ما وُلد له، ولم يُوسَّعْ ليشملَ برىئاً.**
 *
 * وهذا هو الفرقُ بين قانونٍ وتشخيص: القانونُ يُقاسُ أثرُه قبلَ أن يُسَنّ.
 *
 * ═══ ولماذا حارسٌ لا تصحيحٌ فقط ═══
 *
 * لأنَّ كلَّ واحدةٍ من الثلاثِ **لا تعيشُ فى ملفّ**: تُعادُ الدالّةُ بيدٍ فى
 * لوحةِ التحكّم، أو يُغيَّرُ توقيعٌ فى القاعدةِ فيصيرُ نداءُ الشيفرةِ يتيماً،
 * ولا يتغيّرُ حرفٌ فى المستودع. فالفحصُ النصّىُّ يقولُ «سليم» بينما القفلُ
 * مفتوح. **ولا سبيلَ إلّا سؤالُ القاعدةِ الحيّةِ نفسِها.**
 *
 * Usage: node scripts/check-the-period-lock-is-one-home.js [--require-db] [--selftest]
 * ---------------------------------------------------------------------------
 */
"use strict"
require("dotenv").config({ path: [".env.local", ".env", ".env.development.local"] })

const fs = require("fs")
const path = require("path")

const ROOT = process.cwd()

// بيوتُ الحكمِ المُعلَنةُ على سؤالِ «هل الفترةُ مقفولة؟» — ولا رابعَ لها.
const DECLARED_HOMES = ["validate_transaction_period", "check_fiscal_period_locked"]

// ── دَينٌ مقيسٌ لا مسكوتٌ عنه ────────────────────────────────────────────────
//
// قِيسَ يومَ ٢١ أغسطس ٢٠٢٦ على الإنتاج: **سبعُ دوالَّ ترفضُ العملَ لأنَّ الفترةَ
// مقفولة، كلٌّ بنسخةٍ كتبَها بيدِه**، ولا واحدةَ منها تنادى البيتَ المُقرّ.
// وتوحيدُها يمسُّ مساراتِ الرواتبِ والإقفالِ السنوىِّ وتغييرِ عملةِ الأساس —
// **جراحةٌ تُقاسُ فى دفعتِها ولا تُخلَطُ بسدِّ ثغرة**. فتُثبَّتُ اليومَ بالاسم:
// لا تزيدُ صامتةً، ومن سدَّ واحدةً أنزلَها من القائمةِ فى دفعتِه.
//
// ⚠️ ومقيسٌ فيها ما هو أدلُّ من العدد: `require_open_financial_period_db` وحدَها
// تسألُ عن حالةٍ اسمُها `audit_lock`، **والجدولُ نفسُه لا يقبلُ إلّا**
// `open · closed · locked` (قيدُ accounting_periods_status_check). فهذه نسخةٌ
// انحرفت عن جدولِها حتى صارت تسألُ عن اسمٍ لا يُشغَلُ أبداً — وهو بعينُه ما
// يقعُ حين يُكتَبُ الحكمُ فى سبعةِ مواضعَ بدلَ موضعٍ واحد.
const PINNED_SECOND_HOMES = [
  "change_base_currency",
  "close_accounting_period",
  "perform_annual_closing_atomic",
  "plw_create_labour_payment",
  "plw_pay_labour_payment",
  "post_payroll_atomic",
  "require_open_financial_period_db",
]

// ومن يُنادى البيتَ فيسألُ سؤالَه: المُشغِّلانِ على رأسِ القيدِ وسطورِه.
const MUST_ASK_THE_HOME = ["enforce_period_lock_header", "enforce_period_lock_lines"]

// v3.75.83 — **وقانونٌ فى بيتَينِ هو العطبُ الذى نُحاربُه.** كان هنا قانونٌ رابع:
// «لا يُنادى وسيطٌ لا وجودَ له»، مقصوراً على المسارَينِ اللذَينِ قِيسا فى v3.75.82.
// وقد قِيسَ المشروعُ كلُّه يومَ ٢٢ أغسطس ٢٠٢٦ (٤٩٤ نداءً · ٨٨ بلا باب)، فانتقلَ
// الحكمُ إلى بيتِه الواحد: `scripts/check-every-rpc-call-has-a-door.js` — وهو
// يقيسُ كلَّ نداءٍ فى المستودعِ لا موضعَينِ منه، ويُثبِّتُ الدَّينَ بالاسمِ والعدد.
// فنُزعَ من هنا كاملاً ولم يُترَكْ منه أثرٌ يُخالفُه غداً.

// ═══════════════════════════════════════════════════════════════════════════
// الجزءُ الخالصُ من المنطق — يُختبَرُ بلا قرص
// ═══════════════════════════════════════════════════════════════════════════

/** **والتعليقُ ليس تعليمة.** */
function maskSqlComments(src) {
  return String(src || "")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/--[^\n]*/g, (m) => " ".repeat(m.length))
}

/** ويُحجَبُ تعليقُ جافاسكربت كذلك قبلَ الحكمِ على نداءِ الشيفرة. */
function maskJsComments(src) {
  return String(src || "")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length))
}

/**
 * حكمُ بابِ الفتح: أيَعرفُ من يفتحُ، أم يُصدِّقُ ما يُرسَلُ إليه؟
 * @param {string} def نصُّ `unlock_accounting_period` من الكتالوج
 */
function judgeTheUnlockDoor(def) {
  const out = []
  const code = maskSqlComments(def)

  if (!/auth\.uid\s*\(\s*\)/.test(code)) {
    out.push(
      "unlock_accounting_period لا تسألُ الجلسةَ عن هويّةِ الفاعل (auth.uid()) — " +
      "فالإذنُ يُقرَّرُ من وسيطٍ يكتبُه المُنادى بيدِه، وهذا ليس إثباتاً.")
  }
  if (!/assert_company_access\s*\(/.test(code)) {
    out.push(
      "unlock_accounting_period لا تنادى assert_company_access — " +
      "فلا شىءَ يمنعُ فتحَ فترةٍ تخصُّ شركةً أخرى.")
  }
  // **والغيابُ ليس إذناً**: مقارنةُ دورٍ بـ`<>` أو `!=` تُعيدُ NULL حين لا صفَّ،
  // والـIF لا يعملُ على NULL فيمرُّ غيرُ العضو. الحكمُ يجب أن يكونَ ثنائيّاً.
  // ⚠️ ولا `\b` قبلَ العامل: الحدُّ الكلمىُّ لا يقعُ بين فراغٍ و`!`، فكانت
  // القاعدةُ **لا تُمسِكُ الشكلَ الذى وُلدت له** — كشفَه فخُّها الذاتىُّ قبلَ التسليم.
  if (/(?:<>|!=)\s*'owner'/.test(code) || /'owner'\s*(?:<>|!=)/.test(code)) {
    out.push(
      "unlock_accounting_period تحكمُ على الدورِ بـ<> أو != — " +
      "والغيابُ (NULL) يُنتِجُ NULL فلا يعملُ فرعُ الرفض، فيمرُّ غيرُ العضو. " +
      "الحكمُ يكونُ بـIS DISTINCT FROM.")
  }
  if (!/IS\s+(?:NOT\s+)?DISTINCT\s+FROM/i.test(code)) {
    out.push(
      "unlock_accounting_period لا تستعملُ IS DISTINCT FROM فى حكمِ الدور — " +
      "فحكمُها قد يُعيدُ NULL، والـNULL بابُ نجاةٍ لا حكم.")
  }
  // **وعلامتانِ لحقيقةٍ واحدةٍ يجب أن تتحرّكا معاً.**
  const setsStatus = /status\s*=\s*'open'/.test(code)
  const setsLock = /is_locked\s*=\s*(?:false|FALSE)/.test(code)
  if (!setsStatus || !setsLock) {
    out.push(
      "unlock_accounting_period لا ترفعُ القفلَ كلَّه " +
      `(status='open': ${setsStatus ? "نعم" : "لا"} · is_locked=false: ${setsLock ? "نعم" : "لا"}) — ` +
      "فتبقى الفترةُ ممنوعةً وهى تقولُ إنّها مفتوحة.")
  }
  return out
}

/** مفرداتُ «مقفولة» كما تُكتَبُ فى الشيفرة — والجدولُ لا يقبلُ إلّا ثلاثاً منها. */
const CLOSED_WORDS = ["closed", "locked", "audit_lock"]

/**
 * أهذه الدالّةُ **بيتٌ ثانٍ** لسؤالِ «هل الفترةُ مقفولة؟»
 *
 * الحكمُ بالأثرِ لا بالجوار: **تقارنُ الحالةَ بمفردةِ إقفال، ثمّ ترفض**.
 *
 * ⚠️ وأوّلُ صياغةٍ لهذه القاعدةِ كانت «تذكرُ الجدولَ + is_locked + ترفعُ خطأً»،
 * فاتّهمَت `seed_accounting_periods_for_company` وهى بريئة: تكتبُ فتراتٍ جديدةً
 * بـ`is_locked = false` ولا تُقارِنُ شيئاً، وخطؤُها عن رقمِ شركةٍ فارغ لا عن قفل.
 * **وحارسٌ يصرخُ على البرىءِ يُطفَأ** — كشفَه القياسُ على القاعدةِ الحيّةِ ساعةَ
 * رفضَ الحارسُ دفعتَه الأولى، فضُيِّقَ الحكمُ إلى ما وُلد له.
 */
function isASecondHome(name, def) {
  if (DECLARED_HOMES.includes(name)) return false
  const code = maskSqlComments(def)
  if (!/accounting_periods/.test(code)) return false
  // مقارنةُ الحالةِ بمفردةِ إقفالٍ فى مدًى قريب — لا مجرَّدُ ورودِ الكلمتين.
  const compares = new RegExp(`status[^;]{0,80}('(?:${CLOSED_WORDS.join("|")})')`, "is").test(code)
  if (!compares) return false
  // ولا يُحاكَمُ من يقرأُ ولا يرفض: **الرفضُ هو ما يجعلُ القراءةَ حكماً**.
  return /RAISE\s+EXCEPTION/i.test(code)
}

/** حكمُ الرَّوسةِ المُثبَّتة: لا تزيدُ صامتةً، ولا تنقصُ بلا أن يُنزَّلَ الاسم. */
function judgeRoster(found, pinned) {
  const f = [...new Set(found)].sort()
  const p = [...new Set(pinned)].sort()
  return {
    added: f.filter((x) => !p.includes(x)),
    gone: p.filter((x) => !f.includes(x)),
  }
}

/** أينادى هذا المُشغِّلُ البيتَ المُقرَّ؟ */
function asksTheHome(def) {
  return /validate_transaction_period\s*\(/.test(maskSqlComments(def))
}

// ═══════════════════════════════════════════════════════════════════════════
// الفخُّ الذاتىّ — **وحارسٌ لا يُرى وهو يرفض ليس حارساً**
// ═══════════════════════════════════════════════════════════════════════════
if (process.argv.includes("--selftest")) {
  const cases = []
  const t = (name, got, exp) => cases.push([name, JSON.stringify(got), JSON.stringify(exp)])

  const GOOD_UNLOCK = `
    BEGIN
      PERFORM public.assert_company_access(v_period.company_id);
      v_actor := COALESCE(auth.uid(), p_user_id);
      v_is_owner := (v_role IS NOT DISTINCT FROM 'owner');
      UPDATE public.accounting_periods SET status = 'open', is_locked = false WHERE id = p_period_id;
    END;`

  t("يُبرِّئُ بابَ فتحٍ يسألُ الجلسةَ ويسألُ الشركةَ ويرفعُ القفلَ كلَّه",
    judgeTheUnlockDoor(GOOD_UNLOCK).length, 0)
  t("ويرفضُ باباً لا يسألُ الجلسة",
    judgeTheUnlockDoor(GOOD_UNLOCK.replace(/auth\.uid\(\)/g, "p_user_id")).length, 1)
  t("ويرفضُ باباً لا يسألُ عن الشركة",
    judgeTheUnlockDoor(GOOD_UNLOCK.replace(/assert_company_access/g, "noop")).length, 1)
  t("ويرفضُ الشكلَ الذى كان: مقارنةُ الدورِ بـ!= — وهو ثقبُ الفراغ",
    judgeTheUnlockDoor(GOOD_UNLOCK.replace("v_role IS NOT DISTINCT FROM 'owner'", "v_role != 'owner'")).length, 2)
  t("ويُسمّى ثقبَ الفراغِ فى نصِّ الرفض",
    judgeTheUnlockDoor(GOOD_UNLOCK.replace("v_role IS NOT DISTINCT FROM 'owner'", "v_role <> 'owner'"))
      .some((p) => p.includes("NULL")), true)
  t("ويرفضُ فتحاً يترك is_locked كما هى — علامتانِ تتناقضان",
    judgeTheUnlockDoor(GOOD_UNLOCK.replace(", is_locked = false", "")).length, 1)
  t("ويرفضُ فتحاً لا يُعيدُ الحالةَ إلى open",
    judgeTheUnlockDoor(GOOD_UNLOCK.replace("status = 'open', ", "")).length, 1)
  t("ولا يخدعُه نداءٌ فى تعليقٍ — والتعليقُ ليس تعليمة",
    judgeTheUnlockDoor(GOOD_UNLOCK.replace("PERFORM public.assert_company_access(v_period.company_id);",
      "-- PERFORM public.assert_company_access(x);")).length, 1)

  const HAND_WRITTEN = `BEGIN
    IF EXISTS (SELECT 1 FROM accounting_periods ap WHERE ap.is_locked = TRUE OR ap.status = 'closed') THEN
      RAISE EXCEPTION 'blocked';
    END IF;
  END;`
  t("يمسكُ بيتاً ثانياً يقارنُ الحالةَ ثمّ يرفض",
    isASecondHome("some_trigger", HAND_WRITTEN), true)
  t("ولا يُحاكِمُ البيتَ المُعلَنَ نفسَه",
    isASecondHome("validate_transaction_period", HAND_WRITTEN), false)
  t("ولا البيتَ المُعلَنَ الثانى",
    isASecondHome("check_fiscal_period_locked", HAND_WRITTEN), false)
  t("ولا يُحاكِمُ قراءةً بلا رفض — والقراءةُ ليست حكماً",
    isASecondHome("a_reader", HAND_WRITTEN.replace("RAISE EXCEPTION 'blocked';", "RETURN TRUE;")), false)
  t("ولا يُحاكِمُ من لا يقرأُ الجدولَ أصلاً",
    isASecondHome("x", "BEGIN RAISE EXCEPTION 'no'; END;"), false)
  t("ولا يخدعُه ذكرُ العلامتَينِ فى تعليق",
    isASecondHome("x", "-- accounting_periods is_locked status\nBEGIN RAISE EXCEPTION 'no'; END;"), false)
  // **ولا يتّهمُ البرىء** — وهو الشكلُ الذى أخطأتْ فيه أوّلُ صياغةٍ لهذه القاعدة.
  t("ولا يُحاكِمُ من يكتبُ فترةً جديدةً بـis_locked=false ويرفعُ خطأً عن شىءٍ آخر",
    isASecondHome("seed_shape", `BEGIN
      IF p_company_id IS NULL THEN RAISE EXCEPTION 'p_company_id is required'; END IF;
      INSERT INTO accounting_periods (company_id, status, is_locked) VALUES (p_company_id, 'open', false);
    END;`), false)
  t("ويرى المفردةَ الثالثةَ audit_lock كما يرى أختَيها",
    isASecondHome("x", "BEGIN IF v.status = 'audit_lock' THEN RAISE EXCEPTION 'no'; END IF; SELECT 1 FROM accounting_periods; END;"), true)
  // ولا يُحاكَمُ من قارنَ **متغيّراً** بمفردةِ إقفالٍ بعيداً عن العمود: الحكمُ
  // على «حالةُ الفترةِ تُقارَنُ» لا على ورودِ الكلمتَينِ فى ملفٍّ واحد.
  t("ولا يعدُّ ورودَ الكلمتَينِ متباعدتَينِ مقارنةً",
    isASecondHome("x", `BEGIN
      SELECT status FROM accounting_periods;
      PERFORM 1; PERFORM 2; PERFORM 3;
      IF v_x = 'closed' THEN RAISE EXCEPTION 'unrelated'; END IF;
    END;`), false)

  t("والرَّوسةُ تُطابقُ نفسَها", judgeRoster(["a", "b"], ["b", "a"]), { added: [], gone: [] })
  t("وتمسكُ بيتاً ثانياً جديداً", judgeRoster(["a", "b", "c"], ["a", "b"]), { added: ["c"], gone: [] })
  t("وتمسكُ اسماً سُدَّ ولم يُنزَّلْ من القائمة", judgeRoster(["a"], ["a", "b"]), { added: [], gone: ["b"] })
  t("والعددُ وحدَه لا يرى التبديل", judgeRoster(["a", "z"], ["a", "b"]).added.length > 0, true)
  t("والدَّينُ المُثبَّتُ سبعةٌ بأسمائِها", PINNED_SECOND_HOMES.length, 7)

  t("يرى المُشغِّلَ وهو ينادى البيت",
    asksTheHome("BEGIN PERFORM public.validate_transaction_period(a, b); END;"), true)
  t("ولا يراه فى تعليق",
    asksTheHome("-- PERFORM public.validate_transaction_period(a, b);\nBEGIN END;"), false)
  t("ولا يعدُّ ذِكرَ الاسمِ نداءً بلا قوس",
    asksTheHome("BEGIN RAISE NOTICE 'validate_transaction_period'; END;"), false)

  let fail = 0
  for (const [name, got, exp] of cases) {
    const ok = got === exp
    if (!ok) fail++
    console.log((ok ? "  ok  " : "  X   ") + name + "  (توقّعتُ " + exp + " فجاء " + got + ")")
  }
  if (fail) { console.error("X سقط الفخُّ الذاتىّ فى " + fail + " اتّجاه."); process.exit(1) }
  console.log("  الفخُّ الذاتىّ: " + cases.length + " اتّجاهاً، كلُّها صحيحة.")
  process.exit(0)
}

// ═══════════════════════════════════════════════════════════════════════════
// القياسُ الحقيقىّ — على القاعدةِ الحيّة
// ═══════════════════════════════════════════════════════════════════════════
const requireDb = process.argv.includes("--require-db")
const url = process.env.PERIOD_LOCK_DB_URL || process.env.PRODUCTION_SUPABASE_DB_URL
if (!url) {
  const msg = "no database URL - cannot measure whether the period lock actually locks."
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

    // ── (١) بابُ الفتحِ يعرفُ من يفتح ──────────────────────────────────────
    const { rows: unlockRows } = await client.query(
      `SELECT pg_get_functiondef(p.oid) AS def, p.prosecdef,
              COALESCE((SELECT string_agg(DISTINCT CASE WHEN ax.grantee = 0 THEN 'PUBLIC'
                                                        ELSE pg_get_userbyid(ax.grantee) END, ',')
                          FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) ax
                         WHERE ax.privilege_type = 'EXECUTE'), '') AS grantees
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'unlock_accounting_period'`)
    if (unlockRows.length === 0) {
      problems.push("unlock_accounting_period غائبةٌ من القاعدة — ولا بابَ لفتحِ فترةٍ أُغلقت.")
    } else {
      for (const r of unlockRows) {
        problems.push(...judgeTheUnlockDoor(r.def))
        if (/(^|,)(PUBLIC|anon)(,|$)/.test(r.grantees)) {
          problems.push(`unlock_accounting_period يبلغُها ${r.grantees} — وفتحُ فترةٍ ليس لزائر.`)
        }
      }
      notes.push(`  بابُ الفتح: بصلاحيّاتٍ كاملة=${unlockRows[0].prosecdef ? "نعم" : "لا"} · يبلغُه: ${unlockRows[0].grantees}`)
    }

    // ── (٢) ولا بيتَ ثانياً لسؤالِ «هل الفترةُ مقفولة؟» ────────────────────
    const { rows: fns } = await client.query(
      `SELECT p.proname, pg_get_functiondef(p.oid) AS def
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         JOIN pg_language l ON l.oid = p.prolang
        WHERE n.nspname = 'public' AND p.prokind = 'f' AND l.lanname IN ('plpgsql', 'sql')
          AND pg_get_functiondef(p.oid) ILIKE '%accounting_periods%'`)
    const secondHomes = [...new Set(
      fns.filter((f) => isASecondHome(f.proname, f.def)).map((f) => f.proname))].sort()
    const roster = judgeRoster(secondHomes, PINNED_SECOND_HOMES)
    for (const nm of roster.added) {
      problems.push(
        `${nm} تكتبُ بيدِها حكمَ «الفترةُ مقفولة» بدلَ نداءِ ${DECLARED_HOMES[0]} — ` +
        "**بيتٌ ثانٍ جديدٌ لم يكنْ فى الدَّينِ المُثبَّت**، ويُغيَّرُ أحدُهما ويبقى الآخرُ على قولِه القديم.")
    }
    for (const nm of roster.gone) {
      problems.push(
        `${nm} لم تعُدْ بيتاً ثانياً — **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**: ` +
        "أنزِلِ الاسمَ من PINNED_SECOND_HOMES فى الدفعةِ التى سدَّته.")
    }
    notes.push(
      `  دوالُّ تذكرُ الجدول: ${fns.length}   ·   بيوتٌ ثانيةٌ: ${secondHomes.length} ` +
      `(المُثبَّت ${PINNED_SECOND_HOMES.length})`)
    if (secondHomes.length > 0) {
      notes.push("  ! ومعدودٌ لا مسكوتٌ عنه — تُوحَّدُ على دفعاتٍ مقيسة، وتمسُّ الرواتبَ والإقفالَ السنوىَّ وعملةَ الأساس:")
      for (const nm of secondHomes) notes.push(`      - public.${nm}`)
    }

    // ── (٣) والمُشغِّلانِ يسألانِ نفسَ البيت ─────────────────────────────────
    for (const nm of MUST_ASK_THE_HOME) {
      const f = fns.find((x) => x.proname === nm)
        || (await client.query(
          `SELECT p.proname, pg_get_functiondef(p.oid) AS def
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = $1`, [nm])).rows[0]
      if (!f) {
        problems.push(`${nm} غائبٌ من القاعدة — والقفلُ بلا مُشغِّلٍ زينة.`)
        continue
      }
      if (!asksTheHome(f.def)) {
        problems.push(
          `${nm} لا ينادى ${DECLARED_HOMES[0]} — فالرأسُ والسطورُ لا يقولانِ قولاً واحداً، ` +
          "والمالُ يسكنُ السطور.")
      }
    }

  }, { onAttempt: () => { problems.length = 0; notes.length = 0 } })

  if (problems.length > 0) {
    console.error(`X قفلُ الفترةِ المحاسبيّةِ ليس قفلاً (${problems.length}):`)
    for (const p of problems) console.error(`  - ${p}`)
    console.error("  انظر supabase/migrations/20260821000031_v3_75_82_a_lock_that_opens_to_a_name_the_knocker_supplies.sql")
    process.exit(1)
  }

  for (const n of notes) console.log(n)
  console.log(
    "+ قفلُ الفترةِ قفل: بابُ الفتحِ يعرفُ فاتحَه من الجلسةِ لا ممّا يُرسَلُ إليه، والغيابُ " +
    "ليس إذناً، والفتحُ يرفعُ العلامتَينِ معاً · وسؤالُ «هل الفترةُ مقفولة» له بيتٌ واحدٌ " +
    "يسألُه الرأسُ والسطورُ جميعاً · وحكمُ «لا نداءَ بوسيطٍ لا وجودَ له» انتقلَ إلى " +
    "بيتِه الواحد: check-every-rpc-call-has-a-door.")
})().catch((e) => { console.error(`X ${e.message}`); process.exit(1) })

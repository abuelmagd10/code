#!/usr/bin/env node
/**
 * check-a-currency-is-not-written-in-the-code.js — v3.75.50
 *
 * «ولا تُسمّى عملةٌ بعينِها»
 *
 * **ورقمُ المالِ لا يُقرأُ إلّا بعُرْفِ صاحبِه**: «٩٨٦٫١٠» بالجنيهِ ليست
 * «986.10 $». فعملةُ الشركةِ **صفةٌ فى صفِّها لا نصٌّ فى شيفرتِنا** — ومشروعٌ
 * يُحاكَمُ بأنّه عالمىٌّ لا يجوزُ أن يقرِّرَ عملةَ عميلٍ لم يُسجَّلْ بعد.
 *
 * ═══ ويُحكَمُ بالخاصّيّةِ لا بالعبارة ═══
 *
 * لا يُبحَثُ عن اسمِ عملةٍ بعينِها (فذلك يحرسُ عبارةً يُلتَفُّ عليها بحرف)، بل عن
 * **موضعِ القرار**:
 *
 *   (أ) خيارُ عملةٍ مُثبَّتٌ بنصٍّ مكتوب:   `currency: 'EGP'`
 *   (ب) قيمةٌ افتراضيّةٌ تُثبِّتُ عملةً أو رمزَها:  `currency = "EGP"`
 *                                              `currencySymbol = '£'`
 *
 * **ولا يُحاكَمُ من يستقبلُها**: `{ style: 'currency', currency }` أو
 * `currency: currencyCode` قرارُهما عندَ المُنادِى لا هنا. **ولا يُحاكَمُ بيتُ
 * المفردات**: جدولٌ يقولُ إنّ رمزَ `EGP` هو `£` **يعرِّفُ ولا يقرِّر**، ومفتاحُه
 * `EGP:` لا `currency:`. **والتعليقُ ليس تعليمة** — يُحجَبُ قبلَ الحكم.
 *
 * ═══ ويُسمّى الأثرَ لا الشكلَ ═══
 *
 * الموضعُ الواقعُ داخلَ سياقِ تنسيقٍ (`Intl.NumberFormat` أو `style: 'currency'`)
 * **يُعرَضُ عليه أنّه تنسيقُ عرض**، وما عداه **قيمةٌ تُكتَبُ أو تُرسَل** — وهذه
 * أثقلُ، لأنّ عملةً تُكتَبُ فى صفٍّ تبقى فيه. **والحكمُ بالأثرِ لا بالاسم.**
 *
 * ═══ ومعدودٌ لا مسكوتٌ عنه ═══
 *
 * لا تُحوَّلُ اليومَ شاشة: تحويلُ كلِّ موضعٍ يحتاجُ قراءةَ عملةِ الشركةِ من
 * القاعدةِ فى موضعِه، **ونصفُ جراحةٍ أسوأُ من لا جراحة**. فيُثبَّتُ العددُ فلا
 * يزيد، ويُسمَّى أصحابُه واحداً واحداً ليُسدَّدوا على دفعاتٍ مقيسة. **ومكسبٌ لا
 * يُثبَّتُ يُلتَفُّ عليه**: كلُّ نقصانٍ يُنزَّلُ هنا فى الدفعةِ التى كسبته.
 *
 * ═══ وللاختيارِ بيتٌ قائمٌ فليُنادَ بالاسم ═══
 *
 * عملةُ الشركةِ **مُختارةٌ ومحفوظةٌ فعلاً**: `companies.base_currency`
 * (NOT NULL, DEFAULT 'EGP')، وصفحةُ الإعداداتِ تكتبُ الأسعارَ فى
 * `exchange_rates`، والمدفوعاتُ تحفظُ `base_currency_amount`.
 *
 * **والقارئُ الصحيحُ واحد**:
 *     lib/currency-service.ts::getBaseCurrency(supabase, companyId)
 *
 * **وثَمَّ بيتٌ ثانٍ يحملُ الاسمَ نفسَه ولا يُنادَى**:
 * `lib/exchange-rates.ts::getBaseCurrency()` يقرأُ من `localStorage` ويُعيدُ
 * `'EGP'`، **ويُعلِنُ عن نفسِه أنّه مهجور**. فمن أصلحَ موضعاً فلا يُصلحْه إليه —
 * **وقاعدةٌ لها بيتان تقولُ قولَين**، ولا يُصلَحُ عطبٌ بعطبٍ آخَر.
 *
 * ═══ ولا يُبنى بيتٌ ثانٍ ═══
 *
 * جردُ الشيفرةِ يُقرأُ من `scripts/lib/repo-code-files.js` — من المستودعِ لا من
 * القرص، فلا يختلفُ الحكمُ بين جهازٍ وجهاز.
 *
 * Usage: node scripts/check-a-currency-is-not-written-in-the-code.js [--selftest]
 */
"use strict"
const { projectCodeFiles, keepPath, NOT_SHIPPED } = require("./lib/repo-code-files")

// v3.75.65 — **وعنوانُ السؤالِ واحد**: نزلَ موضعٌ واحدٌ من هذا الصنفِ حين
// كفَّ بيتُ العملةِ فى الشيفرةِ عن الارتدادِ إلى حرف. **والدفعةُ التى كسبَت
// هى التى تُثبِّت.**
const PINNED = 35
/**
 * v3.75.58 — **والارتدادُ اختراعٌ مؤجَّل.**
 *
 * النمطانِ أعلاه يشترطانِ أن تجىءَ العملةُ **مباشرةً** بعدَ `:` أو `=`. وكلُّ
 * ما كُتبَ خلفَ عاملٍ آخَرَ كان يسقطُ من كلِّ شبكةٍ فى المشروع:
 *
 *     const c = row.currency || 'EGP'        ← ارتدادٌ عن قيمةٍ صامتة
 *     p_currency_code: body.ccy ?? 'EGP'     ← ارتدادٌ كذلك
 *     baseCurrency === 'EGP' ? a : b         ← مقارنةٌ يتفرّعُ عليها سلوك
 *     x ? 'EGP' : 'USD'                      ← فرعُ شرطٍ
 *
 *     const [c, setC] = useState('EGP')      ← وسيطٌ يُمرَّرُ لدالّة
 *     return 'EGP'                           ← قيمةٌ تُعادُ من دالّة
 *
 * وكان الحارسُ يقولُ «٣٦ مُثبَّتون» **وهو صادقٌ فيما يقيس**، ويُقرَأُ على أنّه
 * حجمُ الدَّين — **وليس كذلك**.
 *
 * **ولا يُعدَّدُ العوامِلُ واحداً واحداً** — فحارسٌ يعدُّ الأشكالَ يُلتَفُّ
 * عليه بشكلٍ لم يُعَدَّ. فالحكمُ مقلوبٌ: **كلُّ رمزٍ ثلاثىٍّ كبيرٍ مكتوبٍ
 * فى سطرٍ يتكلّمُ عن عملة** يُعَدُّ، ثمّ يُصَنَّفُ بالعامِلِ الذى أدخلَه ليُقرَأَ
 * ثقلُه — والتصنيفُ للقراءة، والرقمُ للحكم.
 *
 * فقِيسَ الباقى فكان **٣١١ موضعاً**، وصُنَّفَ بالأثرِ قبلَ أن يُثبَّت.
 *
 * **v3.75.62 — نزلَ إلى ٣١٠**: رحلَ موضعٌ واحدٌ مع تسريحِ مسارِ تحويلِ
 * العملةِ القديمِ فى المتصفّحِ كلِّه — **والدفعةُ التى كسبَت هى التى تُثبِّت**.
 */
/**
 * v3.75.65 — **ورقمٌ واحدٌ يحملُ خبرَين، فيُقالانِ معاً ولا يُجمَّلان:**
 *
 *   ٣١٠  المُثبَّتُ قبلَ الدفعة
 *   −٣٠  سُدِّدَت: طبقةُ الخادمِ كلُّها (مساراتٌ وخدماتٌ ومحرِّكاتٌ) صارت
 *        تسألُ البيتَ الواحدَ أو تصمتُ فيسألَ عنها مُشغِّلُ الميلاد (v3.75.64)
 *   +٢٥  ظهرَت: اتّسعت عينُ الحارسِ إلى اسمِ الدالّةِ الحاوية (أعلاه)،
 *        فرأى ما كان مستوراً — **وزيادةٌ سببُها عينٌ أوسعُ ليست دَيناً جديداً،
 *        لكنّها تُثبَّتُ كما لو كانت، فلا تكبرُ بعدَ اليوم.**
 *   ───
 *   ٣٠٥  المقيسُ يومَ الشحن
 */
/**
 * v3.75.66 — **وسؤالُ الاسمِ ليس سؤالَ الباب**: كانت ثلاثةُ بيوتٍ فى الشاشةِ
 * (`currency-utils.ts`, `currency-converter.ts`, `exchange-rates.ts`) وأربعةٌ
 * وأربعون ملفَّ شاشةٍ ومكوِّنٍ كلٌّ منها يقرأُ `localStorage['app_currency']`
 * بنفسِه ثمّ يخترعُ `'EGP'` عندَ الصمتِ — فصارَ لها **بيتٌ واحدٌ**:
 * `lib/currency-service.ts::readAppCurrency()`، يُعيدُ `''` لا حرفاً.
 *
 *   ٣٠٥  المُثبَّتُ قبلَ الدفعة
 *   −١٠٥ سُدِّدَت: مئةٌ وخمسةُ مواضعَ (ارتدادٌ صامتٌ فى غالبِها) كفَّت عن
 *        كتابةِ `'EGP'` حرفاً وصارت تنادى البيتَ الواحد
 *   ───
 *   ٢٠٠  المقيسُ يومَ الشحن
 *
 * **ونصفُ جراحةٍ أسوأُ من لا جراحة**: بعضُ الشاشاتِ ما زالت تُبقى حالةَ
 * React ابتدائيّةً بحرفٍ (`useState('EGP')`) قبلَ أن يُصحِّحَها أثرٌ يُنادى
 * البيتَ الواحد — وهذا **مذكورٌ لا مستور**؛ ليس ارتداداً مكتوباً خلفَ عاملٍ
 * على قراءةٍ من الجيب، فلا يقيسُه هذا الحارس، وتُقاسُ دفعةٌ لاحقةٌ إن قُرِّر.
 */
/**
 * v3.75.67 — **والتاريخُ لا يُجمَّل: كان القولُ أعلاه خطأً.**
 *
 * زعمَ سجلُّ v3.75.66 أنّ `useState('EGP')` **لا يقيسُه هذا الحارس** — وهذا
 * غيرُ صحيح. الحارسُ يرى كلَّ رمزٍ ثلاثىٍّ كبيرٍ فى سطرٍ يتكلّمُ عن عملةٍ
 * أياً كان موضعُه، ويُصنِّفُ `useState('EGP')` بعينِه تحتَ «وسيطٌ يُمرَّرُ
 * لدالّة» — وكانت الثلاثةُ والأربعون موضعاً **كلُّها** محسوبةً فعلاً داخلَ
 * الـ٢٠٠ المُثبَّتة، لا خارجَها. لم يُخترَعْ رقمٌ، لكنّ **وصفَ** الرقمِ كان
 * خاطئاً — والتصحيحُ هنا، لا فى محوِ ما كُتب.
 *
 * ثمانيةَ عشرَ موضعاً من الثلاثةِ والأربعين — عملةُ الشاشةِ الصريحة، بما
 * فيها موضعان كانا يمرّان عبر غلافٍ يخترعُ `'EGP'` (`hooks/use-currency.ts`،
 * فاتا من جردِ الملفّاتِ فى دفعةِ v3.75.66 لأنّهما لا يقرآن `localStorage`
 * مباشرةً) — صارت بذرةُ حالتِها تنادى `readAppCurrency()` نفسَها، لا أثراً
 * لاحقاً فقط. وسُدِّدَ بالمصادفةِ أثناءَ نفسِ التعديلِ ارتدادٌ صامتٌ واحدٌ
 * إضافىٌّ (تقريرُ bom-cost كان يخترعُ `'EGP'` بنفسِه عندَ غيابِ الكوكى).
 *
 *   ٢٠٠  المُثبَّتُ قبلَ الدفعة
 *   −١٨  عملةُ شاشةٍ صريحة: بذرةُ الحالةِ صارت تنادى البيتَ مباشرةً
 *   −١   ارتدادٌ صامتٌ سُدِّدَ بالمصادفةِ أثناءَ نفسِ التعديل (bom-cost)
 *   ───
 *   ١٨١  المقيسُ يومَ الشحن
 *
 * **وخمسةٌ وعشرون موضعاً من الثلاثةِ والأربعين ما زالت بذرتُها حرفاً** —
 * ليست عملةَ شاشةٍ أصلاً بل عملةَ شركةٍ أساسيّةً (تقرأُ عمودَ القاعدةِ
 * مباشرةً بدلَ مناداةِ بيتِ v3.75.65)، أو بياناتٍ خاصّةً بسجلٍّ بعينِه لا
 * تنتمى لأىِّ بيت، أو حالةً بلا أثرٍ يُصحِّحها إطلاقاً — **ومعدودٌ لا
 * مسكوتٌ عنه**، ودفعتُها التالية موضوعُها عملةُ القاعدة لا عملةُ الشاشة.
 */
/**
 * v3.75.68 — **بيتُ القاعدةِ يُنادَى مباشرةً أيضاً — لا بيتَ ثانٍ يتجاوزُه.**
 *
 * من الخمسةِ والعشرين موضعاً المؤجَّلةِ فى v3.75.67، تسعةَ عشرَ موضعاً كانت
 * فعلاً عملةَ الشركةِ الأساسيّةَ (لا عملةَ شاشةٍ)، وثلاثةٌ منها كانت تنادى
 * بيتَ v3.75.65 (`getBaseCurrency`) بالفعل — مباشرةً أو عبر دالّةٍ تنادى
 * البيتَ داخلَها — وتحتاجُ بذرةً فقط؛ وستّةَ عشرَ موضعاً كانت تتجاوزُ البيتَ
 * وتقرأُ عمودَ `companies.base_currency` مباشرةً (بعضُها عبر مسارِ API
 * مشتركٍ، `app/api/company-info/route.ts`، يخدمُ أكثرَ من شاشة) — فأُصلح
 * التجاوزُ لتنادى البيتَ، لا العمودَ. وبذرةُ الحالةِ فى كلٍّ منها **لا
 * تنادى `readAppCurrency()`** (تلك عملةُ الشاشةِ، مفهومٌ مختلفٌ تماماً)
 * بل تصيرُ سلسلةً فارغةً `''` — لأنّ بيتَ القاعدةِ نداءٌ غيرُ متزامنٍ
 * (RPC)، فلا بذرةَ متزامنةً صحيحةً تُوجَد أصلاً؛ والفراغُ الصادقُ خيرٌ من
 * عملةٍ مخترَعة، ولو لحظةً واحدة.
 *
 * وعطبٌ معمارىٌّ واحدٌ أُصلح معهنّ: `app/reports/fx-gains-losses/page.tsx`
 * كان يُلصِقُ بمبالغِ أرباحٍ/خسائرِ صرفٍ حقيقيّةٍ (من قيودٍ مرحَّلةٍ بعملةِ
 * القاعدةِ فعلاً) تسميةَ عملةِ **الشاشةِ** لا عملةِ **الشركةِ** — رقمٌ صحيحٌ
 * بعملةٍ خاطئةٍ على الشاشة. صار ينادى بيتَ القاعدةِ بدلَ بيتِ الشاشة.
 *
 * وموضعانِ اثنانِ استُبدل فيهما ارتدادٌ صامتٌ يخترعُ `'EGP'` (فى تعبيرِ
 * `||`) بنداءِ البيتِ أيضاً — لم يكونا بذرةَ `useState` لكنّهما نفسُ
 * العطبِ بعينِه فى موضعٍ آخَر.
 *
 *   ١٨١  المُثبَّتُ قبلَ الدفعة
 *   −١٩  «وسيطٌ يُمرَّرُ لدالّة»: تسعةَ عشرَ بذرةَ عملةِ قاعدةٍ صارت تنادى
 *        البيتَ (٣ بيتٌ سلفاً + بذرةٌ فقط، ١٦ بيتٌ يتجاوَزُ صُحِّح)
 *   −٢   «ارتدادٌ عن قيمةٍ صامتة»: فخّان يخترعانِ `'EGP'` عندَ الصمتِ
 *        استُبدلا بنداءِ البيت (`ar-by-currency`، `chart-of-accounts`)
 *   ───
 *   ١٦٠  المقيسُ يومَ الشحن
 *
 * **وسبعةٌ من الخمسةِ والعشرين مؤجَّلةٌ عمداً — ومعدودٌ لا مسكوتٌ عنه**:
 * `app/settings/page.tsx` (شاشةُ الإعداداتِ نفسُها) بيتُها ليس قراءةً فقط
 * بل نموذجُ تعديلِ عملةِ الشركةِ الأساسيّةِ ذاتُه، يكتبُها عبر إجراءِ
 * قاعدةِ بياناتٍ خاص (`change_base_currency`) — أعقدُ المواضعِ وأخطرُها
 * لأنّه يكتبُ لا يقرأُ فقط، ودفعتُه مستقلّةٌ بقرار. والباقى (بذرةُ
 * `originalSystemCurrency` فى نفسِ الشاشة، وعملتا الإرجاعِ فى
 * `bills/page.tsx`، وعملةُ التسجيلِ الجديدِ فى `auth/sign-up`، وعملةُ
 * السجلِّ الخاصِّ فى `expenses/[id]/edit`) بيانٌ خاصٌّ بسجلٍّ بعينِه أو
 * اختيارٌ لا شركةَ له بعدُ — ليست نفسَ المشكلةِ إطلاقاً، فلا تُصلَح.
 */
const PINNED_IMPLIED = 160
// **ونصُّ الفحصِ مواصفةٌ لا صنعة** — ولا يحتاجُ هذا الملفُّ استثناءً بالاسم:
// فخُّه الذاتىُّ يحملُ أمثلةً مكتوبةً حرفاً **ليُثبتَ أنّه يراها**، لكنّ جردَ
// البيتِ الواحدِ **لا يشملُ مجلّدَ `scripts` أصلاً** — وهذا مقيسٌ لا مُدَّعى:
// يُختبَرُ فى الفخِّ الذاتىِّ بنداءِ `keepPath` نفسِها. **واستثناءٌ لا يُشغَّلُ
// أبداً ليس استثناءً بل طمأنينةٌ كاذبة**، فلا يُكتَب.

// ───────────────────────────────────────────────────────────────────────────
// **والتعليقُ ليس تعليمة**: تُحجَبُ التعليقاتُ ويبقى طولُ النصِّ كما هو،
// فيبقى رقمُ السطرِ صادقاً.
// ───────────────────────────────────────────────────────────────────────────
function stripComments(src) {
  let out = "", i = 0
  const n = src.length
  while (i < n) {
    const c = src[i], d = src[i + 1]
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") { out += " "; i++ } continue }
    if (c === "/" && d === "*") {
      out += "  "; i += 2
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++ }
      if (i < n) { out += "  "; i += 2 }
      continue
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; out += c; i++
      while (i < n && src[i] !== q) {
        if (src[i] === "\\") { out += src[i]; i++; if (i < n) { out += src[i]; i++ } continue }
        out += src[i]; i++
      }
      if (i < n) { out += src[i]; i++ }
      continue
    }
    out += c; i++
  }
  return out
}

// (أ) خيارُ عملةٍ مُثبَّتٌ بنصّ: currency: 'EGP' · base_currency: "USD" · charge_currency: `EGP`
// والبادئةُ واللاحقةُ اختياريّتان — **وسقوطُ ذلك أوّلَ مرّةٍ أمسكَه الفخُّ الذاتىّ**.
const OPTION_RE = /\b\w*currency\w*\s*:\s*(['"`])([^'"`\n]{1,4})\1/gi
// (ب) قيمةٌ افتراضيّةٌ أو إسنادٌ يُثبِّتُ عملةً أو رمزَها
const DEFAULT_RE = /\b\w*currency\w*\s*(?::\s*string\s*)?=\s*(['"`])([^'"`\n]{1,4})\1/gi

// ───────────────────────────────────────────────────────────────────────────
// **ويُحكَمُ بالخاصّيّةِ لا بقائمةِ عملات**: لا يُبحَثُ عن «EGP» ولا عن أخواتِها
// — فحارسٌ يحفظُ أسماءَ العملاتِ يُلتَفُّ عليه بعملةٍ لم تُكتَبْ فى قائمتِه —
// بل عن **رمزٍ ثلاثىٍّ كبيرٍ بشكلِ ISO-4217** يجىءُ خلفَ أحدِ تلك العوامل،
// **وعلى سطرِه اسمٌ يقولُ إنّه عملة**. فلا يصرخُ على `lang || 'ARA'` ولا على
// `row.code === 'ABC'` فى شيفرةٍ لا تتكلّمُ عن مال — **وحارسٌ يصرخُ على
// البرىءِ يُطفَأ**.
//
// **ويُسمّى ما يُقاسُ لا أكثرَ منه** — وهذان مُعلَنانِ لا مسكوتٌ عنهما:
//   · رمزٌ بحروفٍ صغيرة (`|| 'egp'`) لا يراه هذا الحكم. مقيسٌ اليوم: صفر.
//   · رمزٌ فى سطرٍ **لا يذكرُ عملةً بأىِّ اسم** لا يراه كذلك. مقيسٌ اليوم: صفر
//     — وهو ثمنُ ألّا يصرخَ الحارسُ على البرىء.
// ───────────────────────────────────────────────────────────────────────────
const ISO_RE = /(['"`])([A-Z]{3})\1/g
const NAMES_CCY = /\b\w*(?:currency|ccy)\w*\b/i

// ───────────────────────────────────────────────────────────────────────────
// v3.75.65 — **وبحثٌ لا يجد ليس دليلَ غياب.**
//
// كان الحكمُ يشترطُ أن يذكرَ **سطرُ الموضعِ نفسُه** اسمَ عملة، فكان أعمى عن
// أصدقِ صورةٍ للاختراع: دالّةٌ اسمُها يقولُ إنّها تُعطى عملةً، ثمّ تُعيدُ
// حرفاً عندَ أىِّ تعثُّر:
//
//     function getAppCurrency() {
//       if (typeof window === 'undefined') return 'EGP'   ← لا يراه الحكمُ القديم
//     }
//
// **واسمُ الدالّةِ سياقٌ كسياقِ السطر**: من سمّى دالّتَه «عملةً» فكلُّ رمزٍ
// يُعيدُه منها عملةٌ. فوُسِّعَ السياقُ إلى **اسمِ الدالّةِ الحاوية**، فظهرَ
// سبعةَ عشرَ موضعاً كانت مستورةً — **والعددُ يزيدُ لأنّ العينَ اتّسعت لا
// لأنّ الدَّينَ كبِر**، وهذا يُقالُ ولا يُجمَّل.
// ───────────────────────────────────────────────────────────────────────────
const FN_HEAD_RE = /(?:function\s+([A-Za-z0-9_$]+)|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?function)/g

/** اسمُ أقربِ دالّةٍ حاويةٍ قبلَ الموضع — «» إن لم تُعرَف. */
function enclosingFunctionName(code, at) {
  FN_HEAD_RE.lastIndex = 0
  let name = ""
  let m
  while ((m = FN_HEAD_RE.exec(code)) !== null) {
    if (m.index >= at) break
    name = m[1] || m[2] || m[3] || ""
  }
  return name
}

/** مقدّمةُ الموضعِ **على سطرِه هو** — ولا يُحكَمُ على سطرٍ بسطرِ غيرِه. */
function linePrefix(code, at) {
  const b = code.slice(Math.max(0, at - 120), at)
  const cut = b.lastIndexOf("\n")
  return cut >= 0 ? b.slice(cut + 1) : b
}

/**
 * العاملُ الذى أدخلَ العملةَ — **للقراءةِ لا للحكم**: الحكمُ على العددِ كلِّه،
 * والتصنيفُ يقولُ أينَ يثقُلُ الدَّين. والترتيبُ مقصود: `??` تنتهى بعلامةِ
 * استفهامٍ فتُقرأُ ارتداداً لا فرعَ شرط. **ولا يُعَدَّدُ الشكلُ فيُفلِتَ ما لم
 * يُعَدَّدْ** — فما لم يقعْ على عاملٍ معروفٍ يُسمّى «موضعاً آخَر» ويُعَدُّ.
 */
function operatorBefore(pre) {
  if (/(\|\||\?\?)\s*$/.test(pre)) return "ارتدادٌ عن قيمةٍ صامتة"
  if (/[=!]==?\s*$/.test(pre)) return "مقارنةٌ يتفرّعُ عليها سلوك"
  if (/[?:]\s*$/.test(pre)) return "فرعُ شرطٍ"
  if (/[(,[]\s*$/.test(pre)) return "وسيطٌ يُمرَّرُ لدالّة"
  if (/\breturn\s*$/.test(pre)) return "قيمةٌ تُعادُ من دالّة"
  return "موضعٌ آخَر"
}

/** **ويرفضُ فى الاتّجاهَين**: زيادةٌ عطبٌ جديد، ونقصانٌ مكسبٌ لم يُثبَّت. */
function judgePin(found, pinned) {
  if (found > pinned) return "grew"
  if (found < pinned) return "shrank"
  return "ok"
}

/** هل الموضعُ داخلَ سياقِ تنسيقٍ نقدىّ؟ (نافذةٌ قبلَه وبعدَه) */
function looksLikeFormatting(code, at) {
  const w = code.slice(Math.max(0, at - 240), Math.min(code.length, at + 240))
  return /Intl\.NumberFormat|style\s*:\s*['"`]currency['"`]|toLocaleString/.test(w)
}

function lineOf(src, at) {
  let n = 1
  for (let i = 0; i < at && i < src.length; i++) if (src[i] === "\n") n++
  return n
}

/** يُرجعُ مواضعَ العملةِ المكتوبةِ حرفاً فى ملفٍّ واحد. */
function currencyLiterals(src) {
  const code = stripComments(src)
  const out = []
  const seen = new Set()
  const claimed = new Set()
  for (const re of [OPTION_RE, DEFAULT_RE]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(code)) !== null) {
      if (seen.has(m.index)) continue
      seen.add(m.index)
      // **ولا يُعَدُّ الموضعُ مرّتَين**: يُسجَّلُ موضعُ علامةِ الاقتباسِ نفسِها
      // ليُعرَفَ لاحقاً أنّه محكومٌ سلفاً بالنمطَينِ القائمَين.
      claimed.add(m.index + m[0].length - m[2].length - 2)
      out.push({
        line: lineOf(code, m.index),
        text: m[0].trim(),
        kind: "direct",
        why: looksLikeFormatting(code, m.index) ? "تنسيقُ عرض" : "قيمةٌ تُكتَبُ أو تُرسَل",
      })
    }
  }
  ISO_RE.lastIndex = 0
  let h
  while ((h = ISO_RE.exec(code)) !== null) {
    if (claimed.has(h.index)) continue
    const pre = linePrefix(code, h.index)
    // **واسمُ الدالّةِ سياقٌ كسياقِ السطر** (v3.75.65)
    if (!NAMES_CCY.test(pre) && !NAMES_CCY.test(enclosingFunctionName(code, h.index))) continue
    const op = operatorBefore(pre)
    out.push({
      line: lineOf(code, h.index),
      text: (pre.trim().slice(-48) + h[0]).trim(),
      kind: "implied",
      why: op,
    })
  }
  return out.sort((a, b) => a.line - b.line)
}

// ───────────────────────────────────────────────────────────────────────────
// v3.75.66 — **وسؤالُ الاسمِ ليس سؤالَ الباب**: الماسحُ أعلاه يصرخُ على رمزٍ
// ثلاثىٍّ مكتوبٍ حرفاً، لا على **بناءِ بيتٍ ثانٍ** — قراءةُ
// `localStorage.getItem('app_currency')` مباشرةً لا تحملُ بالضرورة رمزَ
// عملةٍ حرفياً (فقد تُفوَّضُ نتيجتُها بلا ارتداد)، فتُفلِتُ من كلِّ شبكةٍ
// أعلاه. فهذا فخٌّ باسمِ الملفِّ لا بنمطِ السطر: يُسمّى البيتُ الواحدُ
// وبيوتُه المُفوَّضةُ بأسمائها، ويُصرَخُ إن غابَ أحدُها عن نداءِ الآخَر أو
// عادَ يقرأُ الجيبَ بنفسِه — **ولا يُبنى بيتٌ ثانٍ**.
// ───────────────────────────────────────────────────────────────────────────
const ONE_HOME_FILE = "lib/currency-service.ts"
const ONE_HOME_FN = "readAppCurrency"
const DELEGATE_FILES = ["lib/currency-utils.ts", "lib/currency-converter.ts", "lib/exchange-rates.ts"]
const DIRECT_READ_RE = /localStorage\.getItem\(\s*(['"`])app_currency\1\s*\)/

/** يتحقّقُ أنّ بيتَ الشاشةِ الواحد قائمٌ وأنّ بيوتَه المُفوَّضةَ تنادِيه فعلاً لا تقرأُ الجيبَ ثانيةً. */
function checkOneHomeDelegation(files) {
  const byRel = new Map(files.map((f) => [f.rel, f.src]))
  const errors = []

  const homeSrc = byRel.get(ONE_HOME_FILE)
  if (!homeSrc || !new RegExp("function\\s+" + ONE_HOME_FN + "\\s*\\(").test(stripComments(homeSrc))) {
    errors.push(ONE_HOME_FILE + " — لا يحوى " + ONE_HOME_FN + "(): البيتُ الواحدُ غائب.")
  }

  for (const rel of DELEGATE_FILES) {
    const src = byRel.get(rel)
    if (!src) {
      errors.push(rel + " — لم يُقرأ من المستودع: أهو غابَ أم رُحِّل؟")
      continue
    }
    const code = stripComments(src)
    if (!new RegExp(ONE_HOME_FN + "\\s*\\(").test(code)) {
      errors.push(rel + " — لا ينادى " + ONE_HOME_FN + "(): كفَّ عن التفويضِ للبيتِ الواحد.")
    }
    if (DIRECT_READ_RE.test(code)) {
      errors.push(rel + " — يقرأُ localStorage['app_currency'] مباشرةً: عادَ بيتٌ ثانٍ.")
    }
  }
  return errors
}

// ───────────────────────────────────────────────────────────────────────────
// **وفخٌّ لا يُشغَّل ليس فخّاً**
// ───────────────────────────────────────────────────────────────────────────
function selftest() {
  let bad = 0
  let cases = 0
  const t = (label, got, want) => {
    cases++
    const ok = JSON.stringify(got) === JSON.stringify(want)
    if (!ok) bad++
    console.log((ok ? "  ok  " : "  X   ") + label + "  (توقّعتُ " + JSON.stringify(want) + " فجاء " + JSON.stringify(got) + ")")
  }
  const n = (s) => currencyLiterals(s).length
  const why = (s) => currencyLiterals(s).map((x) => x.why)

  t("يرى خيارَ عملةٍ مكتوباً حرفاً", n(`new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' })`), 1)
  t("ويراه بعلامةٍ مزدوجة", n(`{ currency: "USD" }`), 1)
  t("ويرى الاسمَ المركَّب base_currency", n(`{ base_currency: "EGP" }`), 1)
  t("ويرى charge_currency", n(`{ charge_currency: 'EGP' }`), 1)
  t("ويرى قيمةً افتراضيّةً تُثبِّتُ عملة", n(`function f(amount, currency = "EGP") {}`), 1)
  t("ويراها بنوعٍ معلَن", n(`function f(a: number, currency: string = "EGP") {}`), 1)
  t("ويرى رمزاً افتراضيّاً مكتوباً", n(`const g = (a, currencySymbol = '£') => a`), 1)

  t("ولا يحكمُ على عملةٍ مُستقبَلةٍ بالاختصار", n(`new Intl.NumberFormat(l, { style: 'currency', currency })`), 0)
  t("ولا على عملةٍ من متغيّر", n(`{ style: 'currency', currency: currencyCode }`), 0)
  t("ولا على بيتِ المفرداتِ — يعرِّفُ ولا يقرِّر", n(`const CURRENCIES = { EGP: { symbol: '£' }, USD: { symbol: '$' } }`), 0)
  t("ولا على قراءةٍ من صفّ", n(`const c = row.currency || fallbackFromCompany`), 0)
  t("ولا على ذكرٍ داخل تعليقٍ سطرىّ — التعليقُ ليس تعليمة", n(`// currency: 'USD'`), 0)
  t("ولا داخلَ تعليقٍ كتلىّ", n(`/* currency: "EGP" */ const a = 1`), 0)
  t("ولا على حقلٍ ليس عملة", n(`{ country: 'EGP' }`), 0)
  t("ويقبلُ ملفّاً فارغاً بلا صراخ", n(``), 0)

  t("ويُسمّى الأثرَ تنسيقاً حين يكونُ تنسيقاً", why(`new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' })`), ["تنسيقُ عرض"])
  t("ويُسمّيه قيمةً تُكتَبُ حين لا تنسيقَ حولَه", why(`await supabase.from('bills').insert({ currency: 'EGP' })`), ["قيمةٌ تُكتَبُ أو تُرسَل"])
  t("ويقولُ رقمَ السطرِ صادقاً بعدَ تعليقٍ كتلىّ",
    currencyLiterals(`/* أوّل\nثانٍ */\nconst x = { currency: 'EGP' }`).map((v) => v.line), [3])
  t("ولا يعدُّ الموضعَ مرّتَين", n(`const currency = 'EGP'; const o = { currency: 'EGP' }`), 2)

  // ── v3.75.58 — **والارتدادُ اختراعٌ مؤجَّل** ─────────────────────────────
  t("ويرى ارتداداً يكتبُ عملةً حرفاً", n(`const c = row.currency || 'EGP'`), 1)
  t("ويراه بعاملِ الصمتِ ??", n(`{ p_currency_code: body.currency_code ?? 'EGP' }`), 1)
  t("ويرى مقارنةً يتفرّعُ عليها سلوك", n(`if (baseCurrency === 'EGP') { inBase() }`), 1)
  t("ويراها بالنفى", n(`const s = payCcy !== "EGP" ? a : b`), 1)
  t("ويرى فرعَ شرطٍ يكتبُ عملة", n(`const displayCurrency = isLocal ? 'EGP' : other`), 1)
  t("ويرى الموضعَينِ فى سطرِ الحارسِ الجانبىِّ للعرضِ الأوّل",
    n(`const c = typeof window !== 'undefined' ? (localStorage.getItem('app_currency') || 'EGP') : 'EGP'`), 2)
  t("ويُسمّى العاملَ الذى أدخلَها", why(`const c = row.currency || 'EGP'`), ["ارتدادٌ عن قيمةٍ صامتة"])
  t("ويُسمّى المقارنةَ مقارنةً — وهى أثقلُ", why(`if (baseCurrency === 'EGP') {}`), ["مقارنةٌ يتفرّعُ عليها سلوك"])

  // **وحارسٌ يصرخُ على البرىءِ يُطفَأ**
  t("ولا يصرخُ على ارتدادٍ ليس عملةً", n(`const lang = opts.lang || 'ARA'`), 0)
  t("ولا على مقارنةٍ لا تتكلّمُ عن مال", n(`if (row.code === 'ABC') {}`), 0)
  t("ولا على رمزٍ ثلاثىٍّ فى سطرٍ لا يُسمّى عملةً — وهو المُعلَنُ أعلاه", n(`const c = x || 'EGP'`), 0)
  t("ولا على رمزٍ صغيرِ الحروف — وهو المُعلَنُ الثانى", n(`const c = row.currency || 'egp'`), 0)

  // **ولا يُعَدَّدُ الشكلُ فيُفلِتَ ما لم يُعَدَّدْ**
  t("ويرى وسيطاً يُمرَّرُ لدالّة", n(`const [currency, setCurrency] = useState('EGP')`), 1)
  t("ويُسمّيه وسيطاً", why(`const [currency, setCurrency] = useState('EGP')`), ["وسيطٌ يُمرَّرُ لدالّة"])
  t("ويرى وسيطاً ثانياً بعدَ فاصلة", n(`formatCurrency(amount, 'SAR')`), 1)
  t("ويرى قيمةً تُعادُ من دالّة", n(`function baseCurrencyOf() { return 'EGP' }`), 1)
  t("ويُسمّيها كذلك", why(`function baseCurrencyOf() { return 'EGP' }`), ["قيمةٌ تُعادُ من دالّة"])
  t("ويرى ما لم يقعْ على عاملٍ معروف", n(`<Row label="Currency" value="USD" />`), 1)
  t("ولا يصرخُ على وسيطٍ فى سطرٍ لا يُسمّى عملة", n(`const [lang, setLang] = useState('ARA')`), 0)
  t("ولا يعدُّ خيارَ العملةِ مرّتَين — والمحكومُ سلفاً لا يُحاكَمُ ثانيةً", n(`{ currency: 'EGP' }`), 1)

  // ── v3.75.65 — **واسمُ الدالّةِ سياقٌ كسياقِ السطر** ────────────────────
  t("يرى حرفاً يُعادُ من دالّةٍ اسمُها يقولُ إنّها عملة",
    n(`function getAppCurrency() {\n  if (typeof window === 'undefined') return 'EGP'\n  return read()\n}`), 1)
  t("ويراه فى دالّةِ سهمٍ مُسمّاة",
    n(`const baseCurrencyOf = () => {\n  try { return read() } catch { return 'EGP' }\n}`), 1)
  t("ويُسمّيه قيمةً تُعادُ من دالّة",
    why(`function getAppCurrency() {\n  return 'EGP'\n}`), ["قيمةٌ تُعادُ من دالّة"])
  t("ولا يصرخُ على حرفٍ فى دالّةٍ لا شأنَ لها بعملة — وحارسٌ يصرخُ على البرىءِ يُطفَأ",
    n(`function detectLang() {\n  return 'ARA'\n}`), 0)
  t("ولا على رمزٍ ثلاثىٍّ فى دالّةٍ اسمُها ليس عملةً",
    n(`function pickCountry() {\n  return 'EGP'\n}`), 0)
  t("ويعرفُ اسمَ الدالّةِ الحاوية", enclosingFunctionName(`function getAppCurrency() {\n  return 1\n}`, 40), "getAppCurrency")
  t("ولا يدَّعى اسماً حيث لا دالّة", enclosingFunctionName(`const x = 1\n`, 8), "")

  // **وفحصٌ يمكنُ تخطّيه ليس فحصاً**: حكمُ التثبيتِ نفسُه يُختبَرُ
  t("يمرُّ حين يُطابقُ الرقمُ المُثبَّت", judgePin(36, 36), "ok")
  t("ويرفضُ موضعاً جديداً", judgePin(37, 36), "grew")
  t("ويرفضُ نقصاً لم يُثبَّتْ — ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه", judgePin(35, 36), "shrank")

  // ── v3.75.66 — **وسؤالُ الاسمِ ليس سؤالَ الباب**: البيتُ الواحدُ وبيوتُه المُفوَّضة ──
  const HOME_OK = { rel: "lib/currency-service.ts", src: "export function readAppCurrency() {\n  if (typeof window === 'undefined') return ''\n  return localStorage.getItem('app_currency') || ''\n}" }
  const DELEGATE_OK = (rel) => ({ rel, src: "import { readAppCurrency } from './currency-service'\nexport function getAppCurrency() {\n  return readAppCurrency() || 'EGP'\n}" })
  const delegatesOk = DELEGATE_FILES.map(DELEGATE_OK)

  t("يمرُّ حين يقومُ البيتُ الواحدُ وتُفوِّضُ البيوتُ الثلاثةُ إليه",
    checkOneHomeDelegation([HOME_OK, ...delegatesOk]), [])

  t("ويصرخُ إن غابَ البيتُ الواحدُ نفسُه",
    checkOneHomeDelegation([{ rel: ONE_HOME_FILE, src: "export function somethingElse() {}" }, ...delegatesOk]).length > 0, true)

  t("ويصرخُ إن عادَ أحدُ البيوتِ الثلاثةِ يقرأُ الجيبَ مباشرةً بدلاً من التفويض (وهو أيضاً لم يعُدْ ينادى البيتَ الواحد، فيُصرَخُ عليه بالاثنين معاً)",
    checkOneHomeDelegation([HOME_OK,
      { rel: "lib/currency-utils.ts", src: "export function getAppCurrency() {\n  return localStorage.getItem('app_currency') || 'EGP'\n}" },
      DELEGATE_OK("lib/currency-converter.ts"), DELEGATE_OK("lib/exchange-rates.ts")]),
    ["lib/currency-utils.ts — لا ينادى readAppCurrency(): كفَّ عن التفويضِ للبيتِ الواحد.",
     "lib/currency-utils.ts — يقرأُ localStorage['app_currency'] مباشرةً: عادَ بيتٌ ثانٍ."])

  t("ويصرخُ بواحدةٍ فقط حين يقرأُ الجيبَ مباشرةً كمصدرٍ احتياطىٍّ بعدَ أن نادى البيتَ الواحد أصلاً",
    checkOneHomeDelegation([HOME_OK,
      { rel: "lib/currency-utils.ts", src: "import { readAppCurrency } from './currency-service'\nexport function getAppCurrency() {\n  return readAppCurrency() || localStorage.getItem('app_currency') || 'EGP'\n}" },
      DELEGATE_OK("lib/currency-converter.ts"), DELEGATE_OK("lib/exchange-rates.ts")]),
    ["lib/currency-utils.ts — يقرأُ localStorage['app_currency'] مباشرةً: عادَ بيتٌ ثانٍ."])

  t("ويصرخُ إن كفَّ بيتٌ عن نداءِ البيتِ الواحدِ أصلاً (بلا قراءةٍ مباشرةٍ حتّى)",
    checkOneHomeDelegation([HOME_OK,
      { rel: "lib/currency-utils.ts", src: "export function getAppCurrency() {\n  return 'EGP'\n}" },
      DELEGATE_OK("lib/currency-converter.ts"), DELEGATE_OK("lib/exchange-rates.ts")]),
    ["lib/currency-utils.ts — لا ينادى readAppCurrency(): كفَّ عن التفويضِ للبيتِ الواحد."])

  t("ويصرخُ إن غابَ أحدُ الملفّاتِ الثلاثةِ من الجردِ كلِّيّةً",
    checkOneHomeDelegation([HOME_OK, DELEGATE_OK("lib/currency-utils.ts"), DELEGATE_OK("lib/currency-converter.ts")]).length > 0, true)

  // **ونصُّ الفحصِ مواصفةٌ لا صنعة** — والجردُ لا يبلغُ مجلّدَ الحرّاسِ فلا يعدُّ نفسَه.
  // وهذا يُقاسُ بنداءِ البيتِ نفسِه، لا يُدَّعى.
  t("والجردُ لا يشملُ مجلّدَ الحرّاس — فلا يعدُّ الفحصُ نفسَه", keepPath("scripts/x.js", NOT_SHIPPED), false)
  t("ويشملُ شيفرةَ الشاشاتِ فعلاً — وبحثٌ لا يجد ليس دليلَ غياب", keepPath("app/page.tsx", NOT_SHIPPED), true)
  t("ويشملُ lib وcomponents وhooks", [keepPath("lib/u.ts", NOT_SHIPPED), keepPath("components/c.tsx", NOT_SHIPPED), keepPath("hooks/h.ts", NOT_SHIPPED)], [true, true, true])
  t("ولا يشملُ اختباراً لا يُشحَن", keepPath("tests/a.test.ts", NOT_SHIPPED), false)

  console.log("  الفخُّ الذاتىّ: " + cases + " اتّجاهاً، " + (bad ? bad + " منها خاطئ." : "كلُّها صحيحة."))
  process.exit(bad ? 1 : 0)
}

if (process.argv.includes("--selftest")) selftest()

// ───────────────────────────────────────────────────────────────────────────
// الحكمُ على المستودع
// ───────────────────────────────────────────────────────────────────────────
let census
try {
  census = projectCodeFiles()
} catch (e) {
  console.error("X " + ((e && e.message) || e))
  process.exit(1)
}

const found = []
for (const f of census.files) {
  for (const hit of currencyLiterals(f.src)) found.push({ rel: f.rel, ...hit })
}
const direct = found.filter((x) => x.kind === "direct")
const implied = found.filter((x) => x.kind === "implied")
const byOperator = {}
for (const x of implied) byOperator[x.why] = (byOperator[x.why] || 0) + 1

console.log(
  "  ملفّاتُ شيفرةٍ من المستودع: " + census.files.length +
  "   ·   عملةٌ مكتوبةٌ خياراً أو إسناداً: " + direct.length + " (المُثبَّت " + PINNED + ")" +
  "   ·   ومكتوبةٌ خلفَ عامل: " + implied.length + " (المُثبَّت " + PINNED_IMPLIED + ")"
)
for (const k of Object.keys(byOperator).sort()) console.log("      · " + k + ": " + byOperator[k])

const CURE =
  "  عملةُ الشركةِ صفةٌ فى صفِّها لا نصٌّ فى الشيفرة، ونحن نبنى مشروعاً عالميّاً.\n" +
  "  والاختيارُ محفوظٌ سلفاً فى companies.base_currency، وقارئُه الصحيحُ:\n" +
  "      lib/currency-service.ts::getBaseCurrency(supabase, companyId)\n" +
  "  فنادِه ومرِّرِ العملةَ، أو استقبلْها وسيطاً — ولا تُثبِّتْها هنا.\n" +
  "  ولا تُصلحْها إلى lib/exchange-rates.ts::getBaseCurrency() — فذلك بيتٌ مهجورٌ\n" +
  "  يقرأُ من localStorage ويُعيدُ 'EGP'، **ولا يُصلَحُ عطبٌ بعطبٍ آخَر**."

function verdict(label, rows, pinned, konst) {
  const j = judgePin(rows.length, pinned)
  if (j === "grew") {
    console.error("\nX زادت " + label + ": " + rows.length + " والمُثبَّتُ " + pinned + " — **ولا تُسمّى عملةٌ بعينِها**.\n" + CURE)
    for (const x of rows) console.error("      - " + x.rel + ":" + x.line + "   [" + x.why + "]   " + x.text)
    return 1
  }
  if (j === "shrank") {
    console.error(
      "\nX نقصت " + label + " إلى " + rows.length + " والمُثبَّتُ " + pinned +
      " — **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه**.\n" +
      "  أنزِلِ الرقمَ فى الدفعةِ التى كسبَتْه: const " + konst + " = " + rows.length
    )
    return 1
  }
  return 0
}

let bad = 0
bad += verdict("العملةُ المكتوبةُ خياراً أو إسناداً", direct, PINNED, "PINNED")
bad += verdict("العملةُ المكتوبةُ خلفَ عامل", implied, PINNED_IMPLIED, "PINNED_IMPLIED")

const delegationErrors = checkOneHomeDelegation(census.files)
if (delegationErrors.length) {
  console.error("\nX بيتُ الشاشةِ الواحدِ للعملةِ (readAppCurrency) مكسورٌ — **ولا يُبنى بيتٌ ثانٍ**:")
  for (const e of delegationErrors) console.error("      - " + e)
  bad += 1
}

if (bad) process.exit(1)

console.log(
  "+ لا موضعَ جديدٌ يُسمّى عملةً بعينِها (" + direct.length + " خياراً أو إسناداً، و" + implied.length +
  " خلفَ عامل؛ الحكمُ بموضعِ القرارِ لا بالاسم، ولا يُحاكَمُ من يستقبلُها، ولا بيتُ المفردات، والتعليقُ محجوب)."
)
console.log(
  "  ! ومعدودٌ لا مسكوتٌ عنه — يُسدَّدون على دفعاتٍ مقيسة، وعنوانُ السدادِ واحد:\n" +
  "      lib/currency-service.ts::getBaseCurrency(supabase, companyId)   (لا البيتُ المهجورُ فى lib/exchange-rates.ts)"
)
for (const x of found) console.log("      - " + x.rel + ":" + x.line + "   [" + x.why + "]   " + x.text)
process.exit(0)

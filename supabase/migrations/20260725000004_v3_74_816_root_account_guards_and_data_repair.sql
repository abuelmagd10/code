-- ============================================================================
-- v3.74.816 — حارسا الحساب التجميعى + إصلاح البيانات القائمة
-- ============================================================================
-- **توضيح المالك للقاعدة المؤسِّسة (25 يوليو)**:
--   «الأساس هو الإصلاحات والفجوات بحلّها لعدم تكرارها فى المستقبل فى
--    المشروع، **مع إصلاح البيانات المتواجدة فى الشركات** وذلك للتأكد من
--    إصلاح الثغرات والفجوات على مستوى المشروع.»
--
-- أى: إصلاح النظام أولاً (حتى لا تتكرر الفجوة فى أى شركة)، ثم تصحيح ما
-- خلّفته الفجوة من بيانات — لأن نظافة البيانات هى الدليل العملى على أن
-- الإصلاح نجح فعلاً. هذه الهجرة تنفّذ الشقّين معاً.
--
-- ─── الفجوة المكتشَفة ───────────────────────────────────────────────────────
-- أثناء التحقق من إصلاح تصنيف الإيراد (815) ظهر أن ثلاثة أصناف مربوطة
-- بـ«4000 الإيرادات» و«5000 المصروفات» — وهما **رأسا شجرة الحسابات**
-- (level 1، حسابان تجميعيان بحتان لا يُرحَّل عليهما فى أى نظام محاسبى).
-- ولأن بانى القيد فى القاعدة يقرأ `products.income_account_id`، كانت أول
-- فاتورة تُرحَّل عبره لأحد هذه الأصناف ستضع الإيراد على رأس الشجرة —
-- فتنهار قائمة الدخل (المجموع يساوى نفسه مرتين) ويستحيل تحليل الإيراد.
--
-- ملاحظة دقيقة: 4100/4200/5100/5200 لها أبناء (مردودات/خصومات) لكنها
-- حسابات ترحيل مشروعة، فالحارس يرفض **رأس الشجرة فقط**:
-- `parent_id IS NULL AND له أبناء`.
-- ============================================================================

-- ─── (1) النظام: لا ترحيل على حساب تجميعى رئيسى ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_guard_no_root_account_posting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_code text; v_name text; v_is_root boolean;
BEGIN
  SELECT c.account_code, c.account_name,
         (c.parent_id IS NULL AND EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.parent_id = c.id))
    INTO v_code, v_name, v_is_root
  FROM chart_of_accounts c WHERE c.id = NEW.account_id;

  IF COALESCE(v_is_root, false) THEN
    RAISE EXCEPTION 'لا يجوز الترحيل على حساب تجميعى رئيسى (% %) — اختر حساباً تفصيلياً تابعاً له. | Posting to a roll-up header account (% %) is not allowed; choose one of its detail accounts.',
      v_code, v_name, v_code, v_name
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

-- BEFORE INSERT فقط: لا نُبطل سطراً تاريخياً قائماً، نمنع الجديد.
DROP TRIGGER IF EXISTS trg_no_root_account_posting ON journal_entry_lines;
CREATE TRIGGER trg_no_root_account_posting
BEFORE INSERT ON public.journal_entry_lines
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_no_root_account_posting();

-- ─── (2) النظام: لا ربط صنف بحساب تجميعى رئيسى ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_guard_product_accounts_not_root()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_bad text;
BEGIN
  SELECT c.account_code || ' ' || c.account_name INTO v_bad
  FROM chart_of_accounts c
  WHERE c.id IN (NEW.income_account_id, NEW.expense_account_id)
    AND c.parent_id IS NULL
    AND EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.parent_id = c.id)
  LIMIT 1;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'لا يجوز ربط الصنف بحساب تجميعى رئيسى (%) — اختر حساباً تفصيلياً. | An item cannot be linked to a roll-up header account (%); choose a detail account.',
      v_bad, v_bad
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_product_accounts_not_root ON products;
CREATE TRIGGER trg_product_accounts_not_root
BEFORE INSERT OR UPDATE OF income_account_id, expense_account_id ON public.products
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_product_accounts_not_root();

-- بروفة على قاعدة الاختبار قبل الإنتاج (ثم rollback):
--   ترحيل على حساب رئيسى: رُفض ✓ | ترحيل على تفصيلى: مرّ ✓ | ربط صنف برئيسى: رُفض ✓

-- ============================================================================
-- إصلاح البيانات القائمة — بمقتضى توضيح المالك، ولكل الشركات لا شركة بعينها
-- ============================================================================

-- (أ) كل صنف يشير لرأس الشجرة يُنقل للحساب التفصيلى المقابل (4100 / 5100)
WITH roots AS (
  SELECT c.id, c.company_id FROM chart_of_accounts c
  WHERE c.parent_id IS NULL
    AND EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.parent_id = c.id)
),
targets AS (
  SELECT p.id AS product_id,
         (SELECT c2.id FROM chart_of_accounts c2
           WHERE c2.company_id = p.company_id AND c2.account_code = '4100' LIMIT 1) AS new_income,
         (SELECT c3.id FROM chart_of_accounts c3
           WHERE c3.company_id = p.company_id AND c3.account_code = '5100' LIMIT 1) AS new_expense,
         (p.income_account_id  IN (SELECT id FROM roots)) AS bad_income,
         (p.expense_account_id IN (SELECT id FROM roots)) AS bad_expense
  FROM products p
  WHERE p.income_account_id IN (SELECT id FROM roots)
     OR p.expense_account_id IN (SELECT id FROM roots)
)
UPDATE products p
SET income_account_id  = CASE WHEN t.bad_income  AND t.new_income  IS NOT NULL THEN t.new_income  ELSE p.income_account_id  END,
    expense_account_id = CASE WHEN t.bad_expense AND t.new_expense IS NOT NULL THEN t.new_expense ELSE p.expense_account_id END
FROM targets t
WHERE p.id = t.product_id;
-- نُفّذ على الإنتاج: «ماتور»، «متوسيكل»، «booto» ⇒ 4100 / 5100

-- (ب) الخامات لا تُباع ⇒ سعر بيعها صفر (نظير إخفاء الحقل فى الواجهة 815)
UPDATE products SET unit_price = 0, updated_at = NOW()
WHERE product_type = 'raw_material' AND COALESCE(unit_price, 0) <> 0;

-- (ج) كل مساهم قائم بلا حساب رأس مال أو مسحوبات: يُنشأ ويُربط
--     (نظير حارس provision_shareholder_accounts للمساهمين الجدد — 815)
DO $$
DECLARE r record; v_cap uuid; v_draw uuid; v_code text;
BEGIN
  FOR r IN SELECT s.* FROM shareholders s
           WHERE s.capital_account_id IS NULL OR s.drawings_account_id IS NULL
  LOOP
    IF r.capital_account_id IS NULL THEN
      SELECT id INTO v_cap FROM chart_of_accounts
       WHERE company_id = r.company_id AND account_name = 'رأس مال - ' || r.name;
      IF v_cap IS NULL THEN
        SELECT '31' || LPAD((COALESCE(MAX(SUBSTRING(account_code FROM 3)::int), 0) + 1)::text, 2, '0')
          INTO v_code FROM chart_of_accounts
         WHERE company_id = r.company_id AND account_code ~ '^31[0-9]{2}$' AND account_code <> '3100';
        INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type,
                                       normal_balance, parent_id, level, is_active, is_system)
        VALUES (r.company_id, COALESCE(v_code, '3101'), 'رأس مال - ' || r.name, 'equity', 'credit',
                (SELECT id FROM chart_of_accounts WHERE company_id = r.company_id AND account_code = '3100'),
                3, TRUE, TRUE)
        RETURNING id INTO v_cap;
      END IF;
    ELSE v_cap := r.capital_account_id; END IF;

    IF r.drawings_account_id IS NULL THEN
      SELECT id INTO v_draw FROM chart_of_accounts
       WHERE company_id = r.company_id AND account_name = 'مسحوبات - ' || r.name;
      IF v_draw IS NULL THEN
        SELECT '36' || LPAD((COALESCE(MAX(SUBSTRING(account_code FROM 3)::int), 0) + 1)::text, 2, '0')
          INTO v_code FROM chart_of_accounts
         WHERE company_id = r.company_id AND account_code ~ '^36[0-9]{2}$' AND account_code <> '3600';
        INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type,
                                       normal_balance, sub_type, parent_id, level, is_active, is_system)
        VALUES (r.company_id, COALESCE(v_code, '3601'), 'مسحوبات - ' || r.name, 'equity', 'debit', 'drawings',
                (SELECT id FROM chart_of_accounts WHERE company_id = r.company_id AND account_code = '3600'),
                3, TRUE, TRUE)
        RETURNING id INTO v_draw;
      END IF;
    ELSE v_draw := r.drawings_account_id; END IF;

    UPDATE shareholders SET capital_account_id = v_cap, drawings_account_id = v_draw WHERE id = r.id;
  END LOOP;
END $$;

-- (د) قيد إعادة تصنيف الإيراد — **يدوى ومقصور على الحالة المكتشفة**
-- ---------------------------------------------------------------------------
-- INV-2026-00001: خدمة «تقشير» بـ500 رُحّلت لـ«4100 إيرادات المبيعات» بدل
-- «4200 إيرادات الخدمات» (فجوة 815-د: بانى القيد فى TS كان يتجاهل حساب
-- إيراد الصنف). لا يُعدَّل قيد مرحّل ولا يُحذف — يُصحَّح بقيد إعادة تصنيف:
--
--     JE-000063 (2026-07-10)
--       مدين  4100 إيرادات المبيعات      500.00
--         دائن 4200 إيرادات الخدمات              500.00
--
-- أثره على صافى الربح **صفر** (تبويب داخل الإيرادات فقط)، وعلى النقدية صفر.
-- التحقق بعده: ميزان المراجعة 0.00 ✓ · صافى الربح 2,434.03 كما هو ✓ ·
-- إيرادات الخدمات 1,900.00 (500 + 700 + 700) ✓ · إيرادات المبيعات 791.39 ✓
--
-- لم يُدرَج القيد كـSQL هنا لأنه خاص بمعرّفات شركة بعينها؛ نُفّذ على الإنتاج
-- عبر بوابة app.allow_direct_post وموثَّق أعلاه بالكامل مع أرقام التحقق.
-- ---------------------------------------------------------------------------

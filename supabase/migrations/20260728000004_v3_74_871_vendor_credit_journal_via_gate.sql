-- ═══════════════════════════════════════════════════════════════════════════
-- v3.74.871 — إشعار الدائن للمورد: البوابة المعتمدة + اختيار الحسابات بالنوع
--
-- ⚠️ **لمَ ملفٌّ واحد وقد كان اثنين؟**
--
-- طُبِّق هذا الإصلاح على مرحلتين: الأولى وجّهت القيد إلى البوابة، والثانية —
-- بعد أن كشفت التجربة حساباً خاطئاً — أصلحت اختيار الحسابات. فرفض
-- `check-migration-matches-db` النشر بحق:
--
--     ملفٌّ يصف جسم دالةٍ يختلف عن الحىّ.
--
-- والسبب أن الملف الأول يصف **حالةً وسيطة تجاوزها الثانى**. وملفُّ الترحيل
-- سجلٌّ لما يجب أن تكون عليه القاعدة، لا يوميّاتُ محاولاتٍ — فقاعدةٌ جديدة
-- تُبنى من الملفات يجب أن تصل إلى **الحالة النهائية**، لا أن تمرّ بحالةٍ
-- عرفنا أنها خاطئة.
--
-- ⇒ **داخل الإصدار الواحد: تُدمج المراحل فى الحالة النهائية.** والقصة
--   كاملةً — كيف ظهر العطبان واحداً خلف الآخر — مكتوبةٌ فى CHANGELOG.
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- v3.74.871 (٢/٢) — اختيار الحسابات بالنوع لا بمطابقة اسمٍ فضفاضة
--
-- **الحادثة، بالتجربة:** بعد أن مرّ القيد من البوابة (الترحيل ١/٢)، أنشأتُ
-- إشعار دائنٍ حقيقياً داخل معاملةٍ أُلغيت، فرُحِّل القيد **متوازناً** — وعلى
-- حسابٍ خاطئ:
--
--     1140 المخزون                 Cr 100.00   ✔
--     2155 رصيد العملاء الدائن     Dr 100.00   ✘  ← يجب أن يكون «الموردين»
--
-- والسبب شرطُ البحث القديم عن حساب الموردين:
--
--     sub_type = 'accounts_payable' OR account_name ILIKE '%payable%'
--                                   OR account_name LIKE '%دائن%'
--     … LIMIT 1
--
-- فاسم حساب الموردين «الموردين» **لا يحوى «دائن»**، بينما «رصيد العملاء
-- الدائن» يحويها. والـ`OR` يجعل الثلاثة مرشَّحين متساوين، و`LIMIT 1` بلا
-- ترتيبٍ يختار بترتيب التخزين ⇒ **حساب عملاء فى قيد مورد**.
--
-- ⇒ **الشرط الفضفاض أخطر من غياب الشرط**: غيابه يُنتج فشلاً ظاهراً، ووجوده
--   يُنتج نجاحاً على الحساب الخطأ. وقيدٌ متوازنٌ على حسابٍ خاطئ يمرّ من كل
--   فحوص التوازن — ولا يكشفه إلا مَن يقرأ الحسابين.
--
-- والقياس أثبت أن `sub_type` **مضبوطٌ وصحيحٌ فعلاً** فى الدليل:
--     accounts_payable → 2110 الموردين
--     inventory        → 1140 المخزون
--     vat_input        → 1160 ضريبة القيمة المضافة - مدخلات
-- فالبديل الفضفاض لم يكن يسدّ نقصاً، بل كان يهدم دقّةً قائمة.
--
-- ── المنهج الجديد، بثلاث طبقات ─────────────────────────────────────────
--   ١) `sub_type` أولاً — وهو المصدر الدقيق.
--   ٢) فإن غاب: مطابقة اسمٍ **مقيَّدةٍ بنوع الحساب** ومرتَّبةٍ بالكود
--      (فالترتيب يجعل النتيجة قابلةً للتكرار لا رهينة ترتيب التخزين).
--   ٣) فإن غاب: **خطأٌ مُسمّى** — لا تخمين.
--
-- وضريبة المدخلات كانت تحمل العطب نفسه: `%ضريب%` تطابق «مخرجات» أيضاً،
-- فكان يمكن أن يُقيَّد ردُّ ضريبة المشتريات على ضريبة المبيعات.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_journal_for_vendor_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  ap_account        UUID;
  inventory_account UUID;
  vat_account       UUID;
  v_lines           JSONB;
  v_result          JSONB;
BEGIN
  IF NEW.journal_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- ── حساب الموردين ──────────────────────────────────────────────────
  SELECT id INTO ap_account FROM chart_of_accounts
   WHERE company_id = NEW.company_id
     AND sub_type = 'accounts_payable'
     AND coalesce(is_active, true) = true
   ORDER BY account_code
   LIMIT 1;

  IF ap_account IS NULL THEN
    -- بديلٌ **مقيَّد**: التزامٌ واسمٌ يخصّ الموردين تحديداً — لا كلمة «دائن»
    -- وحدها، فهى تصف حسابات العملاء أيضاً.
    SELECT id INTO ap_account FROM chart_of_accounts
     WHERE company_id = NEW.company_id
       AND account_type = 'liability'
       AND coalesce(is_active, true) = true
       AND (account_name ILIKE '%accounts payable%'
            OR account_name ILIKE '%trade payable%'
            OR account_name LIKE '%الموردين%'
            OR account_name LIKE '%الموردون%')
     ORDER BY account_code
     LIMIT 1;
  END IF;

  IF ap_account IS NULL THEN
    RAISE EXCEPTION
      'VENDOR_CREDIT_NO_AP_ACCOUNT: company % has no accounts-payable account | لا حساب موردين',
      NEW.company_id;
  END IF;

  -- ── حساب المخزون ───────────────────────────────────────────────────
  SELECT id INTO inventory_account FROM chart_of_accounts
   WHERE company_id = NEW.company_id
     AND sub_type = 'inventory'
     AND coalesce(is_active, true) = true
   ORDER BY account_code
   LIMIT 1;

  IF inventory_account IS NULL THEN
    SELECT id INTO inventory_account FROM chart_of_accounts
     WHERE company_id = NEW.company_id
       AND account_type = 'asset'
       AND coalesce(is_active, true) = true
       AND (account_name ILIKE '%inventory%' OR account_name LIKE '%المخزون%')
     ORDER BY account_code
     LIMIT 1;
  END IF;

  IF inventory_account IS NULL THEN
    RAISE EXCEPTION
      'VENDOR_CREDIT_NO_INVENTORY_ACCOUNT: company % has no inventory account | لا حساب مخزون',
      NEW.company_id;
  END IF;

  -- ── ضريبة المدخلات ─────────────────────────────────────────────────
  -- **أصلٌ لا التزام**: ضريبة المشتريات مستردَّة، وضريبة المبيعات مستحقَّة.
  -- والشرط القديم `%ضريب%` كان يطابق الاثنين.
  SELECT id INTO vat_account FROM chart_of_accounts
   WHERE company_id = NEW.company_id
     AND sub_type = 'vat_input'
     AND coalesce(is_active, true) = true
   ORDER BY account_code
   LIMIT 1;

  IF vat_account IS NULL THEN
    SELECT id INTO vat_account FROM chart_of_accounts
     WHERE company_id = NEW.company_id
       AND account_type = 'asset'
       AND coalesce(is_active, true) = true
       AND (account_name ILIKE '%input vat%'
            OR account_name ILIKE '%vat%input%'
            OR account_name LIKE '%مدخلات%')
     ORDER BY account_code
     LIMIT 1;
  END IF;

  -- ── السطور ─────────────────────────────────────────────────────────
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_id',    ap_account,
      'debit_amount',  NEW.subtotal + COALESCE(NEW.tax_amount, 0),
      'credit_amount', 0,
      'description',   'تخفيض ذمم دائنة'
    ),
    jsonb_build_object(
      'account_id',    inventory_account,
      'debit_amount',  0,
      'credit_amount', NEW.subtotal,
      'description',   'مردودات مشتريات'
    )
  );

  IF COALESCE(NEW.tax_amount, 0) > 0 THEN
    IF vat_account IS NULL THEN
      RAISE EXCEPTION
        'VENDOR_CREDIT_NO_VAT_ACCOUNT: credit % carries tax % but company has no input-VAT account | ضريبة بلا حساب',
        NEW.credit_number, NEW.tax_amount;
    END IF;
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_id',    vat_account,
        'debit_amount',  0,
        'credit_amount', NEW.tax_amount,
        'description',   'تعديل ضريبة المشتريات'
      )
    );
  END IF;

  v_result := public.create_journal_entry_atomic(
    NEW.company_id,
    'vendor_credit',
    NEW.id,
    NEW.credit_date,
    'إشعار دائن مورد رقم ' || COALESCE(NEW.credit_number, NEW.id::text),
    NEW.branch_id,
    NEW.cost_center_id,
    NULL,
    v_lines
  );

  IF COALESCE((v_result->>'success')::BOOLEAN, false) IS NOT TRUE THEN
    RAISE EXCEPTION
      'VENDOR_CREDIT_JOURNAL_FAILED: credit % — %',
      COALESCE(NEW.credit_number, NEW.id::text), COALESCE(v_result->>'error', 'unknown');
  END IF;

  NEW.journal_entry_id := (v_result->>'entry_id')::UUID;
  RETURN NEW;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- تحقُّق: لم يعد الشرط الفضفاض موجوداً.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE p.proname = 'auto_journal_for_vendor_credit';

  IF position('%دائن%' IN v_def) > 0 THEN
    RAISE EXCEPTION 'v3.74.871: the loose AP name match is still there';
  END IF;

  IF position('create_journal_entry_atomic' IN v_def) = 0 THEN
    RAISE EXCEPTION 'v3.74.871: the trigger no longer routes through the atomic gate';
  END IF;

  RAISE NOTICE 'v3.74.871: vendor-credit accounts now resolve by sub_type, with a type-constrained fallback';
END $$;

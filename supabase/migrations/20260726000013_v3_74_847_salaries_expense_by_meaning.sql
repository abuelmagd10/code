-- ============================================================================
-- v3.74.847 — حساب مصروف الرواتب يُعرَّف بمعناه لا برقمه
-- ============================================================================
--
-- **الحادثة**: طريق صرف المرتبات كان يبحث عن حساب المصروف بالكود `6110`.
-- وهذا الكود **غير موجود فى أى شركة**: الدليل المعتمد يستعمل `5210`
-- «الرواتب والأجور». فكان الطريق يردّ دائماً «حساب المصروفات 6110 غير
-- موجود» — أى أن **صرف المرتبات لم يعمل ولا مرة، فى أى شركة**.
--
-- تأكيد من الإنتاج قبل الإصلاح: دفعتا مرتبات، ١٨ كشفاً، و**صفر** قيود صرف
-- مرتبات (`journal_entries.reference_type='payroll_payment'`).
--
-- ولم يُكتشف لأن الرقم **ثابت فى الكود** لا فى القاعدة، فلا فحص مخطط يراه؛
-- والرسالة تبدو للمستخدم نقصاً فى إعداد شركته لا عطباً فى البرنامج.
--
-- ⇒ **الدرس**: الحساب يُطلب بمعناه (`sub_type`) لا برقمه. الرقم يتغيّر من
--   دليل لآخر ومن بلد لآخر؛ المعنى لا يتغيّر. والرقم — إن لزم — احتياطى
--   بعد المعنى لا مصدر وحيد.
--
-- ولاحظ أن `2130` «الرواتب والأجور المستحقة» كان موسوماً بـ`accrued_salaries`
-- منذ البداية، بينما نظيره فى طرف المصروف تُرك بلا وسم — فالطرف الموسوم
-- عمل والطرف غير الموسوم لم يعمل. الوسم ليس زينة.
--
-- (لا تغيير فى الأرصدة ولا فى أى قيد مُرحَّل: وسمٌ على حساب قائم فقط.)
-- ============================================================================

-- القالب أولاً، فتُنشأ كل شركة جديدة موسومة صحيحاً
UPDATE public.chart_of_accounts_template
   SET sub_type = 'salaries_expense'
 WHERE account_code = '5210'
   AND account_type = 'expense'
   AND sub_type IS DISTINCT FROM 'salaries_expense';

-- ثم إصلاح بيانات الشركات القائمة — «الاصلاحات والفجوات بحلها لعدم تكرارها
-- فى المستقبل مع اصلاح بيانات المتواجدة فى الشركات»
UPDATE public.chart_of_accounts
   SET sub_type = 'salaries_expense'
 WHERE account_code = '5210'
   AND account_type = 'expense'
   AND sub_type IS DISTINCT FROM 'salaries_expense';

DO $$
DECLARE v_tpl INT; v_live INT;
BEGIN
  SELECT count(*) INTO v_tpl  FROM public.chart_of_accounts_template WHERE sub_type='salaries_expense';
  SELECT count(*) INTO v_live FROM public.chart_of_accounts          WHERE sub_type='salaries_expense';
  RAISE NOTICE 'salaries_expense — template: %, live company accounts: %', v_tpl, v_live;
END $$;

-- ============================================================================
-- v3.74.827 — زوج الطاقة فى مركز العمل: رسالة تفهمها بدل خطأ إنجليزى خام
-- ============================================================================
-- **كُشف أثناء الاختبار الحى** (المالك يعدّل مركز عمل ليضبط أسعار الأجور):
-- ظهرت رسالة حمراء بالإنجليزية كما خرجت من قاعدة البيانات حرفياً:
--     "capacity_uom and nominal_capacity_per_hour must both be null or
--      both be provided."
--
-- **السبب**: «وحدة القياس» و«الطاقة فى الساعة» **زوج** — حارس القاعدة يرفض
-- أن يُملأ أحدهما دون الآخر (وهو محق: طاقة بلا وحدة رقم بلا معنى). لكن
-- مسارَى الإنشاء والتعديل كانا يُطبّعان كلاً منهما **على حدة**:
--     capacity_uom: capacity_uom?.trim() || null
--     nominal_capacity_per_hour: nominal ? Number(nominal) : null
-- فيمر نصف الزوج ويصطدم بالحارس فى القاعدة، فيرى المستخدم رسالة بلغة لا
-- يقرؤها ولا تدله على أى حقل يصلح.
--
-- **العلاج بطبقتين**:
--   ١. **المسار** (`app/api/manufacturing/work-centers/*`): يُفحص الزوج قبل
--      إرسال الطلب أصلاً، برسالة عربية تسمّى الحقلين وتقول ماذا يفعل —
--      «أكمل الناقص أو امسح الاثنين». ولا يُسقط ما كتبه المستخدم صامتاً.
--   ٢. **الحارس** (هذه الهجرة): رسائله صارت **ثنائية اللغة** (قرار المالك:
--      الرسالة بلغة التطبيق)، وبكود خطأ `check_violation` بدل الافتراضى —
--      فلو تسرّب أى مسار مستقبلى من الفحص، تصل رسالة مفهومة لا طلسم.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mwc_validate_work_center_capacity_context(
  p_capacity_uom text, p_nominal_capacity_per_hour numeric, p_available_hours_per_day numeric,
  p_parallel_capacity integer, p_efficiency_percent numeric)
RETURNS void LANGUAGE plpgsql
AS $function$
BEGIN
  IF (p_capacity_uom IS NULL) <> (p_nominal_capacity_per_hour IS NULL) THEN
    RAISE EXCEPTION 'وحدة القياس والطاقة فى الساعة يجب إدخالهما معاً أو تركهما فارغين معاً. | Capacity unit and capacity per hour must both be provided or both left empty.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_capacity_uom IS NOT NULL AND BTRIM(p_capacity_uom) = '' THEN
    RAISE EXCEPTION 'وحدة القياس لا يمكن أن تكون فارغة عند إدخالها. | The capacity unit cannot be blank when provided.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_nominal_capacity_per_hour IS NOT NULL AND p_nominal_capacity_per_hour <= 0 THEN
    RAISE EXCEPTION 'الطاقة فى الساعة يجب أن تكون أكبر من صفر. | Capacity per hour must be greater than zero.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_available_hours_per_day IS NOT NULL AND p_available_hours_per_day <= 0 THEN
    RAISE EXCEPTION 'ساعات العمل المتاحة يومياً يجب أن تكون أكبر من صفر. | Available hours per day must be greater than zero.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_parallel_capacity IS NULL OR p_parallel_capacity <= 0 THEN
    RAISE EXCEPTION 'عدد الوحدات المتوازية يجب أن يكون أكبر من صفر. | Parallel capacity must be greater than zero.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_efficiency_percent IS NULL OR p_efficiency_percent <= 0 OR p_efficiency_percent > 100 THEN
    RAISE EXCEPTION 'نسبة الكفاءة يجب أن تكون أكبر من صفر ولا تتجاوز 100%%. | Efficiency percent must be greater than zero and at most 100.'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;

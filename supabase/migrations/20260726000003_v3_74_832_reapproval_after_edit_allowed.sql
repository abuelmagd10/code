-- ============================================================================
-- v3.74.832 — تعديل أمر إنتاج معتمد يُعيده للاعتماد (كان مستحيلاً)
-- ============================================================================
-- **تكملة 830**: بعد إصلاح الأعمدة الوهمية، صار القيد يُكتب على الأعمدة
-- الصحيحة — فظهر العائق التالى، وهو **منطقى لا تقنى**:
--     "انتقال غير مسموح لحالة اعتماد أمر الإنتاج، القديم=approved،
--      الجديد=pending_approval"
--
-- **تصميمان متعارضان فى نفس النظام:**
--   • المسار (Phase R3) يقول: تعديل أمر معتمد **يُبطل اعتماده** ويُعيده
--     لدورة الاعتماد — وهذا ضابط سليم: الاعتماد أُعطى لبيانات معيّنة، فإن
--     تغيّرت صار الاعتماد يغطى ما لم يُعتمد.
--   • بينما جدول الانتقالات فى القاعدة يعتبر `approved` **حالة نهائية**:
--       WHEN 'approved' THEN p_new_status IN ('approved')
--     فيستحيل الإرجاع، ويفشل التعديل كله.
--
-- والنتيجة أن **دورة «عدّل ⇒ يعود للاعتماد» لم تكن ممكنة أصلاً** — لا بسبب
-- الأعمدة الوهمية وحدها (830) بل بحارس يرفض الانتقال نفسه.
--
-- **العلاج**: يُسمح `approved → pending_approval`، **محدوداً بالمسودة**:
--   • قبل الإصدار: التعديل يُبطل الاعتماد ويُعيد الدورة ✔
--   • بعد الإصدار: مرفوض — المواد تحركت، فلا يُعاد فتح الاعتماد بأثر رجعى؛
--     الأصول أن يُلغى الأمر ويُنشأ غيره.
--
-- والحد آمن مضاعفاً: حارس `mpo_guard_production_order_header_editability`
-- يُجمّد الترويسة أصلاً بعد مغادرة المسودة، فلا سبيل لتعديل مستودع أو قائمة
-- مواد على أمر مُصدَر ابتداءً.
--
-- **ما يبقى مرفوضاً** (تحقق على قاعدة الاختبار):
--   معتمد ⇒ مرفوض: مرفوض ✓ · معتمد ⇒ مسودة: مرفوض ✓
--   مسودة ⇒ بانتظار: مسموح ✓ · بانتظار ⇒ معتمد: مسموح ✓
--   مرفوض ⇒ بانتظار: مسموح ✓ · **معتمد ⇒ بانتظار: مسموح الآن** ✓
--
-- ورسائل الحارس الثلاث صارت ثنائية اللغة بكود `check_violation`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mpo_is_order_approval_transition_allowed(p_old_status text, p_new_status text)
RETURNS boolean LANGUAGE sql IMMUTABLE
AS $function$
  SELECT CASE COALESCE(p_old_status, '')
    WHEN 'draft'             THEN COALESCE(p_new_status, '') IN ('draft', 'pending_approval')
    WHEN 'pending_approval'  THEN COALESCE(p_new_status, '') IN ('pending_approval', 'approved', 'rejected')
    -- v3.74.832 — الإرجاع للاعتماد بعد التعديل (الحد فى الحارس: المسودة فقط)
    WHEN 'approved'          THEN COALESCE(p_new_status, '') IN ('approved', 'pending_approval')
    WHEN 'rejected'          THEN COALESCE(p_new_status, '') IN ('rejected', 'pending_approval')
    ELSE false
  END;
$function$;

CREATE OR REPLACE FUNCTION public.mpo_guard_production_order_approval_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
    IF NOT public.mpo_is_order_approval_transition_allowed(OLD.approval_status, NEW.approval_status) THEN
      RAISE EXCEPTION
        'انتقال غير مسموح لحالة اعتماد أمر الإنتاج: من «%» إلى «%». | Disallowed production-order approval transition: from "%" to "%".',
        OLD.approval_status, NEW.approval_status, OLD.approval_status, NEW.approval_status
        USING ERRCODE = 'check_violation';
    END IF;

    -- إعادة دورة الاعتماد بعد تعديل: قبل الإصدار فقط
    IF OLD.approval_status = 'approved' AND NEW.approval_status = 'pending_approval'
       AND COALESCE(OLD.status, 'draft') <> 'draft' THEN
      RAISE EXCEPTION
        'لا يمكن إرجاع أمر الإنتاج للاعتماد بعد إصداره للتنفيذ (حالته: %) — ألغِ الأمر وأنشئ غيره. | A production order cannot return for re-approval once released (status: %); cancel it and create a new one.',
        OLD.status, OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.status = 'released' AND OLD.status = 'draft'
     AND COALESCE(NEW.approval_status, 'draft') <> 'approved' THEN
    RAISE EXCEPTION
      'لا يمكن إصدار أمر الإنتاج قبل اعتماده — أرسله للاعتماد وانتظر موافقة المالك أو المدير العام. | A production order cannot be released before approval; submit it and await the owner or general manager.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

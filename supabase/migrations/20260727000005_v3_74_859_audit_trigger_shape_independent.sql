-- ════════════════════════════════════════════════════════════════════════════
-- v3.74.859 — ستة جداول بلا سجل تدقيق إطلاقاً
-- ════════════════════════════════════════════════════════════════════════════
--
-- 🔴 **الفجوة**
--
-- `audit_trigger_function` تقرأ خانتَى الفرع ومركز التكلفة بناءً على **قائمة
-- أسماء جداول مكتوبة يدوياً**:
--
--     v_branch_id := CASE WHEN TG_TABLE_NAME IN ('invoices','bills',…)
--                         THEN NEW.branch_id ELSE NULL END;
--
-- وستةُ جداولَ عليها مُشغِّل تدقيق **لا تملك `branch_id` أصلاً**. وPL/pgSQL
-- يُحلّل التعبير مقابل **شكل الصفّ الفعلى** قبل التنفيذ، فلا ينفع شرط `CASE`:
-- يُرفع `record "new" has no field "branch_id"` ⇒ يلتقطه `WHEN OTHERS` ⇒
-- **لا يُكتب قيد تدقيق البتة**، ولا يعلم أحد.
--
-- 📊 **القياس على الإنتاج قبل الإصلاح** (والفواتير ٤٣١ قيداً للمقارنة):
--
--     company_role_permissions  … صفر   ← مَن غيّر صلاحيات مستخدم؟
--     accounting_periods        … صفر   ← مَن فتح فترة محاسبية مقفلة؟
--     payroll_runs              … صفر من المُشغِّل (٢ كتبهما التطبيق)
--     asset_transactions        … صفر
--     shareholders              … صفر
--     tax_codes                 … صفر   ← مَن غيّر نسبة الضريبة؟
--
-- ⇒ والثقب يقع تحديداً فى **أخطر ما يجب تسجيله**: الصلاحيات، والفترات،
--   والمرتبات، والضرائب. أما الفواتير والقيود والمدفوعات فمسجَّلة بالكامل.
--
-- 🟢 **الإصلاح — حذف القائمة اليدوية لا توسيعها**
--
-- يُقرأ الصفّ كـ`jsonb`، فيعمل على أى جدول مهما كان شكله، حاضراً ومستقبلاً:
-- `v_row ->> 'branch_id'` تعود NULL إن غاب المفتاح، ولا ترفع خطأً أبداً.
-- (نفس درس «يُحلّ بالمعنى لا بقائمةٍ مكتوبة يدوياً».)
--
-- ✅ **ما تُحقِّق منه قبل التطبيق — بالقياس لا بالافتراض**
--
--  ١) `audit_logs.branch_id` و`cost_center_id` عليهما مفتاحان أجنبيان
--     (`branches` و`cost_centers`). وفُحصت الجداول الأربعة والعشرون كلها:
--     **كل** جدول به `branch_id` يشير فعلاً إلى `branches`، وكل جدول به
--     `cost_center_id` يشير إلى `cost_centers`. فلا يمكن أن يُدخل هذا
--     التغيير قيمةً يرفضها مفتاحٌ أجنبى.
--  ٢) الجداول العشرة التى تملك الخانتين ولم تكن فى القائمة ستُسجَّل الآن
--     بفرعها ومركز تكلفتها — إثراءٌ للسجل، لا خطر.
--  ٣) لم يُمسّ شىءٌ من معالجة الاستثناءات: `query_canceled` (57014) يبقى
--     ملتقَطاً صراحةً (درس ٨٤٠: `WHEN OTHERS` لا يلتقطه، وبدونه كان فشل
--     التسجيل يُسقط عملية أعمال). والقيم المعادة `OLD`/`NEW` كما هى.
--
-- ⚠️ **ما لا يُدَّعى**: قيود التدقيق التى ضاعت **لا يمكن استرجاعها** — لا
--    مصدر يُبنى منه. تُوثَّق فترة الانقطاع ولا يُدَّعى إصلاحها.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.audit_trigger_function()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company_id UUID; v_record_id UUID; v_record_identifier TEXT;
  v_old_data JSONB; v_new_data JSONB; v_user_id UUID;
  v_branch_id UUID; v_cost_center_id UUID;
  v_row JSONB;
BEGIN
  v_user_id := auth.uid();

  -- v3.74.859 — يُقرأ الصفّ كـjsonb فلا يعتمد شىءٌ على شكل الجدول.
  -- `->>` تعود NULL للمفتاح الغائب بدل أن ترفع خطأً يُبتلع كتحذير.
  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
  ELSE
    v_row := to_jsonb(NEW);
  END IF;

  v_company_id     := nullif(v_row ->> 'company_id', '')::UUID;
  v_record_id      := nullif(v_row ->> 'id', '')::UUID;
  v_branch_id      := nullif(v_row ->> 'branch_id', '')::UUID;
  v_cost_center_id := nullif(v_row ->> 'cost_center_id', '')::UUID;

  v_record_identifier := TG_TABLE_NAME || '_' || COALESCE(v_record_id::TEXT, 'unknown');

  IF TG_OP = 'DELETE' THEN v_old_data := v_row;  v_new_data := NULL;
  ELSIF TG_OP = 'INSERT' THEN v_old_data := NULL; v_new_data := v_row;
  ELSE v_old_data := to_jsonb(OLD); v_new_data := v_row;
  END IF;

  PERFORM create_audit_log_internal(v_company_id, v_user_id, TG_OP, TG_TABLE_NAME,
    v_record_id, v_record_identifier, v_old_data, v_new_data, v_branch_id, v_cost_center_id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
EXCEPTION
  -- v3.74.840 — `query_canceled` (57014) **لا يلتقطه `WHEN OTHERS`**، وهو الكود
  -- الذى يرفعه فحص التصريح عن قصد. فبدونه هنا كان فشل تسجيل يُسقط عملية أعمال.
  WHEN query_canceled THEN
    RAISE WARNING 'Audit log cancelled (57014) on %.%: %', TG_TABLE_NAME, TG_OP, SQLERRM;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  WHEN OTHERS THEN
    RAISE WARNING 'Audit log failed: %', SQLERRM;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

COMMIT;

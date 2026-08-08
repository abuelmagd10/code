-- =============================================================================
-- v3.74.983 — خطوتان لا يوقّعهما شخصٌ واحد، واعتمادٌ شرطٌ لا خيار
-- =============================================================================
-- قرارُ المالك فى صرف مواد التصنيع، وقد كُتب فى «سياسةُ الاعتماد» يومَ ٨ أغسطس:
--
--   طلبُ الصرف            → مسؤولُ التصنيع
--   اعتمادُ الصرف إداريّاً → المالك أو المدير العام   · **شرطٌ لا خيار**
--   إخراجُ المواد فعلاً    → مسؤولُ مخزن الفرع        · يُسقَط إن لم يكن له مسؤول
--
-- وما وُجد فى الشيفرة كان فيه عيبان مقيسان:
--
--   ١) **اعتمادُ الإدارة كان خياراً لا شرطاً**: خطوةُ الإخراج تقبل الحالةَ
--      «معلّق» مباشرةً، فتُخرَج الموادُّ بلا اعتمادٍ إدارىٍّ إطلاقاً. الخطوةُ
--      موجودةٌ ويمكن تخطّيها كأنّها غيرُ موجودة.
--
--   ٢) **أربعةُ أشخاصٍ يملكون توقيعَ الخطوتين معاً** (المالك · المدير العام
--      بالاسمين · مديرُ الفرع): فالواحدُ يعتمد إداريّاً ثمّ يعتمد الإخراجَ
--      بنفسه. **ورقابةٌ من مرحلتين يوقّعهما واحدٌ أسوأُ من مرحلةٍ واحدةٍ
--      صريحة، لأنّها تُطمئن ولا تحمى.**
--      وقِيست الحالاتُ الثلاثُ الواقعةُ فعلاً: **لم يقع فيها ذلك ولا مرّة**.
--      فالعطبُ فى الصلاحيّة لا فى الوقائع — والصلاحيّةُ تُغلق قبل أن تقع.
--
-- والمنعُ يوضع فى قاعدة البيانات لا فى الشاشة: فبابٌ جديدٌ غداً لا يحتاج أن
-- يتذكّر القاعدة، وبابٌ قديمٌ نسيها لا يستطيع مخالفتَها.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ١) بيتٌ واحدٌ لقاعدة المالك الأولى: «ما ينشئه المالك لا يطلب اعتماداً»
-- -----------------------------------------------------------------------------
-- لا أحدَ أعلى منه فيُعتمد عنه. وتُبنى هنا **بيتاً واحداً** لأنّها ستُعمَّم
-- على العمليّات كلِّها، فلا تُكتب فى كلِّ بابٍ من جديد.

CREATE OR REPLACE FUNCTION public.erp_creator_needs_no_approval(
    p_company_id uuid,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = p_company_id
      AND cm.user_id = p_user_id
      AND cm.role = 'owner'
  );
$function$;

REVOKE ALL ON FUNCTION public.erp_creator_needs_no_approval(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_creator_needs_no_approval(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.erp_creator_needs_no_approval(uuid, uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ٢) وبيتٌ واحدٌ لقاعدته الرابعة: «خطوةٌ لا صاحبَ لها لا تُوقف العمل»
-- -----------------------------------------------------------------------------
-- ومسؤولُ المخزن يكون معيَّناً على المخزن نفسِه، أو على فرعه كلِّه.
-- وليست هذه حالةً نادرة: **ستّةٌ من سبعةِ مخازنَ اليوم بلا مسؤول**، فلولا هذه
-- القاعدةُ لتوقّف صرفُ المواد فى أكثر الشركة يومَ نجعل اعتمادَه شرطاً.

CREATE OR REPLACE FUNCTION public.warehouse_has_store_manager(
    p_company_id uuid,
    p_warehouse_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT p_warehouse_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.company_members cm
    LEFT JOIN public.warehouses w ON w.id = p_warehouse_id AND w.company_id = p_company_id
    WHERE cm.company_id = p_company_id
      AND cm.role = 'store_manager'
      AND (
        cm.warehouse_id = p_warehouse_id
        OR (cm.warehouse_id IS NULL AND cm.branch_id IS NOT NULL AND cm.branch_id = w.branch_id)
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.warehouse_has_store_manager(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.warehouse_has_store_manager(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.warehouse_has_store_manager(uuid, uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ٣) القاعدةُ نفسُها — دالّةٌ خالصةٌ تُفحص بلا صفٍّ ولا شركة
-- -----------------------------------------------------------------------------
-- تُرجع NULL إن كان الانتقالُ جائزاً، وإلّا فالسببَ بالعربيّة. وإنّما جُعلت
-- خالصةً ليُثبَت اتّجاهاها بالتشغيل لا بالنظر.

CREATE OR REPLACE FUNCTION public.material_issue_stage_error(
    p_old_status text,
    p_new_status text,
    p_management_approved_by uuid,
    p_approved_by uuid,
    p_has_store_manager boolean
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    -- تحديثٌ لا يمسّ الحالة
    WHEN p_old_status IS NULL OR p_new_status IS NULL OR p_old_status = p_new_status THEN NULL
    -- اعتمادُ الإدارة لا يكون إلّا من «معلّق»
    WHEN p_new_status = 'management_approved' AND p_old_status <> 'pending'
      THEN 'اعتمادُ الإدارة لا يكون إلّا لطلبٍ معلّق — حالتُه الآن: ' || p_old_status
    -- الإخراجُ لا يسبق اعتمادَ الإدارة
    WHEN p_new_status IN ('approved', 'partially_approved') AND p_management_approved_by IS NULL
      THEN 'لا تُخرَج الموادُّ قبل اعتماد الإدارة — والاعتمادُ شرطٌ لا خيار'
    -- ولا يجمع شخصٌ واحدٌ التوقيعين، ما دام للمخزن مسؤولٌ يوقّع الثانية
    WHEN p_new_status IN ('approved', 'partially_approved')
         AND p_has_store_manager
         AND p_approved_by IS NOT NULL
         AND p_approved_by = p_management_approved_by
      THEN 'لا يجمع شخصٌ واحدٌ اعتمادَ الإدارة وإخراجَ المواد — رقابةٌ يوقّعها واحدٌ تُطمئن ولا تحمى'
    ELSE NULL
  END;
$function$;

REVOKE ALL ON FUNCTION public.material_issue_stage_error(text, text, uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.material_issue_stage_error(text, text, uuid, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.material_issue_stage_error(text, text, uuid, uuid, boolean) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ٤) والقاعدةُ تُطبَّق على الجدول نفسِه — لا على البابِ الذى مرَّ منه الطلب
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_material_issue_two_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_err text;
BEGIN
  v_err := public.material_issue_stage_error(
    OLD.status,
    NEW.status,
    NEW.management_approved_by,
    NEW.approved_by,
    public.warehouse_has_store_manager(NEW.company_id, NEW.warehouse_id)
  );

  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION '%', v_err USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_material_issue_two_stage ON public.manufacturing_material_issue_approvals;
CREATE TRIGGER trg_material_issue_two_stage
  BEFORE UPDATE OF status ON public.manufacturing_material_issue_approvals
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.enforce_material_issue_two_stage();

-- -----------------------------------------------------------------------------
-- ٥) وقاعدةُ المالك الأولى تُطبَّق ساعةَ الطلب لا ساعةَ الاعتماد
-- -----------------------------------------------------------------------------
-- فطلبُ المالك يُولد معتمَداً إداريّاً — لا لأنّنا تجاوزنا خطوةً، بل لأنّه
-- لا أحدَ فوقه ليعتمدها. ويبقى إخراجُ المادّة خطوةً مستقلّةً لأمين المخزن.

CREATE OR REPLACE FUNCTION public.material_issue_owner_needs_no_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF COALESCE(NEW.status, 'pending') = 'pending'
     AND NEW.management_approved_by IS NULL
     AND public.erp_creator_needs_no_approval(NEW.company_id, NEW.requested_by)
  THEN
    NEW.status                    := 'management_approved';
    NEW.management_approved_by    := NEW.requested_by;
    NEW.management_approved_at    := now();
    NEW.management_approved_notes := COALESCE(
      NEW.management_approved_notes,
      'اعتمادٌ تلقائىّ: الطلبُ من المالك، ولا أحدَ أعلى منه ليعتمده (قاعدة ١).'
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_material_issue_owner_no_approval ON public.manufacturing_material_issue_approvals;
CREATE TRIGGER trg_material_issue_owner_no_approval
  BEFORE INSERT ON public.manufacturing_material_issue_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.material_issue_owner_needs_no_approval();

-- -----------------------------------------------------------------------------
-- ٦) وفحصٌ مرجعىٌّ يمنع عودةَ هذا — يُشغَّل مع كلِّ دفعة
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_baseline_v3_74_983_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- القيدان مركَّبان ومُفعَّلان
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal AND c.relname = 'manufacturing_material_issue_approvals'
      AND t.tgname = 'trg_material_issue_two_stage' AND t.tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: قيدُ المرحلتين لصرف المواد غيرُ مركَّبٍ أو مُعطَّل (v3.74.983)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal AND c.relname = 'manufacturing_material_issue_approvals'
      AND t.tgname = 'trg_material_issue_owner_no_approval' AND t.tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: قاعدةُ «ما ينشئه المالك لا يُعتمد» غيرُ مركَّبةٍ أو مُعطَّلة (v3.74.983)';
  END IF;

  -- الاتّجاهُ الأوّل: يرفض المذنب
  IF public.material_issue_stage_error('pending', 'approved', NULL, NULL, TRUE) IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: قبِل إخراجَ المواد بلا اعتمادٍ إدارىّ (v3.74.983)';
  END IF;
  IF public.material_issue_stage_error(
       'management_approved', 'approved',
       '11111111-1111-1111-1111-111111111111'::uuid,
       '11111111-1111-1111-1111-111111111111'::uuid, TRUE) IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: قبِل أن يوقّع شخصٌ واحدٌ الخطوتين (v3.74.983)';
  END IF;
  IF public.material_issue_stage_error('approved', 'management_approved', NULL, NULL, TRUE) IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: قبِل اعتماداً إداريّاً لطلبٍ غيرِ معلّق (v3.74.983)';
  END IF;

  -- والاتّجاهُ الثانى: يُبرّئ البرىء
  IF public.material_issue_stage_error(
       'management_approved', 'approved',
       '11111111-1111-1111-1111-111111111111'::uuid,
       '22222222-2222-2222-2222-222222222222'::uuid, TRUE) IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: منع شخصين مختلفين من توقيع الخطوتين (v3.74.983)';
  END IF;
  IF public.material_issue_stage_error(
       'management_approved', 'approved',
       '11111111-1111-1111-1111-111111111111'::uuid,
       '11111111-1111-1111-1111-111111111111'::uuid, FALSE) IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: أوقف الصرفَ فى مخزنٍ لا مسؤولَ له — وخطوةٌ لا صاحبَ لها لا تُوقف العمل (v3.74.983)';
  END IF;
  IF public.material_issue_stage_error('pending', 'management_approved', NULL, NULL, TRUE) IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: منع اعتمادَ الإدارة لطلبٍ معلّق (v3.74.983)';
  END IF;
  IF public.material_issue_stage_error('pending', 'rejected', NULL, NULL, TRUE) IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: منع الرفضَ — والرفضُ ليس صرفاً (v3.74.983)';
  END IF;
  IF public.material_issue_stage_error('approved', 'approved', NULL, NULL, TRUE) IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: منع تحديثاً لا يمسّ الحالة (v3.74.983)';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_983_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_983_check() FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_74_983_check() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ٧) ولا تمرّ الدفعةُ إلّا بعد أن تُثبت نفسَها بالتشغيل
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_broken int;
BEGIN
  -- ولا تُحاكَم الوقائعُ الماضيةُ بأثرٍ رجعىّ: تُقاس أوّلاً
  SELECT count(*) INTO v_broken
  FROM public.manufacturing_material_issue_approvals
  WHERE status IN ('approved', 'partially_approved')
    AND management_approved_by IS NULL;
  RAISE NOTICE 'v3.74.983 · صفوفٌ قديمةٌ صُرفت بلا اعتمادٍ إدارىّ: %', v_broken;

  PERFORM public.assert_baseline_v3_74_983_check();
  RAISE NOTICE 'v3.74.983 · تمّت وأثبتت نفسَها.';
END $$;

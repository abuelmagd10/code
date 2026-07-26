-- ============================================================================
-- v3.74.835 — تكلفة التحويل = زمن × سعر، والنظام قبل غياب أى منهما
-- ============================================================================
-- الاختبار الحى ١ اكتمل: المواد صحيحة، و**تكلفة التحويل صفر**. دخل «متوسيكل»
-- المخزون بتكلفة **٦٠.٠٠** لا **١١٨.٥٠**، ووصف القيد نفسه يقول «مواد فقط».
--
-- ── الأمران السابقان مِرآة لبعضهما: نفس الفجوة من طرفيها ──────────────────
--
--   الأمر ٢٨ (ماتور مجهز) · WC-01: زمن ٦٠ دقيقة ✓ · الأسعار **كلها صفر** ✗
--   الأمر ٢٩ (متوسيكل)   · WC-02: الأسعار ١٠٠/٣/٤/١٠ ✓ · الزمن **صفر** ✗
--
-- وفى الحالتين: تكلفة التحويل صفر. فالنظام كان يقبل **غياب أى من العاملين**
-- بلا كلمة، ويُمرّر الأمر عبر أربع بوابات (حفظ المسار · الاعتماد · الإصدار ·
-- الاستلام) حتى يدخل المنتج المخزون ناقص القيمة.
--
-- **الأثر المحاسبى** (IAS 2): مخزون تام أقل من حقيقته · أجور وأعباء لم
-- تُستوعب · **وربح مبالَغ فيه عند البيع** — ووقع فعلاً: منتج الأمر ٢٨ بيع
-- بتكلفة ٦٠ ناقصة.
--
-- ── العلاج: المنع عند **اعتماد المعيار** لا عند استعماله ─────────────────
-- الاعتماد هو لحظة إقرار «المعيار»، فهو الموضع الصحيح للمنع. ويُفحص أيضاً
-- عند التفعيل، ويرفض ثلاث حالات مسمّاة بالاسم:
--   (أ) عملية بزمن صفر ومركز عملها له أسعار — تناقض صريح (حالة ٢٩)
--   (ب) مركز عمل كل أسعاره صفر — كل منتج يمرّ به يُقيَّم بالمواد فقط (٢٨)
--   (ج) مسار بلا أى عملية
-- والرسائل تُسمّى رقم العملية واسمها وكود مركز العمل واسمه — لا «راجع
-- الإعدادات».
--
-- ── 🔴 لغم ثانٍ وُجد أثناء الفحص: حساب الأجور يشير لحساب قروض ─────────────
-- `companies.wages_payable_account_id` كان يشير إلى **٢٢١٠ «القروض طويلة
-- الأجل»**. ولم ينفجر اللغم إلا لأن ترتيب البحث فى الكود يُقدِّم
-- `direct_labour_applied` (٥٤١٥) على تجاوز الشركة — فلو غاب ٥٤١٥ لَقُيِّدت
-- أجور الإنتاج على **القروض طويلة الأجل**، فيتضخم الدين بلا سبب.
-- وهذا وُجد **قبل** تشغيل تكلفة التحويل لأول مرة، أى قبل أن يقيَّد شىء خطأ.
-- المعالجة: تصفير التجاوز الخاطئ (data)، وحارس يمنع ربط أى من الحسابات
-- الثلاثة بحساب لا يطابق طبيعته (system).
--
-- ── إصلاح البيانات (بقرار المالك) ────────────────────────────────────────
-- • الأمر ٢٩ «متوسيكل» (ما زال بالمخزون): قيد JE-000067 —
--     مدين ١١٤٠ المخزون ٥٨.٥٠ / دائن ٥٤١٥ أجور محمَّلة ٥٠.٠٠
--                                / دائن ٥٤١٠ أعباء محملة ٨.٥٠
--   وتكلفة الدفعة ٦٠.٠٠ ← **١١٨.٥٠**. والمبالغ **مشتقة** من أسعار WC-02
--   على ٠.٥ ساعة، لا مُدخلة يدوياً.
-- • الأمر ٢٨ (بيع بتكلفة ناقصة): مؤجَّل بقرار المالك حتى تُضبط أسعار WC-01،
--   إذ لا يمكن تصحيح تكلفة بلا سعر معلوم.
--
-- **التحقق بعد الإصلاح**: ميزان المراجعة ٠.٠٠ · إنتاج تحت التشغيل ٠.٠٠ ·
-- صفر مسودات حيّة · مخزون دفترى ١٩٩.٢٧ مقابل FIFO ١٩٩.٢٦٩ (فرق ٠.٠٠٠٩٨
-- أقل من المليم، من كسور دفعات سابقة لا من هذا القيد).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mr_assert_routing_operations_costable(p_routing_version_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_op_count INTEGER;
  v_bad RECORD;
BEGIN
  SELECT COUNT(*) INTO v_op_count
    FROM public.manufacturing_routing_operations
   WHERE routing_version_id = p_routing_version_id;

  IF COALESCE(v_op_count, 0) = 0 THEN
    RAISE EXCEPTION 'لا يمكن اعتماد مسار تصنيع بلا أى عملية — أضف عمليات المسار أولاً. | A routing version cannot be approved with no operations.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- (أ) مركز العمل له أسعار والعملية بزمن صفر ⇒ تكلفة تحويل صفر
  SELECT ro.operation_no, ro.operation_name, wc.code AS wc_code, wc.name AS wc_name
    INTO v_bad
    FROM public.manufacturing_routing_operations ro
    JOIN public.manufacturing_work_centers wc ON wc.id = ro.work_center_id
   WHERE ro.routing_version_id = p_routing_version_id
     AND (COALESCE(wc.labor_cost_rate,0) + COALESCE(wc.machine_cost_rate,0)
        + COALESCE(wc.variable_overhead_rate,0) + COALESCE(wc.fixed_overhead_rate,0)) > 0
     AND (COALESCE(ro.setup_time_minutes,0) + COALESCE(ro.run_time_minutes_per_unit,0)
        + COALESCE(ro.labor_time_minutes,0) + COALESCE(ro.machine_time_minutes,0)) = 0
   ORDER BY ro.operation_no
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'العملية % «%» على مركز العمل % «%» بزمن صفر، ومركز العمل له أسعار تكلفة — فتكلفة التحويل ستكون صفراً ويدخل المنتج التام بتكلفة ناقصة. اضبط زمن العملية (تحضير أو تشغيل للوحدة). | Operation % "%" at work centre % "%" has zero time while the work centre has cost rates; conversion cost would be zero and the product capitalised understated.',
      v_bad.operation_no, v_bad.operation_name, v_bad.wc_code, v_bad.wc_name,
      v_bad.operation_no, v_bad.operation_name, v_bad.wc_code, v_bad.wc_name
      USING ERRCODE = 'check_violation';
  END IF;

  -- (ب) مركز العمل كل أسعاره صفر ⇒ أى منتج يمرّ به يُقيَّم بالمواد فقط
  SELECT ro.operation_no, ro.operation_name, wc.code AS wc_code, wc.name AS wc_name
    INTO v_bad
    FROM public.manufacturing_routing_operations ro
    JOIN public.manufacturing_work_centers wc ON wc.id = ro.work_center_id
   WHERE ro.routing_version_id = p_routing_version_id
     AND (COALESCE(wc.labor_cost_rate,0) + COALESCE(wc.machine_cost_rate,0)
        + COALESCE(wc.variable_overhead_rate,0) + COALESCE(wc.fixed_overhead_rate,0)) = 0
   ORDER BY ro.operation_no
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'مركز العمل % «%» (المستخدم فى العملية % «%») كل أسعار تكلفته صفر — فكل منتج يمرّ به يُقيَّم بالمواد فقط بلا أجور ولا أعباء. اضبط أسعار مركز العمل قبل الاعتماد. | Work centre % "%" (used by operation % "%") has all cost rates at zero; every product through it would be valued at materials only.',
      v_bad.wc_code, v_bad.wc_name, v_bad.operation_no, v_bad.operation_name,
      v_bad.wc_code, v_bad.wc_name, v_bad.operation_no, v_bad.operation_name
      USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mr_guard_routing_version_approval_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
    IF NOT public.mr_is_routing_version_approval_transition_allowed(OLD.approval_status, NEW.approval_status) THEN
      RAISE EXCEPTION
        'انتقال غير مسموح لحالة اعتماد مسار التصنيع. routing_version_id=%, القديم=%, الجديد=%',
        OLD.id, OLD.approval_status, NEW.approval_status USING ERRCODE = 'P0001';
    END IF;

    -- v3.74.835 — الاعتماد هو لحظة إقرار «المعيار»: فلا يُقَر معيار يُنتج
    -- تكلفة تحويل صفر، لأن كل منتج يُصنع به يدخل المخزون ناقص القيمة.
    IF NEW.approval_status = 'approved' THEN
      PERFORM public.mr_assert_routing_operations_costable(NEW.id);
    END IF;
  END IF;

  -- Activation gate: cannot move status → 'active' unless approved.
  IF NEW.status = 'active' AND OLD.status <> 'active'
     AND COALESCE(NEW.approval_status, 'draft') <> 'approved' THEN
    RAISE EXCEPTION
      'لا يمكن تفعيل نسخة مسار التصنيع قبل اعتمادها. أرسلها للاعتماد أولاً وانتظر موافقة المالك / المدير العام.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'active' AND OLD.status <> 'active' THEN
    PERFORM public.mr_assert_routing_operations_costable(NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

-- ── حساب تحكّم مربوط بطبيعة خاطئة: منع على مستوى النظام ────────────────────
-- «الأجور المستحقة» كان يشير لحساب قروض. حساب تحكّم مربوط خطأ لا يُخطئ مرة،
-- بل يُخطئ فى كل قيد يمرّ به — ولا يُكتشف إلا بمراجعة ميزانية.
CREATE OR REPLACE FUNCTION public.mfg_guard_company_manufacturing_accounts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_sub TEXT;
  v_code TEXT;
  v_name TEXT;
BEGIN
  IF NEW.wages_payable_account_id IS NOT NULL
     AND NEW.wages_payable_account_id IS DISTINCT FROM OLD.wages_payable_account_id THEN
    SELECT COALESCE(sub_type,''), account_code, account_name INTO v_sub, v_code, v_name
      FROM public.chart_of_accounts WHERE id = NEW.wages_payable_account_id;
    IF v_sub NOT IN ('wages_payable', 'accrued_salaries', 'direct_labour_applied') THEN
      RAISE EXCEPTION 'حساب أجور الإنتاج لا يمكن ربطه بالحساب % «%» — طبيعته غير مطابقة، وكل قيد أجور سيُرحَّل خطأ. اختر حساب «أجور مستحقة» أو «أجور محمَّلة على الإنتاج». | The production wages account cannot point at % "%": its nature does not match.',
        v_code, v_name, v_code, v_name USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.manufacturing_overhead_account_id IS NOT NULL
     AND NEW.manufacturing_overhead_account_id IS DISTINCT FROM OLD.manufacturing_overhead_account_id THEN
    SELECT COALESCE(sub_type,''), account_code, account_name INTO v_sub, v_code, v_name
      FROM public.chart_of_accounts WHERE id = NEW.manufacturing_overhead_account_id;
    IF v_sub <> 'manufacturing_overhead_applied' THEN
      RAISE EXCEPTION 'حساب الأعباء الصناعية المحمَّلة لا يمكن ربطه بالحساب % «%» — طبيعته غير مطابقة. | The manufacturing overhead applied account cannot point at % "%".',
        v_code, v_name, v_code, v_name USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.wip_account_id IS NOT NULL
     AND NEW.wip_account_id IS DISTINCT FROM OLD.wip_account_id THEN
    SELECT COALESCE(sub_type,''), account_code, account_name INTO v_sub, v_code, v_name
      FROM public.chart_of_accounts WHERE id = NEW.wip_account_id;
    IF v_sub <> 'work_in_process' THEN
      RAISE EXCEPTION 'حساب الإنتاج تحت التشغيل لا يمكن ربطه بالحساب % «%» — طبيعته غير مطابقة. | The work-in-process account cannot point at % "%".',
        v_code, v_name, v_code, v_name USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_companies_manufacturing_accounts_guard ON public.companies;
CREATE TRIGGER trg_companies_manufacturing_accounts_guard
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.mfg_guard_company_manufacturing_accounts();

-- ── إصلاح بيانات: تصفير أى تجاوز أجور يشير لحساب لا يطابق طبيعته ──────────
UPDATE public.companies c
   SET wages_payable_account_id = NULL
 WHERE c.wages_payable_account_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM public.chart_of_accounts a
      WHERE a.id = c.wages_payable_account_id
        AND COALESCE(a.sub_type, '') NOT IN ('wages_payable', 'accrued_salaries', 'direct_labour_applied')
   );

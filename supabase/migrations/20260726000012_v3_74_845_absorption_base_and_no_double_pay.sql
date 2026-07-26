-- ============================================================================
-- v3.74.845 — أساس تحميل الأعباء، والحارس عند الإرسال، ومنع الصرف المزدوج
-- ============================================================================
--
-- ثلاث فجوات كشفها الاختبار الحى الأول، كلها من عائلة واحدة: النظام كان
-- **يفترض** حقيقة بدل أن **يسأل** عنها.
--
-- ١) الأعباء كانت تُحمَّل على «ساعات الآلة» دائماً وبلا استثناء.
--    هذا صحيح لآلة أو خط إنتاج، وخطأ لورشة يدوية: الورشة اليدوية لا آلة
--    فيها، فزمن الآلة صفر، فالأعباء صفر — ويخرج المنتج التام محمَّلاً بأجور
--    بلا أى نصيب من إيجار المصنع وكهربائه وتأمينه. الآن **كل مركز عمل يعلن
--    أساس تحميله**: ساعات آلة أو ساعات عمالة. وسعر الآلة يبقى على ساعات
--    الآلة فى الحالتين، لأنه مقابل آلة: لا زمن آلة ⇒ لا تكلفة آلة.
--
-- ٢) حارس «المسار غير قابل للتكليف» كان يعمل عند **الاعتماد** فقط. فيرسل
--    مسؤول التصنيع مساراً ناقصاً، ويصل المالك طلب **يستحيل اعتماده**،
--    فتظهر الرسالة لمن لا يملك إصلاحها. صار الفحص **عند الإرسال أيضاً**.
--    وهو نفس درس ٨٣٣ حرفياً: يُفحص عند البوابة التى يملك صاحبها الإصلاح.
--
-- ٣) القيد `chk_plp_casual_is_always_paid` كان يمنع «عامل مؤقت بلا صرف»،
--    ولم يكن شىء يمنع عكسه: **موظف بمرتب شهرى + صرف نقدى على أمر الإنتاج**
--    = يقبض مرتين، والتكلفة تُحمَّل مرتين. والحقيقة التى تقرر ذلك هى راتب
--    **الشخص** لا نوع مركز العمل — لأن الورشة الواحدة قد يعمل بها موظف
--    وعامل يومية معاً — ومصدر تلك الحقيقة موجود بالفعل: `employees.base_salary`.
--
-- كل ما يلى مطبَّق على قاعدة الإنتاج بالفعل ومنقول عنها حرفياً.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- ١) أساس تحميل الأعباء + طبيعة العمالة على مركز العمل
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.manufacturing_work_centers
  ADD COLUMN IF NOT EXISTS overhead_absorption_base TEXT NOT NULL DEFAULT 'machine_hours';

-- الاسم القديم من أول تطبيق يدوى على الإنتاج؛ يُسقَط لو وُجد حتى لا تبقى
-- قاعدة باسم وأخرى بآخر. (كشفه فحص «الملف يطابق القاعدة».)
ALTER TABLE public.manufacturing_work_centers
  DROP CONSTRAINT IF EXISTS chk_wc_overhead_absorption_base;
ALTER TABLE public.manufacturing_work_centers
  DROP CONSTRAINT IF EXISTS chk_mwc_overhead_absorption_base;
ALTER TABLE public.manufacturing_work_centers
  ADD CONSTRAINT chk_mwc_overhead_absorption_base
  CHECK (overhead_absorption_base IN ('machine_hours','labour_hours'));

-- إصلاح البيانات القائمة: الورشة اليدوية أعباؤها تسيرها العمالة.
UPDATE public.manufacturing_work_centers
   SET overhead_absorption_base = 'labour_hours'
 WHERE work_center_type = 'labor_group'
   AND overhead_absorption_base <> 'labour_hours';

-- توثيقية لا مانعة: تُفسِّر معنى `labor_cost_rate`، وتخبر تقرير الانحراف
-- من أين تأتى التكلفة الفعلية — حساب ٥٢١١ أم حصة من المرتبات.
ALTER TABLE public.manufacturing_work_centers
  ADD COLUMN IF NOT EXISTS labour_staffing_model TEXT NOT NULL DEFAULT 'mixed';

ALTER TABLE public.manufacturing_work_centers
  DROP CONSTRAINT IF EXISTS chk_mwc_labour_staffing_model;
ALTER TABLE public.manufacturing_work_centers
  ADD CONSTRAINT chk_mwc_labour_staffing_model
  CHECK (labour_staffing_model IN ('casual','salaried','mixed'));

-- ─────────────────────────────────────────────────────────────────────────────
-- ٢) الحارس يحسب ناتج التحويل الفعلى، ويعمل عند الإرسال كما عند الاعتماد
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mr_assert_routing_operations_costable(p_routing_version_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  -- (أ) v3.74.845 — يُحسب **ناتج التحويل الفعلى** لا مؤشر بديل عنه.
  -- 835 فحص «هل هناك أسعار؟» و«هل هناك زمن؟» كسؤالين منفصلين، فيمرّ مسار
  -- زمنه فى خانة وأسعاره فى خانة أخرى وتكلفته صفر. وبعد إدخال
  -- `overhead_absorption_base` صار السؤال الوحيد الصحيح: بنفس المعادلة التى
  -- يستعملها الحساب، هل الناتج أكبر من صفر؟
  --   أجور   = ساعات العمالة × سعر العمالة
  --   آلة    = ساعات الآلة    × سعر الآلة          (الآلة دائماً بساعات الآلة)
  --   أعباء  = ساعات الأساس   × (متغيرة + ثابتة)   (حسب أساس التحميل)
  SELECT ro.operation_no, ro.operation_name, wc.code AS wc_code, wc.name AS wc_name,
         wc.overhead_absorption_base AS base
    INTO v_bad
    FROM public.manufacturing_routing_operations ro
    JOIN public.manufacturing_work_centers wc ON wc.id = ro.work_center_id
   WHERE ro.routing_version_id = p_routing_version_id
     AND (
       (COALESCE(ro.labor_time_minutes,0)   / 60.0) * COALESCE(wc.labor_cost_rate,0)
     + (COALESCE(ro.machine_time_minutes,0) / 60.0) * COALESCE(wc.machine_cost_rate,0)
     + (CASE WHEN wc.overhead_absorption_base = 'labour_hours'
               THEN COALESCE(ro.labor_time_minutes,0)   / 60.0
               ELSE COALESCE(ro.machine_time_minutes,0) / 60.0 END)
       * (COALESCE(wc.variable_overhead_rate,0) + COALESCE(wc.fixed_overhead_rate,0))
     ) <= 0
   ORDER BY ro.operation_no
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'العملية % «%» على مركز العمل % «%» تكلفة تحويلها = صفر، فيدخل المنتج التام بتكلفة ناقصة. مركز العمل يحمّل الأعباء على «%». تأكد من «زمن العمالة (دقائق)» و«زمن الآلة (دقائق)» ومن أسعار مركز العمل؛ فزمن التحضير وزمن التشغيل للجدولة لا للتكلفة. | Operation % "%" at work centre % "%" yields zero conversion cost (overhead absorbed on %). Check labour/machine minutes and the work centre rates; setup and run time drive scheduling, not cost.',
      v_bad.operation_no, v_bad.operation_name, v_bad.wc_code, v_bad.wc_name, v_bad.base,
      v_bad.operation_no, v_bad.operation_name, v_bad.wc_code, v_bad.wc_name, v_bad.base
      USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.mr_assert_routing_operations_costable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mr_assert_routing_operations_costable(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mr_guard_routing_version_approval_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
    IF NOT public.mr_is_routing_version_approval_transition_allowed(OLD.approval_status, NEW.approval_status) THEN
      RAISE EXCEPTION
        'انتقال غير مسموح لحالة اعتماد مسار التصنيع. routing_version_id=%, القديم=%, الجديد=%',
        OLD.id, OLD.approval_status, NEW.approval_status USING ERRCODE = 'P0001';
    END IF;

    -- v3.74.845 — **عند الإرسال للاعتماد أيضاً**، لا عند الاعتماد وحده.
    -- كان الفحص عند الاعتماد فقط، فيُرسل مسؤول التصنيع مساراً ناقصاً ويصل
    -- المالك طلب **يستحيل اعتماده**، فيرى هو الرسالة ولا يراها من يستطيع
    -- إصلاحها. وهو نفس عطب ٨٣٣ (طلب استلام يُنشأ ولا يمكن تنفيذه):
    -- **يُفحص عند البوابة التى يملك صاحبها الإصلاح.**
    IF NEW.approval_status IN ('pending_approval', 'approved') THEN
      PERFORM public.mr_assert_routing_operations_costable(NEW.id);
    END IF;
  END IF;

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

-- ─────────────────────────────────────────────────────────────────────────────
-- ٣) منع صرف نقدى لموظف له مرتب أساسى — منع القبض مرتين
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.plw_assert_no_cash_to_salaried_employee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment_id UUID;
  v_mode TEXT;
  v_no TEXT;
  v_name TEXT;
  v_salary NUMERIC;
BEGIN
  IF TG_TABLE_NAME = 'production_labour_payment_lines' THEN
    v_payment_id := NEW.payment_id;
  ELSE
    v_payment_id := NEW.id;
  END IF;

  SELECT payment_mode, payment_no INTO v_mode, v_no
    FROM public.production_labour_payments WHERE id = v_payment_id;

  IF v_mode IS DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;

  SELECT e.full_name, e.base_salary INTO v_name, v_salary
    FROM public.production_labour_payment_lines l
    JOIN public.employees e ON e.id = l.employee_id
   WHERE l.payment_id = v_payment_id
     AND COALESCE(e.base_salary, 0) > 0
   ORDER BY e.full_name
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION '«%» موظف بمرتب أساسى % — لا يجوز صرف أجر نقدى له عن أمر الإنتاج، لأنه يقبض مرتبه الشهرى فيكون قد قبض مرتين وحُمِّلت التكلفة مرتين. الصحيح: اختر «تسجيل ساعات فقط» — تُسجَّل ساعاته وتُحمَّل تكلفتها على أمر الإنتاج، ويُصرف أجره مع المرتب الشهرى. أما الصرف النقدى فللعمالة المؤقتة باليومية، أو لموظف بلا مرتب أساسى. | "%" is a salaried employee (base salary %); paying production wages in cash would pay and cost them twice. Use "hours only": the hours are costed to the production order and the pay is settled with the monthly payroll.',
      v_name, v_salary, v_name, v_salary
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

-- دالة مُشغِّل تُستدعى من القاعدة لا من المستخدم.
REVOKE ALL ON FUNCTION public.plw_assert_no_cash_to_salaried_employee() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_plpl_no_cash_to_salaried ON public.production_labour_payment_lines;
CREATE TRIGGER trg_plpl_no_cash_to_salaried
  AFTER INSERT OR UPDATE ON public.production_labour_payment_lines
  FOR EACH ROW EXECUTE FUNCTION public.plw_assert_no_cash_to_salaried_employee();

-- الالتفاف المحتمل: يُنشأ الطلب «ساعات فقط» ثم يُحوَّل إلى «صرف» بعد إضافة
-- السطور. المُشغِّل على السطور وحده لا يراه، فيُغطَّى هنا.
DROP TRIGGER IF EXISTS trg_plp_no_cash_to_salaried ON public.production_labour_payments;
CREATE TRIGGER trg_plp_no_cash_to_salaried
  AFTER UPDATE OF payment_mode ON public.production_labour_payments
  FOR EACH ROW EXECUTE FUNCTION public.plw_assert_no_cash_to_salaried_employee();

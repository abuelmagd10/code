-- ============================================================================
-- v3.74.849 — ربط دفعة العمولات بدفعة المرتبات، وإغلاق باب إضافتها مرتين
-- ============================================================================
--
-- **الحادثة**: زر «ربط العمولات» فى شاشة المرتبات يستدعى طريقاً كان يقرأ
-- `commission_runs.payroll_run_id` — وهو عمود **لم يُنشأ قط**. فيفشل أول
-- استعلام، ويردّ الطريق «دفعة العمولات غير موجودة» عن دفعة موجودة أمامه.
--
-- **وكادت الميزة تُحذف**: قلتُ للمالك إن جداول العمولات فارغة فالكود غير
-- مستعمل. الجداول فارغة فعلاً، لكن الاستنتاج خاطئ: الميزة **مبنية بالكامل
-- وموصولة بالواجهة** — ٢٦ ملفاً و١٢ طريقاً وشاشات وزر حىّ. «فارغ» تعنى «لم
-- يُستعمل بعد»، لا «غير موجود». ⇒ **لا يُستدَلّ على موت الكود من خلوّ جدوله.**
--
-- والعمود ليس تفصيلاً: هو **الحارس** الذى يمنع ربط نفس العمولات مرتين. وبدونه
-- كان الضغط على الزر مرتين يضيف العمولة إلى المرتب مرتين.
--
-- وثلاثة عيوب أخرى فى نفس المسار عولجت معه:
--   · `commission_plans(payout_mode)` — عمود وهمى، والقيمة لا تُستعمل أصلاً.
--   · صيغة صافى المرتب كانت **تُسقط** `commission` و`commission_advance_deducted`،
--     فينتج كشف غير متوازن يرفضه `post_payroll_atomic` بـPAYSLIP_IMBALANCE.
--   · الترتيب كان: عدِّل كل الكشوف **ثم** سجّل الرابط. فأى تعثّر بينهما يترك
--     الزيادة مطبَّقة بلا ما يمنع تكرارها. ⇒ **يُطالَب بالرابط أولاً.**
-- ============================================================================

-- ── ١) الرابط ───────────────────────────────────────────────────────────────
ALTER TABLE public.commission_runs
  ADD COLUMN IF NOT EXISTS payroll_run_id UUID
  REFERENCES public.payroll_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_commission_runs_payroll_run
  ON public.commission_runs(payroll_run_id) WHERE payroll_run_id IS NOT NULL;

-- ── ٢) الرابط يُكتب مرة واحدة ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cmr_payroll_link_is_write_once()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.payroll_run_id IS NOT NULL
     AND NEW.payroll_run_id IS DISTINCT FROM OLD.payroll_run_id THEN
    RAISE EXCEPTION 'دفعة العمولات مرتبطة بالفعل بدفعة مرتبات، ولا يجوز إعادة ربطها — فإعادة الربط تُضيف العمولة إلى المرتب مرة ثانية. | This commission run is already attached to a payroll run; re-attaching would add the commission to the payslips twice.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.cmr_payroll_link_is_write_once() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cmr_payroll_link_write_once ON public.commission_runs;
CREATE TRIGGER trg_cmr_payroll_link_write_once
  BEFORE UPDATE OF payroll_run_id ON public.commission_runs
  FOR EACH ROW EXECUTE FUNCTION public.cmr_payroll_link_is_write_once();

-- ── ٣) العملية ذرّية: يُقفَل السجل، ثم يُطالَب بالرابط، ثم تُعدَّل الكشوف ────
CREATE OR REPLACE FUNCTION public.commission_attach_to_payroll_atomic(
  p_company_id UUID,
  p_commission_run_id UUID,
  p_payroll_run_id UUID
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run RECORD;
  v_updated INT := 0;
  v_total NUMERIC(15,2) := 0;
  r RECORD;
BEGIN
  PERFORM public.assert_company_access(p_company_id);

  -- القفل أولاً: طلبان متزامنان لا يقرآن «غير مرتبطة» معاً ثم يربطان معاً.
  SELECT id, status, payroll_run_id INTO v_run
    FROM public.commission_runs
   WHERE id = p_commission_run_id AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RUN_NOT_FOUND: دفعة العمولات غير موجودة' USING ERRCODE='P0002';
  END IF;

  IF v_run.payroll_run_id IS NOT NULL THEN
    IF v_run.payroll_run_id = p_payroll_run_id THEN
      RETURN jsonb_build_object('ok', TRUE, 'idempotent', TRUE, 'employeesUpdated', 0,
        'totalCommissionAdded', 0, 'message', 'دفعة العمولات مربوطة بهذه المرتبات بالفعل');
    END IF;
    RAISE EXCEPTION 'ALREADY_ATTACHED: دفعة العمولات مرتبطة بدفعة مرتبات أخرى' USING ERRCODE='P0003';
  END IF;

  IF v_run.status NOT IN ('posted','paid') THEN
    RAISE EXCEPTION 'BAD_STATUS: يجب ترحيل دفعة العمولات أو صرفها قبل ربطها بالمرتبات' USING ERRCODE='P0004';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.payroll_runs
                  WHERE id = p_payroll_run_id AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'PAYROLL_NOT_FOUND: دفعة المرتبات غير موجودة' USING ERRCODE='P0005';
  END IF;

  -- **الرابط يُطالَب به قبل تعديل أى كشف.**
  UPDATE public.commission_runs SET payroll_run_id = p_payroll_run_id
   WHERE id = p_commission_run_id;

  FOR r IN
    SELECT employee_id, SUM(COALESCE(amount,0)) AS amt
      FROM public.commission_ledger
     WHERE commission_run_id = p_commission_run_id AND company_id = p_company_id
     GROUP BY employee_id
    HAVING SUM(COALESCE(amount,0)) <> 0
  LOOP
    -- الصيغة **كاملة** كما يقرأها post_payroll_atomic.
    UPDATE public.payslips ps
       SET sales_bonus = COALESCE(ps.sales_bonus,0) + r.amt,
           net_salary  = COALESCE(ps.base_salary,0) + COALESCE(ps.allowances,0)
                       + COALESCE(ps.bonuses,0) + COALESCE(ps.sales_bonus,0) + r.amt
                       + COALESCE(ps.commission,0)
                       - COALESCE(ps.advances,0) - COALESCE(ps.commission_advance_deducted,0)
                       - COALESCE(ps.insurance,0) - COALESCE(ps.deductions,0)
     WHERE ps.payroll_run_id = p_payroll_run_id
       AND ps.employee_id = r.employee_id
       AND ps.company_id = p_company_id;

    IF FOUND THEN
      v_updated := v_updated + 1;
      v_total := v_total + r.amt;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', TRUE, 'idempotent', FALSE,
    'employeesUpdated', v_updated, 'totalCommissionAdded', v_total,
    'message', 'تم ربط دفعة العمولات بالمرتبات');
END;
$function$;

REVOKE ALL ON FUNCTION public.commission_attach_to_payroll_atomic(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_attach_to_payroll_atomic(uuid, uuid, uuid) TO authenticated, service_role;

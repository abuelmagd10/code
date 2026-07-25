-- ============================================================================
-- v3.74.817 — قيد المرتبات: الإجمالى بدل الصافى + إثبات الاستقطاعات + الفرع
-- ============================================================================
-- **الفجوة** (أخطر ما فى مراجعة المديولات، لأنها تتكرر لكل موظف كل شهر):
--
-- `post_payroll_atomic` — وهو المسار الذى تستدعيه الواجهة فعلاً — كان يبنى
-- قيداً من سطرين فقط:
--       مدين مصروف المرتبات   = **صافى** المرتب
--           دائن الخزنة        = **صافى** المرتب
--
-- ثلاث نتائج خاطئة يستحيل اكتشافها من الميزان (لأنه متوازن!):
--
-- (١) **مصروف المرتبات مُنقَص بقيمة كل الاستقطاعات.** التأمينات والضرائب
--     والسلف المستقطعة جزء من تكلفة العمالة على الشركة، لا تختفى لأن
--     الموظف لم يقبضها. قائمة الدخل تُظهر تكلفة عمالة أقل من الحقيقة.
--
-- (٢) **التزامات الشركة تجاه الغير لا تظهر إطلاقاً.** ما استُقطع للتأمينات
--     أو الضرائب دَين على الشركة حتى تورده للجهة المختصة — كان يختفى من
--     الميزانية تماماً، فتبدو الالتزامات أقل من حقيقتها.
--
-- (٣) **السلفة المستقطعة لا تُسدَّد دفترياً.** حساب «سلف ومقدمات للموظفين»
--     (أصل) يبقى بكامل رصيده رغم أن الموظف سدّد من راتبه ⇒ أصل وهمى.
--
-- وبلا `branch_id` على أى سطر ⇒ ربحية الفروع تستبعد المرتبات كلها، وهى
-- عادةً أكبر بند مصروف. (تقرير مقارنة الفروع كان يوزّع كل شىء إلا الأجور.)
--
-- **القيد الصحيح** الذى تبنيه الدالة بعد هذه الهجرة:
--
--   مدين  5210 الرواتب والأجور        الإجمالى (مقسَّماً على فرع كل موظف)
--       دائن 1170 سلف ومقدمات للموظفين   السلف المستقطعة
--       دائن 2135 تأمينات اجتماعية مستحقة التأمينات المستقطعة
--       دائن 2125 استقطاعات مستحقة أخرى  باقى الاستقطاعات
--       دائن الخزنة/البنك                 الصافى المدفوع
--
-- والتوازن **بالبناء**: الإجمالى = الصافى + مجموع الاستقطاعات. وإن خالف
-- ذلك (بيانات كشف تالفة) تُرفع رسالة صريحة ثنائية اللغة بدل ترحيل قيد مشوّه.
--
-- **البيانات القائمة**: فُحصت كشوف المرتبات الأربعة فى الإنتاج — كلها بلا
-- أى استقطاع (الصافى = الإجمالى) ولم يُرحَّل لها قيد صرف بعد، فلا يوجد قيد
-- تاريخى يحتاج تصحيحاً. الإصلاح وقائى بالكامل قبل أول دورة رواتب حقيقية.
-- ============================================================================

-- ─── (٠) نزع فتيل الدالة الثانية غير المتوازنة ─────────────────────────────
-- `post_payroll_run_atomic` دالة قديمة نصّها يعترف بنفسه:
--   "SIMPLIFICATION: ... We Don't handle Deductions logic deeply here"
-- تُدين بمجموع **المستحقات** وتُدائن **الصافى** ⇒ أى استقطاع يجعل القيد
-- غير متوازن. لا تستدعيها الواجهة اليوم، لكنها مسدس محشوّ: أى استدعاء
-- مستقبلى يُفسد الدفاتر. تُستبدل برسالة صريحة توجّه للمسار الصحيح بدل
-- حذفها (فلا ينكسر أى استدعاء صامت بخطأ غامض).
CREATE OR REPLACE FUNCTION public.post_payroll_run_atomic(
  p_payroll_run_id uuid, p_expense_account_id uuid, p_payable_account_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RAISE EXCEPTION 'DEPRECATED_PAYROLL_POSTER: هذا المسار القديم كان يُنتج قيداً غير متوازن عند وجود استقطاعات — استخدم صرف المرتبات من شاشة الرواتب (post_payroll_atomic). | This legacy poster produced an unbalanced entry whenever deductions existed; use the payroll payment screen (post_payroll_atomic).'
    USING ERRCODE = 'check_violation';
END;
$function$;

-- ─── (أ) حساب التأمينات المستحقة: يُنشأ لأى شركة تفتقده ────────────────────
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type,
                               normal_balance, sub_type, parent_id, level, is_active, is_system)
SELECT c.company_id, '2135', 'تأمينات اجتماعية مستحقة', 'liability', 'credit', 'accrued_insurance',
       c.id, 3, TRUE, TRUE
FROM chart_of_accounts c
WHERE c.account_code = '2100'
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x
                  WHERE x.company_id = c.company_id AND x.account_code = '2135');

-- ─── (ب) الدالة: نفس التوقيع (فلا تتغير الواجهة) وقيد صحيح ─────────────────
CREATE OR REPLACE FUNCTION public.post_payroll_atomic(
  p_company_id uuid, p_payroll_run_id uuid, p_payment_account_id uuid,
  p_expense_account_id uuid, p_payment_date date, p_year integer, p_month integer,
  p_created_by uuid, p_idempotency_key text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_net                NUMERIC(15,2) := 0;
  v_gross              NUMERIC(15,2) := 0;
  v_advances           NUMERIC(15,2) := 0;
  v_insurance          NUMERIC(15,2) := 0;
  v_other_deductions   NUMERIC(15,2) := 0;
  v_entry_id           UUID;
  v_period_locked      BOOLEAN := FALSE;
  v_period_name        TEXT;
  v_existing_entry     UUID;
  v_idempotency_result JSONB;
  v_description        TEXT;
  v_advances_acct      UUID;
  v_insurance_acct     UUID;
  v_deduction_acct     UUID;
  v_branch             RECORD;
  v_diff               NUMERIC(15,2);
BEGIN
  PERFORM public.assert_company_access(p_company_id);

  -- v3.74.817 — **اكتشاف حرج**: الدالة كانت تُدخل القيد مباشرة بلا فتح بوابة
  -- الترحيل المباشر، فيصدّها حارس `enforce_je_integrity` برسالة
  -- DIRECT_POST_BLOCKED. النتيجة: **صرف المرتبات لم ينجح ولا مرة واحدة فى أى
  -- شركة** (صفر قيود reference_type='payroll_payment' فى الإنتاج — دليل قاطع).
  -- الدوال الذرية النظيرة (مثل confirm_purchase_return_delivery_v2) تفتح
  -- البوابة صراحة داخل معاملتها؛ هذه أُغفلت.
  PERFORM set_config('app.allow_direct_post', 'true', true);

  IF p_idempotency_key IS NOT NULL THEN
    v_idempotency_result := public.check_and_claim_idempotency_key(
      p_idempotency_key, p_company_id, 'payroll_pay', NULL, p_created_by);
    IF v_idempotency_result IS NOT NULL AND (v_idempotency_result->>'cached')::BOOLEAN THEN
      RETURN v_idempotency_result->'response';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.accounting_periods
    WHERE company_id = p_company_id
      AND p_payment_date BETWEEN period_start AND period_end
      AND (is_locked = TRUE OR status IN ('closed','locked'))
  ) INTO v_period_locked;

  IF v_period_locked THEN
    SELECT period_name INTO v_period_name FROM public.accounting_periods
    WHERE company_id = p_company_id
      AND p_payment_date BETWEEN period_start AND period_end
      AND (is_locked = TRUE OR status IN ('closed','locked')) LIMIT 1;
    IF p_idempotency_key IS NOT NULL THEN
      PERFORM public.complete_idempotency_key(p_idempotency_key, p_company_id, 'payroll_pay',
        jsonb_build_object('error','PERIOD_LOCKED','period',v_period_name), FALSE);
    END IF;
    RAISE EXCEPTION 'PERIOD_LOCKED: الفترة "%" مقفلة', COALESCE(v_period_name, p_payment_date::TEXT)
      USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_existing_entry FROM public.journal_entries
  WHERE company_id = p_company_id AND reference_type = 'payroll_payment'
    AND reference_id = p_payroll_run_id
    AND (is_deleted IS NULL OR is_deleted = FALSE) AND deleted_at IS NULL LIMIT 1;

  IF v_existing_entry IS NOT NULL THEN
    IF p_idempotency_key IS NOT NULL THEN
      PERFORM public.complete_idempotency_key(p_idempotency_key, p_company_id, 'payroll_pay',
        jsonb_build_object('ok',TRUE,'entry_id',v_existing_entry,'idempotent',TRUE), TRUE);
    END IF;
    RETURN jsonb_build_object('ok',TRUE,'entry_id',v_existing_entry,
      'message','تم صرف هذه الدفعة مسبقاً','idempotent',TRUE);
  END IF;

  -- v3.74.817 — الإجمالى والاستقطاعات، لا الصافى وحده
  SELECT
    COALESCE(SUM(net_salary), 0),
    COALESCE(SUM(COALESCE(base_salary,0) + COALESCE(allowances,0) + COALESCE(bonuses,0)
               + COALESCE(sales_bonus,0) + COALESCE(commission,0)), 0),
    COALESCE(SUM(COALESCE(advances,0) + COALESCE(commission_advance_deducted,0)), 0),
    COALESCE(SUM(COALESCE(insurance,0)), 0),
    COALESCE(SUM(COALESCE(deductions,0)), 0)
  INTO v_net, v_gross, v_advances, v_insurance, v_other_deductions
  FROM public.payslips
  WHERE company_id = p_company_id AND payroll_run_id = p_payroll_run_id;

  IF v_net <= 0 THEN
    IF p_idempotency_key IS NOT NULL THEN
      PERFORM public.complete_idempotency_key(p_idempotency_key, p_company_id, 'payroll_pay',
        jsonb_build_object('error','NO_PAYSLIPS'), FALSE);
    END IF;
    RAISE EXCEPTION 'NO_PAYSLIPS: لا توجد كشوف مرتبات للصرف' USING ERRCODE = 'P0003';
  END IF;

  -- التوازن بالبناء: الإجمالى يجب أن يساوى الصافى + كل الاستقطاعات.
  -- إن اختلّ فالخلل فى كشف المرتب نفسه — نرفض بوضوح بدل ترحيل قيد مشوّه.
  v_diff := ROUND(v_gross - (v_net + v_advances + v_insurance + v_other_deductions), 2);
  IF ABS(v_diff) > 0.01 THEN
    IF p_idempotency_key IS NOT NULL THEN
      PERFORM public.complete_idempotency_key(p_idempotency_key, p_company_id, 'payroll_pay',
        jsonb_build_object('error','PAYSLIP_IMBALANCE','diff',v_diff), FALSE);
    END IF;
    RAISE EXCEPTION 'PAYSLIP_IMBALANCE: إجمالى المستحقات (%) لا يساوى الصافى (%) مضافاً إليه الاستقطاعات (%) — راجع كشوف المرتبات قبل الصرف. | Gross (%) does not equal net (%) plus deductions (%); fix the payslips before paying.',
      v_gross, v_net, v_advances + v_insurance + v_other_deductions,
      v_gross, v_net, v_advances + v_insurance + v_other_deductions
      USING ERRCODE = 'P0004';
  END IF;

  SELECT id INTO v_advances_acct  FROM chart_of_accounts
   WHERE company_id = p_company_id AND account_code = '1170' LIMIT 1;
  SELECT id INTO v_insurance_acct FROM chart_of_accounts
   WHERE company_id = p_company_id AND account_code = '2135' LIMIT 1;
  SELECT id INTO v_deduction_acct FROM chart_of_accounts
   WHERE company_id = p_company_id AND account_code = '2125' LIMIT 1;
  -- عند غياب حساب متخصص نرجع للمصروفات المستحقة الأخرى بدل إسقاط السطر
  IF v_insurance_acct IS NULL OR v_deduction_acct IS NULL THEN
    SELECT id INTO v_insurance_acct FROM chart_of_accounts
     WHERE company_id = p_company_id AND account_code = '2160' LIMIT 1;
    v_deduction_acct := COALESCE(v_deduction_acct, v_insurance_acct);
  END IF;

  v_description := format('صرف مرتبات %s-%s', p_year, LPAD(p_month::TEXT,2,'0'));
  INSERT INTO public.journal_entries
    (company_id, entry_date, description, reference_type, reference_id, status, posted_by, posted_at)
  VALUES (p_company_id, p_payment_date, v_description, 'payroll_payment', p_payroll_run_id,
          'posted', p_created_by, NOW())
  RETURNING id INTO v_entry_id;

  -- (١) المصروف بالإجمالى، سطر لكل فرع — فتظهر الأجور فى ربحية الفرع
  FOR v_branch IN
    SELECT e.branch_id,
           SUM(COALESCE(ps.base_salary,0) + COALESCE(ps.allowances,0) + COALESCE(ps.bonuses,0)
             + COALESCE(ps.sales_bonus,0) + COALESCE(ps.commission,0)) AS branch_gross
    FROM public.payslips ps
    LEFT JOIN public.employees e ON e.id = ps.employee_id
    WHERE ps.company_id = p_company_id AND ps.payroll_run_id = p_payroll_run_id
    GROUP BY e.branch_id
    HAVING SUM(COALESCE(ps.base_salary,0) + COALESCE(ps.allowances,0) + COALESCE(ps.bonuses,0)
             + COALESCE(ps.sales_bonus,0) + COALESCE(ps.commission,0)) > 0
  LOOP
    INSERT INTO public.journal_entry_lines
      (journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id)
    VALUES (v_entry_id, p_expense_account_id, ROUND(v_branch.branch_gross, 2), 0,
            'إجمالى مستحقات المرتبات', v_branch.branch_id);
  END LOOP;

  -- (٢) السلف المستقطعة تُسدَّد من حساب السلف (أصل)
  IF v_advances > 0 AND v_advances_acct IS NOT NULL THEN
    INSERT INTO public.journal_entry_lines
      (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_entry_id, v_advances_acct, 0, v_advances, 'تسوية سلف الموظفين المستقطعة');
  END IF;

  -- (٣) التأمينات المستقطعة: التزام على الشركة حتى توريدها
  IF v_insurance > 0 AND v_insurance_acct IS NOT NULL THEN
    INSERT INTO public.journal_entry_lines
      (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_entry_id, v_insurance_acct, 0, v_insurance, 'تأمينات مستقطعة مستحقة التوريد');
  END IF;

  -- (٤) باقى الاستقطاعات (ضرائب/جزاءات): التزام كذلك
  IF v_other_deductions > 0 AND v_deduction_acct IS NOT NULL THEN
    INSERT INTO public.journal_entry_lines
      (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_entry_id, v_deduction_acct, 0, v_other_deductions, 'استقطاعات مستحقة التوريد');
  END IF;

  -- (٥) الصافى المدفوع فعلاً
  INSERT INTO public.journal_entry_lines
    (journal_entry_id, account_id, debit_amount, credit_amount, description)
  VALUES (v_entry_id, p_payment_account_id, 0, v_net, 'صافى المرتبات المصروفة');

  -- تُغلق البوابة فور الانتهاء فلا تتسرب لبقية المعاملة
  PERFORM set_config('app.allow_direct_post', 'false', true);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.complete_idempotency_key(p_idempotency_key, p_company_id, 'payroll_pay',
      jsonb_build_object('ok',TRUE,'entry_id',v_entry_id,'total',v_net,'gross',v_gross), TRUE);
  END IF;

  RETURN jsonb_build_object('ok',TRUE,'entry_id',v_entry_id,'total',v_net,
    'gross',v_gross,'deductions',v_advances + v_insurance + v_other_deductions,
    'description',v_description);

EXCEPTION WHEN OTHERS THEN
  IF p_idempotency_key IS NOT NULL THEN
    BEGIN
      PERFORM public.complete_idempotency_key(p_idempotency_key, p_company_id, 'payroll_pay',
        jsonb_build_object('error', SQLERRM), FALSE);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RAISE;
END;
$function$;

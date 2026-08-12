-- ============================================================================
-- v3.75.19 — «ومسارُ مالٍ مُتقاعِدٌ فى بيتٍ حىٌّ فى بيتٍ ليس متقاعداً»
-- ============================================================================
--
-- ═══ الدفعةُ الثانيةُ من الفجوةِ بين البيتَين ═══
--
-- بعد الحرّاسِ والأبوابِ فى v3.75.18، قِيست **أربعٌ وعشرون دالّةً محاسبيّةً
-- وتكلفيّةً** مختلفةً بين الإنتاجِ والاختبار، بنفسِ المقاييسِ الثلاثةِ المتدرّجة:
--
--   • **تسعَ عشرةَ** اختلافُها **تعليقاتٌ وكسرُ أسطرٍ فقط** — لا تُلمَس.
--   • **واحدةٌ** صارت متطابقةً سلفاً.
--   • **واحدةٌ** (`ic_tax_accuracy`) فيها حدٌّ **مضروبٌ فى صفر** لا يضيفُ شيئاً —
--     **فراغٌ لا فرق**، فيُعدُّ ولا يُغيَّر: لا يُحرَّكُ نصُّ معادلةِ ضرائبَ
--     مقابلَ صفرِ سلوك.
--   • **وأربعٌ فيها اختلافٌ حقيقىٌّ فى المال** — وهى وحدَها ما تحملُه الهجرة.
--
-- ═══ وأخطرُها مسارانِ ماتا فى بيتٍ وبقيا حيَّين فى الآخر ═══
--
-- **(١) `post_payroll_run_atomic`** — على الإنتاجِ مُغلَقٌ برسالةٍ تقول إنّه
--     «كان **يُنتجُ قيداً غيرَ متوازنٍ عند وجودِ استقطاعات**». وعلى الاختبارِ
--     ما زال يعملُ بجسدِه القديم.
--
-- **(٢) `record_shareholder_drawing_atomic`** — على الإنتاجِ مُغلَقٌ لأنّه كان
--     «**يُرحّلُ المسحوباتِ فوراً بلا اعتمادٍ ولا فحصِ رصيدٍ ولا فصلِ مهامّ**».
--     وعلى الاختبارِ ما زال حيّاً: يُدخِلُ المسحوبةَ بحالةِ `posted` مباشرةً،
--     **ويُشغّلُ مفتاحَ التجاوزِ `app.allow_direct_post` بيدِه** ليتخطّى حارسَ
--     القيودِ المرحَّلة، ثمّ يكتبُ طرفَى القيد. **مسحوبُ شريكٍ يخرجُ بلا اعتماد.**
--
--     **وبابٌ أُغلق فى بيتٍ وبقىَ مفتوحاً فى بيتٍ لم يُغلَقْ بعد.**
--
-- **(٣) `post_bonus_accrual_atomic`** — الإنتاجُ يعرفُ **استردادَ العمولة**
--     (مبلغٌ سالبٌ بعد مرتجعِ مبيعات) فيعكسُ طرفَى القيدِ بالكامل؛ والاختبارُ
--     يتخطّى أىَّ مبلغٍ غيرِ موجب، ولو مرَّ سالبٌ لكتبَ **مديناً بالسالب**.
--
-- **(٤) `post_payroll_atomic`** — الإنتاجُ يُغلقُ مفتاحَ منعِ التكرارِ عند كلِّ
--     فشل (`complete_idempotency_key`) ويسمّى الفترةَ المقفلةَ باسمِها ويمنعُ
--     عدمَ توازنِ كشوفِ المرتّبات (`PAYSLIP_IMBALANCE`)؛ والاختبارُ يتركُ
--     المفتاحَ معلَّقاً — **فمحاولةٌ فاشلةٌ تقفلُ البابَ على المحاولةِ التالية.**
--
-- **وفى الأربعِ جميعاً الإنتاجُ هو الأصحّ** — بخلافِ v3.75.18 التى كان
-- الاختبارُ فيها أدقَّ فى موضع. **ولهذا يُقاسُ ولا يُنقَلُ بالثقة.**
--
-- ═══ والفخُّ يُشغَّل ═══
--
-- الفحصُ المرجعىُّ لا يكتفى بقراءةِ النصّ: **ينادى المسارَين المتقاعدَين فعلاً
-- ويشترطُ أن يرفضا**. وهما يرفضانِ قبل أن يمسّا صفّاً، فلا أثرَ للنداء.
-- **وفخٌّ لا يُشغَّل ليس فخّاً.**
--
-- **ولا صفَّ بياناتٍ يُلمَس، ولا شاشةَ تتغيّر، ولا شىءَ يتغيّرُ على الإنتاجِ
-- أصلاً — فالنصُّ المكتوبُ هنا هو نصُّه اليوم.**
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- (١) مُرحِّلُ الرواتبِ القديمُ — مُغلَق
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_payroll_run_atomic(p_payroll_run_id uuid, p_expense_account_id uuid, p_payable_account_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RAISE EXCEPTION 'DEPRECATED_PAYROLL_POSTER: هذا المسار القديم كان يُنتج قيداً غير متوازن عند وجود استقطاعات — استخدم صرف المرتبات من شاشة الرواتب (post_payroll_atomic). | This legacy poster produced an unbalanced entry whenever deductions existed; use the payroll payment screen (post_payroll_atomic).'
    USING ERRCODE = 'check_violation';
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────
-- (٢) مسارُ مسحوباتِ الشركاءِ القديمُ — مُغلَق
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_shareholder_drawing_atomic(p_company_id uuid, p_shareholder_id uuid, p_amount numeric, p_drawing_date date, p_payment_account_id uuid, p_drawings_account_id uuid, p_description text DEFAULT NULL::text, p_branch_id uuid DEFAULT NULL::uuid, p_cost_center_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RAISE EXCEPTION 'DEPRECATED_DRAWING_PATH: هذا المسار كان يُرحّل المسحوبات فوراً بلا اعتماد ولا فحص رصيد ولا فصل مهام — سجّل المسحوبة من شاشة المسحوبات لتمر بدورة الاعتماد. | This legacy path posted drawings immediately with no approval, no cash-balance check and no segregation of duties; record the drawing from the drawings screen so it goes through the approval cycle.'
    USING ERRCODE = 'check_violation';
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────
-- (٣) قيدُ العمولةِ يعرفُ الاسترداد
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_bonus_accrual_atomic(p_bonus_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_b RECORD; v_exp uuid; v_liab uuid; v_entry uuid; v_branch uuid; v_cc uuid; v_date date;
  v_abs numeric; v_is_clawback boolean;
BEGIN
  SELECT * INTO v_b FROM public.user_bonuses WHERE id = p_bonus_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BONUS_NOT_FOUND'; END IF;
  PERFORM public.assert_company_access(v_b.company_id);

  IF v_b.journal_entry_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'entry_id', v_b.journal_entry_id, 'idempotent', TRUE);
  END IF;
  IF COALESCE(v_b.bonus_amount, 0) = 0 THEN
    RETURN jsonb_build_object('ok', TRUE, 'skipped', 'ZERO_AMOUNT');
  END IF;
  IF v_b.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'skipped', 'REVERSED');
  END IF;

  -- v3.74.822 — الاسترداد (clawback) يأتى بمبلغ سالب: يُعكس القيد بالكامل
  -- (مدين الالتزام / دائن المصروف) فيتراجع الاعتراف بنفس القدر تماماً.
  v_abs := ABS(v_b.bonus_amount);
  v_is_clawback := v_b.bonus_amount < 0;

  SELECT id INTO v_exp  FROM chart_of_accounts WHERE company_id=v_b.company_id AND account_code='5215' LIMIT 1;
  SELECT id INTO v_liab FROM chart_of_accounts WHERE company_id=v_b.company_id AND account_code='2136' LIMIT 1;
  IF v_exp IS NULL OR v_liab IS NULL THEN
    RAISE EXCEPTION 'COMMISSION_ACCOUNTS_MISSING: حسابا العمولات (5215 / 2136) غير موجودين. | The commission accounts (5215 / 2136) are missing.'
      USING ERRCODE='check_violation';
  END IF;

  SELECT branch_id, cost_center_id, COALESCE(invoice_date, CURRENT_DATE)
    INTO v_branch, v_cc, v_date
  FROM invoices WHERE id = v_b.invoice_id;
  IF v_branch IS NULL THEN
    SELECT branch_id INTO v_branch FROM employees WHERE id = v_b.employee_id;
  END IF;
  v_date := COALESCE(v_date, v_b.calculated_at::date, CURRENT_DATE);

  PERFORM public.validate_transaction_period(v_b.company_id, v_date);

  PERFORM set_config('app.allow_direct_post', 'true', true);

  INSERT INTO public.journal_entries
    (company_id, branch_id, cost_center_id, entry_date, description,
     reference_type, reference_id, status, posted_by, posted_at)
  VALUES (v_b.company_id, v_branch, v_cc, v_date,
          CASE WHEN v_is_clawback THEN 'استرداد عمولة بيع (مرتجع مبيعات)'
               ELSE 'استحقاق عمولة/مكافأة بيع' END,
          'sales_bonus_accrual', p_bonus_id, 'posted', p_user_id, NOW())
  RETURNING id INTO v_entry;

  INSERT INTO public.journal_entry_lines
    (journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id)
  VALUES
    (v_entry, v_exp,
     CASE WHEN v_is_clawback THEN 0 ELSE v_abs END,
     CASE WHEN v_is_clawback THEN v_abs ELSE 0 END,
     CASE WHEN v_is_clawback THEN 'عكس عمولة بيع بعد المرتجع' ELSE 'عمولة بيع مستحقة للموظف' END,
     v_branch, v_cc),
    (v_entry, v_liab,
     CASE WHEN v_is_clawback THEN v_abs ELSE 0 END,
     CASE WHEN v_is_clawback THEN 0 ELSE v_abs END,
     CASE WHEN v_is_clawback THEN 'تخفيض التزام العمولات المستحقة' ELSE 'التزام عمولات مستحقة' END,
     v_branch, v_cc);

  PERFORM set_config('app.allow_direct_post', 'false', true);

  UPDATE public.user_bonuses
     SET journal_entry_id = v_entry, accrued_at = NOW(), updated_at = NOW()
   WHERE id = p_bonus_id;

  RETURN jsonb_build_object('ok', TRUE, 'entry_id', v_entry,
                            'amount', v_b.bonus_amount, 'clawback', v_is_clawback);
END;
$function$;


-- ─────────────────────────────────────────────────────────────────────────
-- (٤) صرفُ المرتّبات: مفتاحُ منعِ التكرارِ يُغلَقُ عند كلِّ فشل، والفترةُ تُسمّى
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_payroll_atomic(p_company_id uuid, p_payroll_run_id uuid, p_payment_account_id uuid, p_expense_account_id uuid, p_payment_date date, p_year integer, p_month integer, p_created_by uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_net NUMERIC(15,2):=0; v_gross NUMERIC(15,2):=0; v_advances NUMERIC(15,2):=0;
  v_insurance NUMERIC(15,2):=0; v_other_deductions NUMERIC(15,2):=0;
  v_entry_id UUID; v_period_locked BOOLEAN:=FALSE; v_period_name TEXT;
  v_existing_entry UUID; v_idempotency_result JSONB; v_description TEXT;
  v_advances_acct UUID; v_insurance_acct UUID; v_deduction_acct UUID;
  v_branch RECORD;
  v_accrued_bonus NUMERIC(15,2) := 0;
  v_bonus_liab_acct UUID; v_diff NUMERIC(15,2);
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  -- v3.74.817 — بوابة الترحيل: بدونها كان الحارس يصد كل صرف مرتبات
  PERFORM set_config('app.allow_direct_post', 'true', true);

  IF p_idempotency_key IS NOT NULL THEN
    v_idempotency_result := public.check_and_claim_idempotency_key(
      p_idempotency_key, p_company_id, 'payroll_pay', NULL, p_created_by);
    IF v_idempotency_result IS NOT NULL AND (v_idempotency_result->>'cached')::BOOLEAN THEN
      RETURN v_idempotency_result->'response';
    END IF;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.accounting_periods
    WHERE company_id=p_company_id AND p_payment_date BETWEEN period_start AND period_end
      AND (is_locked=TRUE OR status IN ('closed','locked'))) INTO v_period_locked;
  IF v_period_locked THEN
    SELECT period_name INTO v_period_name FROM public.accounting_periods
    WHERE company_id=p_company_id AND p_payment_date BETWEEN period_start AND period_end
      AND (is_locked=TRUE OR status IN ('closed','locked')) LIMIT 1;
    IF p_idempotency_key IS NOT NULL THEN
      PERFORM public.complete_idempotency_key(p_idempotency_key, p_company_id, 'payroll_pay',
        jsonb_build_object('error','PERIOD_LOCKED','period',v_period_name), FALSE);
    END IF;
    RAISE EXCEPTION 'PERIOD_LOCKED: الفترة "%" مقفلة', COALESCE(v_period_name, p_payment_date::TEXT)
      USING ERRCODE='P0002';
  END IF;

  SELECT id INTO v_existing_entry FROM public.journal_entries
  WHERE company_id=p_company_id AND reference_type='payroll_payment'
    AND reference_id=p_payroll_run_id AND (is_deleted IS NULL OR is_deleted=FALSE)
    AND deleted_at IS NULL LIMIT 1;
  IF v_existing_entry IS NOT NULL THEN
    IF p_idempotency_key IS NOT NULL THEN
      PERFORM public.complete_idempotency_key(p_idempotency_key, p_company_id, 'payroll_pay',
        jsonb_build_object('ok',TRUE,'entry_id',v_existing_entry,'idempotent',TRUE), TRUE);
    END IF;
    RETURN jsonb_build_object('ok',TRUE,'entry_id',v_existing_entry,
      'message','تم صرف هذه الدفعة مسبقاً','idempotent',TRUE);
  END IF;

  SELECT COALESCE(SUM(net_salary),0),
    COALESCE(SUM(COALESCE(base_salary,0)+COALESCE(allowances,0)+COALESCE(bonuses,0)
               +COALESCE(sales_bonus,0)+COALESCE(commission,0)),0),
    COALESCE(SUM(COALESCE(advances,0)+COALESCE(commission_advance_deducted,0)),0),
    COALESCE(SUM(COALESCE(insurance,0)),0),
    COALESCE(SUM(COALESCE(deductions,0)),0)
  INTO v_net, v_gross, v_advances, v_insurance, v_other_deductions
  FROM public.payslips WHERE company_id=p_company_id AND payroll_run_id=p_payroll_run_id;

  IF v_net <= 0 THEN
    IF p_idempotency_key IS NOT NULL THEN
      PERFORM public.complete_idempotency_key(p_idempotency_key, p_company_id, 'payroll_pay',
        jsonb_build_object('error','NO_PAYSLIPS'), FALSE);
    END IF;
    RAISE EXCEPTION 'NO_PAYSLIPS: لا توجد كشوف مرتبات للصرف' USING ERRCODE='P0003';
  END IF;

  v_diff := ROUND(v_gross - (v_net+v_advances+v_insurance+v_other_deductions), 2);
  IF ABS(v_diff) > 0.01 THEN
    IF p_idempotency_key IS NOT NULL THEN
      PERFORM public.complete_idempotency_key(p_idempotency_key, p_company_id, 'payroll_pay',
        jsonb_build_object('error','PAYSLIP_IMBALANCE','diff',v_diff), FALSE);
    END IF;
    RAISE EXCEPTION 'PAYSLIP_IMBALANCE: إجمالى المستحقات (%) لا يساوى الصافى (%) مضافاً إليه الاستقطاعات (%) — راجع كشوف المرتبات قبل الصرف. | Gross (%) does not equal net (%) plus deductions (%); fix the payslips before paying.',
      v_gross, v_net, v_advances+v_insurance+v_other_deductions,
      v_gross, v_net, v_advances+v_insurance+v_other_deductions USING ERRCODE='P0004';
  END IF;

  SELECT id INTO v_advances_acct FROM chart_of_accounts WHERE company_id=p_company_id AND account_code='1170' LIMIT 1;
  SELECT id INTO v_insurance_acct FROM chart_of_accounts WHERE company_id=p_company_id AND account_code='2135' LIMIT 1;
  SELECT id INTO v_deduction_acct FROM chart_of_accounts WHERE company_id=p_company_id AND account_code='2125' LIMIT 1;
  IF v_insurance_acct IS NULL OR v_deduction_acct IS NULL THEN
    SELECT id INTO v_insurance_acct FROM chart_of_accounts WHERE company_id=p_company_id AND account_code='2160' LIMIT 1;
    v_deduction_acct := COALESCE(v_deduction_acct, v_insurance_acct);
  END IF;

  v_description := format('صرف مرتبات %s-%s', p_year, LPAD(p_month::TEXT,2,'0'));
  INSERT INTO public.journal_entries
    (company_id, entry_date, description, reference_type, reference_id, status, posted_by, posted_at)
  VALUES (p_company_id, p_payment_date, v_description, 'payroll_payment', p_payroll_run_id,
          'posted', p_created_by, NOW()) RETURNING id INTO v_entry_id;

  -- v3.74.822 bonus already accrued: عمولات البيع اعتُرف بها مصروفاً وقت استحقاقها
  -- (post_bonus_accrual_atomic) فتحميلها مرة أخرى هنا يضاعف المصروف.
  -- تُخصم من مصروف المرتبات وتُحمَّل على التزام «عمولات مستحقة 2136».
  SELECT COALESCE(SUM(COALESCE(ps.sales_bonus,0)+COALESCE(ps.commission,0)), 0)
    INTO v_accrued_bonus
  FROM public.payslips ps
  WHERE ps.company_id = p_company_id AND ps.payroll_run_id = p_payroll_run_id;
  IF v_accrued_bonus > 0 THEN
    SELECT id INTO v_bonus_liab_acct FROM chart_of_accounts
     WHERE company_id = p_company_id AND account_code = '2136' LIMIT 1;
    IF v_bonus_liab_acct IS NULL THEN v_accrued_bonus := 0; END IF;
  END IF;

  FOR v_branch IN
    SELECT e.branch_id,
           SUM(COALESCE(ps.base_salary,0)+COALESCE(ps.allowances,0)+COALESCE(ps.bonuses,0)
             +CASE WHEN v_bonus_liab_acct IS NULL THEN COALESCE(ps.sales_bonus,0)+COALESCE(ps.commission,0) ELSE 0 END) AS branch_gross
    FROM public.payslips ps LEFT JOIN public.employees e ON e.id=ps.employee_id
    WHERE ps.company_id=p_company_id AND ps.payroll_run_id=p_payroll_run_id
    GROUP BY e.branch_id
    HAVING SUM(COALESCE(ps.base_salary,0)+COALESCE(ps.allowances,0)+COALESCE(ps.bonuses,0)
             +COALESCE(ps.sales_bonus,0)+COALESCE(ps.commission,0)) > 0
  LOOP
    INSERT INTO public.journal_entry_lines
      (journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id)
    VALUES (v_entry_id, p_expense_account_id, ROUND(v_branch.branch_gross,2), 0,
            'إجمالى مستحقات المرتبات', v_branch.branch_id);
  END LOOP;

  IF v_accrued_bonus > 0 AND v_bonus_liab_acct IS NOT NULL THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_entry_id, v_bonus_liab_acct, v_accrued_bonus, 0, 'تسوية عمولات مستحقة سبق الاعتراف بها');
  END IF;

  IF v_advances > 0 AND v_advances_acct IS NOT NULL THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_entry_id, v_advances_acct, 0, v_advances, 'تسوية سلف الموظفين المستقطعة');
  END IF;
  IF v_insurance > 0 AND v_insurance_acct IS NOT NULL THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_entry_id, v_insurance_acct, 0, v_insurance, 'تأمينات مستقطعة مستحقة التوريد');
  END IF;
  IF v_other_deductions > 0 AND v_deduction_acct IS NOT NULL THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (v_entry_id, v_deduction_acct, 0, v_other_deductions, 'استقطاعات مستحقة التوريد');
  END IF;
  INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
  VALUES (v_entry_id, p_payment_account_id, 0, v_net, 'صافى المرتبات المصروفة');

  PERFORM set_config('app.allow_direct_post', 'false', true);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.complete_idempotency_key(p_idempotency_key, p_company_id, 'payroll_pay',
      jsonb_build_object('ok',TRUE,'entry_id',v_entry_id,'total',v_net,'gross',v_gross), TRUE);
  END IF;

  RETURN jsonb_build_object('ok',TRUE,'entry_id',v_entry_id,'total',v_net,
    'gross',v_gross,'deductions',v_advances+v_insurance+v_other_deductions,
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


-- ============================================================================
-- الفحصُ المرجعىُّ — يسكنُ القاعدةَ فيحرسُ أىَّ بيتٍ يُركَّبُ فيه
-- ============================================================================
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_19_check()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_closed boolean;
  v_bad    int;
BEGIN
  -- (أ) وفخٌّ لا يُشغَّل ليس فخّاً: يُنادى المسارُ المتقاعدُ فعلاً ويجب أن يرفض
  --     قبل أن يمسَّ صفّاً واحداً.
  v_closed := FALSE;
  BEGIN
    PERFORM public.post_payroll_run_atomic(NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid);
  EXCEPTION WHEN OTHERS THEN
    IF position('DEPRECATED_PAYROLL_POSTER' in SQLERRM) > 0 THEN v_closed := TRUE; END IF;
  END;
  IF NOT v_closed THEN
    RAISE EXCEPTION 'BASELINE FAIL: مُرحِّلُ الرواتبِ القديمُ ما زال يعمل — وكان يُنتجُ قيداً غير متوازن (v3.75.19)';
  END IF;

  v_closed := FALSE;
  BEGIN
    PERFORM public.record_shareholder_drawing_atomic(
      NULL::uuid, NULL::uuid, NULL::numeric, NULL::date, NULL::uuid, NULL::uuid);
  EXCEPTION WHEN OTHERS THEN
    IF position('DEPRECATED_DRAWING_PATH' in SQLERRM) > 0 THEN v_closed := TRUE; END IF;
  END;
  IF NOT v_closed THEN
    RAISE EXCEPTION 'BASELINE FAIL: مسارُ المسحوباتِ القديمُ ما زال يعمل — بلا اعتمادٍ ولا فصلِ مهامّ (v3.75.19)';
  END IF;

  -- (ب) وقيدُ العمولةِ يعرفُ الاسترداد
  SELECT count(*) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'post_bonus_accrual_atomic'
     AND strpos(pg_get_functiondef(p.oid), 'v_is_clawback') = 0;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: قيدُ العمولةِ لم يعُدْ يعرفُ الاسترداد — فمبلغٌ سالبٌ يُكتَبُ مديناً بالسالب (v3.75.19)';
  END IF;

  -- (ج) وصرفُ المرتّباتِ يُغلقُ مفتاحَ منعِ التكرارِ عند الفشل، ويمنعُ عدمَ التوازن
  SELECT count(*) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'post_payroll_atomic'
     AND (strpos(pg_get_functiondef(p.oid), 'complete_idempotency_key') = 0
       OR strpos(pg_get_functiondef(p.oid), 'PAYSLIP_IMBALANCE') = 0);
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: صرفُ المرتّباتِ يتركُ مفتاحَ منعِ التكرارِ معلَّقاً أو لا يفحصُ توازنَ الكشوف (v3.75.19)';
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.assert_baseline_v3_75_19_check() IS
  'v3.75.19 — ومسارُ مالٍ مُتقاعِدٌ فى بيتٍ حىٌّ فى بيتٍ ليس متقاعداً.';

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_19_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_19_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_19_check() FROM authenticated;

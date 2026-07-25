-- ============================================================================
-- v3.74.822 — عمولات البيع تدخل الدفاتر (استحقاقاً واستئنافاً واسترداداً)
-- ============================================================================
-- **الفجوة**: العمولة تُحسب وتُخزَّن فى `user_bonuses` ثم **لا تدخل الدفاتر
-- إطلاقاً**:
--   • لا **مصروف عمولات** ⇒ الربح يبدو أعلى من حقيقته حتى شهر الصرف.
--   • لا **التزام تجاه الموظف** ⇒ الشركة مدينة بمبلغ لا يظهر فى أى تقرير
--     ولا فى الميزانية.
--   • ولا **عكس عند مرتجع المبيعات**: الاسترداد (clawback) كان يُسجَّل صفاً
--     سالباً فى الجدول ولا أثر له فى الدفاتر.
--
-- **العلاج — دورة كاملة بثلاث محطات:**
--
--   ١. **عند البيع** (استحقاق العمولة):
--        مدين  5215 عمولات ومكافآت البيع
--            دائن 2136 عمولات ومكافآت مستحقة
--
--   ٢. **عند مرتجع المبيعات** (استرداد نسبى):
--        مدين  2136 عمولات ومكافآت مستحقة
--            دائن 5215 عمولات ومكافآت البيع
--
--   ٣. **عند الصرف مع المرتب**: مصروف المرتبات **يستبعد** العمولات (لأنها
--      اعتُرف بها سلفاً) وتُحمَّل على **الالتزام** — فلا ازدواج فى المصروف.
--
-- بروفة كاملة على قاعدة الاختبار (ثم rollback): عمولة 200 ⇒ الاستحقاق
-- [5215 مدين 200 / 2136 دائن 200] ✓ · نداء مكرر أعاد نفس القيد ✓ ·
-- ثم مرتب أساسى 5,000 + عمولة 200:
--   5210 الرواتب مدين 5,000 (الأساسى فقط — لا ازدواج!)
--   2136 عمولات مستحقة مدين 200 (تسوية الالتزام)
--   1110 الصندوق دائن 5,200      ⇒ متوازن ✓
--
-- **إصلاح البيانات**: عمولتان بـ7.00 لكل منهما (INV-2026-00002/3) كانتا
-- معلقتين بلا أثر دفترى ⇒ أُثبتتا (JE-000065 و JE-000066).
-- التحقق بعده: ميزان المراجعة **0.00** ✓ · التزام العمولات **14.00** ظاهر
-- الآن فى الميزانية ✓ · صافى الربح **2,420.17** (كان 2,434.03 قبل إثبات
-- الـ14 وتسوية المخزون 0.14 — أى الربح الحقيقى بعد الاعتراف بالتزاماتك).
-- ============================================================================

-- ─── (١) حسابا العمولات لكل الشركات ─────────────────────────────────────────
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type,
                               normal_balance, sub_type, parent_id, level, is_active, is_system)
SELECT c.company_id, '5215', 'عمولات ومكافآت البيع', 'expense', 'debit', 'sales_commission',
       c.id, 3, TRUE, TRUE
FROM chart_of_accounts c
WHERE c.account_code = '5200'
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x
                  WHERE x.company_id = c.company_id AND x.account_code = '5215');

INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type,
                               normal_balance, sub_type, parent_id, level, is_active, is_system)
SELECT c.company_id, '2136', 'عمولات ومكافآت مستحقة', 'liability', 'credit', 'accrued_commissions',
       c.id, 3, TRUE, TRUE
FROM chart_of_accounts c
WHERE c.account_code = '2100'
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x
                  WHERE x.company_id = c.company_id AND x.account_code = '2136');

ALTER TABLE public.user_bonuses
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid,
  ADD COLUMN IF NOT EXISTS accrued_at timestamptz;

-- ─── (٢) مُرحِّل الاستحقاق/الاسترداد — idempotent ومحكوم ────────────────────
CREATE OR REPLACE FUNCTION public.post_bonus_accrual_atomic(p_bonus_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
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

  -- الاسترداد يأتى بمبلغ سالب: يُعكس القيد بالكامل فيتراجع الاعتراف بنفس القدر
  v_abs := ABS(v_b.bonus_amount);
  v_is_clawback := v_b.bonus_amount < 0;

  SELECT id INTO v_exp  FROM chart_of_accounts WHERE company_id = v_b.company_id AND account_code = '5215' LIMIT 1;
  SELECT id INTO v_liab FROM chart_of_accounts WHERE company_id = v_b.company_id AND account_code = '2136' LIMIT 1;
  IF v_exp IS NULL OR v_liab IS NULL THEN
    RAISE EXCEPTION 'COMMISSION_ACCOUNTS_MISSING: حسابا العمولات (5215 / 2136) غير موجودين. | The commission accounts (5215 / 2136) are missing.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT branch_id, cost_center_id, COALESCE(invoice_date, CURRENT_DATE)
    INTO v_branch, v_cc, v_date
  FROM invoices WHERE id = v_b.invoice_id;
  IF v_branch IS NULL THEN
    SELECT branch_id INTO v_branch FROM employees WHERE id = v_b.employee_id;
  END IF;
  v_date := COALESCE(v_date, v_b.calculated_at::date, CURRENT_DATE);

  IF to_regprocedure('public.validate_transaction_period(uuid,date)') IS NOT NULL THEN
    PERFORM public.validate_transaction_period(v_b.company_id, v_date);
  END IF;

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

-- ─── (٣) المرتب لا يُحمّل العمولة مصروفاً مرة ثانية ────────────────────────
DO $$
DECLARE
  d text;
  a1 text := $anchor$  FOR v_branch IN
    SELECT e.branch_id,
           SUM(COALESCE(ps.base_salary,0)+COALESCE(ps.allowances,0)+COALESCE(ps.bonuses,0)
             +COALESCE(ps.sales_bonus,0)+COALESCE(ps.commission,0)) AS branch_gross$anchor$;
  marker text := 'v3.74.822 bonus already accrued';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'post_payroll_atomic';
  IF d IS NULL THEN RAISE EXCEPTION 'post_payroll_atomic not found'; END IF;
  IF d LIKE '%' || marker || '%' THEN RAISE NOTICE 'already patched'; RETURN; END IF;
  IF (length(d) - length(replace(d, a1, ''))) / length(a1) <> 1 THEN
    RAISE EXCEPTION 'anchor not unique in post_payroll_atomic';
  END IF;

  d := replace(d, a1,
    '  -- ' || marker || ': عمولات البيع اعتُرف بها مصروفاً وقت استحقاقها' || chr(10) ||
    '  -- (post_bonus_accrual_atomic) فتحميلها مرة أخرى هنا يضاعف المصروف.' || chr(10) ||
    '  -- تُخصم من مصروف المرتبات وتُحمَّل على التزام «عمولات مستحقة 2136».' || chr(10) ||
    '  SELECT COALESCE(SUM(COALESCE(ps.sales_bonus,0)+COALESCE(ps.commission,0)), 0)' || chr(10) ||
    '    INTO v_accrued_bonus' || chr(10) ||
    '  FROM public.payslips ps' || chr(10) ||
    '  WHERE ps.company_id = p_company_id AND ps.payroll_run_id = p_payroll_run_id;' || chr(10) ||
    '  IF v_accrued_bonus > 0 THEN' || chr(10) ||
    '    SELECT id INTO v_bonus_liab_acct FROM chart_of_accounts' || chr(10) ||
    '     WHERE company_id = p_company_id AND account_code = ''2136'' LIMIT 1;' || chr(10) ||
    '    IF v_bonus_liab_acct IS NULL THEN v_accrued_bonus := 0; END IF;' || chr(10) ||
    '  END IF;' || chr(10) || chr(10) ||
    '  FOR v_branch IN' || chr(10) ||
    '    SELECT e.branch_id,' || chr(10) ||
    '           SUM(COALESCE(ps.base_salary,0)+COALESCE(ps.allowances,0)+COALESCE(ps.bonuses,0)' || chr(10) ||
    '             +CASE WHEN v_bonus_liab_acct IS NULL THEN COALESCE(ps.sales_bonus,0)+COALESCE(ps.commission,0) ELSE 0 END) AS branch_gross'
  );

  d := replace(d,
    '  IF v_advances > 0 AND v_advances_acct IS NOT NULL THEN',
    '  IF v_accrued_bonus > 0 AND v_bonus_liab_acct IS NOT NULL THEN' || chr(10) ||
    '    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)' || chr(10) ||
    '    VALUES (v_entry_id, v_bonus_liab_acct, v_accrued_bonus, 0, ''تسوية عمولات مستحقة سبق الاعتراف بها'');' || chr(10) ||
    '  END IF;' || chr(10) || chr(10) ||
    '  IF v_advances > 0 AND v_advances_acct IS NOT NULL THEN'
  );

  d := replace(d, '  v_branch RECORD;',
    '  v_branch RECORD;' || chr(10) ||
    '  v_accrued_bonus NUMERIC(15,2) := 0;' || chr(10) ||
    '  v_bonus_liab_acct UUID;');

  EXECUTE d;
END $$;

-- ─── (٤) إصلاح البيانات: إثبات العمولات المعلقة بلا أثر دفترى ──────────────
DO $$
DECLARE r RECORD; v_res jsonb;
BEGIN
  FOR r IN SELECT id FROM user_bonuses
           WHERE journal_entry_id IS NULL AND reversed_at IS NULL AND COALESCE(bonus_amount, 0) <> 0
  LOOP
    v_res := public.post_bonus_accrual_atomic(r.id, NULL);
  END LOOP;
END $$;

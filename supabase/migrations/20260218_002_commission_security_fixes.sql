-- =============================================
-- COMMISSION SYSTEM SECURITY FIXES
-- Date: 2026-02-18
-- Description: إصلاحات أمنية ومحاسبية شاملة
-- =============================================

-- =============================================
-- إصلاح 1: Row-Level Locking لمنع Race Condition
-- إصلاح 5: فرض إنشاء القيد المحاسبي
-- إصلاح 6: SET search_path للأمان
-- =============================================

CREATE OR REPLACE FUNCTION pay_commission_advance(
    p_company_id UUID,
    p_employee_id UUID,
    p_amount DECIMAL,
    p_payment_account_id UUID,
    p_payment_date DATE,
    p_period_start DATE,
    p_period_end DATE,
    p_user_id UUID,
    p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_total_earned DECIMAL(15,2) := 0;
    v_total_advance_paid DECIMAL(15,2) := 0;
    v_available_amount DECIMAL(15,2);
    v_advance_id UUID;
    v_journal_id UUID;
    v_ref_number TEXT;
    v_employee_name TEXT;
    v_commission_liability_account UUID;
    v_fiscal_year_id UUID;
    v_lock_key BIGINT;
BEGIN
    -- ✅ إصلاح 6: تأمين search_path
    SET search_path = public, pg_temp;

    -- ✅ إصلاح 1: قفل على مستوى الموظف لمنع Race Condition
    -- استخدام Advisory Lock بناءً على company_id + employee_id
    v_lock_key := ('x' || substr(md5(p_company_id::TEXT || p_employee_id::TEXT), 1, 15))::BIT(60)::BIGINT;

    IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
        RAISE EXCEPTION 'عملية صرف أخرى قيد التنفيذ لهذا الموظف. يرجى المحاولة لاحقاً.';
    END IF;

    -- التحقق من المبلغ
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر';
    END IF;

    -- 1. حساب إجمالي العمولات المكتسبة (مع قفل الصفوف)
    SELECT COALESCE(SUM(
        CASE
            WHEN COALESCE(is_clawback, FALSE) = FALSE THEN amount
            WHEN COALESCE(is_clawback, FALSE) = TRUE THEN -amount
            ELSE 0
        END
    ), 0)
    INTO v_total_earned
    FROM commission_ledger
    WHERE company_id = p_company_id
    AND employee_id = p_employee_id
    AND transaction_date BETWEEN p_period_start AND p_period_end
    FOR SHARE; -- قفل للقراءة فقط

    -- 2. حساب إجمالي السلف المصروفة (غير المخصومة) مع قفل
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_advance_paid
    FROM commission_advance_payments
    WHERE company_id = p_company_id
    AND employee_id = p_employee_id
    AND commission_period_start <= p_period_end
    AND commission_period_end >= p_period_start
    AND status = 'paid'
    AND deducted_in_payroll = FALSE
    FOR UPDATE; -- قفل للتعديل

    -- 3. حساب المتاح والتحقق
    v_available_amount := GREATEST(v_total_earned - v_total_advance_paid, 0);

    IF p_amount > v_available_amount THEN
        RAISE EXCEPTION 'المبلغ المطلوب (%) أكبر من الرصيد المتاح (%). إجمالي المكتسب: %, إجمالي السلف: %',
            p_amount, v_available_amount, v_total_earned, v_total_advance_paid;
    END IF;

    -- 4. جلب بيانات الموظف
    SELECT name INTO v_employee_name FROM employees WHERE id = p_employee_id;
    IF v_employee_name IS NULL THEN
        RAISE EXCEPTION 'الموظف غير موجود';
    END IF;

    -- ✅ إصلاح 5: جلب حساب مستحقات العمولات (إلزامي)
    SELECT id INTO v_commission_liability_account
    FROM chart_of_accounts
    WHERE company_id = p_company_id
    AND (
        account_code LIKE '%2150%' OR
        account_name ILIKE '%commission%payable%' OR
        account_name ILIKE '%عمولات مستحقة%'
    )
    AND account_type = 'liability'
    LIMIT 1;

    IF v_commission_liability_account IS NULL THEN
        SELECT id INTO v_commission_liability_account
        FROM chart_of_accounts
        WHERE company_id = p_company_id
        AND account_type = 'liability'
        AND (account_code LIKE '%2100%' OR sub_type = 'accrued_expenses')
        LIMIT 1;
    END IF;

    -- ✅ إصلاح 5: فرض وجود حساب الالتزامات
    IF v_commission_liability_account IS NULL THEN
        RAISE EXCEPTION 'لم يتم العثور على حساب العمولات المستحقة. يرجى إنشاء حساب التزامات للعمولات أولاً.';
    END IF;

    -- التحقق من حساب الدفع
    IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE id = p_payment_account_id AND company_id = p_company_id) THEN
        RAISE EXCEPTION 'حساب الدفع غير صالح';
    END IF;

    -- 5. جلب السنة المالية
    SELECT id INTO v_fiscal_year_id
    FROM fiscal_years
    WHERE company_id = p_company_id
    AND start_date <= p_payment_date
    AND end_date >= p_payment_date
    AND status = 'active'
    LIMIT 1;

    IF v_fiscal_year_id IS NULL THEN
        RAISE EXCEPTION 'لا توجد سنة مالية نشطة للتاريخ المحدد';
    END IF;

    -- 6. إنشاء رقم مرجعي فريد
    v_ref_number := 'ADV-COM-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTR(gen_random_uuid()::TEXT, 1, 4);

    -- 7. إنشاء القيد المحاسبي
    INSERT INTO journal_entries (
        company_id, fiscal_year_id, entry_date, description,
        reference_type, created_by, posted, status
    ) VALUES (
        p_company_id, v_fiscal_year_id, p_payment_date,
        'صرف سلفة عمولات - ' || v_employee_name || ' - ' || v_ref_number,
        'commission_advance', p_user_id, TRUE, 'posted'
    ) RETURNING id INTO v_journal_id;

    -- مدين: مستحقات العمولات
    INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, debit, credit, description
    ) VALUES (
        v_journal_id, v_commission_liability_account, p_amount, 0,
        'صرف سلفة عمولات - ' || v_employee_name
    );

    -- دائن: حساب الدفع
    INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, debit, credit, description
    ) VALUES (
        v_journal_id, p_payment_account_id, 0, p_amount,
        'صرف سلفة عمولات - ' || v_employee_name
    );

    -- 8. تسجيل سلفة العمولات
    INSERT INTO commission_advance_payments (
        company_id, employee_id, amount, payment_date,
        commission_period_start, commission_period_end,
        reference_number, notes, status,
        journal_entry_id, payment_account_id,
        created_by
    ) VALUES (
        p_company_id, p_employee_id, p_amount, p_payment_date,
        p_period_start, p_period_end,
        v_ref_number, p_notes, 'paid',
        v_journal_id, p_payment_account_id,
        p_user_id
    ) RETURNING id INTO v_advance_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'advance_id', v_advance_id,
        'reference_number', v_ref_number,
        'amount', p_amount,
        'journal_entry_id', v_journal_id,
        'employee_name', v_employee_name,
        'remaining_available', v_available_amount - p_amount
    );

EXCEPTION WHEN OTHERS THEN
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- =============================================
-- إصلاح 4: UNIQUE CONSTRAINT لمنع الخصم المزدوج
-- =============================================

-- إضافة قيد يمنع ربط نفس السلفة بأكثر من payroll_run
-- ملاحظة: partial unique index لأن payroll_run_id قد يكون NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_advance_unique_payroll_deduction
ON commission_advance_payments(id, payroll_run_id)
WHERE payroll_run_id IS NOT NULL AND deducted_in_payroll = TRUE;

-- =============================================
-- إصلاح 3: تعديل دالة خصم السلف مع حماية إضافية
-- =============================================

CREATE OR REPLACE FUNCTION deduct_commission_advances_for_payroll(
    p_company_id UUID,
    p_employee_id UUID,
    p_payroll_run_id UUID,
    p_period_year INT,
    p_period_month INT
) RETURNS JSONB AS $$
DECLARE
    v_period_start DATE;
    v_period_end DATE;
    v_total_deducted DECIMAL(15,2) := 0;
    v_count INT := 0;
    v_already_deducted INT := 0;
BEGIN
    SET search_path = public, pg_temp;

    -- حساب بداية ونهاية الشهر
    v_period_start := make_date(p_period_year, p_period_month, 1);
    v_period_end := (v_period_start + INTERVAL '1 month - 1 day')::DATE;

    -- ✅ إصلاح 3: التحقق من السلف المخصومة بالفعل لهذا الـ payroll_run
    SELECT COUNT(*) INTO v_already_deducted
    FROM commission_advance_payments
    WHERE company_id = p_company_id
    AND employee_id = p_employee_id
    AND payroll_run_id = p_payroll_run_id
    AND deducted_in_payroll = TRUE;

    -- إذا تم الخصم بالفعل لهذا الـ payroll_run، لا نفعل شيء
    IF v_already_deducted > 0 THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'السلف مخصومة بالفعل لهذا المرتب',
            'advances_deducted', 0,
            'total_deducted', 0,
            'already_deducted_count', v_already_deducted
        );
    END IF;

    -- تحديث جميع السلف غير المخصومة للفترة
    WITH updated_advances AS (
        UPDATE commission_advance_payments
        SET deducted_in_payroll = TRUE,
            deducted_at = NOW(),
            payroll_run_id = p_payroll_run_id
        WHERE company_id = p_company_id
        AND employee_id = p_employee_id
        AND commission_period_start <= v_period_end
        AND commission_period_end >= v_period_start
        AND status = 'paid'
        AND deducted_in_payroll = FALSE
        RETURNING amount
    )
    SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_count, v_total_deducted
    FROM updated_advances;

    RETURN jsonb_build_object(
        'success', TRUE,
        'advances_deducted', v_count,
        'total_deducted', v_total_deducted,
        'employee_id', p_employee_id,
        'payroll_run_id', p_payroll_run_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- =============================================
-- إصلاح 3 (تابع): دالة ملخص العمولات المحسنة
-- تحسب السلف بشكل صحيح عند إعادة الحساب
-- =============================================

CREATE OR REPLACE FUNCTION get_employee_commission_summary_for_payroll(
    p_company_id UUID,
    p_employee_id UUID,
    p_period_year INT,
    p_period_month INT,
    p_payroll_run_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_period_start DATE;
    v_period_end DATE;
    v_total_earned DECIMAL(15,2) := 0;
    v_total_clawbacks DECIMAL(15,2) := 0;
    v_net_earned DECIMAL(15,2) := 0;
    v_advance_paid DECIMAL(15,2) := 0;
    v_advance_already_deducted DECIMAL(15,2) := 0;
    v_net_payable DECIMAL(15,2) := 0;
BEGIN
    SET search_path = public, pg_temp;

    -- حساب بداية ونهاية الشهر
    v_period_start := make_date(p_period_year, p_period_month, 1);
    v_period_end := (v_period_start + INTERVAL '1 month - 1 day')::DATE;

    -- 1. حساب العمولات المكتسبة من commission_ledger
    SELECT
        COALESCE(SUM(CASE WHEN COALESCE(is_clawback, FALSE) = FALSE THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN COALESCE(is_clawback, FALSE) = TRUE THEN amount ELSE 0 END), 0)
    INTO v_total_earned, v_total_clawbacks
    FROM commission_ledger
    WHERE company_id = p_company_id
    AND employee_id = p_employee_id
    AND transaction_date BETWEEN v_period_start AND v_period_end;

    v_net_earned := v_total_earned - v_total_clawbacks;

    -- ✅ إصلاح 3: حساب السلف بشكل صحيح
    -- السلف غير المخصومة بعد
    SELECT COALESCE(SUM(amount), 0)
    INTO v_advance_paid
    FROM commission_advance_payments
    WHERE company_id = p_company_id
    AND employee_id = p_employee_id
    AND commission_period_start <= v_period_end
    AND commission_period_end >= v_period_start
    AND status = 'paid'
    AND deducted_in_payroll = FALSE;

    -- السلف المخصومة بالفعل لهذا الـ payroll_run (في حالة إعادة الحساب)
    IF p_payroll_run_id IS NOT NULL THEN
        SELECT COALESCE(SUM(amount), 0)
        INTO v_advance_already_deducted
        FROM commission_advance_payments
        WHERE company_id = p_company_id
        AND employee_id = p_employee_id
        AND commission_period_start <= v_period_end
        AND commission_period_end >= v_period_start
        AND status = 'paid'
        AND deducted_in_payroll = TRUE
        AND payroll_run_id = p_payroll_run_id;

        -- إضافة السلف المخصومة لهذا المرتب للحساب الكلي
        v_advance_paid := v_advance_paid + v_advance_already_deducted;
    END IF;

    -- 3. صافي المستحق في المرتب
    v_net_payable := GREATEST(v_net_earned - v_advance_paid, 0);

    RETURN jsonb_build_object(
        'employee_id', p_employee_id,
        'period_year', p_period_year,
        'period_month', p_period_month,
        'total_earned', v_total_earned,
        'total_clawbacks', v_total_clawbacks,
        'net_earned', v_net_earned,
        'advance_paid', v_advance_paid,
        'advance_already_deducted', v_advance_already_deducted,
        'net_payable_in_salary', v_net_payable
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- =============================================
-- إصلاح 7: Trigger لإعادة فتح السلف عند حذف Payroll Run
-- =============================================

CREATE OR REPLACE FUNCTION reopen_commission_advances_on_payroll_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- إعادة فتح جميع السلف المرتبطة بهذا الـ payroll_run
    UPDATE commission_advance_payments
    SET deducted_in_payroll = FALSE,
        deducted_at = NULL,
        payroll_run_id = NULL
    WHERE payroll_run_id = OLD.id;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_reopen_advances_on_payroll_delete ON payroll_runs;
CREATE TRIGGER trg_reopen_advances_on_payroll_delete
    BEFORE DELETE ON payroll_runs
    FOR EACH ROW
    EXECUTE FUNCTION reopen_commission_advances_on_payroll_delete();

-- =============================================
-- إصلاح 6: تحديث دالة الرصيد المتاح مع search_path
-- =============================================

CREATE OR REPLACE FUNCTION get_employee_available_commission(
    p_company_id UUID,
    p_employee_id UUID,
    p_period_start DATE DEFAULT NULL,
    p_period_end DATE DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_total_earned DECIMAL(15,2) := 0;
    v_total_advance_paid DECIMAL(15,2) := 0;
    v_available DECIMAL(15,2) := 0;
    v_period_start DATE;
    v_period_end DATE;
BEGIN
    SET search_path = public, pg_temp;

    -- تحديد الفترة الافتراضية (الشهر الحالي)
    v_period_start := COALESCE(p_period_start, date_trunc('month', CURRENT_DATE)::DATE);
    v_period_end := COALESCE(p_period_end, (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE);

    -- حساب إجمالي العمولات المكتسبة من commission_ledger
    SELECT COALESCE(SUM(
        CASE
            WHEN COALESCE(is_clawback, FALSE) = FALSE THEN amount
            WHEN COALESCE(is_clawback, FALSE) = TRUE THEN -amount
            ELSE 0
        END
    ), 0)
    INTO v_total_earned
    FROM commission_ledger
    WHERE company_id = p_company_id
    AND employee_id = p_employee_id
    AND transaction_date BETWEEN v_period_start AND v_period_end;

    -- حساب إجمالي السلف المصروفة (غير المخصومة بعد)
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_advance_paid
    FROM commission_advance_payments
    WHERE company_id = p_company_id
    AND employee_id = p_employee_id
    AND commission_period_start <= v_period_end
    AND commission_period_end >= v_period_start
    AND status = 'paid'
    AND deducted_in_payroll = FALSE;

    -- حساب المتاح
    v_available := GREATEST(v_total_earned - v_total_advance_paid, 0);

    RETURN jsonb_build_object(
        'employee_id', p_employee_id,
        'period_start', v_period_start,
        'period_end', v_period_end,
        'total_earned', v_total_earned,
        'total_advance_paid', v_total_advance_paid,
        'available_amount', v_available
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- =============================================
-- تعليقات التوثيق
-- =============================================

COMMENT ON FUNCTION pay_commission_advance IS 'صرف سلفة عمولات مع Row-Level Locking وفرض القيد المحاسبي';
COMMENT ON FUNCTION deduct_commission_advances_for_payroll IS 'خصم السلف من المرتب مع حماية من الخصم المزدوج';
COMMENT ON FUNCTION get_employee_commission_summary_for_payroll IS 'ملخص العمولات للمرتبات مع دعم إعادة الحساب';
COMMENT ON FUNCTION reopen_commission_advances_on_payroll_delete IS 'إعادة فتح السلف عند حذف المرتب';



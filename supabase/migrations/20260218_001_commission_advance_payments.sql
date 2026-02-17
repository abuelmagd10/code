-- =============================================
-- COMMISSION ADVANCE PAYMENTS SYSTEM
-- Date: 2026-02-18
-- Description:
-- 1. جدول سلف العمولات (Commission Advance Payments)
-- 2. RPC للصرف المبكر مع التحقق من الرصيد
-- 3. تحديث حساب المرتبات لخصم السلف
-- =============================================

-- =============================================
-- 1. إنشاء جدول سلف العمولات
-- =============================================

CREATE TABLE IF NOT EXISTS public.commission_advance_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    
    -- المبلغ والتاريخ
    amount DECIMAL(15,2) NOT NULL,
    payment_date DATE NOT NULL,
    
    -- الفترة التي تنتمي لها العمولات
    commission_period_start DATE NOT NULL,
    commission_period_end DATE NOT NULL,
    
    -- المرجع والحالة
    reference_number TEXT,
    notes TEXT,
    status TEXT DEFAULT 'paid' CHECK (status IN ('pending', 'paid', 'reversed', 'cancelled')),
    
    -- الربط المحاسبي
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    payment_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    
    -- الربط بالمرتب (عند الخصم)
    payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
    deducted_in_payroll BOOLEAN DEFAULT FALSE,
    deducted_at TIMESTAMPTZ,
    
    -- التتبع
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- منع المبالغ السالبة أو الصفرية
    CONSTRAINT positive_advance_amount CHECK (amount > 0)
);

-- فهارس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_advance_payments_employee 
ON commission_advance_payments(employee_id);

CREATE INDEX IF NOT EXISTS idx_advance_payments_company 
ON commission_advance_payments(company_id);

CREATE INDEX IF NOT EXISTS idx_advance_payments_period 
ON commission_advance_payments(employee_id, commission_period_start, commission_period_end);

CREATE INDEX IF NOT EXISTS idx_advance_payments_payroll 
ON commission_advance_payments(payroll_run_id) WHERE payroll_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_advance_payments_not_deducted 
ON commission_advance_payments(employee_id, status) WHERE deducted_in_payroll = FALSE;

-- تحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_commission_advance_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_commission_advance_timestamp ON commission_advance_payments;
CREATE TRIGGER trg_update_commission_advance_timestamp
    BEFORE UPDATE ON commission_advance_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_commission_advance_timestamp();

-- RLS
ALTER TABLE commission_advance_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commission_advance_payments_company_isolation" ON commission_advance_payments
    FOR ALL USING (
        company_id IN (
            SELECT company_id FROM company_users WHERE user_id = auth.uid()
        )
    );

-- تعليقات
COMMENT ON TABLE commission_advance_payments IS 'سلف العمولات - تسجيل الصرف المبكر للعمولات قبل موعد المرتب';
COMMENT ON COLUMN commission_advance_payments.amount IS 'مبلغ السلفة المصروفة';
COMMENT ON COLUMN commission_advance_payments.commission_period_start IS 'بداية فترة العمولات المستحقة';
COMMENT ON COLUMN commission_advance_payments.commission_period_end IS 'نهاية فترة العمولات المستحقة';
COMMENT ON COLUMN commission_advance_payments.deducted_in_payroll IS 'هل تم خصم هذه السلفة من المرتب؟';
COMMENT ON COLUMN commission_advance_payments.payroll_run_id IS 'معرف تشغيل المرتبات الذي تم فيه الخصم';

-- =============================================
-- 2. RPC: حساب الرصيد المتاح للموظف
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
    -- تحديد الفترة الافتراضية (الشهر الحالي)
    v_period_start := COALESCE(p_period_start, date_trunc('month', CURRENT_DATE)::DATE);
    v_period_end := COALESCE(p_period_end, (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE);
    
    -- 1. حساب إجمالي العمولات المكتسبة من commission_ledger
    -- ملاحظة: is_clawback = FALSE للعمولات، is_clawback = TRUE للاسترداد
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
    
    -- 2. حساب إجمالي السلف المصروفة (غير المخصومة بعد)
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_advance_paid
    FROM commission_advance_payments
    WHERE company_id = p_company_id
    AND employee_id = p_employee_id
    AND commission_period_start <= v_period_end
    AND commission_period_end >= v_period_start
    AND status = 'paid'
    AND deducted_in_payroll = FALSE;
    
    -- 3. حساب المتاح
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 2.5 إضافة حقول العمولات إلى payslips
-- =============================================

ALTER TABLE payslips ADD COLUMN IF NOT EXISTS commission DECIMAL(15,2) DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS commission_advance_deducted DECIMAL(15,2) DEFAULT 0;

COMMENT ON COLUMN payslips.commission IS 'إجمالي العمولات المستحقة للموظف في هذا الشهر';
COMMENT ON COLUMN payslips.commission_advance_deducted IS 'إجمالي سلف العمولات المخصومة';

-- =============================================
-- 3. RPC: صرف سلفة عمولات (Advance Commission Payment)
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
    v_available JSONB;
    v_available_amount DECIMAL(15,2);
    v_advance_id UUID;
    v_journal_id UUID;
    v_ref_number TEXT;
    v_employee_name TEXT;
    v_commission_liability_account UUID;
    v_fiscal_year_id UUID;
BEGIN
    -- 1. التحقق من الرصيد المتاح
    v_available := get_employee_available_commission(p_company_id, p_employee_id, p_period_start, p_period_end);
    v_available_amount := (v_available->>'available_amount')::DECIMAL;

    IF p_amount > v_available_amount THEN
        RAISE EXCEPTION 'المبلغ المطلوب (%) أكبر من الرصيد المتاح (%)', p_amount, v_available_amount;
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر';
    END IF;

    -- 2. جلب بيانات الموظف
    SELECT name INTO v_employee_name FROM employees WHERE id = p_employee_id;

    -- 3. جلب حساب مستحقات العمولات
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

    -- إذا لم يوجد، استخدم حساب المصروفات المستحقة
    IF v_commission_liability_account IS NULL THEN
        SELECT id INTO v_commission_liability_account
        FROM chart_of_accounts
        WHERE company_id = p_company_id
        AND account_type = 'liability'
        AND (account_code LIKE '%2100%' OR sub_type = 'accrued_expenses')
        LIMIT 1;
    END IF;

    -- 4. جلب السنة المالية
    SELECT id INTO v_fiscal_year_id
    FROM fiscal_years
    WHERE company_id = p_company_id
    AND start_date <= p_payment_date
    AND end_date >= p_payment_date
    AND status = 'active'
    LIMIT 1;

    -- 5. إنشاء رقم مرجعي
    v_ref_number := 'ADV-COM-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTR(gen_random_uuid()::TEXT, 1, 4);

    -- 6. إنشاء القيد المحاسبي (إن وجد حساب الالتزامات)
    IF v_commission_liability_account IS NOT NULL THEN
        INSERT INTO journal_entries (
            company_id, fiscal_year_id, entry_date, description,
            reference_type, created_by, posted, status
        ) VALUES (
            p_company_id, v_fiscal_year_id, p_payment_date,
            'صرف سلفة عمولات - ' || v_employee_name || ' - ' || v_ref_number,
            'commission_advance', p_user_id, TRUE, 'posted'
        ) RETURNING id INTO v_journal_id;

        -- مدين: مستحقات العمولات (Debit Liability - decrease)
        INSERT INTO journal_entry_lines (
            journal_entry_id, account_id, debit, credit, description
        ) VALUES (
            v_journal_id, v_commission_liability_account, p_amount, 0,
            'صرف سلفة عمولات - ' || v_employee_name
        );

        -- دائن: حساب الدفع (Credit Asset - decrease)
        INSERT INTO journal_entry_lines (
            journal_entry_id, account_id, debit, credit, description
        ) VALUES (
            v_journal_id, p_payment_account_id, 0, p_amount,
            'صرف سلفة عمولات - ' || v_employee_name
        );
    END IF;

    -- 7. تسجيل سلفة العمولات
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 4. RPC: خصم السلف من المرتب
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
    v_advance RECORD;
    v_count INT := 0;
BEGIN
    -- حساب بداية ونهاية الشهر
    v_period_start := make_date(p_period_year, p_period_month, 1);
    v_period_end := (v_period_start + INTERVAL '1 month - 1 day')::DATE;

    -- تحديث جميع السلف غير المخصومة للفترة
    FOR v_advance IN
        SELECT id, amount
        FROM commission_advance_payments
        WHERE company_id = p_company_id
        AND employee_id = p_employee_id
        AND commission_period_start <= v_period_end
        AND commission_period_end >= v_period_start
        AND status = 'paid'
        AND deducted_in_payroll = FALSE
    LOOP
        UPDATE commission_advance_payments
        SET deducted_in_payroll = TRUE,
            deducted_at = NOW(),
            payroll_run_id = p_payroll_run_id
        WHERE id = v_advance.id;

        v_total_deducted := v_total_deducted + v_advance.amount;
        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'advances_deducted', v_count,
        'total_deducted', v_total_deducted,
        'employee_id', p_employee_id,
        'payroll_run_id', p_payroll_run_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 5. RPC: جلب ملخص العمولات للموظف (للمرتبات)
-- =============================================

CREATE OR REPLACE FUNCTION get_employee_commission_summary_for_payroll(
    p_company_id UUID,
    p_employee_id UUID,
    p_period_year INT,
    p_period_month INT
) RETURNS JSONB AS $$
DECLARE
    v_period_start DATE;
    v_period_end DATE;
    v_total_earned DECIMAL(15,2) := 0;
    v_total_clawbacks DECIMAL(15,2) := 0;
    v_net_earned DECIMAL(15,2) := 0;
    v_advance_paid DECIMAL(15,2) := 0;
    v_net_payable DECIMAL(15,2) := 0;
BEGIN
    -- حساب بداية ونهاية الشهر
    v_period_start := make_date(p_period_year, p_period_month, 1);
    v_period_end := (v_period_start + INTERVAL '1 month - 1 day')::DATE;

    -- 1. حساب العمولات المكتسبة من commission_ledger
    -- ملاحظة: is_clawback = FALSE للعمولات، is_clawback = TRUE للاسترداد
    SELECT
        COALESCE(SUM(CASE WHEN COALESCE(is_clawback, FALSE) = FALSE THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN COALESCE(is_clawback, FALSE) = TRUE THEN amount ELSE 0 END), 0)
    INTO v_total_earned, v_total_clawbacks
    FROM commission_ledger
    WHERE company_id = p_company_id
    AND employee_id = p_employee_id
    AND transaction_date BETWEEN v_period_start AND v_period_end;

    v_net_earned := v_total_earned - v_total_clawbacks;

    -- 2. حساب السلف المصروفة مسبقاً (غير المخصومة)
    SELECT COALESCE(SUM(amount), 0)
    INTO v_advance_paid
    FROM commission_advance_payments
    WHERE company_id = p_company_id
    AND employee_id = p_employee_id
    AND commission_period_start <= v_period_end
    AND commission_period_end >= v_period_start
    AND status = 'paid'
    AND deducted_in_payroll = FALSE;

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
        'net_payable_in_salary', v_net_payable
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


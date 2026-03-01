-- =============================================================================
-- Migration: 20260303_002_expenses_enterprise_grade
-- Purpose: Enterprise-grade expenses (المصروفات) — audit, defaults, payment, tracing
--
-- 1. Audit: last_status_changed_at, source_ip, device_info
-- 2. Payment: paid_amount for partial/full tracking
-- 3. Company-level default accounts: company_expenses_settings
-- 4. Index for journal_entries by expense reference
-- =============================================================================

-- ── 1. Audit and payment columns on expenses ─────────────────────────────────
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS last_status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_ip TEXT,
  ADD COLUMN IF NOT EXISTS device_info TEXT,
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15,2);

COMMENT ON COLUMN public.expenses.last_status_changed_at IS 'آخر تغيير لحالة المصروف (إرسال/اعتماد/رفض/دفع).';
COMMENT ON COLUMN public.expenses.source_ip IS 'اختياري: IP عند الاعتماد/الرفض/التسديد.';
COMMENT ON COLUMN public.expenses.device_info IS 'اختياري: معلومات الجهاز.';
COMMENT ON COLUMN public.expenses.paid_amount IS 'المبلغ المسدد. إذا NULL أو = amount يعتبر مدفوع بالكامل.';

-- ── 2. Company-level default expense and payment accounts ───────────────────
CREATE TABLE IF NOT EXISTS public.company_expenses_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  default_expense_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  default_payment_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.company_expenses_settings IS
  'إعدادات المصروفات على مستوى الشركة. الحسابات الافتراضية تُستخدم عند عدم تحديد حساب في المصروف.';

ALTER TABLE public.company_expenses_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_expenses_settings_select ON public.company_expenses_settings;
CREATE POLICY company_expenses_settings_select ON public.company_expenses_settings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = company_expenses_settings.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS company_expenses_settings_insert ON public.company_expenses_settings;
CREATE POLICY company_expenses_settings_insert ON public.company_expenses_settings
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS company_expenses_settings_update ON public.company_expenses_settings;
CREATE POLICY company_expenses_settings_update ON public.company_expenses_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = company_expenses_settings.company_id AND cm.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_company_expenses_settings_company ON public.company_expenses_settings(company_id);

-- ── 3. Index for expense journal tracing ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_journal_entries_reference_expense
  ON public.journal_entries(reference_id)
  WHERE reference_type = 'expense';

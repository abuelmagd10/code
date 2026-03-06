-- Migration to add attendance payroll settings
CREATE TABLE IF NOT EXISTS public.attendance_payroll_settings (
    company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Late Policy
    deduct_late BOOLEAN DEFAULT true,
    late_deduction_type TEXT DEFAULT 'exact_minutes', -- 'exact_minutes', 'hourly_rate_multiplier'
    late_multiplier NUMERIC DEFAULT 1.0,
    
    -- Early Leave Policy
    deduct_early_leave BOOLEAN DEFAULT true,
    early_leave_multiplier NUMERIC DEFAULT 1.0,
    
    -- Overtime Policy
    pay_overtime BOOLEAN DEFAULT true,
    overtime_multiplier NUMERIC DEFAULT 1.5,
    
    -- Absence Policy
    deduct_absence BOOLEAN DEFAULT true,
    absence_day_deduction NUMERIC DEFAULT 1.0,
    
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.attendance_payroll_settings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view attendance_payroll_settings for their company"
    ON public.attendance_payroll_settings FOR SELECT
    USING (company_id IN (
        SELECT company_id FROM public.user_roles WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can insert attendance_payroll_settings for their company"
    ON public.attendance_payroll_settings FOR INSERT
    WITH CHECK (company_id IN (
        SELECT company_id FROM public.user_roles WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can update attendance_payroll_settings for their company"
    ON public.attendance_payroll_settings FOR UPDATE
    USING (company_id IN (
        SELECT company_id FROM public.user_roles WHERE user_id = auth.uid()
    ))
    WITH CHECK (company_id IN (
        SELECT company_id FROM public.user_roles WHERE user_id = auth.uid()
    ));

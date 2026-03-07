-- Add attendance_payroll_settings table for configuring how time correlates to money
CREATE TABLE IF NOT EXISTS public.attendance_payroll_settings (
    company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
    
    -- Late Policy
    deduct_late BOOLEAN DEFAULT true,
    late_deduction_type TEXT DEFAULT 'exact_minutes' CHECK (late_deduction_type IN ('exact_minutes', 'hourly_rate_multiplier')),
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

    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS
ALTER TABLE public.attendance_payroll_settings ENABLE ROW LEVEL SECURITY;

-- Policies for attendance_payroll_settings
CREATE POLICY "Users can view their company's attendance payroll settings" 
    ON public.attendance_payroll_settings 
    FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM public.company_members 
            WHERE company_members.company_id = attendance_payroll_settings.company_id 
            AND company_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners and admins can manage attendance payroll settings" 
    ON public.attendance_payroll_settings 
    FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM public.company_members 
            WHERE company_members.company_id = attendance_payroll_settings.company_id 
            AND company_members.user_id = auth.uid()
            AND company_members.role IN ('owner', 'admin', 'manager')
        )
    );

-- Add missing status constraint to commission_advance_payments if not exists to ensure it holds 'paid' statuses safely
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'commission_advance_payments_status_check'
    ) THEN
        ALTER TABLE public.commission_advance_payments
        ADD CONSTRAINT commission_advance_payments_status_check
        CHECK (status IN ('draft', 'pending', 'approved', 'paid', 'cancelled', 'rejected'));
    END IF;
END $$;

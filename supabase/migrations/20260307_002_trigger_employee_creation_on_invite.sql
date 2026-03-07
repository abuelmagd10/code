-- =============================================
-- Migration: Create Employee on Invitation Acceptance
-- Description: Automatically creates an employee record when a user is added to company_members
-- =============================================

CREATE OR REPLACE FUNCTION public.create_employee_on_company_member()
RETURNS TRIGGER AS $$
DECLARE
    v_full_name TEXT;
    v_phone TEXT;
    v_invited_name TEXT;
BEGIN
    SELECT raw_user_meta_data->>'full_name', raw_user_meta_data->>'phone'
    INTO v_full_name, v_phone
    FROM auth.users
    WHERE id = NEW.user_id;

    -- Look for 'employee_name' from company_invitations based on email and company
    SELECT employee_name INTO v_invited_name
    FROM public.company_invitations
    WHERE email = NEW.email AND company_id = NEW.company_id AND accepted = true
    ORDER BY created_at DESC LIMIT 1;

    -- Use invited name if available, otherwise User's full_name, otherwise extract from email
    IF v_invited_name IS NOT NULL AND v_invited_name != '' THEN
        v_full_name := v_invited_name;
    ELSIF v_full_name IS NULL OR v_full_name = '' THEN
        v_full_name := SPLIT_PART(NEW.email, '@', 1);
    END IF;

    -- Check if an employee record already exists for this user in this company
    IF NOT EXISTS (
        SELECT 1 FROM public.employees
        WHERE company_id = NEW.company_id AND user_id = NEW.user_id
    ) THEN
        INSERT INTO public.employees (
            company_id,
            user_id,
            full_name,
            email,
            phone,
            branch_id,
            joined_date,
            job_title
        ) VALUES (
            NEW.company_id,
            NEW.user_id,
            v_full_name,
            NEW.email,
            v_phone,
            NEW.branch_id,
            CURRENT_DATE, -- Set joined_date to the date they accepted (current date)
            NEW.role -- Optionally set job_title to their role initially
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_create_employee_on_company_member ON public.company_members;
CREATE TRIGGER trg_create_employee_on_company_member
AFTER INSERT ON public.company_members
FOR EACH ROW
EXECUTE FUNCTION public.create_employee_on_company_member();

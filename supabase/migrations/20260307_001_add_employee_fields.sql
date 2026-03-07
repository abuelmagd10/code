-- Adding email, phone, department, job_title, and joined_date fields to employees
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS joined_date DATE;

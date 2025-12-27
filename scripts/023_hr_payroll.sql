create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  full_name text not null,
  national_id text null,
  birth_date date null,
  phone text null,
  email text null,
  job_title text null,
  department text null,
  hire_date date null,
  base_salary numeric not null default 0,
  status text not null default 'active',
  bank_account text null,
  wallet_id text null,
  attachments jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists employees_company_idx on employees(company_id);
create index if not exists employees_email_idx on employees(email);

create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  day_date date not null,
  status text not null,
  created_at timestamptz not null default now()
);

create index if not exists attendance_company_idx on attendance_records(company_id);
create index if not exists attendance_employee_idx on attendance_records(employee_id);
create unique index if not exists attendance_unique_day on attendance_records(company_id, employee_id, day_date);

create table if not exists payroll_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  period_year int not null,
  period_month int not null,
  approved_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists payroll_runs_company_period on payroll_runs(company_id, period_year, period_month);

create table if not exists payslips (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  base_salary numeric not null default 0,
  allowances numeric not null default 0,
  deductions numeric not null default 0,
  bonuses numeric not null default 0,
  advances numeric not null default 0,
  insurance numeric not null default 0,
  net_salary numeric not null default 0,
  breakdown jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists payslips_company_idx on payslips(company_id);
create index if not exists payslips_run_idx on payslips(payroll_run_id);
create index if not exists payslips_employee_idx on payslips(employee_id);
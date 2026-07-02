-- v3.74.506: Link employees to branches so branch-scoped payroll is possible
-- (owner spec: branch manager runs payroll for HIS branch only).
-- Applied to production on 2026-07-02 via Supabase MCP.
alter table public.employees
  add column if not exists branch_id uuid references public.branches(id) on delete set null;

create index if not exists idx_employees_branch on public.employees(branch_id);

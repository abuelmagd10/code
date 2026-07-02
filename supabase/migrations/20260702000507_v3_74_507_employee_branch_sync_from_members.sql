-- v3.74.507: Employee branch is DERIVED from company_members (Settings →
-- Users) when the employee is a system user; manual entry on the employees
-- page applies only to non-user employees. Owner spec: avoid double entry.
-- Applied to production on 2026-07-02 via Supabase MCP.

-- 1) One-time backfill for existing linked employees
update public.employees e
   set branch_id = cm.branch_id
  from public.company_members cm
 where e.user_id = cm.user_id
   and e.company_id = cm.company_id
   and cm.branch_id is not null
   and (e.branch_id is distinct from cm.branch_id);

-- 2) On employee insert/update: if linked to a user, force branch from members
create or replace function public.employee_branch_from_member_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_branch uuid;
begin
  if new.user_id is not null then
    select branch_id into v_branch
      from public.company_members
     where company_id = new.company_id and user_id = new.user_id
     limit 1;
    if found and v_branch is not null then
      new.branch_id := v_branch;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_employee_branch_from_member on public.employees;
create trigger trg_employee_branch_from_member
  before insert or update on public.employees
  for each row execute function public.employee_branch_from_member_trg();

-- 3) When a member's branch changes in Settings → Users, propagate to the
--    linked employee record automatically
create or replace function public.member_branch_to_employee_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.branch_id is distinct from coalesce(old.branch_id, null) and new.branch_id is not null then
    update public.employees
       set branch_id = new.branch_id
     where company_id = new.company_id
       and user_id = new.user_id
       and (branch_id is distinct from new.branch_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_member_branch_to_employee on public.company_members;
create trigger trg_member_branch_to_employee
  after insert or update of branch_id on public.company_members
  for each row execute function public.member_branch_to_employee_trg();

-- v3.74.508: Owner spec — the purchasing officer CREATES purchase returns
-- (he owns the supplier relationship and originated the PO). Approval stays
-- with owner/general_manager; physical goods-out stays with store_manager.
-- Applied to production on 2026-07-02 via Supabase MCP.

-- 1) Grant for ALL existing companies (create/edit; no delete)
insert into public.company_role_permissions
  (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access)
select c.id, 'purchasing_officer', 'purchase_returns', true, true, true, true, false, false
from public.companies c
on conflict (company_id, role, resource) do update
  set can_access = true, can_read = true, can_write = true, can_update = true;

-- 2) Add-on seed so NEW companies get the same grant automatically
create or replace function public.seed_purchasing_officer_returns_permissions(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.company_role_permissions
    (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access)
  values
    (p_company_id, 'purchasing_officer', 'purchase_returns', true, true, true, true, false, false)
  on conflict (company_id, role, resource) do update
    set can_access = true, can_read = true, can_write = true, can_update = true;
end;
$$;

create or replace function public.trg_auto_seed_role_permissions()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.seed_default_role_permissions(new.id);
  -- v3.74.508 add-on grants
  perform public.seed_purchasing_officer_returns_permissions(new.id);
  return new;
end;
$$;

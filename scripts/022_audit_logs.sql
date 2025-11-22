-- Audit logs for user actions
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null,
  user_id uuid not null,
  action text not null,
  details jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_company_idx on audit_logs(company_id);
create index if not exists audit_logs_user_idx on audit_logs(user_id);
create index if not exists audit_logs_action_idx on audit_logs(action);
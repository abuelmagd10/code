-- Add email column to company_members to show user email in UI
ALTER TABLE company_members
  ADD COLUMN IF NOT EXISTS email text;

CREATE INDEX IF NOT EXISTS idx_company_members_email ON company_members(email);
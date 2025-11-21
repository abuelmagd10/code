-- Add accept token to invitations
ALTER TABLE company_invitations
  ADD COLUMN IF NOT EXISTS accept_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_company_invitations_token ON company_invitations(accept_token);
-- Company Invitations: invite users by email to join a company with a role
CREATE TABLE IF NOT EXISTS company_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','accountant','viewer')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_invitations_company ON company_invitations(company_id);
CREATE INDEX IF NOT EXISTS idx_company_invitations_email ON company_invitations(email);

ALTER TABLE company_invitations ENABLE ROW LEVEL SECURITY;

-- Owners/Admins of the company can manage invitations
DROP POLICY IF EXISTS company_invitations_select ON company_invitations;
CREATE POLICY company_invitations_select ON company_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = company_invitations.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner','admin')
    )
  );

DROP POLICY IF EXISTS company_invitations_insert ON company_invitations;
CREATE POLICY company_invitations_insert ON company_invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = company_invitations.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner','admin')
    )
  );

DROP POLICY IF EXISTS company_invitations_update ON company_invitations;
CREATE POLICY company_invitations_update ON company_invitations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = company_invitations.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner','admin')
    )
  );

DROP POLICY IF EXISTS company_invitations_delete ON company_invitations;
CREATE POLICY company_invitations_delete ON company_invitations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = company_invitations.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner','admin')
    )
  );

-- Allow invited user to view their invitations
DROP POLICY IF EXISTS company_invitations_select_invited ON company_invitations;
CREATE POLICY company_invitations_select_invited ON company_invitations FOR SELECT
  USING ((company_invitations.email = (auth.jwt() ->> 'email')));

-- Allow invited user to self-insert membership if they have a valid (non-expired, not accepted) invitation
-- This policy complements existing insert policies on company_members
DROP POLICY IF EXISTS company_members_insert_invited ON company_members;
CREATE POLICY company_members_insert_invited ON company_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_invitations ci
      WHERE ci.company_id = company_members.company_id
        AND ci.email = (auth.jwt() ->> 'email')
        AND ci.expires_at > now()
        AND ci.accepted = false
    )
  );
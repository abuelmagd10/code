CREATE TABLE IF NOT EXISTS company_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','accountant','viewer')),
  resource text NOT NULL,
  can_read boolean NOT NULL DEFAULT true,
  can_write boolean NOT NULL DEFAULT false,
  can_update boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  all_access boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_role_permissions_unique ON company_role_permissions(company_id, role, resource);

ALTER TABLE company_role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_role_permissions_select ON company_role_permissions;
CREATE POLICY company_role_permissions_select ON company_role_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = company_role_permissions.company_id
        AND cm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM companies c WHERE c.id = company_role_permissions.company_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS company_role_permissions_insert ON company_role_permissions;
CREATE POLICY company_role_permissions_insert ON company_role_permissions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = company_role_permissions.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner','admin')
    )
    OR EXISTS (
      SELECT 1 FROM companies c WHERE c.id = company_role_permissions.company_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS company_role_permissions_update ON company_role_permissions;
CREATE POLICY company_role_permissions_update ON company_role_permissions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = company_role_permissions.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner','admin')
    )
    OR EXISTS (
      SELECT 1 FROM companies c WHERE c.id = company_role_permissions.company_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS company_role_permissions_delete ON company_role_permissions;
CREATE POLICY company_role_permissions_delete ON company_role_permissions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = company_role_permissions.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner','admin')
    )
    OR EXISTS (
      SELECT 1 FROM companies c WHERE c.id = company_role_permissions.company_id AND c.user_id = auth.uid()
    )
  );
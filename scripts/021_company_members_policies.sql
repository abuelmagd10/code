DROP POLICY IF EXISTS company_members_select_self ON company_members;
CREATE POLICY company_members_select_self ON company_members FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS company_members_select_owner_admin ON company_members;
CREATE POLICY company_members_select_owner_admin ON company_members FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM companies c WHERE c.id = company_members.company_id AND c.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM company_members cm WHERE cm.company_id = company_members.company_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin')
  )
);

DROP POLICY IF EXISTS company_members_update_owner_admin ON company_members;
CREATE POLICY company_members_update_owner_admin ON company_members FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM companies c WHERE c.id = company_members.company_id AND c.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM company_members cm WHERE cm.company_id = company_members.company_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM companies c WHERE c.id = company_members.company_id AND c.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM company_members cm WHERE cm.company_id = company_members.company_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin')
  )
);

DROP POLICY IF EXISTS company_members_delete_owner_admin ON company_members;
CREATE POLICY company_members_delete_owner_admin ON company_members FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM companies c WHERE c.id = company_members.company_id AND c.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM company_members cm WHERE cm.company_id = company_members.company_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin')
  )
);
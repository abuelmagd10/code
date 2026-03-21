-- ================================================================
-- 🔐 Branch-Level Row Level Security (RLS)
-- Zero Trust Data Layer — Enterprise ERP Grade
-- ================================================================
-- الهدف: فرض Branch Isolation على مستوى قاعدة البيانات
-- بحيث حتى لو فشل Application Layer، البيانات محمية بالـ DB
--
-- المنطق:
-- ✅ الأدوار العليا (owner, admin, general_manager): يرون كل الفروع
-- ✅ باقي الأدوار: يرون فرعهم فقط (أو السجلات بدون فرع)
-- ✅ INSERT/UPDATE/DELETE: مقيَّد بالشركة فقط (لا تكسير العمليات)
-- ✅ SELECT: مقيَّد بالشركة + الفرع
--
-- التصميم:
-- 1. دالة SECURITY DEFINER مُخزَّنة بكفاءة (STABLE = cached per query)
-- 2. نُبدِّل سياسات FOR ALL بسياسات SELECT + WRITE منفصلة
-- 3. يشمل: invoices, bills, payments, journal_entries, inventory_transactions
-- ================================================================

BEGIN;

-- ================================================================
-- PART 1: Helper Function — can_access_record_branch
-- ================================================================
-- دالة STABLE: تُنفَّذ مرة واحدة لكل transaction وتُخزَّن نتيجتها
-- SECURITY DEFINER: تعمل بصلاحيات المنشئ (bypasses RLS recursion)
-- ================================================================

CREATE OR REPLACE FUNCTION public.can_access_record_branch(
  p_company_id UUID,
  p_branch_id  UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_role           TEXT;
  v_user_branch_id UUID;
BEGIN
  -- مستخدم غير مُسجَّل الدخول
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  -- جلب دور المستخدم وفرعه في هذه الشركة
  SELECT role, branch_id
    INTO v_role, v_user_branch_id
    FROM public.company_members
   WHERE user_id   = auth.uid()
     AND company_id = p_company_id
   LIMIT 1;

  -- المستخدم ليس عضواً في هذه الشركة
  IF NOT FOUND THEN
    -- تحقق أنه مالك الشركة (companies.user_id)
    IF EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id AND user_id = auth.uid()) THEN
      RETURN TRUE; -- مالك الشركة لا يخضع لقيود الفرع
    END IF;
    RETURN FALSE;
  END IF;

  -- الأدوار العليا: وصول لجميع الفروع
  IF v_role IN ('owner', 'admin', 'general_manager') THEN
    RETURN TRUE;
  END IF;

  -- السجل ليس مرتبطاً بفرع محدد (بيانات على مستوى الشركة)
  IF p_branch_id IS NULL THEN
    RETURN TRUE;
  END IF;

  -- المستخدم العادي: فرعه فقط
  RETURN v_user_branch_id = p_branch_id;
END;
$$;

COMMENT ON FUNCTION public.can_access_record_branch IS
'🔐 Branch Isolation Guard: Returns TRUE if the current user can access
records belonging to the given branch within the given company.
Privileged roles (owner, admin, general_manager) bypass branch restrictions.';

-- ================================================================
-- دالة مساعدة لبناء قائمة شركات المستخدم (تُعيد طريقة موحَّدة)
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_user_company_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
  UNION
  SELECT id FROM public.companies WHERE user_id = auth.uid();
$$;

-- ================================================================
-- PART 2: invoices — Branch-level SELECT isolation
-- ================================================================

-- حذف السياسة القديمة (FOR ALL = company-level)
DROP POLICY IF EXISTS "invoices_company_isolation" ON public.invoices;

-- سياسة SELECT: company + branch
CREATE POLICY "invoices_select_branch_isolation"
  ON public.invoices
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

-- سياسة INSERT: company فقط (لا نقيِّد الفرع عند الإنشاء)
CREATE POLICY "invoices_insert_company_isolation"
  ON public.invoices
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
  );

-- سياسة UPDATE: company + branch (المستخدم يعدِّل سجلات فرعه فقط)
CREATE POLICY "invoices_update_branch_isolation"
  ON public.invoices
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
  );

-- سياسة DELETE: company + branch
CREATE POLICY "invoices_delete_branch_isolation"
  ON public.invoices
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

-- ================================================================
-- PART 3: bills — Branch-level SELECT isolation
-- ================================================================

DROP POLICY IF EXISTS "bills_company_isolation" ON public.bills;

CREATE POLICY "bills_select_branch_isolation"
  ON public.bills
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "bills_insert_company_isolation"
  ON public.bills
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
  );

CREATE POLICY "bills_update_branch_isolation"
  ON public.bills
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
  );

CREATE POLICY "bills_delete_branch_isolation"
  ON public.bills
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

-- ================================================================
-- PART 4: payments — Branch-level SELECT isolation
-- ================================================================

DROP POLICY IF EXISTS "payments_company_isolation" ON public.payments;

CREATE POLICY "payments_select_branch_isolation"
  ON public.payments
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "payments_insert_company_isolation"
  ON public.payments
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
  );

CREATE POLICY "payments_update_branch_isolation"
  ON public.payments
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
  );

CREATE POLICY "payments_delete_branch_isolation"
  ON public.payments
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

-- ================================================================
-- PART 5: journal_entries — Branch-level SELECT isolation
-- ================================================================

DROP POLICY IF EXISTS "journal_entries_company_isolation" ON public.journal_entries;

CREATE POLICY "journal_entries_select_branch_isolation"
  ON public.journal_entries
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "journal_entries_insert_company_isolation"
  ON public.journal_entries
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
  );

CREATE POLICY "journal_entries_update_branch_isolation"
  ON public.journal_entries
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
  );

CREATE POLICY "journal_entries_delete_branch_isolation"
  ON public.journal_entries
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

-- ================================================================
-- PART 6: journal_entry_lines — Branch isolation via parent entry
-- (لا يوجد company_id مباشر — يُشتق من journal_entries)
-- ================================================================

DROP POLICY IF EXISTS "journal_entry_lines_company_isolation" ON public.journal_entry_lines;

CREATE POLICY "journal_entry_lines_select_branch_isolation"
  ON public.journal_entry_lines
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
       WHERE je.id         = journal_entry_lines.journal_entry_id
         AND je.company_id IN (SELECT public.get_user_company_ids())
         AND public.can_access_record_branch(je.company_id, je.branch_id)
    )
  );

CREATE POLICY "journal_entry_lines_insert_company_isolation"
  ON public.journal_entry_lines
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
       WHERE je.id         = journal_entry_lines.journal_entry_id
         AND je.company_id IN (SELECT public.get_user_company_ids())
    )
  );

CREATE POLICY "journal_entry_lines_update_branch_isolation"
  ON public.journal_entry_lines
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
       WHERE je.id         = journal_entry_lines.journal_entry_id
         AND je.company_id IN (SELECT public.get_user_company_ids())
         AND public.can_access_record_branch(je.company_id, je.branch_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
       WHERE je.id         = journal_entry_lines.journal_entry_id
         AND je.company_id IN (SELECT public.get_user_company_ids())
    )
  );

CREATE POLICY "journal_entry_lines_delete_branch_isolation"
  ON public.journal_entry_lines
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
       WHERE je.id         = journal_entry_lines.journal_entry_id
         AND je.company_id IN (SELECT public.get_user_company_ids())
         AND public.can_access_record_branch(je.company_id, je.branch_id)
    )
  );

-- ================================================================
-- PART 7: inventory_transactions — Branch-level isolation
-- ================================================================

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_transactions_company_isolation" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_select_branch_isolation" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_insert_company_isolation" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_update_branch_isolation" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_delete_branch_isolation" ON public.inventory_transactions;

CREATE POLICY "inventory_transactions_select_branch_isolation"
  ON public.inventory_transactions
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "inventory_transactions_insert_company_isolation"
  ON public.inventory_transactions
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
  );

CREATE POLICY "inventory_transactions_update_branch_isolation"
  ON public.inventory_transactions
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
  );

CREATE POLICY "inventory_transactions_delete_branch_isolation"
  ON public.inventory_transactions
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

-- ================================================================
-- PART 8: Performance Indexes for RLS helper functions
-- ================================================================

-- فهارس مُحسَّنة للبحث السريع في company_members (تُستخدم في كل استعلام RLS)
CREATE INDEX IF NOT EXISTS idx_company_members_user_company
  ON public.company_members (user_id, company_id)
  INCLUDE (role, branch_id);

CREATE INDEX IF NOT EXISTS idx_companies_user_id
  ON public.companies (user_id)
  INCLUDE (id);

-- فهرس لـ journal_entries branch_id (يُسرِّع RLS على journal_entry_lines)
CREATE INDEX IF NOT EXISTS idx_journal_entries_company_branch
  ON public.journal_entries (company_id, branch_id)
  WHERE status = 'posted';

COMMIT;

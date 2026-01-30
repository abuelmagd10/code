-- =====================================================
-- 🔐 Row Level Security Policies للمصروفات
-- =====================================================
-- Created: 2026-01-30
-- Purpose: تطبيق سياسات الحوكمة على جدول المصروفات
-- =====================================================

-- تفعيل RLS
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- =====================================
-- 1️⃣ سياسة SELECT (العرض)
-- =====================================
-- Owner / Admin: يرى جميع المصروفات في الشركة
-- Manager / Accountant / Staff: يرى فقط مصروفات فرعه
-- Viewer: يرى فقط مصروفات فرعه (عرض فقط)
-- =====================================
DROP POLICY IF EXISTS "expenses_select_policy" ON expenses;
CREATE POLICY "expenses_select_policy" ON expenses
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id
      FROM company_members cm
      WHERE cm.user_id = auth.uid()
    )
    AND (
      -- Owner: يرى كل شيء
      EXISTS (
        SELECT 1 FROM companies c
        WHERE c.id = expenses.company_id
        AND c.user_id = auth.uid()
      )
      OR
      -- Admin: يرى كل شيء في الشركة
      EXISTS (
        SELECT 1 FROM company_members cm
        WHERE cm.company_id = expenses.company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'admin'
      )
      OR
      -- Manager / Accountant / Staff: يرى فقط فرعه
      EXISTS (
        SELECT 1 FROM company_members cm
        WHERE cm.company_id = expenses.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('manager', 'accountant', 'staff')
        AND (
          expenses.branch_id = cm.branch_id
          OR expenses.branch_id IS NULL
        )
      )
      OR
      -- باقي الأدوار: يرى فقط فرعه (عرض فقط)
      EXISTS (
        SELECT 1 FROM company_members cm
        WHERE cm.company_id = expenses.company_id
        AND cm.user_id = auth.uid()
        AND (
          expenses.branch_id = cm.branch_id
          OR expenses.branch_id IS NULL
        )
      )
    )
  );

-- =====================================
-- 2️⃣ سياسة INSERT (الإنشاء)
-- =====================================
-- فقط: Accountant, Branch Manager, General Manager, Owner
-- =====================================
DROP POLICY IF EXISTS "expenses_insert_policy" ON expenses;
CREATE POLICY "expenses_insert_policy" ON expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id 
      FROM company_members cm 
      WHERE cm.user_id = auth.uid()
    )
    AND created_by = auth.uid()
    AND (
      -- Owner
      EXISTS (
        SELECT 1 FROM companies c 
        WHERE c.id = expenses.company_id 
        AND c.user_id = auth.uid()
      )
      OR
      -- Admin, Manager, Accountant, Staff
      EXISTS (
        SELECT 1 FROM company_members cm
        WHERE cm.company_id = expenses.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('admin', 'manager', 'accountant', 'staff')
      )
    )
  );

-- =====================================
-- 3️⃣ سياسة UPDATE (التعديل)
-- =====================================
-- يمكن التعديل فقط إذا:
-- - المصروف في حالة draft أو rejected
-- - المستخدم هو منشئ المصروف أو Owner/Admin
-- =====================================
DROP POLICY IF EXISTS "expenses_update_policy" ON expenses;
CREATE POLICY "expenses_update_policy" ON expenses
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id
      FROM company_members cm
      WHERE cm.user_id = auth.uid()
    )
    AND (
      -- Owner: يمكنه تعديل أي شيء
      EXISTS (
        SELECT 1 FROM companies c
        WHERE c.id = expenses.company_id
        AND c.user_id = auth.uid()
      )
      OR
      -- Admin: يمكنه تعديل أي شيء
      EXISTS (
        SELECT 1 FROM company_members cm
        WHERE cm.company_id = expenses.company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'admin'
      )
      OR
      -- منشئ المصروف: يمكنه التعديل فقط إذا كان draft أو rejected
      (
        created_by = auth.uid()
        AND status IN ('draft', 'rejected')
      )
    )
  );

-- =====================================
-- 4️⃣ سياسة DELETE (الحذف)
-- =====================================
-- يمكن الحذف فقط إذا:
-- - المصروف في حالة draft أو rejected
-- - المستخدم هو منشئ المصروف أو Owner/Admin
-- =====================================
DROP POLICY IF EXISTS "expenses_delete_policy" ON expenses;
CREATE POLICY "expenses_delete_policy" ON expenses
  FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id
      FROM company_members cm
      WHERE cm.user_id = auth.uid()
    )
    AND status IN ('draft', 'rejected')
    AND (
      -- Owner
      EXISTS (
        SELECT 1 FROM companies c
        WHERE c.id = expenses.company_id
        AND c.user_id = auth.uid()
      )
      OR
      -- Admin
      EXISTS (
        SELECT 1 FROM company_members cm
        WHERE cm.company_id = expenses.company_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'admin'
      )
      OR
      -- منشئ المصروف
      created_by = auth.uid()
    )
  );

-- =====================================================
-- ✅ اكتملت سياسات RLS للمصروفات
-- =====================================================


-- =====================================================
-- 🔄 تفعيل Realtime على جميع الجداول الحيوية في ERP
-- =====================================================
-- هذا السكريبت يفعل Realtime (Postgres Changes) على جميع الجداول الأساسية
-- يجب تشغيله في Supabase SQL Editor
-- 
-- الجداول المفعّلة:
-- ✅ notifications - الإشعارات
-- ✅ inventory_write_offs - الإهلاك
-- ✅ inventory_transactions - حركات المخزون
-- ✅ purchase_orders - أوامر الشراء
-- ✅ sales_orders - أوامر البيع
-- ✅ invoices - الفواتير
-- ✅ approval_workflows - الموافقات
-- ✅ inventory_transfers - النقل بين المخازن
-- 🔐 company_members - أعضاء الشركة (الحوكمة)
-- 🔐 branches - الفروع (الحوكمة)
-- 🔐 warehouses - المخازن (الحوكمة)
-- 🔐 company_role_permissions - صلاحيات الأدوار (الحوكمة)
-- 🔐 permissions - الصلاحيات العامة (الحوكمة)
-- =====================================================

-- ملاحظة: في Supabase، يتم تفعيل Realtime من Dashboard عادة
-- لكن يمكن أيضاً استخدام هذا السكريبت إذا كان لديك صلاحيات
-- 
-- الطريقة الموصى بها:
-- 1. استخدم Supabase Dashboard: Database → Replication → فعّل لكل جدول
-- 2. أو استخدم هذا السكريبت في SQL Editor

-- =====================================================
-- 1️⃣ التحقق من Publication
-- =====================================================

-- التحقق من وجود supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    -- إنشاء publication إذا لم يكن موجوداً
    CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
    RAISE NOTICE '✅ Created supabase_realtime publication';
  ELSE
    RAISE NOTICE '✅ supabase_realtime publication already exists';
  END IF;
END $$;

-- =====================================================
-- 2️⃣ إضافة الجداول إلى Publication
-- =====================================================

-- ملاحظة: في Supabase، عادة ما يتم تفعيل Realtime من Dashboard
-- لكن يمكن استخدام ALTER PUBLICATION لإضافة الجداول

-- notifications (مفعّل بالفعل عادة)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
      RAISE NOTICE '✅ Added notifications to realtime';
    ELSE
      RAISE NOTICE '✅ notifications already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Table notifications does not exist';
  END IF;
END $$;

-- inventory_write_offs (للإهلاك)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_write_offs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'inventory_write_offs'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE inventory_write_offs;
      RAISE NOTICE '✅ Added inventory_write_offs to realtime';
    ELSE
      RAISE NOTICE '✅ inventory_write_offs already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Table inventory_write_offs does not exist';
  END IF;
END $$;

-- inventory_transactions (للمخزون)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_transactions') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'inventory_transactions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE inventory_transactions;
      RAISE NOTICE '✅ Added inventory_transactions to realtime';
    ELSE
      RAISE NOTICE '✅ inventory_transactions already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Table inventory_transactions does not exist';
  END IF;
END $$;

-- purchase_orders (لأوامر الشراء)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'purchase_orders') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'purchase_orders'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE purchase_orders;
      RAISE NOTICE '✅ Added purchase_orders to realtime';
    ELSE
      RAISE NOTICE '✅ purchase_orders already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Table purchase_orders does not exist';
  END IF;
END $$;

-- sales_orders (لأوامر البيع)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sales_orders') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'sales_orders'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE sales_orders;
      RAISE NOTICE '✅ Added sales_orders to realtime';
    ELSE
      RAISE NOTICE '✅ sales_orders already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Table sales_orders does not exist';
  END IF;
END $$;

-- invoices (للفواتير)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoices') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'invoices'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
      RAISE NOTICE '✅ Added invoices to realtime';
    ELSE
      RAISE NOTICE '✅ invoices already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Table invoices does not exist';
  END IF;
END $$;

-- approval_workflows (للموافقات)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'approval_workflows') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'approval_workflows'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE approval_workflows;
      RAISE NOTICE '✅ Added approval_workflows to realtime';
    ELSE
      RAISE NOTICE '✅ approval_workflows already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Table approval_workflows does not exist';
  END IF;
END $$;

-- inventory_transfers (للنقل بين المخازن)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_transfers') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'inventory_transfers'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE inventory_transfers;
      RAISE NOTICE '✅ Added inventory_transfers to realtime';
    ELSE
      RAISE NOTICE '✅ inventory_transfers already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Table inventory_transfers does not exist';
  END IF;
END $$;

-- =====================================================
-- 🔐 جداول الحوكمة (Governance Tables)
-- =====================================================

-- company_members
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'company_members') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'company_members'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE company_members;
      RAISE NOTICE '✅ Added company_members to realtime';
    ELSE
      RAISE NOTICE '✅ company_members already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Table company_members does not exist';
  END IF;
END $$;

-- branches
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'branches') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'branches'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE branches;
      RAISE NOTICE '✅ Added branches to realtime';
    ELSE
      RAISE NOTICE '✅ branches already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Table branches does not exist';
  END IF;
END $$;

-- warehouses
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'warehouses') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'warehouses'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE warehouses;
      RAISE NOTICE '✅ Added warehouses to realtime';
    ELSE
      RAISE NOTICE '✅ warehouses already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Table warehouses does not exist';
  END IF;
END $$;

-- company_role_permissions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'company_role_permissions') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'company_role_permissions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE company_role_permissions;
      RAISE NOTICE '✅ Added company_role_permissions to realtime';
    ELSE
      RAISE NOTICE '✅ company_role_permissions already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Table company_role_permissions does not exist';
  END IF;
END $$;

-- permissions (إن وجدت)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'permissions') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'permissions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE permissions;
      RAISE NOTICE '✅ Added permissions to realtime';
    ELSE
      RAISE NOTICE '✅ permissions already in realtime publication';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Table permissions does not exist (optional table)';
  END IF;
END $$;

-- =====================================================
-- 3️⃣ التحقق من التفعيل
-- =====================================================

-- عرض الجداول المفعلة في Realtime
SELECT 
  schemaname,
  tablename,
  '✅ Enabled' as realtime_status
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND schemaname = 'public'
  AND tablename IN (
    'notifications',
    'inventory_write_offs',
    'inventory_transactions',
    'purchase_orders',
    'sales_orders',
    'invoices',
    'approval_workflows',
    'inventory_transfers',
    'company_members',
    'branches',
    'warehouses',
    'company_role_permissions',
    'permissions'
  )
ORDER BY tablename;

-- =====================================================
-- ✅ انتهى
-- =====================================================

-- ملاحظة: 
-- في Supabase Dashboard، يمكنك أيضاً تفعيل Realtime يدوياً:
-- 1. اذهب إلى Database → Replication
-- 2. فعّل مفتاح التبديل لكل جدول
-- 
-- هذا السكريبت مفيد إذا كنت تريد تفعيل عدة جداول دفعة واحدة

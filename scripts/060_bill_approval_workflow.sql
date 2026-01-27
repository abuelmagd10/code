-- 060_bill_approval_workflow.sql
-- إضافة أعمدة دورة اعتماد فاتورة الشراء ودعم الحالات الجديدة

-- ⚠️ ملاحظة:
-- هذا السكربت غير مدمّر (idempotent) ويمكن تشغيله بأمان أكثر من مرة

DO $$
BEGIN
  -- حقل حالة الاعتماد (يمكن لاحقاً تحويله إلى ENUM)
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bills'
      AND column_name = 'approval_status'
  ) THEN
    ALTER TABLE public.bills
      ADD COLUMN approval_status text;
  END IF;

  -- تمّت الموافقة من قبل
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bills'
      AND column_name = 'approved_by'
  ) THEN
    ALTER TABLE public.bills
      ADD COLUMN approved_by uuid REFERENCES auth.users(id);
  END IF;

  -- تاريخ ووقت الموافقة
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bills'
      AND column_name = 'approved_at'
  ) THEN
    ALTER TABLE public.bills
      ADD COLUMN approved_at timestamptz;
  END IF;

  -- تم الاستلام بواسطة (مسؤول المخزن)
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bills'
      AND column_name = 'received_by'
  ) THEN
    ALTER TABLE public.bills
      ADD COLUMN received_by uuid REFERENCES auth.users(id);
  END IF;

  -- تاريخ ووقت اعتماد الاستلام
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bills'
      AND column_name = 'received_at'
  ) THEN
    ALTER TABLE public.bills
      ADD COLUMN received_at timestamptz;
  END IF;

  -- فهرس لتحسين استعلامات دورة الاعتماد حسب الشركة والحالة
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'bills'
      AND indexname = 'idx_bills_company_status_branch_wh_approval'
  ) THEN
    CREATE INDEX idx_bills_company_status_branch_wh_approval
      ON public.bills (company_id, status, branch_id, warehouse_id, approval_status);
  END IF;

END $$;


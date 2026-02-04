-- =====================================================
-- 📌 إضافة أعمدة الاعتماد لجدول inventory_transfers
-- =====================================================
-- هذا الـ Migration يضيف الأعمدة اللازمة لدورة اعتماد طلبات النقل
-- التي ينشئها المحاسب

-- ===== 1) إضافة أعمدة الاعتماد =====
DO $$ 
BEGIN
  -- عمود معرف المعتمد
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_transfers' AND column_name = 'approved_by') THEN
    ALTER TABLE inventory_transfers ADD COLUMN approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  
  -- عمود تاريخ الاعتماد
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_transfers' AND column_name = 'approved_at') THEN
    ALTER TABLE inventory_transfers ADD COLUMN approved_at TIMESTAMPTZ;
  END IF;
  
  -- عمود معرف الرافض
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_transfers' AND column_name = 'rejected_by') THEN
    ALTER TABLE inventory_transfers ADD COLUMN rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  
  -- عمود تاريخ الرفض
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_transfers' AND column_name = 'rejected_at') THEN
    ALTER TABLE inventory_transfers ADD COLUMN rejected_at TIMESTAMPTZ;
  END IF;
  
  -- عمود سبب الرفض
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_transfers' AND column_name = 'rejection_reason') THEN
    ALTER TABLE inventory_transfers ADD COLUMN rejection_reason TEXT;
  END IF;
  
  -- عمود عدد مرات إعادة الإرسال
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_transfers' AND column_name = 'resubmit_count') THEN
    ALTER TABLE inventory_transfers ADD COLUMN resubmit_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- ===== 2) تحديث CHECK constraint للحالة =====
-- إضافة الحالات الجديدة: pending_approval, draft
DO $$
BEGIN
  -- حذف الـ constraint القديم إن وجد
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'inventory_transfers_status_check' 
    AND table_name = 'inventory_transfers') THEN
    ALTER TABLE inventory_transfers DROP CONSTRAINT inventory_transfers_status_check;
  END IF;
  
  -- إضافة الـ constraint الجديد مع الحالات الإضافية
  ALTER TABLE inventory_transfers 
    ADD CONSTRAINT inventory_transfers_status_check 
    CHECK (status IN ('pending_approval', 'draft', 'pending', 'in_transit', 'sent', 'received', 'cancelled', 'rejected'));
EXCEPTION
  WHEN duplicate_object THEN
    NULL; -- تجاهل إذا كان موجوداً
  WHEN others THEN
    RAISE NOTICE 'Could not add status constraint: %', SQLERRM;
END $$;

-- ===== 3) إنشاء فهارس للأداء =====
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_approved_by 
  ON inventory_transfers(approved_by) WHERE approved_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_transfers_status_approval 
  ON inventory_transfers(status) WHERE status IN ('pending_approval', 'draft');

-- ===== 4) تعليق توضيحي =====
COMMENT ON COLUMN inventory_transfers.approved_by IS 'معرف المستخدم الذي اعتمد طلب النقل';
COMMENT ON COLUMN inventory_transfers.approved_at IS 'تاريخ ووقت اعتماد طلب النقل';
COMMENT ON COLUMN inventory_transfers.rejected_by IS 'معرف المستخدم الذي رفض طلب النقل';
COMMENT ON COLUMN inventory_transfers.rejected_at IS 'تاريخ ووقت رفض طلب النقل';
COMMENT ON COLUMN inventory_transfers.rejection_reason IS 'سبب رفض طلب النقل';
COMMENT ON COLUMN inventory_transfers.resubmit_count IS 'عدد مرات إعادة إرسال الطلب بعد الرفض';


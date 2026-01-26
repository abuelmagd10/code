-- =====================================
-- Migration: إضافة حقول إلغاء الإهلاك
-- =====================================
-- التاريخ: 2026-01-25
-- الوصف: إضافة حقول reversal_journal_entry_id, cancelled_by, cancelled_at
--         لدعم إلغاء الإهلاك المعتمد والمرحل وفق معايير ERP
-- =====================================

-- إضافة عمود reversal_journal_entry_id (القيد العكسي)
ALTER TABLE depreciation_schedules
ADD COLUMN IF NOT EXISTS reversal_journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;

-- إضافة عمود cancelled_by (من قام بالإلغاء)
ALTER TABLE depreciation_schedules
ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- إضافة عمود cancelled_at (تاريخ الإلغاء)
ALTER TABLE depreciation_schedules
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

-- إضافة فهرس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_depreciation_schedules_reversal_journal_entry_id 
ON depreciation_schedules(reversal_journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_depreciation_schedules_cancelled_by 
ON depreciation_schedules(cancelled_by);

-- =====================================
-- ملاحظات:
-- =====================================
-- 1. reversal_journal_entry_id: يُستخدم عند إلغاء إهلاك مرحل (posted)
--    لربط القيد العكسي بالقيد الأصلي
-- 2. cancelled_by: يُستخدم لتسجيل من قام بالإلغاء (Owner/Admin فقط)
-- 3. cancelled_at: يُستخدم لتسجيل تاريخ الإلغاء
-- =====================================

-- =============================================
-- إضافة journal_entry_id إلى accounting_periods
-- Add journal_entry_id to accounting_periods for Period Closing
-- =============================================

BEGIN;

-- إضافة العمود إذا لم يكن موجوداً
ALTER TABLE accounting_periods
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;

-- إنشاء فهرس للأداء
CREATE INDEX IF NOT EXISTS idx_accounting_periods_journal_entry_id 
  ON accounting_periods(journal_entry_id);

-- تعليق على العمود
COMMENT ON COLUMN accounting_periods.journal_entry_id IS 
  'معرف قيد إقفال الفترة المحاسبية - Period Closing Journal Entry ID';

COMMIT;

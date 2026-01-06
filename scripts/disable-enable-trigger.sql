-- =====================================================
-- تعطيل/إعادة تفعيل Trigger للحماية
-- Disable/Enable Protection Trigger
-- =====================================================

-- تعطيل Trigger
ALTER TABLE journal_entries DISABLE TRIGGER trg_prevent_posted_journal_modification;

-- إعادة تفعيل Trigger
-- ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;


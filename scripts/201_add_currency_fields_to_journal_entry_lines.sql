-- =====================================================
-- إضافة حقول العملات لجدول journal_entry_lines
-- Script: 201_add_currency_fields_to_journal_entry_lines.sql
-- Date: 2025-01-06
-- Purpose: إضافة دعم العملات المتعددة لبنود القيود المحاسبية
-- =====================================================

BEGIN;

-- إضافة الأعمدة المتعلقة بالعملات
ALTER TABLE journal_entry_lines 
  ADD COLUMN IF NOT EXISTS original_currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS original_debit DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS original_credit DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS exchange_rate_used DECIMAL(15, 6) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS exchange_rate_id UUID REFERENCES exchange_rates(id) ON DELETE SET NULL;

-- إضافة تعليقات للأعمدة
COMMENT ON COLUMN journal_entry_lines.original_currency IS 'العملة الأصلية للقيد (قبل التحويل)';
COMMENT ON COLUMN journal_entry_lines.original_debit IS 'المبلغ المدين بالعملة الأصلية';
COMMENT ON COLUMN journal_entry_lines.original_credit IS 'المبلغ الدائن بالعملة الأصلية';
COMMENT ON COLUMN journal_entry_lines.exchange_rate_used IS 'سعر الصرف المستخدم للتحويل';
COMMENT ON COLUMN journal_entry_lines.exchange_rate_id IS 'مرجع لسجل سعر الصرف المستخدم';

COMMIT;

-- =====================================================
-- ملاحظات:
-- 1. هذه الأعمدة اختيارية وتستخدم فقط عند وجود عملات متعددة
-- 2. إذا كانت العملة الأصلية = العملة الأساسية، لا حاجة لملء هذه الحقول
-- 3. exchange_rate_id يمكن أن يكون NULL إذا كان السعر يدوياً أو من مصدر خارجي
-- =====================================================


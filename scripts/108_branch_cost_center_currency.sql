-- =====================================================
-- إضافة دعم العملات للفروع ومراكز التكلفة
-- Script: 108_branch_cost_center_currency.sql
-- Date: 2024-12-18
-- =====================================================

-- إضافة عمود العملة للفروع
ALTER TABLE branches ADD COLUMN IF NOT EXISTS currency TEXT;

-- تحديث القيم الحالية لتأخذ عملة الشركة
UPDATE branches b
SET currency = c.base_currency
FROM companies c
WHERE b.company_id = c.id AND b.currency IS NULL;

-- إضافة عمود العملة لمراكز التكلفة
ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS currency TEXT;

-- تحديث القيم الحالية لتأخذ عملة الفرع (أو عملة الشركة إذا لم يكن هناك فرع)
UPDATE cost_centers cc
SET currency = COALESCE(b.currency, c.base_currency)
FROM branches b, companies c
WHERE cc.branch_id = b.id AND cc.company_id = c.id AND cc.currency IS NULL;

-- تحديث مراكز التكلفة التي ليس لها فرع
UPDATE cost_centers cc
SET currency = c.base_currency
FROM companies c
WHERE cc.company_id = c.id AND cc.currency IS NULL AND cc.branch_id IS NULL;

-- إضافة تعليقات للأعمدة
COMMENT ON COLUMN branches.currency IS 'عملة الفرع - افتراضياً تأخذ عملة الشركة';
COMMENT ON COLUMN cost_centers.currency IS 'عملة مركز التكلفة - افتراضياً تأخذ عملة الفرع';

-- =====================================================
-- ملاحظات:
-- 1. الفروع تستخدم عملة الشركة افتراضياً مع إمكانية تغييرها
-- 2. مراكز التكلفة تستخدم عملة الفرع افتراضياً مع إمكانية تغييرها
-- 3. التسلسل الهرمي للعملات: الشركة → الفرع → مركز التكلفة
-- =====================================================


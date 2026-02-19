-- =============================================
-- Migration: تحديث دالة get_retained_earnings_balance
-- تاريخ: 2026-02-19
-- الهدف: تضمين صافي أرباح/خسائر السنة الجارية في حساب الأرباح المحتجزة المتاحة
-- =============================================
-- الخلفية:
--   النسخة القديمة كانت تبحث فقط في رصيد حساب 3200 (الأرباح المحتجزة)
--   هذا يعطي 0 إذا لم يتم إقفال الفترة المحاسبية بعد
--
--   النسخة الجديدة تحسب:
--   الأرباح المتاحة = رصيد 3200 + (إجمالي الإيرادات - إجمالي المصروفات) من قيود مرحلة
--
--   ملاحظة: لا يوجد ازدواجية، لأن قيود الإقفال تُصفّر حسابات الإيرادات/المصروفات
--   وتنقل الرصيد إلى حساب 3200، فبعد الإقفال: v_inc - v_exp = 0
-- =============================================

CREATE OR REPLACE FUNCTION get_retained_earnings_balance(p_company_id UUID)
RETURNS DECIMAL AS $func$
DECLARE
  v_re  DECIMAL := 0;  -- رصيد حساب الأرباح المحتجزة (3200)
  v_inc DECIMAL := 0;  -- صافي الإيرادات غير المقفلة
  v_exp DECIMAL := 0;  -- صافي المصروفات غير المقفلة
BEGIN
  -- 1. رصيد حساب الأرباح المحتجزة (equity / sub_type=retained_earnings أو كود 3200)
  SELECT COALESCE(SUM(jel.credit_amount) - SUM(jel.debit_amount), 0)
    INTO v_re
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE coa.company_id = p_company_id
    AND coa.account_type = 'equity'
    AND (coa.sub_type = 'retained_earnings' OR coa.account_code = '3200')
    AND je.company_id = p_company_id
    AND COALESCE(je.status, 'posted') NOT IN ('cancelled', 'draft');

  -- 2. صافي الإيرادات غير المقفلة (income / revenue) - فقط القيود المرحلة
  SELECT COALESCE(SUM(jel.credit_amount) - SUM(jel.debit_amount), 0)
    INTO v_inc
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE coa.company_id = p_company_id
    AND coa.account_type IN ('income', 'revenue')
    AND je.company_id = p_company_id
    AND je.status = 'posted';

  -- 3. صافي المصروفات غير المقفلة (expense) - فقط القيود المرحلة
  SELECT COALESCE(SUM(jel.debit_amount) - SUM(jel.credit_amount), 0)
    INTO v_exp
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE coa.company_id = p_company_id
    AND coa.account_type = 'expense'
    AND je.company_id = p_company_id
    AND je.status = 'posted';

  -- 4. الإجمالي = أرباح سنوات سابقة + صافي ربح السنة الجارية
  RETURN v_re + (v_inc - v_exp);
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

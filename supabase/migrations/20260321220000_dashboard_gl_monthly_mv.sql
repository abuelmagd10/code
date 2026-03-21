-- ============================================================
-- Dashboard GL Monthly Materialized View
-- يُسرِّع استعلامات GL Summary في لوحة التحكم بشكل كبير
-- بدلاً من مسح آلاف سطور journal_entry_lines في كل طلب،
-- نُجمِّع البيانات مسبقاً على مستوى الشهر × الشركة × الفرع
-- ============================================================

-- 1. إنشاء الـ Materialized View
CREATE MATERIALIZED VIEW IF NOT EXISTS dashboard_gl_monthly_summary AS
SELECT
  je.company_id,
  je.branch_id,
  DATE_TRUNC('month', je.entry_date)::date AS month_start,
  TO_CHAR(je.entry_date, 'YYYY-MM')        AS month_key,
  coa.account_type,
  coa.sub_type,
  coa.account_code,
  SUM(jel.debit_amount)                    AS total_debit,
  SUM(jel.credit_amount)                   AS total_credit,
  SUM(jel.credit_amount - jel.debit_amount) AS net_credit  -- إيجابي = دائن (إيرادات)
FROM journal_entry_lines jel
JOIN journal_entries je
  ON jel.journal_entry_id = je.id
 AND je.status = 'posted'
JOIN chart_of_accounts coa
  ON jel.account_id = coa.id
GROUP BY
  je.company_id,
  je.branch_id,
  DATE_TRUNC('month', je.entry_date),
  TO_CHAR(je.entry_date, 'YYYY-MM'),
  coa.account_type,
  coa.sub_type,
  coa.account_code;

-- 2. إنشاء الفهارس لتسريع الاستعلامات
CREATE INDEX IF NOT EXISTS idx_gl_monthly_mv_company
  ON dashboard_gl_monthly_summary (company_id, month_key);

CREATE INDEX IF NOT EXISTS idx_gl_monthly_mv_branch
  ON dashboard_gl_monthly_summary (company_id, branch_id, month_key);

CREATE INDEX IF NOT EXISTS idx_gl_monthly_mv_account_type
  ON dashboard_gl_monthly_summary (company_id, account_type, month_key);

-- 3. دالة لتحديث الـ View (تُستدعى عند تغيير البيانات)
CREATE OR REPLACE FUNCTION refresh_dashboard_gl_monthly_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_gl_monthly_summary;
END;
$$;

-- 4. Trigger لتحديث الـ View عند إدراج/تحديث قيود محاسبية مُرحَّلة
-- نستخدم AFTER INSERT OR UPDATE لأنه يُشغَّل بعد اكتمال العملية
CREATE OR REPLACE FUNCTION trigger_refresh_gl_mv()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- نُحدِّث فقط عند تغيير الحالة إلى posted (أو تحديث قيد posted)
  IF (TG_OP = 'INSERT' AND NEW.status = 'posted')
  OR (TG_OP = 'UPDATE' AND (OLD.status != 'posted' AND NEW.status = 'posted'))
  THEN
    -- تحديث غير متزامن لتجنب إبطاء العمليات الأصلية
    PERFORM pg_notify('refresh_gl_mv', NEW.company_id::text);
  END IF;
  RETURN NEW;
END;
$$;

-- إنشاء Trigger على جدول journal_entries
DROP TRIGGER IF EXISTS trg_refresh_gl_mv ON journal_entries;
CREATE TRIGGER trg_refresh_gl_mv
  AFTER INSERT OR UPDATE OF status
  ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_gl_mv();

-- 5. تحديث أولي للـ View بالبيانات الحالية
REFRESH MATERIALIZED VIEW dashboard_gl_monthly_summary;

-- 6. View مساعد للـ Dashboard (يُستعمل من التطبيق مباشرة)
-- يُعيد ملخص الإيرادات والمصروفات والأرباح لفترة محددة
CREATE OR REPLACE VIEW dashboard_gl_period_summary AS
SELECT
  company_id,
  branch_id,
  month_key,
  SUM(CASE 
    WHEN account_type IN ('income', 'revenue') 
    THEN net_credit ELSE 0 
  END) AS revenue,
  SUM(CASE 
    WHEN account_type = 'expense' 
    AND (account_code = '5000' OR LOWER(sub_type) IN ('cogs', 'cost_of_goods_sold'))
    THEN total_debit - total_credit ELSE 0 
  END) AS cogs,
  SUM(CASE 
    WHEN account_type = 'expense'
    AND NOT (account_code = '5000' OR LOWER(sub_type) IN ('cogs', 'cost_of_goods_sold'))
    THEN total_debit - total_credit ELSE 0 
  END) AS operating_expenses
FROM dashboard_gl_monthly_summary
GROUP BY company_id, branch_id, month_key;

COMMENT ON MATERIALIZED VIEW dashboard_gl_monthly_summary IS 
  'Pre-aggregated GL data for dashboard KPIs. Refresh via refresh_dashboard_gl_monthly_summary().';

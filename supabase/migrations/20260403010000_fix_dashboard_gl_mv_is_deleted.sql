-- ============================================================
-- Migration: Fix Dashboard GL Monthly Summary Materialized View
-- Created: 2026-04-03
-- ============================================================
-- Problem: The 'dashboard_gl_monthly_summary' materialized view 
-- was not filtering out deleted journal entries (is_deleted = true or 
-- deleted_at IS NOT NULL), causing the dashboard to show incorrect
-- inflated numbers for deleted financial records.
--
-- Fix: Recreate the materialized view and add the missing filters.
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS dashboard_gl_monthly_summary CASCADE;

CREATE MATERIALIZED VIEW dashboard_gl_monthly_summary AS
 SELECT je.company_id,
    je.branch_id,
    (date_trunc('month'::text, (je.entry_date)::timestamp with time zone))::date AS month_start,
    to_char((je.entry_date)::timestamp with time zone, 'YYYY-MM'::text) AS month_key,
    coa.account_type,
    coa.sub_type,
    coa.account_code,
    sum(jel.debit_amount) AS total_debit,
    sum(jel.credit_amount) AS total_credit,
    sum((jel.credit_amount - jel.debit_amount)) AS net_credit
   FROM ((journal_entry_lines jel
     JOIN journal_entries je ON (((jel.journal_entry_id = je.id) 
       AND (je.status = 'posted'::text)
       AND (COALESCE(je.is_deleted, false) = false)
       AND (je.deleted_at IS NULL)
     )))
     JOIN chart_of_accounts coa ON ((jel.account_id = coa.id)))
  GROUP BY je.company_id, je.branch_id, (date_trunc('month'::text, (je.entry_date)::timestamp with time zone)), (to_char((je.entry_date)::timestamp with time zone, 'YYYY-MM'::text)), coa.account_type, coa.sub_type, coa.account_code;

-- Recreate index on the view
CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_gl_monthly_summary_unique 
ON dashboard_gl_monthly_summary(company_id, branch_id, month_key, account_code);

-- Recreate dependent view dashboard_gl_period_summary
CREATE OR REPLACE VIEW dashboard_gl_period_summary AS
 SELECT company_id,
    branch_id,
    month_key,
    sum(
        CASE
            WHEN (account_type = ANY (ARRAY['income'::text, 'revenue'::text])) THEN net_credit
            ELSE (0)::numeric
        END) AS revenue,
    sum(
        CASE
            WHEN ((account_type = 'expense'::text) AND ((account_code = '5000'::text) OR (lower(sub_type) = ANY (ARRAY['cogs'::text, 'cost_of_goods_sold'::text])))) THEN (total_debit - total_credit)
            ELSE (0)::numeric
        END) AS cogs,
    sum(
        CASE
            WHEN ((account_type = 'expense'::text) AND (NOT ((account_code = '5000'::text) OR (lower(sub_type) = ANY (ARRAY['cogs'::text, 'cost_of_goods_sold'::text]))))) THEN (total_debit - total_credit)
            ELSE (0)::numeric
        END) AS operating_expenses
   FROM dashboard_gl_monthly_summary
  GROUP BY company_id, branch_id, month_key;

-- Refresh the view immediately
REFRESH MATERIALIZED VIEW dashboard_gl_monthly_summary;

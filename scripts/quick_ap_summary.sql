-- =====================================================
-- ملخص سريع لحساب الموردين (AP) - استعلام واحد
-- =====================================================

WITH BillCredits AS (
  SELECT SUM(jel.credit_amount) AS total
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE coa.account_code = '2110'
    AND je.reference_type = 'bill'
    AND je.deleted_at IS NULL
),
PaymentDebits AS (
  SELECT SUM(jel.debit_amount) AS total
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE coa.account_code = '2110'
    AND je.reference_type = 'bill_payment'
    AND je.deleted_at IS NULL
),
VendorCreditDebits AS (
  SELECT SUM(jel.debit_amount) AS total
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE coa.account_code = '2110'
    AND je.reference_type = 'vendor_credit'
    AND je.deleted_at IS NULL
),
AllCredits AS (
  SELECT SUM(jel.credit_amount) AS total
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE coa.account_code = '2110'
    AND je.deleted_at IS NULL
),
AllDebits AS (
  SELECT SUM(jel.debit_amount) AS total
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE coa.account_code = '2110'
    AND je.deleted_at IS NULL
),
MissingBills AS (
  SELECT SUM(total_amount) AS total
  FROM bills b
  WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.reference_type = 'bill'
        AND je.reference_id = b.id
        AND je.deleted_at IS NULL
    )
)
SELECT 
  'AP Complete Summary' AS check_type,
  COALESCE(bc.total, 0) AS bill_credits,
  COALESCE(pd.total, 0) AS payment_debits,
  COALESCE(vcd.total, 0) AS vendor_credit_debits,
  COALESCE(ac.total, 0) AS total_all_credits,
  COALESCE(ad.total, 0) AS total_all_debits,
  COALESCE(mb.total, 0) AS missing_bills_amount,
  COALESCE(ac.total, 0) - COALESCE(ad.total, 0) AS net_ap_balance,
  CASE 
    WHEN COALESCE(ac.total, 0) - COALESCE(ad.total, 0) >= 0 
    THEN '✅ رصيد موجب'
    ELSE '⚠️ رصيد سالب'
  END AS status
FROM BillCredits bc
CROSS JOIN PaymentDebits pd
CROSS JOIN VendorCreditDebits vcd
CROSS JOIN AllCredits ac
CROSS JOIN AllDebits ad
CROSS JOIN MissingBills mb;

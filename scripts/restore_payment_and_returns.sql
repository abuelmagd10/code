-- Restore the BILL-0001 payment by reversing its wrongful reversal
SELECT create_reversal_entry(
  'ad788ec2-fd06-447b-9459-e2b3024d5187',
  'system',
  '00000000-0000-0000-0000-000000000000'
);

-- Find all purchase returns for BILL-0001
SELECT 
  je.id,
  je.description,
  je.reversal_of_entry_id,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit
FROM journal_entries je
JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
WHERE je.reference_type IN ('purchase_return', 'reversal')
AND (je.description ILIKE '%BILL-0001%' OR je.description ILIKE '%2009e030-14da-4ebc-aa38-b5b3dfdb65da%')
GROUP BY je.id, je.description, je.reversal_of_entry_id;

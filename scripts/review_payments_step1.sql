-- =====================================================
-- خطوة 1: عرض جميع المدفوعات مع تفاصيلها
-- =====================================================

SELECT
  '1. All Bill Payments' AS check_type,
  p.id AS payment_id,
  p.payment_date,
  p.amount,
  p.payment_method,
  p.reference_number,
  b.bill_number,
  b.total_amount AS bill_total,
  b.status AS bill_status,
  s.name AS supplier_name,
  c.name AS company_name,
  je.id AS journal_entry_id,
  CASE
    WHEN je.id IS NULL THEN 'لا يوجد قيد محاسبي'
    ELSE 'يوجد قيد محاسبي'
  END AS journal_status
FROM payments p
LEFT JOIN bills b ON b.id = p.bill_id
LEFT JOIN suppliers s ON s.id = p.supplier_id
LEFT JOIN companies c ON c.id = p.company_id
LEFT JOIN journal_entries je ON je.reference_type = 'bill_payment' AND je.reference_id = p.id AND je.deleted_at IS NULL
WHERE p.bill_id IS NOT NULL
ORDER BY p.payment_date DESC, p.amount DESC;

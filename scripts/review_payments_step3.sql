-- =====================================================
-- خطوة 3: عرض جميع إشعارات الدائن مع تفاصيلها
-- =====================================================

SELECT
  '3. All Vendor Credits' AS check_type,
  vc.id AS vendor_credit_id,
  vc.credit_number,
  vc.credit_date,
  vc.total_amount,
  vc.status AS credit_status,
  vc.applied_amount,
  vc.total_amount - vc.applied_amount AS remaining_amount,
  s.name AS supplier_name,
  c.name AS company_name,
  je.id AS journal_entry_id,
  CASE
    WHEN je.id IS NULL THEN 'لا يوجد قيد محاسبي'
    ELSE 'يوجد قيد محاسبي'
  END AS journal_status
FROM vendor_credits vc
LEFT JOIN suppliers s ON s.id = vc.supplier_id
LEFT JOIN companies c ON c.id = vc.company_id
LEFT JOIN journal_entries je ON je.reference_type = 'vendor_credit' AND je.reference_id = vc.id AND je.deleted_at IS NULL
WHERE vc.status IN ('approved', 'applied', 'open', 'partially_applied')
ORDER BY vc.credit_date DESC, vc.total_amount DESC;

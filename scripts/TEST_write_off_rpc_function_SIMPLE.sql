-- =============================================
-- 🧪 اختبار بسيط ومباشر للدالة
-- Simple Direct Test for get_available_inventory_quantity RPC Function
-- =============================================

-- القيم المعروفة:
-- company_id: f0ffc062-1e6e-4324-8be4-f5052e881a67
-- branch_id: 3808e27d-8461-4684-989d-fddbb4f5d029
-- warehouse_id: 3c9a544b-931b-46b0-b429-a89bb7889fa3
-- product_id: 00579d6d-2b39-4ec2-9b17-b1fa6f395d51
-- inventory_transactions total: 1200 (5 transactions)
-- quantity_on_hand: 1200

-- =====================================
-- اختبار مباشر للدالة
-- =====================================
SELECT 
  get_available_inventory_quantity(
    'f0ffc062-1e6e-4324-8be4-f5052e881a67'::uuid, -- company_id (تست)
    '3808e27d-8461-4684-989d-fddbb4f5d029'::uuid, -- branch_id (مصر الجديدة)
    '3c9a544b-931b-46b0-b429-a89bb7889fa3'::uuid, -- warehouse_id (مخزن مصر الجديدة)
    NULL::uuid, -- cost_center_id
    '00579d6d-2b39-4ec2-9b17-b1fa6f395d51'::uuid -- product_id (boom)
  ) as available_quantity,
  1200 as expected_quantity,
  CASE 
    WHEN get_available_inventory_quantity(
      'f0ffc062-1e6e-4324-8be4-f5052e881a67'::uuid,
      '3808e27d-8461-4684-989d-fddbb4f5d029'::uuid,
      '3c9a544b-931b-46b0-b429-a89bb7889fa3'::uuid,
      NULL::uuid,
      '00579d6d-2b39-4ec2-9b17-b1fa6f395d51'::uuid
    ) = 1200 THEN '✅ SUCCESS: RPC function is working correctly!'
    WHEN get_available_inventory_quantity(
      'f0ffc062-1e6e-4324-8be4-f5052e881a67'::uuid,
      '3808e27d-8461-4684-989d-fddbb4f5d029'::uuid,
      '3c9a544b-931b-46b0-b429-a89bb7889fa3'::uuid,
      NULL::uuid,
      '00579d6d-2b39-4ec2-9b17-b1fa6f395d51'::uuid
    ) = 0 THEN '⚠️ PROBLEM: RPC returned 0 but should return 1200!'
    ELSE '⚠️ UNEXPECTED: RPC returned a different value'
  END as test_result;

-- =====================================================
-- 🔧 إنشاء RPC function لحذف بنود طلبات النقل
-- =====================================================
-- هذه الدالة تتجاوز RLS وتحذف البنود بأمان
-- =====================================================

-- حذف الدالة القديمة إن وجدت
DROP FUNCTION IF EXISTS delete_transfer_item(UUID);
DROP FUNCTION IF EXISTS delete_transfer_items_by_transfer(UUID);

-- ✅ دالة لحذف بند واحد
CREATE OR REPLACE FUNCTION delete_transfer_item(p_item_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transfer_id UUID;
  v_transfer_status TEXT;
  v_created_by UUID;
  v_user_role TEXT;
  v_company_id UUID;
BEGIN
  -- جلب معلومات البند والطلب
  SELECT t.id, t.status, t.created_by, t.company_id
  INTO v_transfer_id, v_transfer_status, v_created_by, v_company_id
  FROM inventory_transfer_items iti
  JOIN inventory_transfers t ON t.id = iti.transfer_id
  WHERE iti.id = p_item_id;

  IF v_transfer_id IS NULL THEN
    RAISE EXCEPTION 'Item not found';
  END IF;

  -- جلب دور المستخدم
  SELECT role INTO v_user_role
  FROM company_members
  WHERE company_id = v_company_id AND user_id = auth.uid();

  -- التحقق من الصلاحيات
  IF v_user_role IN ('owner', 'admin') THEN
    -- Owner/Admin يمكنهم الحذف دائماً
    DELETE FROM inventory_transfer_items WHERE id = p_item_id;
    RETURN TRUE;
  ELSIF v_created_by = auth.uid() AND v_transfer_status IN ('draft', 'rejected') THEN
    -- المنشئ يمكنه الحذف إذا كان الطلب draft أو rejected
    DELETE FROM inventory_transfer_items WHERE id = p_item_id;
    RETURN TRUE;
  ELSE
    RAISE EXCEPTION 'Permission denied';
  END IF;
END;
$$;

-- ✅ دالة لحذف جميع بنود طلب نقل
CREATE OR REPLACE FUNCTION delete_transfer_items_by_transfer(p_transfer_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transfer_status TEXT;
  v_created_by UUID;
  v_user_role TEXT;
  v_company_id UUID;
  v_deleted_count INTEGER;
BEGIN
  -- جلب معلومات الطلب
  SELECT status, created_by, company_id
  INTO v_transfer_status, v_created_by, v_company_id
  FROM inventory_transfers
  WHERE id = p_transfer_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;

  -- جلب دور المستخدم
  SELECT role INTO v_user_role
  FROM company_members
  WHERE company_id = v_company_id AND user_id = auth.uid();

  -- التحقق من الصلاحيات
  IF v_user_role IN ('owner', 'admin') OR 
     (v_created_by = auth.uid() AND v_transfer_status IN ('draft', 'rejected')) THEN
    DELETE FROM inventory_transfer_items WHERE transfer_id = p_transfer_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
  ELSE
    RAISE EXCEPTION 'Permission denied';
  END IF;
END;
$$;

-- ✅ منح الصلاحيات
GRANT EXECUTE ON FUNCTION delete_transfer_item(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_transfer_items_by_transfer(UUID) TO authenticated;

SELECT '✅ تم إنشاء دوال حذف بنود طلبات النقل بنجاح!' AS status;


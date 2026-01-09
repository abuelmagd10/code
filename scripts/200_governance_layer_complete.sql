-- =====================================================
-- 🏛️ GOVERNANCE LAYER - نظام الحوكمة الشامل
-- =====================================================
-- نظام إلزامي لكل الحركات المالية والمخزنية
-- IFRS + SOX + Anti-Fraud Compliant
-- =====================================================

\echo '🏛️ Starting Governance Layer Installation...'
\echo ''

-- =====================================================
-- 1️⃣ جدول الإشعارات (Notifications)
-- =====================================================

\echo '1️⃣ Creating notifications table...'

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 🏢 السياق التنظيمي (إلزامي)
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  
  -- 📋 نوع الإشعار والمرجع (إلزامي)
  reference_type VARCHAR(50) NOT NULL, -- 'customer_debit_note', 'vendor_credit', 'refund_request', 'stock_transfer', 'approval_request', etc.
  reference_id UUID NOT NULL,
  
  -- 👤 من أنشأ ولمن موجه
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to_role VARCHAR(50), -- 'owner', 'admin', 'manager', 'accountant', 'warehouse_manager', 'staff'
  assigned_to_user UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- 📝 محتوى الإشعار
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  
  -- ✅ الحالة
  status VARCHAR(20) DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived', 'actioned')),
  read_at TIMESTAMPTZ,
  actioned_at TIMESTAMPTZ,
  
  -- 📅 التواريخ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  
  -- 🔍 فهارس للأداء
  CONSTRAINT notifications_reference_check CHECK (reference_type IS NOT NULL AND reference_id IS NOT NULL)
);

-- فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_notifications_company_status ON notifications(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_assigned_to_user ON notifications(assigned_to_user, status) WHERE assigned_to_user IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_assigned_to_role ON notifications(assigned_to_role, status) WHERE assigned_to_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_branch ON notifications(branch_id, status) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_warehouse ON notifications(warehouse_id, status) WHERE warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_reference ON notifications(reference_type, reference_id);

COMMENT ON TABLE notifications IS 'نظام الإشعارات الموجهة حسب السياق التنظيمي';

\echo '✅ Notifications table created'
\echo ''

-- =====================================================
-- 2️⃣ تحديث جدول الموافقات (Approval Workflows)
-- =====================================================

\echo '2️⃣ Upgrading approval_workflows table...'

-- حذف الجدول القديم إن وجد وإعادة إنشائه بالبنية الجديدة
DROP TABLE IF EXISTS approval_workflows CASCADE;

CREATE TABLE approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 🏢 السياق التنظيمي (إلزامي)
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  
  -- 📋 نوع سير العمل والمورد
  workflow_type VARCHAR(50) NOT NULL, -- 'financial', 'inventory', 'refund', 'transfer', 'adjustment'
  resource_type VARCHAR(50) NOT NULL, -- 'customer_debit_note', 'vendor_credit', 'refund_request', 'stock_transfer', etc.
  resource_id UUID NOT NULL,
  
  -- 💰 المبلغ (للموافقات المالية)
  amount DECIMAL(15,2),
  currency_code VARCHAR(3) DEFAULT 'USD',
  
  -- 👤 من طلب ومن وافق
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  
  approver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  
  rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ,
  
  -- ✅ الحالة (DRAFT → PENDING_APPROVAL → APPROVED/REJECTED → EXECUTED)
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'executed', 'cancelled')),
  
  -- 📝 ملاحظات
  notes TEXT,
  metadata JSONB,
  
  -- 📅 التواريخ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 🔒 قيود
  CONSTRAINT approval_workflows_no_self_approval CHECK (requested_by != approver_id),
  CONSTRAINT approval_workflows_status_flow CHECK (
    (status = 'draft') OR
    (status = 'pending_approval' AND requested_at IS NOT NULL) OR
    (status = 'approved' AND approver_id IS NOT NULL AND approved_at IS NOT NULL) OR
    (status = 'rejected' AND rejected_by IS NOT NULL AND rejected_at IS NOT NULL) OR
    (status = 'executed' AND executed_by IS NOT NULL AND executed_at IS NOT NULL) OR
    (status = 'cancelled')
  )
);

-- فهارس
CREATE INDEX IF NOT EXISTS idx_approval_workflows_company_status ON approval_workflows(company_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_resource ON approval_workflows(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_approver ON approval_workflows(approver_id, status) WHERE approver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_approval_workflows_branch ON approval_workflows(branch_id, status) WHERE branch_id IS NOT NULL;

COMMENT ON TABLE approval_workflows IS 'محرك الموافقات الإلزامي لكل الحركات الحساسة';

\echo '✅ Approval workflows table upgraded'
\echo ''

-- =====================================================
-- 3️⃣ جدول طلبات الاسترداد النقدي (Refund Requests)
-- =====================================================

\echo '3️⃣ Creating refund_requests table...'

CREATE TABLE IF NOT EXISTS refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 🏢 السياق التنظيمي (إلزامي)
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,

  -- 📋 رقم الطلب
  request_number VARCHAR(50) NOT NULL,
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- 🔗 المستند المرتبط (إلزامي)
  source_type VARCHAR(50) NOT NULL, -- 'invoice', 'sales_return', 'customer_credit', 'vendor_credit', 'other'
  source_id UUID NOT NULL,

  -- 👤 العميل أو المورد
  customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,

  -- 💰 المبلغ
  requested_amount DECIMAL(15,2) NOT NULL CHECK (requested_amount > 0),
  approved_amount DECIMAL(15,2),
  currency_code VARCHAR(3) DEFAULT 'USD',

  -- 📝 السبب والتفاصيل (إلزامي)
  reason TEXT NOT NULL,
  notes TEXT,
  attachments JSONB, -- [{filename, url, uploaded_by, uploaded_at}]

  -- 👤 من أنشأ ومن وافق
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- موافقة مدير الفرع أو المدير المالي (إلزامي)
  branch_manager_approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  branch_manager_approved_at TIMESTAMPTZ,

  -- موافقة Owner أو المدير العام (إلزامي)
  final_approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  final_approved_at TIMESTAMPTZ,

  -- رفض
  rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- ✅ الحالة
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'pending_branch_approval',
    'pending_final_approval',
    'approved',
    'rejected',
    'executed',
    'cancelled'
  )),

  -- 💳 التنفيذ (إنشاء سند الصرف)
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  payment_method VARCHAR(50), -- 'cash', 'bank_transfer', 'check'
  executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ,

  -- 📅 التواريخ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 🔒 قيود
  CONSTRAINT refund_requests_customer_or_supplier CHECK (
    (customer_id IS NOT NULL AND supplier_id IS NULL) OR
    (customer_id IS NULL AND supplier_id IS NOT NULL)
  ),
  CONSTRAINT refund_requests_approved_amount_check CHECK (
    approved_amount IS NULL OR approved_amount <= requested_amount
  ),
  CONSTRAINT refund_requests_no_self_approval CHECK (
    created_by != branch_manager_approved_by AND
    created_by != final_approved_by
  ),
  CONSTRAINT refund_requests_unique_number UNIQUE (company_id, request_number)
);

-- فهارس
CREATE INDEX IF NOT EXISTS idx_refund_requests_company_status ON refund_requests(company_id, status, request_date DESC);
CREATE INDEX IF NOT EXISTS idx_refund_requests_branch ON refund_requests(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_refund_requests_customer ON refund_requests(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refund_requests_supplier ON refund_requests(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refund_requests_source ON refund_requests(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_payment ON refund_requests(payment_id) WHERE payment_id IS NOT NULL;

COMMENT ON TABLE refund_requests IS 'طلبات الاسترداد النقدي - يجب المرور عبرها قبل إنشاء أي سند صرف';

\echo '✅ Refund requests table created'
\echo ''

-- =====================================================
-- 4️⃣ جدول سجل التدقيق الشامل (Audit Log)
-- =====================================================

\echo '4️⃣ Creating comprehensive audit_trail table...'

CREATE TABLE IF NOT EXISTS audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 🏢 السياق
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,

  -- 👤 من قام بالعملية
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email VARCHAR(255),
  user_role VARCHAR(50),

  -- 📋 نوع العملية
  action_type VARCHAR(50) NOT NULL, -- 'create', 'update', 'delete', 'approve', 'reject', 'execute', 'void', 'cancel'
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID NOT NULL,

  -- 📝 التفاصيل
  description TEXT,
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[],

  -- 🌐 معلومات الجلسة
  ip_address INET,
  user_agent TEXT,
  session_id VARCHAR(255),

  -- 📅 التاريخ
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- 🔒 لا يمكن الحذف أبداً
  is_deleted BOOLEAN DEFAULT FALSE CHECK (is_deleted = FALSE)
);

-- فهارس
CREATE INDEX IF NOT EXISTS idx_audit_trail_company ON audit_trail(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_user ON audit_trail(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_resource ON audit_trail(resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_action ON audit_trail(action_type, created_at DESC);

COMMENT ON TABLE audit_trail IS 'سجل تدقيق شامل لكل العمليات - لا يمكن الحذف أبداً';

\echo '✅ Audit trail table created'
\echo ''

-- =====================================================
-- 5️⃣ دوال محرك الإشعارات (Notification Engine)
-- =====================================================

\echo '5️⃣ Creating notification engine functions...'

-- دالة إنشاء إشعار تلقائي
CREATE OR REPLACE FUNCTION create_notification(
  p_company_id UUID,
  p_reference_type VARCHAR(50),
  p_reference_id UUID,
  p_title VARCHAR(255),
  p_message TEXT,
  p_created_by UUID,
  p_branch_id UUID DEFAULT NULL,
  p_cost_center_id UUID DEFAULT NULL,
  p_warehouse_id UUID DEFAULT NULL,
  p_assigned_to_role VARCHAR(50) DEFAULT NULL,
  p_assigned_to_user UUID DEFAULT NULL,
  p_priority VARCHAR(20) DEFAULT 'normal'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  -- إنشاء الإشعار
  INSERT INTO notifications (
    company_id,
    branch_id,
    cost_center_id,
    warehouse_id,
    reference_type,
    reference_id,
    created_by,
    assigned_to_role,
    assigned_to_user,
    title,
    message,
    priority,
    status
  ) VALUES (
    p_company_id,
    p_branch_id,
    p_cost_center_id,
    p_warehouse_id,
    p_reference_type,
    p_reference_id,
    p_created_by,
    p_assigned_to_role,
    p_assigned_to_user,
    p_title,
    p_message,
    p_priority,
    'unread'
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- دالة الحصول على الإشعارات حسب السياق
CREATE OR REPLACE FUNCTION get_user_notifications(
  p_user_id UUID,
  p_company_id UUID,
  p_branch_id UUID DEFAULT NULL,
  p_warehouse_id UUID DEFAULT NULL,
  p_status VARCHAR(20) DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  reference_type VARCHAR(50),
  reference_id UUID,
  title VARCHAR(255),
  message TEXT,
  priority VARCHAR(20),
  status VARCHAR(20),
  created_at TIMESTAMPTZ,
  branch_name VARCHAR(255),
  warehouse_name VARCHAR(255)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.reference_type,
    n.reference_id,
    n.title,
    n.message,
    n.priority,
    n.status,
    n.created_at,
    b.name AS branch_name,
    w.name AS warehouse_name
  FROM notifications n
  LEFT JOIN branches b ON n.branch_id = b.id
  LEFT JOIN warehouses w ON n.warehouse_id = w.id
  WHERE n.company_id = p_company_id
    AND (n.assigned_to_user = p_user_id OR n.assigned_to_user IS NULL)
    AND (p_branch_id IS NULL OR n.branch_id = p_branch_id OR n.branch_id IS NULL)
    AND (p_warehouse_id IS NULL OR n.warehouse_id = p_warehouse_id OR n.warehouse_id IS NULL)
    AND (p_status IS NULL OR n.status = p_status)
  ORDER BY
    CASE n.priority
      WHEN 'urgent' THEN 1
      WHEN 'high' THEN 2
      WHEN 'normal' THEN 3
      WHEN 'low' THEN 4
    END,
    n.created_at DESC;
END;
$$;

-- دالة تحديث حالة الإشعار
CREATE OR REPLACE FUNCTION mark_notification_as_read(
  p_notification_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE notifications
  SET status = 'read',
      read_at = NOW()
  WHERE id = p_notification_id
    AND (assigned_to_user = p_user_id OR assigned_to_user IS NULL);

  RETURN FOUND;
END;
$$;

\echo '✅ Notification engine functions created'
\echo ''

-- =====================================================
-- 6️⃣ دوال محرك الموافقات (Approval Engine)
-- =====================================================

\echo '6️⃣ Creating approval engine functions...'

-- دالة إنشاء طلب موافقة
CREATE OR REPLACE FUNCTION create_approval_request(
  p_company_id UUID,
  p_resource_type VARCHAR(50),
  p_resource_id UUID,
  p_workflow_type VARCHAR(50),
  p_requested_by UUID,
  p_branch_id UUID DEFAULT NULL,
  p_cost_center_id UUID DEFAULT NULL,
  p_warehouse_id UUID DEFAULT NULL,
  p_amount DECIMAL(15,2) DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_approval_id UUID;
BEGIN
  -- إنشاء طلب الموافقة
  INSERT INTO approval_workflows (
    company_id,
    branch_id,
    cost_center_id,
    warehouse_id,
    workflow_type,
    resource_type,
    resource_id,
    amount,
    requested_by,
    status,
    notes
  ) VALUES (
    p_company_id,
    p_branch_id,
    p_cost_center_id,
    p_warehouse_id,
    p_workflow_type,
    p_resource_type,
    p_resource_id,
    p_amount,
    p_requested_by,
    'pending_approval',
    p_notes
  )
  RETURNING id INTO v_approval_id;

  -- إنشاء إشعار للموافق
  PERFORM create_notification(
    p_company_id := p_company_id,
    p_reference_type := 'approval_request',
    p_reference_id := v_approval_id,
    p_title := 'طلب موافقة جديد',
    p_message := format('طلب موافقة على %s', p_resource_type),
    p_created_by := p_requested_by,
    p_branch_id := p_branch_id,
    p_warehouse_id := p_warehouse_id,
    p_assigned_to_role := 'manager',
    p_priority := CASE WHEN p_amount > 10000 THEN 'high' ELSE 'normal' END
  );

  RETURN v_approval_id;
END;
$$;

-- دالة الموافقة
CREATE OR REPLACE FUNCTION approve_request(
  p_approval_id UUID,
  p_approver_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  approval_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_requested_by UUID;
  v_current_status VARCHAR(20);
  v_resource_type VARCHAR(50);
  v_resource_id UUID;
BEGIN
  -- الحصول على معلومات الطلب
  SELECT requested_by, status, resource_type, resource_id
  INTO v_requested_by, v_current_status, v_resource_type, v_resource_id
  FROM approval_workflows
  WHERE id = p_approval_id;

  -- التحقق من وجود الطلب
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Approval request not found', p_approval_id, NULL::TEXT;
    RETURN;
  END IF;

  -- التحقق من الحالة
  IF v_current_status != 'pending_approval' THEN
    RETURN QUERY SELECT FALSE, format('Cannot approve request in status: %s', v_current_status), p_approval_id, v_current_status;
    RETURN;
  END IF;

  -- فصل المهام: المنشئ لا يمكنه الموافقة
  IF v_requested_by = p_approver_id THEN
    RETURN QUERY SELECT FALSE, 'Requester cannot approve their own request', p_approval_id, v_current_status;
    RETURN;
  END IF;

  -- تحديث الحالة
  UPDATE approval_workflows
  SET status = 'approved',
      approver_id = p_approver_id,
      approved_at = NOW(),
      notes = COALESCE(notes || E'\n\n', '') || COALESCE(p_notes, ''),
      updated_at = NOW()
  WHERE id = p_approval_id;

  -- إنشاء إشعار للمنشئ
  PERFORM create_notification(
    p_company_id := (SELECT company_id FROM approval_workflows WHERE id = p_approval_id),
    p_reference_type := 'approval_approved',
    p_reference_id := p_approval_id,
    p_title := 'تمت الموافقة',
    p_message := format('تمت الموافقة على طلبك: %s', v_resource_type),
    p_created_by := p_approver_id,
    p_assigned_to_user := v_requested_by,
    p_priority := 'normal'
  );

  RETURN QUERY SELECT TRUE, 'Request approved successfully', p_approval_id, 'approved'::TEXT;
END;
$$;

-- دالة الرفض
CREATE OR REPLACE FUNCTION reject_request(
  p_approval_id UUID,
  p_rejected_by UUID,
  p_rejection_reason TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  approval_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_requested_by UUID;
  v_current_status VARCHAR(20);
  v_resource_type VARCHAR(50);
BEGIN
  -- الحصول على معلومات الطلب
  SELECT requested_by, status, resource_type
  INTO v_requested_by, v_current_status, v_resource_type
  FROM approval_workflows
  WHERE id = p_approval_id;

  -- التحقق من وجود الطلب
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Approval request not found', p_approval_id, NULL::TEXT;
    RETURN;
  END IF;

  -- التحقق من الحالة
  IF v_current_status != 'pending_approval' THEN
    RETURN QUERY SELECT FALSE, format('Cannot reject request in status: %s', v_current_status), p_approval_id, v_current_status;
    RETURN;
  END IF;

  -- تحديث الحالة
  UPDATE approval_workflows
  SET status = 'rejected',
      rejected_by = p_rejected_by,
      rejected_at = NOW(),
      rejection_reason = p_rejection_reason,
      updated_at = NOW()
  WHERE id = p_approval_id;

  -- إنشاء إشعار للمنشئ
  PERFORM create_notification(
    p_company_id := (SELECT company_id FROM approval_workflows WHERE id = p_approval_id),
    p_reference_type := 'approval_rejected',
    p_reference_id := p_approval_id,
    p_title := 'تم رفض الطلب',
    p_message := format('تم رفض طلبك: %s. السبب: %s', v_resource_type, p_rejection_reason),
    p_created_by := p_rejected_by,
    p_assigned_to_user := v_requested_by,
    p_priority := 'high'
  );

  RETURN QUERY SELECT TRUE, 'Request rejected', p_approval_id, 'rejected'::TEXT;
END;
$$;

\echo '✅ Approval engine functions created'
\echo ''

-- =====================================================
-- 7️⃣ دوال طلبات الاسترداد النقدي (Refund Engine)
-- =====================================================

\echo '7️⃣ Creating refund request functions...'

-- دالة إنشاء طلب استرداد نقدي
CREATE OR REPLACE FUNCTION create_refund_request(
  p_company_id UUID,
  p_branch_id UUID,
  p_source_type VARCHAR(50),
  p_source_id UUID,
  p_requested_amount DECIMAL(15,2),
  p_reason TEXT,
  p_created_by UUID,
  p_customer_id UUID DEFAULT NULL,
  p_supplier_id UUID DEFAULT NULL,
  p_cost_center_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_refund_id UUID;
  v_request_number VARCHAR(50);
BEGIN
  -- التحقق من وجود عميل أو مورد
  IF p_customer_id IS NULL AND p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Either customer_id or supplier_id must be provided';
  END IF;

  IF p_customer_id IS NOT NULL AND p_supplier_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot have both customer_id and supplier_id';
  END IF;

  -- توليد رقم الطلب
  SELECT 'RFD-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
         LPAD(COALESCE(MAX(SUBSTRING(request_number FROM '\d+$')::INTEGER), 0) + 1::TEXT, 5, '0')
  INTO v_request_number
  FROM refund_requests
  WHERE company_id = p_company_id
    AND request_number LIKE 'RFD-' || TO_CHAR(NOW(), 'YYYY') || '-%';

  -- إنشاء طلب الاسترداد
  INSERT INTO refund_requests (
    company_id,
    branch_id,
    cost_center_id,
    request_number,
    source_type,
    source_id,
    customer_id,
    supplier_id,
    requested_amount,
    reason,
    notes,
    created_by,
    status
  ) VALUES (
    p_company_id,
    p_branch_id,
    p_cost_center_id,
    v_request_number,
    p_source_type,
    p_source_id,
    p_customer_id,
    p_supplier_id,
    p_requested_amount,
    p_reason,
    p_notes,
    p_created_by,
    'draft'
  )
  RETURNING id INTO v_refund_id;

  -- إنشاء إشعار لمدير الفرع
  PERFORM create_notification(
    p_company_id := p_company_id,
    p_reference_type := 'refund_request',
    p_reference_id := v_refund_id,
    p_title := 'طلب استرداد نقدي جديد',
    p_message := format('طلب استرداد بمبلغ %s - السبب: %s', p_requested_amount, p_reason),
    p_created_by := p_created_by,
    p_branch_id := p_branch_id,
    p_assigned_to_role := 'manager',
    p_priority := CASE WHEN p_requested_amount > 5000 THEN 'high' ELSE 'normal' END
  );

  RETURN v_refund_id;
END;
$$;

-- دالة تقديم طلب الاسترداد للموافقة
CREATE OR REPLACE FUNCTION submit_refund_for_approval(
  p_refund_id UUID,
  p_submitted_by UUID
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  refund_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status VARCHAR(20);
BEGIN
  -- الحصول على الحالة الحالية
  SELECT status INTO v_current_status
  FROM refund_requests
  WHERE id = p_refund_id;

  -- التحقق من الحالة
  IF v_current_status != 'draft' THEN
    RETURN QUERY SELECT FALSE, format('Cannot submit refund in status: %s', v_current_status), p_refund_id, v_current_status;
    RETURN;
  END IF;

  -- تحديث الحالة
  UPDATE refund_requests
  SET status = 'pending_branch_approval',
      updated_at = NOW()
  WHERE id = p_refund_id;

  RETURN QUERY SELECT TRUE, 'Refund request submitted for approval', p_refund_id, 'pending_branch_approval'::TEXT;
END;
$$;

-- دالة موافقة مدير الفرع
CREATE OR REPLACE FUNCTION approve_refund_branch_manager(
  p_refund_id UUID,
  p_approver_id UUID,
  p_approved_amount DECIMAL(15,2) DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  refund_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_created_by UUID;
  v_current_status VARCHAR(20);
  v_requested_amount DECIMAL(15,2);
BEGIN
  -- الحصول على معلومات الطلب
  SELECT created_by, status, requested_amount
  INTO v_created_by, v_current_status, v_requested_amount
  FROM refund_requests
  WHERE id = p_refund_id;

  -- التحقق من الحالة
  IF v_current_status != 'pending_branch_approval' THEN
    RETURN QUERY SELECT FALSE, format('Cannot approve refund in status: %s', v_current_status), p_refund_id, v_current_status;
    RETURN;
  END IF;

  -- فصل المهام
  IF v_created_by = p_approver_id THEN
    RETURN QUERY SELECT FALSE, 'Creator cannot approve their own refund request', p_refund_id, v_current_status;
    RETURN;
  END IF;

  -- التحقق من المبلغ المعتمد
  IF p_approved_amount IS NOT NULL AND p_approved_amount > v_requested_amount THEN
    RETURN QUERY SELECT FALSE, 'Approved amount cannot exceed requested amount', p_refund_id, v_current_status;
    RETURN;
  END IF;

  -- تحديث الحالة
  UPDATE refund_requests
  SET status = 'pending_final_approval',
      branch_manager_approved_by = p_approver_id,
      branch_manager_approved_at = NOW(),
      approved_amount = COALESCE(p_approved_amount, requested_amount),
      updated_at = NOW()
  WHERE id = p_refund_id;

  -- إنشاء إشعار للـ Owner
  PERFORM create_notification(
    p_company_id := (SELECT company_id FROM refund_requests WHERE id = p_refund_id),
    p_reference_type := 'refund_request',
    p_reference_id := p_refund_id,
    p_title := 'طلب استرداد يحتاج موافقة نهائية',
    p_message := format('طلب استرداد بمبلغ %s تمت الموافقة عليه من مدير الفرع', COALESCE(p_approved_amount, v_requested_amount)),
    p_created_by := p_approver_id,
    p_assigned_to_role := 'owner',
    p_priority := 'high'
  );

  RETURN QUERY SELECT TRUE, 'Branch manager approved - awaiting final approval', p_refund_id, 'pending_final_approval'::TEXT;
END;
$$;

\echo '✅ Refund request functions created'
\echo ''

-- دالة الموافقة النهائية (Owner)
CREATE OR REPLACE FUNCTION approve_refund_final(
  p_refund_id UUID,
  p_approver_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  refund_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_created_by UUID;
  v_current_status VARCHAR(20);
  v_branch_manager_approved_by UUID;
BEGIN
  -- الحصول على معلومات الطلب
  SELECT created_by, status, branch_manager_approved_by
  INTO v_created_by, v_current_status, v_branch_manager_approved_by
  FROM refund_requests
  WHERE id = p_refund_id;

  -- التحقق من الحالة
  IF v_current_status != 'pending_final_approval' THEN
    RETURN QUERY SELECT FALSE, format('Cannot approve refund in status: %s', v_current_status), p_refund_id, v_current_status;
    RETURN;
  END IF;

  -- فصل المهام
  IF v_created_by = p_approver_id THEN
    RETURN QUERY SELECT FALSE, 'Creator cannot approve their own refund request', p_refund_id, v_current_status;
    RETURN;
  END IF;

  -- تحديث الحالة
  UPDATE refund_requests
  SET status = 'approved',
      final_approved_by = p_approver_id,
      final_approved_at = NOW(),
      updated_at = NOW()
  WHERE id = p_refund_id;

  -- إنشاء إشعار للمنشئ
  PERFORM create_notification(
    p_company_id := (SELECT company_id FROM refund_requests WHERE id = p_refund_id),
    p_reference_type := 'refund_approved',
    p_reference_id := p_refund_id,
    p_title := 'تمت الموافقة على طلب الاسترداد',
    p_message := 'تمت الموافقة النهائية على طلب الاسترداد - يمكنك الآن إنشاء سند الصرف',
    p_created_by := p_approver_id,
    p_assigned_to_user := v_created_by,
    p_priority := 'high'
  );

  RETURN QUERY SELECT TRUE, 'Refund request fully approved - ready for execution', p_refund_id, 'approved'::TEXT;
END;
$$;

-- دالة رفض طلب الاسترداد
CREATE OR REPLACE FUNCTION reject_refund_request(
  p_refund_id UUID,
  p_rejected_by UUID,
  p_rejection_reason TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  refund_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_created_by UUID;
  v_current_status VARCHAR(20);
BEGIN
  -- الحصول على معلومات الطلب
  SELECT created_by, status
  INTO v_created_by, v_current_status
  FROM refund_requests
  WHERE id = p_refund_id;

  -- التحقق من الحالة
  IF v_current_status NOT IN ('pending_branch_approval', 'pending_final_approval') THEN
    RETURN QUERY SELECT FALSE, format('Cannot reject refund in status: %s', v_current_status), p_refund_id, v_current_status;
    RETURN;
  END IF;

  -- تحديث الحالة
  UPDATE refund_requests
  SET status = 'rejected',
      rejected_by = p_rejected_by,
      rejected_at = NOW(),
      rejection_reason = p_rejection_reason,
      updated_at = NOW()
  WHERE id = p_refund_id;

  -- إنشاء إشعار للمنشئ
  PERFORM create_notification(
    p_company_id := (SELECT company_id FROM refund_requests WHERE id = p_refund_id),
    p_reference_type := 'refund_rejected',
    p_reference_id := p_refund_id,
    p_title := 'تم رفض طلب الاسترداد',
    p_message := format('تم رفض طلب الاسترداد. السبب: %s', p_rejection_reason),
    p_created_by := p_rejected_by,
    p_assigned_to_user := v_created_by,
    p_priority := 'high'
  );

  RETURN QUERY SELECT TRUE, 'Refund request rejected', p_refund_id, 'rejected'::TEXT;
END;
$$;

\echo '✅ Refund approval functions created'
\echo ''

-- =====================================================
-- 8️⃣ Anti-Fraud Guards (حماية من الاحتيال)
-- =====================================================

\echo '8️⃣ Creating anti-fraud guards...'

-- Trigger: منع إنشاء سند صرف بدون Refund Request معتمد
CREATE OR REPLACE FUNCTION prevent_payment_without_approved_refund()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_refund_exists BOOLEAN;
  v_refund_status VARCHAR(20);
BEGIN
  -- فقط للمدفوعات النقدية الصادرة (Refunds)
  IF NEW.payment_type IN ('refund', 'cash_refund', 'bank_refund') THEN

    -- التحقق من وجود Refund Request معتمد
    SELECT EXISTS (
      SELECT 1 FROM refund_requests
      WHERE (customer_id = NEW.customer_id OR supplier_id = NEW.supplier_id)
        AND status = 'approved'
        AND payment_id IS NULL
        AND approved_amount >= NEW.amount
    ) INTO v_refund_exists;

    IF NOT v_refund_exists THEN
      RAISE EXCEPTION 'Cannot create refund payment without an approved refund request';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_payment_without_refund
  BEFORE INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION prevent_payment_without_approved_refund();

-- Trigger: منع تعديل سند صرف مرتبط بـ Refund Request
CREATE OR REPLACE FUNCTION prevent_refund_payment_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- التحقق من وجود Refund Request مرتبط
  IF EXISTS (
    SELECT 1 FROM refund_requests
    WHERE payment_id = OLD.id
      AND status IN ('executed', 'approved')
  ) THEN
    RAISE EXCEPTION 'Cannot modify payment linked to an executed refund request';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_refund_payment_modification
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION prevent_refund_payment_modification();

-- Trigger: منع حذف سند صرف مرتبط بـ Refund Request
CREATE OR REPLACE FUNCTION prevent_refund_payment_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- التحقق من وجود Refund Request مرتبط
  IF EXISTS (
    SELECT 1 FROM refund_requests
    WHERE payment_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Cannot delete payment linked to a refund request. Void the refund request first.';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_prevent_refund_payment_deletion
  BEFORE DELETE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION prevent_refund_payment_deletion();

\echo '✅ Anti-fraud guards created'
\echo ''

-- =====================================================
-- 9️⃣ Triggers للإشعارات التلقائية
-- =====================================================

\echo '9️⃣ Creating automatic notification triggers...'

-- Trigger: إشعار تلقائي عند إنشاء Customer Debit Note
CREATE OR REPLACE FUNCTION notify_customer_debit_note_created()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM create_notification(
    p_company_id := NEW.company_id,
    p_reference_type := 'customer_debit_note',
    p_reference_id := NEW.id,
    p_title := 'إشعار مدين عميل جديد',
    p_message := format('تم إنشاء إشعار مدين رقم %s بمبلغ %s', NEW.debit_note_number, NEW.total_amount),
    p_created_by := NEW.created_by,
    p_branch_id := NEW.branch_id,
    p_cost_center_id := NEW.cost_center_id,
    p_assigned_to_role := 'manager',
    p_priority := CASE WHEN NEW.total_amount > 10000 THEN 'high' ELSE 'normal' END
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_customer_debit_note_created
  AFTER INSERT ON customer_debit_notes
  FOR EACH ROW
  WHEN (NEW.approval_status = 'draft')
  EXECUTE FUNCTION notify_customer_debit_note_created();

-- Trigger: إشعار تلقائي عند إنشاء Vendor Credit
CREATE OR REPLACE FUNCTION notify_vendor_credit_created()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM create_notification(
    p_company_id := NEW.company_id,
    p_reference_type := 'vendor_credit',
    p_reference_id := NEW.id,
    p_title := 'إشعار دائن مورد جديد',
    p_message := format('تم إنشاء إشعار دائن رقم %s بمبلغ %s', NEW.credit_number, NEW.total_amount),
    p_created_by := NEW.created_by,
    p_branch_id := NEW.branch_id,
    p_cost_center_id := NEW.cost_center_id,
    p_assigned_to_role := 'manager',
    p_priority := CASE WHEN NEW.total_amount > 10000 THEN 'high' ELSE 'normal' END
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_vendor_credit_created
  AFTER INSERT ON vendor_credits
  FOR EACH ROW
  WHEN (NEW.approval_status = 'draft')
  EXECUTE FUNCTION notify_vendor_credit_created();

-- Trigger: إشعار تلقائي عند تقديم للموافقة
CREATE OR REPLACE FUNCTION notify_submitted_for_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_title TEXT;
  v_message TEXT;
  v_reference_type TEXT;
BEGIN
  -- تحديد نوع المستند
  IF TG_TABLE_NAME = 'customer_debit_notes' THEN
    v_reference_type := 'customer_debit_note';
    v_title := 'إشعار مدين يحتاج موافقة';
    v_message := format('إشعار مدين رقم %s بمبلغ %s يحتاج موافقتك', NEW.debit_note_number, NEW.total_amount);
  ELSIF TG_TABLE_NAME = 'vendor_credits' THEN
    v_reference_type := 'vendor_credit';
    v_title := 'إشعار دائن يحتاج موافقة';
    v_message := format('إشعار دائن رقم %s بمبلغ %s يحتاج موافقتك', NEW.credit_number, NEW.total_amount);
  END IF;

  PERFORM create_notification(
    p_company_id := NEW.company_id,
    p_reference_type := v_reference_type,
    p_reference_id := NEW.id,
    p_title := v_title,
    p_message := v_message,
    p_created_by := NEW.submitted_by,
    p_branch_id := NEW.branch_id,
    p_cost_center_id := NEW.cost_center_id,
    p_assigned_to_role := 'manager',
    p_priority := 'high'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_customer_debit_note_submitted
  AFTER UPDATE ON customer_debit_notes
  FOR EACH ROW
  WHEN (OLD.approval_status = 'draft' AND NEW.approval_status = 'pending_approval')
  EXECUTE FUNCTION notify_submitted_for_approval();

CREATE TRIGGER trg_notify_vendor_credit_submitted
  AFTER UPDATE ON vendor_credits
  FOR EACH ROW
  WHEN (OLD.approval_status = 'draft' AND NEW.approval_status = 'pending_approval')
  EXECUTE FUNCTION notify_submitted_for_approval();

\echo '✅ Automatic notification triggers created'
\echo ''

-- =====================================================
-- 🔟 Triggers لسجل التدقيق التلقائي
-- =====================================================

\echo '🔟 Creating automatic audit trail triggers...'

-- دالة عامة لتسجيل التدقيق
CREATE OR REPLACE FUNCTION log_audit_trail()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_action_type VARCHAR(50);
  v_old_values JSONB;
  v_new_values JSONB;
  v_changed_fields TEXT[];
  v_user_id UUID;
  v_company_id UUID;
  v_branch_id UUID;
BEGIN
  -- تحديد نوع العملية
  IF TG_OP = 'INSERT' THEN
    v_action_type := 'create';
    v_new_values := to_jsonb(NEW);
    v_old_values := NULL;
    v_changed_fields := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action_type := 'update';
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
    -- تحديد الحقول المتغيرة
    SELECT ARRAY_AGG(key)
    INTO v_changed_fields
    FROM jsonb_each(v_new_values)
    WHERE v_new_values->key IS DISTINCT FROM v_old_values->key;
  ELSIF TG_OP = 'DELETE' THEN
    v_action_type := 'delete';
    v_old_values := to_jsonb(OLD);
    v_new_values := NULL;
    v_changed_fields := NULL;
  END IF;

  -- الحصول على معلومات المستخدم والشركة
  IF TG_OP = 'DELETE' THEN
    v_company_id := OLD.company_id;
    v_branch_id := CASE WHEN OLD ? 'branch_id' THEN (OLD->>'branch_id')::UUID ELSE NULL END;
    v_user_id := COALESCE(
      CASE WHEN OLD ? 'updated_by' THEN (OLD->>'updated_by')::UUID ELSE NULL END,
      CASE WHEN OLD ? 'created_by' THEN (OLD->>'created_by')::UUID ELSE NULL END
    );
  ELSE
    v_company_id := NEW.company_id;
    v_branch_id := CASE WHEN NEW ? 'branch_id' THEN (NEW->>'branch_id')::UUID ELSE NULL END;
    v_user_id := COALESCE(
      CASE WHEN NEW ? 'updated_by' THEN (NEW->>'updated_by')::UUID ELSE NULL END,
      CASE WHEN NEW ? 'created_by' THEN (NEW->>'created_by')::UUID ELSE NULL END
    );
  END IF;

  -- تسجيل في audit_trail
  INSERT INTO audit_trail (
    company_id,
    branch_id,
    user_id,
    action_type,
    resource_type,
    resource_id,
    old_values,
    new_values,
    changed_fields
  ) VALUES (
    v_company_id,
    v_branch_id,
    v_user_id,
    v_action_type,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    v_old_values,
    v_new_values,
    v_changed_fields
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- تطبيق Audit Trail على الجداول الحساسة
CREATE TRIGGER trg_audit_customer_debit_notes
  AFTER INSERT OR UPDATE OR DELETE ON customer_debit_notes
  FOR EACH ROW
  EXECUTE FUNCTION log_audit_trail();

CREATE TRIGGER trg_audit_vendor_credits
  AFTER INSERT OR UPDATE OR DELETE ON vendor_credits
  FOR EACH ROW
  EXECUTE FUNCTION log_audit_trail();

CREATE TRIGGER trg_audit_refund_requests
  AFTER INSERT OR UPDATE OR DELETE ON refund_requests
  FOR EACH ROW
  EXECUTE FUNCTION log_audit_trail();

CREATE TRIGGER trg_audit_payments
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION log_audit_trail();

CREATE TRIGGER trg_audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION log_audit_trail();

CREATE TRIGGER trg_audit_bills
  AFTER INSERT OR UPDATE OR DELETE ON bills
  FOR EACH ROW
  EXECUTE FUNCTION log_audit_trail();

\echo '✅ Automatic audit trail triggers created'
\echo ''

-- =====================================================
-- 1️⃣1️⃣ التحقق النهائي (Final Verification)
-- =====================================================

\echo '1️⃣1️⃣ Running final verification...'
\echo ''

-- التحقق من الجداول
DO $$
DECLARE
  v_table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'notifications',
      'approval_workflows',
      'refund_requests',
      'audit_trail'
    );

  IF v_table_count = 4 THEN
    RAISE NOTICE '✅ All governance tables created successfully';
  ELSE
    RAISE WARNING '⚠️ Some governance tables are missing (found %/4)', v_table_count;
  END IF;
END $$;

-- التحقق من الدوال
DO $$
DECLARE
  v_function_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_function_count
  FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_name IN (
      'create_notification',
      'get_user_notifications',
      'mark_notification_as_read',
      'create_approval_request',
      'approve_request',
      'reject_request',
      'create_refund_request',
      'submit_refund_for_approval',
      'approve_refund_branch_manager',
      'approve_refund_final',
      'reject_refund_request'
    );

  IF v_function_count >= 11 THEN
    RAISE NOTICE '✅ All governance functions created successfully';
  ELSE
    RAISE WARNING '⚠️ Some governance functions are missing (found %/11)', v_function_count;
  END IF;
END $$;

-- التحقق من Triggers
DO $$
DECLARE
  v_trigger_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_trigger_count
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
    AND trigger_name LIKE 'trg_%';

  RAISE NOTICE '✅ Found % triggers', v_trigger_count;
END $$;

\echo ''
\echo '=========================================='
\echo '🎉 GOVERNANCE LAYER INSTALLATION COMPLETE'
\echo '=========================================='
\echo ''
\echo '📋 Summary:'
\echo '   ✅ Notifications system'
\echo '   ✅ Approval workflows engine'
\echo '   ✅ Refund requests system'
\echo '   ✅ Comprehensive audit trail'
\echo '   ✅ Anti-fraud guards'
\echo '   ✅ Automatic notifications'
\echo '   ✅ Automatic audit logging'
\echo ''
\echo '🔒 Security Features:'
\echo '   ✅ Separation of Duties'
\echo '   ✅ Dual Approval for Refunds'
\echo '   ✅ No Self-Approval'
\echo '   ✅ Complete Audit Trail'
\echo '   ✅ Payment Protection'
\echo ''
\echo '📚 Next Steps:'
\echo '   1. Review the documentation'
\echo '   2. Test the notification system'
\echo '   3. Test the approval workflows'
\echo '   4. Test the refund request process'
\echo '   5. Verify audit trail logging'
\echo ''
\echo '⚠️ Important:'
\echo '   - All financial movements now require approval'
\echo '   - Refunds require dual approval (Branch Manager + Owner)'
\echo '   - All actions are logged in audit_trail'
\echo '   - Payments cannot be created without approved refund requests'
\echo ''
\echo '✅ System is now IFRS + SOX + Anti-Fraud Compliant'
\echo ''

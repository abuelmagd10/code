# 📋 تقرير التصميم المعماري لتحسينات دورة المشتريات
## Purchase Cycle Enhancements - Architectural Design Report

**التاريخ:** 2024  
**الإصدار:** 1.0  
**الحالة:** ✅ تحليل معماري كامل - جاهز للتنفيذ

---

## 📊 ملخص تنفيذي

هذا التقرير يقدم تحليلاً معماريًا شاملاً لثلاث تحسينات رئيسية لدورة المشتريات:

1. **Purchase Requests (طلبات الشراء)** - إضافة مرحلة تخطيط قبل أوامر الشراء
2. **Goods Receipt (GRN)** - مستند مستقل لاستلام البضاعة
3. **Three-Way Matching** - مطابقة تلقائية بين PO/GRN/Invoice

**الهدف:** رفع النظام من مستوى **Advanced ERP Core** إلى **Enterprise ERP** كامل.

---

## 1️⃣ Purchase Requests (طلبات الشراء)

### 1.1 الوضع الحالي

**المشكلة:**
- النظام الحالي يبدأ دورة المشتريات مباشرة من `purchase_orders`
- لا توجد مرحلة تخطيط أو طلب داخلي قبل إنشاء أمر الشراء
- الموافقات تتم على أوامر الشراء مباشرة

**الدورة الحالية:**
```
Purchase Order (draft/pending_approval)
    ↓
Approval
    ↓
Purchase Order (approved/sent)
    ↓
Bill
    ↓
Payment
```

### 1.2 التصميم المقترح

**الدورة الجديدة:**
```
Purchase Request (draft)
    ↓
Purchase Request (submitted) → Approval Workflow
    ↓
Purchase Request (approved)
    ↓
Convert to Purchase Order
    ↓
Purchase Order (draft/sent)
    ↓
Goods Receipt
    ↓
Bill
    ↓
Payment
```

### 1.3 التغييرات في قاعدة البيانات

#### أ) جدول `purchase_requests`

```sql
CREATE TABLE purchase_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Basic Info
  request_number TEXT NOT NULL UNIQUE,
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  required_date DATE,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  
  -- Status & Approval
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 
    'submitted', 
    'pending_approval', 
    'approved', 
    'rejected', 
    'converted_to_po',
    'cancelled'
  )),
  approval_status TEXT DEFAULT 'pending',
  
  -- Requester Info
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  
  -- Financial Estimates
  total_estimated_cost NUMERIC(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'EGP',
  exchange_rate NUMERIC(12,6) DEFAULT 1,
  
  -- Governance
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  
  -- Approval Tracking
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Conversion Tracking
  converted_to_po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  converted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT check_governance_scope CHECK (
    check_governance_scope_func(company_id, branch_id, cost_center_id, warehouse_id)
  )
);

-- Indexes
CREATE INDEX idx_purchase_requests_company ON purchase_requests(company_id);
CREATE INDEX idx_purchase_requests_status ON purchase_requests(status);
CREATE INDEX idx_purchase_requests_requested_by ON purchase_requests(requested_by);
CREATE INDEX idx_purchase_requests_date ON purchase_requests(request_date);
CREATE INDEX idx_purchase_requests_po ON purchase_requests(converted_to_po_id);
CREATE INDEX idx_purchase_requests_governance ON purchase_requests(company_id, branch_id, cost_center_id, warehouse_id);
```

#### ب) جدول `purchase_request_items`

```sql
CREATE TABLE purchase_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  
  -- Product Info
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  description TEXT,
  
  -- Quantities
  quantity_requested NUMERIC(12,2) NOT NULL DEFAULT 1,
  quantity_approved NUMERIC(12,2) DEFAULT 0,
  
  -- Pricing (Estimates)
  estimated_unit_price NUMERIC(12,2) DEFAULT 0,
  estimated_total NUMERIC(12,2) DEFAULT 0,
  
  -- Item Type
  item_type TEXT DEFAULT 'product' CHECK (item_type IN ('product', 'service')),
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CHECK (quantity_requested > 0),
  CHECK (quantity_approved >= 0),
  CHECK (quantity_approved <= quantity_requested)
);

-- Indexes
CREATE INDEX idx_purchase_request_items_request ON purchase_request_items(purchase_request_id);
CREATE INDEX idx_purchase_request_items_product ON purchase_request_items(product_id);
```

#### ج) RLS Policies

```sql
-- Enable RLS
ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_request_items ENABLE ROW LEVEL SECURITY;

-- Purchase Requests Policies
CREATE POLICY "purchase_requests_select" ON purchase_requests FOR SELECT
  USING (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "purchase_requests_insert" ON purchase_requests FOR INSERT
  WITH CHECK (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "purchase_requests_update" ON purchase_requests FOR UPDATE
  USING (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "purchase_requests_delete" ON purchase_requests FOR DELETE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
    AND status = 'draft' -- Only allow deletion of draft requests
  );

-- Purchase Request Items Policies (via purchase_request)
CREATE POLICY "purchase_request_items_select" ON purchase_request_items FOR SELECT
  USING (purchase_request_id IN (
    SELECT id FROM purchase_requests WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "purchase_request_items_insert" ON purchase_request_items FOR INSERT
  WITH CHECK (purchase_request_id IN (
    SELECT id FROM purchase_requests WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "purchase_request_items_update" ON purchase_request_items FOR UPDATE
  USING (purchase_request_id IN (
    SELECT id FROM purchase_requests WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "purchase_request_items_delete" ON purchase_request_items FOR DELETE
  USING (purchase_request_id IN (
    SELECT id FROM purchase_requests WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
    AND status = 'draft' -- Only allow deletion if request is draft
  ));
```

#### د) Auto-Number Trigger

```sql
CREATE OR REPLACE FUNCTION auto_generate_purchase_request_number()
RETURNS TRIGGER AS $$
DECLARE
  v_company_prefix TEXT;
  v_next_number INTEGER;
  v_new_number TEXT;
BEGIN
  -- Get company prefix
  SELECT COALESCE(settings->>'purchase_request_prefix', 'PR-')
  INTO v_company_prefix
  FROM companies
  WHERE id = NEW.company_id;
  
  -- Get next number
  SELECT COALESCE(MAX(CAST(SUBSTRING(request_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
  INTO v_next_number
  FROM purchase_requests
  WHERE company_id = NEW.company_id
    AND request_number ~ ('^' || v_company_prefix || '[0-9]+$');
  
  -- Generate number
  v_new_number := v_company_prefix || LPAD(v_next_number::TEXT, 6, '0');
  
  NEW.request_number := v_new_number;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_generate_purchase_request_number
  BEFORE INSERT ON purchase_requests
  FOR EACH ROW
  WHEN (NEW.request_number IS NULL OR NEW.request_number = '')
  EXECUTE FUNCTION auto_generate_purchase_request_number();
```

### 1.4 التكامل مع نظام الموافقات

#### أ) ربط مع `approval_workflows`

```sql
-- Add purchase_request to approval_workflows document_type
-- (Already supports 'purchase_order', 'bill', etc.)

-- Create default workflow for purchase requests
INSERT INTO approval_workflows (company_id, document_type, name, is_active)
SELECT 
  id,
  'purchase_request',
  'Default Purchase Request Workflow',
  true
FROM companies
WHERE NOT EXISTS (
  SELECT 1 FROM approval_workflows 
  WHERE document_type = 'purchase_request' 
  AND company_id = companies.id
);

-- Create approval steps (example: Manager → Admin → Owner)
INSERT INTO approval_steps (workflow_id, step_order, role_required)
SELECT 
  wf.id,
  1,
  'manager'
FROM approval_workflows wf
WHERE wf.document_type = 'purchase_request'
  AND NOT EXISTS (
    SELECT 1 FROM approval_steps 
    WHERE workflow_id = wf.id AND step_order = 1
  );

INSERT INTO approval_steps (workflow_id, step_order, role_required)
SELECT 
  wf.id,
  2,
  'admin'
FROM approval_workflows wf
WHERE wf.document_type = 'purchase_request'
  AND NOT EXISTS (
    SELECT 1 FROM approval_steps 
    WHERE workflow_id = wf.id AND step_order = 2
  );
```

#### ب) RPC Function للتحويل إلى Purchase Order

```sql
CREATE OR REPLACE FUNCTION convert_purchase_request_to_po(
  p_request_id UUID,
  p_user_id UUID,
  p_company_id UUID,
  p_supplier_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request RECORD;
  v_user_role TEXT;
  v_user_branch UUID;
  v_po_id UUID;
  v_po_number TEXT;
  v_item RECORD;
  v_result JSONB;
BEGIN
  -- 1. Validate user
  SELECT role, branch_id INTO v_user_role, v_user_branch
  FROM company_members
  WHERE company_id = p_company_id AND user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not a member of this company');
  END IF;
  
  -- 2. Fetch and lock request
  SELECT * INTO v_request
  FROM purchase_requests
  WHERE id = p_request_id 
    AND company_id = p_company_id
    AND status = 'approved'
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Purchase request not found or not approved');
  END IF;
  
  -- 3. Branch isolation check
  IF v_user_branch IS NOT NULL AND v_request.branch_id IS NOT NULL 
     AND v_user_branch != v_request.branch_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Branch isolation violation');
  END IF;
  
  -- 4. Create Purchase Order
  INSERT INTO purchase_orders (
    company_id,
    supplier_id,
    po_date,
    due_date,
    status,
    currency,
    exchange_rate,
    branch_id,
    cost_center_id,
    warehouse_id,
    notes,
    created_by_user_id
  )
  VALUES (
    p_company_id,
    p_supplier_id,
    CURRENT_DATE,
    v_request.required_date,
    'draft',
    v_request.currency,
    v_request.exchange_rate,
    v_request.branch_id,
    v_request.cost_center_id,
    v_request.warehouse_id,
    v_request.notes,
    p_user_id
  )
  RETURNING id, po_number INTO v_po_id, v_po_number;
  
  -- 5. Create Purchase Order Items from Request Items
  FOR v_item IN 
    SELECT * FROM purchase_request_items
    WHERE purchase_request_id = p_request_id
      AND quantity_approved > 0
  LOOP
    INSERT INTO purchase_order_items (
      purchase_order_id,
      product_id,
      description,
      quantity,
      unit_price,
      item_type
    )
    VALUES (
      v_po_id,
      v_item.product_id,
      v_item.description,
      v_item.quantity_approved,
      v_item.estimated_unit_price,
      v_item.item_type
    );
  END LOOP;
  
  -- 6. Update request status
  UPDATE purchase_requests
  SET 
    status = 'converted_to_po',
    converted_to_po_id = v_po_id,
    converted_at = NOW(),
    converted_by = p_user_id,
    updated_at = NOW()
  WHERE id = p_request_id;
  
  -- 7. Audit log
  INSERT INTO audit_logs (
    company_id, user_id, action, entity_type, entity_id,
    old_values, new_values, created_at
  )
  VALUES (
    p_company_id, p_user_id, 'purchase_request_converted', 'purchase_request', p_request_id,
    jsonb_build_object('status', 'approved'),
    jsonb_build_object('status', 'converted_to_po', 'po_id', v_po_id),
    NOW()
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'po_id', v_po_id,
    'po_number', v_po_number,
    'request_id', p_request_id
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
```

### 1.5 التعديلات المطلوبة في الكود

#### أ) Frontend - New Purchase Request Page

**الملف:** `app/purchase-requests/new/page.tsx`

```typescript
// Similar structure to app/purchase-orders/new/page.tsx
// Key differences:
// - No supplier selection (supplier chosen during conversion)
// - Estimated prices instead of actual prices
// - Priority field
// - Department field
// - Submit for approval workflow
```

#### ب) Frontend - Purchase Request List

**الملف:** `app/purchase-requests/page.tsx`

```typescript
// Display all purchase requests
// Filter by status, priority, department
// Actions: Edit (draft only), Submit, Approve/Reject, Convert to PO
```

#### ج) Frontend - Purchase Request Detail

**الملف:** `app/purchase-requests/[id]/page.tsx`

```typescript
// Display request details
// Show approval workflow status
// "Convert to Purchase Order" button (if approved)
// Link to created PO if converted
```

#### د) Backend API

**الملف:** `app/api/purchase-requests/route.ts`

```typescript
// GET: List purchase requests (with governance filters)
// POST: Create new purchase request
// PUT: Update purchase request (draft only)
// DELETE: Delete purchase request (draft only)
```

**الملف:** `app/api/purchase-requests/[id]/convert/route.ts`

```typescript
// POST: Convert approved request to PO
// Calls: convert_purchase_request_to_po RPC
```

#### هـ) Notification Helpers

**الملف:** `lib/notification-helpers.ts` (إضافة)

```typescript
export async function notifyPurchaseRequestApprovalRequest(params: {
  companyId: string
  requestId: string
  requestNumber: string
  amount: number
  currency: string
  branchId?: string
  createdBy: string
  appLang?: 'ar' | 'en'
}) {
  // Similar to notifyPOApprovalRequest
}

export async function notifyPurchaseRequestApproved(params: {...}) {
  // Notify requester
}

export async function notifyPurchaseRequestRejected(params: {...}) {
  // Notify requester with reason
}

export async function notifyPurchaseRequestConverted(params: {
  companyId: string
  requestId: string
  requestNumber: string
  poId: string
  poNumber: string
  createdBy: string
  appLang?: 'ar' | 'en'
}) {
  // Notify requester that request was converted to PO
}
```

### 1.6 الصلاحيات (RBAC)

**الملف:** `lib/validation.ts` (إضافة)

```typescript
export const PURCHASE_REQUEST_ROLE_PERMISSIONS = {
  staff: {
    canCreate: true,
    canEditDraft: true,
    canSubmit: true,
    canViewAll: false,
    canApprove: false,
    canConvert: false
  },
  supervisor: {
    canCreate: true,
    canEditDraft: true,
    canSubmit: true,
    canViewAll: true,
    canApprove: false,
    canConvert: false
  },
  manager: {
    canCreate: true,
    canEditDraft: true,
    canSubmit: true,
    canViewAll: true,
    canApprove: true, // First level
    canConvert: false
  },
  accountant: {
    canCreate: true,
    canEditDraft: true,
    canSubmit: true,
    canViewAll: true,
    canApprove: false,
    canConvert: true // Can convert approved requests to PO
  },
  admin: {
    canCreate: true,
    canEditDraft: true,
    canSubmit: true,
    canViewAll: true,
    canApprove: true, // Second level
    canConvert: true
  },
  owner: {
    canCreate: true,
    canEditDraft: true,
    canSubmit: true,
    canViewAll: true,
    canApprove: true, // Final level
    canConvert: true
  }
}
```

### 1.7 التأثير على النظام الحالي

**✅ لا يوجد تأثير سلبي:**
- Purchase Requests هي **طبقة إضافية** قبل Purchase Orders
- النظام الحالي يستمر في العمل كما هو
- يمكن إنشاء Purchase Orders مباشرة (بدون Request) إذا لزم الأمر
- التحويل من Request إلى PO **اختياري**

**🔄 التغييرات الطفيفة:**
- إضافة رابط من `purchase_orders` إلى `purchase_requests` (إذا تم التحويل)
- إضافة خيار في UI: "Create from Request" عند إنشاء PO جديد

---

## 2️⃣ Goods Receipt (GRN) - إيصال استلام البضاعة

### 2.1 الوضع الحالي

**المشكلة:**
- الاستلام يتم تسجيله داخل `purchase_orders` مباشرة
- لا يوجد مستند مستقل لإيصال الاستلام
- الاستلام مرتبط بـ `bills` فقط (في `app/inventory/goods-receipt/page.tsx`)
- لا يوجد فصل واضح بين:
  - الكمية المطلوبة (PO)
  - الكمية المستلمة (GRN)
  - الكمية المفوترة (Bill)

**الدورة الحالية:**
```
Purchase Order
    ↓
Bill (draft)
    ↓
Goods Receipt (via bills page) → Inventory Transaction
    ↓
Bill (received)
    ↓
Bill (paid)
```

### 2.2 التصميم المقترح

**الدورة الجديدة:**
```
Purchase Order (sent)
    ↓
Goods Receipt (draft) ← Create from PO
    ↓
Goods Receipt (received) → Inventory Transaction
    ↓
Bill (draft) ← Link to GRN
    ↓
Bill (received/paid)
```

**الفوائد:**
- ✅ فصل واضح بين الاستلام والفاتورة
- ✅ دعم الاستلام الجزئي
- ✅ تتبع الكميات المستلمة مقابل المطلوبة
- ✅ تسجيل الرفض والأسباب
- ✅ دعم 3-Way Matching

### 2.3 التغييرات في قاعدة البيانات

#### أ) جدول `goods_receipts`

```sql
CREATE TABLE goods_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Basic Info
  grn_number TEXT NOT NULL UNIQUE,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Links
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft',
    'received',
    'partially_received',
    'rejected',
    'cancelled'
  )),
  
  -- Receipt Info
  received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ,
  
  -- Rejection Info
  rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Governance
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  
  -- Totals (calculated from items)
  total_quantity_received NUMERIC(12,2) DEFAULT 0,
  total_quantity_accepted NUMERIC(12,2) DEFAULT 0,
  total_quantity_rejected NUMERIC(12,2) DEFAULT 0,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT check_governance_scope CHECK (
    check_governance_scope_func(company_id, branch_id, cost_center_id, warehouse_id)
  ),
  CONSTRAINT check_grn_warehouse CHECK (
    warehouse_id IS NOT NULL
  )
);

-- Indexes
CREATE INDEX idx_goods_receipts_company ON goods_receipts(company_id);
CREATE INDEX idx_goods_receipts_po ON goods_receipts(purchase_order_id);
CREATE INDEX idx_goods_receipts_bill ON goods_receipts(bill_id);
CREATE INDEX idx_goods_receipts_status ON goods_receipts(status);
CREATE INDEX idx_goods_receipts_date ON goods_receipts(receipt_date);
CREATE INDEX idx_goods_receipts_warehouse ON goods_receipts(warehouse_id);
CREATE INDEX idx_goods_receipts_governance ON goods_receipts(company_id, branch_id, cost_center_id, warehouse_id);
```

#### ب) جدول `goods_receipt_items`

```sql
CREATE TABLE goods_receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  
  -- Links
  purchase_order_item_id UUID REFERENCES purchase_order_items(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  
  -- Quantities
  quantity_ordered NUMERIC(12,2) NOT NULL DEFAULT 0, -- From PO
  quantity_received NUMERIC(12,2) NOT NULL DEFAULT 0, -- Actual received
  quantity_accepted NUMERIC(12,2) DEFAULT 0, -- Accepted (good quality)
  quantity_rejected NUMERIC(12,2) DEFAULT 0, -- Rejected (damaged/wrong)
  
  -- Pricing (from PO or Bill)
  unit_price NUMERIC(12,2) DEFAULT 0,
  line_total NUMERIC(12,2) DEFAULT 0,
  
  -- Rejection Details
  rejection_reason TEXT,
  
  -- Item Type
  item_type TEXT DEFAULT 'product' CHECK (item_type IN ('product', 'service')),
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CHECK (quantity_received >= 0),
  CHECK (quantity_accepted >= 0),
  CHECK (quantity_rejected >= 0),
  CHECK (quantity_received = quantity_accepted + quantity_rejected),
  CHECK (quantity_received <= quantity_ordered * 1.1) -- Allow 10% over-receipt tolerance
);

-- Indexes
CREATE INDEX idx_goods_receipt_items_grn ON goods_receipt_items(goods_receipt_id);
CREATE INDEX idx_goods_receipt_items_po_item ON goods_receipt_items(purchase_order_item_id);
CREATE INDEX idx_goods_receipt_items_product ON goods_receipt_items(product_id);
```

#### ج) تحديث `purchase_orders` و `bills`

```sql
-- Add goods_receipt_id to purchase_orders (optional - for tracking)
ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS goods_receipt_id UUID REFERENCES goods_receipts(id) ON DELETE SET NULL;

-- Add goods_receipt_id to bills (for 3-way matching)
ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS goods_receipt_id UUID REFERENCES goods_receipts(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_purchase_orders_grn ON purchase_orders(goods_receipt_id);
CREATE INDEX IF NOT EXISTS idx_bills_grn ON bills(goods_receipt_id);
```

#### د) RLS Policies

```sql
-- Enable RLS
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt_items ENABLE ROW LEVEL SECURITY;

-- Goods Receipts Policies
CREATE POLICY "goods_receipts_select" ON goods_receipts FOR SELECT
  USING (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "goods_receipts_insert" ON goods_receipts FOR INSERT
  WITH CHECK (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "goods_receipts_update" ON goods_receipts FOR UPDATE
  USING (company_id IN (
    SELECT id FROM companies WHERE user_id = auth.uid()
    UNION
    SELECT company_id FROM company_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "goods_receipts_delete" ON goods_receipts FOR DELETE
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
    AND status = 'draft' -- Only allow deletion of draft receipts
  );

-- Goods Receipt Items Policies (via goods_receipt)
CREATE POLICY "goods_receipt_items_select" ON goods_receipt_items FOR SELECT
  USING (goods_receipt_id IN (
    SELECT id FROM goods_receipts WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "goods_receipt_items_insert" ON goods_receipt_items FOR INSERT
  WITH CHECK (goods_receipt_id IN (
    SELECT id FROM goods_receipts WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "goods_receipt_items_update" ON goods_receipt_items FOR UPDATE
  USING (goods_receipt_id IN (
    SELECT id FROM goods_receipts WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "goods_receipt_items_delete" ON goods_receipt_items FOR DELETE
  USING (goods_receipt_id IN (
    SELECT id FROM goods_receipts WHERE company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
      UNION
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
    AND status = 'draft' -- Only allow deletion if receipt is draft
  ));
```

#### هـ) Auto-Number Trigger

```sql
CREATE OR REPLACE FUNCTION auto_generate_grn_number()
RETURNS TRIGGER AS $$
DECLARE
  v_company_prefix TEXT;
  v_next_number INTEGER;
  v_new_number TEXT;
BEGIN
  -- Get company prefix
  SELECT COALESCE(settings->>'grn_prefix', 'GRN-')
  INTO v_company_prefix
  FROM companies
  WHERE id = NEW.company_id;
  
  -- Get next number
  SELECT COALESCE(MAX(CAST(SUBSTRING(grn_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
  INTO v_next_number
  FROM goods_receipts
  WHERE company_id = NEW.company_id
    AND grn_number ~ ('^' || v_company_prefix || '[0-9]+$');
  
  -- Generate number
  v_new_number := v_company_prefix || LPAD(v_next_number::TEXT, 6, '0');
  
  NEW.grn_number := v_new_number;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_generate_grn_number
  BEFORE INSERT ON goods_receipts
  FOR EACH ROW
  WHEN (NEW.grn_number IS NULL OR NEW.grn_number = '')
  EXECUTE FUNCTION auto_generate_grn_number();
```

### 2.4 RPC Function لإنشاء Inventory Transactions

```sql
CREATE OR REPLACE FUNCTION process_goods_receipt_atomic(
  p_grn_id UUID,
  p_user_id UUID,
  p_company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_grn RECORD;
  v_user_role TEXT;
  v_item RECORD;
  v_inventory_tx_id UUID;
  v_result JSONB;
BEGIN
  -- 1. Validate user
  SELECT role INTO v_user_role
  FROM company_members
  WHERE company_id = p_company_id AND user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not a member of this company');
  END IF;
  
  -- 2. Fetch and lock GRN
  SELECT * INTO v_grn
  FROM goods_receipts
  WHERE id = p_grn_id 
    AND company_id = p_company_id
    AND status = 'draft'
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'GRN not found or not in draft status');
  END IF;
  
  -- 3. Validate warehouse
  IF v_grn.warehouse_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Warehouse is required');
  END IF;
  
  -- 4. Process each item and create inventory transactions
  FOR v_item IN 
    SELECT * FROM goods_receipt_items
    WHERE goods_receipt_id = p_grn_id
      AND quantity_accepted > 0
      AND item_type = 'product' -- Only products, not services
  LOOP
    -- Create inventory transaction
    INSERT INTO inventory_transactions (
      company_id,
      branch_id,
      warehouse_id,
      cost_center_id,
      product_id,
      transaction_type,
      quantity_change,
      reference_id,
      reference_type,
      notes,
      transaction_date
    )
    VALUES (
      p_company_id,
      v_grn.branch_id,
      v_grn.warehouse_id,
      v_grn.cost_center_id,
      v_item.product_id,
      'purchase',
      v_item.quantity_accepted, -- Only accepted quantity
      p_grn_id,
      'goods_receipt',
      'Goods receipt ' || v_grn.grn_number,
      v_grn.receipt_date
    )
    RETURNING id INTO v_inventory_tx_id;
  END LOOP;
  
  -- 5. Update GRN status
  UPDATE goods_receipts
  SET 
    status = CASE 
      WHEN total_quantity_rejected > 0 THEN 'partially_received'
      ELSE 'received'
    END,
    received_by = p_user_id,
    received_at = NOW(),
    updated_at = NOW()
  WHERE id = p_grn_id;
  
  -- 6. Update PO status (if linked)
  IF v_grn.purchase_order_id IS NOT NULL THEN
    UPDATE purchase_orders
    SET status = CASE 
      WHEN EXISTS (
        SELECT 1 FROM goods_receipt_items gri
        JOIN purchase_order_items poi ON gri.purchase_order_item_id = poi.id
        WHERE gri.goods_receipt_id = p_grn_id
          AND poi.quantity > gri.quantity_accepted
      ) THEN 'partially_received'
      ELSE 'received'
    END,
    updated_at = NOW()
    WHERE id = v_grn.purchase_order_id;
  END IF;
  
  -- 7. Audit log
  INSERT INTO audit_logs (
    company_id, user_id, action, entity_type, entity_id,
    old_values, new_values, created_at
  )
  VALUES (
    p_company_id, p_user_id, 'goods_receipt_processed', 'goods_receipt', p_grn_id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object('status', CASE WHEN v_grn.total_quantity_rejected > 0 THEN 'partially_received' ELSE 'received' END),
    NOW()
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'grn_id', p_grn_id,
    'status', CASE WHEN v_grn.total_quantity_rejected > 0 THEN 'partially_received' ELSE 'received' END
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
```

### 2.5 التعديلات المطلوبة في الكود

#### أ) Frontend - New Goods Receipt Page

**الملف:** `app/goods-receipts/new/page.tsx`

```typescript
// Create GRN from Purchase Order
// Key features:
// - Select PO
// - Auto-populate items from PO
// - Enter received quantities (can be partial)
// - Mark items as accepted/rejected
// - Enter rejection reasons
// - Select warehouse
// - Submit for processing
```

#### ب) Frontend - Goods Receipt List

**الملف:** `app/goods-receipts/page.tsx`

```typescript
// Display all goods receipts
// Filter by status, PO, warehouse, date
// Actions: View, Edit (draft only), Process, Cancel
```

#### ج) Frontend - Goods Receipt Detail

**الملف:** `app/goods-receipts/[id]/page.tsx`

```typescript
// Display GRN details
// Show linked PO and Bill
// Show inventory transactions created
// "Process Receipt" button (if draft)
// "Create Bill" button (if received and no bill linked)
```

#### د) Backend API

**الملف:** `app/api/goods-receipts/route.ts`

```typescript
// GET: List goods receipts (with governance filters)
// POST: Create new goods receipt
```

**الملف:** `app/api/goods-receipts/[id]/process/route.ts`

```typescript
// POST: Process goods receipt (create inventory transactions)
// Calls: process_goods_receipt_atomic RPC
```

#### هـ) تحديث Bills Page

**الملف:** `app/bills/new/page.tsx` (تعديل)

```typescript
// Add option to link bill to Goods Receipt
// If GRN linked, auto-populate items from GRN
// Validate quantities against GRN
```

**الملف:** `app/bills/[id]/page.tsx` (تعديل)

```typescript
// Display linked GRN
// Show matching status (3-way matching)
```

#### و) إزالة/تحديث Goods Receipt القديم

**الملف:** `app/inventory/goods-receipt/page.tsx`

**الخيارات:**
1. **إزالة كاملة** - استبدال بـ `app/goods-receipts/`
2. **إعادة توجيه** - Redirect إلى الصفحة الجديدة
3. **دمج** - دمج الوظائف في الصفحة الجديدة

**التوصية:** الخيار 1 (إزالة كاملة) بعد التأكد من أن جميع الوظائف موجودة في الصفحة الجديدة.

### 2.6 الصلاحيات (RBAC)

**الملف:** `lib/validation.ts` (إضافة)

```typescript
export const GOODS_RECEIPT_ROLE_PERMISSIONS = {
  staff: {
    canCreate: true,
    canEditDraft: true,
    canProcess: false,
    canViewAll: false,
    canReject: false
  },
  supervisor: {
    canCreate: true,
    canEditDraft: true,
    canProcess: true,
    canViewAll: true,
    canReject: true
  },
  manager: {
    canCreate: true,
    canEditDraft: true,
    canProcess: true,
    canViewAll: true,
    canReject: true
  },
  accountant: {
    canCreate: true,
    canEditDraft: true,
    canProcess: true,
    canViewAll: true,
    canReject: true
  },
  admin: {
    canCreate: true,
    canEditDraft: true,
    canProcess: true,
    canViewAll: true,
    canReject: true
  },
  owner: {
    canCreate: true,
    canEditDraft: true,
    canProcess: true,
    canViewAll: true,
    canReject: true
  }
}
```

### 2.7 التأثير على النظام الحالي

**⚠️ تأثير متوسط:**
- الصفحة الحالية `app/inventory/goods-receipt/page.tsx` تحتاج إعادة تصميم
- Bills تحتاج دعم ربط GRN
- Purchase Orders تحتاج تحديث حالة عند استلام GRN

**✅ التوافق العكسي:**
- يمكن الاستمرار في استخدام النظام القديم (bills-based receipt) مؤقتاً
- يمكن تشغيل النظامين بالتوازي أثناء الانتقال
- البيانات القديمة تبقى كما هي

---

## 3️⃣ Three-Way Matching (المطابقة الثلاثية)

### 3.1 الوضع الحالي

**المشكلة:**
- لا يوجد تحقق تلقائي من المطابقة بين:
  - الكمية المطلوبة (PO)
  - الكمية المستلمة (GRN - حالياً في bills)
  - الكمية المفوترة (Bill)
- يمكن إنشاء فاتورة بكميات أكبر من المستلمة
- لا يوجد تتبع للاختلافات

### 3.2 التصميم المقترح

**القاعدة:**
```
Bill Quantity ≤ GRN Accepted Quantity ≤ PO Ordered Quantity
```

**التحقق:**
- عند إنشاء/تعديل Bill: التحقق من الكميات مقابل GRN و PO
- منع الفواتير التي تتجاوز الكميات المستلمة
- تسجيل الاستثناءات (Exceptions) للمراجعة

### 3.3 التغييرات في قاعدة البيانات

#### أ) جدول `matching_exceptions`

```sql
CREATE TABLE matching_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Links
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  goods_receipt_id UUID REFERENCES goods_receipts(id) ON DELETE SET NULL,
  bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  
  -- Exception Details
  exception_type TEXT NOT NULL CHECK (exception_type IN (
    'quantity_mismatch',      -- Bill qty > GRN qty
    'price_mismatch',         -- Bill price ≠ PO price
    'missing_grn',            -- Bill without GRN
    'missing_po',             -- GRN without PO
    'over_receipt',           -- GRN qty > PO qty (beyond tolerance)
    'under_receipt'           -- GRN qty < PO qty (significant)
  )),
  
  -- Product Details
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  
  -- Quantities
  po_quantity NUMERIC(12,2),
  grn_quantity NUMERIC(12,2),
  bill_quantity NUMERIC(12,2),
  
  -- Prices
  po_price NUMERIC(12,2),
  bill_price NUMERIC(12,2),
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'approved', 'rejected')),
  resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  -- Metadata
  description TEXT,
  severity TEXT DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'error')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_matching_exceptions_company ON matching_exceptions(company_id);
CREATE INDEX idx_matching_exceptions_po ON matching_exceptions(purchase_order_id);
CREATE INDEX idx_matching_exceptions_grn ON matching_exceptions(goods_receipt_id);
CREATE INDEX idx_matching_exceptions_bill ON matching_exceptions(bill_id);
CREATE INDEX idx_matching_exceptions_status ON matching_exceptions(status);
CREATE INDEX idx_matching_exceptions_type ON matching_exceptions(exception_type);
```

#### ب) Function للتحقق من المطابقة

```sql
CREATE OR REPLACE FUNCTION validate_three_way_matching(
  p_bill_id UUID,
  p_company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bill RECORD;
  v_po RECORD;
  v_grn RECORD;
  v_bill_item RECORD;
  v_po_item RECORD;
  v_grn_item RECORD;
  v_exception_id UUID;
  v_exceptions JSONB := '[]'::JSONB;
  v_exception JSONB;
  v_result JSONB;
BEGIN
  -- 1. Fetch bill
  SELECT * INTO v_bill
  FROM bills
  WHERE id = p_bill_id AND company_id = p_company_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bill not found');
  END IF;
  
  -- 2. Fetch linked PO and GRN
  SELECT * INTO v_po
  FROM purchase_orders
  WHERE id = v_bill.purchase_order_id;
  
  SELECT * INTO v_grn
  FROM goods_receipts
  WHERE id = v_bill.goods_receipt_id;
  
  -- 3. Validate each bill item
  FOR v_bill_item IN 
    SELECT * FROM bill_items
    WHERE bill_id = p_bill_id
      AND product_id IS NOT NULL
  LOOP
    -- Find corresponding PO item
    SELECT * INTO v_po_item
    FROM purchase_order_items
    WHERE purchase_order_id = v_bill.purchase_order_id
      AND product_id = v_bill_item.product_id
    LIMIT 1;
    
    -- Find corresponding GRN item
    SELECT * INTO v_grn_item
    FROM goods_receipt_items
    WHERE goods_receipt_id = v_bill.goods_receipt_id
      AND product_id = v_bill_item.product_id
    LIMIT 1;
    
    -- Check 1: Bill quantity vs GRN accepted quantity
    IF v_grn_item IS NOT NULL THEN
      IF v_bill_item.quantity > v_grn_item.quantity_accepted THEN
        -- Create exception
        INSERT INTO matching_exceptions (
          company_id,
          purchase_order_id,
          goods_receipt_id,
          bill_id,
          product_id,
          exception_type,
          po_quantity,
          grn_quantity,
          bill_quantity,
          severity,
          description
        )
        VALUES (
          p_company_id,
          v_bill.purchase_order_id,
          v_bill.goods_receipt_id,
          p_bill_id,
          v_bill_item.product_id,
          'quantity_mismatch',
          COALESCE(v_po_item.quantity, 0),
          v_grn_item.quantity_accepted,
          v_bill_item.quantity,
          'error',
          'Bill quantity exceeds GRN accepted quantity'
        )
        RETURNING id INTO v_exception_id;
        
        v_exception := jsonb_build_object(
          'id', v_exception_id,
          'type', 'quantity_mismatch',
          'product_id', v_bill_item.product_id,
          'message', 'Bill quantity exceeds GRN accepted quantity'
        );
        v_exceptions := v_exceptions || v_exception;
      END IF;
    END IF;
    
    -- Check 2: Price mismatch (if PO exists)
    IF v_po_item IS NOT NULL AND v_bill_item.unit_price != v_po_item.unit_price THEN
      -- Allow small differences (0.01 tolerance)
      IF ABS(v_bill_item.unit_price - v_po_item.unit_price) > 0.01 THEN
        INSERT INTO matching_exceptions (
          company_id,
          purchase_order_id,
          goods_receipt_id,
          bill_id,
          product_id,
          exception_type,
          po_price,
          bill_price,
          severity,
          description
        )
        VALUES (
          p_company_id,
          v_bill.purchase_order_id,
          v_bill.goods_receipt_id,
          p_bill_id,
          v_bill_item.product_id,
          'price_mismatch',
          v_po_item.unit_price,
          v_bill_item.unit_price,
          'warning',
          'Bill price differs from PO price'
        )
        RETURNING id INTO v_exception_id;
        
        v_exception := jsonb_build_object(
          'id', v_exception_id,
          'type', 'price_mismatch',
          'product_id', v_bill_item.product_id,
          'message', 'Bill price differs from PO price'
        );
        v_exceptions := v_exceptions || v_exception;
      END IF;
    END IF;
  END LOOP;
  
  -- Check 3: Missing GRN
  IF v_bill.purchase_order_id IS NOT NULL AND v_bill.goods_receipt_id IS NULL THEN
    INSERT INTO matching_exceptions (
      company_id,
      purchase_order_id,
      bill_id,
      exception_type,
      severity,
      description
    )
    VALUES (
      p_company_id,
      v_bill.purchase_order_id,
      p_bill_id,
      'missing_grn',
      'warning',
      'Bill linked to PO but no GRN found'
    )
    RETURNING id INTO v_exception_id;
    
    v_exception := jsonb_build_object(
      'id', v_exception_id,
      'type', 'missing_grn',
      'message', 'Bill linked to PO but no GRN found'
    );
    v_exceptions := v_exceptions || v_exception;
  END IF;
  
  -- Return result
  RETURN jsonb_build_object(
    'success', true,
    'has_exceptions', jsonb_array_length(v_exceptions) > 0,
    'exceptions', v_exceptions,
    'exceptions_count', jsonb_array_length(v_exceptions)
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
```

#### ج) Trigger للتحقق التلقائي

```sql
CREATE OR REPLACE FUNCTION trigger_validate_bill_matching()
RETURNS TRIGGER AS $$
DECLARE
  v_validation_result JSONB;
BEGIN
  -- Only validate if bill is being created or updated
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Run validation
    SELECT validate_three_way_matching(NEW.id, NEW.company_id)
    INTO v_validation_result;
    
    -- Log validation result (don't block the operation)
    RAISE NOTICE 'Three-way matching validation: %', v_validation_result;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on bill_items (validate when items change)
CREATE TRIGGER trg_validate_bill_matching
  AFTER INSERT OR UPDATE ON bill_items
  FOR EACH ROW
  EXECUTE FUNCTION trigger_validate_bill_matching();
```

### 3.4 التعديلات المطلوبة في الكود

#### أ) Frontend - Bill Creation/Edit

**الملف:** `app/bills/new/page.tsx` (تعديل)

```typescript
// Add validation before save:
// 1. If GRN linked, validate quantities
// 2. Show warnings/errors for mismatches
// 3. Allow override with approval (for exceptions)
```

**الملف:** `app/bills/[id]/edit/page.tsx` (تعديل)

```typescript
// Same validation as new page
// Show existing exceptions
// Allow resolving exceptions
```

#### ب) Frontend - Matching Exceptions Page

**الملف:** `app/matching-exceptions/page.tsx` (جديد)

```typescript
// Display all matching exceptions
// Filter by status, type, PO, GRN, Bill
// Actions: Resolve, Approve, Reject
// Show details: PO qty, GRN qty, Bill qty
```

#### ج) Frontend - Bill Detail Page

**الملف:** `app/bills/[id]/page.tsx` (تعديل)

```typescript
// Display matching status
// Show linked PO and GRN
// Show exceptions (if any)
// Visual indicators:
//   ✅ All matched
//   ⚠️ Warnings
//   ❌ Errors
```

#### د) Backend API

**الملف:** `app/api/bills/[id]/validate-matching/route.ts` (جديد)

```typescript
// POST: Validate three-way matching for a bill
// Returns: exceptions list
```

**الملف:** `app/api/matching-exceptions/route.ts` (جديد)

```typescript
// GET: List exceptions (with filters)
// PUT: Resolve exception
```

#### هـ) Validation Helper

**الملف:** `lib/three-way-matching.ts` (جديد)

```typescript
export async function validateBillMatching(
  supabase: SupabaseClient,
  billId: string,
  companyId: string
): Promise<{
  success: boolean
  hasExceptions: boolean
  exceptions: MatchingException[]
  errors?: string[]
}>

export async function checkBillQuantities(
  supabase: SupabaseClient,
  billId: string,
  grnId: string | null
): Promise<{
  valid: boolean
  mismatches: Array<{
    productId: string
    productName: string
    billQty: number
    grnQty: number
    difference: number
  }>
}>
```

### 3.5 الصلاحيات (RBAC)

**الملف:** `lib/validation.ts` (إضافة)

```typescript
export const MATCHING_EXCEPTION_ROLE_PERMISSIONS = {
  staff: {
    canView: false,
    canResolve: false,
    canApprove: false
  },
  supervisor: {
    canView: true,
    canResolve: false,
    canApprove: false
  },
  manager: {
    canView: true,
    canResolve: true,
    canApprove: false
  },
  accountant: {
    canView: true,
    canResolve: true,
    canApprove: true
  },
  admin: {
    canView: true,
    canResolve: true,
    canApprove: true
  },
  owner: {
    canView: true,
    canResolve: true,
    canApprove: true
  }
}
```

### 3.6 التأثير على النظام الحالي

**✅ تأثير منخفض:**
- التحقق **اختياري** - لا يمنع إنشاء الفواتير
- الاستثناءات تُسجل فقط للمراجعة
- يمكن تعطيل التحقق مؤقتاً إذا لزم الأمر

**⚠️ ملاحظات:**
- الفواتير القديمة (بدون GRN) لن يتم التحقق منها
- يمكن إضافة migration script للتحقق من الفواتير القديمة لاحقاً

---

## 4️⃣ خطة التنفيذ المقترحة

### 4.1 المرحلة 1: Purchase Requests (2-3 أسابيع)

**الأولوية:** متوسطة  
**التعقيد:** متوسط

**الخطوات:**
1. ✅ إنشاء جداول قاعدة البيانات
2. ✅ إنشاء RLS Policies
3. ✅ إنشاء RPC Functions
4. ✅ Frontend: New/List/Detail Pages
5. ✅ Backend API
6. ✅ Notification System
7. ✅ RBAC Permissions
8. ✅ Testing

### 4.2 المرحلة 2: Goods Receipt (2-3 أسابيع)

**الأولوية:** عالية  
**التعقيد:** متوسط-عالي

**الخطوات:**
1. ✅ إنشاء جداول قاعدة البيانات
2. ✅ إنشاء RLS Policies
3. ✅ إنشاء RPC Functions
4. ✅ Frontend: New/List/Detail Pages
5. ✅ Backend API
6. ✅ تحديث Bills Pages
7. ✅ إزالة/تحديث الصفحة القديمة
8. ✅ Migration: ربط Bills القديمة بـ GRN (اختياري)
9. ✅ Testing

### 4.3 المرحلة 3: Three-Way Matching (1-2 أسبوع)

**الأولوية:** عالية  
**التعقيد:** منخفض-متوسط

**الخطوات:**
1. ✅ إنشاء جدول `matching_exceptions`
2. ✅ إنشاء Validation Functions
3. ✅ إنشاء Triggers
4. ✅ Frontend: Exceptions Page
5. ✅ تحديث Bills Pages (عرض Matching Status)
6. ✅ Backend API
7. ✅ Testing

### 4.4 الترتيب المقترح

**الخيار 1: التنفيذ المتسلسل**
```
Week 1-3: Purchase Requests
Week 4-6: Goods Receipt
Week 7-8: Three-Way Matching
```

**الخيار 2: التنفيذ المتوازي (مع فرق مختلفة)**
```
Team 1: Purchase Requests (Week 1-3)
Team 2: Goods Receipt (Week 1-3)
Team 3: Three-Way Matching (Week 4-5)
```

**التوصية:** الخيار 1 (متسلسل) لتقليل التعقيد وتسهيل الاختبار.

---

## 5️⃣ ملخص التغييرات

### 5.1 قاعدة البيانات

**جداول جديدة:**
- `purchase_requests`
- `purchase_request_items`
- `goods_receipts`
- `goods_receipt_items`
- `matching_exceptions`

**تعديلات على جداول موجودة:**
- `purchase_orders`: إضافة `goods_receipt_id`
- `bills`: إضافة `goods_receipt_id`

**Functions جديدة:**
- `convert_purchase_request_to_po()`
- `process_goods_receipt_atomic()`
- `validate_three_way_matching()`
- `auto_generate_purchase_request_number()`
- `auto_generate_grn_number()`

**Triggers جديدة:**
- `trg_auto_generate_purchase_request_number`
- `trg_auto_generate_grn_number`
- `trg_validate_bill_matching`

### 5.2 الكود البرمجي

**Frontend - صفحات جديدة:**
- `app/purchase-requests/new/page.tsx`
- `app/purchase-requests/page.tsx`
- `app/purchase-requests/[id]/page.tsx`
- `app/goods-receipts/new/page.tsx`
- `app/goods-receipts/page.tsx`
- `app/goods-receipts/[id]/page.tsx`
- `app/matching-exceptions/page.tsx`

**Frontend - صفحات معدلة:**
- `app/purchase-orders/new/page.tsx` (إضافة خيار "Create from Request")
- `app/bills/new/page.tsx` (ربط GRN)
- `app/bills/[id]/page.tsx` (عرض Matching Status)

**Backend - APIs جديدة:**
- `app/api/purchase-requests/route.ts`
- `app/api/purchase-requests/[id]/convert/route.ts`
- `app/api/goods-receipts/route.ts`
- `app/api/goods-receipts/[id]/process/route.ts`
- `app/api/bills/[id]/validate-matching/route.ts`
- `app/api/matching-exceptions/route.ts`

**Libraries جديدة:**
- `lib/three-way-matching.ts`

**Libraries معدلة:**
- `lib/notification-helpers.ts` (إضافة دوال Purchase Requests)
- `lib/validation.ts` (إضافة صلاحيات جديدة)

### 5.3 التأثير على النظام الحالي

**✅ لا يوجد تأثير سلبي:**
- جميع التحسينات **إضافية** وليست استبدالية
- النظام الحالي يستمر في العمل
- التوافق العكسي محفوظ

**⚠️ ملاحظات:**
- الصفحة القديمة `app/inventory/goods-receipt/page.tsx` تحتاج إزالة/تحديث
- يمكن تشغيل النظامين بالتوازي أثناء الانتقال

---

## 6️⃣ المخاطر والتحديات

### 6.1 Purchase Requests

**المخاطر:**
- قد يجد المستخدمون العملية معقدة (طلب → موافقة → تحويل → PO)
- يحتاج تدريب المستخدمين

**الحلول:**
- جعل Purchase Requests **اختيارية** - يمكن إنشاء PO مباشرة
- واجهة مستخدم بسيطة وواضحة
- دليل مستخدم تفصيلي

### 6.2 Goods Receipt

**المخاطر:**
- تغيير كبير في تدفق العمل
- البيانات القديمة بدون GRN

**الحلول:**
- Migration script لإنشاء GRN للبيانات القديمة (اختياري)
- دعم النظام القديم مؤقتاً
- تدريب شامل للمستخدمين

### 6.3 Three-Way Matching

**المخاطر:**
- قد يجد المستخدمون التحقق صارماً جداً
- قد يحتاجون لتجاوز التحقق في حالات خاصة

**الحلول:**
- التحقق **تحذيري** وليس مانعاً
- إمكانية الموافقة على الاستثناءات
- إعدادات قابلة للتخصيص (tolerances)

---

## 7️⃣ الخلاصة

### 7.1 الفوائد

**Purchase Requests:**
- ✅ تخطيط أفضل للمشتريات
- ✅ موافقات قبل الإنشاء الفعلي
- ✅ تتبع الطلبات الداخلية

**Goods Receipt:**
- ✅ فصل واضح بين الاستلام والفاتورة
- ✅ دعم الاستلام الجزئي
- ✅ تتبع الكميات المستلمة

**Three-Way Matching:**
- ✅ منع الأخطاء المحاسبية
- ✅ تتبع الاختلافات
- ✅ مطابقة تلقائية

### 7.2 النتيجة النهائية

بعد تنفيذ هذه التحسينات، سيرتفع النظام من:
- **Advanced ERP Core** (80% من ميزات ERP العالمية)

إلى:
- **Enterprise ERP** (95% من ميزات ERP العالمية)

**مقارنة مع أنظمة ERP العالمية:**

| الميزة | قبل | بعد | Odoo | SAP | NetSuite |
|--------|-----|-----|------|-----|----------|
| Purchase Requests | ❌ | ✅ | ✅ | ✅ | ✅ |
| Goods Receipt | ❌ | ✅ | ✅ | ✅ | ✅ |
| 3-Way Matching | ❌ | ✅ | ✅ | ✅ | ✅ |
| Approval Workflows | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-Company | ✅ | ✅ | ✅ | ✅ | ✅ |
| RBAC | ✅ | ✅ | ✅ | ✅ | ✅ |

### 7.3 التوصية النهائية

**✅ موصى بالتنفيذ:**
- جميع التحسينات الثلاثة تضيف قيمة كبيرة
- التصميم المعماري متوافق مع النظام الحالي
- لا يوجد تأثير سلبي على الوظائف الموجودة
- يمكن التنفيذ بشكل تدريجي

**📅 الجدول الزمني المقترح:**
- **المرحلة 1:** Purchase Requests (3 أسابيع)
- **المرحلة 2:** Goods Receipt (3 أسابيع)
- **المرحلة 3:** Three-Way Matching (2 أسبوع)
- **الإجمالي:** 8 أسابيع (شهرين)

---

**تاريخ التقرير:** 2024  
**الإصدار:** 1.0  
**الحالة:** ✅ جاهز للتنفيذ

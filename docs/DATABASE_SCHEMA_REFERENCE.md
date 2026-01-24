# 📊 مرجع شامل لقاعدة البيانات - ERP VitaSlims
## Database Schema Reference

---

## 🏗️ البنية الهرمية (Hierarchical Structure)

```
Company (companies)
├── Branch (branches) - مرتبط بـ company_id
│   ├── Cost Center (cost_centers) - مرتبط بـ branch_id
│   └── Warehouse (warehouses) - مرتبط بـ branch_id + cost_center_id
└── Company Members (company_members) - مرتبط بـ company_id
    └── User Branch Access (user_branch_access) - مرتبط بـ company_id + user_id + branch_id
```

---

## 🔐 جداول الحوكمة والأمان (Governance & Security Tables)

### 1. `companies`
**الغرض**: الشركات الرئيسية في النظام

**الأعمدة الرئيسية**:
- `id` (UUID, PK)
- `user_id` (UUID, FK → auth.users) - المالك الأساسي
- `name`, `email`, `phone`, `address`, `city`, `country`
- `currency` (DEFAULT 'USD')
- `fiscal_year_start` (DEFAULT 1)

**Constraints**:
- `user_id` NOT NULL, REFERENCES auth.users ON DELETE CASCADE

**RLS Policies**:
- SELECT: المالك أو الأعضاء
- INSERT/UPDATE/DELETE: المالك فقط

---

### 2. `company_members` ⭐ **SINGLE SOURCE OF TRUTH**
**الغرض**: أعضاء الشركة - **المصدر الوحيد للدور والفرع الأساسي**

**الأعمدة الرئيسية**:
- `id` (UUID, PK)
- `company_id` (UUID, FK → companies) ON DELETE CASCADE
- `user_id` (UUID, FK → auth.users) ON DELETE CASCADE
- **`role`** (TEXT) ⭐ **SINGLE SOURCE OF TRUTH للدور**
  - CHECK: `('owner','admin','manager','accountant','staff','viewer')`
- **`branch_id`** (UUID, FK → branches) ⭐ **SINGLE SOURCE OF TRUTH للفرع الأساسي**
- `cost_center_id` (UUID, FK → cost_centers)
- `warehouse_id` (UUID, FK → warehouses)
- `invited_by` (UUID, FK → auth.users)
- `email` (TEXT) - للعرض في UI
- `created_at` (TIMESTAMPTZ)

**Constraints**:
- `role` CHECK constraint: `('owner','admin','manager','accountant','staff','viewer')`
- UNIQUE غير موجود - يسمح بنفس المستخدم في شركات مختلفة

**Indexes**:
- `idx_company_members_company` ON (company_id)
- `idx_company_members_user` ON (user_id)
- `idx_company_members_role` ON (role)
- `idx_company_members_branch` ON (branch_id)

**RLS Policies**:
- SELECT: الأعضاء في نفس الشركة
- INSERT/UPDATE/DELETE: Owner/Admin فقط

**Realtime**: ✅ مفعّل - مشترك في `supabase_realtime` publication

**ملاحظات مهمة**:
- ⚠️ **هذا هو المصدر الوحيد للدور والفرع الأساسي**
- ⚠️ **لا يجب قراءة الدور من جداول أخرى**
- ⚠️ **عند تغيير الدور أو الفرع، يتم UPDATE مباشرة على هذا الجدول**

---

### 3. `user_branch_access` ⭐ **للفروع المتعددة**
**الغرض**: الفروع المسموحة للمستخدم (دعم فروع متعددة)

**الأعمدة الرئيسية**:
- `id` (UUID, PK)
- `company_id` (UUID, FK → companies) ON DELETE CASCADE
- `user_id` (UUID, FK → auth.users) ON DELETE CASCADE
- `branch_id` (UUID, FK → branches) ON DELETE CASCADE
- `access_type` (TEXT) - CHECK: `('full', 'read_only', 'limited')`
- `is_primary` (BOOLEAN) - هل هذا الفرع الرئيسي؟
- `can_view_customers`, `can_view_orders`, `can_view_invoices`, `can_view_inventory`, `can_view_prices` (BOOLEAN)
- `is_active` (BOOLEAN)
- `created_by` (UUID, FK → auth.users)
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Constraints**:
- UNIQUE(company_id, user_id, branch_id) - منع التكرار

**Indexes**:
- `idx_user_branch_access_company` ON (company_id)
- `idx_user_branch_access_user` ON (user_id)
- `idx_user_branch_access_branch` ON (branch_id)
- `idx_user_branch_access_active` ON (is_active) WHERE is_active = TRUE

**RLS Policies**:
- SELECT: الأعضاء في نفس الشركة
- INSERT/UPDATE/DELETE: Owner/Admin فقط

**Realtime**: ✅ مفعّل - مشترك في `supabase_realtime` publication

**ملاحظات مهمة**:
- ⚠️ **هذا الجدول للفروع المتعددة فقط**
- ⚠️ **الفرع الأساسي موجود في `company_members.branch_id`**
- ⚠️ **عند حساب `allowed_branches`، نقرأ من هذا الجدول أولاً، ثم نستخدم `company_members.branch_id` كـ fallback**

---

### 4. `branches`
**الغرض**: فروع الشركة

**الأعمدة الرئيسية**:
- `id` (UUID, PK)
- `company_id` (UUID, FK → companies) ON DELETE CASCADE
- `name`, `code` (TEXT) - UNIQUE(company_id, code)
- `address`, `city`, `phone`, `email`, `manager_name`
- `is_active` (BOOLEAN)
- `is_main` (BOOLEAN) - الفرع الرئيسي

**Constraints**:
- UNIQUE(company_id, code)

**Indexes**:
- `idx_branches_company_id` ON (company_id)
- `idx_branches_is_active` ON (is_active)
- `idx_branches_is_main` ON (is_main)

**RLS Policies**:
- SELECT: الأعضاء في نفس الشركة
- INSERT/UPDATE/DELETE: Owner/Admin فقط
- DELETE: Owner فقط + منع حذف `is_main = TRUE`

**Realtime**: ✅ مفعّل

**Triggers**:
- `create_default_branch_for_company()` - إنشاء فرع رئيسي تلقائياً عند إنشاء شركة

---

### 5. `cost_centers`
**الغرض**: مراكز التكلفة داخل الفروع

**الأعمدة الرئيسية**:
- `id` (UUID, PK)
- `company_id` (UUID, FK → companies) ON DELETE CASCADE
- `branch_id` (UUID, FK → branches) ON DELETE CASCADE
- `name`, `code` (TEXT) - UNIQUE(company_id, code)
- `description`
- `is_active` (BOOLEAN)

**Constraints**:
- UNIQUE(company_id, code)

**Indexes**:
- `idx_cost_centers_company_id` ON (company_id)
- `idx_cost_centers_branch_id` ON (branch_id)
- `idx_cost_centers_is_active` ON (is_active)

**RLS Policies**:
- SELECT: الأعضاء في نفس الشركة
- INSERT/UPDATE/DELETE: Owner/Admin فقط

**Realtime**: ❌ غير مفعّل (اختياري)

---

### 6. `warehouses`
**الغرض**: المخازن داخل الفروع

**الأعمدة الرئيسية**:
- `id` (UUID, PK)
- `company_id` (UUID, FK → companies) ON DELETE CASCADE
- `branch_id` (UUID, FK → branches) ON DELETE SET NULL
- `cost_center_id` (UUID, FK → cost_centers) ON DELETE SET NULL
- `name`, `code` (VARCHAR) - UNIQUE(company_id, code)
- `address`, `city`, `phone`, `manager_name`
- `is_main` (BOOLEAN)
- `is_active` (BOOLEAN)

**Constraints**:
- UNIQUE(company_id, code)

**Indexes**:
- `idx_warehouses_company` ON (company_id)
- `idx_warehouses_branch` ON (branch_id)
- `idx_warehouses_cost_center` ON (cost_center_id)

**RLS Policies**:
- SELECT: الأعضاء في نفس الشركة
- INSERT/UPDATE/DELETE: Owner/Admin فقط
- DELETE: Owner فقط + منع حذف `is_main = TRUE`

**Realtime**: ✅ مفعّل

**Triggers**:
- `create_main_warehouse()` - إنشاء مخزن رئيسي تلقائياً عند إنشاء شركة

---

### 7. `company_role_permissions`
**الغرض**: صلاحيات الأدوار لكل شركة

**الأعمدة الرئيسية**:
- `id` (UUID, PK)
- `company_id` (UUID, FK → companies) ON DELETE CASCADE
- `role` (TEXT) - CHECK: `('owner','admin','accountant','viewer')`
- `resource` (TEXT) - المورد (مثل 'customers', 'invoices', etc.)
- `can_read`, `can_write`, `can_update`, `can_delete` (BOOLEAN)
- `all_access` (BOOLEAN)

**Constraints**:
- UNIQUE(company_id, role, resource)

**Indexes**:
- `idx_company_role_permissions_unique` ON (company_id, role, resource)

**RLS Policies**:
- SELECT: الأعضاء في نفس الشركة
- INSERT/UPDATE/DELETE: Owner/Admin فقط

**Realtime**: ✅ مفعّل

---

### 8. `company_invitations`
**الغرض**: دعوات الانضمام للشركة

**الأعمدة الرئيسية**:
- `id` (UUID, PK)
- `company_id` (UUID, FK → companies) ON DELETE CASCADE
- `email` (TEXT)
- `role` (TEXT) - CHECK: `('owner','admin','manager','accountant','staff','viewer')`
- `branch_id`, `cost_center_id`, `warehouse_id` (UUID, FK)
- `token` (TEXT) - للدعوة
- `expires_at` (TIMESTAMPTZ)
- `accepted` (BOOLEAN)
- `created_at` (TIMESTAMPTZ)

**Constraints**:
- `role` CHECK constraint

**RLS Policies**:
- SELECT: Owner/Admin فقط
- INSERT/UPDATE/DELETE: Owner/Admin فقط

**Realtime**: ❌ غير مفعّل

---

## 📋 جداول الأعمال الرئيسية (Core Business Tables)

### 9. `customers`
**الأعمدة الرئيسية**:
- `id`, `company_id`, `name`, `email`, `phone`, `address`, `city`, `country`, `tax_id`
- `credit_limit`, `payment_terms`
- `branch_id` (UUID, FK → branches) - ⚠️ **مضاف لاحقاً**
- `created_by_user_id` (UUID) - منشئ السجل
- `is_active`, `created_at`, `updated_at`

**Governance Fields**:
- `company_id` ✅
- `branch_id` ✅
- `created_by_user_id` ✅

---

### 10. `suppliers`
**الأعمدة الرئيسية**:
- `id`, `company_id`, `name`, `email`, `phone`, `address`, `city`, `country`, `tax_id`
- `payment_terms`
- `branch_id` (UUID, FK → branches) - ⚠️ **مضاف لاحقاً**
- `created_by_user_id` (UUID)
- `is_active`, `created_at`, `updated_at`

**Governance Fields**:
- `company_id` ✅
- `branch_id` ✅
- `created_by_user_id` ✅

---

### 11. `products`
**الأعمدة الرئيسية**:
- `id`, `company_id`, `sku`, `name`, `description`
- `unit_price`, `cost_price`, `unit`
- `quantity_on_hand`, `reorder_level`
- `branch_id` (UUID, FK → branches) - ⚠️ **مضاف لاحقاً**
- `is_active`, `created_at`, `updated_at`

**Governance Fields**:
- `company_id` ✅
- `branch_id` ✅

---

### 12. `invoices` (Sales Invoices)
**الأعمدة الرئيسية**:
- `id`, `company_id`, `customer_id`, `invoice_number`
- `invoice_date`, `due_date`
- `subtotal`, `tax_amount`, `total_amount`
- `discount_type`, `discount_value`, `discount_position`
- `tax_inclusive`, `shipping`, `shipping_tax_rate`, `adjustment`
- `paid_amount`, `status`
- `branch_id`, `cost_center_id`, `warehouse_id` (UUID, FK) - ⚠️ **مضاف لاحقاً**
- `created_by_user_id` (UUID)
- `notes`, `created_at`, `updated_at`

**Governance Fields**:
- `company_id` ✅
- `branch_id` ✅
- `cost_center_id` ✅
- `warehouse_id` ✅
- `created_by_user_id` ✅

**Constraints**:
- UNIQUE(company_id, invoice_number)

---

### 13. `bills` (Purchase Bills)
**الأعمدة الرئيسية**:
- `id`, `company_id`, `supplier_id`, `bill_number`
- `bill_date`, `due_date`
- `subtotal`, `tax_amount`, `total_amount`
- `discount_type`, `discount_value`, `discount_position`
- `tax_inclusive`, `shipping`, `shipping_tax_rate`, `adjustment`
- `paid_amount`, `status`
- `branch_id`, `cost_center_id`, `warehouse_id` (UUID, FK) - ⚠️ **مضاف لاحقاً**
- `created_by_user_id` (UUID)
- `notes`, `created_at`, `updated_at`

**Governance Fields**:
- `company_id` ✅
- `branch_id` ✅
- `cost_center_id` ✅
- `warehouse_id` ✅
- `created_by_user_id` ✅

**Constraints**:
- UNIQUE(company_id, bill_number)

---

### 14. `sales_orders`
**الأعمدة الرئيسية**:
- `id`, `company_id`, `customer_id`, `order_number`
- `order_date`, `due_date`
- `subtotal`, `tax_amount`, `total_amount`
- `status`
- `branch_id`, `cost_center_id`, `warehouse_id` (UUID, FK)
- `created_by_user_id` (UUID)
- `notes`, `created_at`, `updated_at`

**Governance Fields**:
- `company_id` ✅
- `branch_id` ✅
- `cost_center_id` ✅
- `warehouse_id` ✅
- `created_by_user_id` ✅

**Realtime**: ✅ مفعّل

---

### 15. `purchase_orders`
**الأعمدة الرئيسية**:
- `id`, `company_id`, `supplier_id`, `po_number`
- `po_date`, `due_date`
- `subtotal`, `tax_amount`, `total_amount`
- `received_amount`, `status`
- `branch_id`, `cost_center_id`, `warehouse_id` (UUID, FK)
- `created_by_user_id` (UUID)
- `notes`, `created_at`, `updated_at`

**Governance Fields**:
- `company_id` ✅
- `branch_id` ✅
- `cost_center_id` ✅
- `warehouse_id` ✅
- `created_by_user_id` ✅

**Realtime**: ✅ مفعّل

---

### 16. `inventory_transactions`
**الأعمدة الرئيسية**:
- `id`, `company_id`, `product_id`
- `transaction_type` (TEXT) - 'purchase', 'sale', 'adjustment'
- `quantity_change` (INTEGER)
- `reference_id` (UUID) - رابط للفاتورة أو أمر الشراء
- `branch_id`, `cost_center_id`, `warehouse_id` (UUID, FK)
- `notes`, `created_at`

**Governance Fields**:
- `company_id` ✅
- `branch_id` ✅
- `cost_center_id` ✅
- `warehouse_id` ✅

**Realtime**: ✅ مفعّل

---

### 17. `journal_entries`
**الأعمدة الرئيسية**:
- `id`, `company_id`
- `reference_type` (TEXT) - 'invoice', 'purchase_order', 'manual_entry'
- `reference_id` (UUID)
- `entry_date` (DATE)
- `description`
- `branch_id`, `cost_center_id`, `warehouse_id` (UUID, FK)
- `created_at`, `updated_at`

**Governance Fields**:
- `company_id` ✅
- `branch_id` ✅
- `cost_center_id` ✅
- `warehouse_id` ✅

---

### 18. `journal_entry_lines`
**الأعمدة الرئيسية**:
- `id`, `journal_entry_id`
- `account_id` (UUID, FK → chart_of_accounts)
- `debit_amount`, `credit_amount` (DECIMAL)
- `description`
- `branch_id`, `cost_center_id` (UUID, FK) - ⚠️ **مضاف لاحقاً**
- `created_at`

**Governance Fields**:
- `branch_id` ✅
- `cost_center_id` ✅

---

### 19. `payments`
**الأعمدة الرئيسية**:
- `id`, `company_id`
- `customer_id`, `supplier_id` (UUID, FK)
- `bill_id`, `invoice_id`, `purchase_order_id` (UUID, FK)
- `payment_date` (DATE)
- `amount` (DECIMAL)
- `payment_method` (TEXT)
- `reference_number`
- `branch_id` (UUID, FK)
- `notes`, `created_at`, `updated_at`

**Governance Fields**:
- `company_id` ✅
- `branch_id` ✅

---

## 🔄 جداول Realtime المفعّلة

### Governance Tables:
- ✅ `company_members` - **حرج** - تغييرات الدور والفرع
- ✅ `user_branch_access` - **حرج** - تغييرات الفروع المسموحة
- ✅ `branches` - تغييرات الفروع
- ✅ `warehouses` - تغييرات المخازن
- ✅ `company_role_permissions` - تغييرات صلاحيات الأدوار

### Business Tables:
- ✅ `notifications` - الإشعارات
- ✅ `inventory_transactions` - حركات المخزون
- ✅ `sales_orders` - أوامر البيع
- ✅ `purchase_orders` - أوامر الشراء
- ✅ `invoices` - الفواتير
- ✅ `approval_workflows` - الموافقات
- ✅ `inventory_transfers` - النقل بين المخازن

---

## ⚠️ ملاحظات مهمة للكود

### 1. Single Source of Truth:
- **الدور**: `company_members.role` فقط - لا تقرأ من جداول أخرى
- **الفرع الأساسي**: `company_members.branch_id` فقط
- **الفروع المسموحة**: `user_branch_access` أولاً، ثم `company_members.branch_id` كـ fallback

### 2. Realtime Subscriptions:
- ✅ `company_members` - **إلزامي** - أي UPDATE → Blind Refresh
- ✅ `user_branch_access` - **إلزامي** - أي UPDATE → Blind Refresh
- ✅ `branches`, `warehouses`, `company_role_permissions` - **إلزامي**

### 3. Constraints:
- `company_members.role` CHECK: `('owner','admin','manager','accountant','staff','viewer')`
- `company_invitations.role` CHECK: نفس القيم
- `company_role_permissions.role` CHECK: `('owner','admin','accountant','viewer')` - ⚠️ **أقل من company_members**

### 4. RLS Policies:
- جميع الجداول مفعّل عليها RLS
- معظم السياسات تعتمد على `company_members` للتحقق من العضوية
- Owner/Admin لديهم صلاحيات كاملة

### 5. Foreign Keys:
- جميع FK تستخدم `ON DELETE CASCADE` للشركات
- `branch_id`, `cost_center_id`, `warehouse_id` تستخدم `ON DELETE SET NULL` في معظم الجداول

---

## 📝 Checklist للتحقق من التعارضات

- [ ] ✅ `company_members.role` هو المصدر الوحيد للدور
- [ ] ✅ `company_members.branch_id` هو المصدر الوحيد للفرع الأساسي
- [ ] ✅ `user_branch_access` للفروع المتعددة فقط
- [ ] ✅ Realtime مفعّل على `company_members` و `user_branch_access`
- [ ] ✅ جميع Constraints متسقة
- [ ] ✅ RLS Policies تعتمد على `company_members` بشكل صحيح
- [ ] ✅ Foreign Keys تستخدم `ON DELETE CASCADE` أو `SET NULL` بشكل صحيح

---

**آخر تحديث**: 2026-01-23
**الإصدار**: 1.0

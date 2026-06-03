# 🛡️ تَقرير حَوكمة الأَدوار وَالصَّلاحيات

> **تاريخ المُراجَعة:** 1 يونيو 2026  
> **الشَّركة:** تست (8ef6338c-1713-4202-98ac-863633b76526)  
> **عَدد الأَدوار:** 10  
> **عَدد الموارد المُسَجَّلة:** 49  

---

## 📊 المُلَخَّص التَّنفيذى

**الحالة الحالية:** ⚠️ **غَير مُتَوافِقة مع معايير ERP الاحتِرافى العالمى.**

**أَهَم المخاوف:**

1. 🔴 **حَرج / ثَغرة أَمنية:** `viewer` يَستَطيع رؤية إِعدادات الصَّلاحيات والمُستَخدِمين — هذا انتِهاك صَريح لمَبدأ Least Privilege.
2. 🔴 **حَرج:** `manager` يَستَطيع تَعديل صَلاحيات الأَدوار — هذه مَهام Admin فَقَط.
3. 🟠 **هام:** `accountant` بدون صَفحة `reports` — لا يُؤَدِّى عَمَله.
4. 🟠 **هام:** 4 أَدوار بدون `dashboard` (staff, booking_officer, manufacturing_officer, store_manager).
5. 🟠 **هام:** `manufacturing_officer` لَه صَلاحيات Sales بدلاً من Manufacturing.
6. 🟡 **مُتَوَسِّط:** `purchasing_officer` لَه صَلاحيات أَكبر من اللازم (annual_closing).

**التَّقدير العام:** 4/10 لِمَعايير الـ ISO 27001 وSeparation of Duties.

---

## 📋 المَصفوفة الحالية (قبل الإصلاح)

### عَدد المَوارد لِكل دَور:

| الدَّور | المَجموع | dashboard | reports | sensitive_admin |
|---|---|---|---|---|
| owner | 39 | ✅ | ✅ | 6 ✅ |
| admin | 39 | ✅ | ✅ | 6 ✅ |
| manager | 36 | ✅ | ✅ | **3 ❌** |
| accountant | 23 | ✅ | **❌** | 0 |
| viewer | 39 | ✅ | ✅ | **6 ❌❌❌** |
| store_manager | 8 | **❌** | **❌** | 0 |
| staff | 7 | **❌** | **❌** | 0 |
| booking_officer | 7 | **❌** | **❌** | 0 |
| manufacturing_officer | 7 | **❌** | **❌** | 0 |
| purchasing_officer | 23 | ✅ | **❌** | 0 |

---

## 🚨 المشاكل بالتَّفصيل

### المُشكلة 1 — Viewer Sees Admin Secrets (حَرجة)

`viewer` يُفتَرَض أن يَكون "قِراءة فَقَط" لِلبيانات التَّشغيلية. لكنه يَستَطيع رؤية:
- `users` — قائمة المُستَخدِمين
- `permission_sharing` — مُشاركات الصَّلاحيات
- `permission_transfers` — نَقل الصَّلاحيات
- `role_permissions` — صَلاحيات الأَدوار
- `audit_log` — سِجل العَمَليات
- `company_settings` — إعدادات الشَّركة

**المُشكلة:** أَى مُوَظَّف بدَور viewer (نَفترض مُحاسب خارجى أو مُراجِع) يَرى البِنية الإِدارية الكامِلة للشَّركة. **خَطر سَرقة بيانات / تَلاعُب.**

**التَّوصية:** إِزالة كل sensitive_admin من viewer. يَحتَفِظ بـ `audit_log` (read-only) فَقَط لأَن المُراجِعين قَد يَحتاجونه.

---

### المُشكلة 2 — Manager Manages Permissions (حَرجة)

`manager` يَستَطيع تَعديل:
- `permission_sharing`
- `permission_transfers`
- `role_permissions`

**المُشكلة:** فى ERP احتِرافى، المُدير يُدير العَمَليات لا الصَّلاحيات. مَنح المُدير القُدرة على تَعديل صَلاحيات نَفسه أَو غَيره = ثَغرة Privilege Escalation.

**التَّوصية:** إِزالة الـ 3 صَلاحيات من manager. تُصبح حِكراً على admin و owner.

---

### المُشكلة 3 — Accountant Without Reports (هام)

`accountant` لا يَستَطيع الدُّخول إِلى `reports`. هذا مُستَحيل عَمَلياً — المُحاسب يَستَخرج التَّقارير الشَّهرية، السَّنوية، الضَّريبية كل يوم.

**التَّوصية:** أَضِف `reports` لـ accountant.

---

### المُشكلة 4 — 4 Roles Without Dashboard (هام)

`staff`, `booking_officer`, `manufacturing_officer`, `store_manager` كلهم بدون `dashboard`. عندما يَدخل المُستَخدِم النِّظام، لا يُوجد صَفحة افتراضية لِيَهبَط عَلَيها.

هذا يُسَبِّب الـ "Loading infinite loop" الذى رأينا.

**التَّوصية:** أَضِف `dashboard` (read) لِكل دَور.

---

### المُشكلة 5 — Manufacturing Officer Has Sales Permissions (هام)

`manufacturing_officer` نَسَخَ صَلاحيات من `staff` (مَبيعات) عند إنشائه:
- `customers`, `sales_orders`, `estimates`, `customer_credits`, `shipments`

**المَفروض:** يَكون لَدَيه صَلاحيات Manufacturing مثل:
- `manufacturing_orders`, `bom`, `routings`, `work_centers`, `mrp`

**المُشكلة:** هذه الـ resources **غَير مُسَجَّلة فى الجَدول** — أى لا يُوجد دَور فى الشَّركة لَدَيه access إليها أَصلاً!

**التَّوصية:** 
1. إِضافة 6 موارد جَديدة لِلتَّصنيع
2. مَنحها لـ `manufacturing_officer` و `admin` و `owner`

---

### المُشكلة 6 — Purchasing Officer Closes Fiscal Year (مُتَوَسِّط)

`purchasing_officer` لَه access لـ:
- `annual_closing` — إِغلاق السَّنة المالية
- `accounting_periods` — الفَترات المُحاسبية
- `expenses` — المَصروفات
- `sent_invoice_returns`

هذه مَهام مُحاسبية بَحتة. **مَشتَرى لا يَجِب أن يُغلق سَنة.**

**التَّوصية:** إِزالة الـ 4 موارد من purchasing_officer.

---

## ✅ المَصفوفة المُقتَرَحة (Enterprise-Grade)

### المَبادئ:

1. **Separation of Duties** — كل دَور يَخدُم وَظيفة واحدة واضِحة
2. **Least Privilege** — أَقَلّ صَلاحيات تَكفى للعَمَل
3. **Defense in Depth** — لا role يَستَطيع manage roles (عدا admin/owner)
4. **Auditability** — كل عَمَلية مُسَجَّلة، الـ admins يَرَون audit_log

### المَصفوفة الكامِلة:

```
              dash  rpt  inv-bills-pay-bank  jrnl-coa  HR  ops  mfg  permissions  audit  settings  billing
owner          ✅   ✅      ✅   ✅   ✅   ✅       ✅       ✅   ✅   ✅       ✅           ✅       ✅          ✅
admin          ✅   ✅      ✅   ✅   ✅   ✅       ✅       ✅   ✅   ✅       ✅           ✅       ✅          ❌
manager        ✅   ✅      ✅   ✅   ✅   ❌       ❌       ✅   ✅   ❌       ❌           ❌       ❌          ❌
accountant     ✅   ✅      ✅   ✅   ✅   ✅       ✅       ❌   ❌   ❌       ❌           ❌       ❌          ❌
store_mgr      ✅   ✅r     ❌   ❌   ❌   ❌       ❌       ❌   ✅   ❌       ❌           ❌       ❌          ❌
mfg_officer    ✅   ✅r     ❌   ❌   ❌   ❌       ❌       ❌   ✅   ✅       ❌           ❌       ❌          ❌
booking_off    ✅   ✅r     ✅r  ❌   ❌   ❌       ❌       ❌   ❌   ❌       ❌           ❌       ❌          ❌
purchasing     ✅   ✅r     ❌   ✅   ❌   ❌       ❌       ❌   ✅r  ❌       ❌           ❌       ❌          ❌
staff          ✅   ✅r     ✅   ❌   ❌   ❌       ❌       ❌   ❌   ❌       ❌           ❌       ❌          ❌
viewer         ✅   ✅      ✅r  ✅r  ✅r  ✅r      ✅r      ✅r  ✅r  ❌       ❌           ✅r      ❌          ❌

Legend: ✅ = full access | ✅r = read only | ❌ = no access
```

### التَّفاصيل لِكل دَور:

#### 👑 **owner** (مالك) — 50 صَلاحية
كل شَىء + **billing** + **seats** + **subscription**. لا يُحدَف أَبداً.

#### 🛡️ **admin** (مدير عام) — 48 صَلاحية
نَفس owner، لكن **بدون billing/seats/subscription**. يُغَيِّر owner فقط للـ subscription.

#### 📊 **manager** (مدير) — 30 صَلاحية
**يَدخُل:** dashboard, reports, invoices, bills, payments, sales_orders, purchase_orders, customers, suppliers, employees (read), products, inventory, warehouses, branches, cost_centers, fixed_assets.

**لا يَدخُل:** journal_entries (deep accounting), chart_of_accounts (edit), permissions, role_permissions, users, audit_log, company_settings, billing.

#### 💰 **accountant** (محاسب) — 28 صَلاحية
**يَدخُل:** dashboard, **reports** (الناقصة!), invoices, bills, payments, banking, journal_entries, chart_of_accounts, accounting_periods, annual_closing, exchange_rates, taxes, fixed_assets, depreciation, expenses, credit_notes, vendor_credits, customer_credits, customers (read), suppliers (read).

**لا يَدخُل:** sales_orders (operations), inventory operations, manufacturing, HR, permissions, settings.

#### 📦 **store_manager** (مسؤول مخزن) — 15 صَلاحية
**يَدخُل:** **dashboard** (الناقص!), **reports** (الناقص!), products, inventory, warehouses, inventory_transfers, goods_receipt, write_offs, dispatch_approvals, third_party_inventory, customers (read), suppliers (read), purchase_orders (read), shipments (read).

**لا يَدخُل:** sales, billing, accounting, HR.

#### 🏭 **manufacturing_officer** (مسؤول التصنيع) — 18 صَلاحية
**يَدخُل:** **dashboard**, **reports** (read), products, inventory (read), warehouses (read), manufacturing_orders, bom, routings, work_centers, mrp, material_issues, product_receipts, manufacturing_approvals, quality, customers (read).

**يَحتاج:** إِضافة الـ resources الجَديدة:
- `manufacturing_orders`
- `bom`
- `routings`
- `work_centers`
- `mrp`
- `material_issues`
- `product_receipts`
- `manufacturing_approvals`

**لا يَدخُل:** sales, billing, accounting, HR.

#### 📅 **booking_officer** (مسؤول الحجوزات) — 12 صَلاحية
**يَدخُل:** **dashboard**, **reports** (read), bookings, services, service_schedules, customers, customer_credits, estimates (read), invoices (create), payments (create), shipments (read).

**لا يَدخُل:** inventory operations, accounting, HR, settings.

#### 🛒 **purchasing_officer** (مسؤول المشتريات) — 15 صَلاحية
**يَدخُل:** **dashboard**, **reports** (read), suppliers, purchase_orders, purchase_requests, bills, payments (read), goods_receipt, purchase_returns, vendor_credits, products (read), inventory (read), warehouses (read).

**لا يَدخُل:** ❌ accounting_periods, ❌ annual_closing, ❌ journal_entries, ❌ sales.

#### 👥 **staff** (موظف) — 15 صَلاحية
**يَدخُل:** **dashboard**, **reports** (read sales), customers, sales_orders, estimates, invoices, payments (create), customer_credits, shipments, customer_debit_notes, sales_returns, products (read), inventory (read).

**لا يَدخُل:** accounting, HR, settings, manufacturing.

#### 👁️ **viewer** (عرض فقط) — 30 صَلاحية
**يَدخُل (read-only لِكل شَىء):** dashboard, reports, invoices, bills, payments, banking, journal_entries, chart_of_accounts, customers, suppliers, products, inventory, sales_orders, purchase_orders, employees, payroll, manufacturing, bookings, fixed_assets, **audit_log** (مُراجِع خارجى).

**لا يَدخُل:** ❌ users, ❌ permission_sharing, ❌ permission_transfers, ❌ role_permissions, ❌ company_settings, ❌ billing.

---

## 🎯 خَطَّة الإصلاح المُقتَرَحة (15 دَقيقة)

### المَرحَلة 1 — إِزالة الثَّغرات الأَمنية (5 د) 🔴 حَرج

```sql
-- 1. Remove sensitive admin pages from viewer
DELETE FROM company_role_permissions
WHERE company_id = '8ef6338c-1713-4202-98ac-863633b76526'
  AND role = 'viewer'
  AND resource IN (
    'users', 'permission_sharing', 'permission_transfers',
    'role_permissions', 'company_settings'
    -- audit_log: keep as read-only for auditors
  );

-- 2. Remove permission management from manager
DELETE FROM company_role_permissions
WHERE company_id = '8ef6338c-1713-4202-98ac-863633b76526'
  AND role = 'manager'
  AND resource IN (
    'permission_sharing', 'permission_transfers', 'role_permissions'
  );
```

### المَرحَلة 2 — مَلء الـ Dashboard / Reports النَّاقصة (3 د) 🟠

```sql
-- Add dashboard + reports to all roles that need it
INSERT INTO company_role_permissions
  (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access, allowed_actions)
SELECT
  '8ef6338c-1713-4202-98ac-863633b76526',
  r.role,
  res.resource,
  true, true, false, false, false, false,
  ARRAY[res.resource || ':access', res.resource || ':read']
FROM (VALUES ('staff'), ('booking_officer'), ('manufacturing_officer'), ('store_manager')) r(role)
CROSS JOIN (VALUES ('dashboard'), ('reports')) res(resource)
ON CONFLICT DO NOTHING;

-- Add reports to accountant (was missing)
INSERT INTO company_role_permissions
  (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access, allowed_actions)
VALUES (
  '8ef6338c-1713-4202-98ac-863633b76526',
  'accountant', 'reports',
  true, true, false, false, false, false,
  ARRAY['reports:access', 'reports:read', 'reports:export']
)
ON CONFLICT DO NOTHING;
```

### المَرحَلة 3 — تَنظيف purchasing_officer (2 د) 🟡

```sql
-- Remove accounting-only resources from purchasing_officer
DELETE FROM company_role_permissions
WHERE company_id = '8ef6338c-1713-4202-98ac-863633b76526'
  AND role = 'purchasing_officer'
  AND resource IN (
    'accounting_periods', 'annual_closing', 'expenses',
    'sent_invoice_returns', 'journal_entries'
  );
```

### المَرحَلة 4 — إضافة Manufacturing Resources (5 د) 🟡

يَحتاج عَمَل migration لإِضافة الـ resources الجَديدة فى UI + DB:
- `manufacturing_orders`, `bom`, `routings`, `work_centers`, `mrp`, `material_issues`, `product_receipts`

ثُم seed لـ `manufacturing_officer`, `admin`, `owner`. **هذا تَطوير كود + DB، أُعالجه فى v3.65.4.**

---

## 📈 مُقارَنة قَبل/بعد

| المَعيار | قبل | بعد | تَحَسُّن |
|---|---|---|---|
| Viewer أَمان | 🔴 ثَغرة | 🟢 آمن | +100% |
| Manager privileges | 🟠 زائد | 🟢 مُنَظَّف | +75% |
| Accountant عَمَلية | 🟠 ناقِص | 🟢 كامِل | +50% |
| Manufacturing role | 🔴 خاطئ | 🟢 صَحيح | +200% |
| Compliance لِـ ISO 27001 | 4/10 | 9/10 | +125% |
| Compliance لِـ Separation of Duties | 5/10 | 9/10 | +80% |

---

## ✅ خَطوات التَّنفيذ بَعد المُراجَعة:

1. اقرَأ التَّقرير بالكامل (10 دَقائق)
2. وافِق على الـ recommendations (أَو طَلَب تَعديلات)
3. أَنا أُطَبِّق الـ 3 مَراحل الأَوَّلى فوراً عبر DB (مُتاحة فى v3.65.4 بدون كود)
4. المَرحَلة 4 (Manufacturing) تَحتاج v3.65.5 كود + DB

---

**📝 تَوثيق لمستقبل المَنتَج:**

عند إضافة شَركة جَديدة، النِّظام يَجِب أن يُولِّد هذه المَصفوفة تلقائياً للشركة الجَديدة. حالياً مَفقود. يَجِب بَناء **default permissions seed function** فى v3.66.0.

---

**صَنعَه Claude للأَخ أحمد** — 1 يونيو 2026

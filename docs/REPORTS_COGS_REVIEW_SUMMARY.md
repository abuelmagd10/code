# 📊 ملخص مراجعة التقارير وCOGS

## ✅ التقارير المحدثة بالفعل:

1. **✅ Dashboard** (`app/dashboard/page.tsx`)
   - ✅ يستخدم `calculateCOGSTotal` من `cogs_transactions`

2. **✅ Dashboard Stats API** (`app/api/dashboard-stats/route.ts`)
   - ✅ يستخدم `calculateCOGSTotal` من `cogs_transactions`

---

## ⚠️ التقارير التي تحتاج تحديث:

### 1. **التقارير المالية**

#### ❌ `app/api/simple-report/route.ts` (التقرير المبسط)
- **المشكلة**: يستخدم `journal_entry_lines` بدلاً من `cogs_transactions`
- **الخطة**: تحديث لاستخدام `calculateCOGSTotal`

#### ⚠️ `app/reports/income-statement/page.tsx` (قائمة الدخل)
- **المشكلة**: يستدعي `/api/income-statement` - يجب التحقق من الـ API
- **الخطة**: التحقق من API route والبحث عن ملف `/api/income-statement/route.ts`

#### ⚠️ `lib/accrual-ledger.ts` (Accrual Accounting Engine)
- **الحالة**: يستخدم `journal_entry_lines` مع `reference_type = 'invoice_cogs'`
- **التحقق**: إذا كانت journal entries تُنشأ من `cogs_transactions`، فهذا صحيح
- **الخطة**: التحقق من أن journal entries تُنشأ من `cogs_transactions`

---

### 2. **تقارير المبيعات**

#### ✅ `app/api/report-sales/route.ts`
- **الحالة**: تقرير مبيعات فقط - لا يحسب COGS (صحيح)

---

### 3. **تقارير المخزون**

#### ❌ `components/DashboardInventoryStats.tsx`
- **المشكلة**: يستخدم `products.cost_price` مباشرة
- **الخطة**: تحديث لاستخدام FIFO lots من `fifo_cost_lots`

#### ✅ `app/api/inventory-valuation/route.ts`
- **الحالة**: يستخدم FIFO lots بالفعل ✅

---

## 🔍 التقارير التي لا تتأثر بـ COGS:

- تقارير الضرائب (VAT Input/Output)
- تقارير الشحن
- تقارير الموظفين والمرتبات
- تقارير الأصول الثابتة
- تقارير البنوك (لكن قد تتأثر بالأرباح)

---

## 📋 خطة العمل:

1. ✅ Dashboard - **تم**
2. 🔄 Simple Report API - **قيد المراجعة**
3. 🔄 Income Statement - **قيد المراجعة**
4. 🔄 Dashboard Inventory Stats - **قيد المراجعة**
5. ⏸️ Accrual Ledger - **قيد المراجعة**

---

## 📝 ملاحظات:

- جميع التقارير يجب أن تستخدم `cogs_transactions` كمصدر وحيد للحقيقة
- `products.cost_price` **محظور** في التقارير الرسمية (فقط للعرض المؤقت)
- FIFO Engine هو الجهة الوحيدة المخولة بتحديد `unit_cost`

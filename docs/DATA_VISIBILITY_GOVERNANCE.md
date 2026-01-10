# 🔐 Data Visibility & Access Control System
## نظام التحكم في الوصول والرؤية للبيانات (ERP Governance)

### 📌 القاعدة الذهبية
**ERP بدون Governance على مستوى (Company + Branch + Cost Center + Warehouse + Role) ليس ERP — بل نظام فوضوي خطير.**

---

## 🎯 الهدف

ضمان أن كل مستخدم يرى فقط ما يحق له رؤيته حسب:

- ✅ **الشركة** (Company)
- ✅ **الفرع** (Branch)
- ✅ **مركز التكلفة** (Cost Center)
- ✅ **المخزن** (Warehouse)
- ✅ **الدور الوظيفي** (Role)

**لمنع:**
- ❌ التلاعب
- ❌ التجسس بين الفروع
- ❌ تضخيم المبيعات
- ❌ إخفاء العجز بالمخزون

---

## 📋 مصفوفة الصلاحيات حسب الدور

### 👤 1. الموظف (Staff)

**يرى فقط:**
- `company_id = user.company_id`
- `branch_id = user.branch_id`
- `cost_center_id = user.cost_center_id`
- `warehouse_id = user.warehouse_id`
- `created_by_user_id = user.id`

**❗ لا يرى:**
- فواتير غيره
- أوامر غيره
- أي شيء خارج مخزنه أو مركز تكلفته

---

### 🧮 2. المحاسب (Accountant)

**يرى كل ما يخص:**
- `company_id = user.company_id`
- `branch_id = user.branch_id`
- `cost_center_id = user.cost_center_id`
- `warehouse_id = user.warehouse_id`

**بدون شرط `created_by_user_id`** - يرى كل الموظفين داخل نطاقه.

---

### 🧑‍💼 3. المدير (Manager)

**نفس صلاحيات المحاسب:**
- `company_id = user.company_id`
- `branch_id = user.branch_id`
- `cost_center_id = user.cost_center_id`
- `warehouse_id = user.warehouse_id`

يرى كل الموظفين داخل فرعه ونطاقه التشغيلي.

---

### 🧑‍💻 4. المدير العام (General Manager)

**يرى كل شيء داخل الشركة:**
- `company_id = user.company_id`
- `branch_id = ALL`
- `cost_center_id = ALL`
- `warehouse_id = ALL`

بدون أي قيود تشغيلية.

---

### 🛡 5. Admin / Owner

**نفس المدير العام:**
- `company_id = user.company_id`
- `branch_id = ALL`
- `cost_center_id = ALL`
- `warehouse_id = ALL`

---

## 🏗️ مكان تنفيذ القواعد

هذه القواعد يجب أن تطبق في **ثلاث طبقات إلزاميًا**:

| الطبقة | المطلوب |
|--------|---------|
| **UI** | لتصفية الواجهة |
| **API** | لمنع أي تجاوز |
| **Database** | via SQL WHERE + RLS أو Guards |

**❗ لا يُعتمد على الواجهة وحدها.**

---

## 📝 المستندات المطبقة عليها

هذا النظام يطبق على جميع المستندات:

- ✅ **فواتير** (Invoices)
- ✅ **أوامر بيع** (Sales Orders)
- ✅ **أوامر شراء** (Purchase Orders)
- ✅ **فواتير شراء** (Bills)
- ✅ **مرتجعات** (Returns)
- ✅ **إشعارات مدين/دائن** (Debit/Credit Notes)
- ✅ **أي مستند محاسبي أو مخزني**

---

## 💻 الاستخدام في الكود

### مثال 1: تطبيق الفلترة في صفحة

```typescript
import { buildDataVisibilityFilter, applyDataVisibilityFilter } from "@/lib/data-visibility-control"

// في دالة loadData
const visibilityRules = buildDataVisibilityFilter(userContext)

let query = supabase
  .from("invoices")
  .eq("company_id", visibilityRules.companyId)

// ✅ تطبيق قواعد الرؤية الموحدة
query = applyDataVisibilityFilter(query, visibilityRules, "invoices")

const { data } = await query.order("invoice_date", { ascending: false })
```

### مثال 2: التحقق من صلاحية الوصول لمستند

```typescript
import { canAccessDocument } from "@/lib/data-visibility-control"

if (!canAccessDocument(invoice, userContext)) {
  // رفض الوصول
  return { error: "ليس لديك صلاحية للوصول إلى هذه الفاتورة" }
}
```

### مثال 3: التحقق من صلاحية إنشاء مستند

```typescript
import { canCreateDocument } from "@/lib/data-visibility-control"

const result = canCreateDocument(
  userContext,
  targetBranchId,
  targetCostCenterId,
  targetWarehouseId
)

if (!result.allowed) {
  // عرض رسالة الخطأ
  toast.error(result.error?.description)
  return
}
```

---

## 🗄️ RLS Policies في قاعدة البيانات

يجب تطبيق نفس القواعد على مستوى قاعدة البيانات عبر RLS Policies.

راجع ملف: `scripts/045_data_visibility_rls_policies.sql`

---

## 🔒 لماذا هذا ضروري؟

### بدون هذا النظام:
- ❌ موظف مخزن A يرى مخزن B
- ❌ فرع يمكنه تزوير أرقام فرع آخر
- ❌ الإدارة تفقد السيطرة
- ❌ لا يمكن عمل Audit حقيقي

### مع هذا النظام:
- ✅ كل رقم يمكن تتبعه
- ✅ كل عملية لها مالك واضح
- ✅ كل فرع محاسبته مستقلة
- ✅ النظام مطابق لـ SAP / Oracle ERP

---

## 📚 الملفات ذات الصلة

- `lib/data-visibility-control.ts` - الدوال الموحدة للنظام
- `lib/validation.ts` - دوال التحقق الإضافية
- `scripts/045_data_visibility_rls_policies.sql` - RLS Policies

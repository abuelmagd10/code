# 📋 قائمة الإهلاكات - معايير الواجهة الموحدة

## 📋 نظرة عامة

هذا المستند يحدد المعايير الموحدة لعرض قائمة الإهلاكات (Inventory Write-offs List) لتتوافق مع نمط القوائم الأخرى في النظام (فواتير، أوامر بيع، مشتريات).

---

## 1️⃣ الأعمدة الرسمية (Official Columns)

### ترتيب الأعمدة (من اليسار إلى اليمين):

| # | العمود | المفتاح | النوع | المحاذاة | العرض | ملاحظات |
|---|--------|---------|------|----------|-------|----------|
| 1 | رقم الإهلاك | `write_off_number` | text | left | min-w-[120px] | font-mono, blue color |
| 2 | التاريخ | `write_off_date` | date | right | w-32 | تنسيق YYYY-MM-DD |
| 3 | الفرع | `branch_name` | text | left | - | hidden on md, من branches table |
| 4 | المخزن | `warehouse_name` | text | left | - | hidden on lg, من warehouses table |
| 5 | النوع / السبب | `reason` | text | left | - | hidden on sm, من WRITE_OFF_REASONS |
| 6 | المنتجات | `products_summary` | custom | left | min-w-[200px] | ملخص المنتجات + عدد البنود |
| 7 | إجمالي الكمية | `total_quantity` | number | right | w-28 | مجموع الكميات من items |
| 8 | إجمالي التكلفة | `total_cost` | currency | right | w-36 | تنسيق عملة |
| 9 | الحالة | `status` | status | center | w-32 | StatusBadge component |
| 10 | أنشئ بواسطة | `created_by_name` | text | left | - | hidden on xl, من user_profiles |
| 11 | الإجراءات | `id` | actions | center | w-24 | أزرار العرض/التعديل/الاعتماد |

---

## 2️⃣ عمود المنتجات (Products Column)

### المحتوى:

يعرض ملخص المنتجات في الإهلاك:

**التنسيق:**
- **منتج واحد:** `product_name (items_count)`
- **منتجان أو أكثر:** `product1, product2 (+remaining_count)`
- **لا منتجات:** `-`

**مثال:**
```
boom (2)
```

```
boom, oil (+3)
```

**التفاصيل:**
- يعرض أول منتج أو منتجين
- يظهر عدد البنود الإجمالي
- إذا كان هناك أكثر من منتجين، يظهر `(+N)` للباقي

---

## 3️⃣ صف المجموع (Footer Totals Row)

### القاعدة الذهبية:

✅ **صف المجموع يستخدم نفس Grid / Column Layout المستخدم في رأس الجدول وصفوف البيانات**

⚠️ **ممنوع:**
- ❌ استخدام colspan كبير يزيح الأعمدة
- ❌ وضع المجموع في جدول منفصل أو Grid مختلف
- ❌ إزاحة أو دمج أعمدة غير مضبوط

### الموقع:

في أسفل الجدول، داخل `<tfoot>`

### المحتوى:

| # | العمود | المحتوى | المحاذاة |
|---|--------|---------|----------|
| 1 | رقم الإهلاك | "المجموع (N إهلاك)" | left |
| 2 | التاريخ | فارغ | - |
| 3 | الفرع | فارغ | - |
| 4 | المخزن | فارغ | - |
| 5 | النوع / السبب | فارغ | - |
| 6 | المنتجات | فارغ | - |
| 7 | إجمالي الكمية | مجموع الكميات | right |
| 8 | إجمالي التكلفة | مجموع التكاليف | right |
| 9 | الحالة | فارغ | - |
| 10 | أنشئ بواسطة | فارغ | - |
| 11 | الإجراءات | فارغ | - |

### التنسيق الصحيح:

```tsx
<tr>
  {/* ✅ العمود الأول: كلمة "المجموع" */}
  <td className="px-3 py-4 text-left">
    <span className="text-gray-700 dark:text-gray-200 font-semibold">
      {isAr ? "المجموع" : "Total"} ({filteredWriteOffs.length} {isAr ? "إهلاك" : "write-offs"})
    </span>
  </td>
  {/* ✅ الأعمدة غير الرقمية: فارغة (date, branch, warehouse, reason, products) */}
  <td className="px-3 py-4"></td>
  <td className="px-3 py-4"></td>
  <td className="px-3 py-4"></td>
  <td className="px-3 py-4"></td>
  <td className="px-3 py-4"></td>
  {/* ✅ عمود إجمالي الكمية */}
  <td className="px-3 py-4 text-right">
    <span className="font-semibold text-gray-900 dark:text-white">
      {totals.totalQuantity.toLocaleString()}
    </span>
  </td>
  {/* ✅ عمود إجمالي التكلفة */}
  <td className="px-3 py-4 text-right">
    <span className="font-semibold text-gray-900 dark:text-white">
      {formatCurrency(totals.totalCost)}
    </span>
  </td>
  {/* ✅ الأعمدة بعد المجموع: فارغة (status, created_by, actions) */}
  <td className="px-3 py-4"></td>
  <td className="px-3 py-4"></td>
  <td className="px-3 py-4"></td>
</tr>
```

### قواعد المحاذاة (Alignment Rules):

- ✅ **الكميات** → `align: right`
- ✅ **التكاليف** → `align: right`
- ✅ **كلمة "المجموع"** → `align: left`
- ✅ **الأعمدة الأخرى** → فارغة

### قواعد المجموع:

- ✅ يتأثر بالفلاتر (status, dateFrom, dateTo)
- ✅ يتأثر بالبحث (إذا أُضيف في المستقبل)
- ✅ يتأثر بالفرع/المخزن (من loadData filtering)
- ⚠️ **لا يتأثر بـ Pagination** (يعرض مجموع جميع البيانات المفلترة)

### Totals Row Rules (قواعد صف المجموع):

#### ✅ القاعدة الذهبية:
- صف المجموع يستخدم **نفس تعريف الأعمدة** المستخدم في Header و Body
- **ممنوع** Grid مختلف
- **ممنوع** إزاحة أو دمج أعمدة غير مضبوط

#### ✅ المحاذاة الصحيحة:
- كل مجموع يجب أن يكون **تحت العمود الصحيح** دائمًا
- لا يتحرك مع Pagination
- لا يتأثر بعرض الشاشة
- عند تغيير الفلاتر/الفرع/المخزن/البحث، يبقى المجموع تحت نفس العمود

#### ✅ البنية الصحيحة:
1. **العمود الأول (رقم الإهلاك):** كلمة "المجموع"
2. **الأعمدة 2-6 (غير رقمية):** فارغة
3. **العمود 7 (إجمالي الكمية):** مجموع الكميات
4. **العمود 8 (إجمالي التكلفة):** مجموع التكاليف
5. **الأعمدة 9-11 (بعد المجموع):** فارغة

#### ⚠️ ممنوع:
- ❌ استخدام `colSpan` كبير يزيح الأعمدة الرقمية
- ❌ وضع المجموع في عمود غير مخصص له
- ❌ استخدام Grid أو Table منفصل للمجموع

---

## 4️⃣ قواعد الأداء (Performance Rules)

### ✅ Aggregation Query:

**لا يتم تحميل تفاصيل البنود كاملة لكل سجل**

بدلاً من ذلك:

1. **جلب write-offs** مع JOIN للحصول على:
   - `branch_name` من `branches`
   - `warehouse_name` من `warehouses`
   - `created_by_name` من `user_profiles`

2. **جلب items مع aggregation**:
   ```typescript
   const { data: itemsData } = await supabase
     .from("inventory_write_off_items")
     .select("write_off_id, quantity, products(name)")
     .in("write_off_id", writeOffIds)
   ```

3. **حساب محلي:**
   - `total_quantity = sum(quantity)` لكل write-off
   - `items_count = count(items)` لكل write-off
   - `products_summary` من أول منتج أو اثنين

### ⚠️ ممنوع:

- ❌ تحميل كل `write_off_items` لكل سجل في query منفصل
- ❌ تحميل `items` كاملة في القائمة الرئيسية
- ❌ N+1 queries

### ✅ مسموح:

- ✅ جلب items في batch واحد لجميع write-offs
- ✅ حساب aggregation محلياً
- ✅ عرض ملخص فقط في القائمة

---

## 5️⃣ نمط الحالات (Status Badges)

### Component المستخدم:

```tsx
<StatusBadge status={row.status} lang={appLang} />
```

### الحالات المدعومة:

| الحالة | اللون | التسمية (AR) | التسمية (EN) |
|--------|-------|--------------|--------------|
| `pending` | أصفر | قيد الانتظار | Pending |
| `approved` | أخضر | موافق عليه | Approved |
| `rejected` | أحمر | مرفوض | Rejected |
| `cancelled` | رمادي | ملغي | Cancelled |
| `locked` | رمادي | مقفل | Locked |

### الألوان:

- **pending:** `bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`
- **approved:** `bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`
- **rejected:** `bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`
- **cancelled:** `bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200`
- **locked:** `bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200`

---

## 6️⃣ Pagination

### الإعدادات الافتراضية:

- **Page Size:** 20 عنصر
- **Options:** [10, 20, 50, 100]

### Component المستخدم:

```tsx
<DataPagination
  currentPage={currentPage}
  totalPages={totalPages}
  totalItems={totalItems}
  pageSize={pageSize}
  onPageChange={goToPage}
  onPageSizeChange={handlePageSizeChange}
  lang={appLang}
/>
```

---

## 7️⃣ Sorting

### الأعمدة القابلة للترتيب:

- ✅ `write_off_date` (افتراضي: DESC)
- ✅ `total_cost` (افتراضي: DESC)
- ✅ `status` (افتراضي: حسب الأولوية)

### التطبيق:

يتم الترتيب في `loadData`:

```typescript
query = query.order("created_at", { ascending: false })
```

---

## 8️⃣ Filtering

### الفلاتر المدعومة:

1. **الحالة (Status):**
   - All, Pending, Approved, Rejected, Cancelled

2. **التاريخ:**
   - From Date (`dateFrom`)
   - To Date (`dateTo`)

3. **الفرع/المخزن:**
   - يتم تلقائياً حسب صلاحيات المستخدم

### التطبيق:

```typescript
if (statusFilter !== "all") query = query.eq("status", statusFilter)
if (dateFrom) query = query.gte("write_off_date", dateFrom)
if (dateTo) query = query.lte("write_off_date", dateTo)
```

---

## 9️⃣ Component الموحد

### DataTable Component:

```tsx
<DataTable
  columns={tableColumns}
  data={paginatedWriteOffs}
  keyField="id"
  lang={appLang}
  emptyMessage={isAr ? "لا توجد إهلاكات" : "No write-offs found"}
  footer={{
    render: () => (
      // Footer totals row
    )
  }}
/>
```

### المميزات:

- ✅ محاذاة تلقائية حسب نوع العمود
- ✅ Responsive design (hidden columns على breakpoints)
- ✅ Sticky header
- ✅ Hover effects
- ✅ Empty state
- ✅ Footer support

---

## 🔟 أمثلة API

### جلب البيانات:

```typescript
// 1. جلب write-offs
const { data: wos } = await supabase
  .from("inventory_write_offs")
  .select("*")
  .eq("company_id", cid)
  .eq("status", statusFilter !== "all" ? statusFilter : undefined)
  .gte("write_off_date", dateFrom || undefined)
  .lte("write_off_date", dateTo || undefined)
  .order("created_at", { ascending: false })

// 2. جلب branches
const { data: branchesData } = await supabase
  .from("branches")
  .select("id, name")
  .in("id", branchIds)

// 3. جلب warehouses
const { data: warehousesData } = await supabase
  .from("warehouses")
  .select("id, name")
  .in("id", warehouseIds)

// 4. جلب user profiles
const { data: usersData } = await supabase
  .from("user_profiles")
  .select("user_id, display_name")
  .in("user_id", userIds)

// 5. جلب items (Aggregation)
const { data: itemsData } = await supabase
  .from("inventory_write_off_items")
  .select("write_off_id, quantity, products(name)")
  .in("write_off_id", writeOffIds)
```

---

## 1️⃣1️⃣ قواعد المجموع (Totals Calculation)

### الحساب:

```typescript
const totals = useMemo(() => {
  return {
    totalQuantity: filteredWriteOffs.reduce((sum, wo) => sum + (wo.total_quantity || 0), 0),
    totalCost: filteredWriteOffs.reduce((sum, wo) => sum + (wo.total_cost || 0), 0)
  }
}, [filteredWriteOffs])
```

### القواعد:

- ✅ يعتمد على `filteredWriteOffs` (بعد الفلترة)
- ✅ يتأثر بالفلاتر (status, dateFrom, dateTo)
- ✅ يتأثر بالفرع/المخزن (من loadData)
- ⚠️ **لا يتأثر بـ Pagination** (يعرض مجموع جميع البيانات المفلترة)

---

## 1️⃣2️⃣ التوافق مع النظام

### نفس النمط المستخدم في:

- ✅ `app/invoices/page.tsx`
- ✅ `app/purchase-orders/page.tsx`
- ✅ `app/sales-orders/page.tsx`

### المكونات المشتركة:

- ✅ `DataTable` component
- ✅ `StatusBadge` component
- ✅ `DataPagination` component
- ✅ `PageHeaderList` component
- ✅ نفس الألوان والأنماط
- ✅ نفس Hover effects
- ✅ نفس Responsive behavior

---

## 1️⃣3️⃣ حالات الاستخدام

### Use Case 1: عرض قائمة الإهلاكات

**السيناريو:**
- المستخدم يفتح صفحة "إهلاك المخزون"
- يرى قائمة بجميع الإهلاكات

**النتيجة المتوقعة:**
- ✅ جدول موحد مع باقي القوائم
- ✅ جميع الأعمدة مصطفّة بدقة
- ✅ يظهر ملخص المنتجات لكل إهلاك
- ✅ صف المجموع في الأسفل

### Use Case 2: فلترة حسب الحالة

**السيناريو:**
- المستخدم يختار فلتر "قيد الانتظار"
- يرى فقط الإهلاكات pending

**النتيجة المتوقعة:**
- ✅ القائمة تُفلتر فوراً
- ✅ صف المجموع يُحدث تلقائياً
- ✅ Pagination يُحدث

### Use Case 3: عرض المنتجات

**السيناريو:**
- المستخدم يرى عمود "المنتجات"
- يريد معرفة محتوى الإهلاك

**النتيجة المتوقعة:**
- ✅ يرى أول منتج أو منتجين
- ✅ يرى عدد البنود الإجمالي
- ✅ إذا كان هناك أكثر، يرى `(+N)`

---

## 1️⃣4️⃣ الخلاصة

✅ **الأعمدة:** 11 عمود موحد مع باقي النظام

✅ **المنتجات:** عمود جديد يعرض ملخص المنتجات

✅ **المجموع:** صف footer احترافي مع مجموع الكميات والتكاليف

✅ **الحالات:** StatusBadge component موحد

✅ **الأداء:** Aggregation queries، لا تحميل items كاملة

✅ **Pagination:** موحد مع باقي القوائم

✅ **التصميم:** نفس النمط والألوان والسلوك

---

**آخر تحديث:** 2026-01-23

## Accounting & Inventory Pattern – Sales, Returns, Purchases (Canonical)

هذه الوثيقة هي **المرجع الوحيد (Single Source of Truth)** للنمط المحاسبي والمخزني المعتمد في النظام.  
أي كود جديد (واجهات، API، سكربتات SQL، أو إصلاحات) **يجب** أن يلتزم بهذه القواعد، وأي انحراف عنها يعد Bug.

---

### 1. Sales Invoices – حالات الفاتورة

**Draft**
- لا يتم إنشاء أي `journal_entries`.
- لا يتم إنشاء أي `inventory_transactions`.

**Sent**
- يتم خصم المخزون فقط من خلال `inventory_transactions` من نوع `"sale"`.
- يمنع تمامًا إنشاء أي قيود محاسبية (مبيعات، ذمم، COGS، ضرائب).

**Paid / Partially Paid**
- عند **أول دفعة فقط**:
  - إنشاء قيد الفاتورة `reference_type = 'invoice'`.
  - إنشاء قيد تكلفة البضاعة `reference_type = 'invoice_cogs'`.
  - إنشاء قيد الدفع `reference_type = 'invoice_payment'`.
- في الدفعات اللاحقة:
  - إنشاء قيود دفع إضافية فقط (`invoice_payment`) بدون COGS إضافي وبدون أي حركات مخزون جديدة.

---

### 2. Sales Returns – مرتجعات فواتير البيع

**Partial Return**
- إعادة الكميات المرتجعة فقط إلى المخزون (`inventory_transactions` من نوع `"sale_return"`).
- إنشاء قيد مرتجع جزئي (`reference_type = 'sales_return'`).
- إنشاء عكس COGS للجزء المرتجع فقط (`reference_type = 'sales_return_cogs'` أو ما يعادله).
- إذا كانت الفاتورة مدفوعة → إنشاء رصيد دائن للعميل (`customer_credits`).

**Full Return**
- إعادة كل الكميات إلى المخزون (`sale_return` على كامل الكمية).
- إنشاء قيد مرتجع كامل.
- إنشاء عكس COGS كامل.
- تحويل كامل مبلغ الفاتورة إلى رصيد دائن للعميل (Customer Credit) أو تسوية مكافئة.

**Guards**
- يمنع إنشاء مرتجع لفاتورة ملغاة أو غير مؤهلة بحسب حالة الفاتورة.

---

### 3. Purchase Bills – النمط العكسي

**Draft**
- لا قيود محاسبية ولا حركات مخزون.

**Sent / Received**
- زيادة المخزون فقط (`inventory_transactions` من نوع `"purchase"`).
- لا يتم إنشاء أي قيود محاسبية في هذه المرحلة.

**First Payment**
- إنشاء قيد الفاتورة `reference_type = 'bill'`.
- إنشاء قيد الدفع `reference_type = 'bill_payment'`.

**Subsequent Payments**
- إنشاء قيود دفع فقط (`bill_payment`) بدون أي حركات مخزون إضافية.

---

### 4. Purchase Returns – Vendor Credits

- تقليل المخزون (`inventory_transactions` من نوع `"purchase_return"`).
- تقليل حسابات الموردين `AP` (حسابات دائنة).
- عكس ضريبة المشتريات عند وجودها.

---

### 5. Non‑Negotiable Guards (لا يمكن التنازل عنها)

يمنع:
- أي `inventory_transactions` بدون `reference_id` صحيح (Sale / Purchase / Returns).
- أي `journal_entry` غير متوازن (مجموع المدين ≠ مجموع الدائن).
- أي `invoice_payment` بدون وجود `invoice` أصلي.
- أي COGS (`invoice_cogs` أو ما يعادله) بدون وجود فاتورة **مدفوعة أو مدفوعة جزئيًا**.
- عند الرجوع من `sent` إلى `draft` أو `cancelled`:
  - يتم عكس المخزون فقط.
  - لا يتم عكس COGS إلا إذا كان قيد COGS موجودًا أصلًا.

أي Feature جديد (تقارير، API، إصلاحات، ETL) يجب أن يُراجع صراحةً مقابل هذه الوثيقة قبل الدمج.



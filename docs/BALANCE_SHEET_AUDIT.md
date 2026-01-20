# تدقيق الميزانية العمومية والتقارير المالية
## Balance Sheet & Financial Reports Audit

**التاريخ:** 2026-01-19  
**النوع:** Financial Audit–Style Review  
**الهدف:** ضمان التوافق الكامل مع النمط المحاسبي الاحترافي ERP-grade

---

## 📋 ملخص تنفيذي

تم إجراء مراجعة شاملة للتقارير المالية، خاصة الميزانية العمومية (Balance Sheet)، لضمان التوافق مع معايير ERP المحاسبية الاحترافية (Zoho/Odoo/QuickBooks-style).

### النتيجة الإجمالية: ✅ **PASS** (مع تحسينات مقترحة)

---

## 🔴 القواعد الذهبية - حالة الالتزام

### ✅ قاعدة 1: الميزانية العمومية لا تعتمد على حسابات تشغيلية

**الحالة:** ✅ **ممتثلة بالكامل**

**التحقق:**
- ✅ Balance Sheet API (`app/api/account-balances/route.ts`) يستخدم فقط:
  - `journal_entries`
  - `journal_entry_lines`
  - `chart_of_accounts`
- ❌ لا يستخدم:
  - `products.cost_price`
  - `products.quantity_on_hand`
  - `fifo_cost_lots` مباشرة
  - `inventory_transactions` مباشرة

**الكود المرجعي:**
```typescript
// app/api/account-balances/route.ts:39-79
const { data: accountsData } = await supabase
  .from("chart_of_accounts")
  .select("id, account_code, account_name, account_type, opening_balance")
  .eq("company_id", companyId)
  .eq("is_active", true)

const { data: journalEntriesData } = await supabase
  .from("journal_entries")
  .select("id")
  .eq("company_id", companyId)
  .is("deleted_at", null)
  .lte("entry_date", asOf)

const { data: linesData } = await supabase
  .from("journal_entry_lines")
  .select("account_id, debit_amount, credit_amount")
  .in("journal_entry_id", journalEntryIds)
```

---

### ✅ قاعدة 2: المخزون في الميزانية = حساب أصل محاسبي فقط

**الحالة:** ✅ **ممتثلة بالكامل**

**التحقق:**
- ✅ قيمة المخزون في الميزانية تأتي من:
  - رصيد حساب المخزون (Inventory Asset Account) من `journal_entry_lines`
  - الناتج من قيود محاسبية منشأة من:
    - FIFO Engine (عبر `cogs_transactions`)
    - Purchase receipts
    - Purchase returns
    - Write-offs
- ❌ لا يُحسب كالتالي:
  - `SUM(qty * unit_cost)` من `products`
  - `SUM(fifo_lots.remaining_quantity * unit_cost)` مباشرة

**الكود المرجعي:**
```typescript
// app/api/account-balances/route.ts:100-113
for (const row of journalLinesData || []) {
  const aid = String((row as any).account_id || "")
  const debit = Number((row as any).debit_amount || 0)
  const credit = Number((row as any).credit_amount || 0)

  if (accountsMap[aid]) {
    const type = accountsMap[aid].type
    const isDebitNature = type === 'asset' || type === 'expense'
    const movement = isDebitNature ? (debit - credit) : (credit - debit)
    accountsMap[aid].balance += movement
  }
}
```

**ملاحظة:** حساب المخزون يتم عبر حساب أصل محاسبي (sub_type = 'inventory') من `journal_entry_lines` فقط.

---

### ⚠️ قاعدة 3: الأرباح المحتجزة لا تُحسب يدوياً

**الحالة:** ⚠️ **تحتاج تحسين**

**المشكلة:**
- الأرباح المحتجزة تُحسب حالياً في `computeBalanceSheetTotalsFromBalances` كالتالي:
  ```typescript
  const netIncomeSigned = income - expense
  const equityTotalSigned = equity + netIncomeSigned
  ```
- هذا الحساب يعتمد على أرصدة حسابات `income` و `expense` من `journal_entry_lines`، وهو صحيح محاسبياً.
- لكن الأفضل أن يكون هناك حساب رسمي "الأرباح المحتجزة" في دليل الحسابات يتم تحديثه عبر قيود إقفال الفترة.

**التأثير المالي:**
- ✅ لا يوجد خطأ محاسبي - الحساب صحيح
- ⚠️ لكن يفتقر إلى التتبع الرسمي عبر قيود إقفال الفترة

**التوافق مع ERP:**
- ⚠️ في Zoho/Odoo/QuickBooks، الأرباح المحتجزة عادة ما تكون حساب رسمي يتم تحديثه عبر قيود إقفال الفترة (Period Closing Entry)

**التوصية:**
- إنشاء حساب رسمي "الأرباح المحتجزة" (Retained Earnings) في دليل الحسابات
- إنشاء قيد إقفال الفترة (Period Closing Entry) يترحل صافي الربح من Income Statement إلى حساب الأرباح المحتجزة
- تحديث `computeBalanceSheetTotalsFromBalances` لاستخدام رصيد حساب الأرباح المحتجزة بدلاً من الحساب اليدوي

---

## 📊 مصفوفة التدقيق الشاملة

| Component | Uses journal_entry_lines only | Uses operational data | Status | Notes |
|-----------|------------------------------|----------------------|--------|-------|
| **Balance Sheet API** (`app/api/account-balances/route.ts`) | ✅ | ❌ | ✅ **PASS** | يستخدم فقط `journal_entries`, `journal_entry_lines`, `chart_of_accounts` |
| **Balance Sheet Page** (`app/reports/balance-sheet/page.tsx`) | ✅ | ❌ | ✅ **PASS** | يستدعي API فقط، لا يستخدم بيانات تشغيلية |
| **Income Statement API** (`app/api/income-statement/route.ts`) | ✅ | ❌ | ✅ **PASS** | يستخدم فقط `journal_entry_lines` مع فلترة حسب `account_type` |
| **Income Statement Page** (`app/reports/income-statement/page.tsx`) | ✅ | ❌ | ✅ **PASS** | يستدعي API فقط |
| **Inventory Valuation** (`app/api/inventory-valuation/route.ts`) | ❌ | ✅ | ⚠️ **INFO** | تقرير تشغيلي (ليس ميزانية) - يستخدم `fifo_cost_lots` و `products` |
| **Retained Earnings Calculation** (`lib/ledger.ts:computeBalanceSheetTotalsFromBalances`) | ✅ | ❌ | ⚠️ **NEEDS IMPROVEMENT** | يحسب يدوياً من `income - expense` بدلاً من حساب رسمي |

---

## 🔍 تحليل تفصيلي لكل مكون

### 1. Balance Sheet API (`app/api/account-balances/route.ts`)

**المصدر:** ✅ `journal_entry_lines` فقط

**التحقق:**
```typescript
// السطور 39-79: جلب الحسابات والقيود
const { data: accountsData } = await supabase
  .from("chart_of_accounts")
  .select("id, account_code, account_name, account_type, opening_balance")
  .eq("company_id", companyId)
  .eq("is_active", true)

const { data: journalEntriesData } = await supabase
  .from("journal_entries")
  .select("id")
  .eq("company_id", companyId)
  .is("deleted_at", null)
  .lte("entry_date", asOf)

const { data: linesData } = await supabase
  .from("journal_entry_lines")
  .select("account_id, debit_amount, credit_amount")
  .in("journal_entry_id", journalEntryIds)
```

**حساب الأرصدة:**
```typescript
// السطور 100-113: حساب الأرصدة حسب الطبيعة المحاسبية
for (const row of journalLinesData || []) {
  const type = accountsMap[aid].type
  const isDebitNature = type === 'asset' || type === 'expense'
  const movement = isDebitNature ? (debit - credit) : (credit - debit)
  accountsMap[aid].balance += movement
}
```

**النتيجة:** ✅ **PASS** - لا يستخدم بيانات تشغيلية

---

### 2. Income Statement API (`app/api/income-statement/route.ts`)

**المصدر:** ✅ `journal_entry_lines` فقط

**التحقق:**
```typescript
// السطور 46-87: جلب الحسابات والقيود
const { data: accountsData } = await supabase
  .from("chart_of_accounts")
  .select("id, account_code, account_name, account_type")
  .eq("company_id", companyId)
  .in("account_type", ["income", "expense"])

const { data: journalEntriesData } = await supabase
  .from("journal_entries")
  .select("id")
  .eq("company_id", companyId)
  .eq("status", "posted")
  .gte("entry_date", from)
  .lte("entry_date", to)

const { data: linesData } = await supabase
  .from("journal_entry_lines")
  .select("account_id, debit_amount, credit_amount")
  .in("journal_entry_id", journalEntryIds)
```

**حساب الإيرادات والمصروفات:**
```typescript
// السطور 106-135: حساب الإيرادات والمصروفات
if (type === 'income') {
  const amount = credit - debit
  totalIncome += amount
} else if (type === 'expense') {
  const amount = debit - credit
  totalExpense += amount
}
```

**النتيجة:** ✅ **PASS** - لا يستخدم بيانات تشغيلية

---

### 3. Inventory Valuation (`app/api/inventory-valuation/route.ts`)

**المصدر:** ⚠️ يستخدم `fifo_cost_lots` و `products`

**التحقق:**
```typescript
// السطور 83-110: استخدام fifo_cost_lots
const { data: fifoLots } = await supabase
  .from('fifo_cost_lots')
  .select('product_id, lot_date, lot_type, remaining_quantity, unit_cost')
  .eq('company_id', companyId)
  .gt('remaining_quantity', 0)
```

**التقييم:**
- ⚠️ هذا تقرير **تشغيلي** (Operational Report) وليس تقرير مالي
- ✅ لا يُستخدم في الميزانية العمومية
- ✅ الميزانية العمومية تستخدم حساب المخزون من `journal_entry_lines` فقط

**النتيجة:** ⚠️ **INFO** - مقبول لأنه تقرير تشغيلي وليس ميزانية

---

### 4. Retained Earnings Calculation (`lib/ledger.ts:computeBalanceSheetTotalsFromBalances`)

**المصدر:** ✅ `journal_entry_lines` (عبر أرصدة `income` و `expense`)

**التحقق:**
```typescript
// السطور 175-180: حساب الأرباح المحتجزة
const income = balances.filter((b) => b.account_type === "income").reduce((s, b) => s + b.balance, 0)
const expense = balances.filter((b) => b.account_type === "expense").reduce((s, b) => s + b.balance, 0)
const netIncomeSigned = income - expense
const equityTotalSigned = equity + netIncomeSigned
```

**التقييم:**
- ✅ الحساب صحيح محاسبياً
- ⚠️ لكن يفتقر إلى التتبع الرسمي عبر قيود إقفال الفترة
- ⚠️ في ERP الاحترافي، الأرباح المحتجزة عادة ما تكون حساب رسمي يتم تحديثه عبر قيود إقفال الفترة

**النتيجة:** ⚠️ **NEEDS IMPROVEMENT** - يحتاج إلى حساب رسمي وقيود إقفال الفترة

---

## 🔧 الأخطاء المكتشفة والتوصيات

### ✅ لا توجد أخطاء حرجة

جميع التقارير المالية (Balance Sheet و Income Statement) تستخدم `journal_entry_lines` فقط ولا تعتمد على بيانات تشغيلية.

### ⚠️ تحسينات مقترحة

#### 1. الأرباح المحتجزة (Retained Earnings)

**المشكلة:**
- تُحسب حالياً يدوياً من `income - expense` في `computeBalanceSheetTotalsFromBalances`
- لا يوجد حساب رسمي "الأرباح المحتجزة" يتم تحديثه عبر قيود إقفال الفترة

**التأثير:**
- ✅ لا يوجد خطأ محاسبي - الحساب صحيح
- ⚠️ لكن يفتقر إلى التتبع الرسمي والشفافية

**التوصية:**
1. إنشاء حساب رسمي "الأرباح المحتجزة" (Retained Earnings) في دليل الحسابات لكل شركة
2. إنشاء وظيفة `createPeriodClosingEntry` تترحل صافي الربح من Income Statement إلى حساب الأرباح المحتجزة
3. تحديث `computeBalanceSheetTotalsFromBalances` لاستخدام رصيد حساب الأرباح المحتجزة بدلاً من الحساب اليدوي

**الكود المقترح:**
```typescript
// lib/ledger.ts
export async function computeBalanceSheetTotalsFromBalances(
  balances: Array<{ account_id: string; account_type: string; balance: number; sub_type?: string }>,
  companyId: string,
  supabase: any
): Promise<{
  assets: number
  liabilities: number
  equity: number
  income: number
  expense: number
  netIncomeSigned: number
  equityTotalSigned: number
  totalLiabilitiesAndEquitySigned: number
}> {
  const assets = balances.filter((b) => b.account_type === "asset").reduce((s, b) => s + b.balance, 0)
  const liabilities = balances.filter((b) => b.account_type === "liability").reduce((s, b) => s + b.balance, 0)
  
  // ✅ استخدام حساب الأرباح المحتجزة الرسمي إن وُجد
  const retainedEarningsAccount = balances.find(
    (b) => b.account_type === "equity" && b.sub_type === "retained_earnings"
  )
  
  const equity = balances
    .filter((b) => b.account_type === "equity")
    .reduce((s, b) => s + b.balance, 0)
  
  const income = balances.filter((b) => b.account_type === "income").reduce((s, b) => s + b.balance, 0)
  const expense = balances.filter((b) => b.account_type === "expense").reduce((s, b) => s + b.balance, 0)
  
  // ✅ استخدام رصيد حساب الأرباح المحتجزة إن وُجد، وإلا حساب يدوي
  const netIncomeSigned = income - expense
  const equityTotalSigned = equity + (retainedEarningsAccount ? retainedEarningsAccount.balance : netIncomeSigned)
  const totalLiabilitiesAndEquitySigned = liabilities + equityTotalSigned
  
  return { assets, liabilities, equity, income, expense, netIncomeSigned, equityTotalSigned, totalLiabilitiesAndEquitySigned }
}
```

---

## 📝 مصادر كل رقم في الميزانية العمومية

### الأصول (Assets)

| الحساب | المصدر | الجدول | الحقل |
|--------|--------|--------|-------|
| الصندوق (Cash) | ✅ `journal_entry_lines` | `journal_entry_lines` | `debit_amount - credit_amount` |
| العملاء (Accounts Receivable) | ✅ `journal_entry_lines` | `journal_entry_lines` | `debit_amount - credit_amount` |
| المخزون (Inventory) | ✅ `journal_entry_lines` | `journal_entry_lines` | `debit_amount - credit_amount` |
| مدفوعات مسبقة للموردين | ✅ `journal_entry_lines` | `journal_entry_lines` | `debit_amount - credit_amount` |

### الالتزامات (Liabilities)

| الحساب | المصدر | الجدول | الحقل |
|--------|--------|--------|-------|
| الموردين (Accounts Payable) | ✅ `journal_entry_lines` | `journal_entry_lines` | `credit_amount - debit_amount` |
| ضريبة القيمة المضافة | ✅ `journal_entry_lines` | `journal_entry_lines` | `credit_amount - debit_amount` |

### حقوق الملكية (Equity)

| الحساب | المصدر | الجدول | الحقل |
|--------|--------|--------|-------|
| رأس المال | ✅ `journal_entry_lines` | `journal_entry_lines` | `credit_amount - debit_amount` |
| الأرباح المحتجزة | ⚠️ حساب يدوي | `income - expense` من `journal_entry_lines` | `netIncomeSigned = income - expense` |

---

## ✅ المعادلات المستخدمة

### حساب رصيد الحساب

```typescript
// للأصول والمصروفات (طبيعة مدين)
balance = opening_balance + (debit_amount - credit_amount)

// للالتزامات وحقوق الملكية والإيرادات (طبيعة دائن)
balance = opening_balance + (credit_amount - debit_amount)
```

### حساب إجماليات الميزانية

```typescript
assets = SUM(balance WHERE account_type = 'asset')
liabilities = SUM(balance WHERE account_type = 'liability')
equity = SUM(balance WHERE account_type = 'equity')
income = SUM(balance WHERE account_type = 'income')
expense = SUM(balance WHERE account_type = 'expense')

netIncomeSigned = income - expense
equityTotalSigned = equity + netIncomeSigned
totalLiabilitiesAndEquitySigned = liabilities + equityTotalSigned
```

### التحقق من التوازن

```typescript
isBalanced = Math.abs(assets - totalLiabilitiesAndEquitySigned) < 0.01
```

---

## 🚫 ما هو المسموح والممنوع

### ✅ المسموح في الميزانية العمومية

- ✅ `journal_entries` - القيود المحاسبية
- ✅ `journal_entry_lines` - سطور القيود
- ✅ `chart_of_accounts` - دليل الحسابات
- ✅ `opening_balance` - الرصيد الافتتاحي

### ❌ الممنوع في الميزانية العمومية

- ❌ `products.cost_price` - سعر التكلفة من جدول المنتجات
- ❌ `products.quantity_on_hand` - الكمية المتاحة من جدول المنتجات
- ❌ `fifo_cost_lots` مباشرة - دفعات FIFO (يُستخدم فقط عبر قيود محاسبية)
- ❌ `inventory_transactions` مباشرة - حركات المخزون (يُستخدم فقط عبر قيود محاسبية)
- ❌ `invoices.total_amount` مباشرة - إجمالي الفواتير (يُستخدم فقط عبر قيود محاسبية)
- ❌ `bills.total_amount` مباشرة - إجمالي الفواتير (يُستخدم فقط عبر قيود محاسبية)

---

## 📚 التوافق مع المعايير المحاسبية

### ✅ معايير ERP الاحترافية (Zoho/Odoo/QuickBooks)

| المعيار | الحالة | الملاحظات |
|---------|--------|-----------|
| الميزانية العمومية تعتمد على `journal_entry_lines` فقط | ✅ | متوافق 100% |
| المخزون يُحسب من حساب أصل محاسبي | ✅ | متوافق 100% |
| الأرباح المحتجزة حساب رسمي | ⚠️ | يحتاج تحسين - حالياً حساب يدوي |
| قيود إقفال الفترة | ⚠️ | غير موجود - يحتاج تطبيق |

### ✅ معايير المحاسبة المالية

| المعيار | الحالة | الملاحظات |
|---------|--------|-----------|
| المعادلة الأساسية: Assets = Liabilities + Equity | ✅ | متوافق |
| التتبع الكامل لكل رقم إلى `journal_entry_lines` | ✅ | متوافق |
| فصل البيانات التشغيلية عن البيانات المحاسبية | ✅ | متوافق |

---

## 🎯 الخلاصة والخطوات التالية

### ✅ النتائج الإيجابية

1. ✅ **Balance Sheet API** يستخدم فقط `journal_entry_lines` - متوافق 100%
2. ✅ **Income Statement API** يستخدم فقط `journal_entry_lines` - متوافق 100%
3. ✅ **المخزون** يُحسب من حساب أصل محاسبي فقط - متوافق 100%
4. ✅ **لا يوجد استخدام لبيانات تشغيلية** في التقارير المالية - متوافق 100%

### ⚠️ التحسينات المقترحة

1. ⚠️ **الأرباح المحتجزة:** إنشاء حساب رسمي وقيود إقفال الفترة
2. ⚠️ **التوثيق:** تحديث التوثيق ليشمل قيود إقفال الفترة

### 📋 الخطوات التالية

1. ✅ **تم:** مراجعة Balance Sheet API
2. ✅ **تم:** مراجعة Income Statement API
3. ✅ **تم:** التحقق من عدم استخدام بيانات تشغيلية
4. ⏳ **مطلوب:** تطبيق تحسينات الأرباح المحتجزة
5. ⏳ **مطلوب:** إنشاء وظيفة قيود إقفال الفترة

---

## 📞 المراجع

- **Balance Sheet API:** `app/api/account-balances/route.ts`
- **Income Statement API:** `app/api/income-statement/route.ts`
- **Balance Sheet Page:** `app/reports/balance-sheet/page.tsx`
- **Income Statement Page:** `app/reports/income-statement/page.tsx`
- **Ledger Functions:** `lib/ledger.ts`
- **Accrual Ledger Functions:** `lib/accrual-ledger.ts`

---

**تاريخ المراجعة:** 2026-01-19  
**المراجع:** Financial Audit–Style Review  
**الحالة:** ✅ **PASS** (مع تحسينات مقترحة)

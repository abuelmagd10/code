# 🔧 إصلاحات سريعة للنمط المحاسبي - المشاكل الحرجة

## 🎯 الهدف
إصلاح المشاكل الحرجة المكتشفة في مراجعة النمط المحاسبي بأسرع وقت ممكن.

---

## 🚨 الإصلاح 1: Middleware للتحقق من النمط المحاسبي

### المشكلة:
عدم وجود تحقق شامل من النمط المحاسبي على مستوى API.

### الحل:
```typescript
// lib/accounting-pattern-middleware.ts
export const accountingPatternMiddleware = async (
  request: NextRequest,
  context: { params: any }
) => {
  const { pathname } = request.nextUrl
  
  // تحقق من العمليات الحرجة
  if (pathname.includes('/api/invoices') && request.method === 'PUT') {
    const body = await request.json()
    
    // منع تعديل الفواتير المرسلة
    if (body.status === 'sent') {
      return NextResponse.json(
        { error: 'Cannot edit sent invoices directly' },
        { status: 403 }
      )
    }
  }
  
  return NextResponse.next()
}
```

---

## 🚨 الإصلاح 2: تحسين توليد قيود GL

### المشكلة:
بعض العمليات لا تولد قيود GL تلقائياً.

### الحل:
```typescript
// lib/gl-auto-generator.ts
export const generateGLEntries = async (
  operation: 'invoice_send' | 'payment_record' | 'inventory_move',
  data: any,
  companyId: string
) => {
  switch (operation) {
    case 'invoice_send':
      return await generateInvoiceGLEntries(data, companyId)
    case 'payment_record':
      return await generatePaymentGLEntries(data, companyId)
    case 'inventory_move':
      return await generateInventoryGLEntries(data, companyId)
  }
}

const generateInvoiceGLEntries = async (invoice: any, companyId: string) => {
  const entries = [
    {
      account_id: invoice.accounts_receivable_id,
      debit_amount: invoice.total_amount,
      credit_amount: 0,
      description: `Invoice ${invoice.invoice_number}`
    },
    {
      account_id: invoice.sales_account_id,
      debit_amount: 0,
      credit_amount: invoice.subtotal,
      description: `Sales - Invoice ${invoice.invoice_number}`
    }
  ]
  
  // إضافة قيد الضريبة إذا وجدت
  if (invoice.tax_amount > 0) {
    entries.push({
      account_id: invoice.tax_account_id,
      debit_amount: 0,
      credit_amount: invoice.tax_amount,
      description: `Tax - Invoice ${invoice.invoice_number}`
    })
  }
  
  return entries
}
```

---

## 🚨 الإصلاح 3: توسيع Audit Log

### المشكلة:
عدم تسجيل جميع العمليات في Audit Log.

### الحل:
```typescript
// lib/enhanced-audit-log.ts
export const logOperation = async (
  operation: string,
  entityType: string,
  entityId: string,
  changes: any,
  userId: string,
  companyId: string,
  branchId?: string
) => {
  const auditEntry = {
    operation,
    entity_type: entityType,
    entity_id: entityId,
    changes: JSON.stringify(changes),
    user_id: userId,
    company_id: companyId,
    branch_id: branchId,
    ip_address: getClientIP(),
    user_agent: getUserAgent(),
    timestamp: new Date().toISOString()
  }
  
  await supabase
    .from('audit_logs')
    .insert(auditEntry)
}

// استخدام في API routes
export const withAuditLog = (handler: any) => {
  return async (req: NextRequest, context: any) => {
    const result = await handler(req, context)
    
    // تسجيل العملية
    await logOperation(
      req.method,
      getEntityType(req.url),
      getEntityId(req.url),
      await req.json(),
      getUserId(req),
      getCompanyId(req)
    )
    
    return result
  }
}
```

---

## 🚨 الإصلاح 4: تحسين دقة التقارير

### المشكلة:
بعض التقارير قد لا تعكس البيانات الفعلية.

### الحل:
```typescript
// lib/report-validator.ts
export const validateReportData = async (
  reportType: string,
  data: any,
  companyId: string
) => {
  switch (reportType) {
    case 'trial_balance':
      return await validateTrialBalance(data, companyId)
    case 'balance_sheet':
      return await validateBalanceSheet(data, companyId)
    case 'income_statement':
      return await validateIncomeStatement(data, companyId)
  }
}

const validateTrialBalance = async (data: any, companyId: string) => {
  // التحقق من توازن المدين والدائن
  const totalDebits = data.reduce((sum: number, account: any) => 
    sum + (account.debit_balance || 0), 0)
  const totalCredits = data.reduce((sum: number, account: any) => 
    sum + (account.credit_balance || 0), 0)
  
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error('Trial Balance is not balanced')
  }
  
  return { isValid: true, totalDebits, totalCredits }
}
```

---

## 🚨 الإصلاح 5: تحسين فلترة البيانات حسب الفرع

### المشكلة:
بعض القوائم قد تعرض بيانات من فروع أخرى.

### الحل:
```typescript
// lib/branch-filter-middleware.ts
export const branchFilterMiddleware = (query: any, userBranches: string[]) => {
  // إضافة فلتر الفرع تلقائياً
  if (userBranches.length > 0) {
    query = query.in('branch_id', userBranches)
  }
  
  return query
}

// استخدام في جميع الاستعلامات
export const getFilteredData = async (
  table: string,
  filters: any,
  userContext: UserContext
) => {
  let query = supabase
    .from(table)
    .select('*')
  
  // تطبيق فلتر الفرع
  query = branchFilterMiddleware(query, userContext.allowedBranches)
  
  // تطبيق الفلاتر الأخرى
  Object.keys(filters).forEach(key => {
    if (filters[key]) {
      query = query.eq(key, filters[key])
    }
  })
  
  return await query
}
```

---

## 🚨 الإصلاح 6: تحسين مكونات الأكشن

### المشكلة:
عدم استخدام مكونات الأكشن المحسنة في جميع الصفحات.

### الحل:
```typescript
// components/UniversalActions.tsx
export const UniversalActions = ({
  entityType,
  entityId,
  entityStatus,
  permissions,
  onAction
}: UniversalActionsProps) => {
  
  const getAvailableActions = () => {
    switch (entityType) {
      case 'invoice':
        return getInvoiceActions(entityStatus, permissions)
      case 'order':
        return getOrderActions(entityStatus, permissions)
      case 'payment':
        return getPaymentActions(entityStatus, permissions)
      default:
        return []
    }
  }
  
  const actions = getAvailableActions()
  
  return (
    <div className="flex gap-1">
      {actions.map(action => (
        <ActionButton
          key={action.key}
          action={action}
          onClick={() => onAction(action.key)}
          disabled={!action.enabled}
        />
      ))}
    </div>
  )
}
```

---

## 📋 خطة التنفيذ السريعة

### المرحلة 1: الإصلاحات الفورية (يوم واحد)
1. ✅ إنشاء middleware للنمط المحاسبي
2. ✅ تحسين توليد قيود GL
3. ✅ توسيع Audit Log

### المرحلة 2: التحسينات (يومان)
1. ✅ تحسين دقة التقارير
2. ✅ تحسين فلترة البيانات
3. ✅ توحيد مكونات الأكشن

### المرحلة 3: الاختبار والنشر (يوم واحد)
1. ✅ اختبار شامل للإصلاحات
2. ✅ نشر التحديثات
3. ✅ مراقبة الأداء

---

## 🧪 اختبار الإصلاحات

```bash
# تشغيل الاختبارات الحرجة
npm run test:critical

# تشغيل اختبارات النمط المحاسبي
npm run test:accounting-pattern

# تشغيل اختبارات التكامل
npm run test:integration
```

---

## 📊 مؤشرات النجاح

- ✅ جميع الاختبارات الحرجة تمر بنجاح
- ✅ لا توجد مخالفات للنمط المحاسبي
- ✅ جميع العمليات تولد قيود GL
- ✅ Audit Log يغطي 100% من العمليات
- ✅ التقارير دقيقة ومتوازنة

---

*تم إنشاء هذا الملف في: ${new Date().toLocaleString('ar-EG')}*
# 🚀 دليل البدء السريع - نظام Realtime

## نظرة عامة

هذا الدليل السريع يوضح كيفية تطبيق نظام Realtime على أي صفحة في النظام.

---

## ⚡ البدء السريع (5 دقائق)

### الخطوة 1: استيراد Hook

```tsx
import { useRealtimeTable } from '@/hooks/use-realtime-table'
```

### الخطوة 2: إضافة الاشتراك

```tsx
useRealtimeTable({
  table: 'sales_orders', // اسم الجدول
  onInsert: (newRecord) => {
    setData(prev => [newRecord, ...prev])
  },
  onUpdate: (newRecord) => {
    setData(prev => prev.map(item => 
      item.id === newRecord.id ? newRecord : item
    ))
  },
  onDelete: (oldRecord) => {
    setData(prev => prev.filter(item => item.id !== oldRecord.id))
  }
})
```

### الخطوة 3: انتهى! ✅

الآن الصفحة تتحدث لحظيًا بدون أي Refresh!

---

## 📋 قائمة الجداول المدعومة

| الجدول | الاسم في الكود | الحالة |
|--------|----------------|--------|
| الإشعارات | `notifications` | ✅ مكتمل |
| الإهلاك | `depreciation` | ✅ جاهز |
| حركات المخزون | `inventory_transactions` | ✅ جاهز |
| أوامر الشراء | `purchase_orders` | ✅ جاهز |
| أوامر البيع | `sales_orders` | ✅ جاهز |
| الفواتير | `invoices` | ✅ جاهز |
| الموافقات | `approvals` | ✅ جاهز |

---

## 📝 مثال كامل

```tsx
"use client"

import { useState, useEffect, useCallback } from 'react'
import { useRealtimeTable } from '@/hooks/use-realtime-table'
import { useSupabase } from '@/lib/supabase/hooks'
import { getActiveCompanyId } from '@/lib/company'

export default function SalesOrdersPage() {
  const supabase = useSupabase()
  const [orders, setOrders] = useState([])
  const [counts, setCounts] = useState({ total: 0, pending: 0 })

  // تحميل البيانات الأولية
  const loadOrders = useCallback(async () => {
    const companyId = await getActiveCompanyId(supabase)
    const { data } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('company_id', companyId)
    setOrders(data || [])
    setCounts({
      total: data?.length || 0,
      pending: data?.filter((o: any) => o.status === 'pending').length || 0
    })
  }, [supabase])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // ✅ الاشتراك في Realtime
  useRealtimeTable({
    table: 'sales_orders',
    onInsert: (newOrder) => {
      setOrders(prev => [newOrder, ...prev])
      setCounts(prev => ({
        ...prev,
        total: prev.total + 1,
        pending: newOrder.status === 'pending' ? prev.pending + 1 : prev.pending
      }))
    },
    onUpdate: (newOrder, oldOrder) => {
      setOrders(prev => prev.map(o => o.id === newOrder.id ? newOrder : o))
      if (oldOrder.status !== newOrder.status) {
        setCounts(prev => ({
          ...prev,
          pending: newOrder.status === 'pending' 
            ? prev.pending + 1 
            : (oldOrder.status === 'pending' ? prev.pending - 1 : prev.pending)
        }))
      }
    },
    onDelete: (oldOrder) => {
      setOrders(prev => prev.filter(o => o.id !== oldOrder.id))
      setCounts(prev => ({
        ...prev,
        total: prev.total - 1,
        pending: oldOrder.status === 'pending' ? prev.pending - 1 : prev.pending
      }))
    }
  })

  return (
    <div>
      <p>Total: {counts.total} | Pending: {counts.pending}</p>
      {/* عرض الجدول */}
    </div>
  )
}
```

---

## ✅ القواعد الذهبية

### ✅ افعل
- استخدم `useRealtimeTable` في كل صفحة
- حدث State مباشرة (لا `loadData()`)
- حدث العدادات مع كل حدث
- استخدم Map أو فحص id لمنع التكرار

### ❌ لا تفعل
- لا تستخدم `loadData()` في `onInsert/onUpdate/onDelete`
- لا تستخدم اشتراك مباشر خارج النظام
- لا تنس تحديث العدادات
- لا تنس فحص التكرار

---

## 🔧 الإعدادات المطلوبة

### تفعيل Realtime في Supabase

1. اذهب إلى Supabase Dashboard
2. Database → Replication
3. فعّل Realtime على الجدول المطلوب

---

## 📚 المزيد من المعلومات

- `REALTIME_SYSTEM.md` - نظرة عامة شاملة
- `REALTIME_IMPLEMENTATION_GUIDE.md` - دليل تفصيلي
- `REALTIME_VERIFICATION.md` - قائمة التحقق
- `REALTIME_ARCHITECTURE_DECISION.md` - القرار المعماري

---

**✅ النظام جاهز للاستخدام!**

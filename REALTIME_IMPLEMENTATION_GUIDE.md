# 📘 دليل تطبيق Realtime على الصفحات

## نظرة عامة

هذا الدليل يوضح كيفية تطبيق نظام Realtime على الصفحات المختلفة في النظام.

---

## 📋 قالب أساسي للصفحة

```tsx
"use client"

import { useState, useEffect, useCallback } from 'react'
import { useRealtimeTable } from '@/hooks/use-realtime-table'
import { useSupabase } from '@/lib/supabase/hooks'
import { getActiveCompanyId } from '@/lib/company'

export default function MyPage() {
  const supabase = useSupabase()
  const [data, setData] = useState([])
  const [counts, setCounts] = useState({ total: 0, pending: 0 })
  const [loading, setLoading] = useState(true)

  // ✅ 1. تحميل البيانات الأولية
  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: items } = await supabase
        .from('my_table')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })

      setData(items || [])
      
      // ✅ تحديث العدادات
      setCounts({
        total: items?.length || 0,
        pending: items?.filter((i: any) => i.status === 'pending').length || 0
      })
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ✅ 2. الاشتراك في Realtime
  useRealtimeTable({
    table: 'my_table', // اسم الجدول
    enabled: true,
    
    // ✅ عند إضافة سجل جديد
    onInsert: (newRecord) => {
      console.log('➕ New record:', newRecord)
      
      // ✅ تحديث الجدول
      setData(prev => [newRecord, ...prev])
      
      // ✅ تحديث العدادات
      setCounts(prev => ({
        ...prev,
        total: prev.total + 1,
        pending: newRecord.status === 'pending' ? prev.pending + 1 : prev.pending
      }))
    },
    
    // ✅ عند تحديث سجل موجود
    onUpdate: (newRecord, oldRecord) => {
      console.log('🔄 Updated record:', newRecord)
      
      // ✅ تحديث السجل في الجدول
      setData(prev => prev.map(item => 
        item.id === newRecord.id ? newRecord : item
      ))
      
      // ✅ تحديث العدادات (إذا تغيرت الحالة)
      if (oldRecord.status !== newRecord.status) {
        setCounts(prev => ({
          ...prev,
          pending: newRecord.status === 'pending' 
            ? prev.pending + 1 
            : (oldRecord.status === 'pending' ? prev.pending - 1 : prev.pending)
        }))
      }
    },
    
    // ✅ عند حذف سجل
    onDelete: (oldRecord) => {
      console.log('🗑️ Deleted record:', oldRecord)
      
      // ✅ حذف السجل من الجدول
      setData(prev => prev.filter(item => item.id !== oldRecord.id))
      
      // ✅ تحديث العدادات
      setCounts(prev => ({
        ...prev,
        total: prev.total - 1,
        pending: oldRecord.status === 'pending' ? prev.pending - 1 : prev.pending
      }))
    },
    
    // ✅ فلتر إضافي (اختياري)
    filter: (event) => {
      // يمكن إضافة فلاتر إضافية هنا
      return true
    }
  })

  // ✅ 3. تحديث عند تغيير الشركة
  useEffect(() => {
    const handleCompanyChange = () => {
      loadData()
    }
    window.addEventListener('company_updated', handleCompanyChange)
    return () => window.removeEventListener('company_updated', handleCompanyChange)
  }, [loadData])

  if (loading) return <div>Loading...</div>

  return (
    <div>
      {/* ✅ عرض العدادات */}
      <div>
        <p>Total: {counts.total}</p>
        <p>Pending: {counts.pending}</p>
      </div>
      
      {/* ✅ عرض الجدول */}
      <table>
        {data.map(item => (
          <tr key={item.id}>
            {/* عرض البيانات */}
          </tr>
        ))}
      </table>
    </div>
  )
}
```

---

## 📝 أمثلة تطبيقية

### 1. صفحة أوامر البيع (Sales Orders)

```tsx
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
```

### 2. صفحة حركات المخزون (Inventory Transactions)

```tsx
useRealtimeTable({
  table: 'inventory_transactions',
  onInsert: (newTransaction) => {
    setTransactions(prev => [newTransaction, ...prev])
    
    // ✅ تحديث الأرصدة
    updateProductQuantity(newTransaction.product_id, newTransaction.quantity)
    
    // ✅ تحديث الإحصائيات
    setStats(prev => ({
      ...prev,
      totalTransactions: prev.totalTransactions + 1,
      totalQuantity: prev.totalQuantity + newTransaction.quantity
    }))
  },
  onUpdate: (newTransaction) => {
    setTransactions(prev => prev.map(t => 
      t.id === newTransaction.id ? newTransaction : t
    ))
  },
  onDelete: (oldTransaction) => {
    setTransactions(prev => prev.filter(t => t.id !== oldTransaction.id))
    
    // ✅ تحديث الأرصدة
    updateProductQuantity(oldTransaction.product_id, -oldTransaction.quantity)
  }
})
```

### 3. صفحة الإهلاك (Depreciation)

```tsx
useRealtimeTable({
  table: 'depreciation',
  onInsert: (newDepreciation) => {
    setDepreciations(prev => [newDepreciation, ...prev])
    
    // ✅ إرسال إشعار إذا كان pending
    if (newDepreciation.status === 'pending') {
      window.dispatchEvent(new Event('notifications_updated'))
    }
  },
  onUpdate: (newDepreciation, oldDepreciation) => {
    setDepreciations(prev => prev.map(d => 
      d.id === newDepreciation.id ? newDepreciation : d
    ))
    
    // ✅ إذا تم الاعتماد، تحديث الإحصائيات
    if (oldDepreciation.status === 'pending' && newDepreciation.status === 'approved') {
      updateStatistics()
      window.dispatchEvent(new Event('notifications_updated'))
    }
  },
  onDelete: (oldDepreciation) => {
    setDepreciations(prev => prev.filter(d => d.id !== oldDepreciation.id))
  }
})
```

### 4. صفحة الموافقات (Approvals)

```tsx
useRealtimeTable({
  table: 'approvals',
  onInsert: (newApproval) => {
    setApprovals(prev => [newApproval, ...prev])
    
    // ✅ تحديث عداد الموافقات المعلقة
    if (newApproval.status === 'pending') {
      setPendingCount(prev => prev + 1)
      window.dispatchEvent(new Event('notifications_updated'))
    }
  },
  onUpdate: (newApproval, oldApproval) => {
    setApprovals(prev => prev.map(a => 
      a.id === newApproval.id ? newApproval : a
    ))
    
    // ✅ تحديث العدادات عند تغيير الحالة
    if (oldApproval.status === 'pending' && newApproval.status !== 'pending') {
      setPendingCount(prev => prev - 1)
    }
  },
  onDelete: (oldApproval) => {
    setApprovals(prev => prev.filter(a => a.id !== oldApproval.id))
    if (oldApproval.status === 'pending') {
      setPendingCount(prev => prev - 1)
    }
  }
})
```

---

## ✅ أفضل الممارسات

### 1. تحديث العدادات

```tsx
// ✅ جيد: تحديث العدادات مع كل حدث
onInsert: (newRecord) => {
  setData(prev => [newRecord, ...prev])
  setCounts(prev => ({
    ...prev,
    total: prev.total + 1,
    pending: newRecord.status === 'pending' ? prev.pending + 1 : prev.pending
  }))
}

// ❌ سيء: إعادة تحميل كامل للبيانات
onInsert: () => {
  loadData() // ❌ هذا يلغي فائدة Realtime!
}
```

### 2. منع التكرار

```tsx
// ✅ جيد: استخدام Map أو فحص id
onInsert: (newRecord) => {
  setData(prev => {
    // ✅ فحص التكرار
    if (prev.find(item => item.id === newRecord.id)) {
      return prev
    }
    return [newRecord, ...prev]
  })
}
```

### 3. تحديث الإشعارات

```tsx
// ✅ جيد: إرسال حدث لتحديث الإشعارات
onUpdate: (newRecord) => {
  setData(prev => prev.map(item => 
    item.id === newRecord.id ? newRecord : item
  ))
  
  // ✅ تحديث الإشعارات إذا لزم الأمر
  if (newRecord.status === 'approved') {
    window.dispatchEvent(new Event('notifications_updated'))
  }
}
```

---

## 🚨 أخطاء شائعة

### ❌ خطأ 1: إعادة تحميل البيانات

```tsx
// ❌ خطأ: هذا يلغي فائدة Realtime
useRealtimeTable({
  table: 'sales_orders',
  onInsert: () => {
    loadData() // ❌ لا تفعل هذا!
  }
})
```

### ❌ خطأ 2: عدم تحديث العدادات

```tsx
// ❌ خطأ: العدادات لن تتحدث
useRealtimeTable({
  table: 'sales_orders',
  onInsert: (newOrder) => {
    setOrders(prev => [newOrder, ...prev])
    // ❌ نسيت تحديث العدادات!
  }
})
```

### ❌ خطأ 3: عدم التحقق من التكرار

```tsx
// ❌ خطأ: قد يحدث تكرار
useRealtimeTable({
  table: 'sales_orders',
  onInsert: (newOrder) => {
    setOrders(prev => [...prev, newOrder]) // ❌ قد يضيف نفس السجل مرتين
  }
})
```

---

## ✅ الخلاصة

1. ✅ استخدم `useRealtimeTable` في كل صفحة
2. ✅ حدث الجدول مباشرة (لا `loadData()`)
3. ✅ حدث العدادات مع كل حدث
4. ✅ استخدم Map أو فحص id لمنع التكرار
5. ✅ أرسل أحداث لتحديث الإشعارات عند الحاجة

**النتيجة**: نظام ERP احترافي بدون أي Refresh! 🎉

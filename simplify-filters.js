#!/usr/bin/env node

/**
 * 🚨 إصلاح طارئ: تبسيط دالة filteredOrders لإزالة فلاتر الحوكمة
 */

const fs = require('fs')

console.log('🚨 بدء تبسيط دالة filteredOrders...')

const filePath = 'app/sales-orders/page.tsx'

try {
  // قراءة الملف
  let content = fs.readFileSync(filePath, 'utf8')
  
  // البحث عن دالة filteredOrders المعقدة واستبدالها بإصدار مبسط
  const complexFilterPattern = /\/\/ Filtered orders based on search, status, customer, products, and date\s*const filteredOrders = useMemo\(\(\) => \{[\s\S]*?return true;\s*\}\);\s*\}, \[[\s\S]*?\]\);/
  
  const simpleFilter = `  // Filtered orders - إصدار مبسط بدون فلاتر حوكمة
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Status filter - Multi-select
      if (filterStatuses.length > 0) {
        const linkedInvoice = order.invoice_id ? linkedInvoices[order.invoice_id] : null;
        const displayStatus = linkedInvoice ? linkedInvoice.status : order.status;
        if (!filterStatuses.includes(displayStatus)) return false;
      }

      // Customer filter - show orders for any of the selected customers
      if (filterCustomers.length > 0 && !filterCustomers.includes(order.customer_id)) return false;

      // Date range filter
      if (dateFrom && order.so_date < dateFrom) return false;
      if (dateTo && order.so_date > dateTo) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const customerName = String(customers.find(c => c.id === order.customer_id)?.name || "").toLowerCase();
        const customerPhone = String(customers.find(c => c.id === order.customer_id)?.phone || "").toLowerCase();
        const soNumber = order.so_number ? String(order.so_number).toLowerCase() : "";
        if (!customerName.includes(q) && !customerPhone.includes(q) && !soNumber.includes(q)) return false;
      }

      return true;
    });
  }, [orders, filterStatuses, filterCustomers, searchQuery, dateFrom, dateTo, customers, linkedInvoices]);`
  
  // استبدال الدالة
  content = content.replace(complexFilterPattern, simpleFilter)
  
  // كتابة الملف الجديد
  fs.writeFileSync(filePath, content, 'utf8')
  
  console.log('✅ تم تبسيط دالة filteredOrders بنجاح!')
  console.log('🎯 تم إزالة جميع فلاتر الحوكمة المعقدة')
  
} catch (error) {
  console.error('❌ خطأ في التبسيط:', error.message)
  process.exit(1)
}
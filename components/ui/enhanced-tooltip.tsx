'use client'

import * as React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

interface EnhancedTooltipProps {
  children: React.ReactNode
  content?: string
  functionName?: string
  description?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}

// خريطة التلميحات المستخرجة من التعليقات في الكود
const tooltipMap: Record<string, string> = {
  // مكونات الواجهة
  'dashboard': 'لوحة التحكم - نظرة عامة على أعمالك وإحصائيات الشركة',
  'products': 'المنتجات والخدمات - إدارة كتالوج المنتجات والخدمات',
  'inventory': 'المخزون - تتبع المخزون وحركات البضائع',
  'customers': 'العملاء - إدارة بيانات العملاء والذمم المدينة',
  'suppliers': 'الموردين - إدارة بيانات الموردين والذمم الدائنة',
  'invoices': 'فواتير المبيعات - إنشاء وإدارة فواتير البيع',
  'bills': 'فواتير المشتريات - إنشاء وإدارة فواتير الشراء',
  'payments': 'المدفوعات - تسجيل وتتبع المدفوعات والمقبوضات',
  'journal': 'القيود اليومية - تسجيل القيود المحاسبية اليدوية',
  'banking': 'الأعمال المصرفية - إدارة الحسابات المصرفية والتسويات',
  'reports': 'التقارير - تقارير مالية ومحاسبية شاملة',
  'coa': 'الشجرة المحاسبية - هيكل الحسابات المحاسبية',
  'settings': 'الإعدادات - إعدادات النظام والشركة',
  
  // أزرار العمليات
  'save': 'حفظ - حفظ البيانات المدخلة',
  'cancel': 'إلغاء - إلغاء العملية والعودة للصفحة السابقة',
  'edit': 'تعديل - تعديل البيانات المحددة',
  'delete': 'حذف - حذف العنصر المحدد نهائياً',
  'add': 'إضافة - إضافة عنصر جديد',
  'search': 'بحث - البحث في البيانات',
  'filter': 'فلترة - تطبيق مرشحات على البيانات',
  'export': 'تصدير - تصدير البيانات لملف خارجي',
  'print': 'طباعة - طباعة التقرير أو المستند',
  
  // حقول الإدخال
  'name': 'الاسم - أدخل اسم العنصر',
  'description': 'الوصف - وصف تفصيلي للعنصر',
  'amount': 'المبلغ - أدخل المبلغ بالعملة المحددة',
  'date': 'التاريخ - اختر التاريخ المناسب',
  'quantity': 'الكمية - أدخل الكمية المطلوبة',
  'price': 'السعر - سعر الوحدة الواحدة',
  'total': 'الإجمالي - المبلغ الإجمالي المحسوب',
  
  // حالات الفواتير والمستندات
  'draft': 'مسودة - مستند غير مكتمل قابل للتعديل',
  'sent': 'مرسل - مستند مرسل للعميل أو المورد',
  'paid': 'مدفوع - مستند مدفوع بالكامل',
  'partially_paid': 'مدفوع جزئياً - مستند مدفوع جزء منه',
  'overdue': 'متأخر - مستند تجاوز تاريخ الاستحقاق',
  'cancelled': 'ملغي - مستند ملغي ولا يؤثر على الحسابات',
}

export function EnhancedTooltip({ 
  children, 
  content, 
  functionName, 
  description, 
  side = 'top',
  className 
}: EnhancedTooltipProps) {
  // تحديد المحتوى بناءً على الأولوية
  const tooltipContent = content || 
    (functionName && tooltipMap[functionName]) || 
    description || 
    'لا توجد معلومات إضافية متاحة'

  return (
    <Tooltip>
      <TooltipTrigger asChild className={className}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs text-center">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  )
}

// هوك لاستخراج التلميحات من التعليقات
export function useTooltipFromComments(elementId: string): string {
  return tooltipMap[elementId] || ''
}

// دالة لتحديث التلميحات تلقائياً
export function updateTooltipMap(newTooltips: Record<string, string>) {
  Object.assign(tooltipMap, newTooltips)
}
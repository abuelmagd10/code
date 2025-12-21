'use client'

import { Button } from '@/components/ui/button'
import { EnhancedTooltip } from '@/components/ui/enhanced-tooltip'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Save, Edit, Trash2, Plus } from 'lucide-react'

export default function TestTooltipsPage() {
  return (
    <div className="container mx-auto p-6 space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>اختبار نظام التلميحات التوضيحية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* أزرار مع تلميحات تلقائية */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">أزرار مع تلميحات تلقائية</h3>
            <div className="flex gap-4 flex-wrap">
              <Button functionName="save">
                <Save className="w-4 h-4" />
                حفظ
              </Button>
              
              <Button functionName="edit" variant="outline">
                <Edit className="w-4 h-4" />
                تعديل
              </Button>
              
              <Button functionName="delete" variant="destructive">
                <Trash2 className="w-4 h-4" />
                حذف
              </Button>
              
              <Button functionName="add" variant="secondary">
                <Plus className="w-4 h-4" />
                إضافة
              </Button>
            </div>
          </div>

          {/* أزرار مع تلميحات مخصصة */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">أزرار مع تلميحات مخصصة</h3>
            <div className="flex gap-4 flex-wrap">
              <Button tooltip="حفظ جميع التغييرات في قاعدة البيانات">
                حفظ مخصص
              </Button>
              
              <Button tooltip="تصدير البيانات إلى ملف Excel" tooltipSide="bottom">
                تصدير
              </Button>
              
              <Button tooltip="طباعة التقرير الحالي" tooltipSide="left">
                طباعة
              </Button>
            </div>
          </div>

          {/* مكونات أخرى مع تلميحات */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">مكونات أخرى مع تلميحات</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <EnhancedTooltip content="أدخل اسم العميل الكامل">
                <Input placeholder="اسم العميل" />
              </EnhancedTooltip>
              
              <EnhancedTooltip content="أدخل المبلغ بالجنيه المصري" side="bottom">
                <Input placeholder="المبلغ" type="number" />
              </EnhancedTooltip>
              
            </div>
          </div>

          {/* تلميحات من الخريطة المحددة مسبقاً */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">تلميحات من النظام</h3>
            <div className="flex gap-4 flex-wrap">
              <Button functionName="dashboard">لوحة التحكم</Button>
              <Button functionName="products" variant="outline">المنتجات</Button>
              <Button functionName="customers" variant="secondary">العملاء</Button>
              <Button functionName="invoices">الفواتير</Button>
            </div>
          </div>

          {/* تلميحات بمواضع مختلفة */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">تلميحات بمواضع مختلفة</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <Button tooltip="تلميح علوي" tooltipSide="top">
                أعلى
              </Button>
              <Button tooltip="تلميح سفلي" tooltipSide="bottom">
                أسفل
              </Button>
              <Button tooltip="تلميح يميني" tooltipSide="right">
                يمين
              </Button>
              <Button tooltip="تلميح يساري" tooltipSide="left">
                يسار
              </Button>
            </div>
          </div>

        </CardContent>
      </Card>
    </div>
  )
}
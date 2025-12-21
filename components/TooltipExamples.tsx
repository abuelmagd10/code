'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EnhancedTooltip } from '@/components/ui/enhanced-tooltip'
import { 
  Save, 
  Edit, 
  Trash2, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  Upload,
  Settings,
  User,
  DollarSign,
  FileText,
  Package,
  Users
} from 'lucide-react'

export function TooltipExamples() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>أمثلة على التلميحات التوضيحية</CardTitle>
          <p className="text-sm text-gray-500">
            أمثلة تفاعلية لاستخدام التلميحات في مختلف عناصر الواجهة
          </p>
        </CardHeader>
        <CardContent className="space-y-8">
          
          {/* أزرار العمليات */}
          <div>
            <h3 className="text-lg font-semibold mb-4">أزرار العمليات</h3>
            <div className="flex flex-wrap gap-3">
              <EnhancedTooltip functionName="save">
                <Button className="gap-2">
                  <Save className="w-4 h-4" />
                  حفظ
                </Button>
              </EnhancedTooltip>
              
              <EnhancedTooltip functionName="edit">
                <Button variant="outline" className="gap-2">
                  <Edit className="w-4 h-4" />
                  تعديل
                </Button>
              </EnhancedTooltip>
              
              <EnhancedTooltip functionName="delete">
                <Button variant="destructive" className="gap-2">
                  <Trash2 className="w-4 h-4" />
                  حذف
                </Button>
              </EnhancedTooltip>
              
              <EnhancedTooltip functionName="add">
                <Button variant="secondary" className="gap-2">
                  <Plus className="w-4 h-4" />
                  إضافة
                </Button>
              </EnhancedTooltip>
            </div>
          </div>

          {/* أدوات البحث والفلترة */}
          <div>
            <h3 className="text-lg font-semibold mb-4">أدوات البحث والفلترة</h3>
            <div className="flex flex-wrap gap-3 items-center">
              <EnhancedTooltip functionName="search">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input placeholder="البحث..." className="pr-10 w-64" />
                </div>
              </EnhancedTooltip>
              
              <EnhancedTooltip functionName="filter">
                <Button variant="outline" className="gap-2">
                  <Filter className="w-4 h-4" />
                  فلترة
                </Button>
              </EnhancedTooltip>
              
              <EnhancedTooltip functionName="export">
                <Button variant="outline" className="gap-2">
                  <Download className="w-4 h-4" />
                  تصدير
                </Button>
              </EnhancedTooltip>
              
              <EnhancedTooltip functionName="import">
                <Button variant="outline" className="gap-2">
                  <Upload className="w-4 h-4" />
                  استيراد
                </Button>
              </EnhancedTooltip>
            </div>
          </div>

          {/* حالات المستندات */}
          <div>
            <h3 className="text-lg font-semibold mb-4">حالات المستندات</h3>
            <div className="flex flex-wrap gap-3">
              <EnhancedTooltip functionName="draft">
                <Badge variant="secondary">مسودة</Badge>
              </EnhancedTooltip>
              
              <EnhancedTooltip functionName="sent">
                <Badge variant="default">مرسل</Badge>
              </EnhancedTooltip>
              
              <EnhancedTooltip functionName="paid">
                <Badge className="bg-green-100 text-green-800">مدفوع</Badge>
              </EnhancedTooltip>
              
              <EnhancedTooltip functionName="partially_paid">
                <Badge className="bg-yellow-100 text-yellow-800">مدفوع جزئياً</Badge>
              </EnhancedTooltip>
              
              <EnhancedTooltip functionName="overdue">
                <Badge variant="destructive">متأخر</Badge>
              </EnhancedTooltip>
              
              <EnhancedTooltip functionName="cancelled">
                <Badge variant="outline">ملغي</Badge>
              </EnhancedTooltip>
            </div>
          </div>

          {/* أيقونات القوائم */}
          <div>
            <h3 className="text-lg font-semibold mb-4">أيقونات القوائم</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <EnhancedTooltip functionName="dashboard">
                <Card className="p-4 cursor-pointer hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Settings className="w-5 h-5 text-blue-600" />
                    </div>
                    <span className="font-medium">لوحة التحكم</span>
                  </div>
                </Card>
              </EnhancedTooltip>
              
              <EnhancedTooltip functionName="customers">
                <Card className="p-4 cursor-pointer hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Users className="w-5 h-5 text-green-600" />
                    </div>
                    <span className="font-medium">العملاء</span>
                  </div>
                </Card>
              </EnhancedTooltip>
              
              <EnhancedTooltip functionName="products">
                <Card className="p-4 cursor-pointer hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Package className="w-5 h-5 text-purple-600" />
                    </div>
                    <span className="font-medium">المنتجات</span>
                  </div>
                </Card>
              </EnhancedTooltip>
              
              <EnhancedTooltip functionName="invoices">
                <Card className="p-4 cursor-pointer hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <FileText className="w-5 h-5 text-orange-600" />
                    </div>
                    <span className="font-medium">الفواتير</span>
                  </div>
                </Card>
              </EnhancedTooltip>
            </div>
          </div>

          {/* حقول الإدخال */}
          <div>
            <h3 className="text-lg font-semibold mb-4">حقول الإدخال</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  <EnhancedTooltip functionName="name">
                    <span className="cursor-help border-b border-dotted">الاسم</span>
                  </EnhancedTooltip>
                </label>
                <Input placeholder="أدخل الاسم" />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">
                  <EnhancedTooltip functionName="amount">
                    <span className="cursor-help border-b border-dotted">المبلغ</span>
                  </EnhancedTooltip>
                </label>
                <Input type="number" placeholder="0.00" />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">
                  <EnhancedTooltip functionName="date">
                    <span className="cursor-help border-b border-dotted">التاريخ</span>
                  </EnhancedTooltip>
                </label>
                <Input type="date" />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">
                  <EnhancedTooltip functionName="quantity">
                    <span className="cursor-help border-b border-dotted">الكمية</span>
                  </EnhancedTooltip>
                </label>
                <Input type="number" placeholder="1" />
              </div>
            </div>
          </div>

          {/* تلميحات مخصصة */}
          <div>
            <h3 className="text-lg font-semibold mb-4">تلميحات مخصصة</h3>
            <div className="flex flex-wrap gap-3">
              <EnhancedTooltip content="هذا تلميح مخصص يظهر معلومات إضافية عن العنصر">
                <Button variant="outline">تلميح مخصص</Button>
              </EnhancedTooltip>
              
              <EnhancedTooltip 
                content="يمكنك تخصيص موضع التلميح" 
                side="bottom"
              >
                <Button variant="outline">تلميح سفلي</Button>
              </EnhancedTooltip>
              
              <EnhancedTooltip 
                content="تلميح على اليسار" 
                side="left"
              >
                <Button variant="outline">تلميح يساري</Button>
              </EnhancedTooltip>
              
              <EnhancedTooltip 
                content="تلميح على اليمين" 
                side="right"
              >
                <Button variant="outline">تلميح يميني</Button>
              </EnhancedTooltip>
            </div>
          </div>

        </CardContent>
      </Card>
    </div>
  )
}
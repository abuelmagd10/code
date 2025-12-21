'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, RefreshCw, Info, Code, FileText } from 'lucide-react'
import { EnhancedTooltip } from '@/components/ui/enhanced-tooltip'

interface TooltipItem {
  key: string
  value: string
  category: 'ui' | 'function' | 'component' | 'other'
}

export function TooltipManager() {
  const [tooltips, setTooltips] = useState<TooltipItem[]>([])
  const [filteredTooltips, setFilteredTooltips] = useState<TooltipItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(false)

  // تحميل التلميحات من ملف JSON
  const loadTooltips = async () => {
    try {
      const response = await fetch('/tooltips.json')
      if (response.ok) {
        const data = await response.json()
        const tooltipItems: TooltipItem[] = Object.entries(data).map(([key, value]) => ({
          key,
          value: value as string,
          category: categorizeTooltip(key)
        }))
        setTooltips(tooltipItems)
        setFilteredTooltips(tooltipItems)
      }
    } catch (error) {
      console.error('خطأ في تحميل التلميحات:', error)
    }
  }

  // تصنيف التلميحات
  const categorizeTooltip = (key: string): TooltipItem['category'] => {
    if (['button', 'input', 'card', 'dialog', 'tooltip'].some(ui => key.includes(ui))) {
      return 'ui'
    }
    if (['dashboard', 'sidebar', 'header', 'footer'].some(comp => key.includes(comp))) {
      return 'component'
    }
    if (['function', 'method', 'handler', 'callback'].some(func => key.includes(func))) {
      return 'function'
    }
    return 'other'
  }

  // تحديث التلميحات من الكود
  const updateTooltips = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/update-tooltips', { method: 'POST' })
      if (response.ok) {
        await loadTooltips()
        alert('تم تحديث التلميحات بنجاح!')
      } else {
        alert('حدث خطأ أثناء تحديث التلميحات')
      }
    } catch (error) {
      console.error('خطأ في تحديث التلميحات:', error)
      alert('حدث خطأ أثناء تحديث التلميحات')
    } finally {
      setIsLoading(false)
    }
  }

  // فلترة التلميحات
  useEffect(() => {
    let filtered = tooltips

    // فلترة بالبحث
    if (searchTerm) {
      filtered = filtered.filter(tooltip =>
        tooltip.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tooltip.value.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // فلترة بالفئة
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(tooltip => tooltip.category === selectedCategory)
    }

    setFilteredTooltips(filtered)
  }, [tooltips, searchTerm, selectedCategory])

  // تحميل التلميحات عند بدء المكون
  useEffect(() => {
    loadTooltips()
  }, [])

  const getCategoryIcon = (category: TooltipItem['category']) => {
    switch (category) {
      case 'ui': return <Code className="w-4 h-4" />
      case 'component': return <FileText className="w-4 h-4" />
      case 'function': return <Info className="w-4 h-4" />
      default: return <Info className="w-4 h-4" />
    }
  }

  const getCategoryColor = (category: TooltipItem['category']) => {
    switch (category) {
      case 'ui': return 'bg-blue-100 text-blue-800'
      case 'component': return 'bg-green-100 text-green-800'
      case 'function': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const categories = [
    { key: 'all', label: 'الكل', count: tooltips.length },
    { key: 'ui', label: 'واجهة المستخدم', count: tooltips.filter(t => t.category === 'ui').length },
    { key: 'component', label: 'المكونات', count: tooltips.filter(t => t.category === 'component').length },
    { key: 'function', label: 'الدوال', count: tooltips.filter(t => t.category === 'function').length },
    { key: 'other', label: 'أخرى', count: tooltips.filter(t => t.category === 'other').length },
  ]

  return (
    <div className="space-y-6">
      {/* رأس الصفحة */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Info className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <CardTitle>إدارة التلميحات التوضيحية</CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  عرض وإدارة التلميحات المستخرجة من تعليقات الكود
                </p>
              </div>
            </div>
            <EnhancedTooltip content="تحديث التلميحات من تعليقات الكود الحالية">
              <Button
                onClick={updateTooltips}
                disabled={isLoading}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? 'جاري التحديث...' : 'تحديث التلميحات'}
              </Button>
            </EnhancedTooltip>
          </div>
        </CardHeader>
      </Card>

      {/* أدوات البحث والفلترة */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* البحث */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="البحث في التلميحات..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pr-10"
                />
              </div>
            </div>

            {/* فلترة الفئات */}
            <div className="flex gap-2 flex-wrap">
              {categories.map(category => (
                <Button
                  key={category.key}
                  variant={selectedCategory === category.key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(category.key)}
                  className="gap-2"
                >
                  {category.label}
                  <Badge variant="secondary" className="text-xs">
                    {category.count}
                  </Badge>
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* قائمة التلميحات */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            التلميحات المتاحة ({filteredTooltips.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredTooltips.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Info className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>لا توجد تلميحات تطابق البحث الحالي</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTooltips.map((tooltip, index) => (
                <div
                  key={`${tooltip.key}-${index}`}
                  className="flex items-start gap-3 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-shrink-0">
                    <Badge className={`gap-1 ${getCategoryColor(tooltip.category)}`}>
                      {getCategoryIcon(tooltip.category)}
                      {tooltip.category}
                    </Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 mb-1">
                      {tooltip.key}
                    </div>
                    <div className="text-sm text-gray-600 leading-relaxed">
                      {tooltip.value}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <EnhancedTooltip content={tooltip.value}>
                      <Button variant="ghost" size="sm">
                        <Info className="w-4 h-4" />
                      </Button>
                    </EnhancedTooltip>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* إحصائيات */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {categories.slice(1).map(category => (
          <Card key={category.key}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${getCategoryColor(category.key as TooltipItem['category'])}`}>
                  {getCategoryIcon(category.key as TooltipItem['category'])}
                </div>
                <div>
                  <div className="text-2xl font-bold">{category.count}</div>
                  <div className="text-sm text-gray-500">{category.label}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
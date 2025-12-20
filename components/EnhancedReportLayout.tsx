import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Download, Filter, AlertTriangle, CheckCircle } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/hooks'
import { getActiveCompanyId } from '@/lib/company'

interface ReportFilters {
  companyId: string
  branchId?: string
  costCenterId?: string
  warehouseId?: string
  fromDate?: string
  toDate?: string
  asOfDate?: string
}

interface ReportValidation {
  checkName: string
  status: 'OK' | 'ERROR' | 'WARNING'
  expectedValue?: number
  actualValue?: number
  difference?: number
  isCritical: boolean
}

interface EnhancedReportLayoutProps {
  title: string
  reportType: 'balance_sheet' | 'income_statement' | 'ar_aging' | 'ap_aging' | 'sales' | 'purchases' | 'inventory'
  children: React.ReactNode
  onFiltersChange: (filters: ReportFilters) => void
  onExport?: (format: 'pdf' | 'excel' | 'csv') => void
  showDateRange?: boolean
  showAsOfDate?: boolean
  lang: 'ar' | 'en'
}

export const EnhancedReportLayout = ({
  title,
  reportType,
  children,
  onFiltersChange,
  onExport,
  showDateRange = false,
  showAsOfDate = false,
  lang
}: EnhancedReportLayoutProps) => {
  const supabase = useSupabase()
  const [filters, setFilters] = useState<ReportFilters>({
    companyId: '',
    fromDate: new Date().getFullYear() + '-01-01',
    toDate: new Date().toISOString().slice(0, 10),
    asOfDate: new Date().toISOString().slice(0, 10)
  })
  const [branches, setBranches] = useState<Array<{id: string, name: string}>>([])
  const [costCenters, setCostCenters] = useState<Array<{id: string, name: string}>>([])
  const [warehouses, setWarehouses] = useState<Array<{id: string, name: string}>>([])
  const [validation, setValidation] = useState<ReportValidation[]>([])
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    loadCompanyData()
  }, [])

  useEffect(() => {
    if (filters.companyId) {
      onFiltersChange(filters)
      validateReport()
    }
  }, [filters])

  const loadCompanyData = async () => {
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      setFilters(prev => ({ ...prev, companyId }))

      // تحميل الفروع
      const { data: branchesData } = await supabase
        .from('branches')
        .select('id, name')
        .eq('company_id', companyId)
        .order('name')
      setBranches(branchesData || [])

      // تحميل مراكز التكلفة
      const { data: costCentersData } = await supabase
        .from('cost_centers')
        .select('id, name')
        .eq('company_id', companyId)
        .order('name')
      setCostCenters(costCentersData || [])

      // تحميل المخازن
      const { data: warehousesData } = await supabase
        .from('warehouses')
        .select('id, name')
        .eq('company_id', companyId)
        .order('name')
      setWarehouses(warehousesData || [])
    } catch (error) {
      console.error('Error loading company data:', error)
    }
  }

  const validateReport = async () => {
    try {
      const { data } = await supabase.rpc('validate_reports_integrity', {
        p_company_id: filters.companyId,
        p_as_of_date: filters.asOfDate || filters.toDate
      })
      setValidation(data || [])
    } catch (error) {
      console.error('Error validating report:', error)
    }
  }

  const updateFilter = (key: keyof ReportFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined }))
  }

  const hasErrors = validation.some(v => v.status === 'ERROR' && v.isCritical)
  const hasWarnings = validation.some(v => v.status === 'WARNING' || (v.status === 'ERROR' && !v.isCritical))

  return (
    <div className="space-y-6">
      {/* رأس التقرير */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {lang === 'en' ? 'Generated on' : 'تم إنشاؤه في'} {new Date().toLocaleDateString(lang === 'en' ? 'en' : 'ar')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4 mr-2" />
            {lang === 'en' ? 'Filters' : 'الفلاتر'}
          </Button>
          {onExport && (
            <>
              <Button variant="outline" onClick={() => onExport('pdf')}>
                <Download className="w-4 h-4 mr-2" />
                PDF
              </Button>
              <Button variant="outline" onClick={() => onExport('excel')}>
                <Download className="w-4 h-4 mr-2" />
                Excel
              </Button>
            </>
          )}
        </div>
      </div>

      {/* تحذيرات التحقق */}
      {validation.length > 0 && (
        <div className="space-y-2">
          {hasErrors && (
            <Alert className="border-red-200 bg-red-50 dark:bg-red-900/20">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800 dark:text-red-200">
                <div className="font-medium mb-1">
                  {lang === 'en' ? '⚠️ Critical Data Issues Detected' : '⚠️ تم اكتشاف مشاكل حرجة في البيانات'}
                </div>
                <div className="text-sm">
                  {lang === 'en' 
                    ? 'Report data may be inaccurate. Please review journal entries and account balances.'
                    : 'بيانات التقرير قد تكون غير دقيقة. يرجى مراجعة القيود المحاسبية وأرصدة الحسابات.'}
                </div>
              </AlertDescription>
            </Alert>
          )}
          {hasWarnings && !hasErrors && (
            <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                <div className="font-medium mb-1">
                  {lang === 'en' ? '⚠️ Data Warnings' : '⚠️ تحذيرات البيانات'}
                </div>
                <div className="text-sm">
                  {lang === 'en' 
                    ? 'Minor data inconsistencies detected. Report is generally accurate.'
                    : 'تم اكتشاف تضارب طفيف في البيانات. التقرير دقيق بشكل عام.'}
                </div>
              </AlertDescription>
            </Alert>
          )}
          {!hasErrors && !hasWarnings && (
            <Alert className="border-green-200 bg-green-50 dark:bg-green-900/20">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                <div className="font-medium mb-1">
                  {lang === 'en' ? '✅ Data Integrity Verified' : '✅ تم التحقق من سلامة البيانات'}
                </div>
                <div className="text-sm">
                  {lang === 'en' 
                    ? 'All data checks passed. Report is accurate and reliable.'
                    : 'تم اجتياز جميع فحوصات البيانات. التقرير دقيق وموثوق.'}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* فلاتر التقرير */}
      {showFilters && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {lang === 'en' ? 'Report Filters' : 'فلاتر التقرير'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {/* الفرع */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {lang === 'en' ? 'Branch' : 'الفرع'}
                </label>
                <Select value={filters.branchId || ''} onValueChange={(value) => updateFilter('branchId', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder={lang === 'en' ? 'All Branches' : 'جميع الفروع'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{lang === 'en' ? 'All Branches' : 'جميع الفروع'}</SelectItem>
                    {branches.map(branch => (
                      <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* مركز التكلفة */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {lang === 'en' ? 'Cost Center' : 'مركز التكلفة'}
                </label>
                <Select value={filters.costCenterId || ''} onValueChange={(value) => updateFilter('costCenterId', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder={lang === 'en' ? 'All Cost Centers' : 'جميع مراكز التكلفة'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{lang === 'en' ? 'All Cost Centers' : 'جميع مراكز التكلفة'}</SelectItem>
                    {costCenters.map(cc => (
                      <SelectItem key={cc.id} value={cc.id}>{cc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* المخزن */}
              {reportType === 'inventory' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {lang === 'en' ? 'Warehouse' : 'المخزن'}
                  </label>
                  <Select value={filters.warehouseId || ''} onValueChange={(value) => updateFilter('warehouseId', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder={lang === 'en' ? 'All Warehouses' : 'جميع المخازن'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{lang === 'en' ? 'All Warehouses' : 'جميع المخازن'}</SelectItem>
                      {warehouses.map(wh => (
                        <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* نطاق التاريخ */}
              {showDateRange && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {lang === 'en' ? 'From Date' : 'من تاريخ'}
                    </label>
                    <Input
                      type="date"
                      value={filters.fromDate}
                      onChange={(e) => updateFilter('fromDate', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {lang === 'en' ? 'To Date' : 'إلى تاريخ'}
                    </label>
                    <Input
                      type="date"
                      value={filters.toDate}
                      onChange={(e) => updateFilter('toDate', e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* تاريخ محدد */}
              {showAsOfDate && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {lang === 'en' ? 'As of Date' : 'كما في تاريخ'}
                  </label>
                  <Input
                    type="date"
                    value={filters.asOfDate}
                    onChange={(e) => updateFilter('asOfDate', e.target.value)}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* محتوى التقرير */}
      <Card>
        <CardContent className="pt-6">
          {children}
        </CardContent>
      </Card>

      {/* تفاصيل التحقق */}
      {validation.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {lang === 'en' ? 'Data Validation Details' : 'تفاصيل التحقق من البيانات'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">{lang === 'en' ? 'Check' : 'الفحص'}</th>
                    <th className="text-left p-2">{lang === 'en' ? 'Status' : 'الحالة'}</th>
                    <th className="text-right p-2">{lang === 'en' ? 'Expected' : 'المتوقع'}</th>
                    <th className="text-right p-2">{lang === 'en' ? 'Actual' : 'الفعلي'}</th>
                    <th className="text-right p-2">{lang === 'en' ? 'Difference' : 'الفرق'}</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.map((check, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-2">{check.checkName}</td>
                      <td className="p-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          check.status === 'OK' ? 'bg-green-100 text-green-800' :
                          check.status === 'WARNING' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {check.status}
                        </span>
                      </td>
                      <td className="p-2 text-right">{check.expectedValue?.toFixed(2) || '-'}</td>
                      <td className="p-2 text-right">{check.actualValue?.toFixed(2) || '-'}</td>
                      <td className="p-2 text-right">{check.difference?.toFixed(2) || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
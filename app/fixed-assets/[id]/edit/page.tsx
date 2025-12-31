"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { BranchCostCenterSelector } from "@/components/branch-cost-center-selector"
import { ArrowLeft, Save } from "lucide-react"

interface AssetCategory {
  id: string
  code: string
  name: string
  default_useful_life_months: number
  default_depreciation_method: string
  default_asset_account_id?: string
  default_depreciation_account_id?: string
  default_expense_account_id?: string
}

interface Account {
  id: string
  account_code: string
  account_name: string
}

interface Branch {
  id: string
  name: string
  branch_name?: string
}

interface CostCenter {
  id: string
  cost_center_name: string
}

interface FixedAsset {
  id: string
  category_id: string
  asset_code: string
  name: string
  description?: string
  serial_number?: string
  purchase_date: string
  depreciation_start_date: string
  purchase_cost: number
  salvage_value: number
  useful_life_months: number
  depreciation_method: string
  declining_balance_rate: number
  asset_account_id: string
  accumulated_depreciation_account_id: string
  depreciation_expense_account_id: string
  branch_id?: string
  cost_center_id?: string
  warehouse_id?: string
  status: string
}

export default function EditFixedAssetPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [asset, setAsset] = useState<FixedAsset | null>(null)

  // === صلاحيات الأصول الثابتة ===
  const [permUpdate, setPermUpdate] = useState(false)

  // التحقق من الصلاحيات
  useEffect(() => {
    const checkPerms = async () => {
      const update = await canAction(supabase, "fixed_assets", "update")
      setPermUpdate(update)

      // إعادة توجيه إذا لم يكن لديه صلاحية
      if (!update) {
        toast({
          title: appLang === 'en' ? 'Access Denied' : 'رفض الوصول',
          description: appLang === 'en' ? 'You do not have permission to edit fixed assets' : 'ليس لديك صلاحية لتعديل الأصول الثابتة',
          variant: "destructive"
        })
        router.push('/fixed-assets')
      }
    }
    checkPerms()

    // الاستماع لتحديثات الصلاحيات
    const handler = () => { checkPerms() }
    if (typeof window !== 'undefined') window.addEventListener('permissions_updated', handler)
    return () => { if (typeof window !== 'undefined') window.removeEventListener('permissions_updated', handler) }
  }, [supabase, router, toast, appLang])

  const [formData, setFormData] = useState({
    category_id: '',
    asset_code: '',
    name: '',
    description: '',
    serial_number: '',
    purchase_date: '',
    depreciation_start_date: '',
    purchase_cost: '',
    salvage_value: '0',
    useful_life_months: '',
    depreciation_method: 'straight_line',
    declining_balance_rate: '0.20',
    asset_account_id: '',
    accumulated_depreciation_account_id: '',
    depreciation_expense_account_id: '',
    branch_id: null as string | null,
    cost_center_id: null as string | null,
    warehouse_id: null as string | null,
    status: 'draft'
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAppLang((localStorage.getItem('app_language') as 'ar' | 'en') || 'ar')
    }
    loadData()
  }, [params.id])

  const loadData = async () => {
    try {
      setIsLoadingData(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // Load asset data
      const { data: assetData } = await supabase
        .from('fixed_assets')
        .select('*')
        .eq('company_id', companyId)
        .eq('id', params.id)
        .single()

      if (assetData) {
        setAsset(assetData)
        setFormData({
          category_id: assetData.category_id || '',
          asset_code: assetData.asset_code || '',
          name: assetData.name || '',
          description: assetData.description || '',
          serial_number: assetData.serial_number || '',
          purchase_date: assetData.purchase_date ? assetData.purchase_date.split('T')[0] : '',
          depreciation_start_date: assetData.depreciation_start_date ? assetData.depreciation_start_date.split('T')[0] : '',
          purchase_cost: assetData.purchase_cost?.toString() || '',
          salvage_value: assetData.salvage_value?.toString() || '0',
          useful_life_months: assetData.useful_life_months?.toString() || '',
          depreciation_method: assetData.depreciation_method || 'straight_line',
          declining_balance_rate: assetData.declining_balance_rate?.toString() || '0.20',
          asset_account_id: assetData.asset_account_id || '',
          accumulated_depreciation_account_id: assetData.accumulated_depreciation_account_id || '',
          depreciation_expense_account_id: assetData.depreciation_expense_account_id || '',
          branch_id: assetData.branch_id || null,
          cost_center_id: assetData.cost_center_id || null,
          warehouse_id: assetData.warehouse_id || null,
          status: assetData.status || 'draft'
        })
      }

      // Load categories
      const { data: categoriesData } = await supabase
        .from('asset_categories')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name')
      setCategories(categoriesData || [])

      // Load accounts
      const { data: accountsData } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name')
        .eq('company_id', companyId)
        .order('account_code')
      setAccounts(accountsData || [])

      // Load branches
      const { data: branchesData } = await supabase
        .from('branches')
        .select('id, name, branch_name')
        .eq('company_id', companyId)
        .order('name')
      setBranches(branchesData || [])

      // Load cost centers
      const { data: costCentersData } = await supabase
        .from('cost_centers')
        .select('id, cost_center_name')
        .eq('company_id', companyId)
        .order('cost_center_name')
      setCostCenters(costCentersData || [])
    } catch (error) {
      console.error('Error loading data:', error)
      toast({ title: appLang === 'en' ? "Error loading data" : "خطأ في تحميل البيانات", variant: "destructive" })
    } finally {
      setIsLoadingData(false)
    }
  }

  const handleCategoryChange = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId)
    if (category) {
      setFormData(prev => ({
        ...prev,
        category_id: categoryId,
        useful_life_months: category.default_useful_life_months?.toString() || prev.useful_life_months,
        depreciation_method: category.default_depreciation_method || prev.depreciation_method,
        asset_account_id: category.default_asset_account_id || prev.asset_account_id,
        accumulated_depreciation_account_id: category.default_depreciation_account_id || prev.accumulated_depreciation_account_id,
        depreciation_expense_account_id: category.default_expense_account_id || prev.depreciation_expense_account_id
      }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // التحقق من الصلاحيات
    if (!permUpdate) {
      toast({
        title: appLang === 'en' ? 'Access Denied' : 'رفض الوصول',
        description: appLang === 'en' ? 'You do not have permission to update fixed assets' : 'ليس لديك صلاحية لتحديث الأصول الثابتة',
        variant: "destructive"
      })
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch(`/api/fixed-assets/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          purchase_cost: parseFloat(formData.purchase_cost),
          salvage_value: parseFloat(formData.salvage_value),
          useful_life_months: parseInt(formData.useful_life_months),
          declining_balance_rate: parseFloat(formData.declining_balance_rate)
        })
      })

      if (!response.ok) throw new Error('Failed to update asset')

      toast({ title: appLang === 'en' ? "Asset updated successfully" : "تم تحديث الأصل بنجاح" })
      router.push(`/fixed-assets/${params.id}`)
    } catch (error) {
      console.error('Error updating asset:', error)
      toast({ title: appLang === 'en' ? "Error updating asset" : "خطأ في تحديث الأصل", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoadingData) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
            <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </main>
      </div>
    )
  }

  if (!asset) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {appLang === 'en' ? 'Asset not found' : 'الأصل غير موجود'}
            </h1>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-8 max-w-full">
          <div className="min-w-0">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="flex items-center gap-4">
                <Button variant="outline" onClick={() => router.back()}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  {appLang === 'en' ? 'Back' : 'رجوع'}
                </Button>
                <div>
                  <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>
                    {(appLang === 'en') ? 'Edit Fixed Asset' : 'تعديل الأصل الثابت'}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2" suppressHydrationWarning>
                    {asset.name} ({asset.asset_code})
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* تحذير عند تعديل أصل نشط */}
          {asset.status === 'active' && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    {appLang === 'en' ? 'Active Asset' : 'أصل نشط'}
                  </h3>
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                    {appLang === 'en'
                      ? 'This asset is currently active and may have depreciation schedules. Changes to financial data may affect existing depreciation calculations.'
                      : 'هذا الأصل نشط حالياً وقد يحتوي على جداول إهلاك. التغييرات في البيانات المالية قد تؤثر على حسابات الإهلاك الموجودة.'
                    }
                  </p>
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    {appLang === 'en'
                      ? '💡 Tip: Review depreciation schedules after making changes.'
                      : '💡 نصيحة: راجع جداول الإهلاك بعد إجراء التغييرات.'
                    }
                  </p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Basic Information */}
              <Card className="dark:bg-slate-900">
                <CardHeader>
                  <CardTitle>{appLang === 'en' ? 'Basic Information' : 'المعلومات الأساسية'}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="category_id">{appLang === 'en' ? 'Category' : 'الفئة'} *</Label>
                    <Select value={formData.category_id} onValueChange={handleCategoryChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={appLang === 'en' ? 'Select category' : 'اختر الفئة'} />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name} ({category.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="asset_code">{appLang === 'en' ? 'Asset Code' : 'كود الأصل'} *</Label>
                    <Input
                      id="asset_code"
                      value={formData.asset_code}
                      onChange={(e) => setFormData(prev => ({ ...prev, asset_code: e.target.value }))}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="name">{appLang === 'en' ? 'Asset Name' : 'اسم الأصل'} *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="description">{appLang === 'en' ? 'Description' : 'الوصف'}</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label htmlFor="serial_number">{appLang === 'en' ? 'Serial Number' : 'الرقم التسلسلي'}</Label>
                    <Input
                      id="serial_number"
                      value={formData.serial_number}
                      onChange={(e) => setFormData(prev => ({ ...prev, serial_number: e.target.value }))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="status">{appLang === 'en' ? 'Status' : 'الحالة'}</Label>
                    <Select value={formData.status} onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">{appLang === 'en' ? 'Draft' : 'مسودة'}</SelectItem>
                        <SelectItem value="active">{appLang === 'en' ? 'Active' : 'نشط'}</SelectItem>
                        <SelectItem value="suspended">{appLang === 'en' ? 'Suspended' : 'معلق'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Financial Information */}
              <Card className="dark:bg-slate-900">
                <CardHeader>
                  <CardTitle>{appLang === 'en' ? 'Financial Information' : 'المعلومات المالية'}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="purchase_date">{appLang === 'en' ? 'Purchase Date' : 'تاريخ الشراء'} *</Label>
                    <Input
                      id="purchase_date"
                      type="date"
                      value={formData.purchase_date}
                      onChange={(e) => setFormData(prev => ({ ...prev, purchase_date: e.target.value }))}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="depreciation_start_date">{appLang === 'en' ? 'Depreciation Start Date' : 'تاريخ بدء الإهلاك'} *</Label>
                    <Input
                      id="depreciation_start_date"
                      type="date"
                      value={formData.depreciation_start_date}
                      onChange={(e) => setFormData(prev => ({ ...prev, depreciation_start_date: e.target.value }))}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="purchase_cost">{appLang === 'en' ? 'Purchase Cost' : 'قيمة الشراء'} *</Label>
                    <NumericInput
                      id="purchase_cost"
                      step="0.01"
                      value={Number(formData.purchase_cost) || 0}
                      onChange={(val) => setFormData(prev => ({ ...prev, purchase_cost: String(val) }))}
                      decimalPlaces={2}
                    />
                  </div>

                  <div>
                    <Label htmlFor="salvage_value">{appLang === 'en' ? 'Salvage Value' : 'القيمة المتبقية'}</Label>
                    <NumericInput
                      id="salvage_value"
                      step="0.01"
                      value={Number(formData.salvage_value) || 0}
                      onChange={(val) => setFormData(prev => ({ ...prev, salvage_value: String(val) }))}
                      decimalPlaces={2}
                    />
                  </div>

                  <div>
                    <Label htmlFor="useful_life_months">{appLang === 'en' ? 'Useful Life (Months)' : 'العمر الإنتاجي (بالأشهر)'} *</Label>
                    <NumericInput
                      id="useful_life_months"
                      value={Number(formData.useful_life_months) || 0}
                      onChange={(val) => setFormData(prev => ({ ...prev, useful_life_months: String(Math.round(val)) }))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="depreciation_method">{appLang === 'en' ? 'Depreciation Method' : 'طريقة الإهلاك'} *</Label>
                    <Select value={formData.depreciation_method} onValueChange={(value) => setFormData(prev => ({ ...prev, depreciation_method: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="straight_line">{appLang === 'en' ? 'Straight Line' : 'القسط الثابت'}</SelectItem>
                        <SelectItem value="declining_balance">{appLang === 'en' ? 'Declining Balance' : 'القسط المتناقص'}</SelectItem>
                        <SelectItem value="units_of_production">{appLang === 'en' ? 'Units of Production' : 'وحدات الإنتاج'}</SelectItem>
                        <SelectItem value="sum_of_years">{appLang === 'en' ? 'Sum of Years' : 'مجموع السنوات'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.depreciation_method === 'declining_balance' && (
                    <div>
                      <Label htmlFor="declining_balance_rate">{appLang === 'en' ? 'Declining Balance Rate' : 'معدل القسط المتناقص'}</Label>
                      <NumericInput
                        id="declining_balance_rate"
                        step="0.01"
                        min={0}
                        max={1}
                        value={Number(formData.declining_balance_rate) || 0}
                        onChange={(val) => setFormData(prev => ({ ...prev, declining_balance_rate: String(val) }))}
                        decimalPlaces={2}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Accounting */}
              <Card className="dark:bg-slate-900">
                <CardHeader>
                  <CardTitle>{appLang === 'en' ? 'Accounting' : 'المحاسبة'}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="asset_account_id">{appLang === 'en' ? 'Asset Account' : 'حساب الأصل'} *</Label>
                    <Select value={formData.asset_account_id} onValueChange={(value) => setFormData(prev => ({ ...prev, asset_account_id: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder={appLang === 'en' ? 'Select account' : 'اختر الحساب'} />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.account_code} - {account.account_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="accumulated_depreciation_account_id">{appLang === 'en' ? 'Accumulated Depreciation Account' : 'حساب مجمع الإهلاك'} *</Label>
                    <Select value={formData.accumulated_depreciation_account_id} onValueChange={(value) => setFormData(prev => ({ ...prev, accumulated_depreciation_account_id: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder={appLang === 'en' ? 'Select account' : 'اختر الحساب'} />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.account_code} - {account.account_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="depreciation_expense_account_id">{appLang === 'en' ? 'Depreciation Expense Account' : 'حساب مصروف الإهلاك'} *</Label>
                    <Select value={formData.depreciation_expense_account_id} onValueChange={(value) => setFormData(prev => ({ ...prev, depreciation_expense_account_id: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder={appLang === 'en' ? 'Select account' : 'اختر الحساب'} />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.account_code} - {account.account_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Organization */}
              <Card className="dark:bg-slate-900">
                <CardHeader>
                  <CardTitle>{appLang === 'en' ? 'Organization' : 'التنظيم'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <BranchCostCenterSelector
                    branchId={formData.branch_id}
                    costCenterId={formData.cost_center_id}
                    warehouseId={formData.warehouse_id}
                    onBranchChange={(value) => setFormData(prev => ({ ...prev, branch_id: value }))}
                    onCostCenterChange={(value) => setFormData(prev => ({ ...prev, cost_center_id: value }))}
                    onWarehouseChange={(value) => setFormData(prev => ({ ...prev, warehouse_id: value }))}
                    lang={appLang}
                    showLabels={true}
                    showWarehouse={true}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Submit */}
            {permUpdate && (
              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                </Button>
                <Button type="submit" disabled={isLoading} className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800">
                  <Save className="w-4 h-4 mr-2" />
                  {isLoading ? (appLang === 'en' ? 'Updating...' : 'جاري التحديث...') : (appLang === 'en' ? 'Update Asset' : 'تحديث الأصل')}
                </Button>
              </div>
            )}
          </form>
        </div>
      </main>
    </div>
  )
}
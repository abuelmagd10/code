"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
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
    branch_id: '',
    cost_center_id: '',
    warehouse_id: '',
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
          branch_id: assetData.branch_id || '',
          cost_center_id: assetData.cost_center_id || '',
          warehouse_id: assetData.warehouse_id || '',
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
      <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {appLang === 'en' ? 'Back' : 'رجوع'}
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
              {appLang === 'en' ? 'Edit Fixed Asset' : 'تعديل الأصل الثابت'}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {asset.name} ({asset.asset_code})
            </p>
          </div>
        </div>

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
                  <Input
                    id="purchase_cost"
                    type="number"
                    step="0.01"
                    value={formData.purchase_cost}
                    onChange={(e) => setFormData(prev => ({ ...prev, purchase_cost: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="salvage_value">{appLang === 'en' ? 'Salvage Value' : 'القيمة المتبقية'}</Label>
                  <Input
                    id="salvage_value"
                    type="number"
                    step="0.01"
                    value={formData.salvage_value}
                    onChange={(e) => setFormData(prev => ({ ...prev, salvage_value: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="useful_life_months">{appLang === 'en' ? 'Useful Life (Months)' : 'العمر الإنتاجي (بالأشهر)'} *</Label>
                  <Input
                    id="useful_life_months"
                    type="number"
                    value={formData.useful_life_months}
                    onChange={(e) => setFormData(prev => ({ ...prev, useful_life_months: e.target.value }))}
                    required
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
                    <Input
                      id="declining_balance_rate"
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={formData.declining_balance_rate}
                      onChange={(e) => setFormData(prev => ({ ...prev, declining_balance_rate: e.target.value }))}
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
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="branch_id">{appLang === 'en' ? 'Branch' : 'الفرع'}</Label>
                  <Select value={formData.branch_id} onValueChange={(value) => setFormData(prev => ({ ...prev, branch_id: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder={appLang === 'en' ? 'Select branch' : 'اختر الفرع'} />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.branch_name || branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="cost_center_id">{appLang === 'en' ? 'Cost Center' : 'مركز التكلفة'}</Label>
                  <Select value={formData.cost_center_id} onValueChange={(value) => setFormData(prev => ({ ...prev, cost_center_id: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder={appLang === 'en' ? 'Select cost center' : 'اختر مركز التكلفة'} />
                    </SelectTrigger>
                    <SelectContent>
                      {costCenters.map((cc) => (
                        <SelectItem key={cc.id} value={cc.id}>
                          {cc.cost_center_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              {appLang === 'en' ? 'Cancel' : 'إلغاء'}
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800">
              <Save className="w-4 h-4 mr-2" />
              {isLoading ? (appLang === 'en' ? 'Updating...' : 'جاري التحديث...') : (appLang === 'en' ? 'Update Asset' : 'تحديث الأصل')}
            </Button>
          </div>
        </form>
      </main>
    </div>
  )
}
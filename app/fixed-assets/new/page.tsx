"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
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
import { ArrowLeft, Save } from "lucide-react"
import { ListErrorBoundary } from "@/components/list-error-boundary"

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

export default function NewFixedAssetPage() {
  const router = useRouter()
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [isLoading, setIsLoading] = useState(false)
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])

  // === صلاحيات الأصول الثابتة ===
  const [permWrite, setPermWrite] = useState(false)

  // التحقق من الصلاحيات
  useEffect(() => {
    const checkPerms = async () => {
      const write = await canAction(supabase, "fixed_assets", "write")
      setPermWrite(write)

      // إعادة توجيه إذا لم يكن لديه صلاحية
      if (!write) {
        toast({
          title: appLang === 'en' ? 'Access Denied' : 'رفض الوصول',
          description: appLang === 'en' ? 'You do not have permission to create fixed assets' : 'ليس لديك صلاحية لإنشاء أصول ثابتة',
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
    branch_id: '',
    cost_center_id: '',
    warehouse_id: ''
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAppLang((localStorage.getItem('app_language') as 'ar' | 'en') || 'ar')
    }
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

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
    }
  }

  const handleCategoryChange = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId)
    if (category) {
      setFormData(prev => ({
        ...prev,
        category_id: categoryId,
        useful_life_months: category.default_useful_life_months?.toString() || '',
        depreciation_method: category.default_depreciation_method || 'straight_line',
        asset_account_id: category.default_asset_account_id || '',
        accumulated_depreciation_account_id: category.default_depreciation_account_id || '',
        depreciation_expense_account_id: category.default_expense_account_id || ''
      }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // التحقق من الصلاحيات
    if (!permWrite) {
      toast({
        title: appLang === 'en' ? 'Access Denied' : 'رفض الوصول',
        description: appLang === 'en' ? 'You do not have permission to create fixed assets' : 'ليس لديك صلاحية لإنشاء أصول ثابتة',
        variant: "destructive"
      })
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/fixed-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          purchase_cost: parseFloat(formData.purchase_cost),
          salvage_value: parseFloat(formData.salvage_value),
          useful_life_months: parseInt(formData.useful_life_months),
          declining_balance_rate: parseFloat(formData.declining_balance_rate)
        })
      })

      if (!response.ok) throw new Error('Failed to create asset')

      const result = await response.json()
      toast({ title: appLang === 'en' ? "Asset created successfully" : "تم إنشاء الأصل بنجاح" })
      router.push(`/fixed-assets/${result.data.id}`)
    } catch (error) {
      console.error('Error creating asset:', error)
      toast({ title: appLang === 'en' ? "Error creating asset" : "خطأ في إنشاء الأصل", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />

      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <ListErrorBoundary listType="generic" lang={appLang}>
          <div className="space-y-4 sm:space-y-6 max-w-full">
            {/* رأس الصفحة - تحسين للهاتف */}
            <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-3 sm:gap-4">
                  <Button variant="outline" onClick={() => router.back()}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    {appLang === 'en' ? 'Back' : 'رجوع'}
                  </Button>
                  <div className="min-w-0">
                    <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                      {appLang === 'en' ? 'Add Fixed Asset' : 'إضافة أصل ثابت'}
                    </h1>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                      {appLang === 'en' ? 'Create a new fixed asset' : 'إنشاء أصل ثابت جديد'}
                    </p>
                  </div>
                </div>
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
                      <Label htmlFor="asset_code">{appLang === 'en' ? 'Asset Code' : 'كود الأصل'}</Label>
                      <Input
                        id="asset_code"
                        value={formData.asset_code}
                        onChange={(e) => setFormData(prev => ({ ...prev, asset_code: e.target.value }))}
                        placeholder={appLang === 'en' ? 'Auto-generated if empty' : 'يتم إنشاؤه تلقائياً إذا كان فارغاً'}
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
              {permWrite && (
                <div className="flex justify-end gap-4">
                  <Button type="button" variant="outline" onClick={() => router.back()}>
                    {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                  </Button>
                  <Button type="submit" disabled={isLoading} className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800">
                    <Save className="w-4 h-4 mr-2" />
                    {isLoading ? (appLang === 'en' ? 'Creating...' : 'جاري الإنشاء...') : (appLang === 'en' ? 'Create Asset' : 'إنشاء الأصل')}
                  </Button>
                </div>
              )}
            </form>
          </div>
        </ListErrorBoundary>
      </main>
    </div>
  )
}
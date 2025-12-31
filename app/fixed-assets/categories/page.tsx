"use client"

import { useState, useEffect, useCallback } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { ListErrorBoundary } from "@/components/list-error-boundary"
import { FilterContainer } from "@/components/ui/filter-container"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { X } from "lucide-react"

// Utility function for number formatting
const formatNumber = (num: number) => {
  return num.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
import {
  Plus, Search, RefreshCcw, Edit2, Trash2,
  Building2, Calculator, DollarSign
} from "lucide-react"

interface AssetCategory {
  id: string
  code: string
  name: string
  description?: string
  default_useful_life_months: number
  default_depreciation_method: string
  default_asset_account_id?: string
  default_depreciation_account_id?: string
  default_expense_account_id?: string
  is_active: boolean
}

interface Account {
  id: string
  account_code: string
  account_name: string
}

export default function AssetCategoriesPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [isLoading, setIsLoading] = useState(true)
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<AssetCategory | null>(null)

  // === صلاحيات فئات الأصول ===
  const [permWrite, setPermWrite] = useState(false)
  const [permUpdate, setPermUpdate] = useState(false)
  const [permDelete, setPermDelete] = useState(false)

  // التحقق من الصلاحيات
  useEffect(() => {
    const checkPerms = async () => {
      const [write, update, del] = await Promise.all([
        canAction(supabase, "asset_categories", "write"),
        canAction(supabase, "asset_categories", "update"),
        canAction(supabase, "asset_categories", "delete"),
      ])
      setPermWrite(write)
      setPermUpdate(update)
      setPermDelete(del)
    }
    checkPerms()

    // الاستماع لتحديثات الصلاحيات
    const handler = () => { checkPerms() }
    if (typeof window !== 'undefined') window.addEventListener('permissions_updated', handler)
    return () => { if (typeof window !== 'undefined') window.removeEventListener('permissions_updated', handler) }
  }, [supabase])

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    default_useful_life_months: '60',
    default_depreciation_method: 'straight_line',
    default_asset_account_id: '',
    default_depreciation_account_id: '',
    default_expense_account_id: ''
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAppLang((localStorage.getItem('app_language') as 'ar' | 'en') || 'ar')
    }
    loadData()
  }, [])

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // Load categories
      const { data: categoriesData } = await supabase
        .from('asset_categories')
        .select('*')
        .eq('company_id', companyId)
        .order('name')
      setCategories(categoriesData || [])

      // Load accounts
      const { data: accountsData } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name')
        .eq('company_id', companyId)
        .order('account_code')
      setAccounts(accountsData || [])
    } catch (error) {
      console.error('Error loading data:', error)
      toast({ title: appLang === 'en' ? "Error loading data" : "خطأ في تحميل البيانات", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }, [supabase, toast, appLang])

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      default_useful_life_months: '60',
      default_depreciation_method: 'straight_line',
      default_asset_account_id: '',
      default_depreciation_account_id: '',
      default_expense_account_id: ''
    })
    setEditingCategory(null)
  }

  const handleEdit = (category: AssetCategory) => {
    setEditingCategory(category)
    setFormData({
      code: category.code,
      name: category.name,
      description: category.description || '',
      default_useful_life_months: category.default_useful_life_months.toString(),
      default_depreciation_method: category.default_depreciation_method,
      default_asset_account_id: category.default_asset_account_id || '',
      default_depreciation_account_id: category.default_depreciation_account_id || '',
      default_expense_account_id: category.default_expense_account_id || ''
    })
    setIsDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // التحقق من الصلاحيات
    const requiredPerm = editingCategory ? permUpdate : permWrite
    if (!requiredPerm) {
      toast({
        title: appLang === 'en' ? 'Access Denied' : 'رفض الوصول',
        description: appLang === 'en'
          ? `You do not have permission to ${editingCategory ? 'update' : 'create'} asset categories`
          : `ليس لديك صلاحية ل${editingCategory ? 'تعديل' : 'إنشاء'} فئات الأصول`,
        variant: "destructive"
      })
      return
    }

    try {
      const response = await fetch('/api/fixed-assets/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          default_useful_life_months: parseInt(formData.default_useful_life_months)
        })
      })

      if (!response.ok) throw new Error('Failed to save category')

      toast({ title: appLang === 'en' ? "Category saved successfully" : "تم حفظ الفئة بنجاح" })
      setIsDialogOpen(false)
      resetForm()
      loadData()
    } catch (error) {
      console.error('Error saving category:', error)
      toast({ title: appLang === 'en' ? "Error saving category" : "خطأ في حفظ الفئة", variant: "destructive" })
    }
  }

  const filteredCategories = categories.filter(category => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      return category.name.toLowerCase().includes(term) ||
        category.code.toLowerCase().includes(term) ||
        (category.description && category.description.toLowerCase().includes(term))
    }
    return true
  })

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
                  <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                    <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                      {appLang === 'en' ? 'Asset Categories' : 'فئات الأصول'}
                    </h1>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                      {appLang === 'en' ? 'Manage fixed asset categories and defaults' : 'إدارة فئات الأصول الثابتة والإعدادات الافتراضية'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={loadData} disabled={isLoading}>
                  <RefreshCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
                {permWrite && (
                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                        onClick={resetForm}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        {appLang === 'en' ? 'Add Category' : 'إضافة فئة'}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl dark:bg-slate-900">
                      <DialogHeader>
                        <DialogTitle>
                          {editingCategory ? (appLang === 'en' ? 'Edit Category' : 'تعديل الفئة') : (appLang === 'en' ? 'Add Category' : 'إضافة فئة')}
                        </DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="code">{appLang === 'en' ? 'Code' : 'الكود'} *</Label>
                            <Input
                              id="code"
                              value={formData.code}
                              onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                              required
                              disabled={!!editingCategory}
                            />
                          </div>
                          <div>
                            <Label htmlFor="name">{appLang === 'en' ? 'Name' : 'الاسم'} *</Label>
                            <Input
                              id="name"
                              value={formData.name}
                              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <Label htmlFor="description">{appLang === 'en' ? 'Description' : 'الوصف'}</Label>
                          <Textarea
                            id="description"
                            value={formData.description}
                            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                            rows={2}
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="default_useful_life_months">{appLang === 'en' ? 'Default Useful Life (Months)' : 'العمر الافتراضي (بالأشهر)'} *</Label>
                            <NumericInput
                              id="default_useful_life_months"
                              value={Number(formData.default_useful_life_months) || 0}
                              onChange={(val) => setFormData(prev => ({ ...prev, default_useful_life_months: String(Math.round(val)) }))}
                            />
                          </div>
                          <div>
                            <Label htmlFor="default_depreciation_method">{appLang === 'en' ? 'Default Depreciation Method' : 'طريقة الإهلاك الافتراضية'} *</Label>
                            <Select value={formData.default_depreciation_method} onValueChange={(value) => setFormData(prev => ({ ...prev, default_depreciation_method: value }))}>
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
                        </div>

                        <div className="space-y-4">
                          <h3 className="text-lg font-medium">{appLang === 'en' ? 'Default Accounts' : 'الحسابات الافتراضية'}</h3>

                          <div>
                            <Label htmlFor="default_asset_account_id">{appLang === 'en' ? 'Asset Account' : 'حساب الأصل'}</Label>
                            <Select value={formData.default_asset_account_id} onValueChange={(value) => setFormData(prev => ({ ...prev, default_asset_account_id: value }))}>
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
                            <Label htmlFor="default_depreciation_account_id">{appLang === 'en' ? 'Accumulated Depreciation Account' : 'حساب مجمع الإهلاك'}</Label>
                            <Select value={formData.default_depreciation_account_id} onValueChange={(value) => setFormData(prev => ({ ...prev, default_depreciation_account_id: value }))}>
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
                            <Label htmlFor="default_expense_account_id">{appLang === 'en' ? 'Depreciation Expense Account' : 'حساب مصروف الإهلاك'}</Label>
                            <Select value={formData.default_expense_account_id} onValueChange={(value) => setFormData(prev => ({ ...prev, default_expense_account_id: value }))}>
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
                        </div>

                        {(permWrite || permUpdate) && (
                          <div className="flex justify-end gap-2 pt-4">
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                              {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                            </Button>
                            <Button type="submit">
                              {editingCategory ? (appLang === 'en' ? 'Update' : 'تحديث') : (appLang === 'en' ? 'Create' : 'إنشاء')}
                            </Button>
                          </div>
                        )}
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>

            {/* Search */}
            <Card className="mb-6 dark:bg-slate-900">
              <CardContent className="p-4">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder={appLang === 'en' ? 'Search categories...' : 'بحث في الفئات...'}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pr-10"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Categories Table */}
            <Card className="dark:bg-slate-900">
              <CardHeader>
                <CardTitle>{appLang === 'en' ? 'Categories' : 'الفئات'}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{appLang === 'en' ? 'Code' : 'الكود'}</TableHead>
                      <TableHead>{appLang === 'en' ? 'Name' : 'الاسم'}</TableHead>
                      <TableHead>{appLang === 'en' ? 'Useful Life' : 'العمر الإنتاجي'}</TableHead>
                      <TableHead>{appLang === 'en' ? 'Depreciation Method' : 'طريقة الإهلاك'}</TableHead>
                      <TableHead>{appLang === 'en' ? 'Status' : 'الحالة'}</TableHead>
                      <TableHead>{appLang === 'en' ? 'Actions' : 'الإجراءات'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCategories.map((category) => (
                      <TableRow key={category.id}>
                        <TableCell className="font-mono">{category.code}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{category.name}</div>
                            {category.description && (
                              <div className="text-sm text-gray-500">{category.description}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{category.default_useful_life_months} {appLang === 'en' ? 'months' : 'شهر'}</TableCell>
                        <TableCell>
                          {category.default_depreciation_method === 'straight_line' ? (appLang === 'en' ? 'Straight Line' : 'قسط ثابت') :
                            category.default_depreciation_method === 'declining_balance' ? (appLang === 'en' ? 'Declining Balance' : 'قسط متناقص') :
                              category.default_depreciation_method}
                        </TableCell>
                        <TableCell>
                          <Badge className={category.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}>
                            {category.is_active ? (appLang === 'en' ? 'Active' : 'نشط') : (appLang === 'en' ? 'Inactive' : 'غير نشط')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {permUpdate && (
                              <Button variant="outline" size="sm" onClick={() => handleEdit(category)}>
                                <Edit2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredCategories.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-gray-500">
                          {appLang === 'en' ? 'No categories found' : 'لا توجد فئات'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </ListErrorBoundary>
      </main>
    </div>
  )
}
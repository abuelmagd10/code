"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { ArrowLeft, Save } from "lucide-react"
import { CompanyHeader } from "@/components/company-header"
import { useToast } from "@/hooks/use-toast"
import { NumericInput } from "@/components/ui/numeric-input"
import { BranchCostCenterSelectorEnhanced } from "@/components/branch-cost-center-selector-enhanced"

type Account = {
  id: string
  account_code: string
  account_name: string
}

export default function NewExpensePage() {
  const router = useRouter()
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [hydrated, setHydrated] = useState(false)
  const [saving, setSaving] = useState(false)
  const [companyId, setCompanyId] = useState<string>("")
  const [userId, setUserId] = useState<string>("")

  // Form fields
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0])
  const [description, setDescription] = useState("")
  const [notes, setNotes] = useState("")
  const [amount, setAmount] = useState<number>(0)
  const [currencyCode, setCurrencyCode] = useState("EGP")
  const [expenseCategory, setExpenseCategory] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("")
  const [expenseAccountId, setExpenseAccountId] = useState("")
  const [paymentAccountId, setPaymentAccountId] = useState("")

  // Branch, Cost Center, Warehouse
  const [branchId, setBranchId] = useState<string | null>(null)
  const [costCenterId, setCostCenterId] = useState<string | null>(null)
  const [warehouseId, setWarehouseId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean>(false) // 🔐 Governance: Admin role state

  // Accounts
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([])
  const [paymentAccounts, setPaymentAccounts] = useState<Account[]>([])

  useEffect(() => {
    setHydrated(true)
    const handler = () => {
      try {
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      } catch { }
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, [])

  useEffect(() => {
    loadInitialData()
  }, [])

  const loadInitialData = async () => {
    try {
      const cid = await getActiveCompanyId(supabase)
      if (!cid) return
      setCompanyId(cid)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      // 🔐 Enterprise Governance: Load member data with role
      const { data: member } = await supabase
        .from("company_members")
        .select("role, branch_id")
        .eq("company_id", cid)
        .eq("user_id", user.id)
        .maybeSingle()

      const userRole = member?.role || 'employee'
      const userBranchId = member?.branch_id || null

      // 🔐 Enterprise Governance: Check if user is Admin or GeneralManager
      const normalizedRole = String(userRole || '').trim().toLowerCase().replace(/\s+/g, '_')
      const adminCheck = ['super_admin', 'admin', 'general_manager', 'gm', 'owner', 'generalmanager', 'superadmin'].includes(normalizedRole)
      setIsAdmin(adminCheck)

      console.log('[NewExpense] Governance:', { userRole, normalizedRole, isAdmin: adminCheck, userBranchId })

      // 🔐 Enterprise Pattern: User → Branch → (Default Cost Center, Default Warehouse)
      if (userBranchId) {
        // Fetch branch defaults instead of user assignments
        const { getBranchDefaults } = await import('@/lib/governance-branch-defaults')

        try {
          const branchDefaults = await getBranchDefaults(supabase, userBranchId)

          // Validate branch has required defaults
          if (!branchDefaults.default_cost_center_id) {
            console.warn(
              `[NewExpense] Branch missing required defaults. ` +
              `Cost Center: ${branchDefaults.default_cost_center_id || 'NULL'}`
            )
          }

          // Set branch and defaults
          setBranchId(userBranchId)
          setCostCenterId(branchDefaults.default_cost_center_id || null)
          setWarehouseId(branchDefaults.default_warehouse_id || null)

          console.log('[NewExpense] Branch defaults applied:', {
            branchId: userBranchId,
            costCenterId: branchDefaults.default_cost_center_id,
            warehouseId: branchDefaults.default_warehouse_id
          })
        } catch (error) {
          console.error('[NewExpense] Error loading branch defaults:', error)
          toast({
            title: appLang === 'en' ? 'Configuration Error' : 'خطأ في الإعدادات',
            description: appLang === 'en'
              ? 'Branch configuration is incomplete. Please contact your administrator.'
              : 'إعدادات الفرع غير مكتملة. يرجى الاتصال بالمسؤول.',
            variant: 'destructive'
          })
        }
      }

      // Load expense accounts (type = 'expense')
      const { data: expAccounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name")
        .eq("company_id", cid)
        .eq("account_type", "expense")
        .eq("is_active", true)
        .order("account_code")

      setExpenseAccounts(expAccounts || [])

      // Load payment accounts (cash/bank)
      const { data: payAccounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name")
        .eq("company_id", cid)
        .in("account_type", ["asset"])
        .eq("is_active", true)
        .order("account_code")

      setPaymentAccounts(payAccounts || [])
    } catch (error: any) {
      console.error("Error loading initial data:", error)
    }
  }

  // 🔐 Enterprise Governance: Handle branch change and auto-update cost center
  // Note: This must be synchronous to match the onBranchChange prop type
  const handleBranchChange = (newBranchId: string | null) => {
    setBranchId(newBranchId)

    if (!newBranchId) {
      setCostCenterId(null)
      setWarehouseId(null)
      return
    }

    // Load branch defaults asynchronously in the background
    // This prevents race conditions with the selector component
    const loadBranchDefaults = async () => {
      try {
        const { getBranchDefaults } = await import('@/lib/governance-branch-defaults')
        const branchDefaults = await getBranchDefaults(supabase, newBranchId)

        // Auto-set cost center to branch default
        setCostCenterId(branchDefaults.default_cost_center_id || null)
        setWarehouseId(branchDefaults.default_warehouse_id || null)

        console.log('[NewExpense] Branch changed, defaults updated:', {
          branchId: newBranchId,
          costCenterId: branchDefaults.default_cost_center_id,
          warehouseId: branchDefaults.default_warehouse_id
        })
      } catch (error) {
        console.error('[NewExpense] Error loading branch defaults on change:', error)
      }
    }

    // Execute async operation without blocking
    loadBranchDefaults()
  }

  const handleSave = async () => {
    // 🔐 Enterprise Governance: Validate required fields
    if (!description.trim()) {
      toast({
        title: appLang === 'en' ? 'Error' : 'خطأ',
        description: appLang === 'en' ? 'Please enter expense description' : 'الرجاء إدخال وصف المصروف',
        variant: "destructive"
      })
      return
    }

    if (amount <= 0) {
      toast({
        title: appLang === 'en' ? 'Error' : 'خطأ',
        description: appLang === 'en' ? 'Please enter a valid amount' : 'الرجاء إدخال مبلغ صحيح',
        variant: "destructive"
      })
      return
    }

    // 🔐 Enterprise Governance: Validate branch and cost center
    if (!branchId) {
      toast({
        title: appLang === 'en' ? 'Error' : 'خطأ',
        description: appLang === 'en' ? 'Branch is required' : 'الفرع مطلوب',
        variant: "destructive"
      })
      return
    }

    if (!costCenterId) {
      toast({
        title: appLang === 'en' ? 'Error' : 'خطأ',
        description: appLang === 'en' ? 'Cost center is required' : 'مركز التكلفة مطلوب',
        variant: "destructive"
      })
      return
    }

    try {
      setSaving(true)

      // Generate expense number
      const { data: nextNumberData } = await supabase.rpc("generate_expense_number", {
        p_company_id: companyId
      })

      const expenseNumber = nextNumberData || `EXP-${Date.now()}`

      // 🔐 Enterprise Governance: Insert with validated branch and cost center
      const { data, error } = await supabase
        .from("expenses")
        .insert({
          company_id: companyId,
          branch_id: branchId, // Required and validated
          cost_center_id: costCenterId, // Required and validated
          warehouse_id: warehouseId || null,
          expense_number: expenseNumber,
          expense_date: expenseDate,
          description: description.trim(),
          notes: notes.trim() || null,
          amount,
          currency_code: currencyCode,
          expense_category: expenseCategory || null,
          payment_method: paymentMethod || null,
          expense_account_id: expenseAccountId || null,
          payment_account_id: paymentAccountId || null,
          status: "draft",
          approval_status: "pending",
          created_by: userId
        })
        .select()
        .single()

      if (error) throw error

      toast({
        title: "تم الحفظ",
        description: "تم إنشاء المصروف بنجاح"
      })

      router.push(`/expenses/${data.id}`)
    } catch (error: any) {
      console.error("Error saving expense:", error)
      toast({
        title: "خطأ",
        description: "فشل حفظ المصروف",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  const expenseCategories = [
    "رواتب وأجور",
    "إيجار",
    "كهرباء ومياه",
    "صيانة",
    "مواصلات",
    "اتصالات",
    "قرطاسية",
    "تسويق وإعلان",
    "ضيافة",
    "أخرى"
  ]

  const paymentMethods = [
    { value: "cash", label: "نقدي" },
    { value: "bank_transfer", label: "تحويل بنكي" },
    { value: "check", label: "شيك" },
    { value: "credit_card", label: "بطاقة ائتمان" }
  ]

  if (!hydrated) return null

  return (
    <div className={`flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 ${appLang === 'ar' ? 'rtl' : 'ltr'}`} dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* Page Header */}
          <div className="min-w-0">
            <div className="mb-4">
              <Link href="/expenses">
                <Button variant="ghost" size="sm" className="dark:text-gray-300 dark:hover:bg-slate-800">
                  <ArrowLeft className="h-4 w-4 ml-2" />
                  {appLang === 'en' ? 'Back to Expenses' : 'العودة للمصروفات'}
                </Button>
              </Link>
            </div>
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>
              {appLang === 'en' ? 'New Expense' : 'مصروف جديد'}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2" suppressHydrationWarning>
              {appLang === 'en' ? 'Create a new expense record' : 'إنشاء سجل مصروف جديد'}
            </p>
          </div>

          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="dark:text-white" suppressHydrationWarning>
                {appLang === 'en' ? 'Expense Information' : 'معلومات المصروف'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
            {/* Branch, Cost Center, Warehouse Selector */}
            <BranchCostCenterSelectorEnhanced
              branchId={branchId}
              costCenterId={costCenterId}
              warehouseId={warehouseId}
              onBranchChange={handleBranchChange}
              onCostCenterChange={setCostCenterId}
              onWarehouseChange={setWarehouseId}
              disabled={!isAdmin} // 🔐 Governance: Only Admin/GeneralManager can change these fields
              required={true}
              lang={appLang}
              showLabels={true}
              showWarehouse={false}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                  {appLang === 'en' ? 'Expense Date *' : 'تاريخ المصروف *'}
                </Label>
                <Input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                  {appLang === 'en' ? 'Currency' : 'العملة'}
                </Label>
                <Select value={currencyCode} onValueChange={setCurrencyCode}>
                  <SelectTrigger className="bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EGP">{appLang === 'en' ? 'Egyptian Pound (EGP)' : 'جنيه مصري (EGP)'}</SelectItem>
                    <SelectItem value="USD">{appLang === 'en' ? 'US Dollar (USD)' : 'دولار أمريكي (USD)'}</SelectItem>
                    <SelectItem value="EUR">{appLang === 'en' ? 'Euro (EUR)' : 'يورو (EUR)'}</SelectItem>
                    <SelectItem value="SAR">{appLang === 'en' ? 'Saudi Riyal (SAR)' : 'ريال سعودي (SAR)'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                {appLang === 'en' ? 'Description *' : 'الوصف *'}
              </Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={appLang === 'en' ? 'Expense description...' : 'وصف المصروف...'}
                className="bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                  {appLang === 'en' ? 'Amount *' : 'المبلغ *'}
                </Label>
                <NumericInput
                  value={amount}
                  onChange={setAmount}
                  placeholder="0.00"
                  className="bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                  {appLang === 'en' ? 'Category' : 'التصنيف'}
                </Label>
                <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                  <SelectTrigger className="bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600">
                    <SelectValue placeholder={appLang === 'en' ? 'Select category' : 'اختر التصنيف'} />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                  {appLang === 'en' ? 'Payment Method' : 'طريقة الدفع'}
                </Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600">
                    <SelectValue placeholder={appLang === 'en' ? 'Select payment method' : 'اختر طريقة الدفع'} />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((method) => (
                      <SelectItem key={method.value} value={method.value}>
                        {method.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                  {appLang === 'en' ? 'Expense Account' : 'حساب المصروف'}
                </Label>
                <Select value={expenseAccountId} onValueChange={setExpenseAccountId}>
                  <SelectTrigger className="bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600">
                    <SelectValue placeholder={appLang === 'en' ? 'Select account' : 'اختر الحساب'} />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.account_code} - {acc.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                {appLang === 'en' ? 'Payment Account (Cash/Bank)' : 'حساب الدفع (نقدية/بنك)'}
              </Label>
              <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                <SelectTrigger className="bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600">
                  <SelectValue placeholder={appLang === 'en' ? 'Select account' : 'اختر الحساب'} />
                </SelectTrigger>
                <SelectContent>
                  {paymentAccounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.account_code} - {acc.account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                {appLang === 'en' ? 'Notes' : 'ملاحظات'}
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={appLang === 'en' ? 'Additional notes...' : 'ملاحظات إضافية...'}
                rows={4}
                className="bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600"
              />
            </div>

            <div className="flex gap-2 justify-end pt-4 border-t dark:border-slate-700">
              <Link href="/expenses">
                <Button variant="outline" disabled={saving} className="dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700">
                  {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                </Button>
              </Link>
              <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700">
                <Save className="h-4 w-4 ml-2" />
                {saving ? (appLang === 'en' ? 'Saving...' : 'جاري الحفظ...') : (appLang === 'en' ? 'Save' : 'حفظ')}
              </Button>
            </div>
          </CardContent>
        </Card>
        </div>
      </main>
    </div>
  )
}


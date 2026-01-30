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
  const [branchId, setBranchId] = useState<string>("")
  const [costCenterId, setCostCenterId] = useState<string>("")
  const [warehouseId, setWarehouseId] = useState<string>("")
  
  // Accounts
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([])
  const [paymentAccounts, setPaymentAccounts] = useState<Account[]>([])

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

      // Load member defaults
      const { data: member } = await supabase
        .from("company_members")
        .select("branch_id, cost_center_id, warehouse_id")
        .eq("company_id", cid)
        .eq("user_id", user.id)
        .maybeSingle()

      if (member) {
        setBranchId(member.branch_id || "")
        setCostCenterId(member.cost_center_id || "")
        setWarehouseId(member.warehouse_id || "")
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

  const handleSave = async () => {
    if (!description.trim()) {
      toast({
        title: "خطأ",
        description: "الرجاء إدخال وصف المصروف",
        variant: "destructive"
      })
      return
    }

    if (amount <= 0) {
      toast({
        title: "خطأ",
        description: "الرجاء إدخال مبلغ صحيح",
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

      const { data, error } = await supabase
        .from("expenses")
        .insert({
          company_id: companyId,
          branch_id: branchId || null,
          cost_center_id: costCenterId || null,
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

  return (
    <div className="flex min-h-screen bg-gray-50" dir="rtl">
      <Sidebar />
      <div className="flex-1 p-8">
        <CompanyHeader />

        <div className="mb-6">
          <Link href="/expenses">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 ml-2" />
              العودة للمصروفات
            </Button>
          </Link>
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">مصروف جديد</h1>
          <p className="text-gray-600 mt-1">إنشاء مصروف جديد</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>معلومات المصروف</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Branch, Cost Center, Warehouse Selector */}
            <BranchCostCenterSelectorEnhanced
              branchId={branchId}
              costCenterId={costCenterId}
              warehouseId={warehouseId}
              onBranchChange={setBranchId}
              onCostCenterChange={setCostCenterId}
              onWarehouseChange={setWarehouseId}
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>تاريخ المصروف *</Label>
                <Input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                />
              </div>
              <div>
                <Label>العملة</Label>
                <Select value={currencyCode} onValueChange={setCurrencyCode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EGP">جنيه مصري (EGP)</SelectItem>
                    <SelectItem value="USD">دولار أمريكي (USD)</SelectItem>
                    <SelectItem value="EUR">يورو (EUR)</SelectItem>
                    <SelectItem value="SAR">ريال سعودي (SAR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>الوصف *</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="وصف المصروف..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>المبلغ *</Label>
                <NumericInput
                  value={amount}
                  onChange={setAmount}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>التصنيف</Label>
                <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر التصنيف" />
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>طريقة الدفع</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر طريقة الدفع" />
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
              <div>
                <Label>حساب المصروف</Label>
                <Select value={expenseAccountId} onValueChange={setExpenseAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الحساب" />
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

            <div>
              <Label>حساب الدفع (نقدية/بنك)</Label>
              <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الحساب" />
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

            <div>
              <Label>ملاحظات</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات إضافية..."
                rows={4}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Link href="/expenses">
                <Button variant="outline" disabled={saving}>
                  إلغاء
                </Button>
              </Link>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 ml-2" />
                {saving ? "جاري الحفظ..." : "حفظ"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


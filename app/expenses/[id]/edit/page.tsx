"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
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
import { BranchCostCenterSelector } from "@/components/branch-cost-center-selector-enhanced"

type Account = {
  id: string
  account_code: string
  account_name: string
}

type Expense = {
  id: string
  expense_number: string
  expense_date: string
  description: string
  notes?: string
  amount: number
  currency_code?: string
  expense_category?: string
  payment_method?: string
  expense_account_id?: string
  payment_account_id?: string
  status: string
  branch_id?: string
  cost_center_id?: string
  warehouse_id?: string
}

export default function EditExpensePage() {
  const params = useParams()
  const router = useRouter()
  const supabase = useSupabase()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [companyId, setCompanyId] = useState<string>("")
  const [expense, setExpense] = useState<Expense | null>(null)
  
  // Form fields
  const [expenseDate, setExpenseDate] = useState("")
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
    loadExpense()
  }, [params.id])

  const loadExpense = async () => {
    try {
      setLoading(true)
      const cid = await getActiveCompanyId(supabase)
      if (!cid) return
      setCompanyId(cid)

      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("id", params.id)
        .eq("company_id", cid)
        .single()

      if (error) throw error

      if (data.status !== "draft" && data.status !== "rejected") {
        toast({
          title: "خطأ",
          description: "لا يمكن تعديل مصروف معتمد أو مدفوع",
          variant: "destructive"
        })
        router.push(`/expenses/${params.id}`)
        return
      }

      setExpense(data)
      setExpenseDate(data.expense_date)
      setDescription(data.description)
      setNotes(data.notes || "")
      setAmount(data.amount)
      setCurrencyCode(data.currency_code || "EGP")
      setExpenseCategory(data.expense_category || "")
      setPaymentMethod(data.payment_method || "")
      setExpenseAccountId(data.expense_account_id || "")
      setPaymentAccountId(data.payment_account_id || "")
      setBranchId(data.branch_id || "")
      setCostCenterId(data.cost_center_id || "")
      setWarehouseId(data.warehouse_id || "")

      // Load accounts
      const { data: expAccounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name")
        .eq("company_id", cid)
        .eq("account_type", "expense")
        .eq("is_active", true)
        .order("account_code")

      setExpenseAccounts(expAccounts || [])

      const { data: payAccounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name")
        .eq("company_id", cid)
        .in("account_type", ["asset"])
        .eq("is_active", true)
        .order("account_code")

      setPaymentAccounts(payAccounts || [])
    } catch (error: any) {
      console.error("Error loading expense:", error)
      toast({
        title: "خطأ",
        description: "فشل تحميل المصروف",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
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

      const { error } = await supabase
        .from("expenses")
        .update({
          expense_date: expenseDate,
          description: description.trim(),
          notes: notes.trim() || null,
          amount,
          currency_code: currencyCode,
          expense_category: expenseCategory || null,
          payment_method: paymentMethod || null,
          expense_account_id: expenseAccountId || null,
          payment_account_id: paymentAccountId || null,
          branch_id: branchId || null,
          cost_center_id: costCenterId || null,
          warehouse_id: warehouseId || null,
          // Reset approval if edited after rejection
          status: "draft",
          approval_status: "pending"
        })
        .eq("id", params.id)
        .eq("company_id", companyId)

      if (error) throw error

      toast({
        title: "تم الحفظ",
        description: "تم تحديث المصروف بنجاح"
      })

      router.push(`/expenses/${params.id}`)
    } catch (error: any) {
      console.error("Error updating expense:", error)
      toast({
        title: "خطأ",
        description: "فشل تحديث المصروف",
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

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-50" dir="rtl">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="text-center py-8">جاري التحميل...</div>
        </div>
      </div>
    )
  }

  if (!expense) {
    return (
      <div className="flex min-h-screen bg-gray-50" dir="rtl">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="text-center py-8">المصروف غير موجود</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-50" dir="rtl">
      <Sidebar />
      <div className="flex-1 p-8">
        <CompanyHeader />

        <div className="mb-6">
          <Link href={`/expenses/${params.id}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 ml-2" />
              العودة للمصروف
            </Button>
          </Link>
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">تعديل المصروف</h1>
          <p className="text-gray-600 mt-1">{expense.expense_number}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>معلومات المصروف</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <BranchCostCenterSelector
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
              <Link href={`/expenses/${params.id}`}>
                <Button variant="outline" disabled={saving}>
                  إلغاء
                </Button>
              </Link>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 ml-2" />
                {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


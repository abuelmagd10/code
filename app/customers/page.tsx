"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useSupabase } from "@/lib/supabase/hooks"
import { Plus, Edit2, Trash2, Search, Users } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"

interface Customer {
  id: string
  name: string
  email: string
  phone: string
  address?: string
  city: string
  country: string
  tax_id: string
  credit_limit: number
  payment_terms: string
}

export default function CustomersPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    country: "",
    tax_id: "",
    credit_limit: 0,
    payment_terms: "Net 30",
  })
  const [accounts, setAccounts] = useState<{ id: string; account_code: string; account_name: string; account_type: string }[]>([])
  const [voucherOpen, setVoucherOpen] = useState(false)
  const [voucherCustomerId, setVoucherCustomerId] = useState<string>("")
  const [voucherAmount, setVoucherAmount] = useState<number>(0)
  const [voucherDate, setVoucherDate] = useState<string>(() => new Date().toISOString().slice(0,10))
  const [voucherMethod, setVoucherMethod] = useState<string>("cash")
  const [voucherRef, setVoucherRef] = useState<string>("")
  const [voucherNotes, setVoucherNotes] = useState<string>("")
  const [voucherAccountId, setVoucherAccountId] = useState<string>("")
  const [balances, setBalances] = useState<Record<string, { advance: number; applied: number; available: number }>>({})
  // حالات صرف رصيد العميل الدائن
  const [refundOpen, setRefundOpen] = useState(false)
  const [refundCustomerId, setRefundCustomerId] = useState<string>("")
  const [refundCustomerName, setRefundCustomerName] = useState<string>("")
  const [refundMaxAmount, setRefundMaxAmount] = useState<number>(0)
  const [refundAmount, setRefundAmount] = useState<number>(0)
  const [refundDate, setRefundDate] = useState<string>(() => new Date().toISOString().slice(0,10))
  const [refundMethod, setRefundMethod] = useState<string>("cash")
  const [refundAccountId, setRefundAccountId] = useState<string>("")
  const [refundNotes, setRefundNotes] = useState<string>("")

  useEffect(() => {
    loadCustomers()
  }, [])

  const loadCustomers = async () => {
    try {
      setIsLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()

      if (!companyData) return

      const { data } = await supabase.from("customers").select("*").eq("company_id", companyData.id)

      setCustomers(data || [])
      const { data: accs } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type")
        .eq("company_id", companyData.id)
      setAccounts((accs || []).filter((a: any) => (a.account_type || "").toLowerCase() === "asset"))

      const { data: pays } = await supabase
        .from("payments")
        .select("customer_id, amount, invoice_id")
        .eq("company_id", companyData.id)
        .not("customer_id", "is", null)
      const { data: apps } = await supabase
        .from("advance_applications")
        .select("customer_id, amount_applied")
        .eq("company_id", companyData.id)
      const advMap: Record<string, number> = {}
      ;(pays || []).forEach((p: any) => {
        const cid = String(p.customer_id || "")
        if (!cid) return
        const amt = Number(p.amount || 0)
        if (!p.invoice_id) {
          advMap[cid] = (advMap[cid] || 0) + amt
        }
      })
      const appMap: Record<string, number> = {}
      ;(apps || []).forEach((a: any) => {
        const cid = String(a.customer_id || "")
        if (!cid) return
        const amt = Number(a.amount_applied || 0)
        appMap[cid] = (appMap[cid] || 0) + amt
      })
      const allIds = Array.from(new Set([...(data || []).map((c: any)=>String(c.id||""))]))
      const out: Record<string, { advance: number; applied: number; available: number }> = {}
      allIds.forEach((id) => {
        const adv = Number(advMap[id] || 0)
        const ap = Number(appMap[id] || 0)
        out[id] = { advance: adv, applied: ap, available: Math.max(adv - ap, 0) }
      })
      setBalances(out)
    } catch (error) {
      console.error("Error loading customers:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()

      if (!companyData) return

      if (editingId) {
        const { error } = await supabase.from("customers").update(formData).eq("id", editingId)

        if (error) throw error
      } else {
        const { error } = await supabase.from("customers").insert([{ ...formData, company_id: companyData.id }])

        if (error) throw error
      }

      setIsDialogOpen(false)
      setEditingId(null)
      setFormData({
        name: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        country: "",
        tax_id: "",
        credit_limit: 0,
        payment_terms: "Net 30",
      })
      loadCustomers()
    } catch (error) {
      console.error("Error saving customer:", error)
    }
  }

  const handleEdit = (customer: Customer) => {
    setFormData({
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address || "",
      city: customer.city,
      country: customer.country,
      tax_id: customer.tax_id,
      credit_limit: customer.credit_limit,
      payment_terms: customer.payment_terms,
    })
    setEditingId(customer.id)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("customers").delete().eq("id", id)

      if (error) throw error
      loadCustomers()
    } catch (error) {
      console.error("Error deleting customer:", error)
    }
  }

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const createCustomerVoucher = async () => {
    try {
      if (!voucherCustomerId || voucherAmount <= 0) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return
      if (voucherAccountId) {
        const { data: acct, error: acctErr } = await supabase
          .from("chart_of_accounts")
          .select("id, company_id")
          .eq("id", voucherAccountId)
          .eq("company_id", company.id)
          .single()
        if (acctErr || !acct) {
          toastActionError(toast, "التحقق", "الحساب", appLang==='en' ? "Selected account invalid" : "الحساب المختار غير صالح")
          return
        }
      }
      const payload: any = {
        company_id: company.id,
        customer_id: voucherCustomerId,
        payment_date: voucherDate,
        amount: voucherAmount,
        payment_method: voucherMethod === "bank" ? "bank" : (voucherMethod === "cash" ? "cash" : "refund"),
        reference_number: voucherRef || null,
        notes: voucherNotes || null,
        account_id: voucherAccountId || null,
      }
            let insertedPayment: any = null
            let insertErr: any = null
            {
              const { data, error } = await supabase.from("payments").insert(payload).select().single()
              insertedPayment = data || null
              insertErr = error || null
            }
      if (insertErr) {
        const msg = String(insertErr?.message || insertErr || "")
        const mentionsAccountId = msg.toLowerCase().includes("account_id")
        const looksMissingColumn = mentionsAccountId && (msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("column"))
        if (looksMissingColumn || mentionsAccountId) {
          const fallback = { ...payload }
          delete (fallback as any).account_id
          const { error: retryError } = await supabase.from("payments").insert(fallback)
          if (retryError) throw retryError
        } else {
          throw insertErr
        }
            }
            try {
              const { data: accounts } = await supabase
                .from("chart_of_accounts")
                .select("id, account_code, account_type, account_name, sub_type")
                .eq("company_id", company.id)
        const find = (f: (a: any) => boolean) => (accounts || []).find(f)?.id
        const customerAdvance = find((a: any) => String(a.sub_type || "").toLowerCase() === "customer_advance") || find((a: any) => String(a.account_name || "").toLowerCase().includes("advance")) || find((a: any) => String(a.account_name || "").toLowerCase().includes("deposit"))
        const cash = find((a: any) => String(a.sub_type || "").toLowerCase() === "cash") || find((a: any) => String(a.account_name || "").toLowerCase().includes("cash"))
        const bank = find((a: any) => String(a.sub_type || "").toLowerCase() === "bank") || find((a: any) => String(a.account_name || "").toLowerCase().includes("bank"))
        const cashAccountId = voucherAccountId || bank || cash
        if (customerAdvance && cashAccountId) {
          const { data: entry } = await supabase
            .from("journal_entries")
            .insert({
              company_id: company.id,
              reference_type: "customer_voucher",
              reference_id: null,
              entry_date: voucherDate,
              description: appLang==='en' ? 'Customer payment voucher' : 'سند صرف عميل',
            })
            .select()
            .single()
          if (entry?.id) {
            await supabase.from("journal_entry_lines").insert([
              { journal_entry_id: entry.id, account_id: customerAdvance, debit_amount: voucherAmount, credit_amount: 0, description: appLang==='en' ? 'Customer advance' : 'سلف العملاء' },
              { journal_entry_id: entry.id, account_id: cashAccountId, debit_amount: 0, credit_amount: voucherAmount, description: appLang==='en' ? 'Cash/Bank' : 'نقد/بنك' },
            ])
          }
              }
            } catch (_) { /* ignore journal errors, voucher still created */ }
            try {
              if (insertedPayment?.id && voucherCustomerId) {
                const { data: invoices } = await supabase
                  .from("invoices")
                  .select("id, total_amount, paid_amount, status")
                  .eq("company_id", company.id)
                  .eq("customer_id", voucherCustomerId)
                  .in("status", ["sent", "partially_paid"])
                  .order("issue_date", { ascending: true })
                let remaining = Number(voucherAmount || 0)
                for (const inv of (invoices || [])) {
                  if (remaining <= 0) break
                  const due = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0)
                  const applyAmt = Math.min(remaining, due)
                  if (applyAmt > 0) {
                    await supabase.from("advance_applications").insert({ company_id: company.id, customer_id: voucherCustomerId, invoice_id: inv.id, amount_applied: applyAmt, payment_id: insertedPayment.id })
                    await supabase.from("invoices").update({ paid_amount: Number(inv.paid_amount || 0) + applyAmt, status: Number(inv.total_amount || 0) <= (Number(inv.paid_amount || 0) + applyAmt) ? "paid" : "partially_paid" }).eq("id", inv.id)
                    remaining -= applyAmt
                  }
                }
              }
            } catch (_) {}
      toastActionSuccess(toast, appLang==='en' ? 'Create' : 'الإنشاء', appLang==='en' ? 'Customer voucher' : 'سند صرف عميل')
      setVoucherOpen(false)
      setVoucherCustomerId("")
      setVoucherAmount(0)
      setVoucherRef("")
      setVoucherNotes("")
      setVoucherAccountId("")
    } catch (err: any) {
      toastActionError(toast, appLang==='en' ? 'Create' : 'الإنشاء', appLang==='en' ? 'Customer voucher' : 'سند صرف عميل', String(err?.message || err || 'فشل إنشاء سند الصرف'))
    }
  }

  // ===== فتح نافذة صرف رصيد العميل الدائن =====
  const openRefundDialog = (customer: Customer) => {
    const bal = balances[customer.id]
    const available = bal?.available || 0
    if (available <= 0) {
      toastActionError(toast, appLang==='en' ? 'Refund' : 'الصرف', appLang==='en' ? 'Customer credit' : 'رصيد العميل', appLang==='en' ? 'No available credit balance' : 'لا يوجد رصيد دائن متاح')
      return
    }
    setRefundCustomerId(customer.id)
    setRefundCustomerName(customer.name)
    setRefundMaxAmount(available)
    setRefundAmount(available)
    setRefundDate(new Date().toISOString().slice(0,10))
    setRefundMethod("cash")
    setRefundAccountId("")
    setRefundNotes("")
    setRefundOpen(true)
  }

  // ===== صرف رصيد العميل الدائن =====
  const processCustomerRefund = async () => {
    try {
      if (!refundCustomerId || refundAmount <= 0) return
      if (refundAmount > refundMaxAmount) {
        toastActionError(toast, appLang==='en' ? 'Refund' : 'الصرف', appLang==='en' ? 'Amount' : 'المبلغ', appLang==='en' ? 'Amount exceeds available balance' : 'المبلغ يتجاوز الرصيد المتاح')
        return
      }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return

      // جلب الحسابات
      const { data: accts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_type, account_name, sub_type")
        .eq("company_id", company.id)
      const find = (f: (a: any) => boolean) => (accts || []).find(f)?.id

      // حساب رصيد العميل الدائن
      const customerCredit = find((a: any) => String(a.sub_type || "").toLowerCase() === "customer_credit") ||
        find((a: any) => String(a.sub_type || "").toLowerCase() === "customer_advance") ||
        find((a: any) => String(a.account_name || "").toLowerCase().includes("customer credit")) ||
        find((a: any) => String(a.account_name || "").toLowerCase().includes("رصيد العملاء")) ||
        find((a: any) => String(a.account_name || "").toLowerCase().includes("سلف العملاء"))

      // حساب النقد أو البنك
      const cash = find((a: any) => String(a.sub_type || "").toLowerCase() === "cash") || find((a: any) => String(a.account_name || "").toLowerCase().includes("cash"))
      const bank = find((a: any) => String(a.sub_type || "").toLowerCase() === "bank") || find((a: any) => String(a.account_name || "").toLowerCase().includes("bank"))

      // تحديد حساب الصرف
      let paymentAccount: string | null = null
      if (refundAccountId) {
        paymentAccount = refundAccountId
      } else if (refundMethod === "bank" && bank) {
        paymentAccount = bank
      } else if (cash) {
        paymentAccount = cash
      }

      if (!paymentAccount) {
        toastActionError(toast, appLang==='en' ? 'Refund' : 'الصرف', appLang==='en' ? 'Account' : 'الحساب', appLang==='en' ? 'No payment account found' : 'لم يتم العثور على حساب للصرف')
        return
      }

      // ===== إنشاء قيد صرف رصيد العميل =====
      // القيد المحاسبي:
      // مدين: رصيد العميل الدائن (تقليل الالتزام)
      // دائن: النقد/البنك (خروج المبلغ)
      const { data: entry } = await supabase
        .from("journal_entries")
        .insert({
          company_id: company.id,
          reference_type: "customer_credit_refund",
          reference_id: refundCustomerId,
          entry_date: refundDate,
          description: appLang==='en' ? `Customer credit refund - ${refundCustomerName}` : `صرف رصيد دائن للعميل - ${refundCustomerName}`,
        })
        .select()
        .single()

      if (entry?.id) {
        const lines = []
        if (customerCredit) {
          lines.push({ journal_entry_id: entry.id, account_id: customerCredit, debit_amount: refundAmount, credit_amount: 0, description: appLang==='en' ? 'Customer credit refund' : 'صرف رصيد العميل الدائن' })
        }
        lines.push({ journal_entry_id: entry.id, account_id: paymentAccount, debit_amount: 0, credit_amount: refundAmount, description: appLang==='en' ? 'Cash/Bank payment' : 'صرف نقدي/بنكي' })
        await supabase.from("journal_entry_lines").insert(lines)
      }

      // ===== إنشاء سجل دفعة صرف =====
      const payload: any = {
        company_id: company.id,
        customer_id: refundCustomerId,
        payment_date: refundDate,
        amount: -refundAmount, // سالب لأنه صرف للعميل
        payment_method: refundMethod === "bank" ? "bank" : "cash",
        reference_number: `REF-${Date.now()}`,
        notes: refundNotes || (appLang==='en' ? `Credit refund to customer ${refundCustomerName}` : `صرف رصيد دائن للعميل ${refundCustomerName}`),
        account_id: paymentAccount,
      }
      try {
        const { error: payErr } = await supabase.from("payments").insert(payload)
        if (payErr) {
          const msg = String(payErr?.message || "")
          if (msg.toLowerCase().includes("account_id")) {
            const fallback = { ...payload }
            delete (fallback as any).account_id
            await supabase.from("payments").insert(fallback)
          }
        }
      } catch {}

      toastActionSuccess(toast, appLang==='en' ? 'Refund' : 'الصرف', appLang==='en' ? 'Customer credit refund' : 'صرف رصيد العميل')
      setRefundOpen(false)
      setRefundCustomerId("")
      setRefundCustomerName("")
      setRefundMaxAmount(0)
      setRefundAmount(0)
      setRefundNotes("")
      setRefundAccountId("")
      loadCustomers()
    } catch (err: any) {
      toastActionError(toast, appLang==='en' ? 'Refund' : 'الصرف', appLang==='en' ? 'Customer credit' : 'رصيد العميل', String(err?.message || err || 'فشل صرف الرصيد'))
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          {/* رأس الصفحة */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                  <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{appLang==='en' ? 'Customers' : 'العملاء'}</h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{appLang==='en' ? 'Manage your customers list' : 'إدارة قائمة عملائك'}</p>
                </div>
              </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={() => {
                    setEditingId(null)
                    setFormData({
                      name: "",
                      email: "",
                      phone: "",
                      address: "",
                      city: "",
                      country: "",
                      tax_id: "",
                      credit_limit: 0,
                      payment_terms: "Net 30",
                    })
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {appLang==='en' ? 'New Customer' : 'عميل جديد'}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingId ? (appLang==='en' ? 'Edit Customer' : 'تعديل عميل') : (appLang==='en' ? 'Add New Customer' : 'إضافة عميل جديد')}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{appLang==='en' ? 'Customer Name' : 'اسم العميل'}</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">{appLang==='en' ? 'Email' : 'البريد الإلكتروني'}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">{appLang==='en' ? 'Phone' : 'رقم الهاتف'}</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">{appLang==='en' ? 'Address' : 'العنوان'}</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">{appLang==='en' ? 'City' : 'المدينة'}</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">{appLang==='en' ? 'Country' : 'الدولة'}</Label>
                    <Input
                      id="country"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax_id">{appLang==='en' ? 'Tax ID' : 'الرقم الضريبي'}</Label>
                    <Input
                      id="tax_id"
                      value={formData.tax_id}
                      onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="credit_limit">{appLang==='en' ? 'Credit Limit' : 'حد الائتمان'}</Label>
                    <Input
                      id="credit_limit"
                      type="number"
                      value={formData.credit_limit}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          credit_limit: Number.parseFloat(e.target.value),
                        })
                      }
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    {editingId ? (appLang==='en' ? 'Update' : 'تحديث') : (appLang==='en' ? 'Add' : 'إضافة')}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
            </div>
          </div>

          {/* Search Bar */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 flex-wrap">
                <Search className="w-4 h-4 text-gray-400" />
                <Input
                  placeholder={appLang==='en' ? 'Search customer...' : 'البحث عن عميل...'}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 w-full"
                />
              </div>
            </CardContent>
          </Card>

          {/* Customers Table */}
          <Card>
            <CardHeader>
              <CardTitle>{appLang==='en' ? 'Customers List' : 'قائمة العملاء'}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center py-8 text-gray-500">{appLang==='en' ? 'Loading...' : 'جاري التحميل...'}</p>
              ) : filteredCustomers.length === 0 ? (
                <p className="text-center py-8 text-gray-500">{appLang==='en' ? 'No customers yet' : 'لا توجد عملاء حتى الآن'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[640px] w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Name' : 'الاسم'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Email' : 'البريد الإلكتروني'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Phone' : 'الهاتف'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Address' : 'العنوان'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'City' : 'المدينة'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Credit Limit' : 'حد الائتمان'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Balance' : 'الرصيد'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Actions' : 'الإجراءات'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomers.map((customer) => (
                        <tr key={customer.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3">{customer.name}</td>
                          <td className="px-4 py-3">{customer.email}</td>
                          <td className="px-4 py-3">{customer.phone}</td>
                          <td className="px-4 py-3">{customer.address ?? ""}</td>
                          <td className="px-4 py-3">{customer.city}</td>
                          <td className="px-4 py-3">{customer.credit_limit}</td>
                          <td className="px-4 py-3">
                            {(() => {
                              const b = balances[customer.id] || { advance: 0, applied: 0, available: 0 }
                              const available = b.available
                              return (
                                <span className={available > 0 ? "text-green-600 font-semibold" : ""}>
                                  {available.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                                </span>
                              )
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2 flex-wrap">
                              <Button variant="outline" size="sm" onClick={() => handleEdit(customer)}>
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(customer.id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { setVoucherCustomerId(customer.id); setVoucherOpen(true) }}
                              >
                                {appLang==='en' ? 'Payment Voucher' : 'سند صرف'}
                              </Button>
                              {/* زر صرف رصيد العميل الدائن */}
                              {(balances[customer.id]?.available || 0) > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openRefundDialog(customer)}
                                  className="text-green-600 hover:text-green-700 border-green-300"
                                >
                                  {appLang==='en' ? 'Refund Credit' : 'صرف الرصيد'}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <Dialog open={voucherOpen} onOpenChange={setVoucherOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{appLang==='en' ? 'Customer Payment Voucher' : 'سند صرف عميل'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Amount' : 'المبلغ'}</Label>
              <Input type="number" value={voucherAmount} onChange={(e) => setVoucherAmount(Number(e.target.value || 0))} />
            </div>
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Date' : 'التاريخ'}</Label>
              <Input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Payment Method' : 'طريقة الدفع'}</Label>
              <Select value={voucherMethod} onValueChange={setVoucherMethod}>
                <SelectTrigger><SelectValue placeholder={appLang==='en' ? 'Method' : 'الطريقة'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{appLang==='en' ? 'Cash' : 'نقد'}</SelectItem>
                  <SelectItem value="bank">{appLang==='en' ? 'Bank' : 'بنك'}</SelectItem>
                  <SelectItem value="refund">{appLang==='en' ? 'Refund' : 'استرداد'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Account' : 'الحساب'}</Label>
              <Select value={voucherAccountId} onValueChange={setVoucherAccountId}>
                <SelectTrigger><SelectValue placeholder={appLang==='en' ? 'Select account' : 'اختر الحساب'} /></SelectTrigger>
                <SelectContent>
                  {(accounts || []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.account_name} {a.account_code ? `(${a.account_code})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Reference' : 'مرجع'}</Label>
              <Input value={voucherRef} onChange={(e) => setVoucherRef(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Notes' : 'ملاحظات'}</Label>
              <Input value={voucherNotes} onChange={(e) => setVoucherNotes(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setVoucherOpen(false)}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button onClick={createCustomerVoucher}>{appLang==='en' ? 'Create' : 'إنشاء'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* نافذة صرف رصيد العميل الدائن */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{appLang==='en' ? 'Refund Customer Credit' : 'صرف رصيد العميل الدائن'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Customer' : 'العميل'}: <span className="font-semibold">{refundCustomerName}</span></p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Available Balance' : 'الرصيد المتاح'}: <span className="font-semibold text-green-600">{refundMaxAmount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</span></p>
            </div>
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Refund Amount' : 'مبلغ الصرف'}</Label>
              <Input
                type="number"
                value={refundAmount}
                max={refundMaxAmount}
                onChange={(e) => setRefundAmount(Math.min(Number(e.target.value || 0), refundMaxAmount))}
              />
            </div>
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Date' : 'التاريخ'}</Label>
              <Input type="date" value={refundDate} onChange={(e) => setRefundDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Payment Method' : 'طريقة الصرف'}</Label>
              <Select value={refundMethod} onValueChange={setRefundMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{appLang==='en' ? 'Cash' : 'نقداً'}</SelectItem>
                  <SelectItem value="bank">{appLang==='en' ? 'Bank Transfer' : 'تحويل بنكي'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Account' : 'الحساب'}</Label>
              <Select value={refundAccountId} onValueChange={setRefundAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder={appLang==='en' ? 'Select account' : 'اختر الحساب'} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>{acc.account_code} - {acc.account_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{appLang==='en' ? 'Notes' : 'ملاحظات'}</Label>
              <Input value={refundNotes} onChange={(e) => setRefundNotes(e.target.value)} placeholder={appLang==='en' ? 'Optional notes' : 'ملاحظات اختيارية'} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRefundOpen(false)}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button onClick={processCustomerRefund} className="bg-green-600 hover:bg-green-700">{appLang==='en' ? 'Confirm Refund' : 'تأكيد الصرف'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

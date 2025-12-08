"use client"

import { useState, useEffect, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Plus, Eye, Trash2, Pencil, FileText, AlertCircle, DollarSign, CreditCard, Clock } from "lucide-react"
import Link from "next/link"
import { canAction } from "@/lib/authz"
import { CompanyHeader } from "@/components/company-header"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { toastDeleteSuccess, toastDeleteError } from "@/lib/notifications"

interface Customer {
  id: string
  name: string
  phone?: string
}

interface Invoice {
  id: string
  invoice_number: string
  customer_id: string
  invoice_date: string
  due_date: string
  total_amount: number
  paid_amount: number
  status: string
  customers?: { name: string }
  currency_code?: string
  original_currency?: string
  original_total?: number
  original_paid?: number
  display_currency?: string
  display_total?: number
  display_paid?: number
}

type Payment = { id: string; invoice_id: string | null; amount: number }

// نوع لبنود الفاتورة مع المنتج
type InvoiceItemWithProduct = {
  invoice_id: string
  quantity: number
  products?: { name: string } | null
}

// نوع لعرض ملخص المنتجات
type ProductSummary = { name: string; quantity: number }

export default function InvoicesPage() {
  const supabase = useSupabase()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemWithProduct[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterCustomer, setFilterCustomer] = useState<string>("all")
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const { toast } = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  // Currency support
  const [appCurrency, setAppCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }
  const currencySymbol = currencySymbols[appCurrency] || appCurrency

  // تجميع المدفوعات الفعلية من جدول payments حسب الفاتورة
  const paidByInvoice: Record<string, number> = useMemo(() => {
    const agg: Record<string, number> = {}
    payments.forEach((p) => {
      const key = p.invoice_id || ""
      if (key) {
        agg[key] = (agg[key] || 0) + (p.amount || 0)
      }
    })
    return agg
  }, [payments])

  // Helper: Get display amount (use converted if available)
  // يستخدم المدفوعات الفعلية من جدول payments كأولوية
  // ملاحظة: total_amount هو المبلغ الحالي بعد خصم المرتجعات
  const getDisplayAmount = (invoice: Invoice, field: 'total' | 'paid' = 'total'): number => {
    if (field === 'total') {
      // استخدام total_amount مباشرة لأنه يمثل المبلغ الحالي بعد المرتجعات
      // display_total يستخدم فقط إذا كانت العملة مختلفة ومحولة
      if (invoice.display_currency === appCurrency && invoice.display_total != null) {
        return invoice.display_total
      }
      // total_amount هو المبلغ الصحيح (بعد خصم المرتجعات)
      return invoice.total_amount
    }
    // For paid amount: استخدام المدفوعات الفعلية من جدول payments أولاً
    const actualPaid = paidByInvoice[invoice.id] || 0
    if (actualPaid > 0) {
      return actualPaid
    }
    // Fallback to stored paid_amount
    if (invoice.display_currency === appCurrency && invoice.display_paid != null) {
      return invoice.display_paid
    }
    return invoice.paid_amount
  }

  // Listen for currency changes and reload data
  useEffect(() => {
    const handleCurrencyChange = () => {
      const newCurrency = localStorage.getItem('app_currency') || 'EGP'
      setAppCurrency(newCurrency)
      // Reload invoices to get updated display amounts
      loadInvoices(filterStatus)
    }
    window.addEventListener('app_currency_changed', handleCurrencyChange)
    return () => window.removeEventListener('app_currency_changed', handleCurrencyChange)
  }, [filterStatus])
  const [permView, setPermView] = useState<boolean>(true)
  const [permWrite, setPermWrite] = useState<boolean>(true)
  const [permEdit, setPermEdit] = useState<boolean>(true)
  const [permDelete, setPermDelete] = useState<boolean>(true)
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnMode, setReturnMode] = useState<"partial"|"full">("partial")
  const [returnInvoiceId, setReturnInvoiceId] = useState<string | null>(null)
  const [returnInvoiceNumber, setReturnInvoiceNumber] = useState<string>("")
  const [returnItems, setReturnItems] = useState<{ id: string; product_id: string; name?: string; quantity: number; maxQty: number; qtyToReturn: number; cost_price: number; unit_price: number; tax_rate: number; discount_percent: number; line_total: number }[]>([])
  // بيانات الفاتورة للعرض في نافذة المرتجع
  const [returnInvoiceData, setReturnInvoiceData] = useState<{
    total_amount: number;
    paid_amount: number;
    returned_amount: number;
    status: string;
    customer_name: string;
  } | null>(null)
  useEffect(() => { (async () => {
    setPermView(await canAction(supabase, "invoices", "read"))
    setPermWrite(await canAction(supabase, "invoices", "write"))
    setPermEdit(await canAction(supabase, "invoices", "update"))
    setPermDelete(await canAction(supabase, "invoices", "delete"))
  })() }, [supabase])
  useEffect(() => {
    const reloadPerms = async () => {
      setPermView(await canAction(supabase, "invoices", "read"))
      setPermWrite(await canAction(supabase, "invoices", "write"))
      setPermEdit(await canAction(supabase, "invoices", "update"))
      setPermDelete(await canAction(supabase, "invoices", "delete"))
    }
    const handler = () => { reloadPerms() }
    if (typeof window !== 'undefined') window.addEventListener('permissions_updated', handler)
    return () => { if (typeof window !== 'undefined') window.removeEventListener('permissions_updated', handler) }
  }, [supabase])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setIsLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // استخدم الشركة الفعّالة لضمان ظهور الفواتير الصحيحة للمستخدمين المدعوين
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // تحميل العملاء
      const { data: customersData } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("company_id", companyId)
        .order("name")
      setCustomers(customersData || [])

      // تحميل الفواتير (جميعها بدون فلترة في قاعدة البيانات)
      const { data } = await supabase
        .from("invoices")
        .select("*, customers(name, phone)")
        .eq("company_id", companyId)
        .order("invoice_date", { ascending: false })
      setInvoices(data || [])

      // تحميل المدفوعات من جدول payments لحساب المبالغ المدفوعة الفعلية
      const invoiceIds = Array.from(new Set((data || []).map((inv: any) => inv.id)))
      if (invoiceIds.length) {
        const { data: payData } = await supabase
          .from("payments")
          .select("id, invoice_id, amount")
          .eq("company_id", companyId)
          .in("invoice_id", invoiceIds)
        setPayments(payData || [])

        // تحميل بنود الفواتير مع أسماء المنتجات
        const { data: itemsData } = await supabase
          .from("invoice_items")
          .select("invoice_id, quantity, products(name)")
          .in("invoice_id", invoiceIds)
        setInvoiceItems(itemsData || [])
      } else {
        setPayments([])
        setInvoiceItems([])
      }
    } catch (error) {
      console.error("Error loading invoices:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadInvoices = async (status?: string) => {
    await loadData()
  }

  // دالة للحصول على ملخص المنتجات لفاتورة معينة
  const getProductsSummary = (invoiceId: string): ProductSummary[] => {
    const items = invoiceItems.filter(item => item.invoice_id === invoiceId)
    return items.map(item => ({
      name: item.products?.name || '-',
      quantity: item.quantity
    }))
  }

  // الفلترة الديناميكية على الفواتير
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // فلتر الحالة
      if (filterStatus !== "all" && inv.status !== filterStatus) return false

      // فلتر العميل
      if (filterCustomer !== "all" && inv.customer_id !== filterCustomer) return false

      // فلتر نطاق التاريخ
      if (dateFrom && inv.invoice_date < dateFrom) return false
      if (dateTo && inv.invoice_date > dateTo) return false

      // البحث
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const customerName = (inv.customers?.name || "").toLowerCase()
        const customerPhone = (inv.customers?.phone || "").toLowerCase()
        const invoiceNumber = (inv.invoice_number || "").toLowerCase()
        if (!customerName.includes(q) && !customerPhone.includes(q) && !invoiceNumber.includes(q)) return false
      }

      return true
    })
  }, [invoices, filterStatus, filterCustomer, dateFrom, dateTo, searchQuery])

  // إحصائيات الفواتير - استخدام getDisplayAmount للتعامل مع تحويل العملات
  const stats = useMemo(() => {
    const total = invoices.length
    const draft = invoices.filter(i => i.status === 'draft').length
    const sent = invoices.filter(i => i.status === 'sent').length
    const partiallyPaid = invoices.filter(i => i.status === 'partially_paid').length
    const paid = invoices.filter(i => i.status === 'paid').length
    const cancelled = invoices.filter(i => i.status === 'cancelled').length
    // استخدام getDisplayAmount للحصول على القيم الصحيحة حسب العملة المعروضة
    const totalAmount = invoices.reduce((sum, i) => sum + getDisplayAmount(i, 'total'), 0)
    const totalPaid = invoices.reduce((sum, i) => sum + getDisplayAmount(i, 'paid'), 0)
    const totalRemaining = totalAmount - totalPaid
    return { total, draft, sent, partiallyPaid, paid, cancelled, totalAmount, totalPaid, totalRemaining }
  }, [invoices, appCurrency, paidByInvoice])

  // مسح جميع الفلاتر
  const clearFilters = () => {
    setFilterStatus("all")
    setFilterCustomer("all")
    setFilterPaymentMethod("all")
    setDateFrom("")
    setDateTo("")
    setSearchQuery("")
  }

  const hasActiveFilters = filterStatus !== "all" || filterCustomer !== "all" || filterPaymentMethod !== "all" || dateFrom || dateTo || searchQuery

  const handleDelete = async (id: string) => {
    try {
      // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
      const companyId = await getActiveCompanyId(supabase)

      // جلب بيانات الفاتورة
      const { data: invoice } = await supabase
        .from("invoices")
        .select("id, invoice_number, subtotal, tax_amount, total_amount, paid_amount, status, shipping")
        .eq("id", id)
        .single()

      if (!invoice || !companyId) {
        throw new Error("لم يتم العثور على الفاتورة أو الشركة")
      }

      // التحقق من وجود دفعات مرتبطة
      const { data: linkedPays } = await supabase
        .from("payments")
        .select("id, amount")
        .eq("invoice_id", id)

      const hasLinkedPayments = Array.isArray(linkedPays) && linkedPays.length > 0

      // ===============================
      // 1. حذف حركات المخزون المرتبطة
      // ===============================
      await supabase.from("inventory_transactions").delete().eq("reference_id", id)

      // ===============================
      // 2. حذف القيود المحاسبية المرتبطة
      // ===============================
      // جلب جميع القيود المرتبطة بالفاتورة
      const { data: relatedJournals } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("reference_id", id)
        .in("reference_type", [
          "invoice",
          "invoice_cogs",
          "invoice_payment",
          "invoice_reversal",
          "invoice_cogs_reversal",
          "invoice_inventory_reversal",
          "invoice_payment_reversal"
        ])

      if (relatedJournals && relatedJournals.length > 0) {
        const journalIds = relatedJournals.map((j: any) => j.id)
        // حذف سطور القيود أولاً
        await supabase.from("journal_entry_lines").delete().in("journal_entry_id", journalIds)
        // حذف القيود
        await supabase.from("journal_entries").delete().in("id", journalIds)
      }

      // ===============================
      // 3. التعامل مع الدفعات المرتبطة
      // ===============================
      if (hasLinkedPayments) {
        // حذف سجلات تطبيق الدفعات
        await supabase.from("advance_applications").delete().eq("invoice_id", id)
        // فصل الدفعات عن الفاتورة (عدم حذفها للحفاظ على سجل المدفوعات)
        await supabase.from("payments").update({ invoice_id: null }).eq("invoice_id", id)
      }

      // ===============================
      // 4. حذف بنود الفاتورة
      // ===============================
      await supabase.from("invoice_items").delete().eq("invoice_id", id)

      // ===============================
      // 5. حذف أو إلغاء الفاتورة
      // ===============================
      if (hasLinkedPayments) {
        // إذا كانت هناك دفعات، نلغي الفاتورة بدلاً من حذفها للحفاظ على السجل
        const { error: cancelErr } = await supabase
          .from("invoices")
          .update({ status: "cancelled" })
          .eq("id", id)
        if (cancelErr) throw cancelErr
      } else {
        // حذف الفاتورة بالكامل
        const { error } = await supabase.from("invoices").delete().eq("id", id)
        if (error) throw error
      }

      await loadInvoices()
      toastDeleteSuccess(toast, hasLinkedPayments
        ? "الفاتورة (تم إلغاء الفاتورة وحذف القيود والمخزون)"
        : "الفاتورة (تم الحذف الكامل مع القيود والمخزون)")
    } catch (error) {
      console.error("Error deleting invoice:", error)
      toastDeleteError(toast, "الفاتورة")
    }
  }

  const requestDelete = (id: string) => {
    setPendingDeleteId(id)
    setConfirmOpen(true)
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
      sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      partially_paid: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    }
    return colors[status] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
  }

  const getStatusLabel = (status: string) => {
    const labelsAr: Record<string, string> = { draft: "مسودة", sent: "مرسلة", partially_paid: "مدفوعة جزئياً", paid: "مدفوعة", cancelled: "ملغاة" }
    const labelsEn: Record<string, string> = { draft: "Draft", sent: "Sent", partially_paid: "Partially Paid", paid: "Paid", cancelled: "Cancelled" }
    return (appLang === 'en' ? labelsEn : labelsAr)[status] || status
  }

  const openSalesReturn = async (inv: Invoice, mode: "partial"|"full") => {
    try {
      setReturnMode(mode)
      setReturnInvoiceId(inv.id)
      setReturnInvoiceNumber(inv.invoice_number)

      // جلب بيانات الفاتورة الكاملة للعرض
      const { data: fullInvoice } = await supabase
        .from("invoices")
        .select("total_amount, paid_amount, returned_amount, status, customers(name)")
        .eq("id", inv.id)
        .single()

      setReturnInvoiceData({
        total_amount: Number(fullInvoice?.total_amount || inv.total_amount || 0),
        paid_amount: Number(fullInvoice?.paid_amount || inv.paid_amount || 0),
        returned_amount: Number((fullInvoice as any)?.returned_amount || 0),
        status: String(fullInvoice?.status || inv.status || ""),
        customer_name: String((fullInvoice?.customers as any)?.name || inv.customers?.name || "")
      })

      // محاولة أولى: جلب البنود الأساسية فقط (بدون ربط)
      let items: any[] = []
      let prodMap: Record<string, { name: string; cost_price: number }> = {}

      try {
        // جلب بنود الفاتورة - الأعمدة الأساسية فقط
        const { data: baseItems, error: itemsError } = await supabase
          .from("invoice_items")
          .select("id, product_id, quantity, unit_price")
          .eq("invoice_id", inv.id)

        if (itemsError) {
          console.log("Error fetching invoice_items:", itemsError.message)
        }

        const validItems = Array.isArray(baseItems) ? baseItems : []

        // جلب معلومات المنتجات منفصلاً
        const prodIds = Array.from(new Set(validItems.map((it: any) => String(it.product_id || ""))).values()).filter(Boolean)
        if (prodIds.length > 0) {
          const { data: prods } = await supabase
            .from("products")
            .select("id, name, cost_price")
            .in("id", prodIds)
          ;(prods || []).forEach((p: any) => {
            prodMap[String(p.id)] = { name: String(p.name || ""), cost_price: Number(p.cost_price || 0) }
          })
        }

        items = validItems.map((it: any) => ({
          id: String(it.id),
          product_id: String(it.product_id),
          quantity: Number(it.quantity || 0),
          unit_price: Number(it.unit_price || 0),
          tax_rate: Number(it.tax_rate || 0),
          discount_percent: Number(it.discount_percent || 0),
          line_total: Number(it.line_total || 0),
          products: prodMap[String(it.product_id)] || { name: "", cost_price: 0 },
        }))
      } catch (e) {
        console.log("Error in first attempt:", e)
      }
      if (!items || items.length === 0) {
        const { data: tx } = await supabase
          .from("inventory_transactions")
          .select("product_id, quantity_change, products(name, cost_price)")
          .eq("reference_id", inv.id)
          .eq("transaction_type", "sale")
        const txItems = Array.isArray(tx) ? tx : []
        items = txItems.map((t: any) => ({
          id: `${inv.id}-${String(t.product_id)}`,
          product_id: t.product_id,
          quantity: Math.abs(Number(t.quantity_change || 0)),
          unit_price: 0,
          tax_rate: 0,
          discount_percent: 0,
          line_total: 0,
          products: { name: String(t.products?.name || ""), cost_price: Number(t.products?.cost_price || 0) },
        }))
      }
      const rows = (items || []).map((it: any) => ({ id: String(it.id), product_id: String(it.product_id), name: String(((it.products || {}).name) || it.product_id || ""), quantity: Number(it.quantity || 0), maxQty: Number(it.quantity || 0), qtyToReturn: mode === "full" ? Number(it.quantity || 0) : 0, cost_price: Number(((it.products || {}).cost_price) || 0), unit_price: Number(it.unit_price || 0), tax_rate: Number(it.tax_rate || 0), discount_percent: Number(it.discount_percent || 0), line_total: Number(it.line_total || 0) }))
      setReturnItems(rows)
      setReturnOpen(true)
    } catch {}
  }

  const submitSalesReturn = async () => {
    try {
      if (!returnInvoiceId) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
      const { getActiveCompanyId } = await import("@/lib/company")
      const returnCompanyId = await getActiveCompanyId(supabase)
      if (!returnCompanyId) return

      const { data: accounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, sub_type")
        .eq("company_id", returnCompanyId)
      const find = (f: (a: any) => boolean) => (accounts || []).find(f)?.id
      const inventory = find((a: any) => String(a.sub_type || "").toLowerCase() === "inventory")
      const cogs = find((a: any) => String(a.sub_type || "").toLowerCase() === "cogs") || find((a: any) => String(a.account_type || "").toLowerCase() === "expense")
      const ar = find((a: any) => String(a.sub_type || "").toLowerCase() === "ar") || find((a: any) => String(a.account_name || "").toLowerCase().includes("accounts receivable")) || find((a: any) => String(a.account_code || "") === "1100")
      const revenue = find((a: any) => String(a.sub_type || "").toLowerCase() === "revenue") || find((a: any) => String(a.account_type || "").toLowerCase() === "revenue") || find((a: any) => String(a.account_code || "") === "4000")
      const vatPayable = find((a: any) => String(a.sub_type || "").toLowerCase().includes("vat")) || find((a: any) => String(a.account_name || "").toLowerCase().includes("vat payable")) || find((a: any) => String(a.account_code || "") === "2100")
      // حساب رصيد العميل الدائن (customer credit / advances)
      const customerCredit = find((a: any) => String(a.sub_type || "").toLowerCase() === "customer_credit") ||
        find((a: any) => String(a.sub_type || "").toLowerCase() === "customer_advance") ||
        find((a: any) => String(a.account_name || "").toLowerCase().includes("customer credit")) ||
        find((a: any) => String(a.account_name || "").toLowerCase().includes("رصيد العملاء")) ||
        find((a: any) => String(a.account_name || "").toLowerCase().includes("سلف العملاء")) ||
        find((a: any) => String(a.account_code || "") === "2200")
      const toReturn = returnItems.filter((r) => r.qtyToReturn > 0)
      // تعديل كميات بنود الفاتورة بحسب المرتجع
      for (const r of toReturn) {
        try {
          const idStr = String(r.id || "")
          let curr: any = null
          if (idStr && !idStr.includes("-")) {
            const { data } = await supabase
              .from("invoice_items")
              .select("*")
              .eq("id", idStr)
              .single()
            curr = data || null
          } else {
            const { data } = await supabase
              .from("invoice_items")
              .select("*")
              .eq("invoice_id", returnInvoiceId)
              .eq("product_id", r.product_id)
              .limit(1)
            curr = Array.isArray(data) ? (data[0] || null) : null
          }
          if (curr?.id) {
            const oldReturnedQty = Number(curr.returned_quantity || 0)
            const newReturnedQty = oldReturnedQty + Number(r.qtyToReturn || 0)
            // تحديث الكمية المرتجعة فقط مع الاحتفاظ بالكمية الأصلية
            const { error: updateErr } = await supabase
              .from("invoice_items")
              .update({ returned_quantity: newReturnedQty })
              .eq("id", curr.id)
            if (updateErr) {
              console.error("Error updating returned_quantity:", updateErr)
            } else {
              console.log(`✅ Updated item ${curr.id}: returned_quantity = ${newReturnedQty}`)
            }
          }
        } catch (err) {
          console.error("Error in return processing:", err)
        }
      }
      const totalCOGS = toReturn.reduce((s, r) => s + r.qtyToReturn * r.cost_price, 0)
      const returnedSubtotal = toReturn.reduce((s, r) => s + (r.unit_price * (1 - (r.discount_percent || 0) / 100)) * r.qtyToReturn, 0)
      const returnedTax = toReturn.reduce((s, r) => s + (((r.unit_price * (1 - (r.discount_percent || 0) / 100)) * r.qtyToReturn) * (r.tax_rate || 0) / 100), 0)
      let entryId: string | null = null
      if (totalCOGS > 0 && inventory && cogs) {
        const { data: entry } = await supabase
          .from("journal_entries")
          .insert({ company_id: company.id, reference_type: "invoice_cogs_reversal", reference_id: returnInvoiceId, entry_date: new Date().toISOString().slice(0,10), description: `عكس تكلفة المبيعات للفاتورة ${returnInvoiceNumber}${returnMode === "partial" ? " (مرتجع جزئي)" : " (مرتجع كامل)"}` })
          .select()
          .single()
        entryId = entry?.id ? String(entry.id) : null
        if (entryId) {
          await supabase.from("journal_entry_lines").insert([
            { journal_entry_id: entryId, account_id: inventory, debit_amount: totalCOGS, credit_amount: 0, description: "عودة للمخزون" },
            { journal_entry_id: entryId, account_id: cogs, debit_amount: 0, credit_amount: totalCOGS, description: "عكس تكلفة البضاعة المباعة" },
          ])
        }
      }
      // ===== قيد مرتجع المبيعات =====
      // القيد المحاسبي الصحيح للمرتجع:
      // مدين: مردودات المبيعات (أو حساب الإيرادات)
      // مدين: ضريبة المبيعات المستحقة (إن وجدت)
      // دائن: رصيد العميل الدائن (وليس الذمم المدينة مباشرة)
      // لأن المبلغ يُضاف لرصيد العميل ولا يُرد نقداً مباشرة
      const returnTotal = returnedSubtotal + returnedTax
      if (revenue && returnTotal > 0) {
        const { data: entry2 } = await supabase
          .from("journal_entries")
          .insert({
            company_id: company.id,
            reference_type: "sales_return",
            reference_id: returnInvoiceId,
            entry_date: new Date().toISOString().slice(0,10),
            description: `مرتجع مبيعات للفاتورة ${returnInvoiceNumber}${returnMode === "partial" ? " (جزئي)" : " (كامل)"}`
          })
          .select()
          .single()
        const jid = entry2?.id ? String(entry2.id) : null
        if (jid) {
          const lines: any[] = [
            { journal_entry_id: jid, account_id: revenue, debit_amount: returnedSubtotal, credit_amount: 0, description: "مردودات المبيعات" },
          ]
          if (vatPayable && returnedTax > 0) {
            lines.push({ journal_entry_id: jid, account_id: vatPayable, debit_amount: returnedTax, credit_amount: 0, description: "عكس ضريبة المبيعات المستحقة" })
          }
          // المبلغ المرتجع يُضاف لرصيد العميل الدائن (customer credit) وليس للذمم المدينة
          // هذا يعني أن العميل لديه رصيد دائن يمكن صرفه أو استخدامه لاحقاً
          const creditAccount = customerCredit || ar
          lines.push({ journal_entry_id: jid, account_id: creditAccount, debit_amount: 0, credit_amount: returnTotal, description: "رصيد دائن للعميل من المرتجع" })
          await supabase.from("journal_entry_lines").insert(lines)
        }
      }

      // ===== حركات المخزون - إضافة الكميات المرتجعة للمخزون =====
      if (toReturn.length > 0) {
        const invTx = toReturn.map((r) => ({
          company_id: company.id,
          product_id: r.product_id,
          transaction_type: "sale_return", // نوع العملية: مرتجع مبيعات (stock in)
          quantity_change: r.qtyToReturn, // كمية موجبة لأنها تدخل المخزون
          reference_id: returnInvoiceId,
          journal_entry_id: entryId,
          notes: returnMode === "partial" ? "مرتجع جزئي للفاتورة" : "مرتجع كامل للفاتورة"
        }))
        await supabase.from("inventory_transactions").upsert(invTx, { onConflict: "journal_entry_id,product_id,transaction_type" })

        // تحديث كمية المخزون في جدول المنتجات
        for (const r of toReturn) {
          try {
            const { data: prod } = await supabase
              .from("products")
              .select("id, quantity_on_hand")
              .eq("id", r.product_id)
              .single()
            if (prod) {
              const newQty = Number(prod.quantity_on_hand || 0) + Number(r.qtyToReturn || 0)
              await supabase
                .from("products")
                .update({ quantity_on_hand: newQty })
                .eq("id", r.product_id)
            }
          } catch {}
        }
      }

      // ===== تحديث الفاتورة الأصلية =====
      try {
        const { data: invRow } = await supabase
          .from("invoices")
          .select("customer_id, invoice_number, subtotal, tax_amount, total_amount, paid_amount, status, returned_amount")
          .eq("id", returnInvoiceId)
          .single()
        if (invRow) {
          const oldSubtotal = Number(invRow.subtotal || 0)
          const oldTax = Number(invRow.tax_amount || 0)
          const oldTotal = Number(invRow.total_amount || 0)
          const oldPaid = Number(invRow.paid_amount || 0)
          const oldReturned = Number(invRow.returned_amount || 0)

          // حساب القيم الجديدة
          const newSubtotal = Math.max(oldSubtotal - returnedSubtotal, 0)
          const newTax = Math.max(oldTax - returnedTax, 0)
          const newTotal = Math.max(oldTotal - returnTotal, 0)
          const newReturned = oldReturned + returnTotal

          // تحديد حالة المرتجع
          const returnStatus = newTotal === 0 ? "full" : "partial"

          // تعديل المدفوع - إذا كان المدفوع أكبر من الإجمالي الجديد، الفارق يصبح رصيد للعميل
          const newPaid = Math.min(oldPaid, newTotal)
          const customerCreditAmount = Math.max(0, oldPaid - newPaid)

          // تحديد حالة الفاتورة
          let newStatus: string = invRow.status
          if (newTotal === 0) newStatus = "fully_returned"
          else if (returnStatus === "partial") newStatus = "partially_returned"
          else if (newPaid >= newTotal) newStatus = "paid"
          else if (newPaid > 0) newStatus = "partially_paid"
          else newStatus = "sent"

          await supabase
            .from("invoices")
            .update({
              subtotal: newSubtotal,
              tax_amount: newTax,
              total_amount: newTotal,
              paid_amount: newPaid,
              status: newStatus,
              returned_amount: newReturned,
              return_status: returnStatus
            })
            .eq("id", returnInvoiceId)

          // ===== إضافة رصيد دائن للعميل (Customer Credit) =====
          // لا يتم إرجاع المبلغ نقداً - يُضاف كرصيد دائن للعميل
          if (customerCreditAmount > 0 && invRow.customer_id) {
            // 1. إنشاء سجل رصيد العميل في جدول customer_credits
            try {
              const { error: creditError } = await supabase.from("customer_credits").insert({
                company_id: company.id,
                customer_id: invRow.customer_id,
                credit_number: `CR-${Date.now()}`,
                credit_date: new Date().toISOString().slice(0,10),
                amount: customerCreditAmount,
                used_amount: 0,
                reference_type: "invoice_return",
                reference_id: returnInvoiceId,
                status: "active",
                notes: `رصيد دائن من مرتجع الفاتورة ${invRow.invoice_number}`
              })
              if (creditError) {
                console.log("Error inserting customer credit:", creditError.message)
              } else {
                console.log("✅ Customer credit created successfully")
              }
            } catch (e) {
              // إذا لم يوجد جدول customer_credits، نستخدم payments كبديل
              console.log("customer_credits table may not exist, using payments fallback")
            }

            // 2. إنشاء سجل دفعة بنوع credit للعميل
            const payload: any = {
              company_id: company.id,
              customer_id: invRow.customer_id,
              payment_date: new Date().toISOString().slice(0,10),
              amount: customerCreditAmount,
              payment_method: "customer_credit",
              reference_number: `CR-${returnInvoiceId.slice(0,8)}`,
              notes: `رصيد دائن للعميل من مرتجع الفاتورة ${invRow.invoice_number}`,
              account_id: null,
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
          }
        }
      } catch {}
      setReturnOpen(false)
      setReturnItems([])
      await loadInvoices(filterStatus)
    } catch {}
  }

  return (
    <>
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />

      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <CompanyHeader />
          {/* رأس الصفحة - تحسين للهاتف */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-green-100 dark:bg-green-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang==='en' ? 'Sales Invoices' : 'الفواتير'}</h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang==='en' ? 'Manage invoices' : 'إدارة فواتيرك'}</p>
                </div>
              </div>
            {permWrite ? (
              <Link href="/invoices/new" className="self-start sm:self-auto">
                <Button className="h-10 sm:h-11 text-sm sm:text-base px-3 sm:px-4">
                  <Plus className="w-4 h-4 ml-1 sm:ml-2" />
                  {appLang==='en' ? 'New' : 'جديدة'}
                </Button>
              </Link>
            ) : null}
            </div>
          </div>

          {/* بطاقات الإحصائيات المحسّنة */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <FileText className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang==='en' ? 'Total' : 'الإجمالي'}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                </div>
              </div>
            </Card>
            <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                  <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang==='en' ? 'Draft' : 'مسودة'}</p>
                  <p className="text-xl font-bold text-yellow-600">{stats.draft}</p>
                </div>
              </div>
            </Card>
            <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang==='en' ? 'Sent' : 'مُرسلة'}</p>
                  <p className="text-xl font-bold text-blue-600">{stats.sent}</p>
                </div>
              </div>
            </Card>
            <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang==='en' ? 'Paid' : 'مدفوعة'}</p>
                  <p className="text-xl font-bold text-green-600">{stats.paid}</p>
                </div>
              </div>
            </Card>
            <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <CreditCard className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang==='en' ? 'Total Amount' : 'إجمالي المبلغ'}</p>
                  <p className="text-lg font-bold text-purple-600">{currencySymbol}{stats.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 0 })}</p>
                </div>
              </div>
            </Card>
            <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stats.totalRemaining > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                  <DollarSign className={`h-5 w-5 ${stats.totalRemaining > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang==='en' ? 'Remaining' : 'المتبقي'}</p>
                  <p className={`text-lg font-bold ${stats.totalRemaining > 0 ? 'text-red-600' : 'text-green-600'}`}>{currencySymbol}{stats.totalRemaining.toLocaleString('en-US', { minimumFractionDigits: 0 })}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* قسم الفلترة المتقدم */}
          <Card className="p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="space-y-4">
              {/* أزرار فلتر الحالة */}
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "all", labelAr: "الكل", labelEn: "All" },
                  { value: "draft", labelAr: "مسودة", labelEn: "Draft" },
                  { value: "sent", labelAr: "مُرسلة", labelEn: "Sent" },
                  { value: "partially_paid", labelAr: "مدفوعة جزئياً", labelEn: "Partially Paid" },
                  { value: "paid", labelAr: "مدفوعة", labelEn: "Paid" },
                  { value: "cancelled", labelAr: "ملغاة", labelEn: "Cancelled" },
                ].map((status) => (
                  <Button
                    key={status.value}
                    variant={filterStatus === status.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterStatus(status.value)}
                    className="h-8 text-xs sm:text-sm"
                  >
                    {appLang === 'en' ? status.labelEn : status.labelAr}
                  </Button>
                ))}
              </div>

              {/* البحث والفلاتر المتقدمة */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {/* حقل البحث */}
                <div className="sm:col-span-2 lg:col-span-2">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={appLang === 'en' ? 'Search by invoice #, customer name or phone...' : 'بحث برقم الفاتورة، اسم العميل أو الهاتف...'}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-10 px-4 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-700 text-sm"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* فلتر العميل */}
                <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue placeholder={appLang === 'en' ? 'All Customers' : 'جميع العملاء'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{appLang === 'en' ? 'All Customers' : 'جميع العملاء'}</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* من تاريخ */}
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400">
                    {appLang === 'en' ? 'From Date' : 'من تاريخ'}
                  </label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>

                {/* إلى تاريخ */}
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400">
                    {appLang === 'en' ? 'To Date' : 'إلى تاريخ'}
                  </label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>
              </div>

              {/* زر مسح الفلاتر */}
              {hasActiveFilters && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {appLang === 'en'
                      ? `Showing ${filteredInvoices.length} of ${invoices.length} invoices`
                      : `عرض ${filteredInvoices.length} من ${invoices.length} فاتورة`}
                  </span>
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-red-500 hover:text-red-600">
                    {appLang === 'en' ? 'Clear All Filters' : 'مسح جميع الفلاتر'} ✕
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* جدول الفواتير */}
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap pb-4">
              <CardTitle>{appLang==='en' ? 'Invoices List' : 'قائمة الفواتير'}</CardTitle>
              {filteredInvoices.length > 0 && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {appLang === 'en'
                    ? `Total: ${currencySymbol}${filteredInvoices.reduce((sum, i) => sum + getDisplayAmount(i, 'total'), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                    : `الإجمالي: ${currencySymbol}${filteredInvoices.reduce((sum, i) => sum + getDisplayAmount(i, 'total'), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                  }
                </span>
              )}
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : invoices.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    {appLang === 'en' ? 'No invoices yet' : 'لا توجد فواتير بعد'}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    {appLang === 'en' ? 'Create your first invoice to get started' : 'أنشئ أول فاتورة للبدء'}
                  </p>
                  {permWrite && (
                    <Link href="/invoices/new">
                      <Button className="bg-blue-600 hover:bg-blue-700">
                        <Plus className="h-4 w-4 mr-2" />
                        {appLang === 'en' ? 'Create Invoice' : 'إنشاء فاتورة'}
                      </Button>
                    </Link>
                  )}
                </div>
              ) : filteredInvoices.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    {appLang === 'en' ? 'No results found' : 'لا توجد نتائج'}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    {appLang === 'en' ? 'Try adjusting your filters or search query' : 'حاول تعديل الفلاتر أو كلمة البحث'}
                  </p>
                  <Button variant="outline" onClick={clearFilters}>
                    {appLang === 'en' ? 'Clear Filters' : 'مسح الفلاتر'}
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[700px] w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-800">
                      <tr>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang==='en' ? 'Invoice No.' : 'رقم الفاتورة'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang==='en' ? 'Customer' : 'العميل'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden lg:table-cell">{appLang==='en' ? 'Products' : 'المنتجات'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden sm:table-cell">{appLang==='en' ? 'Date' : 'التاريخ'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang==='en' ? 'Amount' : 'المبلغ'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden md:table-cell">{appLang==='en' ? 'Paid' : 'المدفوع'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden md:table-cell">{appLang==='en' ? 'Remaining' : 'المتبقي'}</th>
                        <th className="px-3 py-3 text-center font-semibold text-gray-900 dark:text-white">{appLang==='en' ? 'Status' : 'الحالة'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang==='en' ? 'Actions' : 'الإجراءات'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map((invoice) => {
                        const remaining = getDisplayAmount(invoice, 'total') - getDisplayAmount(invoice, 'paid')
                        const productsSummary = getProductsSummary(invoice.id)
                        return (
                        <tr key={invoice.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                          <td className="px-3 py-3 font-medium text-blue-600 dark:text-blue-400">{invoice.invoice_number}</td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{invoice.customers?.name || '-'}</td>
                          <td className="px-3 py-3 text-gray-600 dark:text-gray-400 hidden lg:table-cell max-w-[200px]">
                            {productsSummary.length > 0 ? (
                              <div className="text-xs space-y-0.5">
                                {productsSummary.slice(0, 3).map((p, idx) => (
                                  <div key={idx} className="truncate">
                                    {p.name} — <span className="font-medium">{p.quantity}</span>
                                  </div>
                                ))}
                                {productsSummary.length > 3 && (
                                  <div className="text-gray-400">+{productsSummary.length - 3} {appLang === 'en' ? 'more' : 'أخرى'}</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-gray-600 dark:text-gray-400 hidden sm:table-cell">{invoice.invoice_date}</td>
                          <td className="px-3 py-3 font-medium text-gray-900 dark:text-white">
                            {currencySymbol}{getDisplayAmount(invoice, 'total').toFixed(2)}
                            {invoice.original_currency && invoice.original_currency !== appCurrency && invoice.original_total && (
                              <span className="block text-xs text-gray-500 dark:text-gray-400">({currencySymbols[invoice.original_currency] || invoice.original_currency}{invoice.original_total.toFixed(2)})</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-green-600 dark:text-green-400 hidden md:table-cell">{currencySymbol}{getDisplayAmount(invoice, 'paid').toFixed(2)}</td>
                          <td className={`px-3 py-3 hidden md:table-cell ${remaining > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            {currencySymbol}{remaining.toFixed(2)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>
                              {getStatusLabel(invoice.status)}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex gap-1 flex-wrap">
                              {permView && (
                                <Link href={`/invoices/${invoice.id}`}>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" title={appLang === 'en' ? 'View' : 'عرض'}>
                                    <Eye className="w-4 h-4 text-gray-500" />
                                  </Button>
                                </Link>
                              )}
                              {permEdit && invoice.status === 'draft' && (
                                <Link href={`/invoices/${invoice.id}/edit`}>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" title={appLang === 'en' ? 'Edit' : 'تعديل'}>
                                    <Pencil className="w-4 h-4 text-blue-500" />
                                  </Button>
                                </Link>
                              )}
                              {invoice.status !== 'draft' && invoice.status !== 'cancelled' && (
                                <>
                                  <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => openSalesReturn(invoice, "partial")} title={appLang==='en' ? 'Partial Return' : 'مرتجع جزئي'}>
                                    {appLang==='en' ? 'P.Ret' : 'جزئي'}
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => openSalesReturn(invoice, "full")} title={appLang==='en' ? 'Full Return' : 'مرتجع كامل'}>
                                    {appLang==='en' ? 'F.Ret' : 'كامل'}
                                  </Button>
                                </>
                              )}
                              {permDelete && invoice.status === 'draft' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-500 hover:text-red-600"
                                  onClick={() => requestDelete(invoice.id)}
                                  title={appLang === 'en' ? 'Delete' : 'حذف'}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent dir={appLang==='en' ? 'ltr' : 'rtl'}>
        <AlertDialogHeader>
          <AlertDialogTitle>{appLang==='en' ? 'Confirm Delete' : 'تأكيد الحذف'}</AlertDialogTitle>
          <AlertDialogDescription>
            {appLang==='en' ? 'Are you sure you want to delete this invoice? This action cannot be undone.' : 'هل أنت متأكد من حذف هذه الفاتورة؟ لا يمكن التراجع عن هذا الإجراء.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{appLang==='en' ? 'Cancel' : 'إلغاء'}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (pendingDeleteId) {
                handleDelete(pendingDeleteId)
              }
              setConfirmOpen(false)
              setPendingDeleteId(null)
            }}
          >
            {appLang==='en' ? 'Delete' : 'حذف'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
      <DialogContent dir={appLang==='en' ? 'ltr' : 'rtl'} className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{appLang==='en' ? (returnMode==='full' ? 'Full Sales Return' : 'Partial Sales Return') : (returnMode==='full' ? 'مرتجع مبيعات كامل' : 'مرتجع مبيعات جزئي')}</DialogTitle>
          <DialogDescription className="sr-only">
            {appLang==='en' ? 'Process invoice return' : 'معالجة مرتجع الفاتورة'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* ملخص مالي للفاتورة */}
          {returnInvoiceData && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-blue-800 dark:text-blue-200">{appLang==='en' ? 'Invoice Financial Summary' : 'ملخص الفاتورة المالي'}</h4>
                <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(returnInvoiceData.status)}`}>
                  {getStatusLabel(returnInvoiceData.status)}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="bg-white dark:bg-slate-800 p-2 rounded">
                  <p className="text-gray-500 dark:text-gray-400">{appLang==='en' ? 'Total' : 'الإجمالي'}</p>
                  <p className="font-semibold">{returnInvoiceData.total_amount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} {currencySymbol}</p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-2 rounded">
                  <p className="text-gray-500 dark:text-gray-400">{appLang==='en' ? 'Paid' : 'المدفوع'}</p>
                  <p className="font-semibold text-green-600">{returnInvoiceData.paid_amount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} {currencySymbol}</p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-2 rounded">
                  <p className="text-gray-500 dark:text-gray-400">{appLang==='en' ? 'Remaining' : 'المتبقي'}</p>
                  <p className="font-semibold text-red-600">{(returnInvoiceData.total_amount - returnInvoiceData.paid_amount).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} {currencySymbol}</p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-2 rounded">
                  <p className="text-gray-500 dark:text-gray-400">{appLang==='en' ? 'Previous Returns' : 'مرتجع سابق'}</p>
                  <p className="font-semibold text-orange-600">{returnInvoiceData.returned_amount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} {currencySymbol}</p>
                </div>
              </div>
              <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {appLang==='en' ? 'Customer' : 'العميل'}: <span className="font-medium">{returnInvoiceData.customer_name}</span>
              </div>
            </div>
          )}

          {/* جدول الأصناف */}
          <div className="text-sm font-medium">{appLang==='en' ? 'Invoice' : 'الفاتورة'}: <span className="font-semibold">{returnInvoiceNumber}</span></div>
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 dark:bg-slate-800">
                <tr>
                  <th className="p-2 text-right">{appLang==='en' ? 'Product' : 'المنتج'}</th>
                  <th className="p-2 text-center">{appLang==='en' ? 'Qty' : 'الكمية'}</th>
                  <th className="p-2 text-center">{appLang==='en' ? 'Unit Price' : 'السعر'}</th>
                  <th className="p-2 text-center">{appLang==='en' ? 'Return Qty' : 'كمية المرتجع'}</th>
                  <th className="p-2 text-center">{appLang==='en' ? 'Return Value' : 'قيمة المرتجع'}</th>
                </tr>
              </thead>
              <tbody>
                {returnItems.length === 0 ? (
                  <tr>
                    <td className="p-2 text-center text-gray-500 dark:text-gray-400" colSpan={5}>{appLang==='en' ? 'No items for this invoice' : 'لا توجد بنود لهذه الفاتورة'}</td>
                  </tr>
                ) : (
                  returnItems.map((it, idx) => {
                    const itemReturnValue = it.qtyToReturn * it.unit_price * (1 - (it.discount_percent || 0) / 100)
                    const itemTax = itemReturnValue * (it.tax_rate || 0) / 100
                    return (
                      <tr key={`${it.id}-${idx}`} className="border-t hover:bg-gray-50 dark:hover:bg-slate-900">
                        <td className="p-2">{it.name || it.product_id}</td>
                        <td className="p-2 text-center">{it.quantity}</td>
                        <td className="p-2 text-center">{it.unit_price.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</td>
                        <td className="p-2 text-center">
                          <Input
                            type="number"
                            min={0}
                            max={it.maxQty}
                            value={it.qtyToReturn}
                            disabled={returnMode==='full'}
                            className="w-20 mx-auto text-center"
                            onChange={(e) => {
                              const v = Math.max(0, Math.min(Number(e.target.value || 0), it.maxQty))
                              setReturnItems((prev) => prev.map((r, i) => i===idx ? { ...r, qtyToReturn: v } : r))
                            }}
                          />
                        </td>
                        <td className="p-2 text-center font-medium text-orange-600">
                          {(itemReturnValue + itemTax).toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* معاينة ما بعد المرتجع */}
          {(() => {
            const returnedSubtotal = returnItems.reduce((s, r) => s + (r.unit_price * (1 - (r.discount_percent || 0) / 100)) * r.qtyToReturn, 0)
            const returnedTax = returnItems.reduce((s, r) => s + (((r.unit_price * (1 - (r.discount_percent || 0) / 100)) * r.qtyToReturn) * (r.tax_rate || 0) / 100), 0)
            const returnTotal = returnedSubtotal + returnedTax
            const totalCOGS = returnItems.reduce((s, r) => s + r.qtyToReturn * r.cost_price, 0)

            if (returnTotal <= 0) return null

            const currentTotal = returnInvoiceData?.total_amount || 0
            const currentPaid = returnInvoiceData?.paid_amount || 0
            const newTotal = Math.max(currentTotal - returnTotal, 0)
            const customerCreditAmount = Math.max(0, currentPaid - newTotal)
            const newStatus = newTotal === 0 ? (appLang==='en' ? 'Fully Returned' : 'مرتجع بالكامل') :
                             customerCreditAmount > 0 ? (appLang==='en' ? 'Partially Returned' : 'مرتجع جزئي') :
                             currentPaid >= newTotal ? (appLang==='en' ? 'Paid' : 'مدفوعة') :
                             currentPaid > 0 ? (appLang==='en' ? 'Partially Paid' : 'مدفوعة جزئياً') : (appLang==='en' ? 'Sent' : 'مرسلة')

            return (
              <>
                {/* معاينة ما بعد المرتجع */}
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                  <h4 className="font-semibold text-orange-800 dark:text-orange-200 mb-3">{appLang==='en' ? 'Post-Return Preview' : 'معاينة ما بعد المرتجع'}</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="bg-white dark:bg-slate-800 p-2 rounded">
                      <p className="text-gray-500 dark:text-gray-400">{appLang==='en' ? 'Return Amount' : 'قيمة المرتجع'}</p>
                      <p className="font-semibold text-orange-600">{returnTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} {currencySymbol}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-2 rounded">
                      <p className="text-gray-500 dark:text-gray-400">{appLang==='en' ? 'New Total' : 'الإجمالي الجديد'}</p>
                      <p className="font-semibold">{newTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} {currencySymbol}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-2 rounded">
                      <p className="text-gray-500 dark:text-gray-400">{appLang==='en' ? 'Customer Credit' : 'رصيد العميل الدائن'}</p>
                      <p className="font-semibold text-green-600">{customerCreditAmount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} {currencySymbol}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-2 rounded">
                      <p className="text-gray-500 dark:text-gray-400">{appLang==='en' ? 'Expected Status' : 'الحالة المتوقعة'}</p>
                      <p className="font-semibold">{newStatus}</p>
                    </div>
                  </div>
                </div>

                {/* القيود المحاسبية المتوقعة */}
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                  <h4 className="font-semibold text-purple-800 dark:text-purple-200 mb-3">{appLang==='en' ? 'Accounting Entries Preview' : 'معاينة القيود المحاسبية'}</h4>
                  <div className="space-y-3 text-sm">
                    {/* قيد عكس تكلفة البضاعة */}
                    {totalCOGS > 0 && (
                      <div className="bg-white dark:bg-slate-800 p-3 rounded">
                        <p className="font-medium text-purple-700 dark:text-purple-300 mb-2">{appLang==='en' ? '1. COGS Reversal Entry' : '1. قيد عكس تكلفة البضاعة المباعة'}</p>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="font-medium">{appLang==='en' ? 'Account' : 'الحساب'}</div>
                          <div className="text-center font-medium">{appLang==='en' ? 'Debit' : 'مدين'}</div>
                          <div className="text-center font-medium">{appLang==='en' ? 'Credit' : 'دائن'}</div>
                          <div>{appLang==='en' ? 'Inventory' : 'المخزون'}</div>
                          <div className="text-center text-green-600">{totalCOGS.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</div>
                          <div className="text-center">-</div>
                          <div>{appLang==='en' ? 'COGS' : 'تكلفة البضاعة المباعة'}</div>
                          <div className="text-center">-</div>
                          <div className="text-center text-red-600">{totalCOGS.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</div>
                        </div>
                      </div>
                    )}
                    {/* قيد مرتجع المبيعات */}
                    <div className="bg-white dark:bg-slate-800 p-3 rounded">
                      <p className="font-medium text-purple-700 dark:text-purple-300 mb-2">{appLang==='en' ? '2. Sales Return Entry' : '2. قيد مرتجع المبيعات'}</p>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="font-medium">{appLang==='en' ? 'Account' : 'الحساب'}</div>
                        <div className="text-center font-medium">{appLang==='en' ? 'Debit' : 'مدين'}</div>
                        <div className="text-center font-medium">{appLang==='en' ? 'Credit' : 'دائن'}</div>
                        <div>{appLang==='en' ? 'Sales Returns / Revenue' : 'مردودات المبيعات / الإيرادات'}</div>
                        <div className="text-center text-green-600">{returnedSubtotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</div>
                        <div className="text-center">-</div>
                        {returnedTax > 0 && (
                          <>
                            <div>{appLang==='en' ? 'VAT Payable' : 'ضريبة المبيعات المستحقة'}</div>
                            <div className="text-center text-green-600">{returnedTax.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</div>
                            <div className="text-center">-</div>
                          </>
                        )}
                        <div>{appLang==='en' ? 'Customer Credit' : 'رصيد العميل الدائن'}</div>
                        <div className="text-center">-</div>
                        <div className="text-center text-red-600">{returnTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</div>
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    {appLang==='en'
                      ? '* Customer credit will be added to the customer account and can be disbursed from the Customers page.'
                      : '* سيتم إضافة رصيد دائن للعميل ويمكن صرفه من صفحة العملاء.'}
                  </p>
                </div>
              </>
            )
          })()}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setReturnOpen(false)}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
          <Button
            onClick={submitSalesReturn}
            disabled={returnItems.reduce((s, r) => s + r.qtyToReturn, 0) === 0}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {appLang==='en' ? 'Process Return' : 'تنفيذ المرتجع'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { Plus, Edit2, Trash2, Search, Users } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
import { AccountFinders } from "@/lib/utils"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { usePagination } from "@/lib/pagination"
import { DataPagination } from "@/components/data-pagination"
import { ListErrorBoundary } from "@/components/list-error-boundary"
import { TableSkeleton } from "@/components/ui/skeleton"
import { CustomerVoucherDialog } from "@/components/customers/customer-voucher-dialog"
import { CustomerRefundDialog } from "@/components/customers/customer-refund-dialog"
import { CustomerFormDialog } from "@/components/customers/customer-form-dialog"

interface Customer {
  id: string
  name: string
  email: string
  phone: string
  address?: string
  governorate?: string
  city: string
  country: string
  detailed_address?: string
  tax_id: string
  credit_limit: number
  payment_terms: string
}

interface InvoiceRow {
  id: string
  invoice_number: string
  total_amount: number
  paid_amount: number
  status: string
}

interface SalesOrderRow {
  id: string
  order_number: string
  status: string
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

  // صلاحيات المستخدم
  const [permWrite, setPermWrite] = useState(false)
  const [permUpdate, setPermUpdate] = useState(false)
  const [permDelete, setPermDelete] = useState(false)
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)

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

  // Listen for currency changes
  useEffect(() => {
    const handleCurrencyChange = () => {
      const newCurrency = localStorage.getItem('app_currency') || 'EGP'
      setAppCurrency(newCurrency)
    }
    window.addEventListener('app_currency_changed', handleCurrencyChange)
    return () => window.removeEventListener('app_currency_changed', handleCurrencyChange)
  }, [])

  const [accounts, setAccounts] = useState<{ id: string; account_code: string; account_name: string; account_type: string }[]>([])
  const [voucherOpen, setVoucherOpen] = useState(false)
  const [voucherCustomerId, setVoucherCustomerId] = useState<string>("")
  const [voucherCustomerName, setVoucherCustomerName] = useState<string>("")
  const [voucherAmount, setVoucherAmount] = useState<number>(0)
  const [voucherDate, setVoucherDate] = useState<string>(() => new Date().toISOString().slice(0,10))
  const [voucherMethod, setVoucherMethod] = useState<string>("cash")
  const [voucherRef, setVoucherRef] = useState<string>("")
  const [voucherNotes, setVoucherNotes] = useState<string>("")
  const [voucherAccountId, setVoucherAccountId] = useState<string>("")
  const [balances, setBalances] = useState<Record<string, { advance: number; applied: number; available: number }>>({})
  // الذمم المدينة لكل عميل (المبالغ المستحقة من الفواتير)
  const [receivables, setReceivables] = useState<Record<string, number>>({})
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

  // Multi-currency support for voucher
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [voucherCurrency, setVoucherCurrency] = useState<string>("EGP")
  const [voucherExRate, setVoucherExRate] = useState<{ rate: number; rateId: string | null; source: string }>({ rate: 1, rateId: null, source: 'same_currency' })
  // Multi-currency support for refund
  const [refundCurrency, setRefundCurrency] = useState<string>("EGP")
  const [refundExRate, setRefundExRate] = useState<{ rate: number; rateId: string | null; source: string }>({ rate: 1, rateId: null, source: 'same_currency' })
  const [companyId, setCompanyId] = useState<string | null>(null)

  // Pagination state
  const [pageSize, setPageSize] = useState(10)

  // التحقق من الصلاحيات
  useEffect(() => {
    const checkPerms = async () => {
      const [write, update, del] = await Promise.all([
        canAction(supabase, "customers", "write"),
        canAction(supabase, "customers", "update"),
        canAction(supabase, "customers", "delete"),
      ])
      setPermWrite(write)
      setPermUpdate(update)
      setPermDelete(del)
      setPermissionsLoaded(true)
    }
    checkPerms()
  }, [supabase])

  useEffect(() => {
    loadCustomers()
  }, [])

  const loadCustomers = async () => {
    try {
      setIsLoading(true)

      // استخدم الشركة الفعّالة (تعمل مع المالك والأعضاء المدعوين)
      const activeCompanyId = await getActiveCompanyId(supabase)
      if (!activeCompanyId) return

      const { data } = await supabase.from("customers").select("*").eq("company_id", activeCompanyId)

      setCustomers(data || [])
      const { data: accs } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type")
        .eq("company_id", activeCompanyId)
      setAccounts((accs || []).filter((a: any) => (a.account_type || "").toLowerCase() === "asset"))

      const { data: pays } = await supabase
        .from("payments")
        .select("customer_id, amount, invoice_id")
        .eq("company_id", activeCompanyId)
        .not("customer_id", "is", null)
      const { data: apps } = await supabase
        .from("advance_applications")
        .select("customer_id, amount_applied")
        .eq("company_id", activeCompanyId)
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

      // جلب الذمم المدينة (المبالغ المستحقة من الفواتير غير المدفوعة بالكامل)
      const { data: invoicesData } = await supabase
        .from("invoices")
        .select("customer_id, total_amount, paid_amount, status")
        .eq("company_id", activeCompanyId)
        .in("status", ["sent", "partially_paid"])

      const recMap: Record<string, number> = {}
      ;(invoicesData || []).forEach((inv: any) => {
        const cid = String(inv.customer_id || "")
        if (!cid) return
        const due = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0)
        recMap[cid] = (recMap[cid] || 0) + due
      })
      setReceivables(recMap)

      // Load currencies for multi-currency support
      setCompanyId(activeCompanyId)
      const curr = await getActiveCurrencies(supabase, activeCompanyId)
      if (curr.length > 0) setCurrencies(curr)
      setVoucherCurrency(appCurrency)
      setRefundCurrency(appCurrency)
    } catch (error) {
      // Silently handle loading errors
    } finally {
      setIsLoading(false)
    }
  }

  // Update voucher exchange rate when currency changes
  useEffect(() => {
    const updateVoucherRate = async () => {
      if (voucherCurrency === appCurrency) {
        setVoucherExRate({ rate: 1, rateId: null, source: 'same_currency' })
      } else if (companyId) {
        const result = await getExchangeRate(supabase, voucherCurrency, appCurrency, undefined, companyId)
        setVoucherExRate({ rate: result.rate, rateId: result.rateId || null, source: result.source })
      }
    }
    updateVoucherRate()
  }, [voucherCurrency, companyId, appCurrency])

  // Update refund exchange rate when currency changes
  useEffect(() => {
    const updateRefundRate = async () => {
      if (refundCurrency === appCurrency) {
        setRefundExRate({ rate: 1, rateId: null, source: 'same_currency' })
      } else if (companyId) {
        const result = await getExchangeRate(supabase, refundCurrency, appCurrency, undefined, companyId)
        setRefundExRate({ rate: result.rate, rateId: result.rateId || null, source: result.source })
      }
    }
    updateRefundRate()
  }, [refundCurrency, companyId, appCurrency])







  const handleEdit = (customer: Customer) => {
    setEditingId(customer.id)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    // التحقق من صلاحية الحذف
    if (!permDelete) {
      toast({
        title: appLang === 'en' ? 'Permission Denied' : 'غير مصرح',
        description: appLang === 'en' ? 'You do not have permission to delete customers' : 'ليس لديك صلاحية حذف العملاء',
        variant: 'destructive'
      })
      return
    }

    try {
      // الحصول على company_id الفعّال
      const activeCompanyId = await getActiveCompanyId(supabase)
      if (!activeCompanyId) {
        throw new Error(appLang === 'en' ? 'No active company' : 'لا توجد شركة نشطة')
      }

      // التحقق من عدم وجود فواتير مرتبطة بالعميل
      const { data: invoices, error: invoicesError } = await supabase
        .from("invoices")
        .select("id, invoice_number")
        .eq("customer_id", id)
        .eq("company_id", activeCompanyId)
        .limit(5)

      if (invoicesError) {
        // Silently handle invoice check errors
      }

      if (invoices && invoices.length > 0) {
        const invoiceNumbers = invoices.map((inv: InvoiceRow) => inv.invoice_number).join(', ')
        const moreText = invoices.length >= 5 ? (appLang === 'en' ? ' and more...' : ' والمزيد...') : ''
        toast({
          title: appLang === 'en' ? 'Cannot Delete Customer' : 'لا يمكن حذف العميل',
          description: appLang === 'en'
            ? `This customer has ${invoices.length}+ invoice(s): ${invoiceNumbers}${moreText}`
            : `هذا العميل مرتبط بـ ${invoices.length}+ فاتورة: ${invoiceNumbers}${moreText}`,
          variant: 'destructive'
        })
        return
      }

      // التحقق من عدم وجود أوامر بيع مرتبطة بالعميل
      const { data: salesOrders, error: salesOrdersError } = await supabase
        .from("sales_orders")
        .select("id, order_number")
        .eq("customer_id", id)
        .eq("company_id", activeCompanyId)
        .limit(5)

      if (salesOrdersError) {
        // Silently handle sales orders check errors
      }

      if (salesOrders && salesOrders.length > 0) {
        const orderNumbers = salesOrders.map((so: SalesOrderRow) => so.order_number).join(', ')
        const moreText = salesOrders.length >= 5 ? (appLang === 'en' ? ' and more...' : ' والمزيد...') : ''
        toast({
          title: appLang === 'en' ? 'Cannot Delete Customer' : 'لا يمكن حذف العميل',
          description: appLang === 'en'
            ? `This customer has ${salesOrders.length}+ sales order(s): ${orderNumbers}${moreText}`
            : `هذا العميل مرتبط بـ ${salesOrders.length}+ أمر بيع: ${orderNumbers}${moreText}`,
          variant: 'destructive'
        })
        return
      }

      // تأكيد الحذف
      const confirmMessage = appLang === 'en'
        ? 'Are you sure you want to delete this customer?'
        : 'هل أنت متأكد من حذف هذا العميل؟'
      if (!window.confirm(confirmMessage)) {
        return
      }

      // الحذف مع التأكد من company_id
      const { error, count } = await supabase
        .from("customers")
        .delete({ count: 'exact' })
        .eq("id", id)
        .eq("company_id", activeCompanyId)

      if (error) {
        throw error
      }

      // التحقق من أن الحذف تم فعلاً
      if (count === 0) {
        throw new Error(appLang === 'en'
          ? 'Failed to delete customer. You may not have permission.'
          : 'فشل حذف العميل. قد لا يكون لديك الصلاحية.')
      }

      toastActionSuccess(toast, appLang === 'en' ? 'Delete' : 'الحذف', appLang === 'en' ? 'Customer' : 'العميل')
      loadCustomers()
    } catch (error: any) {
      const errorMessage = error?.message || error?.details || String(error)
      toastActionError(toast, appLang === 'en' ? 'Delete' : 'الحذف', appLang === 'en' ? 'Customer' : 'العميل', errorMessage, appLang)
    }
  }

  const filteredCustomers = customers.filter((customer) => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return true

    // Detect input type
    const isNumeric = /^\d+$/.test(query)
    const isAlphabetic = /^[\u0600-\u06FF\u0750-\u077Fa-zA-Z\s]+$/.test(query)

    if (isNumeric) {
      // Search by phone only
      return (customer.phone || '').includes(query)
    } else if (isAlphabetic) {
      // Search by name only
      return customer.name.toLowerCase().includes(query)
    } else {
      // Mixed - search in both name, phone, and email
      return (
        customer.name.toLowerCase().includes(query) ||
        (customer.phone || '').toLowerCase().includes(query) ||
        customer.email.toLowerCase().includes(query)
      )
    }
  })

  // Pagination logic
  const {
    currentPage,
    totalPages,
    totalItems,
    paginatedItems: paginatedCustomers,
    hasNext,
    hasPrevious,
    goToPage,
    nextPage,
    previousPage,
    setPageSize: updatePageSize
  } = usePagination(filteredCustomers, { pageSize })

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    updatePageSize(newSize)
  }

  const createCustomerVoucher = async () => {
    try {
      if (!voucherCustomerId || voucherAmount <= 0) return
      const activeCompanyId = await getActiveCompanyId(supabase)
      if (!activeCompanyId) return
      if (voucherAccountId) {
        const { data: acct, error: acctErr } = await supabase
          .from("chart_of_accounts")
          .select("id, company_id")
          .eq("id", voucherAccountId)
          .eq("company_id", activeCompanyId)
          .single()
        if (acctErr || !acct) {
          toastActionError(toast, appLang==='en' ? 'Validation' : 'التحقق', appLang==='en' ? 'Account' : 'الحساب', appLang==='en' ? 'Selected account is invalid' : 'الحساب المختار غير صالح', appLang, 'INVALID_INPUT')
          return
        }
      }
      const payload: any = {
        company_id: activeCompanyId,
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
                .eq("company_id", companyId)
        const customerAdvance = AccountFinders.customerAdvance(accounts || [])
        const cash = AccountFinders.cash(accounts || [])
        const bank = AccountFinders.bank(accounts || [])
        const cashAccountId = voucherAccountId || bank || cash
        if (customerAdvance && cashAccountId) {
          // Calculate base amounts for multi-currency
          const baseAmount = voucherCurrency === appCurrency ? voucherAmount : Math.round(voucherAmount * voucherExRate.rate * 10000) / 10000

          const { data: entry } = await supabase
            .from("journal_entries")
            .insert({
              company_id: companyId,
              reference_type: "customer_voucher",
              reference_id: null,
              entry_date: voucherDate,
              description: appLang==='en' ? 'Customer payment voucher' : 'سند صرف عميل',
            })
            .select()
            .single()
          if (entry?.id) {
            await supabase.from("journal_entry_lines").insert([
              {
                journal_entry_id: entry.id,
                account_id: customerAdvance,
                debit_amount: baseAmount,
                credit_amount: 0,
                description: appLang==='en' ? 'Customer advance' : 'سلف العملاء',
                original_currency: voucherCurrency,
                original_debit: voucherAmount,
                original_credit: 0,
                exchange_rate_used: voucherExRate.rate,
                exchange_rate_id: voucherExRate.rateId,
                rate_source: voucherExRate.source
              },
              {
                journal_entry_id: entry.id,
                account_id: cashAccountId,
                debit_amount: 0,
                credit_amount: baseAmount,
                description: appLang==='en' ? 'Cash/Bank' : 'نقد/بنك',
                original_currency: voucherCurrency,
                original_debit: 0,
                original_credit: voucherAmount,
                exchange_rate_used: voucherExRate.rate,
                exchange_rate_id: voucherExRate.rateId,
                rate_source: voucherExRate.source
              },
            ])
          }
              }
            } catch (_) { /* ignore journal errors, voucher still created */ }
            try {
              if (insertedPayment?.id && voucherCustomerId) {
                const { data: invoices } = await supabase
                  .from("invoices")
                  .select("id, total_amount, paid_amount, status")
                  .eq("company_id", companyId)
                  .eq("customer_id", voucherCustomerId)
                  .in("status", ["sent", "partially_paid"])
                  .order("issue_date", { ascending: true })
                let remaining = Number(voucherAmount || 0)
                for (const inv of (invoices || [])) {
                  if (remaining <= 0) break
                  const due = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0)
                  const applyAmt = Math.min(remaining, due)
                  if (applyAmt > 0) {
                    await supabase.from("advance_applications").insert({ company_id: companyId, customer_id: voucherCustomerId, invoice_id: inv.id, amount_applied: applyAmt, payment_id: insertedPayment.id })
                    await supabase.from("invoices").update({ paid_amount: Number(inv.paid_amount || 0) + applyAmt, status: Number(inv.total_amount || 0) <= (Number(inv.paid_amount || 0) + applyAmt) ? "paid" : "partially_paid" }).eq("id", inv.id)
                    remaining -= applyAmt
                  }
                }
              }
            } catch (_) {}
      toastActionSuccess(toast, appLang==='en' ? 'Create' : 'الإنشاء', appLang==='en' ? 'Customer voucher' : 'سند صرف عميل')
      setVoucherOpen(false)
      setVoucherCustomerId("")
      setVoucherCustomerName("")
      setVoucherAmount(0)
      setVoucherRef("")
      setVoucherNotes("")
      setVoucherAccountId("")
    } catch (err: any) {
      toastActionError(toast, appLang==='en' ? 'Create' : 'الإنشاء', appLang==='en' ? 'Customer voucher' : 'سند صرف عميل', String(err?.message || err || ''), appLang, 'OPERATION_FAILED')
    }
  }

  // ===== فتح نافذة صرف رصيد العميل الدائن =====
  const openRefundDialog = (customer: Customer) => {
    const bal = balances[customer.id]
    const available = bal?.available || 0
    if (available <= 0) {
      toastActionError(toast, appLang==='en' ? 'Refund' : 'الصرف', appLang==='en' ? 'Customer credit' : 'رصيد العميل', appLang==='en' ? 'No available credit balance' : 'لا يوجد رصيد دائن متاح', appLang, 'INSUFFICIENT_STOCK')
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
        toastActionError(toast, appLang==='en' ? 'Refund' : 'الصرف', appLang==='en' ? 'Amount' : 'المبلغ', appLang==='en' ? 'Amount exceeds available balance' : 'المبلغ يتجاوز الرصيد المتاح', appLang, 'INVALID_INPUT')
        return
      }
      const activeCompanyId = await getActiveCompanyId(supabase)
      if (!activeCompanyId) return

      // جلب الحسابات
      const { data: accts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_type, account_name, sub_type")
        .eq("company_id", activeCompanyId)
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
        toastActionError(toast, appLang==='en' ? 'Refund' : 'الصرف', appLang==='en' ? 'Account' : 'الحساب', appLang==='en' ? 'No payment account found' : 'لم يتم العثور على حساب للصرف', appLang, 'RECORD_NOT_FOUND')
        return
      }

      // ===== إنشاء قيد صرف رصيد العميل =====
      // القيد المحاسبي:
      // مدين: رصيد العميل الدائن (تقليل الالتزام)
      // دائن: النقد/البنك (خروج المبلغ)

      // Calculate base amounts for multi-currency
      const baseRefundAmount = refundCurrency === appCurrency ? refundAmount : Math.round(refundAmount * refundExRate.rate * 10000) / 10000

      const { data: entry } = await supabase
        .from("journal_entries")
        .insert({
          company_id: activeCompanyId,
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
          lines.push({
            journal_entry_id: entry.id,
            account_id: customerCredit,
            debit_amount: baseRefundAmount,
            credit_amount: 0,
            description: appLang==='en' ? 'Customer credit refund' : 'صرف رصيد العميل الدائن',
            original_currency: refundCurrency,
            original_debit: refundAmount,
            original_credit: 0,
            exchange_rate_used: refundExRate.rate,
            exchange_rate_id: refundExRate.rateId,
            rate_source: refundExRate.source
          })
        }
        lines.push({
          journal_entry_id: entry.id,
          account_id: paymentAccount,
          debit_amount: 0,
          credit_amount: baseRefundAmount,
          description: appLang==='en' ? 'Cash/Bank payment' : 'صرف نقدي/بنكي',
          original_currency: refundCurrency,
          original_debit: 0,
          original_credit: refundAmount,
          exchange_rate_used: refundExRate.rate,
          exchange_rate_id: refundExRate.rateId,
          rate_source: refundExRate.source
        })
        await supabase.from("journal_entry_lines").insert(lines)
      }

      // ===== إنشاء سجل دفعة صرف =====
      const payload: any = {
        company_id: companyId,
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
      toastActionError(toast, appLang==='en' ? 'Refund' : 'الصرف', appLang==='en' ? 'Customer credit' : 'رصيد العميل', String(err?.message || err || ''), appLang, 'OPERATION_FAILED')
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />

      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <ListErrorBoundary listType="customers" lang={appLang}>
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* رأس الصفحة - تحسين للهاتف */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang==='en' ? 'Customers' : 'العملاء'}</h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang==='en' ? 'Manage customers' : 'إدارة العملاء'}</p>
                </div>
              </div>
            <CustomerFormDialog
              open={isDialogOpen}
              onOpenChange={setIsDialogOpen}
              editingCustomer={editingId ? customers.find(c => c.id === editingId) : null}
              onSaveComplete={() => {
                setIsDialogOpen(false)
                setEditingId(null)
                loadCustomers()
              }}
            />
            </div>
          </div>

          {/* Search Bar */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 flex-wrap">
                <Search className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <Input
                  placeholder={appLang==='en' ? 'Search by name or phone...' : 'ابحث بالاسم أو رقم الهاتف...'}
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
                <TableSkeleton 
                  cols={9} 
                  rows={8} 
                  className="mt-4"
                />
              ) : filteredCustomers.length === 0 ? (
                <p className="text-center py-8 text-gray-500 dark:text-gray-400">{appLang==='en' ? 'No customers yet' : 'لا توجد عملاء حتى الآن'}</p>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="min-w-[480px] w-full text-sm">
                      <thead className="border-b bg-gray-50 dark:bg-slate-800">
                        <tr>
                          <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang==='en' ? 'Name' : 'الاسم'}</th>
                          <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden lg:table-cell">{appLang==='en' ? 'Email' : 'البريد'}</th>
                          <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden sm:table-cell">{appLang==='en' ? 'Phone' : 'الهاتف'}</th>
                          <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden xl:table-cell">{appLang==='en' ? 'Address' : 'العنوان'}</th>
                          <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden lg:table-cell">{appLang==='en' ? 'City' : 'المدينة'}</th>
                          <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden md:table-cell">{appLang==='en' ? 'Credit' : 'الائتمان'}</th>
                          <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang==='en' ? 'Receivables' : 'الذمم'}</th>
                          <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden sm:table-cell">{appLang==='en' ? 'Balance' : 'الرصيد'}</th>
                          <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang==='en' ? 'Actions' : 'إجراءات'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedCustomers.map((customer) => (
                        <tr key={customer.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                          <td className="px-3 py-3 font-medium text-gray-900 dark:text-white">{customer.name}</td>
                          <td className="px-3 py-3 text-gray-600 dark:text-gray-400 hidden lg:table-cell text-xs">{customer.email || '-'}</td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300 hidden sm:table-cell">{customer.phone || '-'}</td>
                          <td className="px-3 py-3 text-gray-600 dark:text-gray-400 hidden xl:table-cell text-xs max-w-[150px] truncate">{customer.address || '-'}</td>
                          <td className="px-3 py-3 text-gray-600 dark:text-gray-400 hidden lg:table-cell">{customer.city || '-'}</td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300 hidden md:table-cell">{customer.credit_limit.toLocaleString()} {currencySymbol}</td>
                          <td className="px-3 py-3">
                            {(() => {
                              const rec = receivables[customer.id] || 0
                              return (
                                <span className={rec > 0 ? "text-red-600 dark:text-red-400 font-semibold" : "text-gray-400 dark:text-gray-500"}>
                                  {rec > 0 ? rec.toLocaleString('ar-EG', { minimumFractionDigits: 2 }) : '—'} {rec > 0 ? currencySymbol : ''}
                                </span>
                              )
                            })()}
                          </td>
                          <td className="px-3 py-3 hidden sm:table-cell">
                            {(() => {
                              const b = balances[customer.id] || { advance: 0, applied: 0, available: 0 }
                              const available = b.available
                              return (
                                <span className={available > 0 ? "text-green-600 dark:text-green-400 font-semibold" : "text-gray-600 dark:text-gray-400"}>
                                  {available.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                                </span>
                              )
                            })()}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex gap-1 flex-wrap">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEdit(customer)}
                                disabled={!permUpdate}
                                title={!permUpdate ? (appLang === 'en' ? 'No permission to edit' : 'لا توجد صلاحية للتعديل') : ''}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(customer.id)}
                                className="text-red-600 hover:text-red-700"
                                disabled={!permDelete}
                                title={!permDelete ? (appLang === 'en' ? 'No permission to delete' : 'لا توجد صلاحية للحذف') : ''}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { setVoucherCustomerId(customer.id); setVoucherCustomerName(customer.name); setVoucherOpen(true) }}
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
                  {filteredCustomers.length > 0 && (
                    <DataPagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      totalItems={totalItems}
                      pageSize={pageSize}
                      onPageChange={goToPage}
                      onPageSizeChange={handlePageSizeChange}
                      lang={appLang}
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        </ListErrorBoundary>
      </main>
      <CustomerVoucherDialog
        open={voucherOpen}
        onOpenChange={setVoucherOpen}
        customerId={voucherCustomerId}
        customerName={voucherCustomerName}
        accounts={accounts || []}
        appCurrency={appCurrency}
        currencies={currencies}
        voucherAmount={voucherAmount}
        setVoucherAmount={setVoucherAmount}
        voucherCurrency={voucherCurrency}
        setVoucherCurrency={setVoucherCurrency}
        voucherDate={voucherDate}
        setVoucherDate={setVoucherDate}
        voucherMethod={voucherMethod}
        setVoucherMethod={setVoucherMethod}
        voucherAccountId={voucherAccountId}
        setVoucherAccountId={setVoucherAccountId}
        voucherRef={voucherRef}
        setVoucherRef={setVoucherRef}
        voucherNotes={voucherNotes}
        setVoucherNotes={setVoucherNotes}
        voucherExRate={voucherExRate}
        setVoucherExRate={setVoucherExRate}
        onVoucherComplete={createCustomerVoucher}
      />

      <CustomerRefundDialog
        open={refundOpen}
        onOpenChange={setRefundOpen}
        customerId={refundCustomerId}
        customerName={refundCustomerName}
        maxAmount={refundMaxAmount}
        accounts={accounts || []}
        appCurrency={appCurrency}
        currencies={currencies}
        refundAmount={refundAmount}
        setRefundAmount={setRefundAmount}
        refundCurrency={refundCurrency}
        setRefundCurrency={setRefundCurrency}
        refundDate={refundDate}
        setRefundDate={setRefundDate}
        refundMethod={refundMethod}
        setRefundMethod={setRefundMethod}
        refundAccountId={refundAccountId}
        setRefundAccountId={setRefundAccountId}
        refundNotes={refundNotes}
        setRefundNotes={setRefundNotes}
        refundExRate={refundExRate}
        onRefundComplete={processCustomerRefund}
      />
    </div>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import Link from "next/link"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { Receipt, Plus, RotateCcw, Eye, Trash2, Pencil } from "lucide-react"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
import { CompanyHeader } from "@/components/company-header"
import { useToast } from "@/hooks/use-toast"
import { toastDeleteSuccess, toastDeleteError } from "@/lib/notifications"

type Bill = {
  id: string
  supplier_id: string
  bill_number: string
  bill_date: string
  total_amount: number
  paid_amount?: number
  status: string
  currency_code?: string
  original_currency?: string
  original_total?: number
  display_currency?: string
  display_total?: number
  suppliers?: { name: string; phone?: string }
}

type Supplier = { id: string; name: string; phone?: string }

type Payment = { id: string; bill_id: string | null; amount: number }

export default function BillsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [loading, setLoading] = useState<boolean>(true)
  const [bills, setBills] = useState<Bill[]>([])
  const [suppliers, setSuppliers] = useState<Record<string, Supplier>>({})
  const [payments, setPayments] = useState<Payment[]>([])
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState<string>("")
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

  // Helper: Get display amount (use converted if available)
  const getDisplayAmount = (bill: Bill): number => {
    if (bill.display_currency === appCurrency && bill.display_total != null) {
      return bill.display_total
    }
    return bill.total_amount
  }

  // Listen for currency changes
  useEffect(() => {
    const handleCurrencyChange = () => {
      const newCurrency = localStorage.getItem('app_currency') || 'EGP'
      setAppCurrency(newCurrency)
      // Reload data to get updated display amounts
      loadData()
    }
    window.addEventListener('app_currency_changed', handleCurrencyChange)
    return () => window.removeEventListener('app_currency_changed', handleCurrencyChange)
  }, [])
  const [permView, setPermView] = useState(true)
  const [permWrite, setPermWrite] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnMode, setReturnMode] = useState<"partial"|"full">("partial")
  const [returnBillId, setReturnBillId] = useState<string | null>(null)
  const [returnBillNumber, setReturnBillNumber] = useState<string>("")
  const [returnItems, setReturnItems] = useState<{ id: string; product_id: string; name?: string; quantity: number; maxQty: number; qtyToReturn: number; unit_price: number; tax_rate: number; line_total: number; returned_quantity?: number }[]>([])
  // Multi-currency and refund method states
  const [returnMethod, setReturnMethod] = useState<'cash' | 'bank' | 'credit'>('cash')
  const [returnAccountId, setReturnAccountId] = useState<string>('')
  const [returnAccounts, setReturnAccounts] = useState<Array<{ id: string; account_code: string | null; account_name: string; sub_type: string | null }>>([])
  const [returnCurrency, setReturnCurrency] = useState<string>('EGP')
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [returnExRate, setReturnExRate] = useState<{ rate: number; rateId: string | null; source: string }>({ rate: 1, rateId: null, source: 'same_currency' })
  const [returnProcessing, setReturnProcessing] = useState(false)
  const [returnBillCurrency, setReturnBillCurrency] = useState<string>('EGP')

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
      received: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      partially_paid: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      fully_returned: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      partially_returned: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    }
    return colors[status] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
  }

  const getStatusLabel = (status: string) => {
    const labelsAr: Record<string, string> = { draft: "مسودة", received: "مستلمة", sent: "مستلمة", partially_paid: "مدفوعة جزئياً", paid: "مدفوعة", cancelled: "ملغاة", fully_returned: "مرتجعة بالكامل", partially_returned: "مرتجعة جزئياً" }
    const labelsEn: Record<string, string> = { draft: "Draft", received: "Received", sent: "Received", partially_paid: "Partially Paid", paid: "Paid", cancelled: "Cancelled", fully_returned: "Fully Returned", partially_returned: "Partially Returned" }
    return (appLang === 'en' ? labelsEn : labelsAr)[status] || status
  }

  const [permEdit, setPermEdit] = useState(false)
  const [permDelete, setPermDelete] = useState(false)

  useEffect(() => {
    (async () => {
      setPermView(await canAction(supabase, 'bills', 'read'))
      setPermWrite(await canAction(supabase, 'bills', 'write'))
      setPermEdit(await canAction(supabase, 'bills', 'update'))
      setPermDelete(await canAction(supabase, 'bills', 'delete'))
    })()
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus])
  useEffect(() => {
    const reloadPerms = async () => {
      setPermView(await canAction(supabase, 'bills', 'read'))
      setPermWrite(await canAction(supabase, 'bills', 'write'))
      setPermEdit(await canAction(supabase, 'bills', 'update'))
      setPermDelete(await canAction(supabase, 'bills', 'delete'))
    }
    const handler = () => { reloadPerms() }
    if (typeof window !== 'undefined') window.addEventListener('permissions_updated', handler)
    return () => { if (typeof window !== 'undefined') window.removeEventListener('permissions_updated', handler) }
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      let query = supabase
        .from("bills")
        .select("id, supplier_id, bill_number, bill_date, total_amount, paid_amount, status, display_currency, display_total, original_currency, original_total, suppliers(name, phone)")
        .eq("company_id", companyId)
        .neq("status", "voided")

      // Apply status filter
      if (filterStatus !== "all") {
        query = query.eq("status", filterStatus)
      }

      const { data: billData } = await query.order("bill_date", { ascending: false })
      setBills(billData || [])

      const supplierIds = Array.from(new Set((billData || []).map((b: any) => b.supplier_id)))
      if (supplierIds.length) {
        const { data: suppData } = await supabase
          .from("suppliers")
          .select("id, name, phone")
          .eq("company_id", companyId)
          .in("id", supplierIds)
        const map: Record<string, Supplier> = {}
        ;(suppData || []).forEach((s: any) => (map[s.id] = { id: s.id, name: s.name, phone: s.phone }))
        setSuppliers(map)
      } else {
        setSuppliers({})
      }

      const billIds = Array.from(new Set((billData || []).map((b: any) => b.id)))
      if (billIds.length) {
        const { data: payData } = await supabase
          .from("payments")
          .select("id, bill_id, amount")
          .eq("company_id", companyId)
          .in("bill_id", billIds)
        setPayments(payData || [])
      } else {
        setPayments([])
      }
    } finally {
      setLoading(false)
    }
  }

  // Delete bill handler
  const handleDelete = async (id: string) => {
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // Check for linked payments
      const { data: linkedPays } = await supabase
        .from("payments")
        .select("id, amount")
        .eq("bill_id", id)

      const hasLinkedPayments = Array.isArray(linkedPays) && linkedPays.length > 0

      // Delete inventory transactions
      await supabase.from("inventory_transactions").delete().eq("reference_id", id)

      // Delete journal entries
      const { data: relatedJournals } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("reference_id", id)

      if (relatedJournals && relatedJournals.length > 0) {
        const journalIds = relatedJournals.map((j: any) => j.id)
        await supabase.from("journal_entry_lines").delete().in("journal_entry_id", journalIds)
        await supabase.from("journal_entries").delete().in("id", journalIds)
      }

      // Handle linked payments
      if (hasLinkedPayments) {
        await supabase.from("payments").update({ bill_id: null }).eq("bill_id", id)
      }

      // Delete bill items
      await supabase.from("bill_items").delete().eq("bill_id", id)

      // Delete or cancel bill
      if (hasLinkedPayments) {
        await supabase.from("bills").update({ status: "cancelled" }).eq("id", id)
      } else {
        await supabase.from("bills").delete().eq("id", id)
      }

      await loadData()
      toastDeleteSuccess(toast, hasLinkedPayments
        ? (appLang === 'en' ? "Bill cancelled (had payments)" : "الفاتورة (تم الإلغاء - كانت بها مدفوعات)")
        : (appLang === 'en' ? "Bill deleted completely" : "الفاتورة (تم الحذف الكامل)"))
    } catch (error) {
      console.error("Error deleting bill:", error)
      toastDeleteError(toast, appLang === 'en' ? "Bill" : "الفاتورة")
    }
  }

  const requestDelete = (id: string) => {
    setPendingDeleteId(id)
    setConfirmOpen(true)
  }

  // Search filter
  const filteredBills = bills.filter((bill) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.trim().toLowerCase()
    const supplierName = (bill.suppliers?.name || suppliers[bill.supplier_id]?.name || "").toLowerCase()
    const supplierPhone = (bill.suppliers?.phone || suppliers[bill.supplier_id]?.phone || "").toLowerCase()
    const billNumber = (bill.bill_number || "").toLowerCase()
    return supplierName.includes(q) || supplierPhone.includes(q) || billNumber.includes(q)
  })

  const openPurchaseReturn = async (bill: Bill, mode: "partial"|"full") => {
    try {
      setReturnMode(mode)
      setReturnBillId(bill.id)
      setReturnBillNumber(bill.bill_number)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // Load bill items with returned_quantity
      const { data: items } = await supabase
        .from("bill_items")
        .select("id, product_id, quantity, unit_price, tax_rate, discount_percent, line_total, returned_quantity, products(name)")
        .eq("bill_id", bill.id)
      const rows = (items || []).map((it: any) => {
        const availableQty = Math.max(0, Number(it.quantity || 0) - Number(it.returned_quantity || 0))
        return {
          id: String(it.id),
          product_id: String(it.product_id),
          name: String(it.products?.name || ""),
          quantity: Number(it.quantity || 0),
          maxQty: availableQty,
          qtyToReturn: mode === "full" ? availableQty : 0,
          unit_price: Number(it.unit_price || 0),
          tax_rate: Number(it.tax_rate || 0),
          line_total: Number(it.line_total || 0),
          returned_quantity: Number(it.returned_quantity || 0)
        }
      }).filter(r => r.maxQty > 0)
      setReturnItems(rows)

      // Load accounts for refund selection
      const { data: accs } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, sub_type")
        .eq("company_id", companyId)
      setReturnAccounts((accs || []).filter((a: any) => ['cash', 'bank', 'accounts_payable'].includes(String(a.sub_type || '').toLowerCase())))

      // Load currencies
      const curr = await getActiveCurrencies(supabase, companyId)
      if (curr.length > 0) setCurrencies(curr)

      // Set bill currency as default
      const billCurrency = bill.currency_code || bill.original_currency || appCurrency
      setReturnBillCurrency(billCurrency)
      setReturnCurrency(billCurrency)
      setReturnMethod('cash')
      setReturnAccountId('')
      setReturnOpen(true)
    } catch {}
  }

  // Update exchange rate when return currency changes
  useEffect(() => {
    const updateRate = async () => {
      if (returnCurrency === appCurrency) {
        setReturnExRate({ rate: 1, rateId: null, source: 'same_currency' })
      } else {
        const companyId = await getActiveCompanyId(supabase)
        if (companyId) {
          const result = await getExchangeRate(supabase, companyId, returnCurrency, appCurrency)
          setReturnExRate({ rate: result.rate, rateId: result.rateId || null, source: result.source })
        }
      }
    }
    if (returnOpen) updateRate()
  }, [returnCurrency, appCurrency, returnOpen])

  // Calculate return total
  const returnTotal = useMemo(() => {
    return returnItems.reduce((sum, it) => sum + (it.qtyToReturn * it.unit_price), 0)
  }, [returnItems])

  const submitPurchaseReturn = async () => {
    try {
      setReturnProcessing(true)
      if (!returnBillId || returnTotal <= 0) return
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: accounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, sub_type")
        .eq("company_id", companyId)
      const find = (f: (a: any) => boolean) => (accounts || []).find(f)?.id
      const ap = find((a: any) => String(a.sub_type || "").toLowerCase() === "accounts_payable") || find((a: any) => String(a.sub_type || "").toLowerCase() === "ap") || find((a: any) => String(a.account_name || "").toLowerCase().includes("accounts payable")) || find((a: any) => String(a.account_code || "") === "2000")
      const inventory = find((a: any) => String(a.sub_type || "").toLowerCase() === "inventory")
      const vatRecv = find((a: any) => String(a.sub_type || "").toLowerCase().includes("vat")) || find((a: any) => String(a.account_name || "").toLowerCase().includes("vat receivable")) || find((a: any) => String(a.account_code || "") === "2105")
      const cash = find((a: any) => String(a.sub_type || "").toLowerCase() === "cash") || find((a: any) => String(a.account_name || "").toLowerCase().includes("cash")) || find((a: any) => String(a.account_code || "") === "1000")
      const bank = find((a: any) => String(a.sub_type || "").toLowerCase() === "bank") || find((a: any) => String(a.account_name || "").toLowerCase().includes("bank"))

      const toReturn = returnItems.filter((r) => r.qtyToReturn > 0)

      // Calculate amounts with multi-currency support
      const returnedNetOriginal = toReturn.reduce((s, r) => s + (r.unit_price * r.qtyToReturn), 0)
      const returnedTaxOriginal = toReturn.reduce((s, r) => s + ((r.unit_price * r.qtyToReturn) * (r.tax_rate || 0) / 100), 0)
      const returnTotalOriginal = returnedNetOriginal + returnedTaxOriginal

      // Convert to base currency
      const baseReturnTotal = returnCurrency === appCurrency ? returnTotalOriginal : Math.round(returnTotalOriginal * returnExRate.rate * 10000) / 10000
      const baseReturnedNet = returnCurrency === appCurrency ? returnedNetOriginal : Math.round(returnedNetOriginal * returnExRate.rate * 10000) / 10000
      const baseReturnedTax = returnCurrency === appCurrency ? returnedTaxOriginal : Math.round(returnedTaxOriginal * returnExRate.rate * 10000) / 10000

      // Update bill_items returned_quantity
      for (const r of toReturn) {
        try {
          const { data: curr } = await supabase
            .from("bill_items")
            .select("id, returned_quantity")
            .eq("id", r.id)
            .single()
          if (curr?.id) {
            const newReturnedQty = Number(curr.returned_quantity || 0) + Number(r.qtyToReturn || 0)
            await supabase.from("bill_items").update({ returned_quantity: newReturnedQty }).eq("id", curr.id)
          }
        } catch (_) {}
      }

      // Get bill info
      const { data: billRow } = await supabase
        .from("bills")
        .select("supplier_id, bill_number, subtotal, tax_amount, total_amount, paid_amount, status, returned_amount")
        .eq("id", returnBillId)
        .single()
      if (!billRow) return

      const oldPaid = Number(billRow.paid_amount || 0)
      const oldReturned = Number(billRow.returned_amount || 0)
      const oldTotal = Number(billRow.total_amount || 0)
      const newReturned = oldReturned + baseReturnTotal
      const newTotal = Math.max(oldTotal - baseReturnTotal, 0)
      const refundAmount = Math.max(0, oldPaid - newTotal)

      // Determine refund account based on method
      let refundAccountId: string | null = returnAccountId || null
      if (!refundAccountId) {
        if (returnMethod === 'cash') refundAccountId = cash
        else if (returnMethod === 'bank') refundAccountId = bank
        else refundAccountId = ap // credit method
      }

      // Create journal entry for return with multi-currency
      const { data: entry } = await supabase
        .from("journal_entries")
        .insert({
          company_id: companyId,
          reference_type: "purchase_return",
          reference_id: returnBillId,
          entry_date: new Date().toISOString().slice(0, 10),
          description: appLang === 'en'
            ? `Purchase return for bill ${returnBillNumber}${returnMode === "partial" ? " (partial)" : " (full)"}`
            : `مرتجع فاتورة مورد ${returnBillNumber}${returnMode === "partial" ? " (جزئي)" : " (كامل)"}`
        })
        .select()
        .single()
      const entryId = entry?.id ? String(entry.id) : null

      if (entryId) {
        const lines: any[] = []

        // If credit method: Debit AP (reduce payable)
        // If cash/bank: Debit Cash/Bank (receive refund)
        if (returnMethod === 'credit') {
          if (ap && baseReturnTotal > 0) {
            lines.push({
              journal_entry_id: entryId,
              account_id: ap,
              debit_amount: baseReturnTotal,
              credit_amount: 0,
              description: appLang === 'en' ? 'Reduce accounts payable - return' : 'تقليل ذمم الموردين - مرتجع',
              original_currency: returnCurrency,
              original_debit: returnTotalOriginal,
              original_credit: 0,
              exchange_rate_used: returnExRate.rate,
              exchange_rate_id: returnExRate.rateId,
              rate_source: returnExRate.source
            })
          }
        } else {
          // Cash or Bank refund
          if (refundAccountId && baseReturnTotal > 0) {
            lines.push({
              journal_entry_id: entryId,
              account_id: refundAccountId,
              debit_amount: baseReturnTotal,
              credit_amount: 0,
              description: returnMethod === 'cash'
                ? (appLang === 'en' ? 'Cash refund - purchase return' : 'استرداد نقدي - مرتجع مشتريات')
                : (appLang === 'en' ? 'Bank refund - purchase return' : 'استرداد بنكي - مرتجع مشتريات'),
              original_currency: returnCurrency,
              original_debit: returnTotalOriginal,
              original_credit: 0,
              exchange_rate_used: returnExRate.rate,
              exchange_rate_id: returnExRate.rateId,
              rate_source: returnExRate.source
            })
          }
        }

        // Credit Inventory
        if (inventory && baseReturnedNet > 0) {
          lines.push({
            journal_entry_id: entryId,
            account_id: inventory,
            debit_amount: 0,
            credit_amount: baseReturnedNet,
            description: appLang === 'en' ? 'Inventory out - purchase return' : 'خروج مخزون - مرتجع مشتريات',
            original_currency: returnCurrency,
            original_debit: 0,
            original_credit: returnedNetOriginal,
            exchange_rate_used: returnExRate.rate,
            exchange_rate_id: returnExRate.rateId,
            rate_source: returnExRate.source
          })
        }

        // Credit VAT Receivable
        if (vatRecv && baseReturnedTax > 0) {
          lines.push({
            journal_entry_id: entryId,
            account_id: vatRecv,
            debit_amount: 0,
            credit_amount: baseReturnedTax,
            description: appLang === 'en' ? 'Reverse VAT - purchase return' : 'عكس ضريبة المشتريات',
            original_currency: returnCurrency,
            original_debit: 0,
            original_credit: returnedTaxOriginal,
            exchange_rate_used: returnExRate.rate,
            exchange_rate_id: returnExRate.rateId,
            rate_source: returnExRate.source
          })
        }

        if (lines.length > 0) await supabase.from("journal_entry_lines").insert(lines)
      }

      // Inventory transactions
      if (toReturn.length > 0) {
        const invTx = toReturn.map((r) => ({
          company_id: companyId,
          product_id: r.product_id,
          transaction_type: "purchase_return",
          quantity_change: -r.qtyToReturn,
          reference_id: returnBillId,
          journal_entry_id: entryId,
          notes: appLang === 'en'
            ? `Purchase return for bill ${returnBillNumber}`
            : (returnMode === "partial" ? "مرتجع جزئي لفاتورة المورد" : "مرتجع كامل لفاتورة المورد")
        }))
        await supabase.from("inventory_transactions").upsert(invTx, { onConflict: "journal_entry_id,product_id,transaction_type" })

        // Update product quantities
        for (const r of toReturn) {
          try {
            const { data: prod } = await supabase.from("products").select("id, quantity_on_hand").eq("id", r.product_id).single()
            if (prod) {
              const newQty = Math.max(0, Number(prod.quantity_on_hand || 0) - Number(r.qtyToReturn || 0))
              await supabase.from("products").update({ quantity_on_hand: newQty }).eq("id", r.product_id)
            }
          } catch {}
        }
      }

      // Update original bill
      const newPaid = Math.min(oldPaid, newTotal)
      const returnStatus = newTotal === 0 ? "full" : "partial"
      let newStatus: string = billRow.status
      if (newTotal === 0) newStatus = "fully_returned"
      else if (returnStatus === "partial") newStatus = "partially_returned"
      else if (newPaid >= newTotal) newStatus = "paid"
      else if (newPaid > 0) newStatus = "partially_paid"
      else newStatus = "sent"

      await supabase.from("bills").update({
        total_amount: newTotal,
        paid_amount: newPaid,
        status: newStatus,
        returned_amount: newReturned,
        return_status: returnStatus
      }).eq("id", returnBillId)

      // Create payment record for refund (cash/bank method only)
      if (returnMethod !== 'credit' && refundAccountId && refundAmount > 0) {
        const payload: any = {
          company_id: companyId,
          supplier_id: billRow.supplier_id,
          bill_id: returnBillId,
          payment_date: new Date().toISOString().slice(0, 10),
          amount: -refundAmount,
          payment_method: "refund",
          reference_number: `REF-${returnBillId.slice(0, 8)}`,
          notes: appLang === 'en'
            ? `Refund for purchase return - bill ${billRow.bill_number}`
            : `استرداد بسبب مرتجع فاتورة مورد ${billRow.bill_number}`,
          account_id: refundAccountId,
        }
        try {
          await supabase.from("payments").insert(payload)
        } catch {}
      }

      setReturnOpen(false)
      setReturnItems([])
      await loadData()
    } catch (err) {
      console.error("Error processing purchase return:", err)
    } finally {
      setReturnProcessing(false)
    }
  }

  const paidByBill: Record<string, number> = useMemo(() => {
    const agg: Record<string, number> = {}
    payments.forEach((p) => {
      const key = p.bill_id || ""
      agg[key] = (agg[key] || 0) + (p.amount || 0)
    })
    return agg
  }, [payments])

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
                <div className="p-2 sm:p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <Receipt className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang==='en' ? 'Purchase Bills' : 'فواتير المشتريات'}</h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang==='en' ? 'Manage bills' : 'إدارة الفواتير'}</p>
                </div>
              </div>
              {permWrite ? (
                <Link href="/bills/new" className="self-start sm:self-auto">
                  <Button className="bg-orange-600 hover:bg-orange-700 h-10 sm:h-11 text-sm sm:text-base px-3 sm:px-4">
                    <Plus className="w-4 h-4 ml-1 sm:ml-2" />
                    {appLang==='en' ? 'New' : 'جديدة'}
                  </Button>
                </Link>
              ) : null}
            </div>
          </div>

          {/* Statistics Cards - تحسين للهاتف */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
            <Card className="p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Total' : 'الإجمالي'}</CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="text-lg sm:text-2xl font-bold">{bills.length}</div>
              </CardContent>
            </Card>

            <Card className="p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Paid' : 'المدفوعة'}</CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="text-lg sm:text-2xl font-bold text-green-600">{bills.filter((b) => b.status === "paid").length}</div>
              </CardContent>
            </Card>

            <Card className="p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Pending' : 'قيد الانتظار'}</CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="text-lg sm:text-2xl font-bold text-yellow-600">
                  {bills.filter((b) => b.status !== "paid" && b.status !== "cancelled" && b.status !== "draft").length}
                </div>
              </CardContent>
            </Card>

            <Card className="p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Amount' : 'المبلغ'}</CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="text-sm sm:text-2xl font-bold truncate">
                  {bills.reduce((sum, b) => sum + getDisplayAmount(b), 0).toFixed(0)} {currencySymbol}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Status Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-2 flex-wrap">
                {["all", "draft", "received", "partially_paid", "paid"].map((status) => (
                  <Button
                    key={status}
                    variant={filterStatus === status ? "default" : "outline"}
                    onClick={() => setFilterStatus(status)}
                  >
                    {status === "all" ? (appLang==='en' ? 'All' : 'الكل') : getStatusLabel(status)}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Bills Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <CardTitle>{appLang==='en' ? 'Bills List' : 'قائمة الفواتير'}</CardTitle>
              <div className="relative w-full sm:w-72">
                <input
                  type="text"
                  placeholder={appLang === 'en' ? 'Search by name, phone or bill #...' : 'بحث بالاسم أو الهاتف أو رقم الفاتورة...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 dark:bg-slate-800 dark:border-slate-700"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center py-8 text-gray-500 dark:text-gray-400">{appLang==='en' ? 'Loading...' : 'جاري التحميل...'}</p>
              ) : filteredBills.length === 0 ? (
                <p className="text-center py-8 text-gray-500 dark:text-gray-400">{appLang==='en' ? 'No bills yet' : 'لا توجد فواتير حتى الآن'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[640px] w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Bill No.' : 'رقم الفاتورة'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Supplier' : 'المورد'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Date' : 'التاريخ'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Amount' : 'المبلغ'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Paid' : 'المدفوع'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Status' : 'الحالة'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Actions' : 'الإجراءات'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBills.map((b) => {
                        const displayTotal = getDisplayAmount(b)
                        const paid = b.paid_amount || paidByBill[b.id] || 0
                        return (
                          <tr key={b.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                            <td className="px-4 py-3 font-medium">{b.bill_number}</td>
                            <td className="px-4 py-3">{b.suppliers?.name || suppliers[b.supplier_id]?.name || b.supplier_id}</td>
                            <td className="px-4 py-3">{new Date(b.bill_date).toLocaleDateString(appLang==='en' ? 'en' : 'ar')}</td>
                            <td className="px-4 py-3">
                              {displayTotal.toFixed(2)} {currencySymbol}
                              {b.original_currency && b.original_currency !== appCurrency && b.original_total && (
                                <span className="block text-xs text-gray-500 dark:text-gray-400">({b.original_total.toFixed(2)} {currencySymbols[b.original_currency] || b.original_currency})</span>
                              )}
                            </td>
                            <td className="px-4 py-3">{paid.toFixed(2)} {currencySymbol}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(b.status)}`}>
                                {getStatusLabel(b.status)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2 flex-wrap">
                                {permView && (
                                  <Link href={`/bills/${b.id}`}>
                                    <Button variant="outline" size="sm">
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                  </Link>
                                )}
                                {permEdit && (
                                  <Link href={`/bills/${b.id}/edit`}>
                                    <Button variant="outline" size="sm">
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                  </Link>
                                )}
                                {b.status !== 'draft' && b.status !== 'voided' && b.status !== 'fully_returned' && b.status !== 'cancelled' && (
                                  <>
                                    <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => openPurchaseReturn(b, "partial")}>
                                      {appLang==='en' ? 'Partial Return' : 'مرتجع جزئي'}
                                    </Button>
                                    <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => openPurchaseReturn(b, "full")}>
                                      {appLang==='en' ? 'Full Return' : 'مرتجع كامل'}
                                    </Button>
                                  </>
                                )}
                                {permDelete && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700 bg-transparent"
                                    onClick={() => requestDelete(b.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
          <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
            <DialogContent dir={appLang==='en' ? 'ltr' : 'rtl'} className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{appLang==='en' ? (returnMode==='full' ? 'Full Purchase Return' : 'Partial Purchase Return') : (returnMode==='full' ? 'مرتجع مشتريات كامل' : 'مرتجع مشتريات جزئي')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm">
                  <p>{appLang==='en' ? 'Bill' : 'الفاتورة'}: <span className="font-semibold">{returnBillNumber}</span></p>
                </div>

                {/* Items table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-600 dark:text-gray-300 border-b dark:border-slate-700">
                        <th className="p-2 text-right">{appLang==='en' ? 'Product' : 'المنتج'}</th>
                        <th className="p-2 text-right">{appLang==='en' ? 'Available' : 'المتاح'}</th>
                        <th className="p-2 text-right">{appLang==='en' ? 'Return Qty' : 'كمية المرتجع'}</th>
                        <th className="p-2 text-right">{appLang==='en' ? 'Unit Price' : 'سعر الوحدة'}</th>
                        <th className="p-2 text-right">{appLang==='en' ? 'Total' : 'الإجمالي'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {returnItems.map((it, idx) => (
                        <tr key={it.id} className="border-b">
                          <td className="p-2">{it.name || it.product_id}</td>
                          <td className="p-2 text-center">{it.maxQty}</td>
                          <td className="p-2">
                            <Input
                              type="number"
                              min={0}
                              max={it.maxQty}
                              value={it.qtyToReturn}
                              disabled={returnMode==='full'}
                              className="w-20"
                              onChange={(e) => {
                                const v = Math.max(0, Math.min(Number(e.target.value || 0), it.maxQty))
                                setReturnItems((prev) => prev.map((r, i) => i===idx ? { ...r, qtyToReturn: v } : r))
                              }}
                            />
                          </td>
                          <td className="p-2 text-right">{it.unit_price.toFixed(2)}</td>
                          <td className="p-2 text-right font-medium">{(it.qtyToReturn * it.unit_price).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Return total */}
                <div className="flex justify-end">
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded text-lg font-semibold">
                    {appLang==='en' ? 'Return Total' : 'إجمالي المرتجع'}: {returnTotal.toFixed(2)} {returnCurrency}
                  </div>
                </div>

                {/* Currency and Method selection */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{appLang==='en' ? 'Currency' : 'العملة'}</Label>
                    <Select value={returnCurrency} onValueChange={setReturnCurrency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {currencies.length > 0 ? (
                          currencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)
                        ) : (
                          <>
                            <SelectItem value="EGP">EGP</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                            <SelectItem value="SAR">SAR</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{appLang==='en' ? 'Refund Method' : 'طريقة الاسترداد'}</Label>
                    <Select value={returnMethod} onValueChange={(v: 'cash' | 'bank' | 'credit') => setReturnMethod(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">{appLang==='en' ? 'Cash Refund' : 'استرداد نقدي'}</SelectItem>
                        <SelectItem value="bank">{appLang==='en' ? 'Bank Refund' : 'استرداد بنكي'}</SelectItem>
                        <SelectItem value="credit">{appLang==='en' ? 'Credit to Supplier Account' : 'رصيد على حساب المورد'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {returnMethod !== 'credit' && (
                    <div className="space-y-2">
                      <Label>{appLang==='en' ? 'Refund Account' : 'حساب الاسترداد'}</Label>
                      <Select value={returnAccountId} onValueChange={setReturnAccountId}>
                        <SelectTrigger><SelectValue placeholder={appLang==='en' ? 'Auto-select' : 'اختيار تلقائي'} /></SelectTrigger>
                        <SelectContent>
                          {returnAccounts.map(acc => (
                            <SelectItem key={acc.id} value={acc.id}>{acc.account_code || ''} {acc.account_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Exchange rate info */}
                {returnCurrency !== appCurrency && returnTotal > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-sm">
                    <div>{appLang==='en' ? 'Exchange Rate' : 'سعر الصرف'}: <strong>1 {returnCurrency} = {returnExRate.rate.toFixed(4)} {appCurrency}</strong> ({returnExRate.source})</div>
                    <div>{appLang==='en' ? 'Base Amount' : 'المبلغ الأساسي'}: <strong>{(returnTotal * returnExRate.rate).toFixed(2)} {appCurrency}</strong></div>
                  </div>
                )}

                {/* Info about refund method */}
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded text-sm text-yellow-800 dark:text-yellow-200">
                  {returnMethod === 'cash' && (appLang==='en' ? '💰 Cash will be returned to the cash account' : '💰 سيتم إرجاع المبلغ إلى حساب النقد')}
                  {returnMethod === 'bank' && (appLang==='en' ? '🏦 Amount will be returned to the bank account' : '🏦 سيتم إرجاع المبلغ إلى الحساب البنكي')}
                  {returnMethod === 'credit' && (appLang==='en' ? '📝 Amount will reduce your payable to the supplier' : '📝 سيتم تخفيض المبلغ المستحق للمورد')}
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setReturnOpen(false)} disabled={returnProcessing}>
                  {appLang==='en' ? 'Cancel' : 'إلغاء'}
                </Button>
                <Button
                  onClick={submitPurchaseReturn}
                  disabled={returnProcessing || returnTotal <= 0}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {returnProcessing ? '...' : (appLang==='en' ? 'Process Return' : 'تنفيذ المرتجع')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </div>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent dir={appLang==='en' ? 'ltr' : 'rtl'}>
        <AlertDialogHeader>
          <AlertDialogTitle>{appLang==='en' ? 'Confirm Delete' : 'تأكيد الحذف'}</AlertDialogTitle>
          <AlertDialogDescription>
            {appLang==='en' ? 'Are you sure you want to delete this bill? This action cannot be undone.' : 'هل أنت متأكد من حذف هذه الفاتورة؟ لا يمكن التراجع عن هذا الإجراء.'}
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
    </>
  )
}

"use client"

import { useEffect, useState, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { useRouter } from "next/navigation"
import { Trash2, Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
import { getActiveCompanyId } from "@/lib/company"
import { canReturnBill, getBillOperationError, billRequiresJournalEntries, calculatePurchaseReturnEffects } from "@/lib/validation"

type Supplier = { id: string; name: string; phone?: string | null }
type Bill = { id: string; bill_number: string; supplier_id: string; total_amount: number; status: string; branch_id?: string | null; cost_center_id?: string | null; warehouse_id?: string | null }
type BillItem = { id: string; product_id: string | null; quantity: number; unit_price: number; tax_rate: number; discount_percent: number; line_total: number; returned_quantity?: number; products?: { name: string; cost_price: number } }
type Product = { id: string; name: string; cost_price: number; item_type?: 'product' | 'service' }

type ItemRow = {
  bill_item_id: string | null
  product_id: string | null
  product_name: string
  quantity: number
  max_quantity: number
  unit_price: number
  tax_rate: number
  discount_percent: number
  line_total: number
}

export default function NewPurchaseReturnPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const { toast } = useToast()
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [billItems, setBillItems] = useState<BillItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)

  const [form, setForm] = useState({
    supplier_id: "",
    bill_id: "",
    return_number: "PRET-" + Math.floor(Math.random() * 100000),
    return_date: new Date().toISOString().slice(0, 10),
    settlement_method: "debit_note" as "cash" | "debit_note" | "bank_transfer",
    reason: "",
    notes: "",
    currency: "EGP"
  })

  const [items, setItems] = useState<ItemRow[]>([])
  const [saving, setSaving] = useState(false)

  // Multi-currency support
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [exchangeRate, setExchangeRate] = useState<{ rate: number; rateId: string | null; source: string }>({ rate: 1, rateId: null, source: 'same_currency' })
  const baseCurrency = typeof window !== 'undefined' ? localStorage.getItem('app_currency') || 'EGP' : 'EGP'
  const currencySymbols: Record<string, string> = { EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ' }

  useEffect(() => {
    ;(async () => {
      const loadedCompanyId = await getActiveCompanyId(supabase)
      if (!loadedCompanyId) return
      setCompanyId(loadedCompanyId)

      const [suppRes, billRes, prodRes] = await Promise.all([
        supabase.from("suppliers").select("id, name, phone").eq("company_id", loadedCompanyId),
        supabase.from("bills").select("id, bill_number, supplier_id, total_amount, status, branch_id, cost_center_id, warehouse_id").eq("company_id", loadedCompanyId).in("status", ["paid", "partially_paid", "sent", "received"]),
        supabase.from("products").select("id, name, cost_price").eq("company_id", loadedCompanyId)
      ])

      setSuppliers((suppRes.data || []) as Supplier[])
      setBills((billRes.data || []) as Bill[])
      setProducts((prodRes.data || []) as Product[])

      // Load currencies
      const curr = await getActiveCurrencies(supabase, loadedCompanyId)
      if (curr.length > 0) setCurrencies(curr)
      setForm(f => ({ ...f, currency: baseCurrency }))
    })()
  }, [supabase])

  // Update exchange rate when currency changes
  useEffect(() => {
    const updateRate = async () => {
      if (form.currency === baseCurrency) {
        setExchangeRate({ rate: 1, rateId: null, source: 'same_currency' })
      } else if (companyId) {
        const result = await getExchangeRate(supabase, form.currency, baseCurrency, undefined, companyId)
        setExchangeRate({ rate: result.rate, rateId: result.rateId || null, source: result.source })
      }
    }
    updateRate()
  }, [form.currency, companyId, baseCurrency])

  // Load bill items when bill is selected
  useEffect(() => {
    if (!form.bill_id) {
      setBillItems([])
      setItems([])
      return
    }
    ;(async () => {
      const { data } = await supabase
        .from("bill_items")
        .select("id, product_id, quantity, unit_price, tax_rate, discount_percent, line_total, returned_quantity, products(name, cost_price)")
        .eq("bill_id", form.bill_id)

      const billItemsData = (data || []) as any[]
      setBillItems(billItemsData)
      
      // Auto-populate return items
      setItems(billItemsData.map(item => ({
        bill_item_id: item.id,
        product_id: item.product_id,
        product_name: item.products?.name || "—",
        quantity: 0,
        max_quantity: Number(item.quantity) - Number(item.returned_quantity || 0),
        unit_price: Number(item.unit_price),
        tax_rate: Number(item.tax_rate || 0),
        discount_percent: Number(item.discount_percent || 0),
        line_total: 0
      })))
    })()
  }, [form.bill_id, supabase])

  const filteredBills = useMemo(() => 
    form.supplier_id ? bills.filter(b => b.supplier_id === form.supplier_id) : bills
  , [form.supplier_id, bills])

  const updateItem = (idx: number, patch: Partial<ItemRow>) => {
    setItems(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      const qty = Math.min(Number(next[idx].quantity || 0), next[idx].max_quantity)
      next[idx].quantity = qty
      const price = Number(next[idx].unit_price || 0)
      const disc = Number(next[idx].discount_percent || 0)
      const gross = qty * price
      const net = gross - (gross * disc / 100)
      next[idx].line_total = Number(net.toFixed(2))
      return next
    })
  }

  const subtotal = useMemo(() => items.reduce((sum, it) => sum + Number(it.line_total || 0), 0), [items])
  const taxAmount = useMemo(() => items.reduce((sum, it) => sum + (Number(it.line_total || 0) * Number(it.tax_rate || 0) / 100), 0), [items])
  const total = subtotal + taxAmount

  const addManualItem = () => {
    setItems(prev => [...prev, {
      bill_item_id: null,
      product_id: null,
      product_name: "",
      quantity: 1,
      max_quantity: 9999,
      unit_price: 0,
      tax_rate: 0,
      discount_percent: 0,
      line_total: 0
    }])
  }

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const saveReturn = async () => {
    try {
      setSaving(true)
      if (!companyId || !form.supplier_id || items.filter(i => i.quantity > 0).length === 0) {
        toastActionError(toast, "الحفظ", "المرتجع", appLang === 'en' ? "Please fill required fields" : "يرجى ملء الحقول المطلوبة")
        return
      }

      let billStatus: string | null = null
      let billPaidAmount = 0
      let billTotalAmount = 0
      if (form.bill_id) {
        // التحقق من حالة الفاتورة وجلب البيانات المالية
        const { data: billCheck } = await supabase
          .from("bills")
          .select("status, paid_amount, total_amount, returned_amount")
          .eq("id", form.bill_id)
          .single()

        billStatus = billCheck?.status || null
        billPaidAmount = Number(billCheck?.paid_amount || 0)
        billTotalAmount = Number(billCheck?.total_amount || 0)

        // 🔒 التحقق الموحد: هل يُسمح بالمرتجع لهذه الحالة؟
        if (!canReturnBill(billStatus)) {
          const error = getBillOperationError(billStatus, 'return', appLang as 'en' | 'ar')
          if (error) {
            toastActionError(toast, "الحفظ", "المرتجع", error.description)
          }
          return
        }

        // للفواتير المدفوعة فقط: التحقق من وجود قيود محاسبية أصلية
        if (billRequiresJournalEntries(billStatus)) {
          const { data: existingBillEntry } = await supabase
            .from("journal_entries")
            .select("id")
            .eq("reference_id", form.bill_id)
            .eq("reference_type", "bill")
            .single()

          if (!existingBillEntry) {
            toastActionError(toast, "الحفظ", "المرتجع", appLang === 'en' ? "Cannot return paid bill without journal entries." : "لا يمكن عمل مرتجع لفاتورة مدفوعة بدون قيود محاسبية.")
            return
          }
        }
      }

      const validItems = items.filter(i => i.quantity > 0)

      // Get accounts
      const { data: accounts } = await supabase.from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, sub_type")
        .eq("company_id", companyId)

      type AccountRow = { id: string; account_code: string | null; account_name: string; account_type: string; sub_type: string | null }
      const findAccount = (subType: string, fallbackName: string) =>
        (accounts as AccountRow[] | null)?.find((a: AccountRow) => a.sub_type === subType)?.id ||
        (accounts as AccountRow[] | null)?.find((a: AccountRow) => a.account_name?.includes(fallbackName))?.id

      const apAccount = findAccount("accounts_payable", "دائن")
      const purchaseAccount = findAccount("purchases", "مشتريات") || findAccount("expense", "مصروف")
      const inventoryAccount = findAccount("inventory", "مخزون")
      const vatAccount = findAccount("vat_input", "ضريب")

      // Calculate base amounts for multi-currency
      const finalBaseSubtotal = form.currency === baseCurrency ? subtotal : Math.round(subtotal * exchangeRate.rate * 10000) / 10000
      const finalBaseTax = form.currency === baseCurrency ? taxAmount : Math.round(taxAmount * exchangeRate.rate * 10000) / 10000
      const finalBaseTotal = form.currency === baseCurrency ? total : Math.round(total * exchangeRate.rate * 10000) / 10000

      let journalEntryId: string | null = null

      // ===== 📌 النمط المحاسبي الصارم للمرتجعات =====
      // مرتجع Received: حركة مخزون فقط + ❌ لا قيد + ❌ لا Supplier Debit Credit
      // مرتجع Paid/Partially Paid: حركة مخزون + ✅ قيد محاسبي عكسي + ✅ Supplier Debit Credit

      const needsJournalEntry = billStatus === 'paid' || billStatus === 'partially_paid'

      // Get bill branch/cost center/warehouse for the return
      const selectedBill = bills.find(b => b.id === form.bill_id)
      const billBranchId = selectedBill?.branch_id || null
      const billCostCenterId = selectedBill?.cost_center_id || null
      const billWarehouseId = selectedBill?.warehouse_id || null

      if (needsJournalEntry) {
        // قيد عكس المشتريات: Debit AP / Credit Purchases + VAT
        const { data: journalEntry } = await supabase.from("journal_entries").insert({
          company_id: companyId,
          reference_type: "purchase_return",
          reference_id: form.bill_id,
          entry_date: form.return_date,
          description: `مرتجع مشتريات رقم ${form.return_number}`,
          branch_id: billBranchId,
          cost_center_id: billCostCenterId,
          warehouse_id: billWarehouseId,
        }).select().single()

        if (!journalEntry) throw new Error("Failed to create journal entry")
        journalEntryId = journalEntry.id

        // Journal lines: Debit AP, Credit Purchases + VAT
        const journalLines = []
        if (apAccount) {
          journalLines.push({
            journal_entry_id: journalEntry.id, account_id: apAccount,
            debit_amount: finalBaseTotal, credit_amount: 0, description: "تخفيض ذمم دائنة",
            original_debit: total, original_credit: 0, original_currency: form.currency,
            exchange_rate_used: exchangeRate.rate, exchange_rate_id: exchangeRate.rateId, rate_source: exchangeRate.source,
            branch_id: billBranchId, cost_center_id: billCostCenterId,
          })
        }
        if (purchaseAccount) {
          journalLines.push({
            journal_entry_id: journalEntry.id, account_id: purchaseAccount,
            debit_amount: 0, credit_amount: finalBaseSubtotal, description: "مردودات مشتريات",
            original_debit: 0, original_credit: subtotal, original_currency: form.currency,
            exchange_rate_used: exchangeRate.rate, exchange_rate_id: exchangeRate.rateId, rate_source: exchangeRate.source,
            branch_id: billBranchId, cost_center_id: billCostCenterId,
          })
        }
        if (vatAccount && taxAmount > 0) {
          journalLines.push({
            journal_entry_id: journalEntry.id, account_id: vatAccount,
            debit_amount: 0, credit_amount: finalBaseTax, description: "تعديل ضريبة المشتريات",
            original_debit: 0, original_credit: taxAmount, original_currency: form.currency,
            exchange_rate_used: exchangeRate.rate, exchange_rate_id: exchangeRate.rateId, rate_source: exchangeRate.source,
            branch_id: billBranchId, cost_center_id: billCostCenterId,
          })
        }

        if (journalLines.length > 0) {
          await supabase.from("journal_entry_lines").insert(journalLines)
        }
        console.log(`✅ تم إنشاء قيد المرتجع للفاتورة المدفوعة ${form.return_number}`)
      } else {
        // مرتجع Received: لا قيد محاسبي
        console.log(`ℹ️ مرتجع على فاتورة مستلمة (received) - لا قيد محاسبي`)
      }

      // ===== إنشاء حركات المخزون (خصم الكميات) - لجميع الحالات =====
      for (const item of validItems) {
        if (item.product_id) {
          await supabase.from("inventory_transactions").insert({
            company_id: companyId,
            product_id: item.product_id,
            transaction_type: "purchase_return",
            quantity_change: -item.quantity, // سالب لأنه خروج من المخزون
            reference_id: journalEntryId || form.bill_id,
            journal_entry_id: journalEntryId,
            notes: `مرتجع مشتريات ${form.return_number}`,
            branch_id: billBranchId,
            cost_center_id: billCostCenterId,
            warehouse_id: billWarehouseId,
          })
        }
      }

      // Create purchase return record (with multi-currency)
      const { data: purchaseReturn } = await supabase.from("purchase_returns").insert({
        company_id: companyId,
        supplier_id: form.supplier_id,
        bill_id: form.bill_id || null,
        return_number: form.return_number,
        return_date: form.return_date,
        subtotal: finalBaseSubtotal,
        tax_amount: finalBaseTax,
        total_amount: finalBaseTotal,
        settlement_amount: form.settlement_method === "cash" ? finalBaseTotal : 0,
        settlement_method: form.settlement_method,
        status: "completed",
        reason: form.reason,
        notes: form.notes,
        journal_entry_id: journalEntryId,
        // Multi-currency fields
        original_currency: form.currency,
        original_subtotal: subtotal,
        original_tax_amount: taxAmount,
        original_total_amount: total,
        exchange_rate_used: exchangeRate.rate,
        exchange_rate_id: exchangeRate.rateId
      }).select().single()

      if (!purchaseReturn) throw new Error("Failed to create purchase return")

      // Create return items
      const returnItems = validItems.map(it => ({
        purchase_return_id: purchaseReturn.id,
        bill_item_id: it.bill_item_id,
        product_id: it.product_id,
        description: it.product_name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        tax_rate: it.tax_rate,
        discount_percent: it.discount_percent,
        line_total: it.line_total
      }))
      await supabase.from("purchase_return_items").insert(returnItems)

      // Update bill_items returned_quantity
      for (const item of validItems) {
        if (item.bill_item_id) {
          const billItem = billItems.find(bi => bi.id === item.bill_item_id)
          const newReturned = (Number((billItem as any)?.returned_quantity) || 0) + item.quantity
          await supabase.from("bill_items").update({ returned_quantity: newReturned }).eq("id", item.bill_item_id)
        }
      }

      // Update bill return_status and returned_amount
      let newReturnedAmount = 0
      if (form.bill_id) {
        const { data: currentBill } = await supabase.from("bills").select("returned_amount, total_amount").eq("id", form.bill_id).single()
        newReturnedAmount = Number(currentBill?.returned_amount || 0) + total
        const returnStatus = newReturnedAmount >= Number(currentBill?.total_amount || 0) ? "full" : "partial"
        await supabase.from("bills").update({ returned_amount: newReturnedAmount, return_status: returnStatus }).eq("id", form.bill_id)
      }

      // ===== 🔒 منطق Supplier Debit Credit وفقاً للمواصفات =====
      // ❌ لا رصيد مدين إلا إذا المرتجع > المتبقي للمورد
      // المتبقي للمورد = إجمالي الفاتورة - المدفوع - المرتجعات السابقة
      // Supplier Debit Credit = المرتجع - المتبقي (إذا كان موجب)
      if (form.settlement_method === "debit_note" && total > 0 && form.bill_id) {
        // المتبقي للمورد قبل هذا المرتجع
        const previousReturns = newReturnedAmount - total // المرتجعات السابقة
        const remainingPayable = billTotalAmount - billPaidAmount - previousReturns // المتبقي للمورد
        const excessReturn = total - remainingPayable // الفائض من المرتجع

        console.log("📊 Supplier Debit Credit Calculation:", {
          billPaidAmount,
          billTotalAmount,
          previousReturns,
          remainingPayable,
          returnTotal: total,
          excessReturn
        })

        // إنشاء Supplier Debit Credit فقط إذا المرتجع > المتبقي
        if (excessReturn > 0) {
          // المبلغ الذي يُضاف للرصيد المدين = الفائض
          const debitAmount = excessReturn

          await supabase.from("supplier_debit_credits").insert({
            company_id: companyId,
            supplier_id: form.supplier_id,
            purchase_return_id: purchaseReturn.id,
            debit_number: "SD-" + form.return_number,
            debit_date: form.return_date,
            amount: debitAmount,
            applied_amount: 0,
            status: "active",
            notes: `إشعار مدين للمرتجع ${form.return_number} (المرتجع ${total} > المتبقي ${remainingPayable})`,
            journal_entry_id: journalEntryId
          })
          console.log(`✅ Supplier Debit Credit created: ${debitAmount}`)
        } else {
          console.log("ℹ️ No Supplier Debit Credit needed: return amount <= remaining payable")
        }
      }

      toastActionSuccess(toast, "الإنشاء", "المرتجع")
      router.push("/purchase-returns")
    } catch (err) {
      console.error("Error saving return:", err)
      toastActionError(toast, "الحفظ", "المرتجع", String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">{appLang === 'en' ? 'New Purchase Return' : 'مرتجع مشتريات جديد'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>{appLang === 'en' ? 'Supplier' : 'المورد'}</Label>
                <select className="w-full border rounded px-2 py-2" value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value, bill_id: "" })}>
                  <option value="">{appLang === 'en' ? 'Select Supplier' : 'اختر المورد'}</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Bill (Optional)' : 'الفاتورة (اختياري)'}</Label>
                <select className="w-full border rounded px-2 py-2" value={form.bill_id} onChange={e => setForm({ ...form, bill_id: e.target.value })}>
                  <option value="">{appLang === 'en' ? 'Without Bill' : 'بدون فاتورة'}</option>
                  {filteredBills.map(b => <option key={b.id} value={b.id}>{b.bill_number}</option>)}
                </select>
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Return Number' : 'رقم المرتجع'}</Label>
                <Input value={form.return_number} onChange={e => setForm({ ...form, return_number: e.target.value })} />
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Date' : 'التاريخ'}</Label>
                <Input type="date" value={form.return_date} onChange={e => setForm({ ...form, return_date: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>{appLang === 'en' ? 'Settlement Method' : 'طريقة التسوية'}</Label>
                <select className="w-full border rounded px-2 py-2" value={form.settlement_method} onChange={e => setForm({ ...form, settlement_method: e.target.value as any })}>
                  <option value="debit_note">{appLang === 'en' ? 'Debit Note' : 'إشعار مدين'}</option>
                  <option value="cash">{appLang === 'en' ? 'Cash Refund' : 'استرداد نقدي'}</option>
                  <option value="bank_transfer">{appLang === 'en' ? 'Bank Transfer' : 'تحويل بنكي'}</option>
                </select>
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Currency' : 'العملة'}</Label>
                <select className="w-full border rounded px-2 py-2" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
                  {currencies.length > 0 ? (
                    currencies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)
                  ) : (
                    <>
                      <option value="EGP">EGP</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="SAR">SAR</option>
                    </>
                  )}
                </select>
              </div>
              <div className="md:col-span-2">
                <Label>{appLang === 'en' ? 'Reason' : 'السبب'}</Label>
                <Input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder={appLang === 'en' ? 'Return reason...' : 'سبب المرتجع...'} />
              </div>
            </div>

            {form.currency !== baseCurrency && total > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-sm">
                <div>{appLang === 'en' ? 'Exchange Rate' : 'سعر الصرف'}: <strong>1 {form.currency} = {exchangeRate.rate.toFixed(4)} {baseCurrency}</strong> ({exchangeRate.source})</div>
                <div>{appLang === 'en' ? 'Base Amount' : 'المبلغ الأساسي'}: <strong>{(total * exchangeRate.rate).toFixed(2)} {baseCurrency}</strong></div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-600 border-b">
                    <th className="text-right p-2">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                    <th className="text-right p-2">{appLang === 'en' ? 'Available' : 'المتاح'}</th>
                    <th className="text-right p-2">{appLang === 'en' ? 'Return Qty' : 'كمية المرتجع'}</th>
                    <th className="text-right p-2">{appLang === 'en' ? 'Price' : 'السعر'}</th>
                    <th className="text-right p-2">{appLang === 'en' ? 'Tax%' : 'الضريبة%'}</th>
                    <th className="text-right p-2">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="p-2">
                        {it.bill_item_id ? (
                          <span className="font-medium">{it.product_name}</span>
                        ) : (
                          <select className="w-full border rounded px-2 py-1" value={it.product_id || ""} onChange={e => {
                            const prod = products.find(p => p.id === e.target.value)
                            updateItem(idx, { product_id: e.target.value || null, product_name: prod?.name || "", unit_price: prod?.cost_price || 0 })
                          }}>
                            <option value="">—</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="p-2 text-center">{it.max_quantity}</td>
                      <td className="p-2"><Input type="number" min={0} max={it.max_quantity} value={it.quantity} onChange={e => updateItem(idx, { quantity: Number(e.target.value) })} className="w-20" /></td>
                      <td className="p-2">{it.unit_price.toFixed(2)}</td>
                      <td className="p-2">{it.tax_rate}%</td>
                      <td className="p-2 font-medium">{it.line_total.toFixed(2)}</td>
                      <td className="p-2">
                        {!it.bill_item_id && <Button variant="ghost" size="sm" onClick={() => removeItem(idx)}><Trash2 className="w-4 h-4" /></Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!form.bill_id && (
                <div className="mt-3"><Button variant="outline" onClick={addManualItem}><Plus className="w-4 h-4 mr-2" /> {appLang === 'en' ? 'Add Item' : 'إضافة بند'}</Button></div>
              )}
            </div>

            <div className="border-t pt-4">
              <div className="flex flex-col items-end gap-2 text-sm">
                <div>{appLang === 'en' ? 'Subtotal' : 'المجموع'}: {subtotal.toFixed(2)}</div>
                <div>{appLang === 'en' ? 'Tax' : 'الضريبة'}: {taxAmount.toFixed(2)}</div>
                <div className="text-lg font-bold">{appLang === 'en' ? 'Total' : 'الإجمالي'}: {total.toFixed(2)}</div>
              </div>
            </div>

            <div>
              <Label>{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => router.back()}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button onClick={saveReturn} disabled={saving || !form.supplier_id}>
                {saving ? (appLang === 'en' ? 'Saving...' : 'جاري الحفظ...') : (appLang === 'en' ? 'Save Return' : 'حفظ المرتجع')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}


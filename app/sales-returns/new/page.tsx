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
import { CustomerSearchSelect } from "@/components/CustomerSearchSelect"

type Customer = { id: string; name: string; phone?: string | null }
type Invoice = { id: string; invoice_number: string; customer_id: string; total_amount: number }
type InvoiceItem = { id: string; product_id: string | null; quantity: number; unit_price: number; tax_rate: number; discount_percent: number; line_total: number; products?: { name: string; cost_price: number } }
type Product = { id: string; name: string; selling_price: number; cost_price: number; item_type?: 'product' | 'service' }

type ItemRow = {
  invoice_item_id: string | null
  product_id: string | null
  product_name: string
  quantity: number
  max_quantity: number
  unit_price: number
  tax_rate: number
  discount_percent: number
  line_total: number
}

export default function NewSalesReturnPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const { toast } = useToast()
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  const [customers, setCustomers] = useState<Customer[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)

  const [form, setForm] = useState({
    customer_id: "",
    invoice_id: "",
    return_number: "RET-" + Math.floor(Math.random() * 100000),
    return_date: new Date().toISOString().slice(0, 10),
    refund_method: "credit_note" as "cash" | "credit_note" | "bank_transfer",
    reason: "",
    notes: "",
    currency: "EGP"
  })

  const [items, setItems] = useState<ItemRow[]>([])
  const [saving, setSaving] = useState(false)

  // Multi-currency support
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [exchangeRate, setExchangeRate] = useState<{ rate: number; rateId: string | null; source: string }>({ rate: 1, rateId: null, source: 'same_currency' })
  const [baseAmount, setBaseAmount] = useState<number>(0)
  const baseCurrency = typeof window !== 'undefined' ? localStorage.getItem('app_currency') || 'EGP' : 'EGP'
  const currencySymbols: Record<string, string> = { EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ' }

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
      const { getActiveCompanyId } = await import("@/lib/company")
      const loadedCompanyId = await getActiveCompanyId(supabase)
      if (!loadedCompanyId) return
      setCompanyId(loadedCompanyId)

      const [custRes, invRes, prodRes] = await Promise.all([
        supabase.from("customers").select("id, name, phone").eq("company_id", loadedCompanyId),
        supabase.from("invoices").select("id, invoice_number, customer_id, total_amount").eq("company_id", loadedCompanyId).in("status", ["paid", "partially_paid", "sent"]),
        supabase.from("products").select("id, name, selling_price, cost_price").eq("company_id", loadedCompanyId)
      ])

      setCustomers((custRes.data || []) as Customer[])
      setInvoices((invRes.data || []) as Invoice[])
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
        setBaseAmount(total)
      } else if (companyId) {
        const result = await getExchangeRate(supabase, form.currency, baseCurrency, undefined, companyId)
        setExchangeRate({ rate: result.rate, rateId: result.rateId || null, source: result.source })
        setBaseAmount(Math.round(total * result.rate * 10000) / 10000)
      }
    }
    updateRate()
  }, [form.currency, companyId, baseCurrency])

  // Load invoice items when invoice is selected
  useEffect(() => {
    if (!form.invoice_id) {
      setInvoiceItems([])
      setItems([])
      return
    }
    ;(async () => {
      const { data } = await supabase
        .from("invoice_items")
        .select("id, product_id, quantity, unit_price, tax_rate, discount_percent, line_total, returned_quantity, products(name, cost_price)")
        .eq("invoice_id", form.invoice_id)

      const invoiceItemsData = (data || []) as any[]
      setInvoiceItems(invoiceItemsData)
      
      // Auto-populate return items
      setItems(invoiceItemsData.map(item => ({
        invoice_item_id: item.id,
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
  }, [form.invoice_id, supabase])

  const filteredInvoices = useMemo(() => 
    form.customer_id ? invoices.filter(i => i.customer_id === form.customer_id) : invoices
  , [form.customer_id, invoices])

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
      invoice_item_id: null,
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
      if (!companyId || !form.customer_id || items.filter(i => i.quantity > 0).length === 0) {
        toastActionError(toast, "الحفظ", "المرتجع", appLang === 'en' ? "Please fill required fields" : "يرجى ملء الحقول المطلوبة")
        return
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

      const arAccount = findAccount("accounts_receivable", "مدين")
      const revenueAccount = findAccount("sales_revenue", "إيراد") || findAccount("revenue", "مبيعات")
      const inventoryAccount = findAccount("inventory", "مخزون")
      const cogsAccount = findAccount("cost_of_goods_sold", "تكلفة")
      const vatAccount = findAccount("vat_output", "ضريب")

      // Calculate base amounts for multi-currency
      const finalBaseSubtotal = form.currency === baseCurrency ? subtotal : Math.round(subtotal * exchangeRate.rate * 10000) / 10000
      const finalBaseTax = form.currency === baseCurrency ? taxAmount : Math.round(taxAmount * exchangeRate.rate * 10000) / 10000
      const finalBaseTotal = form.currency === baseCurrency ? total : Math.round(total * exchangeRate.rate * 10000) / 10000

      // Create journal entry for the return
      const { data: journalEntry } = await supabase.from("journal_entries").insert({
        company_id: companyId,
        reference_type: "sales_return",
        entry_date: form.return_date,
        description: `مرتجع مبيعات رقم ${form.return_number}`
      }).select().single()

      if (!journalEntry) throw new Error("Failed to create journal entry")

      // Journal lines: Debit Revenue, Credit AR (with multi-currency support)
      const journalLines = []
      if (revenueAccount) {
        journalLines.push({
          journal_entry_id: journalEntry.id, account_id: revenueAccount,
          debit_amount: finalBaseSubtotal, credit_amount: 0, description: "مردودات مبيعات",
          original_debit: subtotal, original_credit: 0, original_currency: form.currency,
          exchange_rate_used: exchangeRate.rate, exchange_rate_id: exchangeRate.rateId, rate_source: exchangeRate.source
        })
      }
      if (vatAccount && taxAmount > 0) {
        journalLines.push({
          journal_entry_id: journalEntry.id, account_id: vatAccount,
          debit_amount: finalBaseTax, credit_amount: 0, description: "تعديل ضريبة المبيعات",
          original_debit: taxAmount, original_credit: 0, original_currency: form.currency,
          exchange_rate_used: exchangeRate.rate, exchange_rate_id: exchangeRate.rateId, rate_source: exchangeRate.source
        })
      }
      if (arAccount) {
        journalLines.push({
          journal_entry_id: journalEntry.id, account_id: arAccount,
          debit_amount: 0, credit_amount: finalBaseTotal, description: "تخفيض ذمم مدينة",
          original_debit: 0, original_credit: total, original_currency: form.currency,
          exchange_rate_used: exchangeRate.rate, exchange_rate_id: exchangeRate.rateId, rate_source: exchangeRate.source
        })
      }

      await supabase.from("journal_entry_lines").insert(journalLines)

      // Create COGS reversal entry
      let totalCost = 0
      for (const item of validItems) {
        if (item.product_id) {
          const prod = products.find(p => p.id === item.product_id)
          totalCost += (prod?.cost_price || 0) * item.quantity
        }
      }

      if (totalCost > 0 && inventoryAccount && cogsAccount) {
        const { data: cogsEntry } = await supabase.from("journal_entries").insert({
          company_id: companyId,
          reference_type: "sales_return_cogs",
          entry_date: form.return_date,
          description: `عكس تكلفة مرتجع ${form.return_number}`
        }).select().single()

        if (cogsEntry) {
          await supabase.from("journal_entry_lines").insert([
            { journal_entry_id: cogsEntry.id, account_id: inventoryAccount, debit_amount: totalCost, credit_amount: 0, description: "إعادة للمخزون" },
            { journal_entry_id: cogsEntry.id, account_id: cogsAccount, debit_amount: 0, credit_amount: totalCost, description: "عكس تكلفة البضاعة" }
          ])

          // Create inventory transactions
          for (const item of validItems) {
            if (item.product_id) {
              await supabase.from("inventory_transactions").insert({
                company_id: companyId,
                product_id: item.product_id,
                transaction_type: "sale_return",
                quantity_change: item.quantity,
                reference_id: journalEntry.id,
                journal_entry_id: cogsEntry.id,
                notes: `مرتجع ${form.return_number}`
              })
            }
          }
        }
      }

      // Create sales return record (with multi-currency)
      const { data: salesReturn } = await supabase.from("sales_returns").insert({
        company_id: companyId,
        customer_id: form.customer_id,
        invoice_id: form.invoice_id || null,
        return_number: form.return_number,
        return_date: form.return_date,
        subtotal: finalBaseSubtotal,
        tax_amount: finalBaseTax,
        total_amount: finalBaseTotal,
        refund_amount: form.refund_method === "cash" ? finalBaseTotal : 0,
        refund_method: form.refund_method,
        status: "completed",
        reason: form.reason,
        notes: form.notes,
        journal_entry_id: journalEntry.id,
        // Multi-currency fields
        original_currency: form.currency,
        original_subtotal: subtotal,
        original_tax_amount: taxAmount,
        original_total_amount: total,
        exchange_rate_used: exchangeRate.rate,
        exchange_rate_id: exchangeRate.rateId
      }).select().single()

      if (!salesReturn) throw new Error("Failed to create sales return")

      // Create return items
      const returnItems = validItems.map(it => ({
        sales_return_id: salesReturn.id,
        invoice_item_id: it.invoice_item_id,
        product_id: it.product_id,
        description: it.product_name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        tax_rate: it.tax_rate,
        discount_percent: it.discount_percent,
        line_total: it.line_total
      }))
      await supabase.from("sales_return_items").insert(returnItems)

      // Update invoice_items returned_quantity
      for (const item of validItems) {
        if (item.invoice_item_id) {
          const invItem = invoiceItems.find(ii => ii.id === item.invoice_item_id)
          const newReturned = (Number((invItem as any)?.returned_quantity) || 0) + item.quantity
          await supabase.from("invoice_items").update({ returned_quantity: newReturned }).eq("id", item.invoice_item_id)
        }
      }

      // Update invoice return_status and returned_amount
      if (form.invoice_id) {
        const { data: currentInv } = await supabase.from("invoices").select("returned_amount, total_amount").eq("id", form.invoice_id).single()
        const newReturnedAmount = Number(currentInv?.returned_amount || 0) + total
        const returnStatus = newReturnedAmount >= Number(currentInv?.total_amount || 0) ? "full" : "partial"
        await supabase.from("invoices").update({ returned_amount: newReturnedAmount, return_status: returnStatus }).eq("id", form.invoice_id)
      }

      // Create customer credit if refund method is credit_note
      if (form.refund_method === "credit_note" && total > 0) {
        await supabase.from("customer_credits").insert({
          company_id: companyId,
          customer_id: form.customer_id,
          sales_return_id: salesReturn.id,
          credit_number: "CC-" + form.return_number,
          credit_date: form.return_date,
          amount: total,
          applied_amount: 0,
          status: "open",
          notes: `إشعار دائن للمرتجع ${form.return_number}`,
          journal_entry_id: journalEntry.id
        })
      }

      toastActionSuccess(toast, "الإنشاء", "المرتجع")
      router.push("/sales-returns")
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
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">{appLang === 'en' ? 'New Return' : 'مرتجع جديد'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>{appLang === 'en' ? 'Customer' : 'العميل'}</Label>
                <CustomerSearchSelect
                  customers={customers}
                  value={form.customer_id}
                  onValueChange={(v) => setForm({ ...form, customer_id: v, invoice_id: "" })}
                  placeholder={appLang === 'en' ? 'Select Customer' : 'اختر العميل'}
                  searchPlaceholder={appLang === 'en' ? 'Search by name or phone...' : 'ابحث بالاسم أو الهاتف...'}
                />
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Invoice (Optional)' : 'الفاتورة (اختياري)'}</Label>
                <select className="w-full border rounded px-2 py-2" value={form.invoice_id} onChange={e => setForm({ ...form, invoice_id: e.target.value })}>
                  <option value="">{appLang === 'en' ? 'Without Invoice' : 'بدون فاتورة'}</option>
                  {filteredInvoices.map(i => <option key={i.id} value={i.id}>{i.invoice_number}</option>)}
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
                <Label>{appLang === 'en' ? 'Refund Method' : 'طريقة الاسترداد'}</Label>
                <select className="w-full border rounded px-2 py-2" value={form.refund_method} onChange={e => setForm({ ...form, refund_method: e.target.value as any })}>
                  <option value="credit_note">{appLang === 'en' ? 'Credit Note' : 'إشعار دائن'}</option>
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
                        {it.invoice_item_id ? (
                          <span className="font-medium">{it.product_name}</span>
                        ) : (
                          <select className="w-full border rounded px-2 py-1" value={it.product_id || ""} onChange={e => {
                            const prod = products.find(p => p.id === e.target.value)
                            updateItem(idx, { product_id: e.target.value || null, product_name: prod?.name || "", unit_price: prod?.selling_price || 0 })
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
                        {!it.invoice_item_id && <Button variant="ghost" size="sm" onClick={() => removeItem(idx)}><Trash2 className="w-4 h-4" /></Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!form.invoice_id && (
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
              <Button onClick={saveReturn} disabled={saving || !form.customer_id}>
                {saving ? (appLang === 'en' ? 'Saving...' : 'جاري الحفظ...') : (appLang === 'en' ? 'Save Return' : 'حفظ المرتجع')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}


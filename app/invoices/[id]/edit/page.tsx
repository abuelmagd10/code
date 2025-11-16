"use client"

import type React from "react"

import { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { useParams, useRouter } from "next/navigation"
import { Trash2, Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"

interface Customer {
  id: string
  name: string
}

interface Product {
  id: string
  name: string
  unit_price: number
  sku: string
}

interface InvoiceItem {
  id?: string
  product_id: string
  quantity: number
  unit_price: number
  tax_rate: number
  discount_percent?: number
}

export default function EditInvoicePage() {
  const supabase = useSupabase()
  const router = useRouter()
  const params = useParams()
  const { toast } = useToast()
  const invoiceId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string)

  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const [taxInclusive, setTaxInclusive] = useState<boolean>(false)
  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(0)
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<"amount" | "percent">("amount")
  const [invoiceDiscountPosition, setInvoiceDiscountPosition] = useState<"before_tax" | "after_tax">("before_tax")
  const [shippingCharge, setShippingCharge] = useState<number>(0)
  const [shippingTaxRate, setShippingTaxRate] = useState<number>(0)
  const [adjustment, setAdjustment] = useState<number>(0)
  const [productTaxDefaults, setProductTaxDefaults] = useState<Record<string, string>>({})

  const [formData, setFormData] = useState({
    customer_id: "",
    invoice_date: new Date().toISOString().split("T")[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  })

  // Tax codes from localStorage (as defined in settings/taxes)
  const [taxCodes, setTaxCodes] = useState<{ id: string; name: string; rate: number; scope: string }[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem("tax_codes")
      const parsed = raw ? JSON.parse(raw) : []
      setTaxCodes(parsed)
    } catch {
      setTaxCodes([])
    }
  }, [])

  useEffect(() => {
    // Load product tax defaults
    try {
      const rawDefaults = localStorage.getItem("product_tax_defaults")
      const parsedDefaults = rawDefaults ? JSON.parse(rawDefaults) : {}
      setProductTaxDefaults(parsedDefaults)
    } catch {
      setProductTaxDefaults({})
    }
  }, [])

  useEffect(() => {
    loadInitial()
  }, [])

  const loadInitial = async () => {
    try {
      setIsLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!companyData) return

      const { data: customersData } = await supabase
        .from("customers")
        .select("id, name")
        .eq("company_id", companyData.id)

      const { data: productsData } = await supabase
        .from("products")
        .select("id, name, unit_price, sku")
        .eq("company_id", companyData.id)

      setCustomers(customersData || [])
      setProducts(productsData || [])

      // Load invoice & items
      const { data: invoice } = await supabase.from("invoices").select("*").eq("id", invoiceId).single()
      const { data: items } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", invoiceId)

      if (invoice) {
        setFormData({
          customer_id: invoice.customer_id,
          invoice_date: invoice.invoice_date?.slice(0, 10) || new Date().toISOString().split("T")[0],
          due_date: invoice.due_date?.slice(0, 10) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        })
        setTaxInclusive(!!invoice.tax_inclusive)
        setInvoiceDiscountType((invoice.discount_type as any) || "amount")
        setInvoiceDiscount(Number(invoice.discount_value || 0))
        setInvoiceDiscountPosition((invoice.discount_position as any) || "before_tax")
        setShippingCharge(Number(invoice.shipping || 0))
        setShippingTaxRate(Number(invoice.shipping_tax_rate || 0))
        setAdjustment(Number(invoice.adjustment || 0))
      }

      setInvoiceItems(
        (items || []).map((it: any) => ({
          id: it.id,
          product_id: it.product_id,
          quantity: Number(it.quantity || 0),
          unit_price: Number(it.unit_price || 0),
          tax_rate: Number(it.tax_rate || 0),
          discount_percent: Number(it.discount_percent || 0),
        }))
      )
    } catch (error) {
      console.error("Error loading invoice for edit:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const addInvoiceItem = () => {
    setInvoiceItems([
      ...invoiceItems,
      { product_id: "", quantity: 1, unit_price: 0, tax_rate: 0, discount_percent: 0 },
    ])
  }

  const removeInvoiceItem = (index: number) => {
    setInvoiceItems(invoiceItems.filter((_, i) => i !== index))
  }

  const updateInvoiceItem = (index: number, field: string, value: any) => {
    const newItems = [...invoiceItems]
    if (field === "product_id") {
      const product = products.find((p) => p.id === value)
      newItems[index].product_id = value
      newItems[index].unit_price = product?.unit_price || 0
      const defaultCodeId = productTaxDefaults[value]
      if (defaultCodeId) {
        const code = taxCodes.find((c) => c.id === defaultCodeId)
        if (code) newItems[index].tax_rate = Number(code.rate)
      }
    } else {
      ;(newItems[index] as any)[field] = value
    }
    setInvoiceItems(newItems)
  }

  const calculateTotals = () => {
    let subtotalNet = 0
    let totalTax = 0

    invoiceItems.forEach((item) => {
      const rateFactor = 1 + item.tax_rate / 100
      const discountFactor = 1 - (item.discount_percent ?? 0) / 100
      const base = item.quantity * item.unit_price * discountFactor
      if (taxInclusive) {
        const grossLine = base
        const netLine = grossLine / rateFactor
        const taxLine = grossLine - netLine
        subtotalNet += netLine
        totalTax += taxLine
      } else {
        const netLine = base
        const taxLine = netLine * (item.tax_rate / 100)
        subtotalNet += netLine
        totalTax += taxLine
      }
    })

    const discountValueBeforeTax =
      invoiceDiscountType === "percent"
        ? (subtotalNet * Math.max(0, invoiceDiscount)) / 100
        : Math.max(0, invoiceDiscount)

    const discountedSubtotalNet =
      invoiceDiscountPosition === "before_tax"
        ? Math.max(0, subtotalNet - discountValueBeforeTax)
        : subtotalNet

    let tax = totalTax
    if (invoiceDiscountPosition === "before_tax" && subtotalNet > 0) {
      const factor = discountedSubtotalNet / subtotalNet
      tax = totalTax * factor
    }

    const shippingTax = (shippingCharge || 0) * (shippingTaxRate / 100)
    tax += shippingTax

    let totalBeforeShipping = discountedSubtotalNet + (invoiceDiscountPosition === "after_tax" ? totalTax : 0)
    if (invoiceDiscountPosition === "after_tax") {
      const baseForAfterTax = subtotalNet + totalTax
      const discountAfterTax =
        invoiceDiscountType === "percent"
          ? (baseForAfterTax * Math.max(0, invoiceDiscount)) / 100
          : Math.max(0, invoiceDiscount)
      totalBeforeShipping = Math.max(0, baseForAfterTax - discountAfterTax)
    }

    const total =
      (invoiceDiscountPosition === "after_tax"
        ? totalBeforeShipping
        : discountedSubtotalNet + totalTax) +
      (shippingCharge || 0) +
      (adjustment || 0) +
      shippingTax -
      (invoiceDiscountPosition === "after_tax" ? (subtotalNet + totalTax - totalBeforeShipping) : 0)

    return { subtotal: discountedSubtotalNet, tax, total }
  }

  const totals = useMemo(() => calculateTotals(), [invoiceItems, taxInclusive, invoiceDiscount, invoiceDiscountType, invoiceDiscountPosition, shippingCharge, shippingTaxRate, adjustment])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.customer_id) {
      toast({ title: "بيانات غير مكتملة", description: "يرجى اختيار عميل", variant: "destructive" })
      return
    }
    if (invoiceItems.length === 0) {
      toast({ title: "بيانات غير مكتملة", description: "يرجى إضافة عناصر للفاتورة", variant: "destructive" })
      return
    }

    try {
      setIsSaving(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // حمّل بيانات الفاتورة والبنود الحالية قبل التعديل لأجل العكس الصحيح
      const { data: prevInvoice } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, subtotal, tax_amount, total_amount")
        .eq("id", invoiceId)
        .single()
      const { data: prevItems } = await supabase
        .from("invoice_items")
        .select("product_id, quantity")
        .eq("invoice_id", invoiceId)

      // Update invoice core fields and totals
      const updatePayload: any = {
        customer_id: formData.customer_id,
        invoice_date: formData.invoice_date,
        due_date: formData.due_date,
        subtotal: totals.subtotal,
        tax_amount: totals.tax,
        total_amount: totals.total,
      }
      const addIfPresent = (key: string, value: any) => {
        if (prevInvoice && Object.prototype.hasOwnProperty.call(prevInvoice, key)) updatePayload[key] = value
      }
      addIfPresent("discount_type", invoiceDiscountType)
      addIfPresent("discount_value", Math.max(0, invoiceDiscount || 0))
      addIfPresent("discount_position", invoiceDiscountPosition)
      addIfPresent("tax_inclusive", !!taxInclusive)
      addIfPresent("shipping", Math.max(0, shippingCharge || 0))
      addIfPresent("shipping_tax_rate", Math.max(0, shippingTaxRate || 0))
      addIfPresent("adjustment", adjustment || 0)
      const { error: invErr } = await supabase.from("invoices").update(updatePayload).eq("id", invoiceId)
      if (invErr) throw invErr

      // Replace invoice items: delete existing, then insert current
      const { error: delErr } = await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId)
      if (delErr) throw delErr

      const itemsToInsert = invoiceItems.map((item) => {
        const rateFactor = 1 + item.tax_rate / 100
        const discountFactor = 1 - (item.discount_percent ?? 0) / 100
        const base = item.quantity * item.unit_price * discountFactor
        const netLine = taxInclusive ? base / rateFactor : base
        return {
          invoice_id: invoiceId,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
          line_total: netLine,
        }
      })

      const { error: insErr } = await supabase.from("invoice_items").insert(itemsToInsert)
      if (insErr) throw insErr

      // مساعد: تحديد الحسابات اللازمة
      const findAccountIds = async () => {
        const { data: companyRow } = await supabase
          .from("companies")
          .select("id")
          .eq("user_id", user.id)
          .single()
        if (!companyRow) return null
        const { data: accounts } = await supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_type, account_name, sub_type, parent_id")
          .eq("company_id", companyRow.id)
        if (!accounts) return null
        // فلترة الحسابات الورقية فقط
        const parentIds = new Set((accounts || []).map((a: any) => a.parent_id).filter(Boolean))
        const leafAccounts = (accounts || []).filter((a: any) => !parentIds.has(a.id))
        const byCode = (code: string) => leafAccounts.find((a: any) => String(a.account_code || "").toUpperCase() === code)?.id
        const byType = (type: string) => leafAccounts.find((a: any) => String(a.account_type || "") === type)?.id
        const byNameIncludes = (name: string) => leafAccounts.find((a: any) => String(a.account_name || "").toLowerCase().includes(name.toLowerCase()))?.id
        const bySubType = (st: string) => leafAccounts.find((a: any) => String(a.sub_type || "").toLowerCase() === st.toLowerCase())?.id

        const ar =
          bySubType("accounts_receivable") ||
          byCode("AR") ||
          byNameIncludes("receivable") ||
          byNameIncludes("الحسابات المدينة") ||
          byCode("1100") ||
          byType("asset")
        const revenue =
          bySubType("revenue") ||
          byCode("REV") ||
          byNameIncludes("revenue") ||
          byNameIncludes("المبيعات") ||
          byCode("4000") ||
          byType("income")
        const vatPayable =
          bySubType("vat_output") ||
          byCode("VATOUT") ||
          byNameIncludes("vat") ||
          byNameIncludes("ضريبة") ||
          byType("liability")
        const inventory =
          bySubType("inventory") ||
          byCode("INV") ||
          byNameIncludes("inventory") ||
          byNameIncludes("المخزون") ||
          byCode("1200") ||
          byCode("1201") ||
          byCode("1202") ||
          byCode("1203") ||
          null
        const cogs =
          bySubType("cogs") ||
          byNameIncludes("cogs") ||
          byNameIncludes("تكلفة البضاعة المباعة") ||
          byCode("COGS") ||
          byCode("5000") ||
          byType("expense")
        return { companyId: companyRow.id, ar, revenue, vatPayable, inventory, cogs }
      }

      // عكس الترحيل السابق (قيود ومخزون) إن وُجد
      const reversePreviousPosting = async () => {
        const mapping = await findAccountIds()
        if (!mapping || !prevInvoice) return

        // تحقق من وجود قيد الفاتورة السابق
        const { data: exists } = await supabase
          .from("journal_entries")
          .select("id")
          .eq("company_id", mapping.companyId)
          .eq("reference_type", "invoice")
          .eq("reference_id", invoiceId)
          .limit(1)
        if (exists && exists.length > 0 && mapping.ar && mapping.revenue) {
          const { data: entry } = await supabase
            .from("journal_entries")
            .insert({
              company_id: mapping.companyId,
              reference_type: "invoice_reversal",
              reference_id: invoiceId,
              entry_date: formData.invoice_date,
              description: `عكس قيد الفاتورة ${prevInvoice.invoice_number}`,
            })
            .select()
            .single()
          if (entry?.id) {
            const lines: any[] = [
              { journal_entry_id: entry.id, account_id: mapping.ar, debit_amount: 0, credit_amount: Number(prevInvoice.total_amount || 0), description: "عكس مدين العملاء" },
              { journal_entry_id: entry.id, account_id: mapping.revenue, debit_amount: Number(prevInvoice.subtotal || 0), credit_amount: 0, description: "عكس الإيرادات" },
            ]
            if (mapping.vatPayable && Number(prevInvoice.tax_amount || 0) > 0) {
              lines.push({ journal_entry_id: entry.id, account_id: mapping.vatPayable, debit_amount: Number(prevInvoice.tax_amount || 0), credit_amount: 0, description: "عكس ضريبة مخرجات" })
            }
            await supabase.from("journal_entry_lines").insert(lines)
          }
        }

        // عكس COGS والمخزون بناءً على البنود السابقة
        if (mapping.inventory && mapping.cogs) {
          // إجمالي COGS السابق من تكاليف المنتجات
          const productIds = (prevItems || []).map((it: any) => it.product_id).filter(Boolean)
          let totalCOGS = 0
          if (productIds.length > 0) {
            const { data: costs } = await supabase
              .from("products")
              .select("id, cost_price")
              .in("id", productIds)
            const costMap = new Map<string, number>((costs || []).map((p: any) => [p.id, Number(p.cost_price || 0)]))
            totalCOGS = (prevItems || []).reduce((sum: number, it: any) => sum + Number(it.quantity || 0) * Number(costMap.get(it.product_id || "") || 0), 0)
          }
          if (totalCOGS > 0) {
            const { data: entry2 } = await supabase
              .from("journal_entries")
              .insert({
                company_id: mapping.companyId,
                reference_type: "invoice_cogs_reversal",
                reference_id: invoiceId,
                entry_date: formData.invoice_date,
                description: `عكس تكلفة المبيعات للفاتورة ${prevInvoice?.invoice_number}`,
              })
              .select()
              .single()
            if (entry2?.id) {
              await supabase.from("journal_entry_lines").insert([
                { journal_entry_id: entry2.id, account_id: mapping.inventory, debit_amount: totalCOGS, credit_amount: 0, description: "عودة للمخزون" },
                { journal_entry_id: entry2.id, account_id: mapping.cogs, debit_amount: 0, credit_amount: totalCOGS, description: "عكس تكلفة البضاعة المباعة" },
              ])
            }
          }

          // معاملات مخزون: عكس بيع سابق بزيادة الكميات
          const reversalInv = (prevItems || []).filter((it: any) => !!it.product_id).map((it: any) => ({
            company_id: mapping.companyId,
            product_id: it.product_id,
            transaction_type: "sale_reversal",
            quantity_change: Number(it.quantity || 0),
            reference_id: invoiceId,
            notes: `عكس بيع للفاتورة ${prevInvoice?.invoice_number}`,
          }))
          if (reversalInv.length > 0) {
            await supabase.from("inventory_transactions").insert(reversalInv)
            for (const it of (prevItems || [])) {
              if (!it?.product_id) continue
              const { data: prod } = await supabase
                .from("products")
                .select("id, quantity_on_hand")
                .eq("id", it.product_id)
                .single()
              if (prod) {
                const newQty = Number(prod.quantity_on_hand || 0) + Number(it.quantity || 0)
                await supabase
                  .from("products")
                  .update({ quantity_on_hand: newQty })
                  .eq("id", it.product_id)
              }
            }
          }
        }
      }

      // إعادة الترحيل وفق القيم الحالية (قيود ومخزون)
      const postInvoiceJournal = async () => {
        const mapping = await findAccountIds()
        if (!mapping || !mapping.ar || !mapping.revenue) return
        const { data: entry } = await supabase
          .from("journal_entries")
          .insert({
            company_id: mapping.companyId,
            reference_type: "invoice",
            reference_id: invoiceId,
            entry_date: formData.invoice_date,
            description: `فاتورة مبيعات ${prevInvoice?.invoice_number || ""}`,
          })
          .select()
          .single()
        if (entry?.id) {
          const lines: any[] = [
            { journal_entry_id: entry.id, account_id: mapping.ar, debit_amount: totals.total || 0, credit_amount: 0, description: "مدين العملاء" },
            { journal_entry_id: entry.id, account_id: mapping.revenue, debit_amount: 0, credit_amount: totals.subtotal || 0, description: "إيرادات" },
          ]
          if (mapping.vatPayable && totals.tax && totals.tax > 0) {
            lines.push({ journal_entry_id: entry.id, account_id: mapping.vatPayable, debit_amount: 0, credit_amount: totals.tax, description: "ضريبة مخرجات" })
          }
          await supabase.from("journal_entry_lines").insert(lines)
        }
      }

      const postCOGSJournalAndInventory = async () => {
        const mapping = await findAccountIds()
        if (!mapping || !mapping.inventory || !mapping.cogs) return
        // احسب COGS من البنود الحالية وأسعار التكلفة
        const productIds = invoiceItems.map((it) => it.product_id).filter(Boolean)
        let totalCOGS = 0
        if (productIds.length > 0) {
          const { data: costs } = await supabase
            .from("products")
            .select("id, cost_price")
            .in("id", productIds)
          const costMap = new Map<string, number>((costs || []).map((p: any) => [p.id, Number(p.cost_price || 0)]))
          totalCOGS = invoiceItems.reduce((sum: number, it: any) => sum + Number(it.quantity || 0) * Number(costMap.get(it.product_id || "") || 0), 0)
        }
        if (totalCOGS > 0) {
          const { data: entry } = await supabase
            .from("journal_entries")
            .insert({
              company_id: mapping.companyId,
              reference_type: "invoice_cogs",
              reference_id: invoiceId,
              entry_date: formData.invoice_date,
              description: `تكلفة مبيعات للفاتورة ${prevInvoice?.invoice_number || ""}`,
            })
            .select()
            .single()
          if (entry?.id) {
            await supabase.from("journal_entry_lines").insert([
              { journal_entry_id: entry.id, account_id: mapping.cogs, debit_amount: totalCOGS, credit_amount: 0, description: "تكلفة البضاعة المباعة" },
              { journal_entry_id: entry.id, account_id: mapping.inventory, debit_amount: 0, credit_amount: totalCOGS, description: "المخزون" },
            ])
          }
        }
        // معاملات مخزون: بيع (سالب الكميات)
        const invTx = invoiceItems.filter((it) => !!it.product_id).map((it) => ({
          company_id: mapping.companyId,
          product_id: it.product_id,
          transaction_type: "sale",
          quantity_change: -Number(it.quantity || 0),
          reference_id: invoiceId,
          notes: `بيع معدل للفاتورة ${prevInvoice?.invoice_number || ""}`,
        }))
        if (invTx.length > 0) {
          await supabase.from("inventory_transactions").insert(invTx)
        }
      }

      // نفّذ العكس ثم إعادة الترحيل
      await reversePreviousPosting()
      await postInvoiceJournal()
      await postCOGSJournalAndInventory()

      toastActionSuccess(toast, "التحديث", "الفاتورة")
      router.push(`/invoices/${invoiceId}`)
    } catch (error: any) {
      const serialized = typeof error === "object" ? JSON.stringify(error) : String(error)
      console.error("Error updating invoice:", serialized)
      const msg = (error && typeof error.message === "string" && error.message.length > 0) ? error.message : serialized
      if (String(msg).toLowerCase().includes("row") && String(msg).toLowerCase().includes("security")) {
        toastActionError(toast, "الحفظ", "الفاتورة", "تم رفض العملية بواسطة RLS. تأكد أن الشركة الخاصة بالفاتورة تابعة لحسابك أو لديك صلاحية العضو.")
      } else if (String(msg).toLowerCase().includes("foreign key") || String(msg).toLowerCase().includes("violat")) {
        toastActionError(toast, "الحفظ", "الفاتورة", "ارتباط غير صالح في عناصر الفاتورة (عميل/منتج).")
      } else {
        toastActionError(toast, "الحفظ", "الفاتورة", `خطأ في تعديل الفاتورة: ${msg || "غير معروف"}`)
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">تعديل فاتورة</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">تحديث بيانات وعناصر الفاتورة</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>بيانات الفاتورة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer">العميل</Label>
                    <select
                      id="customer"
                      value={formData.customer_id}
                      onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      required
                    >
                      <option value="">اختر عميل</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="invoice_date">تاريخ الفاتورة</Label>
                    <Input
                      id="invoice_date"
                      type="date"
                      value={formData.invoice_date}
                      onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="due_date">تاريخ الاستحقاق</Label>
                    <Input
                      id="due_date"
                      type="date"
                      value={formData.due_date}
                      onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>عناصر الفاتورة</CardTitle>
                  <Button type="button" variant="outline" size="sm" onClick={addInvoiceItem}>
                    <Plus className="w-4 h-4 mr-2" />
                    إضافة عنصر
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <input
                      id="taxInclusive"
                      type="checkbox"
                      checked={taxInclusive}
                      onChange={(e) => setTaxInclusive(e.target.checked)}
                    />
                    <Label htmlFor="taxInclusive">الأسعار شاملة الضريبة</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="invoiceDiscount">خصم الفاتورة</Label>
                    <Input
                      id="invoiceDiscount"
                      type="number"
                      step="0.01"
                      min={0}
                      value={invoiceDiscount}
                      onChange={(e) => setInvoiceDiscount(Number.parseFloat(e.target.value) || 0)}
                      className="w-32"
                    />
                    <select
                      value={invoiceDiscountType}
                      onChange={(e) => setInvoiceDiscountType(e.target.value === "percent" ? "percent" : "amount")}
                      className="px-3 py-2 border rounded-lg text-sm"
                    >
                      <option value="amount">قيمة</option>
                      <option value="percent">نسبة %</option>
                    </select>
                    <select
                      value={invoiceDiscountPosition}
                      onChange={(e) => setInvoiceDiscountPosition(e.target.value === "after_tax" ? "after_tax" : "before_tax")}
                      className="px-3 py-2 border rounded-lg text-sm"
                    >
                      <option value="before_tax">قبل الضريبة</option>
                      <option value="after_tax">بعد الضريبة</option>
                    </select>
                  </div>
                </div>
                {invoiceItems.length === 0 ? (
                  <p className="text-center py-8 text-gray-500">لم تضف أي عناصر حتى الآن</p>
                ) : (
                  <div className="space-y-4">
                    {invoiceItems.map((item, index) => {
                      const rateFactor = 1 + item.tax_rate / 100
                      const discountFactor = 1 - (item.discount_percent ?? 0) / 100
                      const base = item.quantity * item.unit_price * discountFactor
                      const lineTotal = taxInclusive ? base : base * rateFactor

                      return (
                        <div key={index} className="p-4 border rounded-lg space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                            <div>
                              <Label>المنتج</Label>
                              <select
                                value={item.product_id}
                                onChange={(e) => updateInvoiceItem(index, "product_id", e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                                required
                              >
                                <option value="">اختر منتج</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <Label>الكمية</Label>
                              <Input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updateInvoiceItem(index, "quantity", Number.parseInt(e.target.value))}
                                className="text-sm"
                              />
                            </div>

                            <div>
                              <Label>السعر</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={item.unit_price}
                                onChange={(e) => updateInvoiceItem(index, "unit_price", Number.parseFloat(e.target.value))}
                                className="text-sm"
                              />
                            </div>

                            <div>
                              <Label>الضريبة</Label>
                              <div className="grid grid-cols-2 gap-2">
                                <select
                                  className="w-full px-3 py-2 border rounded-lg text-sm"
                                  value={taxCodes.find((c) => c.rate === item.tax_rate)?.id ?? "custom"}
                                  onChange={(e) => {
                                    const selId = e.target.value
                                    if (selId === "custom") return
                                    const code = taxCodes.find((c) => c.id === selId)
                                    updateInvoiceItem(index, "tax_rate", code ? Number(code.rate) : 0)
                                  }}
                                >
                                  <option value="">اختر رمز</option>
                                  {taxCodes
                                    .filter((c) => c.scope === "sales" || c.scope === "both")
                                    .map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  <option value="custom">مخصص...</option>
                                </select>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.tax_rate}
                                  onChange={(e) => updateInvoiceItem(index, "tax_rate", Number.parseFloat(e.target.value))}
                                  className="text-sm"
                                />
                              </div>
                            </div>

                            <div>
                              <Label>خصم %</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                value={item.discount_percent ?? 0}
                                onChange={(e) => updateInvoiceItem(index, "discount_percent", Number.parseFloat(e.target.value) || 0)}
                                className="text-sm"
                              />
                            </div>

                            <div>
                              <Label>الإجمالي</Label>
                              <div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 text-sm font-semibold">
                                {lineTotal.toFixed(2)}
                              </div>
                            </div>
                          </div>

                          <Button type="button" variant="outline" size="sm" onClick={() => removeInvoiceItem(index)} className="text-red-600 hover:text-red-700">
                            <Trash2 className="w-4 h-4 mr-2" />
                            حذف
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3 max-w-xs mr-auto">
                  <div className="flex justify-between">
                    <span>المجموع الفرعي:</span>
                    <span className="font-semibold">{totals.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>الضريبة:</span>
                    <span className="font-semibold">{totals.tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>الشحن:</span>
                    <Input type="number" step="0.01" value={shippingCharge} onChange={(e) => setShippingCharge(Number.parseFloat(e.target.value) || 0)} className="w-24 h-8 text-sm" />
                  </div>
                  <div className="flex justify-between">
                    <span>ضريبة الشحن:</span>
                    <div className="flex items-center gap-2">
                      <select className="px-3 py-2 border rounded-lg text-sm" value={shippingTaxRate} onChange={(e) => setShippingTaxRate(Number.parseFloat(e.target.value) || 0)}>
                        <option value={0}>بدون</option>
                        {taxCodes
                          .filter((c) => c.scope === "sales" || c.scope === "both")
                          .map((c) => (
                            <option key={c.id} value={c.rate}>
                              {c.name} ({c.rate}%)
                            </option>
                          ))}
                      </select>
                      <Input type="number" step="0.01" value={shippingTaxRate} onChange={(e) => setShippingTaxRate(Number.parseFloat(e.target.value) || 0)} className="w-20 h-8 text-sm" />
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span>تسوية:</span>
                    <Input type="number" step="0.01" value={adjustment} onChange={(e) => setAdjustment(Number.parseFloat(e.target.value) || 0)} className="w-24 h-8 text-sm" />
                  </div>
                  <div className="border-t pt-3 flex justify-between text-lg">
                    <span>الإجمالي:</span>
                    <span className="font-bold text-blue-600">{totals.total.toFixed(2)}</span>
                  </div>
                  {invoiceItems.length > 0 && (
                    <div className="mt-3 border-t pt-3 space-y-1">
                      <span className="text-sm text-gray-600">ملخص الضريبة:</span>
                      {Object.entries(
                        invoiceItems.reduce<Record<string, number>>((acc, it) => {
                          const rateFactor = 1 + it.tax_rate / 100
                          const discountFactor = 1 - (it.discount_percent ?? 0) / 100
                          let tax = 0
                          if (taxInclusive) {
                            const gross = it.quantity * it.unit_price * discountFactor
                            const net = gross / rateFactor
                            tax = gross - net
                          } else {
                            const net = it.quantity * it.unit_price * discountFactor
                            tax = net * (it.tax_rate / 100)
                          }
                          const key = `${it.tax_rate}%`
                          acc[key] = (acc[key] ?? 0) + tax
                          return acc
                        }, {})
                      ).map(([label, amount]) => (
                        <div key={label} className="flex justify-between text-sm">
                          <span>{label}</span>
                          <span>{amount.toFixed(2)}</span>
                        </div>
                      ))}
                      {shippingTaxRate > 0 && (
                        <div className="flex justify-between text-sm">
                          <span>{`${shippingTaxRate}% (شحن)`}</span>
                          <span>{(((shippingCharge || 0) * shippingTaxRate) / 100).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button type="submit" disabled={isSaving}>{isSaving ? "جاري الحفظ..." : "حفظ التعديلات"}</Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>إلغاء</Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}


import { createClient } from "@/lib/supabase/server"
import { NextRequest } from "next/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import {
  apiSuccess,
  HTTP_STATUS,
  internalError,
  notFoundError,
  unauthorizedError,
} from "@/lib/api-error-handler"

// =====================================================
// 📌 CANONICAL INVOICE JOURNAL FIXER – MANDATORY SPECIFICATION
// =====================================================
// هذا النمط المحاسبي الصارم (ERP Professional):
//
// 1️⃣ Draft:    ❌ لا مخزون ❌ لا قيود
// 2️⃣ Sent:     ✅ خصم مخزون (sale) + ✅ قيد AR/Revenue
//              ❌ لا COGS (يُحسب لاحقاً عند الحاجة للتقارير)
// 3️⃣ Paid:     ✅ قيد سداد فقط (Cash/Bank vs AR)
//              ❌ لا حركات مخزون جديدة
// 4️⃣ مرتجع Sent:    ✅ استرجاع مخزون (sale_return)
//                   ❌ لا قيد محاسبي
// 5️⃣ مرتجع Paid:    ✅ استرجاع مخزون (sale_return)
//                   ✅ قيد sales_return (عكس AR/Revenue)
//                   ✅ Customer Credit إذا المدفوع > الصافي
//
// 📌 أي كود يخالف هذا النمط يُعد خطأ جسيم ويجب تعديله فورًا
// =====================================================

// دالة مساعدة للعثور على الحسابات
async function findAccountIds(supabase: any, companyId: string) {
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_type, account_name, sub_type, parent_id")
    .eq("company_id", companyId)

  if (!accounts) return null

  // فلترة الحسابات الورقية فقط
  const parentIds = new Set((accounts || []).map((a: any) => a.parent_id).filter(Boolean))
  const leafAccounts = (accounts || []).filter((a: any) => !parentIds.has(a.id))

  const byCode = (code: string) => leafAccounts.find((a: any) => String(a.account_code || "").toUpperCase() === code)?.id
  const bySubType = (st: string) => leafAccounts.find((a: any) => a.sub_type === st)?.id
  const byName = (name: string) => leafAccounts.find((a: any) => a.account_name?.includes(name))?.id

  return {
    companyId,
    ar: bySubType("accounts_receivable") || byCode("1200") || byName("العملاء") || byName("الذمم المدينة"),
    revenue: bySubType("sales_revenue") || byCode("4000") || byName("المبيعات") || byName("الإيراد"),
    inventory: bySubType("inventory") || byCode("1300") || byName("المخزون"),
    cogs: bySubType("cost_of_goods_sold") || byCode("5000") || byName("تكلفة المبيعات") || byName("تكلفة البضاعة"),
    vatPayable: bySubType("vat_payable") || byCode("2200") || byName("ضريبة") || byName("VAT"),
    vatReceivable: bySubType("vat_receivable") || byCode("2100") || byName("ضريبة مستردة") || byName("VAT input"),
    cash: bySubType("cash") || byCode("1000") || byName("الصندوق") || byName("النقد"),
    bank: bySubType("bank") || byCode("1100") || byName("البنك"),
    shippingAccount: bySubType("shipping_income") || byCode("4100") || byName("الشحن") || byName("التوصيل"),
    // حسابات المرتجعات المطلوبة
    salesReturns: bySubType("sales_returns") || byCode("4200") || byName("مردودات المبيعات") || byName("مردودات"),
    customerCredit: bySubType("customer_credit") || byCode("1250") || byName("رصيد دائن للعملاء") || byName("أرصدة دائنة عملاء"),
    ap: bySubType("accounts_payable") || byCode("2000") || byName("الموردين") || byName("الذمم الدائنة")
  }
}

// ===== 📌 النمط المحاسبي الصارم: لا COGS =====
// دالة calculateCOGS و createCOGSEntry محذوفة حسب المواصفات
// COGS يُحسب عند الحاجة من cost_price × quantity المباع

// دالة لإنشاء معاملات المخزون فقط
async function createInventoryTransactions(supabase: any, invoice: any, mapping: any) {
  // التحقق من عدم وجود معاملات مخزون سابقة
  const { data: existingTx } = await supabase
    .from("inventory_transactions")
    .select("id")
    .eq("reference_id", invoice.id)
    .eq("transaction_type", "sale")
    .limit(1)

  if (existingTx && existingTx.length > 0) return false

  const { data: invItems } = await supabase
    .from("invoice_items")
    .select("product_id, quantity, products(item_type)")
    .eq("invoice_id", invoice.id)

  const invTx = (invItems || [])
    .filter((it: any) => !!it.product_id && it.products?.item_type !== 'service')
    .map((it: any) => ({
      company_id: mapping.companyId,
      product_id: it.product_id,
      transaction_type: "sale",
      quantity_change: -Number(it.quantity || 0),
      reference_id: invoice.id,
      notes: `بيع ${invoice.invoice_number}`,
    }))

  if (invTx.length > 0) {
    await supabase.from("inventory_transactions").insert(invTx)
    return true
  }
  return false
}

// دالة لإنشاء قيد المبيعات والذمم المدينة
async function createSalesJournal(supabase: any, invoice: any, mapping: any) {
  if (!mapping.ar || !mapping.revenue) return false

  // التحقق من عدم وجود قيد سابق
  const { data: existing } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("company_id", mapping.companyId)
    .eq("reference_type", "invoice")
    .eq("reference_id", invoice.id)
    .limit(1)

  if (existing && existing.length > 0) return false

  const { data: entry, error: entryError } = await supabase
    .from("journal_entries")
    .insert({
      company_id: mapping.companyId,
      reference_type: "invoice",
      reference_id: invoice.id,
      entry_date: invoice.invoice_date,
      description: `فاتورة مبيعات ${invoice.invoice_number}`,
    })
    .select()
    .single()

  if (entryError || !entry) return false

  const lines: any[] = [
    {
      journal_entry_id: entry.id,
      account_id: mapping.ar,
      debit_amount: Number(invoice.total_amount || 0),
      credit_amount: 0,
      description: "الذمم المدينة",
    },
    {
      journal_entry_id: entry.id,
      account_id: mapping.revenue,
      debit_amount: 0,
      credit_amount: Number(invoice.subtotal || 0),
      description: "الإيرادات",
    },
  ]

  // إضافة الشحن
  if (Number(invoice.shipping || 0) > 0) {
    lines.push({
      journal_entry_id: entry.id,
      account_id: mapping.shippingAccount || mapping.revenue,
      debit_amount: 0,
      credit_amount: Number(invoice.shipping || 0),
      description: "إيراد الشحن",
    })
  }

  // إضافة الضريبة
  if (mapping.vatPayable && Number(invoice.tax_amount || 0) > 0) {
    lines.push({
      journal_entry_id: entry.id,
      account_id: mapping.vatPayable,
      debit_amount: 0,
      credit_amount: Number(invoice.tax_amount || 0),
      description: "ضريبة القيمة المضافة",
    })
  }

  await supabase.from("journal_entry_lines").insert(lines)
  return true
}

// دالة لإنشاء قيد الدفع
async function createPaymentJournal(supabase: any, invoice: any, mapping: any, paidAmount: number) {
  if (!mapping.ar || (!mapping.cash && !mapping.bank)) return false
  if (paidAmount <= 0) return false

  // التحقق من عدم وجود قيد دفع سابق بنفس المبلغ
  const { data: existingPayments } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("company_id", mapping.companyId)
    .eq("reference_type", "invoice_payment")
    .eq("reference_id", invoice.id)

  // إذا كان هناك قيود دفع، نتحقق من المبالغ
  if (existingPayments && existingPayments.length > 0) {
    // حساب إجمالي المدفوع من القيود
    let totalPaidFromJournals = 0
    for (const pe of existingPayments) {
      const { data: lines } = await supabase
        .from("journal_entry_lines")
        .select("credit_amount")
        .eq("journal_entry_id", pe.id)
        .gt("credit_amount", 0)
      totalPaidFromJournals += (lines || []).reduce((s: number, l: any) => s + Number(l.credit_amount || 0), 0)
    }
    // إذا كان المبلغ المدفوع يتطابق، لا نحتاج لإنشاء قيد جديد
    if (Math.abs(totalPaidFromJournals - paidAmount) < 0.01) return false
  }

  const { data: entry, error: entryError } = await supabase
    .from("journal_entries")
    .insert({
      company_id: mapping.companyId,
      reference_type: "invoice_payment",
      reference_id: invoice.id,
      entry_date: new Date().toISOString().slice(0, 10),
      description: `دفعة للفاتورة ${invoice.invoice_number}`,
    })
    .select()
    .single()

  if (entryError || !entry) return false

  await supabase.from("journal_entry_lines").insert([
    {
      journal_entry_id: entry.id,
      account_id: mapping.cash || mapping.bank,
      debit_amount: paidAmount,
      credit_amount: 0,
      description: "النقد/البنك",
    },
    {
      journal_entry_id: entry.id,
      account_id: mapping.ar,
      debit_amount: 0,
      credit_amount: paidAmount,
      description: "الذمم المدينة",
    },
  ])

  return true
}

// دالة حذف القيود الخاطئة للفاتورة المرسلة
// الفاتورة المرسلة يجب ألا يكون لها: invoice, invoice_payment, invoice_cogs
async function deleteWrongEntriesForSentInvoice(supabase: any, companyId: string, invoiceId: string) {
  const { data: wrongEntries } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("company_id", companyId)
    .eq("reference_id", invoiceId)
    .in("reference_type", ["invoice", "invoice_payment", "invoice_cogs", "sales_return", "purchase_return", "invoice_cogs_reversal", "customer_credit"])

  if (wrongEntries && wrongEntries.length > 0) {
    const entryIds = wrongEntries.map((e: any) => e.id)
    await supabase.from("journal_entry_lines").delete().in("journal_entry_id", entryIds)
    await supabase.from("journal_entries").delete().in("id", entryIds)
    return wrongEntries.length
  }
  return 0
}

// دالة لإنشاء قيد مرتجع المبيعات
async function createSalesReturnJournal(supabase: any, invoice: any, mapping: any) {
  // ⚠️ تحقق مهم: لا تنشئ قيد مرتجع إذا كانت الفاتورة مسودة
  if (invoice.status === 'draft') {
    console.log(`⚠️ Skipping sales return journal for draft invoice ${invoice.invoice_number}`)
    return false
  }

  // ⚠️ تحقق مهم: التأكد من وجود قيد محاسبي أصلي للفاتورة
  const { data: existingInvoiceEntry } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("reference_id", invoice.id)
    .eq("reference_type", "invoice")
    .single()

  if (!existingInvoiceEntry) {
    console.log(`⚠️ Skipping sales return journal - no original invoice entry for ${invoice.invoice_number}`)
    return false
  }

  // ⚠️ الحساب الدائن يعتمد على حالة الدفع:
  // - إذا الفاتورة غير مدفوعة → الذمم المدينة (ar) لإلغاء المستحق
  // - إذا الفاتورة مدفوعة → رصيد دائن للعميل (customerCredit)
  const isPaid = Number(invoice.paid_amount || 0) > 0
  const creditAccount = isPaid ? (mapping.customerCredit || mapping.ar) : mapping.ar

  if (!mapping.salesReturns || !creditAccount) return false

  // التحقق من عدم وجود قيد مرتجع سابق
  const { data: existingReturn } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("company_id", mapping.companyId)
    .eq("reference_type", "sales_return")
    .eq("reference_id", invoice.id)
    .single()

  if (existingReturn) return false

  const { data: returnEntry } = await supabase
    .from("journal_entries")
    .insert({
      company_id: mapping.companyId,
      reference_type: "sales_return",
      reference_id: invoice.id,
      entry_date: invoice.invoice_date,
      description: `مرتجع مبيعات ${invoice.invoice_number}`,
    })
    .select()
    .single()

  if (!returnEntry) return false

  const creditDescription = isPaid ? "رصيد دائن للعميل من المرتجع" : "إلغاء الذمم المدينة - مرتجع"
  const lines: any[] = [
    { journal_entry_id: returnEntry.id, account_id: mapping.salesReturns, debit_amount: Number(invoice.subtotal || 0), credit_amount: 0, description: "مردودات المبيعات" },
    { journal_entry_id: returnEntry.id, account_id: creditAccount, debit_amount: 0, credit_amount: Number(invoice.total_amount || 0), description: creditDescription },
  ]

  if (mapping.vatPayable && Number(invoice.tax_amount || 0) > 0) {
    lines.push({ journal_entry_id: returnEntry.id, account_id: mapping.vatPayable, debit_amount: Number(invoice.tax_amount || 0), credit_amount: 0, description: "عكس ضريبة المبيعات المستحقة" })
  }

  await supabase.from("journal_entry_lines").insert(lines)
  return true
}

// ===== 📌 النمط المحاسبي الصارم: لا COGS Reversal =====
// دالة createCOGSReversalEntry محذوفة حسب المواصفات
// لا قيد COGS في أي مرحلة، لذلك لا حاجة لعكسه

// دالة لإنشاء مستند مرتجع مبيعات منفصل
async function createSalesReturnDocument(supabase: any, invoice: any, mapping: any) {
  if (!invoice.customer_id) return false

  try {
    // التحقق من عدم وجود مستند مرتجع سابق
    const { data: existingReturn } = await supabase
      .from("sales_returns")
      .select("id")
      .eq("invoice_id", invoice.id)
      .single()

    if (existingReturn) return false

    const returnNumber = `SR-${Date.now().toString().slice(-8)}`
    const refundAmount = invoice.refund_amount || 0
    const returnStatus = invoice.total_amount === invoice.returned_amount ? "full" : "partial"
    
    const { data: salesReturn } = await supabase.from("sales_returns").insert({
      company_id: mapping.companyId,
      customer_id: invoice.customer_id,
      invoice_id: invoice.id,
      return_number: returnNumber,
      return_date: invoice.invoice_date,
      subtotal: Number(invoice.subtotal || 0),
      tax_amount: Number(invoice.tax_amount || 0),
      total_amount: Number(invoice.total_amount || 0),
      refund_amount: refundAmount,
      refund_method: refundAmount > 0 ? "credit_note" : "none",
      status: "completed",
      reason: returnStatus === "full" ? "مرتجع كامل" : "مرتجع جزئي",
      notes: `مرتجع للفاتورة ${invoice.invoice_number}`,
    }).select().single()

    if (!salesReturn) return false

    // إنشاء بنود المرتجع
    const { data: invoiceItems } = await supabase
      .from("invoice_items")
      .select("product_id, description, name, quantity, unit_price, tax_rate, discount_percent, line_total")
      .eq("invoice_id", invoice.id)

    if (invoiceItems && invoiceItems.length > 0) {
      const returnItemsData = invoiceItems.map((it: any) => ({
        sales_return_id: salesReturn.id,
        product_id: it.product_id,
        description: it.description || it.name,
        quantity: Number(it.quantity || 0),
        unit_price: Number(it.unit_price || 0),
        tax_rate: Number(it.tax_rate || 0),
        discount_percent: Number(it.discount_percent || 0),
        line_total: Number(it.line_total || (it.quantity * it.unit_price * (1 - (it.discount_percent || 0) / 100)))
      }))
      await supabase.from("sales_return_items").insert(returnItemsData)
    }

    // إنشاء رصيد دائن للعميل
    if (refundAmount > 0) {
      await supabase.from("customer_credits").insert({
        company_id: mapping.companyId,
        customer_id: invoice.customer_id,
        credit_number: `CR-${Date.now()}`,
        credit_date: invoice.invoice_date,
        amount: refundAmount,
        used_amount: 0,
        reference_type: "invoice_return",
        reference_id: invoice.id,
        status: "active",
        notes: `رصيد دائن من مرتجع الفاتورة ${invoice.invoice_number}`
      })
    }

    return true
  } catch (e) {
    console.log("Error creating sales return document:", e)
    return false
  }
}

// دالة لإنشاء قيد مرتجع المشتريات
async function createPurchaseReturnJournal(supabase: any, invoice: any, mapping: any) {
  if (!mapping.ap || !mapping.inventory) return false

  // التحقق من عدم وجود قيد مرتجع سابق
  const { data: existingReturn } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("company_id", mapping.companyId)
    .eq("reference_type", "purchase_return")
    .eq("reference_id", invoice.id)
    .single()

  if (existingReturn) return false

  const { data: returnEntry } = await supabase
    .from("journal_entries")
    .insert({
      company_id: mapping.companyId,
      reference_type: "purchase_return",
      reference_id: invoice.id,
      entry_date: invoice.invoice_date,
      description: `مرتجع مشتريات ${invoice.invoice_number}`,
    })
    .select()
    .single()

  if (!returnEntry) return false

  const lines: any[] = [
    { journal_entry_id: returnEntry.id, account_id: mapping.ap, debit_amount: Number(invoice.total_amount || 0), credit_amount: 0, description: "تقليل ذمم الموردين - مرتجع" },
    { journal_entry_id: returnEntry.id, account_id: mapping.inventory, debit_amount: 0, credit_amount: Number(invoice.subtotal || 0), description: "خروج مخزون - مرتجع مشتريات" },
  ]
  
  if (mapping.vatReceivable && Number(invoice.tax_amount || 0) > 0) {
    lines.push({ journal_entry_id: returnEntry.id, account_id: mapping.vatReceivable, debit_amount: 0, credit_amount: Number(invoice.tax_amount || 0), description: "عكس ضريبة المشتريات" })
  }
  
  await supabase.from("journal_entry_lines").insert(lines)
  return true
}

// دالة لإنشاء مستند مرتجع مشتريات منفصل
async function createPurchaseReturnDocument(supabase: any, invoice: any, mapping: any) {
  if (!invoice.supplier_id) return false

  try {
    // التحقق من عدم وجود مستند مرتجع سابق
    const { data: existingReturn } = await supabase
      .from("purchase_returns")
      .select("id")
      .eq("invoice_id", invoice.id)
      .single()

    if (existingReturn) return false

    const returnNumber = `PR-${Date.now().toString().slice(-8)}`
    const refundAmount = invoice.refund_amount || 0
    
    const { data: purchaseReturn } = await supabase.from("purchase_returns").insert({
      company_id: mapping.companyId,
      supplier_id: invoice.supplier_id,
      invoice_id: invoice.id,
      return_number: returnNumber,
      return_date: invoice.invoice_date,
      subtotal: Number(invoice.subtotal || 0),
      tax_amount: Number(invoice.tax_amount || 0),
      total_amount: Number(invoice.total_amount || 0),
      refund_amount: refundAmount,
      status: "completed",
      notes: `مرتجع مشتريات للفاتورة ${invoice.invoice_number}`,
    }).select().single()

    if (!purchaseReturn) return false

    // إنشاء بنود مرتجع المشتريات
    const { data: invoiceItems } = await supabase
      .from("invoice_items")
      .select("product_id, description, name, quantity, unit_price, tax_rate, line_total")
      .eq("invoice_id", invoice.id)

    if (invoiceItems && invoiceItems.length > 0) {
      const returnItemsData = invoiceItems.map((it: any) => ({
        purchase_return_id: purchaseReturn.id,
        product_id: it.product_id,
        description: it.description || it.name,
        quantity: Number(it.quantity || 0),
        unit_price: Number(it.unit_price || 0),
        tax_rate: Number(it.tax_rate || 0),
        line_total: Number(it.line_total || (it.quantity * it.unit_price))
      }))
      await supabase.from("purchase_return_items").insert(returnItemsData)
    }

    return true
  } catch (e) {
    console.log("Error creating purchase return document:", e)
    return false
  }
}

// دالة لإنشاء معاملات المخزون لمرتجع المبيعات
async function createSalesReturnInventoryTransactions(supabase: any, invoice: any, mapping: any) {
  try {
    const { data: invoiceItems } = await supabase
      .from("invoice_items")
      .select("product_id, quantity")
      .eq("invoice_id", invoice.id)

    if (!invoiceItems || invoiceItems.length === 0) return false

    // التحقق من عدم وجود معاملات سابقة
    const { data: existingTx } = await supabase
      .from("inventory_transactions")
      .select("id")
      .eq("company_id", mapping.companyId)
      .eq("reference_id", invoice.id)
      .eq("transaction_type", "sale_return")  // مطابق للنمط الأصلي

    if (existingTx && existingTx.length > 0) return false

    // إنشاء معاملات المخزون (إرجاع البضاعة إلى المخزون) - مطابق للنمط الأصلي
    const inventoryTransactions = invoiceItems.map((item: any) => ({
      company_id: mapping.companyId,
      product_id: item.product_id,
      transaction_type: "sale_return",  // مطابق للنمط الأصلي
      quantity_change: Number(item.quantity || 0), // موجب لأن البضاعة تعود إلى المخزون
      reference_id: invoice.id,
      notes: `مرتجع مبيعات للفاتورة ${invoice.invoice_number}`
    }))

    await supabase.from("inventory_transactions").insert(inventoryTransactions)
    return true
  } catch (e) {
    console.log("Error creating sales return inventory transactions:", e)
    return false
  }
}

// دالة لإنشاء معاملات المخزون لمرتجع المشتريات
async function createPurchaseReturnInventoryTransactions(supabase: any, invoice: any, mapping: any) {
  try {
    const { data: invoiceItems } = await supabase
      .from("invoice_items")
      .select("product_id, quantity")
      .eq("invoice_id", invoice.id)

    if (!invoiceItems || invoiceItems.length === 0) return false

    // التحقق من عدم وجود معاملات سابقة
    const { data: existingTx } = await supabase
      .from("inventory_transactions")
      .select("id")
      .eq("company_id", mapping.companyId)
      .eq("reference_id", invoice.id)
      .eq("transaction_type", "purchase_return")

    if (existingTx && existingTx.length > 0) return false

    // إنشاء معاملات المخزون
    const inventoryTransactions = invoiceItems.map((item: any) => ({
      company_id: mapping.companyId,
      product_id: item.product_id,
      transaction_type: "purchase_return",
      quantity_change: -Number(item.quantity || 0), // سالب لأن البضاعة تخرج من المخزون
      reference_id: invoice.id,
      notes: `مرتجع مشتريات للفاتورة ${invoice.invoice_number}`
    }))

    await supabase.from("inventory_transactions").insert(inventoryTransactions)
    return true
  } catch (e) {
    console.log("Error creating purchase return inventory transactions:", e)
    return false
  }
}

// دالة لإنشاء رصيد دائن للعميل
async function createCustomerCredit(supabase: any, invoice: any, mapping: any) {
  try {
    const customerCreditAmount = invoice.refund_amount || invoice.total_amount || 0
    
    if (customerCreditAmount <= 0 || !invoice.customer_id) {
      return false
    }

    // التحقق من عدم وجود رصيد سابق
    const { data: existingCredit } = await supabase
      .from("customer_credits")
      .select("id")
      .eq("company_id", mapping.companyId)
      .eq("reference_id", invoice.id)
      .eq("reference_type", "invoice_return")

    if (existingCredit && existingCredit.length > 0) {
      return false
    }

    // إنشاء رصيد دائن للعميل
    await supabase.from("customer_credits").insert({
      company_id: mapping.companyId,
      customer_id: invoice.customer_id,
      credit_number: `CR-${Date.now()}`,
      credit_date: invoice.invoice_date,
      amount: customerCreditAmount,
      used_amount: 0,
      reference_type: "invoice_return",
      reference_id: invoice.id,
      status: "active",
      notes: `رصيد دائن من مرتجع الفاتورة ${invoice.invoice_number}`
    })

    return true
  } catch (e) {
    console.log("Error creating customer credit:", e)
    return false
  }
}

// ===== POST: إصلاح الفواتير =====
export async function POST(request: NextRequest) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(request)
    if (error) return error

    if (!user || !companyId) {
      return unauthorizedError()
    }

    const supabase = await createClient()

    const body = await request.json().catch(() => ({}))
    const filterStatus = body.status || "all" // all, sent, paid, partially_paid

    const mapping = await findAccountIds(supabase, companyId)
    if (!mapping) {
      return notFoundError("الحسابات")
    }

    // جلب الفواتير حسب الفلتر - تشمل جميع الأنواع
    let query = supabase
      .from("invoices")
      .select("id, invoice_number, status, invoice_type, total_amount, subtotal, shipping, tax_amount, paid_amount, invoice_date, returned_amount, refund_amount, customer_id, bill_id, supplier_id")
      .eq("company_id", companyId)

    if (filterStatus !== "all") {
      // التحقق إذا كان الفلتر لنوع المرتجع
      if (filterStatus === "sales_return" || filterStatus === "purchase_return") {
        query = query.eq("invoice_type", filterStatus)
      } else {
        query = query.eq("status", filterStatus)
      }
    } else {
      // تضمين جميع أنواع الفواتير: العادية والمرتجعات
      query = query.or(`status.in.("sent","paid","partially_paid"),invoice_type.in.("sales_return","purchase_return")`)
    }

    const { data: invoices } = await query

    if (!invoices || invoices.length === 0) {
      return apiSuccess(
        {
          message: "لا توجد فواتير تحتاج إصلاح",
          results: {
            sent: { fixed: 0 },
            paid: { fixed: 0 },
            partially_paid: { fixed: 0 },
            sales_return: { fixed: 0 },
            purchase_return: { fixed: 0 },
          },
        },
        HTTP_STATUS.OK,
      )
    }

    // 📌 النمط المحاسبي الصارم: لا COGS
    const results = {
      sent: { fixed: 0, deletedEntries: 0, inventoryCreated: 0, invoices: [] as string[] },
      paid: { fixed: 0, salesCreated: 0, paymentCreated: 0, invoices: [] as string[] },
      partially_paid: { fixed: 0, salesCreated: 0, paymentCreated: 0, invoices: [] as string[] },
      sales_return: { fixed: 0, deletedEntries: 0, returnCreated: 0, customerCreditCreated: 0, salesReturnDocCreated: 0, inventoryAdjusted: 0, invoices: [] as string[] },
      purchase_return: { fixed: 0, deletedEntries: 0, returnCreated: 0, inventoryAdjusted: 0, apReduced: 0, purchaseReturnDocCreated: 0, invoices: [] as string[] }
    }

    for (const invoice of invoices) {
      if (invoice.status === "sent") {
        // ===== الفواتير المرسلة =====
        // 1. حذف القيود الخاطئة (invoice, invoice_payment, invoice_cogs)
        const deleted = await deleteWrongEntriesForSentInvoice(supabase, companyId, invoice.id)
        if (deleted > 0) results.sent.deletedEntries += deleted

        // 2. إنشاء معاملات المخزون فقط (بدون COGS للفواتير المرسلة)
        const inventoryCreated = await createInventoryTransactions(supabase, invoice, mapping)
        if (inventoryCreated) results.sent.inventoryCreated++

        if (deleted > 0 || inventoryCreated) {
          results.sent.fixed++
          results.sent.invoices.push(invoice.invoice_number)
        }

      } else if (invoice.status === "paid") {
        // ===== الفواتير المدفوعة بالكامل =====
        // 📌 النمط المحاسبي الصارم: لا COGS
        let fixed = false

        // 1. إنشاء قيد المبيعات والذمم
        if (await createSalesJournal(supabase, invoice, mapping)) {
          results.paid.salesCreated++
          fixed = true
        }

        // 📌 لا COGS - محذوف حسب المواصفات

        // 2. إنشاء معاملات المخزون
        if (await createInventoryTransactions(supabase, invoice, mapping)) {
          fixed = true
        }

        // 3. إنشاء قيد الدفع الكامل
        if (await createPaymentJournal(supabase, invoice, mapping, Number(invoice.total_amount || 0))) {
          results.paid.paymentCreated++
          fixed = true
        }

        if (fixed) {
          results.paid.fixed++
          results.paid.invoices.push(invoice.invoice_number)
        }

      } else if (invoice.status === "partially_paid") {
        // ===== الفواتير المدفوعة جزئياً =====
        // 📌 النمط المحاسبي الصارم: لا COGS
        let fixed = false

        // 1. إنشاء قيد المبيعات والذمم (بقيمة الفاتورة الكاملة)
        if (await createSalesJournal(supabase, invoice, mapping)) {
          results.partially_paid.salesCreated++
          fixed = true
        }

        // 📌 لا COGS - محذوف حسب المواصفات

        // 2. إنشاء معاملات المخزون
        if (await createInventoryTransactions(supabase, invoice, mapping)) {
          fixed = true
        }

        // 3. إنشاء قيد الدفع بالمبلغ المدفوع فقط
        const paidAmount = Number(invoice.paid_amount || 0)
        if (paidAmount > 0 && await createPaymentJournal(supabase, invoice, mapping, paidAmount)) {
          results.partially_paid.paymentCreated++
          fixed = true
        }

        if (fixed) {
          results.partially_paid.fixed++
          results.partially_paid.invoices.push(invoice.invoice_number)
        }

      } else if (invoice.invoice_type === "sales_return") {
        // ===== مرتجع المبيعات =====
        // 📌 النمط المحاسبي الصارم: لا COGS Reversal
        let fixed = false

        // 1. حذف القيود الخاطئة للمرتجع
        const deleted = await deleteWrongEntriesForSentInvoice(supabase, companyId, invoice.id)
        if (deleted > 0) results.sales_return.deletedEntries = (results.sales_return.deletedEntries || 0) + deleted

        // 2. إنشاء قيد مرتجع المبيعات
        if (await createSalesReturnJournal(supabase, invoice, mapping)) {
          results.sales_return.returnCreated++
          fixed = true
        }

        // 📌 لا COGS Reversal - محذوف حسب المواصفات

        // 3. إنشاء رصيد دائن للعميل
        if (await createCustomerCredit(supabase, invoice, mapping)) {
          results.sales_return.customerCreditCreated++
          fixed = true
        }

        // 5. إنشاء سجل مرتجع المبيعات
        if (await createSalesReturnDocument(supabase, invoice, mapping)) {
          results.sales_return.salesReturnDocCreated++
          fixed = true
        }

        // 6. إنشاء معاملات المخزون لمرتجع المبيعات
        if (await createSalesReturnInventoryTransactions(supabase, invoice, mapping)) {
          results.sales_return.inventoryAdjusted = (results.sales_return.inventoryAdjusted || 0) + 1
          fixed = true
        }

        if (fixed) {
          results.sales_return.fixed++
          results.sales_return.invoices.push(invoice.invoice_number)
        }

      } else if (invoice.invoice_type === "purchase_return") {
        // ===== مرتجع المشتريات =====
        let fixed = false

        // 1. حذف القيود الخاطئة للمرتجع
        const deleted = await deleteWrongEntriesForSentInvoice(supabase, companyId, invoice.id)
        if (deleted > 0) results.purchase_return.deletedEntries = (results.purchase_return.deletedEntries || 0) + deleted

        // 2. إنشاء قيد مرتجع المشتريات
        if (await createPurchaseReturnJournal(supabase, invoice, mapping)) {
          results.purchase_return.returnCreated++
          fixed = true
        }

        // 3. إنشاء سجل مرتجع المشتريات
        if (await createPurchaseReturnDocument(supabase, invoice, mapping)) {
          results.purchase_return.purchaseReturnDocCreated++
          fixed = true
        }

        // 4. إنشاء معاملات المخزون
        if (await createPurchaseReturnInventoryTransactions(supabase, invoice, mapping)) {
          results.purchase_return.inventoryAdjusted = (results.purchase_return.inventoryAdjusted || 0) + 1
          fixed = true
        }

        if (fixed) {
          results.purchase_return.fixed++
          results.purchase_return.invoices.push(invoice.invoice_number)
        }
      }
    }

    const totalFixed = results.sent.fixed + results.paid.fixed + results.partially_paid.fixed + results.sales_return.fixed + results.purchase_return.fixed

    return apiSuccess(
      {
        message: `تم إصلاح ${totalFixed} فاتورة`,
        results,
      },
      HTTP_STATUS.OK,
    )
  } catch (error: any) {
    console.error("Error fixing invoice journals:", error)
    return internalError(error, "خطأ في الإصلاح")
  }
}

// ===== GET: فحص حالة الفواتير الشامل (يشمل المرتجعات) =====
export async function GET(request: NextRequest) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(request)
    if (error) return error

    if (!user || !companyId) {
      return unauthorizedError()
    }

    const supabase = await createClient()

    // جلب جميع الفواتير (العادية والمرتجعات)
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, status, invoice_type, total_amount, paid_amount, invoice_date, returned_amount, refund_amount")
      .eq("company_id", companyId)
      .or(`status.in.("sent","paid","partially_paid"),invoice_type.in.("sales_return","purchase_return")`)

    if (!invoices || invoices.length === 0) {
      return apiSuccess(
        {
          summary: { sent: 0, paid: 0, partially_paid: 0, sales_return: 0, purchase_return: 0 },
          issues: { sent: [], paid: [], partially_paid: [], sales_return: [], purchase_return: [] },
          totalIssues: 0,
        },
        HTTP_STATUS.OK,
      )
    }

    const invoiceIds = invoices.map(inv => inv.id)

    // جلب جميع القيود المحاسبية
    const { data: allEntries } = await supabase
      .from("journal_entries")
      .select("id, reference_id, reference_type")
      .eq("company_id", companyId)
      .in("reference_id", invoiceIds)

    // جلب معاملات المخزون (جميع الأنواع)
    const { data: inventoryTx } = await supabase
      .from("inventory_transactions")
      .select("id, reference_id, transaction_type")
      .in("reference_id", invoiceIds)

    const summary = { sent: 0, paid: 0, partially_paid: 0, sales_return: 0, purchase_return: 0 }
    const issues: any = { sent: [], paid: [], partially_paid: [], sales_return: [], purchase_return: [] }

    // 📌 النمط المحاسبي الصارم: لا COGS في أي مرحلة
    for (const inv of invoices) {
      const invEntries = (allEntries || []).filter(e => e.reference_id === inv.id)
      const hasSalesEntry = invEntries.some(e => e.reference_type === "invoice")
      // 📌 COGS محذوف - لا نتحقق منه
      const hasPaymentEntry = invEntries.some(e => e.reference_type === "invoice_payment")
      const hasReturnEntry = invEntries.some(e => e.reference_type === "sales_return")
      const hasPurchaseReturnEntry = invEntries.some(e => e.reference_type === "purchase_return")

      const hasSaleInventory = (inventoryTx || []).some(t => t.reference_id === inv.id && t.transaction_type === "sale")
      const hasSalesReturnInventory = (inventoryTx || []).some(t => t.reference_id === inv.id && (t.transaction_type === "sale_return" || t.transaction_type === "sales_return"))
      const hasPurchaseReturnInventory = (inventoryTx || []).some(t => t.reference_id === inv.id && t.transaction_type === "purchase_return")

      const issuesList: string[] = []

      // التصنيف حسب نوع الفاتورة
      if (inv.invoice_type === "sales_return") {
        summary.sales_return++
        // 📌 مرتجع المبيعات: قيد مرتجع + معاملة مخزون (بدون COGS)
        if (!hasReturnEntry) issuesList.push("لا يوجد قيد مرتجع مبيعات")
        // 📌 لا نتحقق من COGS Reversal - محذوف حسب المواصفات
        if (!hasSalesReturnInventory) issuesList.push("لا يوجد إرجاع للمخزون")

        if (issuesList.length > 0) {
          issues.sales_return.push({
            id: inv.id,
            invoice_number: inv.invoice_number,
            total_amount: inv.total_amount,
            returned_amount: inv.returned_amount,
            issues: issuesList
          })
        }
      } else if (inv.invoice_type === "purchase_return") {
        summary.purchase_return++
        // مرتجع المشتريات: يجب أن يكون لها قيد مرتجع + معاملة مخزون
        if (!hasPurchaseReturnEntry) issuesList.push("لا يوجد قيد مرتجع مشتريات")
        if (!hasPurchaseReturnInventory) issuesList.push("لا يوجد خروج من المخزون")

        if (issuesList.length > 0) {
          issues.purchase_return.push({
            id: inv.id,
            invoice_number: inv.invoice_number,
            total_amount: inv.total_amount,
            issues: issuesList
          })
        }
      } else {
        // الفواتير العادية
        const status = inv.status as "sent" | "paid" | "partially_paid"
        if (summary[status] !== undefined) {
          summary[status]++
        }

        if (status === "sent") {
          // 📌 الفاتورة المرسلة: قيد AR/Revenue + معاملات مخزون (بدون COGS)
          if (!hasSalesEntry) issuesList.push("لا يوجد قيد AR/Revenue")
          if (hasPaymentEntry) issuesList.push("قيد دفع خاطئ")
          if (!hasSaleInventory) issuesList.push("لا يوجد خصم مخزون")
        } else if (status === "paid" || status === "partially_paid") {
          // 📌 الفاتورة المدفوعة: قيد AR/Revenue + قيد دفع + مخزون (بدون COGS)
          if (!hasSalesEntry) issuesList.push("لا يوجد قيد AR/Revenue")
          // 📌 لا نتحقق من COGS - محذوف حسب المواصفات
          if (!hasPaymentEntry) issuesList.push("لا يوجد قيد دفع")
          if (!hasSaleInventory) issuesList.push("لا يوجد خصم مخزون")
        }

        if (issuesList.length > 0 && issues[status]) {
          issues[status].push({
            id: inv.id,
            invoice_number: inv.invoice_number,
            total_amount: inv.total_amount,
            paid_amount: inv.paid_amount,
            issues: issuesList
          })
        }
      }
    }

    const totalIssues = issues.sent.length + issues.paid.length + issues.partially_paid.length +
                        issues.sales_return.length + issues.purchase_return.length

    return apiSuccess(
      {
        summary,
        issues,
        totalIssues,
        details: {
          sentWithWrongEntries: issues.sent.filter((i: any) => i.issues.some((is: string) => is.includes("خاطئ"))).length,
          sentMissingInventory: issues.sent.filter((i: any) => i.issues.includes("لا يوجد خصم مخزون")).length,
          paidMissingEntries: issues.paid.length,
          partiallyPaidMissingEntries: issues.partially_paid.length,
          salesReturnMissingEntries: issues.sales_return.length,
          purchaseReturnMissingEntries: issues.purchase_return.length,
        },
      },
      HTTP_STATUS.OK,
    )
  } catch (error: any) {
    console.error("Error checking invoice journals:", error)
    return internalError(error, "خطأ في الفحص")
  }
}


import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// =====================================================
// API إصلاح فاتورة معينة - المنطق المحدث
// يحذف القيود والحركات القديمة ثم يعيد إنشاءها بشكل صحيح
// حسب نوع الفاتورة وحالتها:
// - فواتير البيع: sent/paid/partially_paid
// - مرتجعات المبيعات: sales_return
// - فواتير الشراء: purchase/purchase_paid
// - مرتجعات المشتريات: purchase_return
// =====================================================

type ResultSummary = {
  invoice_number: string
  invoice_status: string
  invoice_type: string
  // الحذف
  deleted_journal_entries: number
  deleted_journal_lines: number
  deleted_inventory_transactions: number
  deleted_reversal_transactions: number
  // الإنشاء
  created_sales_entry: boolean
  created_cogs_entry: boolean
  created_payment_entry: boolean
  created_return_entry: boolean
  created_customer_credit_entry: boolean
  created_purchase_return_entry: boolean
  created_inventory_transactions: number
  // قيود إضافية
  created_cogs_reversal_entry: boolean
  // مستندات المرتجعات
  created_sales_return_document: boolean
  created_purchase_return_document: boolean
  created_customer_credit: boolean
  created_payment_refund_entry: boolean
  created_purchase_refund_entry: boolean
  // تحديث المنتجات
  updated_products: number
}

async function getCompanyId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("user_id", user.id)
    .single()
  return company?.id || null
}

function mapAccounts(accounts: any[]) {
  // فلترة الحسابات الورقية فقط
  const parentIds = new Set((accounts || []).map((a: any) => a.parent_id).filter(Boolean))
  const leafAccounts = (accounts || []).filter((a: any) => !parentIds.has(a.id))

  const byNameIncludes = (kw: string) => leafAccounts.find((a) => String(a.account_name || "").toLowerCase().includes(kw.toLowerCase()))?.id
  const byCode = (code: string) => leafAccounts.find((a) => String(a.account_code || "").toUpperCase() === code.toUpperCase())?.id
  const bySubType = (st: string) => leafAccounts.find((a) => String(a.sub_type || "").toLowerCase() === st.toLowerCase())?.id
  const byType = (t: string) => leafAccounts.find((a) => String(a.account_type || "").toLowerCase() === t.toLowerCase())?.id

  return {
    ar: bySubType("accounts_receivable") || bySubType("ar") || byCode("1200") || byNameIncludes("العملاء") || byNameIncludes("الذمم المدينة"),
    ap: bySubType("accounts_payable") || bySubType("ap") || byCode("2000") || byNameIncludes("الموردين") || byNameIncludes("الذمم الدائنة"),
    revenue: bySubType("sales_revenue") || bySubType("revenue") || byType("revenue") || byCode("4000") || byNameIncludes("المبيعات"),
    salesReturns: bySubType("sales_returns") || byCode("4100") || byNameIncludes("مردودات المبيعات") || byNameIncludes("مرتجعات المبيعات"),
    vatPayable: bySubType("vat_payable") || byCode("2200") || byNameIncludes("ضريبة") || byNameIncludes("vat"),
    vatReceivable: bySubType("vat_receivable") || byCode("1300") || byNameIncludes("ضريبة المشتريات") || byNameIncludes("vat"),
    cash: bySubType("cash") || byCode("1000") || byNameIncludes("الصندوق") || byNameIncludes("النقد"),
    bank: bySubType("bank") || byCode("1100") || byNameIncludes("البنك"),
    inventory: bySubType("inventory") || byCode("1300") || byNameIncludes("المخزون"),
    cogs: bySubType("cost_of_goods_sold") || bySubType("cogs") || byCode("5000") || byNameIncludes("تكلفة المبيعات") || byNameIncludes("تكلفة البضاعة"),
    shippingAccount: bySubType("shipping_income") || byCode("4100") || byNameIncludes("الشحن") || byNameIncludes("التوصيل"),
    customerCredit: bySubType("customer_credit") || byCode("1250") || byNameIncludes("رصيد دائن للعملاء") || byNameIncludes("رصيد العملاء")
  }
}

// حساب COGS للفاتورة
async function calculateCOGS(supabase: any, invoiceId: string) {
  const { data: invItems } = await supabase
    .from("invoice_items")
    .select("product_id, quantity, products(cost_price, item_type)")
    .eq("invoice_id", invoiceId)

  return (invItems || [])
    .filter((it: any) => it.products?.item_type !== 'service' && it.product_id)
    .reduce((sum: number, it: any) => {
      const cost = Number(it.products?.cost_price || 0)
      return sum + Number(it.quantity || 0) * cost
    }, 0)
}

async function handle(request: NextRequest) {
  try {
    const supabase = await createClient()
    const companyId = await getCompanyId(supabase)
    if (!companyId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    let invoice_number = ""
    if (request.method === "GET") {
      const params = request.nextUrl.searchParams
      invoice_number = String(params.get("invoice_number") || "").trim()
    } else {
      const body = await request.json().catch(() => ({}))
      invoice_number = String(body?.invoice_number || "").trim()
    }
    if (!invoice_number) return NextResponse.json({ error: "missing invoice_number" }, { status: 400 })

    // Debug logging
    console.log(`[Repair Invoice] Searching for invoice: ${invoice_number}, Company ID: ${companyId}`)

    // 1) جلب الفاتورة مع تحسين البحث
    let invoice = null;
    
    // محاولة البحث الدقيق أولاً
    const { data: exactInvoice } = await supabase
      .from("invoices")
      .select("id, invoice_number, status, subtotal, tax_amount, total_amount, shipping, paid_amount, invoice_date, invoice_type, returned_amount, refund_amount, customer_id, bill_id, supplier_id")
      .eq("company_id", companyId)
      .eq("invoice_number", invoice_number)
      .maybeSingle()
    
    if (exactInvoice) {
      invoice = exactInvoice;
    } else {
      // إذا لم يتم العثور عليها، نبحث عن فواتير مماثلة
      const { data: similarInvoices } = await supabase
        .from("invoices")
        .select("id, invoice_number, status, subtotal, tax_amount, total_amount, shipping, paid_amount, invoice_date, invoice_type, returned_amount, refund_amount, customer_id, bill_id, supplier_id")
        .eq("company_id", companyId)
        .or(`invoice_number.ilike.%${invoice_number}%,invoice_number.ilike.${invoice_number}%`)
        .limit(5)
      
      if (similarInvoices && similarInvoices.length > 0) {
        return NextResponse.json({ 
          error: `لم يتم العثور على الفاتورة ${invoice_number}`, 
          suggestions: similarInvoices.map(inv => ({
            invoice_number: inv.invoice_number,
            invoice_type: inv.invoice_type,
            status: inv.status,
            total_amount: inv.total_amount
          }))
        }, { status: 404 })
      }
      
      // البحث عن فواتير المرتجع إذا كان الرقم يحتوي على SR أو مؤشر مرتجع
      if (invoice_number.toLowerCase().includes('sr') || invoice_number.toLowerCase().includes('return')) {
        const { data: returnInvoices } = await supabase
          .from("invoices")
          .select("id, invoice_number, status, subtotal, tax_amount, total_amount, shipping, paid_amount, invoice_date, invoice_type, returned_amount, refund_amount, customer_id, bill_id, supplier_id")
          .eq("company_id", companyId)
          .eq("invoice_type", "sales_return")
          .or(`invoice_number.ilike.%${invoice_number.replace(/[^0-9]/g, '')}%`)
          .limit(5)
        
        if (returnInvoices && returnInvoices.length > 0) {
          return NextResponse.json({ 
            error: `لم يتم العثور على فاتورة المرتجع ${invoice_number}`, 
            suggestions: returnInvoices.map(inv => ({
              invoice_number: inv.invoice_number,
              invoice_type: inv.invoice_type,
              status: inv.status,
              total_amount: inv.total_amount
            }))
          }, { status: 404 })
        }
      }
    }

    if (!invoice) {
      return NextResponse.json({ error: `لم يتم العثور على الفاتورة ${invoice_number}` }, { status: 404 })
    }

    // 2) جلب الحسابات
    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type, sub_type, parent_id")
      .eq("company_id", companyId)
    const mapping = mapAccounts(accounts || [])

    const summary: ResultSummary = {
      invoice_number,
      invoice_status: invoice.status,
      invoice_type: invoice.invoice_type || 'sales',
      deleted_journal_entries: 0,
      deleted_journal_lines: 0,
      deleted_inventory_transactions: 0,
      deleted_reversal_transactions: 0,
      created_sales_entry: false,
      created_cogs_entry: false,
      created_payment_entry: false,
      created_return_entry: false,
      created_customer_credit_entry: false,
      created_purchase_return_entry: false,
      created_inventory_transactions: 0,
      created_cogs_reversal_entry: false,
      created_sales_return_document: false,
      created_purchase_return_document: false,
      created_customer_credit: false,
      created_payment_refund_entry: false,
      created_purchase_refund_entry: false,
      updated_products: 0,
    }

    // =====================================================
    // الخطوة 1: حذف جميع القيود المحاسبية المرتبطة بالفاتورة
    // =====================================================
    const { data: existingEntries } = await supabase
      .from("journal_entries")
      .select("id, reference_type")
      .eq("company_id", companyId)
      .eq("reference_id", invoice.id)

    // أيضاً البحث عن قيود عكس قديمة بنفس الوصف - لجميع أنواع الفواتير
    const { data: reversalEntries } = await supabase
      .from("journal_entries")
      .select("id, reference_type")
      .eq("company_id", companyId)
      .or(`reference_type.eq.invoice_reversal,reference_type.eq.invoice_cogs_reversal,reference_type.eq.invoice_payment_reversal,reference_type.eq.sales_return_reversal,reference_type.eq.purchase_return_reversal,reference_type.eq.purchase_reversal,reference_type.eq.purchase_payment_reversal`)
      .ilike("description", `%${invoice_number}%`)

    const allEntryIds = [
      ...(existingEntries || []).map(e => e.id),
      ...(reversalEntries || []).map(e => e.id)
    ]

    if (allEntryIds.length > 0) {
      // حذف سطور القيود أولاً
      const { count: linesDeleted } = await supabase
        .from("journal_entry_lines")
        .delete({ count: 'exact' })
        .in("journal_entry_id", allEntryIds)
      summary.deleted_journal_lines = linesDeleted || 0

      // حذف القيود
      const { count: entriesDeleted } = await supabase
        .from("journal_entries")
        .delete({ count: 'exact' })
        .in("id", allEntryIds)
      summary.deleted_journal_entries = entriesDeleted || 0
    }

    // =====================================================
    // الخطوة 2: حذف جميع معاملات المخزون المرتبطة بالفاتورة
    // =====================================================
    // حذف معاملات المخزون المرتبطة بالفاتورة (جميع الأنواع)
    const { data: existingSaleTx } = await supabase
      .from("inventory_transactions")
      .select("id, product_id, quantity_change, transaction_type")
      .eq("company_id", companyId)
      .eq("reference_id", invoice.id)

    // حذف معاملات العكس المرتبطة بالفاتورة (من المنطق القديم) - جميع الأنواع
    const { data: existingReversalTx } = await supabase
      .from("inventory_transactions")
      .select("id, product_id, quantity_change")
      .eq("company_id", companyId)
      .or(`transaction_type.eq.sale_reversal,transaction_type.eq.purchase_reversal,transaction_type.eq.sales_return_reversal,transaction_type.eq.purchase_return_reversal`)
      .ilike("notes", `%${invoice_number}%`)

    const saleIds = (existingSaleTx || []).map(t => t.id)
    const reversalIds = (existingReversalTx || []).map(t => t.id)
    const allTxIds = [...saleIds, ...reversalIds]

    if (allTxIds.length > 0) {
      const { count: txDeleted } = await supabase
        .from("inventory_transactions")
        .delete({ count: 'exact' })
        .in("id", allTxIds)
      summary.deleted_inventory_transactions = saleIds.length
      summary.deleted_reversal_transactions = reversalIds.length
    }

    // =====================================================
    // الخطوة 3: إعادة إنشاء القيود حسب حالة الفاتورة
    // =====================================================
    // جلب بنود الفاتورة
    const { data: invoiceItems } = await supabase
      .from("invoice_items")
      .select("product_id, quantity, products(item_type, cost_price)")
      .eq("invoice_id", invoice.id)

    const productItems = (invoiceItems || []).filter((it: any) => it.product_id && it.products?.item_type !== 'service')

    // --- فاتورة البيع المرسلة (sent) ---
    if (invoice.invoice_type === "sales" && invoice.status === "sent") {
      // فقط معاملات المخزون - بدون قيود COGS أو مبيعات أو دفع
      if (productItems.length > 0) {
        const invTx = productItems.map((it: any) => ({
          company_id: companyId,
          product_id: it.product_id,
          transaction_type: "sale",
          quantity_change: -Number(it.quantity || 0),
          reference_id: invoice.id,
          notes: `بيع ${invoice_number}`,
        }))
        await supabase.from("inventory_transactions").insert(invTx)
        summary.created_inventory_transactions = invTx.length
      }
    }

    // --- فاتورة البيع المدفوعة أو المدفوعة جزئياً ---
    if (invoice.invoice_type === "sales" && (invoice.status === "paid" || invoice.status === "partially_paid")) {
      // 1. قيد المبيعات والذمم المدينة
      if (mapping.ar && mapping.revenue) {
        const { data: salesEntry } = await supabase
          .from("journal_entries")
          .insert({
            company_id: companyId,
            reference_type: "invoice",
            reference_id: invoice.id,
            entry_date: invoice.invoice_date,
            description: `فاتورة مبيعات ${invoice_number}`,
          })
          .select()
          .single()

        if (salesEntry) {
          const lines: any[] = [
            { journal_entry_id: salesEntry.id, account_id: mapping.ar, debit_amount: Number(invoice.total_amount || 0), credit_amount: 0, description: "الذمم المدينة" },
            { journal_entry_id: salesEntry.id, account_id: mapping.revenue, debit_amount: 0, credit_amount: Number(invoice.subtotal || 0), description: "الإيرادات" },
          ]
          if (Number(invoice.shipping || 0) > 0) {
            lines.push({ journal_entry_id: salesEntry.id, account_id: mapping.shippingAccount || mapping.revenue, debit_amount: 0, credit_amount: Number(invoice.shipping || 0), description: "إيراد الشحن" })
          }
          if (mapping.vatPayable && Number(invoice.tax_amount || 0) > 0) {
            lines.push({ journal_entry_id: salesEntry.id, account_id: mapping.vatPayable, debit_amount: 0, credit_amount: Number(invoice.tax_amount || 0), description: "ضريبة القيمة المضافة" })
          }
          await supabase.from("journal_entry_lines").insert(lines)
          summary.created_sales_entry = true
        }
      }

      // 2. قيد COGS ومعاملات المخزون
      const totalCOGS = await calculateCOGS(supabase, invoice.id)
      if (totalCOGS > 0 && mapping.cogs && mapping.inventory) {
        const { data: cogsEntry } = await supabase
          .from("journal_entries")
          .insert({
            company_id: companyId,
            reference_type: "invoice_cogs",
            reference_id: invoice.id,
            entry_date: invoice.invoice_date,
            description: `تكلفة مبيعات للفاتورة ${invoice_number}`,
          })
          .select()
          .single()

        if (cogsEntry) {
          await supabase.from("journal_entry_lines").insert([
            { journal_entry_id: cogsEntry.id, account_id: mapping.cogs, debit_amount: totalCOGS, credit_amount: 0, description: "تكلفة البضاعة المباعة" },
            { journal_entry_id: cogsEntry.id, account_id: mapping.inventory, debit_amount: 0, credit_amount: totalCOGS, description: "المخزون" },
          ])
          summary.created_cogs_entry = true
        }
      }

      // 3. معاملات المخزون
      if (productItems.length > 0) {
        const invTx = productItems.map((it: any) => ({
          company_id: companyId,
          product_id: it.product_id,
          transaction_type: "sale",
          quantity_change: -Number(it.quantity || 0),
          reference_id: invoice.id,
          notes: `بيع ${invoice_number}`,
        }))
        await supabase.from("inventory_transactions").insert(invTx)
        summary.created_inventory_transactions = invTx.length
      }

      // 4. قيد الدفع
      const paidAmount = invoice.status === "paid"
        ? Number(invoice.total_amount || 0)
        : Number(invoice.paid_amount || 0)

      if (paidAmount > 0 && mapping.ar && (mapping.cash || mapping.bank)) {
        const { data: paymentEntry } = await supabase
          .from("journal_entries")
          .insert({
            company_id: companyId,
            reference_type: "invoice_payment",
            reference_id: invoice.id,
            entry_date: new Date().toISOString().slice(0, 10),
            description: `دفعة للفاتورة ${invoice_number}`,
          })
          .select()
          .single()

        if (paymentEntry) {
          await supabase.from("journal_entry_lines").insert([
            { journal_entry_id: paymentEntry.id, account_id: mapping.cash || mapping.bank, debit_amount: paidAmount, credit_amount: 0, description: "النقد/البنك" },
            { journal_entry_id: paymentEntry.id, account_id: mapping.ar, debit_amount: 0, credit_amount: paidAmount, description: "الذمم المدينة" },
          ])
          summary.created_payment_entry = true
        }
      }
    }

    // --- مرتجع المبيعات (sales_return) ---
    if (invoice.invoice_type === "sales_return") {
      // 1. تحديث حالة الفاتورة الأصلية
      const returnStatus = invoice.total_amount === invoice.returned_amount ? "full" : "partial"
      let newStatus = "sent"
      if (invoice.total_amount === invoice.returned_amount) newStatus = "fully_returned"
      else if (returnStatus === "partial") newStatus = "partially_returned"
      
      await supabase
        .from("invoices")
        .update({
          returned_amount: invoice.returned_amount || 0,
          return_status: returnStatus,
          status: newStatus,
          paid_amount: Math.max(0, (invoice.paid_amount || 0) - (invoice.refund_amount || 0))
        })
        .eq("id", invoice.id)

      // 2. قيد مرتجع المبيعات: مدين مردودات المبيعات + عكس ضريبة، دائن رصيد دائن للعميل
      let returnEntryId = null
      if (mapping.salesReturns && mapping.customerCredit) {
        const { data: returnEntry } = await supabase
          .from("journal_entries")
          .insert({
            company_id: companyId,
            reference_type: "sales_return",
            reference_id: invoice.id,
            entry_date: invoice.invoice_date,
            description: `مرتجع مبيعات ${invoice_number}`,
          })
          .select()
          .single()

        if (returnEntry) {
          returnEntryId = returnEntry.id
          const lines: any[] = [
            { journal_entry_id: returnEntry.id, account_id: mapping.salesReturns, debit_amount: Number(invoice.subtotal || 0), credit_amount: 0, description: "مردودات المبيعات" },
            { journal_entry_id: returnEntry.id, account_id: mapping.customerCredit, debit_amount: 0, credit_amount: Number(invoice.total_amount || 0), description: "رصيد دائن للعميل من المرتجع" },
          ]
          if (mapping.vatPayable && Number(invoice.tax_amount || 0) > 0) {
            lines.push({ journal_entry_id: returnEntry.id, account_id: mapping.vatPayable, debit_amount: Number(invoice.tax_amount || 0), credit_amount: 0, description: "عكس ضريبة المبيعات المستحقة" })
          }
          await supabase.from("journal_entry_lines").insert(lines)
          summary.created_return_entry = true
          summary.created_customer_credit_entry = true
        }
      }

      // 3. قيد عكس COGS (تكلفة المبيعات)
      const totalCOGS = await calculateCOGS(supabase, invoice.id)
      if (totalCOGS > 0 && mapping.cogs && mapping.inventory) {
        const { data: cogsReversalEntry } = await supabase
          .from("journal_entries")
          .insert({
            company_id: companyId,
            reference_type: "invoice_cogs_reversal",
            reference_id: invoice.id,
            entry_date: invoice.invoice_date,
            description: `عكس تكلفة المبيعات للفاتورة ${invoice_number} (مرتجع ${returnStatus === "full" ? "كامل" : "جزئي"})`
          })
          .select()
          .single()

        if (cogsReversalEntry) {
          await supabase.from("journal_entry_lines").insert([
            { journal_entry_id: cogsReversalEntry.id, account_id: mapping.inventory, debit_amount: totalCOGS, credit_amount: 0, description: "عودة للمخزون" },
            { journal_entry_id: cogsReversalEntry.id, account_id: mapping.cogs, debit_amount: 0, credit_amount: totalCOGS, description: "عكس تكلفة البضاعة المباعة" },
          ])
          summary.created_cogs_reversal_entry = true
        }
      }

      // 4. إنشاء مستند مرتجع مبيعات منفصل
      if (invoice.customer_id && returnEntryId) {
        try {
          const returnNumber = `SR-${Date.now().toString().slice(-8)}`
          const refundAmount = invoice.refund_amount || 0
          
          const { data: salesReturn } = await supabase.from("sales_returns").insert({
            company_id: companyId,
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
            notes: `مرتجع للفاتورة ${invoice_number}`,
            journal_entry_id: returnEntryId
          }).select().single()

          // إنشاء بنود المرتجع
          if (salesReturn?.id && invoiceItems && invoiceItems.length > 0) {
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
            summary.created_sales_return_document = true
          }
        } catch (e) {
          console.log("sales_returns table may not exist:", e)
        }
      }

      // 4. إنشاء رصيد دائن للعميل
      const customerCreditAmount = invoice.refund_amount || 0
      if (customerCreditAmount > 0 && invoice.customer_id) {
        try {
          await supabase.from("customer_credits").insert({
            company_id: companyId,
            customer_id: invoice.customer_id,
            credit_number: `CR-${Date.now()}`,
            credit_date: invoice.invoice_date,
            amount: customerCreditAmount,
            used_amount: 0,
            reference_type: "invoice_return",
            reference_id: invoice.id,
            status: "active",
            notes: `رصيد دائن من مرتجع الفاتورة ${invoice_number}`
          })
          summary.created_customer_credit = true
        } catch (e) {
          console.log("customer_credits table may not exist:", e)
        }

        // 5. قيد استرداد المدفوعات (للمرتجعات النقدية)
        if ((mapping.cash || mapping.bank) && mapping.customerCredit) {
          try {
            const { data: refundEntry } = await supabase.from("journal_entries").insert({
              company_id: companyId,
              reference_type: "payment_refund",
              reference_id: invoice.id,
              entry_date: invoice.invoice_date,
              description: `عكس مدفوعات الفاتورة ${invoice_number} (مرتجع ${returnStatus === "full" ? "كامل" : "جزئي"})`
            }).select().single()
            
            if (refundEntry?.id) {
              await supabase.from("journal_entry_lines").insert([
                { journal_entry_id: refundEntry.id, account_id: mapping.customerCredit, debit_amount: customerCreditAmount, credit_amount: 0, description: "رصيد دائن للعميل" },
                { journal_entry_id: refundEntry.id, account_id: mapping.cash || mapping.bank, debit_amount: 0, credit_amount: customerCreditAmount, description: "عكس مدفوعات" },
              ])
              summary.created_payment_refund_entry = true
            }
          } catch {}
        }
      }

      // 6. معاملات المخزون لمرتجع المبيعات (دخول للمخزون)
      if (productItems.length > 0) {
        const invTx = productItems.map((it: any) => ({
          company_id: companyId,
          product_id: it.product_id,
          transaction_type: "sales_return",
          quantity_change: Number(it.quantity || 0), // كمية موجبة لدخول للمخزون
          reference_id: invoice.id,
          notes: `مرتجع مبيعات ${invoice_number}`,
        }))
        await supabase.from("inventory_transactions").insert(invTx)
        summary.created_inventory_transactions = invTx.length
      }
    }

    // --- مرتجع المشتريات (purchase_return) ---
    if (invoice.invoice_type === "purchase_return") {
      // 1. تحديث حالة الفاتورة الأصلية (إذا كانت مرتبطة)
      if (invoice.bill_id) {
        const returnStatus = invoice.total_amount === invoice.returned_amount ? "full" : "partial"
        await supabase
          .from("bills")
          .update({
            returned_amount: invoice.returned_amount || 0,
            return_status: returnStatus
          })
          .eq("id", invoice.bill_id)
      }

      // 2. قيد مرتجع المشتريات: مدين الذمم الدائنة، دائن المخزون + عكس ضريبة
      let purchaseReturnEntryId = null
      if (mapping.ap && mapping.inventory) {
        const { data: purchaseReturnEntry } = await supabase
          .from("journal_entries")
          .insert({
            company_id: companyId,
            reference_type: "purchase_return",
            reference_id: invoice.id,
            entry_date: invoice.invoice_date,
            description: `مرتجع مشتريات ${invoice_number}`,
          })
          .select()
          .single()

        if (purchaseReturnEntry) {
          purchaseReturnEntryId = purchaseReturnEntry.id
          const lines: any[] = [
            { journal_entry_id: purchaseReturnEntry.id, account_id: mapping.ap, debit_amount: Number(invoice.total_amount || 0), credit_amount: 0, description: "تقليل ذمم الموردين - مرتجع" },
            { journal_entry_id: purchaseReturnEntry.id, account_id: mapping.inventory, debit_amount: 0, credit_amount: Number(invoice.subtotal || 0), description: "خروج مخزون - مرتجع مشتريات" },
          ]
          if (mapping.vatReceivable && Number(invoice.tax_amount || 0) > 0) {
            lines.push({ journal_entry_id: purchaseReturnEntry.id, account_id: mapping.vatReceivable, debit_amount: 0, credit_amount: Number(invoice.tax_amount || 0), description: "عكس ضريبة المشتريات" })
          }
          await supabase.from("journal_entry_lines").insert(lines)
          summary.created_purchase_return_entry = true
        }
      }

      // 3. إنشاء مستند مرتجع مشتريات منفصل
      if (invoice.supplier_id && purchaseReturnEntryId) {
        try {
          const returnNumber = `PR-${Date.now().toString().slice(-8)}`
          const refundAmount = invoice.refund_amount || 0
          
          const { data: purchaseReturn } = await supabase.from("purchase_returns").insert({
            company_id: companyId,
            supplier_id: invoice.supplier_id,
            bill_id: invoice.bill_id,
            return_number: returnNumber,
            return_date: invoice.invoice_date,
            subtotal: Number(invoice.subtotal || 0),
            tax_amount: Number(invoice.tax_amount || 0),
            total_amount: Number(invoice.total_amount || 0),
            refund_amount: refundAmount,
            refund_method: refundAmount > 0 ? "cash" : "none",
            status: "completed",
            reason: "مرتجع مشتريات",
            notes: `مرتجع مشتريات للفاتورة ${invoice_number}`,
            journal_entry_id: purchaseReturnEntryId
          }).select().single()

          // إنشاء بنود مرتجع المشتريات
          if (purchaseReturn?.id && invoiceItems && invoiceItems.length > 0) {
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
            summary.created_purchase_return_document = true
          }
        } catch (e) {
          console.log("purchase_returns table may not exist:", e)
        }
      }

      // 4. قيد استرداد النقد من المورد (للمرتجعات النقدية)
      const refundAmount = invoice.refund_amount || 0
      if (refundAmount > 0 && (mapping.cash || mapping.bank) && mapping.ap) {
        try {
          const { data: refundEntry } = await supabase.from("journal_entries").insert({
            company_id: companyId,
            reference_type: "purchase_return_refund",
            reference_id: invoice.id,
            entry_date: invoice.invoice_date,
            description: `استرداد نقدي من المورد - الفاتورة ${invoice_number}`
          }).select().single()
          
          if (refundEntry?.id) {
            await supabase.from("journal_entry_lines").insert([
              { journal_entry_id: refundEntry.id, account_id: mapping.cash || mapping.bank, debit_amount: refundAmount, credit_amount: 0, description: "استلام نقد من المورد" },
              { journal_entry_id: refundEntry.id, account_id: mapping.ap, debit_amount: 0, credit_amount: refundAmount, description: "تقليل ذمم الموردين" },
            ])
            summary.created_purchase_refund_entry = true
          }
        } catch {}
      }

      // 5. معاملات المخزون لمرتجع المشتريات (خروج من المخزون)
      if (productItems.length > 0) {
        const invTx = productItems.map((it: any) => ({
          company_id: companyId,
          product_id: it.product_id,
          transaction_type: "purchase_return",
          quantity_change: -Number(it.quantity || 0), // كمية سالبة لخروج من المخزون
          reference_id: invoice.id,
          notes: `مرتجع مشتريات ${invoice_number}`,
        }))
        await supabase.from("inventory_transactions").insert(invTx)
        summary.created_inventory_transactions = invTx.length
      }
    }

    // --- فاتورة شراء (purchase) ---
    if (invoice.invoice_type === "purchase" && (invoice.status === "purchase" || invoice.status === "purchase_paid")) {
      // قيد فاتورة الشراء: مدين المخزون + ضريبة المشتريات، دائن الذمم الدائنة
      if (mapping.ap && mapping.inventory) {
        const { data: purchaseEntry } = await supabase
          .from("journal_entries")
          .insert({
            company_id: companyId,
            reference_type: "purchase",
            reference_id: invoice.id,
            entry_date: invoice.invoice_date,
            description: `فاتورة مشتريات ${invoice_number}`,
          })
          .select()
          .single()

        if (purchaseEntry) {
          const lines: any[] = [
            { journal_entry_id: purchaseEntry.id, account_id: mapping.inventory, debit_amount: Number(invoice.subtotal || 0), credit_amount: 0, description: "دخول مخزون - مشتريات" },
            { journal_entry_id: purchaseEntry.id, account_id: mapping.ap, debit_amount: 0, credit_amount: Number(invoice.total_amount || 0), description: "ذمم الموردين" },
          ]
          if (mapping.vatReceivable && Number(invoice.tax_amount || 0) > 0) {
            lines.push({ journal_entry_id: purchaseEntry.id, account_id: mapping.vatReceivable, debit_amount: Number(invoice.tax_amount || 0), credit_amount: 0, description: "ضريبة المشتريات" })
          }
          await supabase.from("journal_entry_lines").insert(lines)
          summary.created_sales_entry = true // نستخدم نفس الحقل لأنه قيد المشتريات
        }
      }

      // معاملات المخزون لفاتورة الشراء (دخول للمخزون)
      if (productItems.length > 0) {
        const invTx = productItems.map((it: any) => ({
          company_id: companyId,
          product_id: it.product_id,
          transaction_type: "purchase",
          quantity_change: Number(it.quantity || 0), // كمية موجبة لدخول للمخزون
          reference_id: invoice.id,
          notes: `مشتريات ${invoice_number}`,
        }))
        await supabase.from("inventory_transactions").insert(invTx)
        summary.created_inventory_transactions = invTx.length
      }

      // قيد دفع فاتورة الشراء إذا كانت مدفوعة
      if (invoice.status === "purchase_paid" && mapping.ap && (mapping.cash || mapping.bank)) {
        const paidAmount = Number(invoice.total_amount || 0)
        const { data: paymentEntry } = await supabase
          .from("journal_entries")
          .insert({
            company_id: companyId,
            reference_type: "purchase_payment",
            reference_id: invoice.id,
            entry_date: new Date().toISOString().slice(0, 10),
            description: `دفعة لمورد - فاتورة ${invoice_number}`,
          })
          .select()
          .single()

        if (paymentEntry) {
          await supabase.from("journal_entry_lines").insert([
            { journal_entry_id: paymentEntry.id, account_id: mapping.ap, debit_amount: paidAmount, credit_amount: 0, description: "تقليل ذمم الموردين" },
            { journal_entry_id: paymentEntry.id, account_id: mapping.cash || mapping.bank, debit_amount: 0, credit_amount: paidAmount, description: "النقد/البنك" },
          ])
          summary.created_payment_entry = true
        }
      }
    }

    // =====================================================
    // الخطوة 4: تحديث كميات المنتجات
    // =====================================================
    // جمع جميع معاملات المخزون لكل منتج وتحديث الكمية
    const productIds = productItems.map((it: any) => it.product_id)
    if (productIds.length > 0) {
      for (const productId of productIds) {
        // جلب جميع معاملات المخزون لهذا المنتج
        const { data: allTx } = await supabase
          .from("inventory_transactions")
          .select("quantity_change")
          .eq("product_id", productId)

        const totalQuantity = (allTx || []).reduce((sum: number, tx: any) => sum + Number(tx.quantity_change || 0), 0)

        // جلب الكمية الأولية من المنتج
        const { data: product } = await supabase
          .from("products")
          .select("initial_quantity")
          .eq("id", productId)
          .single()

        const finalQuantity = Number(product?.initial_quantity || 0) + totalQuantity

        await supabase
          .from("products")
          .update({ quantity_on_hand: finalQuantity })
          .eq("id", productId)

        summary.updated_products++
      }
    }

    return NextResponse.json({ ok: true, summary })
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "unexpected"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return await handle(request)
}

export async function POST(request: NextRequest) {
  return await handle(request)
}

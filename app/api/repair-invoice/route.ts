import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// =====================================================
// API إصلاح فاتورة معينة - المنطق الجديد
// يحذف القيود والحركات القديمة ثم يعيد إنشاءها بشكل صحيح
// حسب حالة الفاتورة (sent/paid/partially_paid)
// =====================================================

type ResultSummary = {
  invoice_number: string
  invoice_status: string
  // الحذف
  deleted_journal_entries: number
  deleted_journal_lines: number
  deleted_inventory_transactions: number
  deleted_reversal_transactions: number
  // الإنشاء
  created_sales_entry: boolean
  created_cogs_entry: boolean
  created_payment_entry: boolean
  created_inventory_transactions: number
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
    revenue: bySubType("sales_revenue") || bySubType("revenue") || byType("revenue") || byCode("4000") || byNameIncludes("المبيعات"),
    vatPayable: bySubType("vat_payable") || byCode("2200") || byNameIncludes("ضريبة") || byNameIncludes("vat"),
    cash: bySubType("cash") || byCode("1000") || byNameIncludes("الصندوق") || byNameIncludes("النقد"),
    bank: bySubType("bank") || byCode("1100") || byNameIncludes("البنك"),
    inventory: bySubType("inventory") || byCode("1300") || byNameIncludes("المخزون"),
    cogs: bySubType("cost_of_goods_sold") || bySubType("cogs") || byCode("5000") || byNameIncludes("تكلفة المبيعات") || byNameIncludes("تكلفة البضاعة"),
    shippingAccount: bySubType("shipping_income") || byCode("4100") || byNameIncludes("الشحن") || byNameIncludes("التوصيل")
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

    // 1) جلب الفاتورة
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, invoice_number, status, subtotal, tax_amount, total_amount, shipping, paid_amount, invoice_date")
      .eq("company_id", companyId)
      .eq("invoice_number", invoice_number)
      .maybeSingle()

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
      deleted_journal_entries: 0,
      deleted_journal_lines: 0,
      deleted_inventory_transactions: 0,
      deleted_reversal_transactions: 0,
      created_sales_entry: false,
      created_cogs_entry: false,
      created_payment_entry: false,
      created_inventory_transactions: 0,
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

    // أيضاً البحث عن قيود عكس قديمة بنفس الوصف
    const { data: reversalEntries } = await supabase
      .from("journal_entries")
      .select("id, reference_type")
      .eq("company_id", companyId)
      .or(`reference_type.eq.invoice_reversal,reference_type.eq.invoice_cogs_reversal,reference_type.eq.invoice_payment_reversal`)
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
    // حذف معاملات البيع المرتبطة بالفاتورة
    const { data: existingSaleTx } = await supabase
      .from("inventory_transactions")
      .select("id, product_id, quantity_change, transaction_type")
      .eq("company_id", companyId)
      .eq("reference_id", invoice.id)

    // حذف معاملات العكس المرتبطة بالفاتورة (من المنطق القديم)
    const { data: existingReversalTx } = await supabase
      .from("inventory_transactions")
      .select("id, product_id, quantity_change")
      .eq("company_id", companyId)
      .eq("transaction_type", "sale_reversal")
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

    // --- الفاتورة المرسلة (sent) ---
    if (invoice.status === "sent") {
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

    // --- الفاتورة المدفوعة أو المدفوعة جزئياً ---
    if (invoice.status === "paid" || invoice.status === "partially_paid") {
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

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
// 📌 CANONICAL INVENTORY REPAIR – MANDATORY SPECIFICATION
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

  const parentIds = new Set((accounts || []).map((a: any) => a.parent_id).filter(Boolean))
  const leafAccounts = (accounts || []).filter((a: any) => !parentIds.has(a.id))

  const byCode = (code: string) => leafAccounts.find((a: any) => String(a.account_code || "").toUpperCase() === code)?.id
  const bySubType = (st: string) => leafAccounts.find((a: any) => a.sub_type === st)?.id
  const byName = (name: string) => leafAccounts.find((a: any) => a.account_name?.includes(name))?.id

  return {
    companyId,
    inventory: bySubType("inventory") || byCode("1300") || byName("المخزون"),
    cogs: bySubType("cost_of_goods_sold") || byCode("5000") || byName("تكلفة المبيعات") || byName("تكلفة البضاعة"),
  }
}

// ===== GET: فحص حالة المخزون الشامل =====
// يشمل: المبيعات، المشتريات، مرتجع المبيعات، مرتجع المشتريات، الإهلاك، التعديلات
export async function GET(request: NextRequest) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(request)
    if (error) return error

    if (!user || !companyId) {
      return unauthorizedError()
    }

    const supabase = await createClient()

    // جلب المنتجات (ليس الخدمات)
    const { data: products } = await supabase
      .from("products")
      .select("id, name, sku, quantity_on_hand, item_type")
      .eq("company_id", companyId)
      .or("item_type.is.null,item_type.neq.service")

    const productIds = new Set((products || []).map((p: any) => p.id))

    // ===== 1. جلب فواتير البيع =====
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, status, invoice_type, returned_amount")
      .eq("company_id", companyId)
      .in("status", ["sent", "partially_paid", "paid"])

    const invoiceIds = (invoices || []).map((i: any) => i.id)

    const { data: invoiceItems } = invoiceIds.length > 0
      ? await supabase
          .from("invoice_items")
          .select("invoice_id, product_id, quantity, returned_quantity, products!inner(item_type)")
          .in("invoice_id", invoiceIds)
      : { data: [] }

    // ===== 2. جلب فواتير الشراء =====
    const { data: bills } = await supabase
      .from("bills")
      .select("id, status, returned_amount")
      .eq("company_id", companyId)
      .in("status", ["sent", "partially_paid", "paid"])

    const billIds = (bills || []).map((b: any) => b.id)

    const { data: billItems } = billIds.length > 0
      ? await supabase
          .from("bill_items")
          .select("bill_id, product_id, quantity, returned_quantity, products!inner(item_type)")
          .in("bill_id", billIds)
      : { data: [] }

    // ===== 3. جلب مرتجعات المبيعات =====
    const { data: salesReturns } = await supabase
      .from("sales_returns")
      .select("id, status")
      .eq("company_id", companyId)
      .eq("status", "completed")

    const salesReturnIds = (salesReturns || []).map((sr: any) => sr.id)

    const { data: salesReturnItems } = salesReturnIds.length > 0
      ? await supabase
          .from("sales_return_items")
          .select("sales_return_id, product_id, quantity")
          .in("sales_return_id", salesReturnIds)
      : { data: [] }

    // ===== 4. جلب مرتجعات المشتريات (vendor_credits) =====
    const { data: vendorCredits } = await supabase
      .from("vendor_credits")
      .select("id, status")
      .eq("company_id", companyId)
      .eq("status", "applied")

    const vendorCreditIds = (vendorCredits || []).map((vc: any) => vc.id)

    const { data: vendorCreditItems } = vendorCreditIds.length > 0
      ? await supabase
          .from("vendor_credit_items")
          .select("vendor_credit_id, product_id, quantity")
          .in("vendor_credit_id", vendorCreditIds)
      : { data: [] }

    // ===== 5. جلب الإهلاك (write_offs) =====
    const { data: writeOffs } = await supabase
      .from("inventory_write_offs")
      .select("id, status")
      .eq("company_id", companyId)
      .eq("status", "approved")

    const writeOffIds = (writeOffs || []).map((wo: any) => wo.id)

    const { data: writeOffItems } = writeOffIds.length > 0
      ? await supabase
          .from("inventory_write_off_items")
          .select("write_off_id, product_id, quantity")
          .in("write_off_id", writeOffIds)
      : { data: [] }

    // ===== 6. جلب حركات المخزون الحالية =====
    const { data: transactions } = await supabase
      .from("inventory_transactions")
      .select("id, product_id, transaction_type, quantity_change, reference_id")
      .eq("company_id", companyId)

    // ===== حساب الكميات المتوقعة =====
    const expectedQty: Record<string, number> = {}

    // المشتريات (موجب)
    ;(billItems || []).forEach((it: any) => {
      if (!it.product_id || it.products?.item_type === "service") return
      if (!productIds.has(it.product_id)) return
      expectedQty[it.product_id] = (expectedQty[it.product_id] || 0) + Number(it.quantity || 0)
    })

    // المبيعات (سالب)
    ;(invoiceItems || []).forEach((it: any) => {
      if (!it.product_id || it.products?.item_type === "service") return
      if (!productIds.has(it.product_id)) return
      expectedQty[it.product_id] = (expectedQty[it.product_id] || 0) - Number(it.quantity || 0)
    })

    // مرتجع المبيعات (موجب - إرجاع للمخزون)
    ;(salesReturnItems || []).forEach((it: any) => {
      if (!it.product_id) return
      if (!productIds.has(it.product_id)) return
      expectedQty[it.product_id] = (expectedQty[it.product_id] || 0) + Number(it.quantity || 0)
    })

    // مرتجع المبيعات من returned_quantity في invoice_items (موجب)
    ;(invoiceItems || []).forEach((it: any) => {
      if (!it.product_id || it.products?.item_type === "service") return
      if (!productIds.has(it.product_id)) return
      if (Number(it.returned_quantity || 0) > 0) {
        expectedQty[it.product_id] = (expectedQty[it.product_id] || 0) + Number(it.returned_quantity || 0)
      }
    })

    // مرتجع المشتريات (سالب - خروج من المخزون)
    ;(vendorCreditItems || []).forEach((it: any) => {
      if (!it.product_id) return
      if (!productIds.has(it.product_id)) return
      expectedQty[it.product_id] = (expectedQty[it.product_id] || 0) - Number(it.quantity || 0)
    })

    // مرتجع المشتريات من returned_quantity في bill_items (سالب)
    ;(billItems || []).forEach((it: any) => {
      if (!it.product_id || it.products?.item_type === "service") return
      if (!productIds.has(it.product_id)) return
      if (Number(it.returned_quantity || 0) > 0) {
        expectedQty[it.product_id] = (expectedQty[it.product_id] || 0) - Number(it.returned_quantity || 0)
      }
    })

    // الإهلاك (سالب)
    ;(writeOffItems || []).forEach((it: any) => {
      if (!it.product_id) return
      if (!productIds.has(it.product_id)) return
      expectedQty[it.product_id] = (expectedQty[it.product_id] || 0) - Number(it.quantity || 0)
    })

    // ===== حساب الكميات الفعلية من حركات المخزون =====
    const actualQty: Record<string, number> = {}
    const duplicates: any[] = []
    const orphans: any[] = []
    const seenTx = new Map<string, any>()

    // جمع كل المراجع الصالحة
    const validRefs = new Set([
      ...invoiceIds, ...billIds, ...salesReturnIds,
      ...vendorCreditIds, ...writeOffIds
    ])

    ;(transactions || []).forEach((tx: any) => {
      if (!tx.product_id) return

      // تخطي حركات العكس
      if (tx.transaction_type?.includes('reversal')) return

      const key = `${tx.reference_id}:${tx.product_id}:${tx.transaction_type}`

      // كشف المكررات
      if (seenTx.has(key)) {
        duplicates.push({
          id: tx.id,
          product_id: tx.product_id,
          type: tx.transaction_type,
          reference_id: tx.reference_id
        })
        return
      }
      seenTx.set(key, tx)

      // كشف الحركات اليتيمة (مرتبطة بمراجع محذوفة)
      if (tx.reference_id && !validRefs.has(tx.reference_id) &&
          ['sale', 'purchase', 'sale_return', 'purchase_return', 'write_off'].includes(tx.transaction_type)) {
        orphans.push({
          id: tx.id,
          product_id: tx.product_id,
          type: tx.transaction_type,
          qty: tx.quantity_change
        })
        return
      }

      actualQty[tx.product_id] = (actualQty[tx.product_id] || 0) + Number(tx.quantity_change || 0)
    })

    // ===== تحديد المشاكل =====
    const issues: any[] = []
    const qtyMismatches: any[] = []

    ;(products || []).forEach((p: any) => {
      const expected = expectedQty[p.id] || 0
      const actual = actualQty[p.id] || 0
      const stored = p.quantity_on_hand || 0

      if (expected !== actual || actual !== stored) {
        qtyMismatches.push({
          productId: p.id,
          productName: p.name,
          sku: p.sku,
          expectedQty: expected,
          actualQty: actual,
          storedQty: stored,
          diff: expected - actual
        })
      }
    })

    return apiSuccess(
      {
        totalProducts: (products || []).length,
        totalInvoices: invoiceIds.length,
        totalBills: billIds.length,
        totalSalesReturns: salesReturnIds.length,
        totalVendorCredits: vendorCreditIds.length,
        totalWriteOffs: writeOffIds.length,
        totalTransactions: (transactions || []).length,
        issuesCount: qtyMismatches.length + duplicates.length + orphans.length,
        issues: qtyMismatches,
        duplicates,
        orphans,
        summary: {
          qtyMismatches: qtyMismatches.length,
          duplicateTransactions: duplicates.length,
          orphanTransactions: orphans.length,
        },
      },
      HTTP_STATUS.OK,
    )
  } catch (error: any) {
    console.error("Error checking inventory:", error)
    return internalError(error, "خطأ في فحص المخزون")
  }
}

// ===== POST: إصلاح المخزون الشامل =====
// يشمل: المبيعات، المشتريات، مرتجع المبيعات، مرتجع المشتريات، الإهلاك، التعديلات
export async function POST(request: NextRequest) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(request)
    if (error) return error

    if (!user || !companyId) {
      return unauthorizedError()
    }

    const supabase = await createClient()

    const mapping = await findAccountIds(supabase, companyId)
    if (!mapping) {
      return notFoundError("الحسابات")
    }

    // جلب المنتجات (ليس الخدمات)
    const { data: products } = await supabase
      .from("products")
      .select("id, name, sku, quantity_on_hand, item_type, cost_price")
      .eq("company_id", companyId)
      .or("item_type.is.null,item_type.neq.service")

    const productIds = new Set((products || []).map((p: any) => p.id))
    const productCostMap = new Map((products || []).map((p: any) => [p.id, Number(p.cost_price || 0)]))

    // ===== 1. جلب فواتير البيع =====
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, status, invoice_date, returned_amount")
      .eq("company_id", companyId)
      .in("status", ["sent", "partially_paid", "paid"])

    const invoiceIds = (invoices || []).map((i: any) => i.id)

    const { data: invoiceItems } = invoiceIds.length > 0
      ? await supabase
          .from("invoice_items")
          .select("invoice_id, product_id, quantity, returned_quantity, products!inner(item_type)")
          .in("invoice_id", invoiceIds)
      : { data: [] }

    // ===== 2. جلب فواتير الشراء =====
    const { data: bills } = await supabase
      .from("bills")
      .select("id, bill_number, status, bill_date, returned_amount")
      .eq("company_id", companyId)
      .in("status", ["sent", "partially_paid", "paid"])

    const billIds = (bills || []).map((b: any) => b.id)

    const { data: billItems } = billIds.length > 0
      ? await supabase
          .from("bill_items")
          .select("bill_id, product_id, quantity, returned_quantity, products!inner(item_type)")
          .in("bill_id", billIds)
      : { data: [] }

    // ===== 3. جلب مرتجعات المبيعات =====
    const { data: salesReturns } = await supabase
      .from("sales_returns")
      .select("id, return_number, status, return_date, invoice_id")
      .eq("company_id", companyId)
      .eq("status", "completed")

    const salesReturnIds = (salesReturns || []).map((sr: any) => sr.id)

    const { data: salesReturnItems } = salesReturnIds.length > 0
      ? await supabase
          .from("sales_return_items")
          .select("sales_return_id, product_id, quantity")
          .in("sales_return_id", salesReturnIds)
      : { data: [] }

    // ===== 4. جلب مرتجعات المشتريات (vendor_credits) =====
    const { data: vendorCredits } = await supabase
      .from("vendor_credits")
      .select("id, credit_number, status, credit_date, bill_id")
      .eq("company_id", companyId)
      .eq("status", "applied")

    const vendorCreditIds = (vendorCredits || []).map((vc: any) => vc.id)

    const { data: vendorCreditItems } = vendorCreditIds.length > 0
      ? await supabase
          .from("vendor_credit_items")
          .select("vendor_credit_id, product_id, quantity")
          .in("vendor_credit_id", vendorCreditIds)
      : { data: [] }

    // ===== 5. جلب الإهلاك (write_offs) =====
    const { data: writeOffs } = await supabase
      .from("inventory_write_offs")
      .select("id, write_off_number, status, write_off_date")
      .eq("company_id", companyId)
      .eq("status", "approved")

    const writeOffIds = (writeOffs || []).map((wo: any) => wo.id)

    const { data: writeOffItems } = writeOffIds.length > 0
      ? await supabase
          .from("inventory_write_off_items")
          .select("write_off_id, product_id, quantity")
          .in("write_off_id", writeOffIds)
      : { data: [] }

    // ===== 6. جلب حركات المخزون الحالية =====
    const { data: existingTx } = await supabase
      .from("inventory_transactions")
      .select("id, product_id, transaction_type, quantity_change, reference_id, journal_entry_id")
      .eq("company_id", companyId)

    // ===== 7. جلب قيود COGS الحالية =====
    const { data: existingCOGS } = await supabase
      .from("journal_entries")
      .select("id, reference_id")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice_cogs")

    const existingCOGSMap = new Map((existingCOGS || []).map((j: any) => [j.reference_id, j.id]))

    // جمع كل المراجع الصالحة
    const validRefs = new Set([
      ...invoiceIds, ...billIds, ...salesReturnIds,
      ...vendorCreditIds, ...writeOffIds
    ])

    // بناء خريطة الحركات الموجودة (تخزين أول حركة فقط، الباقي مكررات)
    const existingMap: Record<string, any> = {}
    const duplicateTxIds: string[] = [] // الحركات المكررة للحذف
    const reversalTxIds: string[] = [] // حركات العكس للحذف

    ;(existingTx || []).forEach((tx: any) => {
      // 1. جمع حركات العكس للحذف
      if (tx.transaction_type?.includes('reversal')) {
        reversalTxIds.push(tx.id)
        return
      }

      const key = `${tx.reference_id}:${tx.product_id}:${tx.transaction_type}`
      if (existingMap[key]) {
        // هذه حركة مكررة
        duplicateTxIds.push(tx.id)
      } else {
        existingMap[key] = tx
      }
    })

    // 📌 النمط المحاسبي الصارم: لا COGS
    const results = {
      transactionsCreated: 0,
      transactionsUpdated: 0,
      transactionsDeleted: 0,
      cogsDeleted: 0, // فقط حذف (لا إنشاء)
      productsUpdated: 0,
      details: [] as any[]
    }

    // إنشاء الحركات المتوقعة من الفواتير
    const expectedTx: any[] = []

    // حركات البيع من الفواتير (استبعاد الخدمات)
    for (const inv of (invoices || [])) {
      const items = (invoiceItems || []).filter((it: any) => it.invoice_id === inv.id)
      for (const it of items) {
        // استبعاد الخدمات
        if (!it.product_id) continue
        const productType = Array.isArray(it.products) ? (it.products[0] as any)?.item_type : (it.products as any)?.item_type
        if (productType === "service") continue
        // تحقق أن المنتج موجود في قائمة المنتجات (ليس خدمة)
        if (!productIds.has(it.product_id)) continue
        expectedTx.push({
          company_id: companyId,
          product_id: it.product_id,
          transaction_type: "sale",
          quantity_change: -Number(it.quantity || 0),
          reference_id: inv.id,
          notes: `بيع ${inv.invoice_number}`
        })
      }
    }

    // حركات الشراء من فواتير الشراء (استبعاد الخدمات)
    for (const bill of (bills || [])) {
      const items = (billItems || []).filter((it: any) => it.bill_id === bill.id)
      for (const it of items) {
        if (!it.product_id) continue
        const productType = Array.isArray(it.products) ? (it.products[0] as any)?.item_type : (it.products as any)?.item_type
        if (productType === "service") continue
        if (!productIds.has(it.product_id)) continue
        expectedTx.push({
          company_id: companyId,
          product_id: it.product_id,
          transaction_type: "purchase",
          quantity_change: Number(it.quantity || 0),
          reference_id: bill.id,
          notes: `شراء ${bill.bill_number}`
        })
      }
    }

    // ===== حركات مرتجع المبيعات (موجب - إرجاع للمخزون) =====
    for (const sr of (salesReturns || [])) {
      const items = (salesReturnItems || []).filter((it: any) => it.sales_return_id === sr.id)
      for (const it of items) {
        if (!it.product_id) continue
        if (!productIds.has(it.product_id)) continue
        expectedTx.push({
          company_id: companyId,
          product_id: it.product_id,
          transaction_type: "sale_return",
          quantity_change: Number(it.quantity || 0),  // موجب لأن البضاعة تعود للمخزون
          reference_id: sr.id,
          notes: `مرتجع مبيعات ${sr.return_number}`
        })
      }
    }

    // حركات مرتجع المبيعات من returned_quantity في invoice_items
    for (const inv of (invoices || [])) {
      const items = (invoiceItems || []).filter((it: any) => it.invoice_id === inv.id)
      for (const it of items) {
        if (!it.product_id) continue
        if (!productIds.has(it.product_id)) continue
        const returnedQty = Number(it.returned_quantity || 0)
        if (returnedQty > 0) {
          // التحقق من عدم وجود حركة sale_return سابقة لهذه الفاتورة
          const existingReturnKey = `${inv.id}:${it.product_id}:sale_return`
          if (!expectedTx.some(tx => `${tx.reference_id}:${tx.product_id}:${tx.transaction_type}` === existingReturnKey)) {
            expectedTx.push({
              company_id: companyId,
              product_id: it.product_id,
              transaction_type: "sale_return",
              quantity_change: returnedQty,
              reference_id: inv.id,
              notes: `مرتجع من الفاتورة ${inv.invoice_number}`
            })
          }
        }
      }
    }

    // ===== حركات مرتجع المشتريات (سالب - خروج من المخزون) =====
    for (const vc of (vendorCredits || [])) {
      const items = (vendorCreditItems || []).filter((it: any) => it.vendor_credit_id === vc.id)
      for (const it of items) {
        if (!it.product_id) continue
        if (!productIds.has(it.product_id)) continue
        expectedTx.push({
          company_id: companyId,
          product_id: it.product_id,
          transaction_type: "purchase_return",
          quantity_change: -Number(it.quantity || 0),  // سالب لأن البضاعة تخرج من المخزون
          reference_id: vc.id,
          notes: `مرتجع مشتريات ${vc.credit_number}`
        })
      }
    }

    // حركات مرتجع المشتريات من returned_quantity في bill_items
    for (const bill of (bills || [])) {
      const items = (billItems || []).filter((it: any) => it.bill_id === bill.id)
      for (const it of items) {
        if (!it.product_id) continue
        if (!productIds.has(it.product_id)) continue
        const returnedQty = Number(it.returned_quantity || 0)
        if (returnedQty > 0) {
          const existingReturnKey = `${bill.id}:${it.product_id}:purchase_return`
          if (!expectedTx.some(tx => `${tx.reference_id}:${tx.product_id}:${tx.transaction_type}` === existingReturnKey)) {
            expectedTx.push({
              company_id: companyId,
              product_id: it.product_id,
              transaction_type: "purchase_return",
              quantity_change: -returnedQty,
              reference_id: bill.id,
              notes: `مرتجع من فاتورة الشراء ${bill.bill_number}`
            })
          }
        }
      }
    }

    // ===== حركات الإهلاك (سالب - نقص من المخزون) =====
    for (const wo of (writeOffs || [])) {
      const items = (writeOffItems || []).filter((it: any) => it.write_off_id === wo.id)
      for (const it of items) {
        if (!it.product_id) continue
        if (!productIds.has(it.product_id)) continue
        expectedTx.push({
          company_id: companyId,
          product_id: it.product_id,
          transaction_type: "write_off",
          quantity_change: -Number(it.quantity || 0),  // سالب لأن البضاعة تنقص من المخزون
          reference_id: wo.id,
          notes: `إهلاك ${wo.write_off_number}`
        })
      }
    }

    // ===== مقارنة وإصلاح الحركات =====
    const toInsert: any[] = []
    const toUpdate: { id: string; patch: any }[] = []
    const processedKeys = new Set<string>()

    for (const exp of expectedTx) {
      const key = `${exp.reference_id}:${exp.product_id}:${exp.transaction_type}`
      processedKeys.add(key)
      const existing = existingMap[key]

      if (!existing) {
        toInsert.push(exp)
        results.details.push({ type: 'create', product: exp.product_id, qty: exp.quantity_change, note: exp.notes })
      } else if (Number(existing.quantity_change) !== Number(exp.quantity_change)) {
        toUpdate.push({ id: existing.id, patch: { quantity_change: exp.quantity_change, notes: exp.notes } })
        results.details.push({ type: 'update', product: exp.product_id, oldQty: existing.quantity_change, newQty: exp.quantity_change })
      }
    }

    // جمع الحركات للحذف
    const toDelete: string[] = [
      ...reversalTxIds,    // حركات العكس
      ...duplicateTxIds    // الحركات المكررة
    ]

    // إضافة تفاصيل حركات العكس
    results.details.push({ type: 'delete_reversals', count: reversalTxIds.length, note: 'حذف حركات العكس القديمة' })

    // إضافة تفاصيل الحركات المكررة
    results.details.push({ type: 'delete_duplicates', count: duplicateTxIds.length, note: 'حذف الحركات المكررة' })

    // حذف الحركات المرتبطة بمراجع محذوفة (orphan transactions) - جميع الأنواع
    const validTxTypes = ['sale', 'purchase', 'sale_return', 'purchase_return', 'write_off']
    for (const tx of (existingTx || [])) {
      // تخطي حركات العكس والمكررات (تم معالجتها أعلاه)
      if (tx.transaction_type?.includes('reversal')) continue
      if (duplicateTxIds.includes(tx.id)) continue

      const key = `${tx.reference_id}:${tx.product_id}:${tx.transaction_type}`

      if (!processedKeys.has(key) && validTxTypes.includes(tx.transaction_type)) {
        // التحقق من وجود المرجع في أي من الجداول المناسبة
        const refExists = validRefs.has(tx.reference_id)
        if (!refExists && tx.reference_id) {
          toDelete.push(tx.id)
          results.details.push({
            type: 'delete_orphan',
            product: tx.product_id,
            qty: tx.quantity_change,
            txType: tx.transaction_type
          })
        }
      }
    }

    // تنفيذ التغييرات
    if (toInsert.length > 0) {
      await supabase.from("inventory_transactions").insert(toInsert)
      results.transactionsCreated = toInsert.length
    }

    for (const upd of toUpdate) {
      await supabase.from("inventory_transactions").update(upd.patch).eq("id", upd.id)
      results.transactionsUpdated++
    }

    if (toDelete.length > 0) {
      await supabase.from("inventory_transactions").delete().in("id", toDelete)
      results.transactionsDeleted = toDelete.length
    }

    // 📌 النمط المحاسبي الصارم: لا COGS
    // COGS يُحسب عند الحاجة من cost_price × quantity المباع
    // حذف أي قيود COGS موجودة (للتنظيف)
    if (existingCOGSMap.size > 0) {
      for (const [refId, cogsId] of existingCOGSMap) {
        await supabase.from("journal_entry_lines").delete().eq("journal_entry_id", cogsId)
        await supabase.from("journal_entries").delete().eq("id", cogsId)
        results.cogsDeleted++
        results.details.push({ type: 'delete_cogs', reference_id: refId, reason: 'النمط الصارم لا يتطلب قيود COGS' })
      }
    }

    // تحديث كميات المنتجات
    const finalQty: Record<string, number> = {}
    for (const exp of expectedTx) {
      finalQty[exp.product_id] = (finalQty[exp.product_id] || 0) + Number(exp.quantity_change || 0)
    }

    for (const p of (products || [])) {
      const expected = finalQty[p.id] || 0
      if (Number(p.quantity_on_hand || 0) !== expected) {
        await supabase.from("products").update({ quantity_on_hand: expected }).eq("id", p.id)
        results.productsUpdated++
      }
    }

    return apiSuccess(
      {
        message: "تم إصلاح المخزون بنجاح",
        results,
      },
      HTTP_STATUS.OK,
    )
  } catch (error: any) {
    console.error("Error fixing inventory:", error)
    return internalError(error, "خطأ في إصلاح المخزون")
  }
}


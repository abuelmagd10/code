import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// =====================================================
// API شامل لصيانة المخزون وحركاته
// يتحقق من توافق المخزون مع الفواتير والفواتير الشراء
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

// ===== GET: فحص حالة المخزون =====
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
    }

    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", user.id)
      .single()
    if (!company) {
      return NextResponse.json({ error: "لم يتم العثور على الشركة" }, { status: 404 })
    }

    // جلب المنتجات (ليس الخدمات)
    const { data: products } = await supabase
      .from("products")
      .select("id, name, sku, quantity_on_hand, item_type")
      .eq("company_id", company.id)
      .or("item_type.is.null,item_type.neq.service")

    // جلب الفواتير المرسلة/المدفوعة/المدفوعة جزئياً
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, status")
      .eq("company_id", company.id)
      .in("status", ["sent", "partially_paid", "paid"])

    const invoiceIds = (invoices || []).map((i: any) => i.id)

    // جلب بنود الفواتير
    const { data: invoiceItems } = invoiceIds.length > 0
      ? await supabase.from("invoice_items").select("product_id, quantity").in("invoice_id", invoiceIds)
      : { data: [] }

    // جلب فواتير الشراء المرسلة/المدفوعة/المدفوعة جزئياً
    const { data: bills } = await supabase
      .from("bills")
      .select("id, status")
      .eq("company_id", company.id)
      .in("status", ["sent", "partially_paid", "paid"])

    const billIds = (bills || []).map((b: any) => b.id)

    // جلب بنود فواتير الشراء
    const { data: billItems } = billIds.length > 0
      ? await supabase.from("bill_items").select("product_id, quantity").in("bill_id", billIds)
      : { data: [] }

    // جلب حركات المخزون الحالية
    const { data: transactions } = await supabase
      .from("inventory_transactions")
      .select("id, product_id, transaction_type, quantity_change, reference_id")
      .eq("company_id", company.id)

    // حساب الكميات المتوقعة من الفواتير
    const expectedQty: Record<string, number> = {}
    ;(billItems || []).forEach((it: any) => {
      if (!it.product_id) return
      expectedQty[it.product_id] = (expectedQty[it.product_id] || 0) + Number(it.quantity || 0)
    })
    ;(invoiceItems || []).forEach((it: any) => {
      if (!it.product_id) return
      expectedQty[it.product_id] = (expectedQty[it.product_id] || 0) - Number(it.quantity || 0)
    })

    // حساب الكميات الفعلية من حركات المخزون
    const actualQty: Record<string, number> = {}
    ;(transactions || []).forEach((tx: any) => {
      if (!tx.product_id) return
      actualQty[tx.product_id] = (actualQty[tx.product_id] || 0) + Number(tx.quantity_change || 0)
    })

    // تحديد المشاكل
    const issues: any[] = []
    ;(products || []).forEach((p: any) => {
      const expected = expectedQty[p.id] || 0
      const actual = actualQty[p.id] || 0
      const stored = p.quantity_on_hand || 0

      if (expected !== actual || expected !== stored) {
        issues.push({
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

    return NextResponse.json({
      totalProducts: (products || []).length,
      totalInvoices: invoiceIds.length,
      totalBills: billIds.length,
      totalTransactions: (transactions || []).length,
      issuesCount: issues.length,
      issues
    })

  } catch (error: any) {
    console.error("Error checking inventory:", error)
    return NextResponse.json({ error: error?.message || "خطأ في فحص المخزون" }, { status: 500 })
  }
}

// ===== POST: إصلاح المخزون =====
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
    }

    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", user.id)
      .single()
    if (!company) {
      return NextResponse.json({ error: "لم يتم العثور على الشركة" }, { status: 404 })
    }

    const mapping = await findAccountIds(supabase, company.id)
    if (!mapping) {
      return NextResponse.json({ error: "لم يتم العثور على الحسابات" }, { status: 404 })
    }

    // جلب المنتجات (ليس الخدمات)
    const { data: products } = await supabase
      .from("products")
      .select("id, name, sku, quantity_on_hand, item_type, cost_price")
      .eq("company_id", company.id)
      .or("item_type.is.null,item_type.neq.service")

    // جلب الفواتير المرسلة/المدفوعة/المدفوعة جزئياً
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, status, invoice_date")
      .eq("company_id", company.id)
      .in("status", ["sent", "partially_paid", "paid"])

    // جلب فواتير الشراء
    const { data: bills } = await supabase
      .from("bills")
      .select("id, bill_number, status, bill_date")
      .eq("company_id", company.id)
      .in("status", ["sent", "partially_paid", "paid"])

    const invoiceIds = (invoices || []).map((i: any) => i.id)
    const billIds = (bills || []).map((b: any) => b.id)

    // جلب بنود الفواتير
    const { data: invoiceItems } = invoiceIds.length > 0
      ? await supabase.from("invoice_items").select("invoice_id, product_id, quantity").in("invoice_id", invoiceIds)
      : { data: [] }

    // جلب بنود فواتير الشراء
    const { data: billItems } = billIds.length > 0
      ? await supabase.from("bill_items").select("bill_id, product_id, quantity").in("bill_id", billIds)
      : { data: [] }

    // جلب حركات المخزون الحالية
    const { data: existingTx } = await supabase
      .from("inventory_transactions")
      .select("id, product_id, transaction_type, quantity_change, reference_id, journal_entry_id")
      .eq("company_id", company.id)

    // بناء خريطة الحركات الموجودة
    const existingMap: Record<string, any> = {}
    ;(existingTx || []).forEach((tx: any) => {
      const key = `${tx.reference_id}:${tx.product_id}:${tx.transaction_type}`
      existingMap[key] = tx
    })

    const results = {
      transactionsCreated: 0,
      transactionsUpdated: 0,
      transactionsDeleted: 0,
      productsUpdated: 0,
      details: [] as any[]
    }

    // إنشاء الحركات المتوقعة من الفواتير
    const expectedTx: any[] = []

    // حركات البيع من الفواتير
    for (const inv of (invoices || [])) {
      const items = (invoiceItems || []).filter((it: any) => it.invoice_id === inv.id)
      for (const it of items) {
        if (!it.product_id) continue
        expectedTx.push({
          company_id: company.id,
          product_id: it.product_id,
          transaction_type: "sale",
          quantity_change: -Number(it.quantity || 0),
          reference_id: inv.id,
          notes: `بيع ${inv.invoice_number}`
        })
      }
    }

    // حركات الشراء من فواتير الشراء
    for (const bill of (bills || [])) {
      const items = (billItems || []).filter((it: any) => it.bill_id === bill.id)
      for (const it of items) {
        if (!it.product_id) continue
        expectedTx.push({
          company_id: company.id,
          product_id: it.product_id,
          transaction_type: "purchase",
          quantity_change: Number(it.quantity || 0),
          reference_id: bill.id,
          notes: `شراء ${bill.bill_number}`
        })
      }
    }

    // مقارنة وإصلاح الحركات
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

    // حذف الحركات الزائدة (المرتبطة بفواتير محذوفة)
    const toDelete: string[] = []
    for (const tx of (existingTx || [])) {
      const key = `${tx.reference_id}:${tx.product_id}:${tx.transaction_type}`
      if (!processedKeys.has(key) && (tx.transaction_type === 'sale' || tx.transaction_type === 'purchase')) {
        // تحقق أن المرجع غير موجود
        const refExists = invoiceIds.includes(tx.reference_id) || billIds.includes(tx.reference_id)
        if (!refExists && tx.reference_id) {
          toDelete.push(tx.id)
          results.details.push({ type: 'delete', product: tx.product_id, qty: tx.quantity_change })
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

    return NextResponse.json({
      message: "تم إصلاح المخزون بنجاح",
      results
    })

  } catch (error: any) {
    console.error("Error fixing inventory:", error)
    return NextResponse.json({ error: error?.message || "خطأ في إصلاح المخزون" }, { status: 500 })
  }
}


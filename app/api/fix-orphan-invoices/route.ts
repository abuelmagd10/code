import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireOwnerOrAdmin } from "@/lib/api-security-enhanced"

/**
 * API لإنشاء أوامر للفواتير القديمة التي ليس لها أمر مرتبط
 * POST /api/fix-orphan-invoices
 * 
 * يقوم بـ:
 * 1. البحث عن جميع الفواتير (invoices) بدون sales_order_id
 * 2. إنشاء أمر بيع تلقائي لكل فاتورة
 * 3. البحث عن جميع فواتير الشراء (bills) بدون purchase_order_id
 * 4. إنشاء أمر شراء تلقائي لكل فاتورة شراء
 */

export async function POST(request: NextRequest) {
  try {
    // التحقق من الصلاحيات - فقط المالك أو الأدمن
    const { user, companyId, error } = await requireOwnerOrAdmin(request)
    if (error) return error
    if (!user || !companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createClient()
    const results = {
      invoices: { found: 0, fixed: 0, errors: [] as string[] },
      bills: { found: 0, fixed: 0, errors: [] as string[] }
    }

    // ==========================================
    // 1. إصلاح فواتير البيع (invoices)
    // ==========================================
    const { data: orphanInvoices } = await supabase
      .from("invoices")
      .select("*, invoice_items(*)")
      .eq("company_id", companyId)
      .is("sales_order_id", null)

    results.invoices.found = orphanInvoices?.length || 0

    for (const invoice of orphanInvoices || []) {
      try {
        // الحصول على رقم أمر البيع التالي
        const { data: existingSoNumbers } = await supabase
          .from("sales_orders")
          .select("so_number")
          .eq("company_id", companyId)

        const extractNum = (s: string | null) => {
          if (!s) return null
          const m = s.match(/(\d+)/g)
          if (!m || m.length === 0) return null
          return Number.parseInt(m[m.length - 1], 10)
        }

        let maxSoSeq = 0
        ;(existingSoNumbers || []).forEach((r: any) => {
          const n = extractNum(r.so_number || "")
          if (n !== null && n > maxSoSeq) maxSoSeq = n
        })
        const soNumber = `SO-${String(maxSoSeq + 1).padStart(4, "0")}`

        // إنشاء أمر البيع
        const { data: soData, error: soError } = await supabase
          .from("sales_orders")
          .insert({
            company_id: companyId,
            customer_id: invoice.customer_id,
            so_number: soNumber,
            so_date: invoice.invoice_date,
            due_date: invoice.due_date,
            subtotal: invoice.subtotal,
            tax_amount: invoice.tax_amount,
            total: invoice.total_amount,
            discount_type: invoice.discount_type,
            discount_value: invoice.discount_value || 0,
            discount_position: invoice.discount_position,
            tax_inclusive: invoice.tax_inclusive,
            shipping: invoice.shipping || 0,
            shipping_tax_rate: invoice.shipping_tax_rate || 0,
            shipping_provider_id: invoice.shipping_provider_id,
            adjustment: invoice.adjustment || 0,
            status: invoice.status, // نفس حالة الفاتورة
            currency: invoice.currency_code,
            exchange_rate: invoice.exchange_rate,
            branch_id: invoice.branch_id,
            cost_center_id: invoice.cost_center_id,
            warehouse_id: invoice.warehouse_id,
            invoice_id: invoice.id, // ربط بالفاتورة
          })
          .select()
          .single()

        if (soError) throw soError

        // إنشاء بنود أمر البيع
        const soItems = (invoice.invoice_items || []).map((item: any) => ({
          sales_order_id: soData.id,
          product_id: item.product_id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
          discount_percent: item.discount_percent || 0,
          line_total: item.line_total,
        }))

        if (soItems.length > 0) {
          await supabase.from("sales_order_items").insert(soItems)
        }

        // تحديث الفاتورة لربطها بأمر البيع
        await supabase
          .from("invoices")
          .update({ sales_order_id: soData.id })
          .eq("id", invoice.id)

        results.invoices.fixed++
      } catch (err: any) {
        results.invoices.errors.push(`Invoice ${invoice.invoice_number}: ${err.message}`)
      }
    }

    // ==========================================
    // 2. إصلاح فواتير الشراء (bills)
    // ==========================================
    const { data: orphanBills } = await supabase
      .from("bills")
      .select("*, bill_items(*)")
      .eq("company_id", companyId)
      .is("purchase_order_id", null)

    results.bills.found = orphanBills?.length || 0

    for (const bill of orphanBills || []) {
      try {
        // الحصول على رقم أمر الشراء التالي
        const { data: existingPoNumbers } = await supabase
          .from("purchase_orders")
          .select("po_number")
          .eq("company_id", companyId)

        const extractNum = (s: string | null) => {
          if (!s) return null
          const m = s.match(/(\d+)/g)
          if (!m || m.length === 0) return null
          return Number.parseInt(m[m.length - 1], 10)
        }

        let maxPoSeq = 0
        ;(existingPoNumbers || []).forEach((r: any) => {
          const n = extractNum(r.po_number || "")
          if (n !== null && n > maxPoSeq) maxPoSeq = n
        })
        const poNumber = `PO-${String(maxPoSeq + 1).padStart(4, "0")}`

        // إنشاء أمر الشراء
        const { data: poData, error: poError } = await supabase
          .from("purchase_orders")
          .insert({
            company_id: companyId,
            supplier_id: bill.supplier_id,
            po_number: poNumber,
            po_date: bill.bill_date,
            due_date: bill.due_date,
            subtotal: bill.subtotal,
            tax_amount: bill.tax_amount,
            total: bill.total_amount,
            discount_type: bill.discount_type,
            discount_value: bill.discount_value || 0,
            discount_position: bill.discount_position,
            tax_inclusive: bill.tax_inclusive,
            shipping: bill.shipping || 0,
            shipping_tax_rate: bill.shipping_tax_rate || 0,
            shipping_provider_id: bill.shipping_provider_id,
            adjustment: bill.adjustment || 0,
            status: bill.status === "paid" ? "billed" : bill.status, // نفس حالة الفاتورة
            currency: bill.currency_code,
            exchange_rate: bill.exchange_rate,
            branch_id: bill.branch_id,
            cost_center_id: bill.cost_center_id,
            warehouse_id: bill.warehouse_id,
            bill_id: bill.id, // ربط بالفاتورة
          })
          .select()
          .single()

        if (poError) throw poError

        // إنشاء بنود أمر الشراء
        const poItems = (bill.bill_items || []).map((item: any) => ({
          purchase_order_id: poData.id,
          product_id: item.product_id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
          discount_percent: item.discount_percent || 0,
          line_total: item.line_total,
        }))

        if (poItems.length > 0) {
          await supabase.from("purchase_order_items").insert(poItems)
        }

        // تحديث فاتورة الشراء لربطها بأمر الشراء
        await supabase
          .from("bills")
          .update({ purchase_order_id: poData.id })
          .eq("id", bill.id)

        results.bills.fixed++
      } catch (err: any) {
        results.bills.errors.push(`Bill ${bill.bill_number}: ${err.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: "تم إصلاح الفواتير القديمة",
      results
    })
  } catch (err: any) {
    console.error("Fix orphan invoices error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET - عرض الفواتير بدون أوامر مرتبطة (للتحقق قبل الإصلاح)
export async function GET(request: NextRequest) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(request)
    if (error) return error
    if (!user || !companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createClient()

    const { data: orphanInvoices, count: invoicesCount } = await supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, total_amount, status", { count: "exact" })
      .eq("company_id", companyId)
      .is("sales_order_id", null)

    const { data: orphanBills, count: billsCount } = await supabase
      .from("bills")
      .select("id, bill_number, bill_date, total_amount, status", { count: "exact" })
      .eq("company_id", companyId)
      .is("purchase_order_id", null)

    return NextResponse.json({
      invoices: { count: invoicesCount, data: orphanInvoices },
      bills: { count: billsCount, data: orphanBills }
    })
  } catch (err: any) {
    console.error("Get orphan invoices error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}


/**
 * 🔧 API لإصلاح المدفوعات المفقودة القيود
 * 
 * GET: عرض المدفوعات التي ليس لها قيود
 * POST: إنشاء قيود محاسبية للمدفوعات المفقودة
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { requireOwnerOrAdmin } from "@/lib/api-security"

interface PaymentData {
  id: string
  payment_date: string
  amount: number
  payment_method: string
  account_id: string | null
  invoice_id: string | null
  bill_id: string | null
  customer_id: string | null
  supplier_id: string | null
  company_id: string
}

// GET: عرض المدفوعات التي ليس لها قيود
export async function GET(request: NextRequest) {
  try {
    // v3.74.711 — role gate, same as every other repair route.
    const { user, companyId: authCompanyId, error: authError } = await requireOwnerOrAdmin(request)
    if (authError) return authError
    if (!user || !authCompanyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: "No company" }, { status: 400 })
    }

    // جلب المدفوعات بدون قيود
    const { data: payments, error } = await supabase
      .from("payments")
      .select(`
        id, payment_date, amount, payment_method, account_id,
        invoice_id, bill_id, customer_id, supplier_id, company_id,
        invoices:invoice_id(invoice_number, total_amount),
        bills:bill_id(bill_number, total_amount),
        customers:customer_id(name),
        suppliers:supplier_id(name),
        chart_of_accounts:account_id(account_name, account_code)
      `)
      .eq("company_id", companyId)
      .is("journal_entry_id", null)
      .gt("amount", 0)
      .order("payment_date", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // إحصائيات
    const stats = {
      total: payments?.length || 0,
      totalAmount: payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0,
      withInvoice: payments?.filter(p => p.invoice_id).length || 0,
      withBill: payments?.filter(p => p.bill_id).length || 0,
      withAccount: payments?.filter(p => p.account_id).length || 0,
    }

    return NextResponse.json({ success: true, payments, stats })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST: إنشاء قيود محاسبية للمدفوعات المفقودة
export async function POST(request: NextRequest) {
  try {
    // v3.74.711 — this one creates journal entries; the gate matters most here.
    const { user, companyId: authCompanyId, error: authError } = await requireOwnerOrAdmin(request)
    if (authError) return authError
    if (!user || !authCompanyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: "No company" }, { status: 400 })
    }

    const body = await request.json()
    const { dryRun = true, paymentIds = [] } = body

    // جلب الحسابات المطلوبة
    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type")
      .eq("company_id", companyId)
      .in("account_code", ["1000", "1010", "1100", "2000"])

    const accountMap: Record<string, string> = {}
    accounts?.forEach((a: any) => {
      if (a.account_code === "1000" || a.account_code === "1010") accountMap.cash = accountMap.cash || a.id
      if (a.account_code === "1100") accountMap.ar = a.id
      if (a.account_code === "2000") accountMap.ap = a.id
    })

    // جلب المدفوعات المطلوب إصلاحها
    let query = supabase
      .from("payments")
      .select("id, payment_date, amount, payment_method, account_id, invoice_id, bill_id, customer_id, supplier_id, company_id")
      .eq("company_id", companyId)
      .is("journal_entry_id", null)
      .gt("amount", 0)

    if (paymentIds.length > 0) {
      query = query.in("id", paymentIds)
    }

    const { data: payments, error: paymentsError } = await query
    if (paymentsError) {
      return NextResponse.json({ error: paymentsError.message }, { status: 500 })
    }

    const results: { id: string; status: string; journalId?: string; error?: string }[] = []

    for (const payment of (payments || []) as PaymentData[]) {
      try {
        // استخدام account_id من الدفعة أولاً
        const cashAccountId = payment.account_id || accountMap.cash
        if (!cashAccountId) {
          results.push({ id: payment.id, status: "skipped", error: "No cash account" })
          continue
        }

        // تحديد الحساب المقابل
        let contraAccountId: string | null = null
        let description = ""
        let refType = "payment"

        if (payment.invoice_id && accountMap.ar) {
          contraAccountId = accountMap.ar
          description = `دفعة على فاتورة مبيعات`
          refType = "invoice_payment"
        } else if (payment.bill_id && accountMap.ap) {
          contraAccountId = accountMap.ap
          description = `دفعة على فاتورة شراء`
          refType = "bill_payment"
        } else {
          results.push({ id: payment.id, status: "skipped", error: "No contra account" })
          continue
        }

        if (dryRun) {
          results.push({ id: payment.id, status: "would_create", journalId: "dry-run" })
          continue
        }

        // إنشاء القيد
        const { data: entry, error: entryError } = await supabase
          .from("journal_entries")
          .insert({
            company_id: companyId,
            reference_type: refType,
            reference_id: payment.invoice_id || payment.bill_id,
            entry_date: payment.payment_date,
            description: description,
          })
          .select()
          .single()

        if (entryError || !entry) {
          results.push({ id: payment.id, status: "error", error: entryError?.message || "Failed to create entry" })
          continue
        }

        // إنشاء سطور القيد
        const lines = payment.invoice_id
          ? [
              { journal_entry_id: entry.id, account_id: cashAccountId, debit_amount: payment.amount, credit_amount: 0, description: "النقد/البنك" },
              { journal_entry_id: entry.id, account_id: contraAccountId, debit_amount: 0, credit_amount: payment.amount, description: "الذمم المدينة" },
            ]
          : [
              { journal_entry_id: entry.id, account_id: contraAccountId, debit_amount: payment.amount, credit_amount: 0, description: "الذمم الدائنة" },
              { journal_entry_id: entry.id, account_id: cashAccountId, debit_amount: 0, credit_amount: payment.amount, description: "النقد/البنك" },
            ]

        await supabase.from("journal_entry_lines").insert(lines)

        // تحديث الدفعة لربطها بالقيد
        await supabase.from("payments").update({ journal_entry_id: entry.id }).eq("id", payment.id)

        results.push({ id: payment.id, status: "created", journalId: entry.id })
      } catch (err: any) {
        results.push({ id: payment.id, status: "error", error: err.message })
      }
    }

    const created = results.filter(r => r.status === "created").length
    const skipped = results.filter(r => r.status === "skipped").length
    const errors = results.filter(r => r.status === "error").length

    return NextResponse.json({
      success: true,
      dryRun,
      summary: { total: results.length, created, skipped, errors },
      results,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}


import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// =====================================================
// API شامل لصيانة الفواتير وقيودها المحاسبية
// يعالج: sent, paid, partially_paid
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
    cash: bySubType("cash") || byCode("1000") || byName("الصندوق") || byName("النقد"),
    bank: bySubType("bank") || byCode("1100") || byName("البنك"),
    shippingAccount: bySubType("shipping_income") || byCode("4100") || byName("الشحن") || byName("التوصيل")
  }
}

// دالة لحساب إجمالي COGS
async function calculateCOGS(supabase: any, invoiceId: string) {
  const { data: invItems } = await supabase
    .from("invoice_items")
    .select("product_id, quantity, products(cost_price, item_type)")
    .eq("invoice_id", invoiceId)

  return (invItems || [])
    .filter((it: any) => it.products?.item_type !== 'service')
    .reduce((sum: number, it: any) => {
      const cost = Number(it.products?.cost_price || 0)
      return sum + Number(it.quantity || 0) * cost
    }, 0)
}

// دالة لإنشاء قيد COGS فقط (للفواتير المدفوعة)
async function createCOGSEntry(supabase: any, invoice: any, mapping: any) {
  // التحقق من عدم وجود COGS سابق
  const { data: existingCOGS } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("company_id", mapping.companyId)
    .eq("reference_type", "invoice_cogs")
    .eq("reference_id", invoice.id)
    .limit(1)

  if (existingCOGS && existingCOGS.length > 0) return false

  const totalCOGS = await calculateCOGS(supabase, invoice.id)

  if (totalCOGS > 0 && mapping.cogs && mapping.inventory) {
    const { data: entry, error: entryError } = await supabase
      .from("journal_entries")
      .insert({
        company_id: mapping.companyId,
        reference_type: "invoice_cogs",
        reference_id: invoice.id,
        entry_date: invoice.invoice_date,
        description: `تكلفة مبيعات للفاتورة ${invoice.invoice_number}`,
      })
      .select()
      .single()

    if (!entryError && entry) {
      await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: entry.id, account_id: mapping.cogs, debit_amount: totalCOGS, credit_amount: 0, description: "تكلفة البضاعة المباعة" },
        { journal_entry_id: entry.id, account_id: mapping.inventory, debit_amount: 0, credit_amount: totalCOGS, description: "المخزون" },
      ])
      return true
    }
  }
  return false
}

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
    .in("reference_type", ["invoice", "invoice_payment", "invoice_cogs"])

  if (wrongEntries && wrongEntries.length > 0) {
    const entryIds = wrongEntries.map((e: any) => e.id)
    await supabase.from("journal_entry_lines").delete().in("journal_entry_id", entryIds)
    await supabase.from("journal_entries").delete().in("id", entryIds)
    return wrongEntries.length
  }
  return 0
}

// ===== POST: إصلاح الفواتير =====
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

    const body = await request.json().catch(() => ({}))
    const filterStatus = body.status || "all" // all, sent, paid, partially_paid

    const mapping = await findAccountIds(supabase, company.id)
    if (!mapping) {
      return NextResponse.json({ error: "لم يتم العثور على الحسابات" }, { status: 404 })
    }

    // جلب الفواتير حسب الفلتر
    let query = supabase
      .from("invoices")
      .select("id, invoice_number, status, total_amount, subtotal, shipping, tax_amount, paid_amount, invoice_date")
      .eq("company_id", company.id)

    if (filterStatus !== "all") {
      query = query.eq("status", filterStatus)
    } else {
      query = query.in("status", ["sent", "paid", "partially_paid"])
    }

    const { data: invoices } = await query

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({
        message: "لا توجد فواتير تحتاج إصلاح",
        results: { sent: { fixed: 0 }, paid: { fixed: 0 }, partially_paid: { fixed: 0 } }
      })
    }

    const results = {
      sent: { fixed: 0, deletedEntries: 0, cogsCreated: 0, inventoryCreated: 0, invoices: [] as string[] },
      paid: { fixed: 0, salesCreated: 0, cogsCreated: 0, paymentCreated: 0, invoices: [] as string[] },
      partially_paid: { fixed: 0, salesCreated: 0, cogsCreated: 0, paymentCreated: 0, invoices: [] as string[] }
    }

    for (const invoice of invoices) {
      if (invoice.status === "sent") {
        // ===== الفواتير المرسلة =====
        // 1. حذف القيود الخاطئة (invoice, invoice_payment, invoice_cogs)
        const deleted = await deleteWrongEntriesForSentInvoice(supabase, company.id, invoice.id)
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
        let fixed = false

        // 1. إنشاء قيد المبيعات والذمم
        if (await createSalesJournal(supabase, invoice, mapping)) {
          results.paid.salesCreated++
          fixed = true
        }

        // 2. إنشاء قيد COGS
        if (await createCOGSEntry(supabase, invoice, mapping)) {
          results.paid.cogsCreated++
          fixed = true
        }

        // 3. إنشاء معاملات المخزون
        if (await createInventoryTransactions(supabase, invoice, mapping)) {
          fixed = true
        }

        // 4. إنشاء قيد الدفع الكامل
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
        let fixed = false

        // 1. إنشاء قيد المبيعات والذمم (بقيمة الفاتورة الكاملة)
        if (await createSalesJournal(supabase, invoice, mapping)) {
          results.partially_paid.salesCreated++
          fixed = true
        }

        // 2. إنشاء قيد COGS
        if (await createCOGSEntry(supabase, invoice, mapping)) {
          results.partially_paid.cogsCreated++
          fixed = true
        }

        // 3. إنشاء معاملات المخزون
        if (await createInventoryTransactions(supabase, invoice, mapping)) {
          fixed = true
        }

        // 4. إنشاء قيد الدفع بالمبلغ المدفوع فقط
        const paidAmount = Number(invoice.paid_amount || 0)
        if (paidAmount > 0 && await createPaymentJournal(supabase, invoice, mapping, paidAmount)) {
          results.partially_paid.paymentCreated++
          fixed = true
        }

        if (fixed) {
          results.partially_paid.fixed++
          results.partially_paid.invoices.push(invoice.invoice_number)
        }
      }
    }

    const totalFixed = results.sent.fixed + results.paid.fixed + results.partially_paid.fixed

    return NextResponse.json({
      message: `تم إصلاح ${totalFixed} فاتورة`,
      results
    })

  } catch (error: any) {
    console.error("Error fixing invoice journals:", error)
    return NextResponse.json({ error: error.message || "خطأ في الإصلاح" }, { status: 500 })
  }
}

// ===== GET: فحص حالة الفواتير =====
export async function GET(request: Request) {
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

    // جلب جميع الفواتير غير المسودة
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, status, total_amount, paid_amount, invoice_date")
      .eq("company_id", company.id)
      .in("status", ["sent", "paid", "partially_paid"])

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({
        summary: { sent: 0, paid: 0, partially_paid: 0 },
        issues: { sent: [], paid: [], partially_paid: [] },
        totalIssues: 0
      })
    }

    const invoiceIds = invoices.map(inv => inv.id)

    // جلب جميع القيود المحاسبية
    const { data: allEntries } = await supabase
      .from("journal_entries")
      .select("id, reference_id, reference_type")
      .eq("company_id", company.id)
      .in("reference_id", invoiceIds)

    // جلب معاملات المخزون
    const { data: inventoryTx } = await supabase
      .from("inventory_transactions")
      .select("id, reference_id")
      .in("reference_id", invoiceIds)
      .eq("transaction_type", "sale")

    const summary = { sent: 0, paid: 0, partially_paid: 0 }
    const issues: any = { sent: [], paid: [], partially_paid: [] }

    for (const inv of invoices) {
      const status = inv.status as "sent" | "paid" | "partially_paid"
      summary[status]++

      const invEntries = (allEntries || []).filter(e => e.reference_id === inv.id)
      const hasSalesEntry = invEntries.some(e => e.reference_type === "invoice")
      const hasCOGSEntry = invEntries.some(e => e.reference_type === "invoice_cogs")
      const hasPaymentEntry = invEntries.some(e => e.reference_type === "invoice_payment")
      const hasInventory = (inventoryTx || []).some(t => t.reference_id === inv.id)

      const issuesList: string[] = []

      if (status === "sent") {
        // الفاتورة المرسلة: يجب ألا يكون لها أي قيود محاسبية - فقط معاملات مخزون
        if (hasSalesEntry) issuesList.push("قيد مبيعات خاطئ")
        if (hasPaymentEntry) issuesList.push("قيد دفع خاطئ")
        if (hasCOGSEntry) issuesList.push("قيد COGS خاطئ") // الفاتورة المرسلة لا يجب أن يكون لها COGS
        if (!hasInventory) issuesList.push("لا يوجد خصم مخزون")
      } else if (status === "paid" || status === "partially_paid") {
        // الفاتورة المدفوعة: يجب أن يكون لها جميع القيود
        if (!hasSalesEntry) issuesList.push("لا يوجد قيد مبيعات")
        if (!hasCOGSEntry) issuesList.push("لا يوجد قيد COGS")
        if (!hasPaymentEntry) issuesList.push("لا يوجد قيد دفع")
        if (!hasInventory) issuesList.push("لا يوجد خصم مخزون")
      }

      if (issuesList.length > 0) {
        issues[status].push({
          id: inv.id,
          invoice_number: inv.invoice_number,
          total_amount: inv.total_amount,
          paid_amount: inv.paid_amount,
          issues: issuesList
        })
      }
    }

    const totalIssues = issues.sent.length + issues.paid.length + issues.partially_paid.length

    return NextResponse.json({
      summary,
      issues,
      totalIssues,
      details: {
        sentWithWrongEntries: issues.sent.filter((i: any) => i.issues.some((is: string) => is.includes("خاطئ"))).length,
        sentMissingInventory: issues.sent.filter((i: any) => i.issues.includes("لا يوجد خصم مخزون")).length,
        paidMissingEntries: issues.paid.length,
        partiallyPaidMissingEntries: issues.partially_paid.length
      }
    })

  } catch (error: any) {
    console.error("Error checking invoice journals:", error)
    return NextResponse.json({ error: error.message || "خطأ في الفحص" }, { status: 500 })
  }
}


import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

type ResultSummary = {
  invoice_number: string
  reversed_payment_entries: number
  reversed_invoice_entries: number
  reversed_cogs_entries: number
  sale_reversal_transactions: number
  updated_products: number
  deleted_original_sales: number
  cleanup_reversal_duplicates_deleted?: number
  products_adjusted_down?: number
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
  const byNameIncludes = (kw: string) => accounts.find((a) => String(a.account_name || "").toLowerCase().includes(kw.toLowerCase()))?.id
  const byCode = (code: string) => accounts.find((a) => String(a.account_code || "").toUpperCase() === code.toUpperCase())?.id
  const bySubType = (st: string) => accounts.find((a) => String(a.sub_type || "").toLowerCase() === st.toLowerCase())?.id
  const byType = (t: string) => accounts.find((a) => String(a.account_type || "").toLowerCase() === t.toLowerCase())?.id

  const ar = bySubType("ar") || byNameIncludes("accounts receivable") || byCode("1100")
  const revenue = bySubType("revenue") || byType("revenue") || byCode("4000")
  const vatPayable = bySubType("vat_payable") || byNameIncludes("vat payable") || byNameIncludes("ضريبة") || byCode("2100")
  const cash = bySubType("cash") || byNameIncludes("cash") || byCode("1000")
  const bank = bySubType("bank") || byNameIncludes("bank") || byCode("1010")
  const inventory = bySubType("inventory") || byNameIncludes("inventory") || byCode("1200")
  const cogs = bySubType("cogs") || byNameIncludes("cost of goods") || byType("expense") || byCode("5000")
  const customerAdvance = bySubType("customer_advance") || byNameIncludes("advance from customers") || byNameIncludes("deposit") || byType("liability") || byCode("1500")

  return { ar, revenue, vatPayable, cash, bank, inventory, cogs, customerAdvance }
}

async function handle(request: NextRequest) {
  try {
    const supabase = await createClient()
    const companyId = await getCompanyId(supabase)
    if (!companyId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    let invoice_number = ""
    let delete_original_sales = false
    if (request.method === "GET") {
      const params = request.nextUrl.searchParams
      invoice_number = String(params.get("invoice_number") || "").trim()
      delete_original_sales = String(params.get("delete_original_sales") || "").toLowerCase() === "true"
    } else {
      const body = await request.json().catch(() => ({}))
      invoice_number = String(body?.invoice_number || "").trim()
      delete_original_sales = Boolean(body?.delete_original_sales)
    }
    if (!invoice_number) return NextResponse.json({ error: "missing invoice_number" }, { status: 400 })

    // Load accounts mapping
    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type, sub_type")
      .eq("company_id", companyId)
    const mapping = mapAccounts(accounts || [])

    const summary: ResultSummary = {
      invoice_number,
      reversed_payment_entries: 0,
      reversed_invoice_entries: 0,
      reversed_cogs_entries: 0,
      sale_reversal_transactions: 0,
      updated_products: 0,
      deleted_original_sales: 0,
    }

    // 1) Reverse payments journals that reference this invoice number
    const { data: payEntries } = await supabase
      .from("journal_entries")
      .select("id, description")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice_payment")
      .ilike("description", `%${invoice_number}%`)
    for (const entry of payEntries || []) {
      const { data: existsPayRev } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", companyId)
        .eq("reference_type", "invoice_payment_reversal")
        .eq("reference_id", entry.id)
        .limit(1)
      if (existsPayRev && existsPayRev.length > 0) continue
      // derive amount from AR credit line or cash debit
      const { data: lines } = await supabase
        .from("journal_entry_lines")
        .select("account_id, debit_amount, credit_amount")
        .eq("journal_entry_id", entry.id)
      const arLine = (lines || []).find((l) => l.credit_amount && l.credit_amount > 0 && l.account_id === mapping.ar)
      const cashLine = (lines || []).find((l) => l.debit_amount && l.debit_amount > 0)
      const amount = Number(arLine?.credit_amount || cashLine?.debit_amount || 0)
      const creditAccount = mapping.customerAdvance || cashLine?.account_id || mapping.cash || mapping.bank
      if (amount > 0 && mapping.ar && creditAccount) {
        const { data: revEntry } = await supabase
          .from("journal_entries")
          .insert({
            company_id: companyId,
            reference_type: "invoice_payment_reversal",
            reference_id: entry.id,
            entry_date: new Date().toISOString().slice(0, 10),
            description: `عكس دفع مباشر/تسوية لفاتورة ${invoice_number}`,
          })
          .select()
          .single()
        if (revEntry?.id) {
          await supabase.from("journal_entry_lines").insert([
            { journal_entry_id: revEntry.id, account_id: mapping.ar, debit_amount: amount, credit_amount: 0, description: "عكس الذمم المدينة" },
            { journal_entry_id: revEntry.id, account_id: creditAccount, debit_amount: 0, credit_amount: amount, description: mapping.customerAdvance ? "عكس تسوية سلف العملاء" : "عكس نقد/بنك" },
          ])
          summary.reversed_payment_entries += 1
        }
      }
    }

    // 2) Reverse invoice AR/Revenue/VAT journals by description
    const { data: invEntries } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice")
      .ilike("description", `%${invoice_number}%`)
    for (const entry of invEntries || []) {
      const { data: existsInvRev } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", companyId)
        .eq("reference_type", "invoice_reversal")
        .eq("reference_id", entry.id)
        .limit(1)
      if (existsInvRev && existsInvRev.length > 0) continue
      // fetch amounts from lines
      const { data: lines } = await supabase
        .from("journal_entry_lines")
        .select("account_id, debit_amount, credit_amount")
        .eq("journal_entry_id", entry.id)
      const arCredit = (lines || []).find((l) => l.account_id === mapping.ar && Number(l.debit_amount || 0) === 0)
      const revenueCredit = (lines || []).find((l) => l.account_id === mapping.revenue && Number(l.credit_amount || 0) > 0)
      const vatCredit = (lines || []).find((l) => l.account_id === mapping.vatPayable && Number(l.credit_amount || 0) > 0)
      const total = Number(arCredit?.credit_amount || 0)
      const revenueAmt = Number(revenueCredit?.credit_amount || 0)
      const vatAmt = Number(vatCredit?.credit_amount || 0)
      if (mapping.ar && mapping.revenue && total > 0) {
        const { data: revEntryInv } = await supabase
          .from("journal_entries")
          .insert({
            company_id: companyId,
            reference_type: "invoice_reversal",
            reference_id: entry.id,
            entry_date: new Date().toISOString().slice(0, 10),
            description: `عكس قيد الفاتورة ${invoice_number}`,
          })
          .select()
          .single()
        if (revEntryInv?.id) {
          const linesIns: any[] = [
            { journal_entry_id: revEntryInv.id, account_id: mapping.ar, debit_amount: 0, credit_amount: total, description: "عكس الذمم المدينة" },
            { journal_entry_id: revEntryInv.id, account_id: mapping.revenue, debit_amount: revenueAmt || total, credit_amount: 0, description: "عكس الإيراد" },
          ]
          if (mapping.vatPayable && vatAmt > 0) {
            linesIns.splice(1, 0, { journal_entry_id: revEntryInv.id, account_id: mapping.vatPayable, debit_amount: vatAmt, credit_amount: 0, description: "عكس ضريبة مستحقة" })
          }
          await supabase.from("journal_entry_lines").insert(linesIns)
          summary.reversed_invoice_entries += 1
        }
      }
    }

    // 3) Reverse COGS based on invoice_cogs entries by description
    const { data: cogsEntries } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice_cogs")
      .ilike("description", `%${invoice_number}%`)
    for (const entry of cogsEntries || []) {
      const { data: existsCogsRev } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", companyId)
        .eq("reference_type", "invoice_cogs_reversal")
        .eq("reference_id", entry.id)
        .limit(1)
      if (existsCogsRev && existsCogsRev.length > 0) continue
      const { data: lines } = await supabase
        .from("journal_entry_lines")
        .select("account_id, debit_amount, credit_amount")
        .eq("journal_entry_id", entry.id)
      const cogsDebit = (lines || []).find((l) => l.account_id === mapping.cogs && Number(l.debit_amount || 0) > 0)
      const amount = Number(cogsDebit?.debit_amount || 0)
      if (mapping.inventory && mapping.cogs && amount > 0) {
        const { data: revEntryCogs } = await supabase
          .from("journal_entries")
          .insert({
            company_id: companyId,
            reference_type: "invoice_cogs_reversal",
            reference_id: entry.id,
            entry_date: new Date().toISOString().slice(0, 10),
            description: `عكس تكلفة المبيعات للفاتورة ${invoice_number}`,
          })
          .select()
          .single()
        if (revEntryCogs?.id) {
          await supabase.from("journal_entry_lines").insert([
            { journal_entry_id: revEntryCogs.id, account_id: mapping.inventory, debit_amount: amount, credit_amount: 0, description: "عودة للمخزون" },
            { journal_entry_id: revEntryCogs.id, account_id: mapping.cogs, debit_amount: 0, credit_amount: amount, description: "عكس تكلفة البضاعة المباعة" },
          ])
          summary.reversed_cogs_entries += 1
        }
      }
    }

    // 4) Reverse inventory transactions idempotently and restore product quantities
    const { data: saleTx } = await supabase
      .from("inventory_transactions")
      .select("id, product_id, quantity_change")
      .eq("company_id", companyId)
      .eq("transaction_type", "sale")
      .ilike("notes", `%${invoice_number}%`)

    const impactedProducts = new Set<string>()
    for (const t of saleTx || []) impactedProducts.add(String(t.product_id))

    if (saleTx && saleTx.length > 0) {
      // Sum sale quantities per product
      const saleSum = new Map<string, number>()
      for (const t of saleTx) {
        const cur = saleSum.get(t.product_id) || 0
        saleSum.set(t.product_id, cur + Math.abs(Number(t.quantity_change || 0)))
      }
      // Sum existing reversals for this invoice per product
      const { data: existingRev } = await supabase
        .from("inventory_transactions")
        .select("product_id, quantity_change")
        .eq("company_id", companyId)
        .eq("transaction_type", "sale_reversal")
        .ilike("notes", `%${invoice_number}%`)
      const revSum = new Map<string, number>()
      for (const r of existingRev || []) {
        const cur = revSum.get(r.product_id) || 0
        revSum.set(r.product_id, cur + Math.abs(Number(r.quantity_change || 0)))
      }

      // Insert only the delta needed per product
      for (const [pid, sQty] of saleSum.entries()) {
        const rQty = revSum.get(pid) || 0
        const needed = Math.max(0, sQty - rQty)
        if (needed > 0) {
          const { error: insErr2 } = await supabase.from("inventory_transactions").insert({
            company_id: companyId,
            product_id: pid,
            transaction_type: "sale_reversal",
            quantity_change: needed,
            notes: `عكس مخزون بسبب حذف الفاتورة ${invoice_number}`,
          })
          if (insErr2) throw insErr2
          summary.sale_reversal_transactions += 1

          const { data: prod } = await supabase
            .from("products")
            .select("id, quantity_on_hand")
            .eq("id", pid)
            .single()
          if (prod) {
            const newQty = Number(prod.quantity_on_hand || 0) + Number(needed)
            const { error: updErr } = await supabase
              .from("products")
              .update({ quantity_on_hand: newQty })
              .eq("id", pid)
            if (updErr) throw updErr
            summary.updated_products += 1
          }
        }
      }
      if (delete_original_sales) {
        const ids = saleTx.map((t: any) => t.id)
        const { error: delErr } = await supabase.from("inventory_transactions").delete().in("id", ids)
        if (delErr) throw delErr
        summary.deleted_original_sales = ids.length
      }

      // 4.b) Cleanup duplicate unlabeled reversals for impacted products (older repairs)
      const impactedList = Array.from(impactedProducts)
      if (impactedList.length > 0) {
        const { data: oldRev } = await supabase
          .from("inventory_transactions")
          .select("id, product_id, quantity_change, notes")
          .eq("company_id", companyId)
          .eq("transaction_type", "sale_reversal")
          .in("product_id", impactedList)
          .ilike("notes", "عكس مخزون بسبب حذف الفاتورة%")
        const toDelete = [] as string[]
        const adjustDown = new Map<string, number>()
        for (const r of oldRev || []) {
          const hasInvoiceTag = String(r.notes || "").includes(invoice_number)
          if (!hasInvoiceTag) {
            toDelete.push(r.id)
            const cur = adjustDown.get(r.product_id) || 0
            adjustDown.set(r.product_id, cur + Math.abs(Number(r.quantity_change || 0)))
          }
        }
        if (toDelete.length > 0) {
          const { error: delOldErr } = await supabase
            .from("inventory_transactions")
            .delete()
            .in("id", toDelete)
          if (delOldErr) throw delOldErr
          summary.cleanup_reversal_duplicates_deleted = toDelete.length

          for (const [pid, downQty] of adjustDown.entries()) {
            const { data: prod } = await supabase
              .from("products")
              .select("id, quantity_on_hand")
              .eq("id", pid)
              .single()
            if (prod) {
              const newQty = Number(prod.quantity_on_hand || 0) - Number(downQty)
              const { error: updErr2 } = await supabase
                .from("products")
                .update({ quantity_on_hand: newQty })
                .eq("id", pid)
              if (updErr2) throw updErr2
              summary.products_adjusted_down = (summary.products_adjusted_down || 0) + 1
            }
          }
        }
      }
    }

    // 5) Backfill missing 'sale' transactions linked to COGS journal (idempotent)
    const { data: invoiceRow } = await supabase
      .from("invoices")
      .select("id")
      .eq("company_id", companyId)
      .eq("invoice_number", invoice_number)
      .single()
    if (invoiceRow?.id) {
      const { data: cogsEntry } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", companyId)
        .eq("reference_type", "invoice_cogs")
        .eq("reference_id", invoiceRow.id)
        .limit(1)
        .single()
      if (cogsEntry?.id) {
        const { data: items } = await supabase
          .from("invoice_items")
          .select("product_id, quantity")
          .eq("invoice_id", invoiceRow.id)
        const saleBackfill = (items || []).filter((it: any) => !!it.product_id).map((it: any) => ({
          company_id: companyId,
          product_id: it.product_id,
          transaction_type: "sale",
          quantity_change: -Number(it.quantity || 0),
          reference_id: invoiceRow.id,
          journal_entry_id: cogsEntry.id,
          notes: `بيع ${invoice_number}`,
        }))
        if (saleBackfill.length > 0) {
          const { error: upErr } = await supabase
            .from("inventory_transactions")
            .upsert(saleBackfill, { onConflict: "journal_entry_id,product_id,transaction_type" })
          if (upErr) console.warn("Failed backfilling sale transactions", upErr)
        }
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

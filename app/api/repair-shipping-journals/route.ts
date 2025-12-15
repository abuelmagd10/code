import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

type RepairSummary = {
  scanned_invoices: number
  scanned_entries: number
  fixed_entries: number
  skipped_no_entry: number
  skipped_already_balanced: number
}

import { requireOwnerOrAdmin } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError, notFoundError } from "@/lib/api-error-handler"

function mapAccounts(accounts: any[]) {
  const norm = (s: string) => String(s || "").toLowerCase()
  const byCode = (code: string) => accounts.find((a) => String(a.account_code || "").toUpperCase() === code.toUpperCase())?.id
  const hasNameKw = (a: any, kws: string[]) => kws.some((kw) => norm(a.account_name).includes(norm(kw)))
  const bySubTypeEq = (st: string) => accounts.find((a) => norm(a.sub_type) === norm(st))?.id

  const arCandidates = accounts.filter((a) =>
    norm(a.sub_type) === "accounts_receivable" ||
    hasNameKw(a, ["receivable", "accounts receivable", "ar", "العملاء", "حسابات العملاء", "ذمم العملاء", "مدينون"]) ||
    String(a.account_code).toUpperCase() === "1100"
  )
  const revenueCandidates = accounts.filter((a) =>
    norm(a.sub_type) === "sales_revenue" ||
    hasNameKw(a, ["revenue", "sales", "income", "المبيعات", "ايرادات", "إيرادات", "دخل"]) ||
    String(a.account_code).toUpperCase() === "4000"
  )
  const vatCandidates = accounts.filter((a) =>
    norm(a.sub_type) === "vat_output" ||
    hasNameKw(a, ["vat", "tax", "ضريبة", "القيمة المضافة", "ضريبة القيمة المضافة", "مخرجات الضريبة"]) ||
    String(a.account_code).toUpperCase() === "2100"
  )

  const pickFirstId = (list: any[]) => list.length > 0 ? list[0].id : undefined

  const ar = pickFirstId(arCandidates) || bySubTypeEq("accounts_receivable")
  const revenue = pickFirstId(revenueCandidates) || bySubTypeEq("sales_revenue")
  const vatPayable = pickFirstId(vatCandidates) || bySubTypeEq("vat_output")
  return { ar, revenue, vatPayable }
}

async function handle(request: NextRequest) {
  try {
    // === تحصين أمني: استخدام requireOwnerOrAdmin ===
    const { user, companyId, member, error } = await requireOwnerOrAdmin(request)

    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    }
    // === نهاية التحصين الأمني ===

    const supabase = await createClient()
    const debug = (request.nextUrl?.searchParams?.get("debug") || "").toLowerCase() === "1" || (request.nextUrl?.searchParams?.get("debug") || "").toLowerCase() === "true"

    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type, sub_type")
      .eq("company_id", companyId)
  const mapping = mapAccounts(accounts || [])

  // Work only with leaf accounts when selecting candidates
  const parentIds = new Set((accounts || []).map((a: any) => a.parent_id).filter(Boolean))
  const leafAccounts = (accounts || []).filter((a: any) => !parentIds.has(a.id))

  // Build sets of AR and VAT account IDs to recognize multiple possible accounts, not a single ID
  const norm = (s: string) => String(s || "").toLowerCase()
  const hasNameKw = (a: any, kws: string[]) => kws.some((kw) => norm(a.account_name).includes(norm(kw)))
  const arIds = new Set(
    (leafAccounts || [])
      .filter(
        (a) =>
          norm(a.sub_type) === "accounts_receivable" ||
          hasNameKw(a, ["receivable", "accounts receivable", "ar", "العملاء", "حسابات العملاء", "ذمم العملاء", "مدينون"]) ||
          String(a.account_code).toUpperCase() === "1100"
      )
      .map((a) => a.id)
  )
  const vatIds = new Set(
    (leafAccounts || [])
      .filter(
        (a) =>
          norm(a.sub_type) === "vat_output" ||
          hasNameKw(a, ["vat", "tax", "ضريبة", "القيمة المضافة", "ضريبة القيمة المضافة", "مخرجات الضريبة"]) ||
          String(a.account_code).toUpperCase() === "2100"
      )
      .map((a) => a.id)
  )
  const revenueIds = new Set(
    (leafAccounts || [])
      .filter(
        (a) =>
          ["revenue", "income", "sales", "sales_revenue", "other_income"].includes(norm(a.sub_type)) ||
          hasNameKw(a, [
            "revenue",
            "sales",
            "income",
            "ايراد",
            "إيراد",
            "ايرادات",
            "إيرادات",
            "المبيعات",
            "دخل",
          ]) ||
          String(a.account_code).toUpperCase() === "4000"
      )
      .map((a) => a.id)
  )

  // Fallback: if mapping didn't find AR/Revenue, pick from identified sets
  if (!mapping.ar && arIds.size > 0) {
    // Prefer account with code 1100 if available
    const preferredAr = (accounts || []).find(
      (a) => arIds.has(a.id) && String(a.account_code).toUpperCase() === "1100"
    )
    mapping.ar = preferredAr?.id ?? [...arIds][0]
  }
  if (!mapping.revenue && revenueIds.size > 0) {
    // Prefer account with code 4000 if available
    const preferredRev = (accounts || []).find(
      (a) => revenueIds.has(a.id) && String(a.account_code).toUpperCase() === "4000"
    )
    mapping.revenue = preferredRev?.id ?? [...revenueIds][0]
  }

  // Build an index of account metadata for robust per-line classification
  const accountById = new Map<string, any>()
  ;(accounts || []).forEach((a: any) => {
    accountById.set(a.id, a)
  })

    // Fetch all invoice-linked journal entries for company and compute missing shipping credit directly
    const { data: entries } = await supabase
      .from("journal_entries")
      .select("id, description")
      .eq("company_id", companyId)
      .eq("reference_type", "invoice")

    const summary: RepairSummary = {
      scanned_invoices: 0,
      scanned_entries: (entries || []).length,
      fixed_entries: 0,
      skipped_no_entry: 0,
      skipped_already_balanced: 0,
    }

    const details: any[] = []

    for (const entry of entries || []) {
      const { data: lines } = await supabase
        .from("journal_entry_lines")
        .select("id, account_id, debit_amount, credit_amount, description")
        .eq("journal_entry_id", entry.id)

      // Helpers: classify lines using account metadata
      const getAcc = (id: any) => accountById.get(String(id)) || {}
      const norm = (s: string) => String(s || '').toLowerCase()
      const nameHas = (id: any, kws: string[]) => {
        const nm = norm(getAcc(id).account_name)
        return kws.some((kw) => nm.includes(norm(kw)))
      }
      const subTypeIs = (id: any, st: string) => norm(getAcc(id).sub_type) === norm(st)
      const typeIs = (id: any, t: string) => norm(getAcc(id).account_type) === norm(t)

      const isVatLine = (l: any) =>
        subTypeIs(l.account_id, 'vat_output') ||
        nameHas(l.account_id, ['vat', 'tax', 'ضريبة', 'القيمة المضافة'])
      const isArLine = (l: any) =>
        subTypeIs(l.account_id, 'accounts_receivable') ||
        nameHas(l.account_id, ['receivable', 'accounts receivable', 'العملاء', 'حسابات العملاء', 'ذمم العملاء', 'مدينون']) ||
        typeIs(l.account_id, 'asset')

      const isRevenueAccount = (id: any) =>
        subTypeIs(id, 'sales_revenue') ||
        typeIs(id, 'income') ||
        nameHas(id, ['revenue', 'sales', 'income', 'المبيعات', 'ايرادات', 'إيرادات', 'دخل'])
      const arDebit = (lines || []).reduce((acc, l) => acc + (isArLine(l) ? Number(l.debit_amount || 0) : 0), 0)
      const vatCredit = (lines || []).reduce((acc, l) => acc + (isVatLine(l) ? Number(l.credit_amount || 0) : 0), 0)
      const nonVatCredits = (lines || []).reduce((acc, l) => acc + (!isVatLine(l) ? Number(l.credit_amount || 0) : 0), 0)
      const desiredNonVatCredits = Math.max(0, arDebit - vatCredit)

      // If already balanced on non-VAT portion, skip
      if (Math.abs(nonVatCredits - desiredNonVatCredits) < 0.0001) {
        summary.skipped_already_balanced += 1
        if (debug) {
          details.push({
            entry_id: entry.id,
            status: 'skipped_already_balanced',
            arDebit,
            vatCredit,
            nonVatCredits,
            desiredNonVatCredits,
          })
        }
        continue
      }

      const missing = Math.max(0, desiredNonVatCredits - nonVatCredits)
      const surplus = Math.max(0, nonVatCredits - desiredNonVatCredits)
      // If entry is over-credited on non-VAT portion, normalize by adjusting shipping credit lines
      if (surplus > 0) {
        const isShippingLine = (l: any) => {
          const d = norm(l.description)
          return d.includes('الشحن') || d.includes('شحن') || d.includes('shipping') || d.includes('ship')
        }
        let remaining = surplus
        const shippingCredits = (lines || [])
          .filter((l) => Number(l.credit_amount || 0) > 0 && !isVatLine(l) && isShippingLine(l))
          // prioritize larger credits first
          .sort((a, b) => Number(b.credit_amount || 0) - Number(a.credit_amount || 0))

        for (const sc of shippingCredits) {
          if (remaining <= 0) break
          const amt = Number(sc.credit_amount || 0)
          if (amt > remaining) {
            const newAmt = amt - remaining
            await supabase
              .from('journal_entry_lines')
              .update({ credit_amount: newAmt })
              .eq('id', sc.id)
            if (debug) {
              details.push({
                entry_id: entry.id,
                status: 'adjusted',
                reason: 'reduce_shipping',
                line_id: sc.id,
                old_amount: amt,
                new_amount: newAmt,
              })
            }
            remaining = 0
          } else {
            await supabase
              .from('journal_entry_lines')
              .delete()
              .eq('id', sc.id)
            if (debug) {
              details.push({
                entry_id: entry.id,
                status: 'adjusted',
                reason: 'delete_shipping',
                line_id: sc.id,
                amount_removed: amt,
              })
            }
            remaining -= amt
          }
        }

        if (remaining <= 0) {
          summary.fixed_entries += 1
        } else if (debug) {
          details.push({
            entry_id: entry.id,
            status: 'surplus_remaining',
            remaining,
            arDebit,
            vatCredit,
            nonVatCredits,
            desiredNonVatCredits,
          })
        }
        continue
      }

      if (missing > 0) {
        // Choose a revenue account from existing credit lines in this entry, excluding VAT
        const existingRevenueCredit = (lines || []).find((l) => Number(l.credit_amount || 0) > 0 && !isVatLine(l) && isRevenueAccount(l.account_id))
        let selectionReason = 'none'
        let revenueAccountId = existingRevenueCredit?.account_id
        if (revenueAccountId) selectionReason = 'existing_credit'
        if (!revenueAccountId && mapping.revenue) {
          revenueAccountId = mapping.revenue
          selectionReason = 'mapping_revenue'
        }
        if (!revenueAccountId && revenueIds.size > 0) {
          revenueAccountId = [...revenueIds][0]
          selectionReason = 'revenueIds'
        }
        if (!revenueAccountId) {
          // As a final fallback, pick any income-type account from chart of accounts
          const fallbackIncome = (leafAccounts || []).find((a: any) => norm(a.account_type) === 'income')?.id
          if (!fallbackIncome) {
            // If nothing found, skip to avoid mis-posting
            if (debug) {
              details.push({
                entry_id: entry.id,
                status: 'skipped_no_revenue_candidate',
                arDebit,
                vatCredit,
                nonVatCredits,
                desiredNonVatCredits,
                missing,
              })
            }
            continue
          }
          await supabase.from("journal_entry_lines").insert({
            journal_entry_id: entry.id,
            account_id: fallbackIncome,
            debit_amount: 0,
            credit_amount: missing,
            description: "الشحن",
          })
          summary.fixed_entries += 1
          if (debug) {
            details.push({
              entry_id: entry.id,
              status: 'fixed',
              reason: 'fallback_income',
              account_id: fallbackIncome,
              amount: missing,
            })
          }
        } else {
          await supabase.from("journal_entry_lines").insert({
            journal_entry_id: entry.id,
            account_id: revenueAccountId,
            debit_amount: 0,
            credit_amount: missing,
            description: "الشحن",
          })
          summary.fixed_entries += 1
          if (debug) {
            details.push({
              entry_id: entry.id,
              status: 'fixed',
              reason: selectionReason,
              account_id: revenueAccountId,
              amount: missing,
            })
          }
        }
      } else if (debug) {
        details.push({
          entry_id: entry.id,
          status: 'no_missing',
          arDebit,
          vatCredit,
          nonVatCredits,
          desiredNonVatCredits,
          missing,
        })
      }
    }

    const payload = debug ? { ...summary, details } : summary
    return apiSuccess(payload)
  } catch (err: any) {
    return internalError("حدث خطأ أثناء إصلاح قيود الشحن", String(err))
  }
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}

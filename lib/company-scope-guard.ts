/**
 * 🔐 Cross-company reference guard (v3.74.655)
 * ------------------------------------------------------------------
 * A user may belong to several companies with the same email. Their client
 * may therefore submit a foreign-key id (account, customer, supplier, product,
 * tax code…) that belongs to ANOTHER of their companies. The server is scoped
 * to the ACTIVE company, so such an id must be rejected — otherwise the action
 * either fails with a confusing error or silently links cross-company data
 * (e.g. a GL entry posted to another company's account).
 *
 * These helpers centralise the "does this id belong to the active company?"
 * check. They FAIL CLOSED: if a table query errors, the ids are treated as not
 * belonging to the company.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export class CrossCompanyRefError extends Error {
  status = 400
  problems: { table: string; missing: string[] }[]
  constructor(message: string, problems: { table: string; missing: string[] }[]) {
    super(message)
    this.name = "CrossCompanyRefError"
    this.problems = problems
  }
}

type IdGroups = Record<string, Array<string | null | undefined>>

/** Human-friendly Arabic label per table for the error message. */
const TABLE_LABELS_AR: Record<string, string> = {
  chart_of_accounts: "الحساب المحاسبي",
  customers:         "العميل",
  suppliers:         "المورد",
  vendors:           "المورد",
  products:          "الصنف/الخدمة",
  services:          "الخدمة",
  branches:          "الفرع",
  warehouses:        "المستودع",
  cost_centers:      "مركز التكلفة",
  tax_codes:         "كود الضريبة",
  invoices:          "الفاتورة",
  sales_orders:      "أمر البيع",
  purchase_orders:   "أمر الشراء",
}

/**
 * Returns the ids (grouped by table) that do NOT belong to `companyId`.
 * Empty array ⇒ everything is valid for this company.
 */
export async function findForeignCompanyIds(
  supabase: SupabaseClient,
  companyId: string,
  groups: IdGroups
): Promise<{ table: string; missing: string[] }[]> {
  const problems: { table: string; missing: string[] }[] = []

  for (const [table, rawIds] of Object.entries(groups)) {
    const ids = Array.from(
      new Set((rawIds || []).filter((x): x is string => typeof x === "string" && x.length > 0))
    )
    if (ids.length === 0) continue

    const { data, error } = await supabase
      .from(table)
      .select("id")
      .eq("company_id", companyId)
      .in("id", ids)

    if (error) {
      // fail closed — cannot confirm ownership ⇒ treat all as foreign
      problems.push({ table, missing: ids })
      continue
    }
    const found = new Set((data || []).map((r: any) => r.id))
    const missing = ids.filter((id) => !found.has(id))
    if (missing.length) problems.push({ table, missing })
  }

  return problems
}

/**
 * Throws CrossCompanyRefError (status 400) if any submitted id does not belong
 * to the active company. Use at the start of a write handler, right after the
 * company id is resolved and before any insert/atomic RPC.
 */
export async function assertIdsBelongToCompany(
  supabase: SupabaseClient,
  companyId: string,
  groups: IdGroups
): Promise<void> {
  const problems = await findForeignCompanyIds(supabase, companyId, groups)
  if (problems.length === 0) return

  const labels = problems
    .map((p) => TABLE_LABELS_AR[p.table] || p.table)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join("، ")

  throw new CrossCompanyRefError(
    `بعض العناصر المختارة لا تخص الشركة الحالية (${labels}). حدّث الاختيار ثم أعد المحاولة.`,
    problems
  )
}

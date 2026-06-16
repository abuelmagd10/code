/**
 * CustomerSupplierBalancesWidget — v3.74.176
 *
 * Two new dashboard cards:
 *   - رصيد العملاء الدائن — sum of customer_credit_ledger.amount, joined to
 *     customers so the branch filter applies on the customer's branch.
 *   - مستحقات لنا (سلفة مورد) — sum of (vendor_credits.total_amount -
 *     applied_amount) where status='open', joined to suppliers so the
 *     branch filter applies on the supplier's branch.
 *
 * Why we don't read GL accounts_receivable/accounts_payable negative
 * balances (which is what SecondaryStatsWidget does today):
 *   - GL nets every direction together (e.g., a cash-settled supplier
 *     refund closes the vendor_credit immediately and disappears from
 *     the GL view), so the dashboard would hide credits that the
 *     supplier ledger still considers open and vice versa.
 *   - The operational truth lives in customer_credit_ledger and
 *     vendor_credits with status='open' - the same source the supplier
 *     and customer detail pages already use. The cards here mirror that
 *     so the numbers reconcile by inspection.
 *
 * Branch governance: branchId comes from app/dashboard/page.tsx which
 * builds it from visibilityRules + the user's branch. When set, we
 * filter customers/suppliers by branch_id; when null/undefined, all
 * branches are aggregated. Same rule SecondaryStatsWidget follows.
 */

import { createClient } from "@/lib/supabase/server"
import DashboardCustomerSupplierBalances from "@/components/DashboardCustomerSupplierBalances"

interface CustomerSupplierBalancesWidgetProps {
  companyId: string
  currency: string
  appLang: "ar" | "en"
  branchId?: string | null
}

export default async function CustomerSupplierBalancesWidget({
  companyId, currency, appLang, branchId,
}: CustomerSupplierBalancesWidgetProps) {
  const supabase = await createClient()

  // ── 1. Customer credit balance (sum of ledger) ────────────────────
  let customerCreditBalance = 0
  try {
    let q = supabase
      .from("customer_credit_ledger")
      .select("amount, customer:customers!inner(branch_id)")
      .eq("company_id", companyId)
    if (branchId) {
      q = q.eq("customer.branch_id", branchId)
    }
    const { data } = await q
    if (Array.isArray(data)) {
      for (const row of data as Array<{ amount: number | string | null }>) {
        customerCreditBalance += Number(row.amount || 0)
      }
    }
  } catch { /* non-critical */ }

  // ── 2. Supplier advance balance (sum of open vendor_credits) ──────
  let supplierAdvanceBalance = 0
  try {
    let q = supabase
      .from("vendor_credits")
      .select("total_amount, applied_amount, supplier:suppliers!inner(branch_id)")
      .eq("company_id", companyId)
      .eq("status", "open")
    if (branchId) {
      q = q.eq("supplier.branch_id", branchId)
    }
    const { data } = await q
    if (Array.isArray(data)) {
      for (const row of data as Array<{ total_amount: number | string | null; applied_amount: number | string | null }>) {
        const open = Number(row.total_amount || 0) - Number(row.applied_amount || 0)
        if (open > 0) supplierAdvanceBalance += open
      }
    }
  } catch { /* non-critical */ }

  return (
    <DashboardCustomerSupplierBalances
      customerCreditBalance={customerCreditBalance}
      supplierAdvanceBalance={supplierAdvanceBalance}
      currency={currency}
      appLang={appLang}
    />
  )
}

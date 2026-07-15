/**
 * warehouse-manager-presence.ts — v3.74.664
 *
 * Central rule: "does the invoice/bill branch have an assigned warehouse
 * manager (مسؤول مخزن)?"
 *
 * Governance (product owner spec):
 *   - Stock movements (product issue on sales invoices / product receipt on
 *     purchase bills) are the physical CUSTODY of the branch warehouse
 *     manager. When the branch HAS a store_manager / warehouse_manager, the
 *     movement stays pending and that manager is asked to approve it.
 *   - When the branch has NO assigned warehouse manager, there is no custodian
 *     to request approval from, so the movement is auto-approved (the full
 *     posting runs automatically) rather than blocking operations.
 *
 * This applies to WHOEVER executes the document — not only the owner — because
 * the criterion is the existence of a custodian for the branch, not the
 * identity of the creator.
 *
 * A "warehouse manager for the branch" is a company_members row with role in
 * (store_manager, warehouse_manager) scoped to that branch_id. There is no
 * dedicated manager_user_id column on `warehouses`; the linkage is entirely
 * through company_members (mirrors resolveWarehouseRecipientsForBranch).
 */

type SupabaseLike = any

const WAREHOUSE_MANAGER_ROLES = ["store_manager", "warehouse_manager"] as const

/**
 * Returns true when the given branch has at least one assigned warehouse
 * manager. Returns false when the branch is unknown/null (no custodian can be
 * resolved → auto-approve) or when the query fails-open to "no manager".
 *
 * NOTE: fail-safety choice — on a query error we return false (auto-approve).
 * The alternative (returning true) would silently trap stock movements in a
 * pending state that nobody can clear, halting operations. Auto-approving on
 * error keeps goods flowing; the movement is still fully posted and audited.
 */
export async function branchHasWarehouseManager(
  supabase: SupabaseLike,
  companyId: string,
  branchId: string | null | undefined
): Promise<boolean> {
  if (!companyId || !branchId) return false

  const { data, error } = await supabase
    .from("company_members")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .in("role", WAREHOUSE_MANAGER_ROLES as unknown as string[])
    .limit(1)

  if (error) {
    console.warn(
      "[warehouse-manager-presence] lookup failed, treating branch as having NO manager (auto-approve):",
      error.message
    )
    return false
  }

  return Array.isArray(data) && data.length > 0
}

export const WAREHOUSE_AUTO_APPROVE_NOTE =
  "اعتماد تلقائي — لا يوجد مسؤول مخزن لفرع الفاتورة."

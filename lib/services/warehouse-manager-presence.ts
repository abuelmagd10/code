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

  // v3.74.989 — كان هذا بيتاً ثانياً للسؤال نفسِه **ويفترق عن بيت القاعدة**:
  // يبحث عن دورين أحدُهما "warehouse_manager" — **وهو ليس من الأدوار الاثنى
  // عشر المسموح بها أصلاً**، فنصفُ القائمة كان يبحث عمّن لا يستطيع أحدٌ أن
  // يكونه. فصار السؤالُ يُطرَح على بيتٍ واحدٍ فى القاعدة، هو نفسُه الذى يحكم
  // على من يعتمد الإخراج — فلا يفترق الجوابان غداً.
  const { data, error } = await supabase.rpc("branch_warehouse_custodian", {
    p_company_id: companyId,
    p_branch_id: branchId,
    p_warehouse_id: null,
    p_user_id: null,
  })

  if (error) {
    console.warn(
      "[warehouse-manager-presence] lookup failed, treating branch as having NO manager (auto-approve):",
      error.message
    )
    return false
  }

  return data === true
}

export const WAREHOUSE_AUTO_APPROVE_NOTE =
  "اعتماد تلقائي — لا يوجد مسؤول مخزن لفرع الفاتورة."

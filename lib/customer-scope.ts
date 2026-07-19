/**
 * v3.74.722 — one definition of "which customers may this user pick".
 *
 * Staff are scoped to the customers they CREATED. That axis follows the PERSON,
 * not the data: an employee who moves between branches keeps seeing — and
 * picking — customers of the branch he left. v3.74.719 fixed that on the
 * customers list page, but every other customer picker (bookings, estimates,
 * invoices, sales orders, debit notes) builds its own query and kept the old
 * behaviour, so the stale names were still offered everywhere else.
 *
 * The database guard (validate_customer_branch_isolation) already refuses the
 * resulting document, so nothing wrong can be saved. What was left was worse as
 * an experience than as a risk: the user picks a customer he is allowed to see,
 * fills a whole form, and only then gets rejected.
 *
 * The rule is the INTERSECTION — created by me AND in my branch:
 *   - creator alone  → travels with the employee across branches (the bug)
 *   - branch alone   → hands every rep the entire branch book, destroying the
 *                      per-rep privacy this scoping exists for
 *
 * Applied ONLY when the caller is already creator-scoped. Privileged and
 * branch-level roles are untouched: they have their own, correct scoping.
 */

type AccessFilterLike = {
  filterByCreatedBy?: boolean
  createdByUserId?: string | null
  branchId?: string | null
} | null | undefined

type UserContextLike = { branch_id?: string | null } | null | undefined

/**
 * Adds the branch constraint to a customers query for creator-scoped users.
 * Returns the query unchanged for anyone else, so it is safe to call
 * unconditionally on every customer picker.
 *
 * v3.74.725 — a customer with NO branch is a SHARED customer, usable from any
 * branch, and must stay visible.
 *
 * The first version filtered on `branch_id = mine` exactly, which silently
 * excluded them: validate_customer_branch_isolation deliberately allows a
 * branchless customer on any branch's document, but the picker hid that same
 * customer from everyone. The database permitted what the interface concealed —
 * so the one mechanism the system already had for "this customer deals with
 * more than one branch" was unusable.
 */
export function applyCustomerBranchScope<T>(
  query: T,
  accessFilter: AccessFilterLike,
  userContext?: UserContextLike,
): T {
  if (!accessFilter?.filterByCreatedBy) return query

  const branchId = accessFilter.branchId || userContext?.branch_id || null
  if (!branchId) return query

  // "my branch OR shared" — matches what the database guard accepts.
  return (query as any).or(`branch_id.eq.${branchId},branch_id.is.null`) as T
}

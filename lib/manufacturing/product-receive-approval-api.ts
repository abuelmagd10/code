import { NextRequest } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { getCompanyMembership, type CompanyMembership } from "@/lib/company-authorization"
import { ManufacturingApiError } from "@/lib/manufacturing/bom-api"

export { handleManufacturingApiError } from "@/lib/manufacturing/bom-api"

const ALLOWED_PRODUCT_RECEIVE_APPROVAL_ROLES = new Set([
  "store_manager",
  "warehouse_manager",
  "manager",
  "owner",
  "admin",
  "general_manager",
  "manufacturing_officer", // يرى طلباته فقط (own_only مطبّق في route)
])

const BRANCH_WAREHOUSE_SCOPED_ROLES = new Set(["store_manager", "warehouse_manager"])

export type ProductReceiveApprovalApiContext = {
  user: { id: string; email?: string | null }
  companyId: string
  member: CompanyMembership
  supabase: Awaited<ReturnType<typeof createClient>>
  admin: ReturnType<typeof createServiceClient>
}

function normalizeRole(role: unknown) {
  return String(role || "").trim().toLowerCase()
}

function isScopedWarehouseRole(member: CompanyMembership) {
  return BRANCH_WAREHOUSE_SCOPED_ROLES.has(normalizeRole(member.role))
}

export async function getProductReceiveApprovalApiContext(
  request: NextRequest
): Promise<ProductReceiveApprovalApiContext> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new ManufacturingApiError(401, "Unauthorized")
  }

  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get("company_id") || (await getActiveCompanyId(supabase))
  if (!companyId) {
    throw new ManufacturingApiError(404, "Active company not found")
  }

  const membershipResult = await getCompanyMembership(supabase, user.id, companyId)
  if (!membershipResult.authorized || !membershipResult.membership) {
    throw new ManufacturingApiError(403, membershipResult.error || "Access denied")
  }

  const member = membershipResult.membership
  if (!ALLOWED_PRODUCT_RECEIVE_APPROVAL_ROLES.has(normalizeRole(member.role))) {
    throw new ManufacturingApiError(403, "غير مصرح — مخصص لمسؤولي المخزن والإدارة فقط")
  }

  return {
    user: { id: user.id, email: user.email },
    companyId,
    member,
    supabase,
    admin: createServiceClient(),
  }
}

export function applyProductReceiveApprovalScope<TQuery extends { eq: (column: string, value: string) => TQuery }>(
  query: TQuery,
  member: CompanyMembership,
  requestedScope: { branchId?: string | null; warehouseId?: string | null }
) {
  if (!isScopedWarehouseRole(member)) {
    if (requestedScope.branchId) query = query.eq("branch_id", requestedScope.branchId)
    if (requestedScope.warehouseId) query = query.eq("warehouse_id", requestedScope.warehouseId)
    return query
  }

  const memberBranchId = member.branchId || null
  const memberWarehouseId = member.warehouseId || null

  if (!memberBranchId) {
    throw new ManufacturingApiError(403, "حساب مسؤول المخزن غير مرتبط بفرع، يرجى مراجعة إعدادات المستخدم")
  }

  if (requestedScope.branchId && requestedScope.branchId !== memberBranchId) {
    throw new ManufacturingApiError(403, "لا يمكنك عرض طلبات استلام تصنيع خارج فرعك")
  }

  if (requestedScope.warehouseId && memberWarehouseId && requestedScope.warehouseId !== memberWarehouseId) {
    throw new ManufacturingApiError(403, "لا يمكنك عرض طلبات استلام تصنيع خارج مخزنك")
  }

  query = query.eq("branch_id", memberBranchId)
  if (memberWarehouseId) {
    query = query.eq("warehouse_id", memberWarehouseId)
  } else if (requestedScope.warehouseId) {
    query = query.eq("warehouse_id", requestedScope.warehouseId)
  }

  return query
}

export function assertProductReceiveApprovalScope(
  member: CompanyMembership,
  approval: { branch_id?: string | null; warehouse_id?: string | null }
) {
  if (!isScopedWarehouseRole(member)) return

  const memberBranchId = member.branchId || null
  const memberWarehouseId = member.warehouseId || null

  if (!memberBranchId || !approval.branch_id || approval.branch_id !== memberBranchId) {
    throw new ManufacturingApiError(403, "طلب استلام التصنيع خارج نطاق فرع مسؤول المخزن")
  }

  if (memberWarehouseId && (!approval.warehouse_id || approval.warehouse_id !== memberWarehouseId)) {
    throw new ManufacturingApiError(403, "طلب استلام التصنيع خارج نطاق مخزن مسؤول المخزن")
  }
}

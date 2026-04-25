export const BOM_USAGE_OPTIONS = [
  { value: "production", label: "Production", labelAr: "تشغيلي" },
  { value: "engineering", label: "Engineering", labelAr: "هندسي" },
] as const

export const BOM_LINE_TYPE_OPTIONS = [
  { value: "component", label: "Component", labelAr: "مكوّن" },
  { value: "co_product", label: "Co Product", labelAr: "منتج مشترك" },
  { value: "by_product", label: "By Product", labelAr: "منتج ثانوي" },
] as const

export const BOM_VERSION_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "superseded",
  "archived",
] as const

export type BomUsage = (typeof BOM_USAGE_OPTIONS)[number]["value"]
export type BomLineType = (typeof BOM_LINE_TYPE_OPTIONS)[number]["value"]
export type BomVersionStatus = (typeof BOM_VERSION_STATUSES)[number]

export interface BranchOption {
  id: string
  name?: string | null
  branch_name?: string | null
}

export interface ProductOption {
  id: string
  sku?: string | null
  name?: string | null
  branch_id?: string | null
  item_type?: string | null
  product_type?: string | null
}

export interface BomVersionSummary {
  id: string
  bom_id: string
  version_no: number
  status: BomVersionStatus
  is_default: boolean
  effective_from?: string | null
  effective_to?: string | null
  base_output_qty?: number | string | null
  change_summary?: string | null
  notes?: string | null
  approval_request_id?: string | null
  submitted_at?: string | null
  approved_at?: string | null
  rejected_at?: string | null
  updated_at?: string | null
}

export interface BomListItem {
  id: string
  company_id: string
  branch_id: string
  product_id: string
  bom_code: string
  bom_name: string
  bom_usage: BomUsage
  description?: string | null
  is_active: boolean
  created_at?: string | null
  updated_at?: string | null
  product?: ProductOption | null
  versions: BomVersionSummary[]
}

export interface BomDetail extends BomListItem {}

export interface BomLineSubstitute {
  id: string
  company_id: string
  branch_id: string
  bom_line_id: string
  substitute_product_id: string
  substitute_quantity: number | string
  priority: number
  effective_from?: string | null
  effective_to?: string | null
  notes?: string | null
  product?: ProductOption | null
}

export interface BomLine {
  id: string
  company_id: string
  branch_id: string
  bom_version_id: string
  line_no: number
  component_product_id: string
  line_type: BomLineType
  quantity_per: number | string
  scrap_percent: number | string
  issue_uom?: string | null
  is_optional: boolean
  notes?: string | null
  product?: ProductOption | null
  substitutes: BomLineSubstitute[]
}

export interface BomVersionSnapshot {
  bom: BomDetail
  version: BomVersionSummary
  lines: BomLine[]
  productsById: Record<string, ProductOption>
}

export interface BomListFilters {
  branchId?: string
  productId?: string
  bomUsage?: BomUsage | "all"
  isActive?: "all" | "true" | "false"
  q?: string
}

export interface BomCreatePayload {
  branch_id: string
  product_id: string
  bom_code: string
  bom_name: string
  bom_usage: BomUsage
  description?: string | null
  is_active: boolean
}

export interface BomUpdatePayload {
  bom_code?: string
  bom_name?: string
  description?: string | null
  is_active?: boolean
}

export interface BomVersionCreatePayload {
  clone_from_version_id?: string | null
  effective_from?: string | null
  effective_to?: string | null
  base_output_qty?: number
  change_summary?: string | null
  notes?: string | null
}

export interface BomVersionUpdatePayload {
  effective_from?: string | null
  effective_to?: string | null
  base_output_qty?: number
  change_summary?: string | null
  notes?: string | null
}

export interface BomLineSubstituteDraft {
  substitute_product_id: string
  substitute_quantity: number
  priority: number
  effective_from?: string | null
  effective_to?: string | null
  notes?: string | null
}

export interface BomLineDraft {
  line_no: number
  component_product_id: string
  line_type: BomLineType
  quantity_per: number
  scrap_percent: number
  issue_uom?: string | null
  is_optional: boolean
  notes?: string | null
  substitutes: BomLineSubstituteDraft[]
}

export interface ExplosionPreviewPayload {
  input_quantity: number
  as_of_date?: string | null
  include_substitutes?: boolean
  substitute_strategy?: "none" | "primary_only"
  include_by_products?: boolean
  include_co_products?: boolean
  explode_levels?: 1
  respect_effective_dates?: boolean
}

export interface ExplosionPreviewResult {
  bom_id: string
  bom_code: string
  bom_name: string
  bom_version_id: string
  version_no: number
  product_id: string
  product_name?: string | null
  product_sku?: string | null
  input_quantity: number
  base_output_qty: number
  scale_factor: number
  as_of_date: string
  components: Array<{
    line_id: string
    line_no: number
    component_product_id: string
    component_name?: string | null
    component_sku?: string | null
    line_type: BomLineType
    quantity_per: number
    required_quantity: number
    scrap_percent: number
    gross_required_quantity: number
    issue_uom?: string | null
    is_optional: boolean
    substitutes: Array<{
      substitute_id: string
      substitute_product_id: string
      substitute_name?: string | null
      substitute_sku?: string | null
      substitute_quantity: number
      priority: number
      effective: boolean
    }>
  }>
  co_products: Array<{
    line_id: string
    line_no: number
    product_id: string
    product_name?: string | null
    product_sku?: string | null
    quantity_per: number
    output_quantity: number
    notes?: string | null
  }>
  by_products: Array<{
    line_id: string
    line_no: number
    product_id: string
    product_name?: string | null
    product_sku?: string | null
    quantity_per: number
    output_quantity: number
    notes?: string | null
  }>
  warnings: string[]
  limitations: string[]
}

interface SuccessfulResponse<T> {
  success?: boolean
  data?: T
  meta?: Record<string, unknown>
  branches?: BranchOption[]
}

async function parseApiResponse<T>(response: Response): Promise<SuccessfulResponse<T>> {
  const payload = await response.json().catch(() => null)

  if (!response.ok || payload?.success === false) {
    throw new Error(
      payload?.error ||
      payload?.message ||
      "حدث خطأ غير متوقع أثناء تنفيذ الطلب"
    )
  }

  return payload || {}
}

function toQueryString(filters: BomListFilters) {
  const searchParams = new URLSearchParams()

  if (filters.branchId) searchParams.set("branch_id", filters.branchId)
  if (filters.productId) searchParams.set("product_id", filters.productId)
  if (filters.bomUsage && filters.bomUsage !== "all") searchParams.set("bom_usage", filters.bomUsage)
  if (filters.isActive && filters.isActive !== "all") searchParams.set("is_active", filters.isActive)
  if (filters.q?.trim()) searchParams.set("q", filters.q.trim())

  return searchParams.toString()
}

function jsonHeaders() {
  return {
    "Content-Type": "application/json",
  }
}

export async function fetchBomList(filters: BomListFilters = {}) {
  const query = toQueryString(filters)
  const response = await fetch(`/api/manufacturing/boms${query ? `?${query}` : ""}`, {
    cache: "no-store",
  })

  const payload = await parseApiResponse<BomListItem[]>(response)
  return {
    items: payload.data || [],
    total: Number(payload.meta?.total || 0),
  }
}

export async function createBom(payload: BomCreatePayload) {
  const response = await fetch("/api/manufacturing/boms", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })

  const parsed = await parseApiResponse<BomDetail>(response)
  return parsed.data as BomDetail
}

export async function fetchBomDetail(bomId: string) {
  const response = await fetch(`/api/manufacturing/boms/${bomId}`, {
    cache: "no-store",
  })
  const payload = await parseApiResponse<BomDetail>(response)
  return payload.data as BomDetail
}

export async function updateBom(bomId: string, payload: BomUpdatePayload) {
  const response = await fetch(`/api/manufacturing/boms/${bomId}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })
  const parsed = await parseApiResponse<BomDetail>(response)
  return parsed.data as BomDetail
}

export async function deleteBom(bomId: string) {
  const response = await fetch(`/api/manufacturing/boms/${bomId}`, {
    method: "DELETE",
  })
  await parseApiResponse(response)
}

export async function createBomVersion(bomId: string, payload: BomVersionCreatePayload) {
  const response = await fetch(`/api/manufacturing/boms/${bomId}/versions`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })
  const parsed = await parseApiResponse<{ bom_version_id?: string; version_no?: number; cloned?: boolean }>(response)
  return parsed.data || {}
}

export async function fetchBomVersionSnapshot(versionId: string) {
  const response = await fetch(`/api/manufacturing/bom-versions/${versionId}`, {
    cache: "no-store",
  })
  const payload = await parseApiResponse<BomVersionSnapshot>(response)
  return payload.data as BomVersionSnapshot
}

export async function updateBomVersion(versionId: string, payload: BomVersionUpdatePayload) {
  const response = await fetch(`/api/manufacturing/bom-versions/${versionId}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })
  const parsed = await parseApiResponse<BomVersionSummary>(response)
  return parsed.data as BomVersionSummary
}

export async function deleteBomVersion(versionId: string) {
  const response = await fetch(`/api/manufacturing/bom-versions/${versionId}`, {
    method: "DELETE",
  })
  await parseApiResponse(response)
}

export async function updateBomStructure(versionId: string, lines: BomLineDraft[]) {
  const response = await fetch(`/api/manufacturing/bom-versions/${versionId}/structure`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify({ lines }),
  })
  const parsed = await parseApiResponse<{ line_count?: number; substitute_count?: number }>(response)
  return parsed.data || {}
}

export async function submitBomVersion(versionId: string) {
  const response = await fetch(`/api/manufacturing/bom-versions/${versionId}/submit-approval`, {
    method: "POST",
  })
  const parsed = await parseApiResponse<{ approval_request_id?: string | null }>(response)
  return parsed.data || {}
}

export async function approveBomVersion(versionId: string) {
  const response = await fetch(`/api/manufacturing/bom-versions/${versionId}/approve`, {
    method: "POST",
  })
  const parsed = await parseApiResponse<Record<string, unknown>>(response)
  return parsed.data || {}
}

export async function rejectBomVersion(versionId: string, rejectionReason: string) {
  const response = await fetch(`/api/manufacturing/bom-versions/${versionId}/reject`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ rejection_reason: rejectionReason }),
  })
  const parsed = await parseApiResponse<Record<string, unknown>>(response)
  return parsed.data || {}
}

export async function setDefaultBomVersion(versionId: string) {
  const response = await fetch(`/api/manufacturing/bom-versions/${versionId}/set-default`, {
    method: "POST",
  })
  const parsed = await parseApiResponse<{ previous_default_version_id?: string | null }>(response)
  return parsed.data || {}
}

export async function runExplosionPreview(versionId: string, payload: ExplosionPreviewPayload) {
  const response = await fetch(`/api/manufacturing/bom-versions/${versionId}/explosion-preview`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })
  const parsed = await parseApiResponse<ExplosionPreviewResult>(response)
  return parsed.data as ExplosionPreviewResult
}

export async function fetchBranchOptions() {
  const response = await fetch("/api/branches", {
    cache: "no-store",
  })
  const payload = await parseApiResponse<never>(response)
  return payload.branches || []
}

export async function fetchManufacturingProductOptions() {
  const response = await fetch("/api/products-list", {
    cache: "no-store",
  })
  const payload = await parseApiResponse<ProductOption[]>(response)
  return payload.data || []
}

export function getVersionStatusLabel(status: BomVersionStatus, lang: "ar" | "en" = "ar") {
  const labels: Record<BomVersionStatus, { ar: string; en: string }> = {
    draft: { ar: "مسودة", en: "Draft" },
    pending_approval: { ar: "بانتظار الاعتماد", en: "Pending Approval" },
    approved: { ar: "معتمد", en: "Approved" },
    rejected: { ar: "مرفوض", en: "Rejected" },
    superseded: { ar: "مستبدل", en: "Superseded" },
    archived: { ar: "مؤرشف", en: "Archived" },
  }

  return labels[status]?.[lang] || status
}

export function getVersionStatusVariant(status: BomVersionStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "approved":
      return "default"
    case "pending_approval":
      return "secondary"
    case "rejected":
      return "destructive"
    default:
      return "outline"
  }
}

export function isVersionHeaderEditable(status: BomVersionStatus) {
  return status === "draft" || status === "rejected"
}

export function isVersionStructureEditable(status: BomVersionStatus) {
  return status === "draft" || status === "rejected"
}

export function canSubmitVersion(status: BomVersionStatus) {
  return status === "draft" || status === "rejected"
}

export function canApproveVersion(status: BomVersionStatus) {
  return status === "pending_approval"
}

export function canRejectVersion(status: BomVersionStatus) {
  return status === "pending_approval"
}

export function canSetDefaultVersion(status: BomVersionStatus, isDefault: boolean) {
  return status === "approved" && !isDefault
}

export function canDeleteVersion(status: BomVersionStatus) {
  return status === "draft" || status === "rejected"
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export function formatDateOnly(value?: string | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(value))
}

export function formatQuantity(value?: number | string | null, fractionDigits = 4) {
  const numeric = Number(value || 0)
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(Number.isFinite(numeric) ? numeric : 0)
}

export function buildProductLabel(product?: ProductOption | null) {
  if (!product) return "—"
  const sku = product.sku?.trim()
  const name = product.name?.trim()
  if (sku && name) return `${sku} — ${name}`
  return sku || name || product.id
}

export function buildBranchLabel(branch?: BranchOption | null) {
  return branch?.name || branch?.branch_name || "—"
}

export function isoToLocalDateTimeInput(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const pad = (part: number) => String(part).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function localDateTimeInputToIso(value?: string | null) {
  if (!value?.trim()) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function bomSnapshotToDraftLines(lines: BomLine[]): BomLineDraft[] {
  return lines.map((line) => ({
    line_no: Number(line.line_no),
    component_product_id: line.component_product_id,
    line_type: line.line_type,
    quantity_per: Number(line.quantity_per || 0),
    scrap_percent: Number(line.scrap_percent || 0),
    issue_uom: line.issue_uom || "",
    is_optional: Boolean(line.is_optional),
    notes: line.notes || "",
    substitutes: (line.substitutes || []).map((substitute) => ({
      substitute_product_id: substitute.substitute_product_id,
      substitute_quantity: Number(substitute.substitute_quantity || 0),
      priority: Number(substitute.priority || 1),
      effective_from: substitute.effective_from || "",
      effective_to: substitute.effective_to || "",
      notes: substitute.notes || "",
    })),
  }))
}

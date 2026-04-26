export const ROUTING_USAGE_OPTIONS = [
  { value: "production", label: "Production", labelAr: "تشغيلي" },
  { value: "engineering", label: "Engineering", labelAr: "هندسي" },
] as const

export const ROUTING_VERSION_STATUSES = ["draft", "active", "inactive", "archived"] as const

export type RoutingUsage = (typeof ROUTING_USAGE_OPTIONS)[number]["value"]
export type RoutingVersionStatus = (typeof ROUTING_VERSION_STATUSES)[number]

export interface ProductOption {
  id: string
  sku?: string | null
  name?: string | null
  branch_id?: string | null
  item_type?: string | null
  product_type?: string | null
}

export interface WorkCenterSummary {
  id: string
  code?: string | null
  name?: string | null
  work_center_type?: string | null
  status?: string | null
  capacity_uom?: string | null
  nominal_capacity_per_hour?: number | string | null
  available_hours_per_day?: number | string | null
  parallel_capacity?: number | null
  efficiency_percent?: number | string | null
}

export interface RoutingVersionSummary {
  id: string
  routing_id: string
  version_no: number
  status: RoutingVersionStatus
  effective_from?: string | null
  effective_to?: string | null
  change_summary?: string | null
  notes?: string | null
  updated_at?: string | null
}

export interface RoutingListItem {
  id: string
  company_id: string
  branch_id: string
  product_id: string
  routing_code: string
  routing_name: string
  routing_usage: RoutingUsage
  description?: string | null
  is_active: boolean
  created_at?: string | null
  updated_at?: string | null
  product?: ProductOption | null
  versions: RoutingVersionSummary[]
}

export interface RoutingDetail extends RoutingListItem {}

export interface RoutingOperation {
  id: string
  company_id: string
  branch_id: string
  routing_version_id: string
  operation_no: number
  operation_code: string
  operation_name: string
  work_center_id: string
  setup_time_minutes: number | string
  run_time_minutes_per_unit: number | string
  queue_time_minutes: number | string
  move_time_minutes: number | string
  labor_time_minutes: number | string
  machine_time_minutes: number | string
  quality_checkpoint_required: boolean
  instructions?: string | null
  work_center?: WorkCenterSummary | null
}

export interface RoutingVersionSnapshot {
  routing: RoutingDetail
  version: RoutingVersionSummary
  product?: ProductOption | null
  operations: RoutingOperation[]
}

export interface RoutingListFilters {
  branchId?: string
  productId?: string
  routingUsage?: RoutingUsage | "all"
  isActive?: "all" | "true" | "false"
  q?: string
}

export interface RoutingCreatePayload {
  branch_id?: string | null
  product_id: string
  routing_code: string
  routing_name: string
  routing_usage: RoutingUsage
  description?: string | null
  is_active: boolean
}

export interface RoutingUpdatePayload {
  routing_code?: string
  routing_name?: string
  description?: string | null
  is_active?: boolean
}

export interface RoutingVersionCreatePayload {
  clone_from_version_id?: string | null
  effective_from?: string | null
  effective_to?: string | null
  change_summary?: string | null
  notes?: string | null
}

export interface RoutingVersionUpdatePayload {
  effective_from?: string | null
  effective_to?: string | null
  change_summary?: string | null
  notes?: string | null
}

export interface RoutingOperationDraft {
  operation_no: number
  operation_code: string
  operation_name: string
  work_center_id: string
  setup_time_minutes: number
  run_time_minutes_per_unit: number
  queue_time_minutes: number
  move_time_minutes: number
  labor_time_minutes: number
  machine_time_minutes: number
  quality_checkpoint_required: boolean
  instructions?: string | null
}

interface SuccessfulResponse<T> {
  success?: boolean
  data?: T
  meta?: Record<string, unknown>
}

async function parseApiResponse<T>(response: Response): Promise<SuccessfulResponse<T>> {
  const payload = await response.json().catch(() => null)

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || payload?.message || "حدث خطأ غير متوقع أثناء تنفيذ الطلب")
  }

  return payload || {}
}

function jsonHeaders() {
  return {
    "Content-Type": "application/json",
  }
}

function toQueryString(filters: RoutingListFilters) {
  const searchParams = new URLSearchParams()

  if (filters.branchId?.trim()) searchParams.set("branch_id", filters.branchId.trim())
  if (filters.productId?.trim()) searchParams.set("product_id", filters.productId.trim())
  if (filters.routingUsage && filters.routingUsage !== "all") searchParams.set("routing_usage", filters.routingUsage)
  if (filters.isActive && filters.isActive !== "all") searchParams.set("is_active", filters.isActive)
  if (filters.q?.trim()) searchParams.set("q", filters.q.trim())

  return searchParams.toString()
}

export async function fetchRoutingList(filters: RoutingListFilters = {}) {
  const query = toQueryString(filters)
  const response = await fetch(`/api/manufacturing/routings${query ? `?${query}` : ""}`, {
    cache: "no-store",
  })

  const payload = await parseApiResponse<RoutingListItem[]>(response)
  return {
    items: payload.data || [],
    total: Number(payload.meta?.total || 0),
  }
}

export async function createRouting(payload: RoutingCreatePayload) {
  // Normalize empty branch_id to null so the API can validate it properly.
  const normalizedPayload = {
    ...payload,
    branch_id: payload.branch_id || null,
  }
  const response = await fetch("/api/manufacturing/routings", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(normalizedPayload),
  })

  const parsed = await parseApiResponse<RoutingDetail>(response)
  return parsed.data as RoutingDetail
}

export async function fetchRoutingDetail(routingId: string) {
  const response = await fetch(`/api/manufacturing/routings/${routingId}`, {
    cache: "no-store",
  })

  const payload = await parseApiResponse<RoutingDetail>(response)
  return payload.data as RoutingDetail
}

export async function updateRouting(routingId: string, payload: RoutingUpdatePayload) {
  const response = await fetch(`/api/manufacturing/routings/${routingId}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })

  const parsed = await parseApiResponse<RoutingDetail>(response)
  return parsed.data as RoutingDetail
}

export async function deleteRouting(routingId: string) {
  const response = await fetch(`/api/manufacturing/routings/${routingId}`, {
    method: "DELETE",
  })

  await parseApiResponse(response)
}

export async function createRoutingVersion(routingId: string, payload: RoutingVersionCreatePayload) {
  const response = await fetch(`/api/manufacturing/routings/${routingId}/versions`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })

  const parsed = await parseApiResponse<{ routing_version_id?: string; version_no?: number; cloned?: boolean }>(response)
  return parsed.data || {}
}

export async function fetchRoutingVersionSnapshot(versionId: string) {
  const response = await fetch(`/api/manufacturing/routing-versions/${versionId}`, {
    cache: "no-store",
  })

  const payload = await parseApiResponse<RoutingVersionSnapshot>(response)
  return payload.data as RoutingVersionSnapshot
}

export async function updateRoutingVersion(versionId: string, payload: RoutingVersionUpdatePayload) {
  const response = await fetch(`/api/manufacturing/routing-versions/${versionId}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })

  const parsed = await parseApiResponse<RoutingVersionSummary>(response)
  return parsed.data as RoutingVersionSummary
}

export async function deleteRoutingVersion(versionId: string) {
  const response = await fetch(`/api/manufacturing/routing-versions/${versionId}`, {
    method: "DELETE",
  })

  await parseApiResponse(response)
}

export async function updateRoutingOperations(versionId: string, operations: RoutingOperationDraft[]) {
  const response = await fetch(`/api/manufacturing/routing-versions/${versionId}/operations`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify({ operations }),
  })

  const parsed = await parseApiResponse<{ operation_count?: number }>(response)
  return parsed.data || {}
}

export async function activateRoutingVersion(versionId: string) {
  const response = await fetch(`/api/manufacturing/routing-versions/${versionId}/activate`, {
    method: "POST",
  })

  const parsed = await parseApiResponse<{ previous_active_version_id?: string | null }>(response)
  return parsed.data || {}
}

export async function deactivateRoutingVersion(versionId: string) {
  const response = await fetch(`/api/manufacturing/routing-versions/${versionId}/deactivate`, {
    method: "POST",
  })

  const parsed = await parseApiResponse<Record<string, unknown>>(response)
  return parsed.data || {}
}

export async function archiveRoutingVersion(versionId: string) {
  const response = await fetch(`/api/manufacturing/routing-versions/${versionId}/archive`, {
    method: "POST",
  })

  const parsed = await parseApiResponse<Record<string, unknown>>(response)
  return parsed.data || {}
}

export function getRoutingVersionStatusLabel(status: RoutingVersionStatus, lang: "ar" | "en" = "ar") {
  const labels: Record<RoutingVersionStatus, { ar: string; en: string }> = {
    draft: { ar: "مسودة", en: "Draft" },
    active: { ar: "نشطة", en: "Active" },
    inactive: { ar: "غير نشطة", en: "Inactive" },
    archived: { ar: "مؤرشفة", en: "Archived" },
  }

  return labels[status]?.[lang] || status
}

export function getRoutingVersionStatusVariant(status: RoutingVersionStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default"
    case "inactive":
      return "secondary"
    case "archived":
      return "destructive"
    default:
      return "outline"
  }
}

export function isRoutingVersionHeaderEditable(status: RoutingVersionStatus) {
  return status === "draft"
}

export function isRoutingVersionStructureEditable(status: RoutingVersionStatus) {
  return status === "draft"
}

export function canActivateRoutingVersion(status: RoutingVersionStatus) {
  return status === "draft" || status === "inactive"
}

export function canDeactivateRoutingVersion(status: RoutingVersionStatus) {
  return status === "active"
}

export function canArchiveRoutingVersion(status: RoutingVersionStatus) {
  return status === "draft" || status === "active" || status === "inactive"
}

export function canDeleteRoutingVersion(status: RoutingVersionStatus) {
  return status === "draft"
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

export function buildWorkCenterLabel(workCenter?: WorkCenterSummary | null) {
  if (!workCenter) return "—"
  const code = workCenter.code?.trim()
  const name = workCenter.name?.trim()
  if (code && name) return `${code} — ${name}`
  return code || name || workCenter.id
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

export function routingSnapshotToDraftOperations(operations: RoutingOperation[]): RoutingOperationDraft[] {
  return operations.map((operation) => ({
    operation_no: Number(operation.operation_no),
    operation_code: operation.operation_code || "",
    operation_name: operation.operation_name || "",
    work_center_id: operation.work_center_id,
    setup_time_minutes: Number(operation.setup_time_minutes || 0),
    run_time_minutes_per_unit: Number(operation.run_time_minutes_per_unit || 0),
    queue_time_minutes: Number(operation.queue_time_minutes || 0),
    move_time_minutes: Number(operation.move_time_minutes || 0),
    labor_time_minutes: Number(operation.labor_time_minutes || 0),
    machine_time_minutes: Number(operation.machine_time_minutes || 0),
    quality_checkpoint_required: Boolean(operation.quality_checkpoint_required),
    instructions: operation.instructions || "",
  }))
}

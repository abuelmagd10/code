import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import {
  ManufacturingApiError,
  assertManufacturableProduct,
  getManufacturingApiContext,
  handleManufacturingApiError,
  jsonError,
  parseJsonBody,
  parseOptionalJsonBody,
  resolveScopedBranchId,
} from "@/lib/manufacturing/bom-api"
import type { ManufacturingApiContext } from "@/lib/manufacturing/bom-api"

export {
  ManufacturingApiError,
  assertManufacturableProduct,
  getManufacturingApiContext,
  handleManufacturingApiError,
  jsonError,
  parseJsonBody,
  parseOptionalJsonBody,
  resolveScopedBranchId,
}

export type { ManufacturingApiContext }

export const ROUTING_USAGE_VALUES = ["production", "engineering"] as const

const uuidSchema = z.string().uuid()
const trimmedString = z.string().trim()
const nullableTrimmedString = z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
  if (value == null) return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
})

const nullableIsoDateTimeString = z.union([z.string(), z.null(), z.undefined()])
  .superRefine((value, ctx) => {
    if (typeof value !== "string") return
    const normalized = value.trim()
    if (!normalized) return
    if (Number.isNaN(Date.parse(normalized))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid ISO date-time value",
      })
    }
  })
  .transform((value) => {
    if (value == null) return null
    const normalized = value.trim()
    if (!normalized) return null
    return new Date(Date.parse(normalized)).toISOString()
  })

export const createRoutingSchema = z.object({
  branch_id: uuidSchema.optional().nullable(),
  product_id: uuidSchema,
  routing_code: trimmedString.min(1, "routing_code is required"),
  routing_name: trimmedString.min(1, "routing_name is required"),
  routing_usage: z.enum(ROUTING_USAGE_VALUES).default("production"),
  description: nullableTrimmedString,
  is_active: z.boolean().optional().default(true),
})

export const updateRoutingSchema = z.object({
  routing_code: trimmedString.min(1).optional(),
  routing_name: trimmedString.min(1).optional(),
  description: nullableTrimmedString.optional(),
  is_active: z.boolean().optional(),
}).refine((payload) => Object.keys(payload).length > 0, {
  message: "At least one field must be provided",
})

export const createRoutingVersionSchema = z.object({
  clone_from_version_id: uuidSchema.optional().nullable(),
  effective_from: nullableIsoDateTimeString.optional(),
  effective_to: nullableIsoDateTimeString.optional(),
  change_summary: nullableTrimmedString.optional(),
  notes: nullableTrimmedString.optional(),
})

export const updateRoutingVersionSchema = z.object({
  effective_from: nullableIsoDateTimeString.optional(),
  effective_to: nullableIsoDateTimeString.optional(),
  change_summary: nullableTrimmedString.optional(),
  notes: nullableTrimmedString.optional(),
}).refine((payload) => Object.keys(payload).length > 0, {
  message: "At least one field must be provided",
})

export const routingOperationInputSchema = z.object({
  operation_no: z.coerce.number().int().positive(),
  operation_code: trimmedString.min(1, "operation_code is required"),
  operation_name: trimmedString.min(1, "operation_name is required"),
  work_center_id: uuidSchema,
  setup_time_minutes: z.coerce.number().min(0).optional().default(0),
  run_time_minutes_per_unit: z.coerce.number().min(0).optional().default(0),
  queue_time_minutes: z.coerce.number().min(0).optional().default(0),
  move_time_minutes: z.coerce.number().min(0).optional().default(0),
  labor_time_minutes: z.coerce.number().min(0).optional().default(0),
  machine_time_minutes: z.coerce.number().min(0).optional().default(0),
  quality_checkpoint_required: z.boolean().optional().default(false),
  instructions: nullableTrimmedString.optional(),
})

export const updateRoutingOperationsSchema = z.object({
  operations: z.array(routingOperationInputSchema),
}).superRefine((payload, ctx) => {
  const seenOperationNos = new Set<number>()
  const seenOperationCodes = new Set<string>()

  payload.operations.forEach((operation, index) => {
    if (seenOperationNos.has(operation.operation_no)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate operation_no ${operation.operation_no}`,
        path: ["operations", index, "operation_no"],
      })
    }
    seenOperationNos.add(operation.operation_no)

    if (seenOperationCodes.has(operation.operation_code)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate operation_code ${operation.operation_code}`,
        path: ["operations", index, "operation_code"],
      })
    }
    seenOperationCodes.add(operation.operation_code)
  })
})

export async function assertRoutingAccessible(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  routingId: string
) {
  const { data: routing, error } = await supabase
    .from("manufacturing_routings")
    .select("*")
    .eq("id", routingId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (error) throw error
  if (!routing) {
    throw new ManufacturingApiError(404, "Routing not found")
  }

  return routing
}

export async function assertRoutingVersionAccessible(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  routingVersionId: string
) {
  const { data: version, error } = await supabase
    .from("manufacturing_routing_versions")
    .select("*")
    .eq("id", routingVersionId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (error) throw error
  if (!version) {
    throw new ManufacturingApiError(404, "Routing version not found")
  }

  return version
}

export async function assertRoutingVersionBelongsToRouting(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  routingId: string,
  routingVersionId: string
) {
  const version = await assertRoutingVersionAccessible(supabase, companyId, routingVersionId)
  if (version.routing_id !== routingId) {
    throw new ManufacturingApiError(400, "Routing version does not belong to the requested routing")
  }
  return version
}

export function assertRoutingVersionDeleteAllowed(version: { status: string; version_no: number }) {
  if (version.status !== "draft") {
    throw new ManufacturingApiError(
      409,
      `Only draft routing versions can be deleted in v1 (version ${version.version_no}, status ${version.status})`
    )
  }
}

export async function assertRoutingDeleteAllowed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  routingId: string
) {
  const { data: blockingVersions, error } = await supabase
    .from("manufacturing_routing_versions")
    .select("id, version_no, status")
    .eq("routing_id", routingId)
    .eq("company_id", companyId)
    .neq("status", "draft")
    .order("version_no")
    .limit(1)

  if (error) throw error

  const blockingVersion = blockingVersions?.[0]
  if (blockingVersion) {
    throw new ManufacturingApiError(
      409,
      `Only routings with draft versions only can be deleted in v1 (blocking version ${blockingVersion.version_no}, status ${blockingVersion.status})`
    )
  }
}

export async function loadRoutingVersionSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  routingVersionId: string
) {
  const version = await assertRoutingVersionAccessible(supabase, companyId, routingVersionId)
  const routing = await assertRoutingAccessible(supabase, companyId, version.routing_id)

  const [{ data: operations, error: operationsError }, { data: product, error: productError }] = await Promise.all([
    supabase
      .from("manufacturing_routing_operations")
      .select("*")
      .eq("routing_version_id", routingVersionId)
      .eq("company_id", companyId)
      .order("operation_no"),
    supabase
      .from("products")
      .select("*")
      .eq("id", routing.product_id)
      .maybeSingle(),
  ])

  if (operationsError) throw operationsError
  if (productError) throw productError

  const workCenterIds = Array.from(new Set((operations || []).map((operation) => operation.work_center_id).filter(Boolean)))
  let workCentersById: Record<string, any> = {}

  if (workCenterIds.length > 0) {
    const { data: workCenters, error: workCentersError } = await supabase
      .from("manufacturing_work_centers")
      .select("id, code, name, work_center_type, status, capacity_uom, nominal_capacity_per_hour, available_hours_per_day, parallel_capacity, efficiency_percent")
      .in("id", workCenterIds)

    if (workCentersError) throw workCentersError
    workCentersById = Object.fromEntries((workCenters || []).map((workCenter) => [workCenter.id, workCenter]))
  }

  return {
    routing,
    version,
    product: product || null,
    operations: (operations || []).map((operation) => ({
      ...operation,
      work_center: workCentersById[operation.work_center_id] || null,
    })),
  }
}

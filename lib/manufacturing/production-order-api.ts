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

export type { ManufacturingApiContext } from "@/lib/manufacturing/bom-api"

export const PRODUCTION_ORDER_STATUS_VALUES = ["draft", "released", "in_progress", "completed", "cancelled"] as const
export const PRODUCTION_ORDER_OPERATION_STATUS_VALUES = ["pending", "ready", "in_progress", "completed", "cancelled"] as const
export const PRODUCTION_ORDER_PROGRESS_STATUS_VALUES = ["ready", "in_progress", "completed", "cancelled"] as const

const uuidSchema = z.string().uuid()
const trimmedString = z.string().trim()

const nullableUuidSchema = z.union([z.string().uuid(), z.null(), z.undefined()]).transform((value) => {
  if (value == null) return null
  return value
})

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

export const createProductionOrderSchema = z.object({
  branch_id: uuidSchema.optional().nullable(),
  product_id: uuidSchema,
  bom_id: uuidSchema,
  bom_version_id: uuidSchema,
  routing_id: uuidSchema,
  routing_version_id: uuidSchema,
  issue_warehouse_id: nullableUuidSchema.optional(),
  receipt_warehouse_id: nullableUuidSchema.optional(),
  planned_quantity: z.coerce.number().positive(),
  order_uom: nullableTrimmedString.optional(),
  planned_start_at: nullableIsoDateTimeString.optional(),
  planned_end_at: nullableIsoDateTimeString.optional(),
  notes: nullableTrimmedString.optional(),
})

export const updateProductionOrderSchema = z.object({
  bom_id: uuidSchema.optional(),
  bom_version_id: uuidSchema.optional(),
  issue_warehouse_id: nullableUuidSchema.optional(),
  receipt_warehouse_id: nullableUuidSchema.optional(),
  order_uom: nullableTrimmedString.optional(),
  planned_start_at: nullableIsoDateTimeString.optional(),
  planned_end_at: nullableIsoDateTimeString.optional(),
  notes: nullableTrimmedString.optional(),
}).superRefine((payload, ctx) => {
  if ((payload.bom_id !== undefined) !== (payload.bom_version_id !== undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "bom_id and bom_version_id must be provided together",
      path: payload.bom_id === undefined ? ["bom_id"] : ["bom_version_id"],
    })
  }

  if (Object.keys(payload).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one field must be provided",
    })
  }
})

export const regenerateProductionOrderSchema = z.object({
  bom_id: uuidSchema.optional(),
  bom_version_id: uuidSchema.optional(),
  routing_id: uuidSchema.optional(),
  routing_version_id: uuidSchema.optional(),
  planned_quantity: z.coerce.number().positive().optional(),
  issue_warehouse_id: nullableUuidSchema.optional(),
  receipt_warehouse_id: nullableUuidSchema.optional(),
  order_uom: nullableTrimmedString.optional(),
  planned_start_at: nullableIsoDateTimeString.optional(),
  planned_end_at: nullableIsoDateTimeString.optional(),
  notes: nullableTrimmedString.optional(),
}).superRefine((payload, ctx) => {
  if ((payload.bom_id !== undefined) !== (payload.bom_version_id !== undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "bom_id and bom_version_id must be provided together",
      path: payload.bom_id === undefined ? ["bom_id"] : ["bom_version_id"],
    })
  }

  if ((payload.routing_id !== undefined) !== (payload.routing_version_id !== undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "routing_id and routing_version_id must be provided together",
      path: payload.routing_id === undefined ? ["routing_id"] : ["routing_version_id"],
    })
  }
})

export const releaseProductionOrderSchema = z.object({
  released_at: nullableIsoDateTimeString.optional(),
})

export const startProductionOrderSchema = z.object({
  started_at: nullableIsoDateTimeString.optional(),
})

export const completeProductionOrderSchema = z.object({
  completed_quantity: z.coerce.number().positive(),
  completed_at: nullableIsoDateTimeString.optional(),
})

export const cancelProductionOrderSchema = z.object({
  cancellation_reason: trimmedString.min(1, "cancellation_reason is required"),
  cancelled_at: nullableIsoDateTimeString.optional(),
})

export const updateProductionOrderOperationProgressSchema = z.object({
  status: z.enum(PRODUCTION_ORDER_PROGRESS_STATUS_VALUES).optional(),
  completed_quantity: z.coerce.number().min(0).optional(),
  actual_start_at: nullableIsoDateTimeString.optional(),
  actual_end_at: nullableIsoDateTimeString.optional(),
  notes: nullableTrimmedString.optional(),
}).refine((payload) => Object.keys(payload).length > 0, {
  message: "At least one field must be provided",
})

export async function assertProductionOrderAccessible(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  productionOrderId: string
) {
  const { data: order, error } = await supabase
    .from("manufacturing_production_orders")
    .select("*")
    .eq("id", productionOrderId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (error) throw error
  if (!order) {
    throw new ManufacturingApiError(404, "Production order not found")
  }

  return order
}

export function assertProductionOrderEditable(order: { id: string; status: string }) {
  if (order.status !== "draft") {
    throw new ManufacturingApiError(409, `Only draft production orders can be modified in v1 (status ${order.status})`)
  }
}

export function assertProductionOrderDeleteAllowed(order: { id: string; status: string; order_no: string }) {
  if (order.status !== "draft") {
    throw new ManufacturingApiError(
      409,
      `Only draft production orders can be deleted in v1 (${order.order_no}, status ${order.status})`
    )
  }
}

export async function assertProductionOrderOperationAccessible(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  productionOrderOperationId: string
) {
  const { data: operation, error } = await supabase
    .from("manufacturing_production_order_operations")
    .select("*")
    .eq("id", productionOrderOperationId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (error) throw error
  if (!operation) {
    throw new ManufacturingApiError(404, "Production order operation not found")
  }

  return operation
}

export async function loadProductionOrderSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  productionOrderId: string
) {
  const order = await assertProductionOrderAccessible(supabase, companyId, productionOrderId)

  const [
    { data: product, error: productError },
    { data: bom, error: bomError },
    { data: bomVersion, error: bomVersionError },
    { data: routing, error: routingError },
    { data: routingVersion, error: routingVersionError },
    { data: operations, error: operationsError },
  ] = await Promise.all([
    supabase.from("products").select("*").eq("id", order.product_id).maybeSingle(),
    supabase.from("manufacturing_boms").select("*").eq("id", order.bom_id).maybeSingle(),
    supabase.from("manufacturing_bom_versions").select("*").eq("id", order.bom_version_id).maybeSingle(),
    supabase.from("manufacturing_routings").select("*").eq("id", order.routing_id).maybeSingle(),
    supabase.from("manufacturing_routing_versions").select("*").eq("id", order.routing_version_id).maybeSingle(),
    supabase
      .from("manufacturing_production_order_operations")
      .select("*")
      .eq("production_order_id", productionOrderId)
      .eq("company_id", companyId)
      .order("operation_no"),
  ])

  if (productError) throw productError
  if (bomError) throw bomError
  if (bomVersionError) throw bomVersionError
  if (routingError) throw routingError
  if (routingVersionError) throw routingVersionError
  if (operationsError) throw operationsError

  const workCenterIds = Array.from(new Set((operations || []).map((operation) => operation.work_center_id).filter(Boolean)))
  const sourceRoutingOperationIds = Array.from(
    new Set((operations || []).map((operation) => operation.source_routing_operation_id).filter(Boolean))
  )

  const [
    { data: workCenters, error: workCentersError },
    { data: sourceRoutingOperations, error: sourceRoutingOperationsError },
  ] = await Promise.all([
    workCenterIds.length > 0
      ? supabase.from("manufacturing_work_centers").select("*").in("id", workCenterIds)
      : Promise.resolve({ data: [], error: null }),
    sourceRoutingOperationIds.length > 0
      ? supabase.from("manufacturing_routing_operations").select("*").in("id", sourceRoutingOperationIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (workCentersError) throw workCentersError
  if (sourceRoutingOperationsError) throw sourceRoutingOperationsError

  const workCentersById = Object.fromEntries((workCenters || []).map((workCenter) => [workCenter.id, workCenter]))
  const sourceRoutingOperationsById = Object.fromEntries(
    (sourceRoutingOperations || []).map((operation) => [operation.id, operation])
  )

  return {
    order,
    product: product || null,
    bom: bom || null,
    bom_version: bomVersion || null,
    routing: routing || null,
    routing_version: routingVersion || null,
    operations: (operations || []).map((operation) => ({
      ...operation,
      work_center: workCentersById[operation.work_center_id] || null,
      source_routing_operation: operation.source_routing_operation_id
        ? sourceRoutingOperationsById[operation.source_routing_operation_id] || null
        : null,
    })),
  }
}

export async function loadProductionOrderOperationSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  productionOrderOperationId: string
) {
  const operation = await assertProductionOrderOperationAccessible(supabase, companyId, productionOrderOperationId)
  const order = await assertProductionOrderAccessible(supabase, companyId, operation.production_order_id)

  const [{ data: workCenter, error: workCenterError }, { data: sourceRoutingOperation, error: sourceRoutingOperationError }] = await Promise.all([
    supabase.from("manufacturing_work_centers").select("*").eq("id", operation.work_center_id).maybeSingle(),
    operation.source_routing_operation_id
      ? supabase
          .from("manufacturing_routing_operations")
          .select("*")
          .eq("id", operation.source_routing_operation_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (workCenterError) throw workCenterError
  if (sourceRoutingOperationError) throw sourceRoutingOperationError

  return {
    order,
    operation: {
      ...operation,
      work_center: workCenter || null,
      source_routing_operation: sourceRoutingOperation || null,
    },
  }
}

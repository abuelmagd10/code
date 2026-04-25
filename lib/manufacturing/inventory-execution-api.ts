import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import {
  ManufacturingApiError,
  assertProductionOrderAccessible,
  getManufacturingApiContext,
  handleManufacturingApiError,
  jsonError,
  loadProductionOrderSnapshot,
  parseJsonBody,
  parseOptionalJsonBody,
} from "@/lib/manufacturing/production-order-api"

export {
  ManufacturingApiError,
  assertProductionOrderAccessible,
  getManufacturingApiContext,
  handleManufacturingApiError,
  jsonError,
  loadProductionOrderSnapshot,
  parseJsonBody,
  parseOptionalJsonBody,
}

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

export const syncProductionOrderMaterialsSchema = z.object({})

export const issueProductionOrderMaterialsSchema = z.object({
  command_key: nullableTrimmedString.optional(),
  posted_at: nullableIsoDateTimeString.optional(),
  notes: nullableTrimmedString.optional(),
  lines: z.array(
    z.object({
      material_requirement_id: uuidSchema,
      issued_qty: z.coerce.number().positive(),
      reservation_allocation_id: nullableUuidSchema.optional(),
      notes: nullableTrimmedString.optional(),
    })
  ).min(1),
}).superRefine((payload, ctx) => {
  const seenRequirementIds = new Set<string>()

  payload.lines.forEach((line, index) => {
    if (seenRequirementIds.has(line.material_requirement_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate material_requirement_id ${line.material_requirement_id}`,
        path: ["lines", index, "material_requirement_id"],
      })
    }
    seenRequirementIds.add(line.material_requirement_id)
  })
})

export const receiptProductionOrderOutputSchema = z.object({
  command_key: nullableTrimmedString.optional(),
  posted_at: nullableIsoDateTimeString.optional(),
  notes: nullableTrimmedString.optional(),
  received_qty: z.coerce.number().positive(),
})

export const closeProductionOrderReservationsSchema = z.object({
  mode: z.enum(["auto", "complete", "cancel"]).optional().default("auto"),
})

export async function loadProductionOrderInventoryExecutionSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  productionOrderId: string
) {
  const base = await loadProductionOrderSnapshot(supabase, companyId, productionOrderId)

  const [
    { data: materialRequirements, error: materialRequirementsError },
    { data: reservations, error: reservationsError },
    { data: issueEvents, error: issueEventsError },
    { data: issueLines, error: issueLinesError },
    { data: receiptEvents, error: receiptEventsError },
    { data: receiptLines, error: receiptLinesError },
  ] = await Promise.all([
    supabase
      .from("production_order_material_requirements")
      .select("*")
      .eq("production_order_id", productionOrderId)
      .eq("company_id", companyId)
      .order("line_no"),
    supabase
      .from("inventory_reservations")
      .select("*")
      .eq("company_id", companyId)
      .eq("source_type", "production_order")
      .eq("source_id", productionOrderId)
      .order("created_at", { ascending: false }),
    supabase
      .from("production_order_issue_events")
      .select("*")
      .eq("production_order_id", productionOrderId)
      .eq("company_id", companyId)
      .order("posted_at", { ascending: false }),
    supabase
      .from("production_order_issue_lines")
      .select("*")
      .eq("production_order_id", productionOrderId)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("production_order_receipt_events")
      .select("*")
      .eq("production_order_id", productionOrderId)
      .eq("company_id", companyId)
      .order("posted_at", { ascending: false }),
    supabase
      .from("production_order_receipt_lines")
      .select("*")
      .eq("production_order_id", productionOrderId)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
  ])

  if (materialRequirementsError) throw materialRequirementsError
  if (reservationsError) throw reservationsError
  if (issueEventsError) throw issueEventsError
  if (issueLinesError) throw issueLinesError
  if (receiptEventsError) throw receiptEventsError
  if (receiptLinesError) throw receiptLinesError

  const reservationIds = Array.from(new Set((reservations || []).map((reservation) => reservation.id)))
  const requirementSourceBomLineIds = Array.from(
    new Set((materialRequirements || []).map((requirement) => requirement.source_bom_line_id).filter(Boolean))
  )

  const [{ data: reservationLines, error: reservationLinesError }, { data: sourceBomLines, error: sourceBomLinesError }] = await Promise.all([
    reservationIds.length > 0
      ? supabase.from("inventory_reservation_lines").select("*").in("reservation_id", reservationIds).order("line_no")
      : Promise.resolve({ data: [], error: null }),
    requirementSourceBomLineIds.length > 0
      ? supabase.from("manufacturing_bom_lines").select("*").in("id", requirementSourceBomLineIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (reservationLinesError) throw reservationLinesError
  if (sourceBomLinesError) throw sourceBomLinesError

  const reservationLineIds = Array.from(new Set((reservationLines || []).map((line) => line.id)))
  const productIds = Array.from(
    new Set([
      ...(materialRequirements || []).map((requirement) => requirement.product_id),
      ...(reservationLines || []).map((line) => line.product_id),
      ...(issueLines || []).map((line) => line.product_id),
      ...(receiptLines || []).map((line) => line.product_id),
      base.order.product_id,
    ].filter(Boolean))
  )

  const [{ data: reservationAllocations, error: reservationAllocationsError }, { data: reservationConsumptions, error: reservationConsumptionsError }, { data: products, error: productsError }] = await Promise.all([
    reservationLineIds.length > 0
      ? supabase
          .from("inventory_reservation_allocations")
          .select("*")
          .in("reservation_line_id", reservationLineIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    reservationIds.length > 0
      ? supabase
          .from("inventory_reservation_consumptions")
          .select("*")
          .in("reservation_id", reservationIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    productIds.length > 0
      ? supabase.from("products").select("*").in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (reservationAllocationsError) throw reservationAllocationsError
  if (reservationConsumptionsError) throw reservationConsumptionsError
  if (productsError) throw productsError

  const productsById = Object.fromEntries((products || []).map((product) => [product.id, product]))
  const sourceBomLinesById = Object.fromEntries((sourceBomLines || []).map((line) => [line.id, line]))
  const materialRequirementsById = Object.fromEntries(
    (materialRequirements || []).map((requirement) => [requirement.id, requirement])
  )

  const reservationAllocationsByLineId = new Map<string, any[]>()
  for (const allocation of reservationAllocations || []) {
    const current = reservationAllocationsByLineId.get(allocation.reservation_line_id) || []
    current.push(allocation)
    reservationAllocationsByLineId.set(allocation.reservation_line_id, current)
  }

  const reservationConsumptionsByLineId = new Map<string, any[]>()
  for (const consumption of reservationConsumptions || []) {
    const current = reservationConsumptionsByLineId.get(consumption.reservation_line_id) || []
    current.push(consumption)
    reservationConsumptionsByLineId.set(consumption.reservation_line_id, current)
  }

  const reservationLinesByReservationId = new Map<string, any[]>()
  for (const line of reservationLines || []) {
    const current = reservationLinesByReservationId.get(line.reservation_id) || []
    current.push({
      ...line,
      product: productsById[line.product_id] || null,
      allocations: reservationAllocationsByLineId.get(line.id) || [],
      consumptions: reservationConsumptionsByLineId.get(line.id) || [],
    })
    reservationLinesByReservationId.set(line.reservation_id, current)
  }

  const issueLinesByEventId = new Map<string, any[]>()
  for (const line of issueLines || []) {
    const current = issueLinesByEventId.get(line.issue_event_id) || []
    current.push({
      ...line,
      product: productsById[line.product_id] || null,
      material_requirement: materialRequirementsById[line.material_requirement_id] || null,
    })
    issueLinesByEventId.set(line.issue_event_id, current)
  }

  const receiptLinesByEventId = new Map<string, any[]>()
  for (const line of receiptLines || []) {
    const current = receiptLinesByEventId.get(line.receipt_event_id) || []
    current.push({
      ...line,
      product: productsById[line.product_id] || null,
    })
    receiptLinesByEventId.set(line.receipt_event_id, current)
  }

  return {
    ...base,
    material_requirements: (materialRequirements || []).map((requirement) => ({
      ...requirement,
      product: productsById[requirement.product_id] || null,
      source_bom_line: requirement.source_bom_line_id
        ? sourceBomLinesById[requirement.source_bom_line_id] || null
        : null,
    })),
    reservations: (reservations || []).map((reservation) => ({
      ...reservation,
      lines: reservationLinesByReservationId.get(reservation.id) || [],
    })),
    issue_events: (issueEvents || []).map((event) => ({
      ...event,
      lines: issueLinesByEventId.get(event.id) || [],
    })),
    receipt_events: (receiptEvents || []).map((event) => ({
      ...event,
      lines: receiptLinesByEventId.get(event.id) || [],
    })),
  }
}

export function assertProductionOrderExecutionOpen(order: { id: string; status: string; order_no: string }) {
  if (!["released", "in_progress"].includes(order.status)) {
    throw new ManufacturingApiError(
      409,
      `Production order must be released or in progress for inventory execution in v1 (${order.order_no}, status ${order.status})`
    )
  }
}

export function assertProductionOrderReceiptAllowed(order: { id: string; status: string; order_no: string }) {
  if (order.status !== "in_progress") {
    throw new ManufacturingApiError(
      409,
      `Finished-goods receipt is allowed only when the production order is in progress in v1 (${order.order_no}, status ${order.status})`
    )
  }
}

export function assertProductionOrderReservationCloseAllowed(order: { id: string; status: string; order_no: string }) {
  if (!["completed", "cancelled"].includes(order.status)) {
    throw new ManufacturingApiError(
      409,
      `Reservations can be closed only when the production order is completed or cancelled in v1 (${order.order_no}, status ${order.status})`
    )
  }
}

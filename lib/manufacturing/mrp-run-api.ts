// =============================================================================
// MRP Run API Helpers — B8
// Scope: schemas, context helpers, error handling
// No UI, no triggers, no side effects.
// =============================================================================

import { z } from "zod"
import {
  ManufacturingApiError,
  getManufacturingApiContext,
  handleManufacturingApiError,
  jsonError,
  parseJsonBody,
  resolveScopedBranchId,
} from "@/lib/manufacturing/bom-api"
import { createClient } from "@/lib/supabase/server"

export {
  ManufacturingApiError,
  getManufacturingApiContext,
  handleManufacturingApiError,
  jsonError,
  parseJsonBody,
  resolveScopedBranchId,
}
export type { ManufacturingApiContext } from "@/lib/manufacturing/bom-api"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MRP_RUN_SCOPE_VALUES = ["branch", "warehouse_filtered"] as const
export const MRP_RUN_MODE_VALUES = ["current_state_single_level"] as const
export const MRP_RUN_STATUS_VALUES = ["running", "completed", "failed"] as const
export const MRP_RESULTS_SECTION_VALUES = ["demand", "supply", "net", "suggestions"] as const

export const MRP_ELIGIBLE_PRODUCT_TYPES = new Set(["manufactured", "raw_material", "purchased"])
export const MRP_REORDER_ELIGIBLE_PRODUCT_TYPES = new Set(["raw_material", "purchased"])

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const nullableUuid = z
  .union([z.string().uuid(), z.null(), z.undefined()])
  .transform((v) => (v == null ? null : v))

const nullableIsoTs = z
  .union([z.string(), z.null(), z.undefined()])
  .superRefine((v, ctx) => {
    if (typeof v !== "string") return
    const s = v.trim()
    if (!s) return
    if (Number.isNaN(Date.parse(s))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid ISO date-time" })
    }
  })
  .transform((v) => {
    if (v == null) return null
    const s = v.trim()
    return s ? new Date(Date.parse(s)).toISOString() : null
  })

const nullableText = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null) return null
    const s = v.trim()
    return s.length > 0 ? s : null
  })

/** POST /api/manufacturing/mrp/runs — request body */
export const createMrpRunSchema = z
  .object({
    run_scope: z.enum(MRP_RUN_SCOPE_VALUES),
    branch_id: nullableUuid.optional(),
    warehouse_id: nullableUuid.optional(),
    as_of_at: nullableIsoTs.optional(),
    notes: nullableText.optional(),
  })
  .superRefine((payload, ctx) => {
    if (payload.run_scope === "branch" && payload.warehouse_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "warehouse_id must be null when run_scope is branch",
        path: ["warehouse_id"],
      })
    }
    if (payload.run_scope === "warehouse_filtered" && !payload.warehouse_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "warehouse_id is required when run_scope is warehouse_filtered",
        path: ["warehouse_id"],
      })
    }
  })

export type CreateMrpRunInput = z.infer<typeof createMrpRunSchema>

// ---------------------------------------------------------------------------
// Run accessor
// ---------------------------------------------------------------------------

export async function assertMrpRunAccessible(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  runId: string
) {
  const { data: run, error } = await supabase
    .from("mrp_runs")
    .select("*")
    .eq("id", runId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (error) throw error
  if (!run) throw new ManufacturingApiError(404, "MRP run not found")

  return run
}

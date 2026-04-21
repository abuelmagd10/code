import { NextRequest, NextResponse } from "next/server"
import { z, type ZodTypeAny } from "zod"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { getCompanyMembership, type CompanyMembership } from "@/lib/company-authorization"
import { checkPermission, type ActionType } from "@/lib/authz"

export const BOM_USAGE_VALUES = ["production", "engineering"] as const
export const BOM_LINE_TYPE_VALUES = ["component", "co_product", "by_product"] as const
export const SUBSTITUTE_STRATEGY_VALUES = ["none", "primary_only"] as const

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

export const createBomSchema = z.object({
  branch_id: uuidSchema.optional().nullable(),
  product_id: uuidSchema,
  bom_code: trimmedString.min(1, "bom_code is required"),
  bom_name: trimmedString.min(1, "bom_name is required"),
  bom_usage: z.enum(BOM_USAGE_VALUES).default("production"),
  description: nullableTrimmedString,
  is_active: z.boolean().optional().default(true),
})

export const updateBomSchema = z.object({
  bom_code: trimmedString.min(1).optional(),
  bom_name: trimmedString.min(1).optional(),
  description: nullableTrimmedString.optional(),
  is_active: z.boolean().optional(),
}).refine((payload) => Object.keys(payload).length > 0, {
  message: "At least one field must be provided",
})

export const createBomVersionSchema = z.object({
  clone_from_version_id: uuidSchema.optional().nullable(),
  effective_from: nullableIsoDateTimeString.optional(),
  effective_to: nullableIsoDateTimeString.optional(),
  base_output_qty: z.coerce.number().positive().optional().default(1),
  change_summary: nullableTrimmedString.optional(),
  notes: nullableTrimmedString.optional(),
})

export const updateBomVersionSchema = z.object({
  effective_from: nullableIsoDateTimeString.optional(),
  effective_to: nullableIsoDateTimeString.optional(),
  base_output_qty: z.coerce.number().positive().optional(),
  change_summary: nullableTrimmedString.optional(),
  notes: nullableTrimmedString.optional(),
}).refine((payload) => Object.keys(payload).length > 0, {
  message: "At least one field must be provided",
})

export const bomLineSubstituteInputSchema = z.object({
  substitute_product_id: uuidSchema,
  substitute_quantity: z.coerce.number().positive(),
  priority: z.coerce.number().int().positive().optional().default(1),
  effective_from: nullableIsoDateTimeString.optional(),
  effective_to: nullableIsoDateTimeString.optional(),
  notes: nullableTrimmedString.optional(),
})

export const bomLineInputSchema = z.object({
  line_no: z.coerce.number().int().positive(),
  component_product_id: uuidSchema,
  line_type: z.enum(BOM_LINE_TYPE_VALUES).default("component"),
  quantity_per: z.coerce.number().positive(),
  scrap_percent: z.coerce.number().min(0).lt(100).optional().default(0),
  issue_uom: nullableTrimmedString.optional(),
  is_optional: z.boolean().optional().default(false),
  notes: nullableTrimmedString.optional(),
  substitutes: z.array(bomLineSubstituteInputSchema).optional().default([]),
})

export const updateBomStructureSchema = z.object({
  lines: z.array(bomLineInputSchema),
}).superRefine((payload, ctx) => {
  const seenLineNos = new Set<number>()

  payload.lines.forEach((line, lineIndex) => {
    if (seenLineNos.has(line.line_no)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate line_no ${line.line_no}`,
        path: ["lines", lineIndex, "line_no"],
      })
    }
    seenLineNos.add(line.line_no)

    const seenSubstituteProducts = new Set<string>()
    line.substitutes.forEach((substitute, substituteIndex) => {
      if (seenSubstituteProducts.has(substitute.substitute_product_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate substitute product ${substitute.substitute_product_id} on line ${line.line_no}`,
          path: ["lines", lineIndex, "substitutes", substituteIndex, "substitute_product_id"],
        })
      }
      seenSubstituteProducts.add(substitute.substitute_product_id)
    })
  })
})

export const rejectBomVersionSchema = z.object({
  rejection_reason: trimmedString.min(1, "rejection_reason is required"),
})

export const explosionPreviewSchema = z.object({
  input_quantity: z.coerce.number().positive(),
  as_of_date: nullableIsoDateTimeString.optional(),
  include_substitutes: z.boolean().optional().default(true),
  substitute_strategy: z.enum(SUBSTITUTE_STRATEGY_VALUES).optional().default("primary_only"),
  include_by_products: z.boolean().optional().default(true),
  include_co_products: z.boolean().optional().default(true),
  explode_levels: z.coerce.number().int().min(1).max(1).optional().default(1),
  respect_effective_dates: z.boolean().optional().default(true),
})

export class ManufacturingApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message)
  }
}

export interface ManufacturingApiContext {
  user: { id: string; email?: string | null }
  companyId: string
  member: CompanyMembership
  supabase: Awaited<ReturnType<typeof createClient>>
  admin: ReturnType<typeof createServiceClient>
}

export function jsonError(status: number, message: string, details?: unknown) {
  return NextResponse.json(
    {
      success: false,
      error: message,
      ...(details !== undefined ? { details } : {}),
    },
    { status }
  )
}

export function mapDbErrorToStatus(error: any) {
  const code = String(error?.code || "")
  if (code === "23505") return 409
  if (code === "23503") return 400
  if (code === "23514") return 400
  if (code === "22P02") return 400
  if (code === "P0001") return 409
  return 500
}

export function handleManufacturingApiError(error: unknown) {
  if (error instanceof ManufacturingApiError) {
    return jsonError(error.status, error.message, error.details)
  }

  if (error instanceof z.ZodError) {
    return jsonError(422, "Validation failed", error.flatten())
  }

  if (error && typeof error === "object" && "message" in error) {
    const anyError = error as any
    return jsonError(mapDbErrorToStatus(anyError), String(anyError.message || "Unexpected error"), anyError.details)
  }

  return jsonError(500, "Unexpected server error")
}

export async function parseJsonBody<T extends ZodTypeAny>(request: NextRequest, schema: T): Promise<z.infer<T>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new ManufacturingApiError(400, "Request body must be valid JSON")
  }

  return schema.parse(body)
}

export async function parseOptionalJsonBody<T extends ZodTypeAny>(request: NextRequest, schema: T): Promise<z.infer<T>> {
  const rawBody = await request.text()
  if (!rawBody.trim()) {
    return schema.parse({})
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    throw new ManufacturingApiError(400, "Request body must be valid JSON")
  }

  return schema.parse(body)
}

export async function getManufacturingApiContext(
  request: NextRequest,
  action: ActionType,
  options?: { allowedRoles?: string[] }
): Promise<ManufacturingApiContext> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new ManufacturingApiError(401, "Unauthorized")
  }

  const companyId = await getActiveCompanyId(supabase)
  if (!companyId) {
    throw new ManufacturingApiError(404, "Active company not found")
  }

  const membershipResult = await getCompanyMembership(supabase, user.id, companyId)
  if (!membershipResult.authorized || !membershipResult.membership) {
    throw new ManufacturingApiError(403, membershipResult.error || "Access denied")
  }

  const member = membershipResult.membership
  if (options?.allowedRoles && !options.allowedRoles.includes(member.role)) {
    throw new ManufacturingApiError(403, "Role not allowed for this action")
  }

  const permissionResult = await checkPermission(supabase, "manufacturing_boms", action)
  if (!permissionResult.allowed) {
    throw new ManufacturingApiError(403, `Insufficient permission for manufacturing_boms:${action}`, {
      reason: permissionResult.reason || "permission_denied",
    })
  }

  return {
    user: { id: user.id, email: user.email },
    companyId,
    member,
    supabase,
    admin: createServiceClient(),
  }
}

export function resolveScopedBranchId(member: CompanyMembership, requestedBranchId?: string | null) {
  if (member.isNormalRole) {
    if (!member.branchId) {
      throw new ManufacturingApiError(403, "Your role is branch-scoped but no branch is assigned")
    }
    if (requestedBranchId && requestedBranchId !== member.branchId) {
      throw new ManufacturingApiError(403, "You cannot operate on another branch")
    }
    return member.branchId
  }

  if (!requestedBranchId) {
    throw new ManufacturingApiError(400, "branch_id is required")
  }

  return requestedBranchId
}

export async function assertManufacturingOwnerProductEligibility(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    companyId: string
    branchId: string
    productId: string
  }
) {
  const { data: product, error } = await supabase
    .from("products")
    .select("id, company_id, branch_id, item_type, sku, name")
    .eq("id", params.productId)
    .eq("company_id", params.companyId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!product) {
    throw new ManufacturingApiError(404, "Owner product not found")
  }

  if (String(product.item_type || "") !== "product") {
    throw new ManufacturingApiError(400, "Only product items can own a BOM in v1")
  }

  if (product.branch_id && product.branch_id !== params.branchId) {
    throw new ManufacturingApiError(400, "Owner product must be same-branch or global")
  }

  return product
}

export async function assertBomAccessible(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  bomId: string
) {
  const { data: bom, error } = await supabase
    .from("manufacturing_boms")
    .select("*")
    .eq("id", bomId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (error) throw error
  if (!bom) {
    throw new ManufacturingApiError(404, "BOM not found")
  }

  return bom
}

export async function assertBomVersionAccessible(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  bomVersionId: string
) {
  const { data: version, error } = await supabase
    .from("manufacturing_bom_versions")
    .select("*")
    .eq("id", bomVersionId)
    .eq("company_id", companyId)
    .maybeSingle()

  if (error) throw error
  if (!version) {
    throw new ManufacturingApiError(404, "BOM version not found")
  }

  return version
}

export async function assertVersionBelongsToBom(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  bomId: string,
  bomVersionId: string
) {
  const version = await assertBomVersionAccessible(supabase, companyId, bomVersionId)
  if (version.bom_id !== bomId) {
    throw new ManufacturingApiError(400, "BOM version does not belong to the requested BOM")
  }
  return version
}

export async function loadBomVersionSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  bomVersionId: string
) {
  const version = await assertBomVersionAccessible(supabase, companyId, bomVersionId)
  const bom = await assertBomAccessible(supabase, companyId, version.bom_id)

  const { data: lines, error: linesError } = await supabase
    .from("manufacturing_bom_lines")
    .select("*")
    .eq("bom_version_id", bomVersionId)
    .eq("company_id", companyId)
    .order("line_no")

  if (linesError) throw linesError

  const lineIds = (lines || []).map((line) => line.id)
  let substitutes: any[] = []
  if (lineIds.length > 0) {
    const { data, error } = await supabase
      .from("manufacturing_bom_line_substitutes")
      .select("*")
      .eq("company_id", companyId)
      .in("bom_line_id", lineIds)
      .order("priority")

    if (error) throw error
    substitutes = data || []
  }

  const productIds = Array.from(new Set([
    bom.product_id,
    ...(lines || []).map((line) => line.component_product_id),
    ...substitutes.map((substitute) => substitute.substitute_product_id),
  ].filter(Boolean)))

  let productsById: Record<string, any> = {}
  if (productIds.length > 0) {
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, sku, name, branch_id, item_type")
      .in("id", productIds)

    if (productsError) throw productsError
    productsById = Object.fromEntries((products || []).map((product) => [product.id, product]))
  }

  const substitutesByLineId = substitutes.reduce<Record<string, any[]>>((acc, substitute) => {
    acc[substitute.bom_line_id] ||= []
    acc[substitute.bom_line_id].push({
      ...substitute,
      product: productsById[substitute.substitute_product_id] || null,
    })
    return acc
  }, {})

  return {
    bom,
    version,
    lines: (lines || []).map((line) => ({
      ...line,
      product: productsById[line.component_product_id] || null,
      substitutes: substitutesByLineId[line.id] || [],
    })),
    productsById,
  }
}

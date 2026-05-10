import { NextRequest, NextResponse } from "next/server"
import { z, type ZodTypeAny } from "zod"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { getCompanyMembership, type CompanyMembership } from "@/lib/company-authorization"
import { checkPermission, type ActionType } from "@/lib/authz"
import { normalizeProductTypeInput } from "@/lib/product-type"

export const BOM_USAGE_VALUES = ["production", "engineering"] as const
export const BOM_LINE_TYPE_VALUES = ["component", "co_product", "by_product"] as const
export const SUBSTITUTE_STRATEGY_VALUES = ["none", "primary_only"] as const
export const MANUFACTURING_OWNER_PRODUCT_TYPE = "manufactured" as const
export const BOM_ALLOWED_INPUT_PRODUCT_TYPES = ["raw_material", "purchased", "manufactured"] as const

const BOM_ALLOWED_INPUT_PRODUCT_TYPE_SET = new Set<string>(BOM_ALLOWED_INPUT_PRODUCT_TYPES)

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
  // Phase 1 simplification: optional default source warehouse for material issue
  source_warehouse_id: uuidSchema.optional().nullable(),
})

export const updateBomSchema = z.object({
  bom_code: trimmedString.min(1).optional(),
  bom_name: trimmedString.min(1).optional(),
  description: nullableTrimmedString.optional(),
  is_active: z.boolean().optional(),
  // Phase 1 simplification: optional default source warehouse for material issue
  source_warehouse_id: uuidSchema.optional().nullable(),
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

export type BomLineSubstituteInput = z.infer<typeof bomLineSubstituteInputSchema>
export type BomLineInput = z.infer<typeof bomLineInputSchema>
export type UpdateBomStructureInput = z.infer<typeof updateBomStructureSchema>

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

type ManufacturingDbClient =
  | Awaited<ReturnType<typeof createClient>>
  | ReturnType<typeof createServiceClient>

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
  if (code === "P0001") return 400
  return 500
}

function mapManufacturingDbError(error: any) {
  const code = String(error?.code || "")
  const text = [
    error?.message,
    error?.details,
    error?.hint,
    error?.constraint,
  ].filter(Boolean).join(" ")

  if (code === "23505") {
    if (text.includes("uq_manufacturing_boms_branch_product_usage")) {
      return new ManufacturingApiError(
        409,
        "A BOM already exists for this product, branch and usage. Open the existing BOM and add a new version instead.",
        { code: "DUPLICATE_BOM_PRODUCT_USAGE" }
      )
    }

    if (text.includes("uq_manufacturing_boms_branch_code")) {
      return new ManufacturingApiError(
        409,
        "BOM code is already used in this branch. Choose a different BOM code.",
        { code: "DUPLICATE_BOM_CODE" }
      )
    }
  }

  if (code === "P0001") {
    if (text.includes("Clone source BOM version not found")) {
      return new ManufacturingApiError(
        400,
        "لا يمكن استنساخ النسخة المحددة لأنها لا تتبع قائمة المواد الحالية.",
        { code: "INVALID_BOM_CLONE_SOURCE" }
      )
    }

    if (text.includes("Owner product cannot be used as a direct component")) {
      return new ManufacturingApiError(
        400,
        "لا يمكن استخدام المنتج النهائي نفسه كمكوّن مباشر داخل نفس نسخة قائمة المواد. عدّل المكونات أو ابدأ نسخة فارغة.",
        { code: "BOM_OWNER_AS_COMPONENT" }
      )
    }

    if (text.includes("Component product must have product_type populated")) {
      return new ManufacturingApiError(
        400,
        "لا يمكن إنشاء/استنساخ نسخة قائمة المواد لأن أحد المكونات لا يحتوي على نوع منتج محدد.",
        { code: "BOM_COMPONENT_MISSING_PRODUCT_TYPE" }
      )
    }

    if (text.includes("Component product_type is not eligible")) {
      return new ManufacturingApiError(
        400,
        "لا يمكن إنشاء/استنساخ نسخة قائمة المواد لأن أحد المكونات نوعه غير صالح لاستخدامه في كميات التصنيع.",
        { code: "BOM_COMPONENT_INVALID_PRODUCT_TYPE" }
      )
    }

    if (text.includes("Substitute product must have product_type populated")) {
      return new ManufacturingApiError(
        400,
        "لا يمكن إنشاء/استنساخ نسخة قائمة المواد لأن أحد البدائل لا يحتوي على نوع منتج محدد.",
        { code: "BOM_SUBSTITUTE_MISSING_PRODUCT_TYPE" }
      )
    }

    if (text.includes("Substitute product_type is not eligible")) {
      return new ManufacturingApiError(
        400,
        "لا يمكن إنشاء/استنساخ نسخة قائمة المواد لأن أحد البدائل نوعه غير صالح لاستخدامه في التصنيع.",
        { code: "BOM_SUBSTITUTE_INVALID_PRODUCT_TYPE" }
      )
    }

    if (text.includes("Substitute product cannot be the same as the primary component")) {
      return new ManufacturingApiError(
        400,
        "لا يمكن أن يكون البديل هو نفس المنتج الأساسي في سطر المكوّن.",
        { code: "BOM_SUBSTITUTE_SAME_AS_COMPONENT" }
      )
    }

    if (text.includes("BOM substitutes are allowed only for component lines")) {
      return new ManufacturingApiError(
        400,
        "البدائل مسموحة فقط مع سطور المكونات، وليست مع المنتجات المشتركة أو الثانوية.",
        { code: "BOM_SUBSTITUTE_ON_NON_COMPONENT" }
      )
    }

    if (text.includes("Approved BOM version effective window overlaps another approved version")) {
      return new ManufacturingApiError(
        409,
        "فترة سريان نسخة قائمة المواد المعتمدة تتداخل مع نسخة معتمدة أخرى.",
        { code: "BOM_APPROVED_EFFECTIVE_WINDOW_OVERLAP" }
      )
    }

    if (text.includes("Approved BOM version requires effective_from")) {
      return new ManufacturingApiError(
        400,
        "النسخة المعتمدة من قائمة المواد يجب أن تحتوي على تاريخ بداية السريان.",
        { code: "BOM_APPROVED_REQUIRES_EFFECTIVE_FROM" }
      )
    }

    if (
      text.includes("BOM version must contain at least one line before approval submission") ||
      text.includes("BOM version must have at least one line")
    ) {
      return new ManufacturingApiError(
        400,
        "لا يمكن إرسال نسخة BOM للاعتماد قبل إضافة مكوّن واحد على الأقل وحفظ المواد.",
        { code: "BOM_VERSION_EMPTY_STRUCTURE" }
      )
    }
  }

  return null
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
    const mappedError = mapManufacturingDbError(anyError)
    if (mappedError) {
      return jsonError(mappedError.status, mappedError.message, mappedError.details)
    }
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

  // For owners/admins/managers: use provided branch_id, or fall back to
  // their default branch assignment (member.branchId). Both are valid scopes.
  const resolved = requestedBranchId || member.branchId || null
  if (!resolved) {
    throw new ManufacturingApiError(
      400,
      "branch_id is required — no branch was provided and your account has no default branch assigned"
    )
  }

  return resolved
}

export async function assertManufacturableProduct(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    companyId: string
    branchId: string
    productId: string
  }
) {
  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", params.productId)
    .eq("company_id", params.companyId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!product) {
    throw new ManufacturingApiError(404, "Owner product not found")
  }

  const productType = String((product as any).product_type || "").trim()

  if (!productType) {
    throw new ManufacturingApiError(
      409,
      "Manufacturing eligibility requires products.product_type to be populated"
    )
  }

  if (productType !== MANUFACTURING_OWNER_PRODUCT_TYPE) {
    throw new ManufacturingApiError(
      400,
      `Only ${MANUFACTURING_OWNER_PRODUCT_TYPE} products can own manufacturing records in v1`
    )
  }

  if (product.branch_id && product.branch_id !== params.branchId) {
    throw new ManufacturingApiError(400, "Owner product must be same-branch or global")
  }

  return product
}

function formatProductLabel(product: any, fallbackId: string) {
  return product?.sku || product?.name || fallbackId
}

export function isBomInputProductTypeAllowed(productType: string | null | undefined) {
  if (typeof productType !== "string") return false
  return BOM_ALLOWED_INPUT_PRODUCT_TYPE_SET.has(productType.trim())
}

export async function assertBomStructureEligibleProducts(
  supabase: ManufacturingDbClient,
  params: {
    companyId: string
    branchId: string
    lines: UpdateBomStructureInput["lines"]
  }
) {
  const productIds = Array.from(
    new Set(
      params.lines.flatMap((line) => [
        line.component_product_id,
        ...(line.substitutes || []).map((substitute) => substitute.substitute_product_id),
      ])
    )
  )

  if (productIds.length === 0) {
    return
  }

  const { data: products, error } = await supabase
    .from("products")
    .select("id, company_id, branch_id, product_type, sku, name")
    .eq("company_id", params.companyId)
    .in("id", productIds)

  if (error) throw error

  const productsById = new Map((products || []).map((product) => [product.id, product]))

  for (const line of params.lines) {
    const component = productsById.get(line.component_product_id)
    if (!component) {
      throw new ManufacturingApiError(404, `Component product not found: ${line.component_product_id}`)
    }

    const componentType = normalizeProductTypeInput(component.product_type)
    const componentLabel = formatProductLabel(component, line.component_product_id)

    if (!componentType) {
      throw new ManufacturingApiError(
        409,
        `Component product ${componentLabel} must have product_type populated`
      )
    }

    if (!isBomInputProductTypeAllowed(componentType)) {
      throw new ManufacturingApiError(
        400,
        `Component product ${componentLabel} with product_type=${componentType} is not eligible for BOM quantity logic`
      )
    }

    if (component.branch_id && component.branch_id !== params.branchId) {
      throw new ManufacturingApiError(
        400,
        `Component product ${componentLabel} must be same-branch or global`
      )
    }

    if ((line.substitutes?.length || 0) > 0 && line.line_type !== "component") {
      throw new ManufacturingApiError(
        400,
        `Substitutes are allowed only for component lines. line_no=${line.line_no}`
      )
    }

    for (const substitute of line.substitutes || []) {
      const substituteProduct = productsById.get(substitute.substitute_product_id)
      if (!substituteProduct) {
        throw new ManufacturingApiError(404, `Substitute product not found: ${substitute.substitute_product_id}`)
      }

      const substituteType = normalizeProductTypeInput(substituteProduct.product_type)
      const substituteLabel = formatProductLabel(substituteProduct, substitute.substitute_product_id)

      if (!substituteType) {
        throw new ManufacturingApiError(
          409,
          `Substitute product ${substituteLabel} must have product_type populated`
        )
      }

      if (!isBomInputProductTypeAllowed(substituteType)) {
        throw new ManufacturingApiError(
          400,
          `Substitute product ${substituteLabel} with product_type=${substituteType} is not eligible for BOM quantity logic`
        )
      }

      if (substituteProduct.branch_id && substituteProduct.branch_id !== params.branchId) {
        throw new ManufacturingApiError(
          400,
          `Substitute product ${substituteLabel} must be same-branch or global`
        )
      }

      if (substitute.substitute_product_id === line.component_product_id) {
        throw new ManufacturingApiError(
          400,
          `Substitute product cannot be the same as the primary component on line ${line.line_no}`
        )
      }
    }
  }
}

export async function assertBomVersionCloneable(
  supabase: ManufacturingDbClient,
  params: {
    companyId: string
    bomId: string
    branchId: string
    ownerProductId: string
    cloneFromVersionId: string
  }
) {
  const { data: sourceVersion, error: versionError } = await supabase
    .from("manufacturing_bom_versions")
    .select("id, bom_id, version_no")
    .eq("id", params.cloneFromVersionId)
    .eq("bom_id", params.bomId)
    .eq("company_id", params.companyId)
    .maybeSingle()

  if (versionError) throw versionError

  if (!sourceVersion) {
    throw new ManufacturingApiError(
      400,
      "لا يمكن استنساخ النسخة المحددة لأنها لا تتبع قائمة المواد الحالية.",
      { code: "INVALID_BOM_CLONE_SOURCE" }
    )
  }

  const { data: lines, error: linesError } = await supabase
    .from("manufacturing_bom_lines")
    .select("id, line_no, component_product_id, line_type, quantity_per, scrap_percent, issue_uom, is_optional, notes")
    .eq("bom_version_id", params.cloneFromVersionId)
    .eq("company_id", params.companyId)
    .order("line_no")

  if (linesError) throw linesError

  const lineIds = (lines || []).map((line) => line.id)
  let substitutes: Array<{
    bom_line_id: string
    substitute_product_id: string
    substitute_quantity: number
    priority: number
    effective_from?: string | null
    effective_to?: string | null
    notes?: string | null
  }> = []

  if (lineIds.length > 0) {
    const { data, error } = await supabase
      .from("manufacturing_bom_line_substitutes")
      .select("bom_line_id, substitute_product_id, substitute_quantity, priority, effective_from, effective_to, notes")
      .eq("company_id", params.companyId)
      .in("bom_line_id", lineIds)

    if (error) throw error
    substitutes = data || []
  }

  const substitutesByLineId = substitutes.reduce<Record<string, typeof substitutes>>((acc, substitute) => {
    acc[substitute.bom_line_id] ||= []
    acc[substitute.bom_line_id].push(substitute)
    return acc
  }, {})

  const cloneLines: UpdateBomStructureInput["lines"] = (lines || []).map((line) => ({
    line_no: Number(line.line_no),
    component_product_id: line.component_product_id,
    line_type: line.line_type,
    quantity_per: Number(line.quantity_per),
    scrap_percent: Number(line.scrap_percent || 0),
    issue_uom: line.issue_uom || null,
    is_optional: Boolean(line.is_optional),
    notes: line.notes || null,
    substitutes: (substitutesByLineId[line.id] || []).map((substitute) => ({
      substitute_product_id: substitute.substitute_product_id,
      substitute_quantity: Number(substitute.substitute_quantity),
      priority: Number(substitute.priority || 1),
      effective_from: substitute.effective_from || null,
      effective_to: substitute.effective_to || null,
      notes: substitute.notes || null,
    })),
  }))

  const ownerAsComponentLine = cloneLines.find(
    (line) => line.line_type === "component" && line.component_product_id === params.ownerProductId
  )

  if (ownerAsComponentLine) {
    throw new ManufacturingApiError(
      400,
      `لا يمكن استنساخ النسخة v${sourceVersion.version_no} لأن السطر ${ownerAsComponentLine.line_no} يستخدم المنتج النهائي نفسه كمكوّن. ابدأ نسخة فارغة أو عدّل النسخة المصدر أولاً.`,
      { code: "BOM_OWNER_AS_COMPONENT", sourceVersionId: sourceVersion.id, lineNo: ownerAsComponentLine.line_no }
    )
  }

  try {
    await assertBomStructureEligibleProducts(supabase, {
      companyId: params.companyId,
      branchId: params.branchId,
      lines: cloneLines,
    })
  } catch (error) {
    if (error instanceof ManufacturingApiError) {
      throw new ManufacturingApiError(
        error.status,
        `لا يمكن استنساخ النسخة v${sourceVersion.version_no}: ${error.message}`,
        { code: "INVALID_BOM_CLONE_STRUCTURE", sourceVersionId: sourceVersion.id, cause: error.details }
      )
    }
    throw error
  }

  return sourceVersion
}

export async function assertBomVersionReadyForApproval(
  supabase: ManufacturingDbClient,
  params: {
    companyId: string
    bomVersionId: string
  }
) {
  const { count, error } = await supabase
    .from("manufacturing_bom_lines")
    .select("id", { count: "exact", head: true })
    .eq("company_id", params.companyId)
    .eq("bom_version_id", params.bomVersionId)

  if (error) throw error

  if (!count || count <= 0) {
    throw new ManufacturingApiError(
      400,
      "لا يمكن إرسال نسخة BOM للاعتماد قبل إضافة مكوّن واحد على الأقل وحفظ المواد.",
      { code: "BOM_VERSION_EMPTY_STRUCTURE" }
    )
  }
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
      .select("*")
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

/**
 * Product Bundles — API Helpers
 *
 * Zod schemas and shared utilities for all /api/products/[id]/bundle/** routes.
 * Bundles are a sidecar to products: a parent product can ship with a list of
 * accompanying children that get expanded into the invoice / sales-order at
 * the UI layer.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z, type ZodTypeAny } from 'zod'

const uuidSchema = z.string().uuid('Invalid UUID format')

export const PRICE_HANDLING_VALUES = ['add_to_total', 'included', 'free'] as const

// ── Schemas ──────────────────────────────────────────────────────────────────

export const createBundleItemSchema = z.object({
  child_product_id:      uuidSchema,
  quantity:              z.coerce.number().positive('quantity must be > 0'),
  is_optional:           z.boolean().optional().default(false),
  auto_deduct_inventory: z.boolean().optional().default(true),
  price_handling:        z.enum(PRICE_HANDLING_VALUES).optional().default('add_to_total'),
  display_order:         z.coerce.number().int().nonnegative().optional().default(0),
  notes:                 z.string().trim().optional().nullable(),
})

export const updateBundleItemSchema = z
  .object({
    quantity:              z.coerce.number().positive().optional(),
    is_optional:           z.boolean().optional(),
    auto_deduct_inventory: z.boolean().optional(),
    price_handling:        z.enum(PRICE_HANDLING_VALUES).optional(),
    display_order:         z.coerce.number().int().nonnegative().optional(),
    notes:                 z.string().trim().optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  })

export type CreateBundleItemInput = z.infer<typeof createBundleItemSchema>
export type UpdateBundleItemInput = z.infer<typeof updateBundleItemSchema>

// ── Errors ───────────────────────────────────────────────────────────────────

export class BundleApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'BundleApiError'
  }
}

function mapBundleDbError(error: any): BundleApiError | null {
  const code = String(error?.code || '')
  const text = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ')

  if (code === '23505') {
    return new BundleApiError(409, 'هذا الصنف مرفق بالفعل مع المنتج الأم', { code: 'DUPLICATE_CHILD' })
  }
  if (code === '23503') {
    return new BundleApiError(404, 'المنتج الأم أو الصنف المرفق غير موجود', { code: 'FK_VIOLATION' })
  }
  if (code === '23514') {
    if (text.includes('chk_pbi_parent_not_child')) {
      return new BundleApiError(400, 'لا يمكن ربط المنتج بنفسه', { code: 'SELF_LINK' })
    }
    if (text.includes('chk_pbi_quantity_positive')) {
      return new BundleApiError(400, 'الكمية يجب أن تكون أكبر من صفر', { code: 'BAD_QUANTITY' })
    }
    if (text.includes('chk_pbi_price_handling')) {
      return new BundleApiError(400, 'قيمة price_handling غير صالحة', { code: 'BAD_PRICE_HANDLING' })
    }
    return new BundleApiError(400, 'قيمة غير صالحة في بيانات الحزمة', { code: 'CHECK_VIOLATION' })
  }
  if (code === 'P0001') {
    if (text.includes('Recursive bundles are not allowed')) {
      return new BundleApiError(
        400,
        'لا يمكن إنشاء حزمة داخل حزمة. المنتج مُستخدم بالفعل كصنف مرفق في حزمة أخرى، أو له أصناف مرفقة خاصة به.',
        { code: 'RECURSIVE_BUNDLE' }
      )
    }
    if (text.includes('must all belong to the same company')) {
      return new BundleApiError(400, 'المنتج الأم والصنف المرفق يجب أن يكونا في نفس الشركة', {
        code: 'COMPANY_MISMATCH',
      })
    }
    if (text.includes('does not exist')) {
      return new BundleApiError(404, 'المنتج المطلوب غير موجود', { code: 'PRODUCT_NOT_FOUND' })
    }
    return new BundleApiError(400, text || 'خطأ في قاعدة البيانات', { code: 'DB_RULE_VIOLATION' })
  }
  return null
}

export function handleBundleApiError(error: unknown): NextResponse {
  if (error instanceof BundleApiError) {
    return NextResponse.json(
      { success: false, error: error.message, details: error.details ?? null },
      { status: error.status }
    )
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { success: false, error: 'بيانات غير صالحة', details: error.flatten() },
      { status: 422 }
    )
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const mapped = mapBundleDbError(error)
    if (mapped) {
      return NextResponse.json(
        { success: false, error: mapped.message, details: mapped.details ?? null },
        { status: mapped.status }
      )
    }
    console.error('[BUNDLE_API_ERROR]', error)
    return NextResponse.json(
      { success: false, error: 'حدث خطأ داخلي في الخادم', details: null },
      { status: 500 }
    )
  }
  console.error('[BUNDLE_API_UNHANDLED]', error)
  return NextResponse.json(
    { success: false, error: 'حدث خطأ غير متوقع', details: null },
    { status: 500 }
  )
}

// ── Body Parser ──────────────────────────────────────────────────────────────

export async function parseJsonBody<T extends ZodTypeAny>(
  request: NextRequest,
  schema: T
): Promise<z.infer<T>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new BundleApiError(400, 'Request body must be valid JSON')
  }
  return schema.parse(body)
}

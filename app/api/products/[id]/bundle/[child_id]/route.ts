import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiGuard, asyncAuditLog } from '@/lib/core'
import {
  updateBundleItemSchema,
  parseJsonBody,
  handleBundleApiError,
  BundleApiError,
} from '@/lib/products/bundle-api'

interface RouteParams {
  params: Promise<{ id: string; child_id: string }>
}

/**
 * PUT /api/products/[id]/bundle/[child_id]
 * Update an existing bundle line. The route param [child_id] refers to the
 * product_bundle_items.id, NOT the child product id, to keep the URL stable
 * even if a future swap of child products is allowed.
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, {
      requireAuth:    true,
      requireCompany: true,
      resource:       'products',
      action:         'write',
    })
    if (errorResponse) return errorResponse

    const { user, companyId } = context!
    const { id: parentId, child_id: rowId } = await params

    const body = await parseJsonBody(req, updateBundleItemSchema)

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('product_bundle_items')
      .update({
        quantity:              body.quantity              ?? undefined,
        is_optional:           body.is_optional           ?? undefined,
        auto_deduct_inventory: body.auto_deduct_inventory ?? undefined,
        price_handling:        body.price_handling        ?? undefined,
        display_order:         body.display_order         ?? undefined,
        notes:                 body.notes                 ?? undefined,
        updated_by:            user.id,
      })
      .eq('id', rowId)
      .eq('parent_product_id', parentId)
      .eq('company_id', companyId)
      .select()
      .maybeSingle()

    if (error) throw error
    if (!data) throw new BundleApiError(404, 'سطر الحزمة غير موجود')

    asyncAuditLog({
      companyId,
      userId:    user.id,
      userEmail: user.email,
      action:    'UPDATE',
      table:     'product_bundle_items',
      recordId:  rowId,
      newData:   body,
    })

    return NextResponse.json({ success: true, item: data })
  } catch (error) {
    return handleBundleApiError(error)
  }
}

/**
 * DELETE /api/products/[id]/bundle/[child_id]
 * Remove a bundle line.
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(_req, {
      requireAuth:    true,
      requireCompany: true,
      resource:       'products',
      action:         'delete',
    })
    if (errorResponse) return errorResponse

    const { user, companyId } = context!
    const { id: parentId, child_id: rowId } = await params

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('product_bundle_items')
      .delete()
      .eq('id', rowId)
      .eq('parent_product_id', parentId)
      .eq('company_id', companyId)
      .select()
      .maybeSingle()

    if (error) throw error
    if (!data) throw new BundleApiError(404, 'سطر الحزمة غير موجود')

    asyncAuditLog({
      companyId,
      userId:    user.id,
      userEmail: user.email,
      action:    'DELETE',
      table:     'product_bundle_items',
      recordId:  rowId,
      oldData:   data,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleBundleApiError(error)
  }
}

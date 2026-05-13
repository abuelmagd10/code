import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiGuard, asyncAuditLog } from '@/lib/core'
import {
  createBundleItemSchema,
  parseJsonBody,
  handleBundleApiError,
  BundleApiError,
} from '@/lib/products/bundle-api'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/products/[id]/bundle
 * List bundle children for the given parent product (with child product info).
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { companyId } = context!
    const { id: parentId } = await params

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('product_bundle_items')
      .select(`
        id, parent_product_id, child_product_id, quantity,
        is_optional, auto_deduct_inventory, price_handling,
        display_order, notes, created_at, updated_at,
        child:products!product_bundle_items_child_product_id_fkey (
          id, name, sku, unit_price, cost_price, item_type, is_active
        )
      `)
      .eq('parent_product_id', parentId)
      .eq('company_id', companyId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) throw error

    return NextResponse.json({ success: true, items: data ?? [] })
  } catch (error) {
    return handleBundleApiError(error)
  }
}

/**
 * POST /api/products/[id]/bundle
 * Attach a new child product to the parent.
 * Body: { child_product_id, quantity, is_optional?, auto_deduct_inventory?, price_handling?, display_order?, notes? }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, {
      requireAuth:    true,
      requireCompany: true,
      resource:       'products',
      action:         'write',
    })
    if (errorResponse) return errorResponse

    const { user, companyId } = context!
    const { id: parentId } = await params

    const body = await parseJsonBody(req, createBundleItemSchema)

    if (body.child_product_id === parentId) {
      throw new BundleApiError(400, 'لا يمكن ربط المنتج بنفسه')
    }

    const supabase = await createClient()

    // Verify parent belongs to caller's company before insert (defence in depth on
    // top of the bdl_validate_company_match trigger).
    const { data: parentRow, error: parentErr } = await supabase
      .from('products')
      .select('id')
      .eq('id', parentId)
      .eq('company_id', companyId)
      .maybeSingle()
    if (parentErr) throw parentErr
    if (!parentRow) throw new BundleApiError(404, 'المنتج الأم غير موجود')

    const { data, error } = await supabase
      .from('product_bundle_items')
      .insert({
        company_id:            companyId,
        parent_product_id:     parentId,
        child_product_id:      body.child_product_id,
        quantity:              body.quantity,
        is_optional:           body.is_optional ?? false,
        auto_deduct_inventory: body.auto_deduct_inventory ?? true,
        price_handling:        body.price_handling ?? 'add_to_total',
        display_order:         body.display_order ?? 0,
        notes:                 body.notes ?? null,
        created_by:            user.id,
        updated_by:            user.id,
      })
      .select()
      .single()

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId:    user.id,
      userEmail: user.email,
      action:    'CREATE',
      table:     'product_bundle_items',
      recordId:  data.id,
      newData:   body,
    })

    return NextResponse.json({ success: true, item: data }, { status: 201 })
  } catch (error) {
    return handleBundleApiError(error)
  }
}

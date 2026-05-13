import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiGuard } from '@/lib/core'
import { handleBundleApiError } from '@/lib/products/bundle-api'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/products/[id]/bundle/expand?qty=N
 *
 * Returns the expanded child rows ready to merge into invoice items.
 * Used by the invoice / sales-order UI when the user picks a product that has
 * a bundle. The response also includes a small parent block for convenience.
 *
 * Response: {
 *   success: true,
 *   parent: { product_id, parent_qty },
 *   rows:   <output of bdl_expand_product_bundle>,
 *   has_optional: boolean
 * }
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { companyId } = context!
    const { id: productId } = await params

    const url = new URL(req.url)
    const qtyParam = url.searchParams.get('qty')
    const parentQty = qtyParam ? Math.max(0, Number(qtyParam) || 0) : 1

    const supabase = await createClient()

    const { data, error } = await supabase.rpc('bdl_expand_product_bundle', {
      p_product_id:  productId,
      p_parent_qty:  parentQty,
      p_company_id:  companyId,
    })

    if (error) throw error

    const rows = Array.isArray(data) ? data : []
    const hasOptional = rows.some((r: any) => r?.is_optional === true)

    return NextResponse.json({
      success: true,
      parent:  { product_id: productId, parent_qty: parentQty },
      rows,
      has_optional: hasOptional,
    })
  } catch (error) {
    return handleBundleApiError(error)
  }
}

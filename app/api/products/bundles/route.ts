import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiGuard } from '@/lib/core'
import { handleBundleApiError } from '@/lib/products/bundle-api'

/**
 * GET /api/products/bundles
 *
 * Returns a compact map of which products in the company act as bundle
 * parents, with the count of children. Used by ProductsTable and similar UIs
 * to render a "📦 N items" badge without N+1 queries.
 *
 * Response: {
 *   success: true,
 *   bundles: { [parent_product_id]: { count, has_optional } }
 * }
 */
export async function GET(req: NextRequest) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { companyId } = context!
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('product_bundle_items')
      .select('parent_product_id, is_optional')
      .eq('company_id', companyId)

    if (error) throw error

    const map: Record<string, { count: number; has_optional: boolean }> = {}
    for (const row of data ?? []) {
      const key = row.parent_product_id as string
      if (!map[key]) map[key] = { count: 0, has_optional: false }
      map[key].count += 1
      if (row.is_optional) map[key].has_optional = true
    }

    return NextResponse.json({ success: true, bundles: map })
  } catch (error) {
    return handleBundleApiError(error)
  }
}

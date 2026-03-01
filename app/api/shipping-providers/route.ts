/**
 * GET /api/shipping-providers
 * جلب شركات الشحن مع RBAC حسب الفرع:
 * - الأدوار العليا (owner/admin/gm): جميع شركات الشحن في الشركة
 * - أدوار الفرع: فقط الشركات المرتبطة بفرع المستخدم (أو الكل إذا لا يوجد ربط بعد)
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { enforceGovernance } from "@/lib/governance-middleware"

const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager', 'gm', 'super_admin', 'superadmin', 'generalmanager']

export async function GET(request: NextRequest) {
  try {
    const governance = await enforceGovernance()
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const branchIdParam = searchParams.get('branch_id')

    const role = String(governance.role || '').trim().toLowerCase().replace(/\s+/g, '_')
    const isPrivileged = PRIVILEGED_ROLES.some(r => role === r.replace(/\s+/g, '_'))

    let providerIds: string[] | null = null

    if (!isPrivileged && governance.branchIds?.length) {
      const userBranchId = branchIdParam || governance.branchIds[0] || null
      if (userBranchId) {
        const { data: links } = await supabase
          .from('branch_shipping_providers')
          .select('shipping_provider_id')
          .eq('branch_id', userBranchId)
          .or('is_active.is.null,is_active.eq.true')
        if (links && links.length > 0) {
          providerIds = links.map((r: { shipping_provider_id: string }) => r.shipping_provider_id)
        }
      }
    }

    let query = supabase
      .from('shipping_providers')
      .select('id, provider_name, provider_code, is_active')
      .eq('company_id', governance.companyId)
      .eq('is_active', true)
      .order('provider_name')

    if (providerIds !== null && providerIds.length > 0) {
      query = query.in('id', providerIds)
    } else if (providerIds !== null && providerIds.length === 0) {
      return NextResponse.json({ success: true, data: [], meta: { filteredByBranch: true } })
    }

    const { data: providers, error } = await query
    if (error) {
      console.error('[API shipping-providers]', error)
      return NextResponse.json({ error: error.message, error_ar: 'خطأ في جلب شركات الشحن' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: providers || [],
      meta: {
        filteredByBranch: providerIds !== null,
        role: governance.role
      }
    })
  } catch (err: any) {
    console.error('[API shipping-providers]', err)
    return NextResponse.json(
      { error: err.message, error_ar: 'حدث خطأ غير متوقع' },
      { status: err.message?.includes('Unauthorized') ? 401 : 500 }
    )
  }
}

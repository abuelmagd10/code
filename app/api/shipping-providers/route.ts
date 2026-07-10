/**
 * GET /api/shipping-providers
 * جلب شركات الشحن ومنافذ البيع مع RBAC حسب الفرع:
 * - الأدوار العليا (owner/admin/gm): جميع شركات الشحن في الشركة
 * - أدوار الفرع: الشركات المرتبطة بفرع المستخدم (branch_shipping_providers)
 *   بالإضافة إلى الشركات غير المرتبطة بأى فرع (عامة/global لكل الفروع)
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

    const { data: providers, error } = await supabase
      .from('shipping_providers')
      .select('id, provider_name, provider_code, is_active')
      .eq('company_id', governance.companyId)
      .eq('is_active', true)
      .order('provider_name')

    if (error) {
      console.error('[API shipping-providers]', error)
      return NextResponse.json({ error: error.message, error_ar: 'خطأ في جلب شركات الشحن' }, { status: 500 })
    }

    let list = providers || []
    let filteredByBranch = false

    if (!isPrivileged && list.length > 0) {
      // الدلالة الجديدة: الشركة بدون أى ربط فروع = عامة (تظهر لكل الفروع)،
      // والشركة المرتبطة بفروع تظهر فقط لفروعها المرتبطة.
      // أدوار الفرع تُفلتر بفرع المستخدم أولاً ثم فرع المستند كاحتياطى.
      const userBranchId = governance.branchIds?.[0] || branchIdParam || null
      const providerIds: string[] = list.map((p: { id: string }) => String(p.id))
      const { data: links, error: linksError } = await supabase
        .from('branch_shipping_providers')
        .select('shipping_provider_id, branch_id')
        .in('shipping_provider_id', providerIds)
        .or('is_active.is.null,is_active.eq.true')

      if (!linksError) {
        const mappedIds = new Set<string>(
          (links || []).map((l: { shipping_provider_id: string }) => String(l.shipping_provider_id))
        )
        const allowedForBranch = new Set<string>(
          (links || [])
            .filter((l: { branch_id: string }) => userBranchId && String(l.branch_id) === String(userBranchId))
            .map((l: { shipping_provider_id: string }) => String(l.shipping_provider_id))
        )
        list = list.filter((p: { id: string }) => !mappedIds.has(String(p.id)) || allowedForBranch.has(String(p.id)))
        filteredByBranch = true
      } else {
        console.error('[API shipping-providers] branch mapping fetch failed', linksError)
      }
    }

    return NextResponse.json({
      success: true,
      data: list,
      meta: {
        filteredByBranch,
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

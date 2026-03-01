/**
 * إدارة ربط شركات الشحن بالفروع (للأدوار العليا فقط)
 * GET: قائمة الربط للشركة
 * POST: إضافة ربط (branch_id, shipping_provider_id)
 * DELETE: إزالة ربط (body: branch_id, shipping_provider_id)
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { enforceGovernance } from "@/lib/governance-middleware"

const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager', 'gm', 'super_admin', 'superadmin', 'generalmanager']

function isPrivileged(role: string): boolean {
  const r = String(role || '').trim().toLowerCase().replace(/\s+/g, '_')
  return PRIVILEGED_ROLES.some(p => r === p.replace(/\s+/g, '_'))
}

export async function GET() {
  try {
    const governance = await enforceGovernance()
    if (!isPrivileged(governance.role)) {
      return NextResponse.json({ error: 'Forbidden', error_ar: 'غير مصرح بتعديل ربط شركات الشحن بالفروع' }, { status: 403 })
    }
    const supabase = await createClient()
    const { data: links, error } = await supabase
      .from('branch_shipping_providers')
      .select(`
        id,
        branch_id,
        shipping_provider_id,
        is_active,
        created_at,
        branches(id, name),
        shipping_providers(id, provider_name, provider_code)
      `)
      .order('branch_id')
    if (error) {
      console.error('[API branch-shipping-providers GET]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const branchesInCompany = await supabase
      .from('branches')
      .select('id, name')
      .eq('company_id', governance.companyId)
      .order('name')
    const providersInCompany = await supabase
      .from('shipping_providers')
      .select('id, provider_name, provider_code')
      .eq('company_id', governance.companyId)
      .eq('is_active', true)
      .order('provider_name')
    return NextResponse.json({
      success: true,
      data: links || [],
      branches: branchesInCompany.data || [],
      providers: providersInCompany.data || []
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: err.message?.includes('Unauthorized') ? 401 : 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const governance = await enforceGovernance()
    if (!isPrivileged(governance.role)) {
      return NextResponse.json({ error: 'Forbidden', error_ar: 'غير مصرح' }, { status: 403 })
    }
    const body = await request.json()
    const { branch_id, shipping_provider_id } = body
    if (!branch_id || !shipping_provider_id) {
      return NextResponse.json(
        { error: 'branch_id and shipping_provider_id required', error_ar: 'الفرع وشركة الشحن مطلوبان' },
        { status: 400 }
      )
    }
    const supabase = await createClient()
    const { data: row, error } = await supabase
      .from('branch_shipping_providers')
      .insert({
        branch_id,
        shipping_provider_id,
        is_active: true,
        updated_at: new Date().toISOString()
      })
      .select('id, branch_id, shipping_provider_id')
      .single()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Already linked', error_ar: 'الربط موجود مسبقاً' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, data: row }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const governance = await enforceGovernance()
    if (!isPrivileged(governance.role)) {
      return NextResponse.json({ error: 'Forbidden', error_ar: 'غير مصرح' }, { status: 403 })
    }
    const body = await request.json().catch(() => ({}))
    const { branch_id, shipping_provider_id } = body
    if (!branch_id || !shipping_provider_id) {
      return NextResponse.json(
        { error: 'branch_id and shipping_provider_id required', error_ar: 'الفرع وشركة الشحن مطلوبان' },
        { status: 400 }
      )
    }
    const supabase = await createClient()
    const { error } = await supabase
      .from('branch_shipping_providers')
      .delete()
      .eq('branch_id', branch_id)
      .eq('shipping_provider_id', shipping_provider_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

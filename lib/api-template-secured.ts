import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { secureApiRequest, serverError, badRequestError } from '@/lib/api-security-enhanced'
import { buildBranchFilter } from '@/lib/branch-access-control'

// Template for secured API endpoints
export async function GET(request: NextRequest) {
  try {
    const { user, companyId, branchId, member, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: true,
      requirePermission: { resource: 'RESOURCE_NAME', action: 'read' }
    })

    if (error) return error
    if (!companyId) return badRequestError('معرف الشركة مطلوب')
    if (!branchId) return badRequestError('معرف الفرع مطلوب')

    const supabase = createClient()
    const branchFilter = buildBranchFilter(branchId!, member.role)

    // Your query here with branchFilter
    const { data, error: dbError } = await supabase
      .from('TABLE_NAME')
      .select('*')
      .eq('company_id', companyId)
      .match(branchFilter)

    if (dbError) {
      return serverError(`خطأ في جلب البيانات: ${dbError.message}`)
    }

    return NextResponse.json({
      success: true,
      data: data || []
    })
  } catch (e: any) {
    return serverError(`خطأ: ${e?.message}`)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, companyId, branchId, costCenterId, warehouseId, member, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: true,
      requirePermission: { resource: 'RESOURCE_NAME', action: 'write' }
    })

    if (error) return error
    if (!companyId) return badRequestError('معرف الشركة مطلوب')
    if (!branchId) return badRequestError('معرف الفرع مطلوب')

    const body = await request.json()
    const supabase = createClient()

    // Add mandatory fields
    const dataToInsert = {
      ...body,
      company_id: companyId,
      branch_id: branchId,
      cost_center_id: costCenterId,
      warehouse_id: warehouseId,
      created_by: user.id
    }

    const { data, error: dbError } = await supabase
      .from('TABLE_NAME')
      .insert(dataToInsert)
      .select()
      .single()

    if (dbError) {
      return serverError(`خطأ في إنشاء السجل: ${dbError.message}`)
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (e: any) {
    return serverError(`خطأ: ${e?.message}`)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user, companyId, branchId, member, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: true,
      requirePermission: { resource: 'RESOURCE_NAME', action: 'write' }
    })

    if (error) return error
    if (!companyId) return badRequestError('معرف الشركة مطلوب')

    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) return badRequestError('معرف السجل مطلوب')

    const supabase = createClient()
    const branchFilter = buildBranchFilter(branchId!, member.role)

    // Verify ownership
    const { data: existing } = await supabase
      .from('TABLE_NAME')
      .select('id')
      .eq('id', id)
      .eq('company_id', companyId)
      .match(branchFilter)
      .single()

    if (!existing) {
      return badRequestError('السجل غير موجود أو لا يمكن الوصول إليه')
    }

    const { data, error: dbError } = await supabase
      .from('TABLE_NAME')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (dbError) {
      return serverError(`خطأ في تحديث السجل: ${dbError.message}`)
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (e: any) {
    return serverError(`خطأ: ${e?.message}`)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user, companyId, branchId, member, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: true,
      requirePermission: { resource: 'RESOURCE_NAME', action: 'delete' },
      allowedRoles: ['owner', 'admin', 'manager']
    })

    if (error) return error
    if (!companyId) return badRequestError('معرف الشركة مطلوب')

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) return badRequestError('معرف السجل مطلوب')

    const supabase = createClient()
    const branchFilter = buildBranchFilter(branchId!, member.role)

    // Verify ownership
    const { data: existing } = await supabase
      .from('TABLE_NAME')
      .select('id')
      .eq('id', id)
      .eq('company_id', companyId)
      .match(branchFilter)
      .single()

    if (!existing) {
      return badRequestError('السجل غير موجود أو لا يمكن الوصول إليه')
    }

    const { error: dbError } = await supabase
      .from('TABLE_NAME')
      .delete()
      .eq('id', id)

    if (dbError) {
      return serverError(`خطأ في حذف السجل: ${dbError.message}`)
    }

    return NextResponse.json({
      success: true,
      message: 'تم الحذف بنجاح'
    })
  } catch (e: any) {
    return serverError(`خطأ: ${e?.message}`)
  }
}
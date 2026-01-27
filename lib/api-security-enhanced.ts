import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/company'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SecurityConfig {
  requireAuth?: boolean
  requireCompany?: boolean
  requireBranch?: boolean
  requirePermission?: {
    resource: string
    action: 'read' | 'write' | 'delete' | 'admin'
  }
  allowedRoles?: string[]
  supabase?: SupabaseClient // ✅ إضافة supabase client اختياري
}

export interface SecurityResult {
  user: any
  companyId: string
  branchId?: string
  costCenterId?: string
  warehouseId?: string
  member: any
  error?: NextResponse
}

export async function secureApiRequest(
  request: NextRequest,
  config: SecurityConfig
): Promise<SecurityResult> {
  // ✅ استخدام supabase client المُمرر أو إنشاء واحد جديد
  const supabase = config.supabase || await createClient()

  // 1. التحقق من المصادقة
  if (config.requireAuth !== false) {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return {
        user: null,
        companyId: '',
        member: null,
        error: NextResponse.json(
          { error: 'غير مصرح', message: 'Unauthorized' },
          { status: 401 }
        )
      }
    }

    // 2. التحقق من العضوية في الشركة
    if (config.requireCompany !== false) {
      // ✅ استخدام getActiveCompanyId بدلاً من query params (أكثر أماناً)
      const companyId = await getActiveCompanyId(supabase)
      
      if (!companyId) {
        return {
          user,
          companyId: '',
          member: null,
          error: NextResponse.json(
            { error: 'لم يتم العثور على الشركة', message: 'Company not found' },
            { status: 404 }
          )
        }
      }

      // ✅ التحقق من العضوية (Explicit columns - no SELECT *)
      // ✅ نجلب الأعمدة الأساسية فقط، بدون العلاقات لتجنب مشاكل RLS
      const { data: member, error: memberError } = await supabase
        .from('company_members')
        .select('id, company_id, user_id, role, branch_id, cost_center_id, warehouse_id, email, created_at')
        .eq('user_id', user.id)
        .eq('company_id', companyId)
        .single()

      if (memberError || !member) {
        return {
          user,
          companyId,
          member: null,
          error: NextResponse.json(
            { error: 'غير مسموح', message: 'Access denied to company' },
            { status: 403 }
          )
        }
      }

      // 3. التحقق من الصلاحيات
      if (config.requirePermission) {
        const hasPermission = await checkPermission(
          supabase,
          member,
          config.requirePermission.resource,
          config.requirePermission.action
        )

        if (!hasPermission) {
          return {
            user,
            companyId,
            member,
            error: NextResponse.json(
              { error: 'لا توجد صلاحية', message: 'Insufficient permissions' },
              { status: 403 }
            )
          }
        }
      }

      // 4. التحقق من الأدوار المسموحة
      if (config.allowedRoles && !config.allowedRoles.includes(member.role)) {
        return {
          user,
          companyId,
          member,
          error: NextResponse.json(
            { error: 'دور غير مسموح', message: 'Role not allowed' },
            { status: 403 }
          )
        }
      }

      return {
        user,
        companyId,
        branchId: member.branch_id,
        costCenterId: member.cost_center_id,
        warehouseId: member.warehouse_id,
        member
      }
    }

    return { user, companyId: '', member: null }
  }

  return { user: null, companyId: '', member: null }
}

async function checkPermission(
  supabase: any,
  member: any,
  resource: string,
  action: string
): Promise<boolean> {
  // التحقق من الصلاحيات الأساسية حسب الدور
  const rolePermissions: Record<string, Record<string, string[]>> = {
    owner: { '*': ['read', 'write', 'delete', 'admin'] },
    admin: { '*': ['read', 'write', 'delete'] },
    manager: { 
      invoices: ['read', 'write'],
      customers: ['read', 'write'],
      products: ['read', 'write'],
      reports: ['read']
    },
    accountant: {
      invoices: ['read', 'write'],
      journal_entries: ['read', 'write'],
      products: ['read'], // ✅ Accountants need to read products for bills and inventory
      reports: ['read']
    },
    store_manager: {
      products: ['read', 'write'],
      inventory: ['read', 'write'],
      warehouses: ['read']
    },
    staff: {
      invoices: ['read', 'write'],
      customers: ['read', 'write']
    },
    viewer: { '*': ['read'] }
  }

  const permissions = rolePermissions[member.role]
  if (!permissions) return false

  // التحقق من الصلاحية العامة
  if (permissions['*']?.includes(action)) return true

  // التحقق من صلاحية المورد المحدد
  return permissions[resource]?.includes(action) || false
}

// دوال مساعدة للأخطاء الشائعة
export function unauthorizedError() {
  return NextResponse.json(
    { error: 'غير مصرح', message: 'Unauthorized' },
    { status: 401 }
  )
}

export function forbiddenError(message = 'Access denied') {
  return NextResponse.json(
    { error: 'غير مسموح', message },
    { status: 403 }
  )
}

export function badRequestError(message = 'Bad request') {
  return NextResponse.json(
    { error: 'طلب خاطئ', message },
    { status: 400 }
  )
}

export function notFoundError(message = 'Not found') {
  return NextResponse.json(
    { error: 'غير موجود', message },
    { status: 404 }
  )
}

export function serverError(message = 'Internal server error') {
  return NextResponse.json(
    { error: 'خطأ في الخادم', message },
    { status: 500 }
  )
}
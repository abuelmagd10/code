import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/company'
import { getCompanyMembership } from '@/lib/company-authorization'
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

      // 🔐 Enterprise Authorization: استخدام دالة مساعدة موحدة للتحقق من العضوية
      const authResult = await getCompanyMembership(supabase, user.id, companyId)

      if (!authResult.authorized || !authResult.membership) {
        return {
          user,
          companyId,
          member: null,
          error: NextResponse.json(
            { 
              error: authResult.error || 'غير مسموح', 
              error_en: authResult.errorEn || 'Access denied to company' 
            },
            { status: 403 }
          )
        }
      }

      // تحويل CompanyMembership إلى تنسيق member المتوقع
      const member = {
        id: authResult.membership.id,
        company_id: authResult.membership.companyId,
        user_id: authResult.membership.userId,
        role: authResult.membership.role,
        branch_id: authResult.membership.branchId,
        cost_center_id: authResult.membership.costCenterId,
        warehouse_id: authResult.membership.warehouseId,
        email: authResult.membership.email,
        created_at: authResult.membership.createdAt
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
        branchId: member.branch_id || undefined,
        costCenterId: member.cost_center_id || undefined,
        warehouseId: member.warehouse_id || undefined,
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
      dashboard: ['read'],
      invoices: ['read', 'write'],
      customers: ['read', 'write'],
      products: ['read', 'write'],
      reports: ['read']
    },
    accountant: {
      dashboard: ['read'],
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
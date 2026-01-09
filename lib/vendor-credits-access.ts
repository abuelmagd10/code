/**
 * 🔐 Vendor Credits - Access Control Helper
 * ==========================================
 * يوفر دوال للتحكم في الوصول لإشعارات الدائن حسب الدور والصلاحيات
 * مطابق لنظام Customer Debit Notes
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type UserRole = 'owner' | 'admin' | 'manager' | 'accountant' | 'staff'

export interface AccessFilter {
  canCreate: boolean
  canView: boolean
  canEdit: boolean
  canDelete: boolean
  canApprove: boolean
  canApply: boolean
  branchFilter?: string | null
  costCenterFilter?: string | null
  createdByFilter?: string | null
}

/**
 * 📌 الحصول على فلتر الوصول لإشعارات الدائن
 * 
 * @param supabase - Supabase client
 * @param companyId - معرف الشركة
 * @param userId - معرف المستخدم
 * @returns فلتر الوصول حسب الدور
 */
export async function getVendorCreditAccessFilter(
  supabase: SupabaseClient,
  companyId: string,
  userId: string
): Promise<AccessFilter> {
  // التحقق من كون المستخدم owner
  const { data: company } = await supabase
    .from('companies')
    .select('user_id')
    .eq('id', companyId)
    .single()

  const isOwner = company?.user_id === userId

  if (isOwner) {
    return {
      canCreate: true,
      canView: true,
      canEdit: true,
      canDelete: true,
      canApprove: true,
      canApply: true,
      branchFilter: null,
      costCenterFilter: null,
      createdByFilter: null
    }
  }

  // الحصول على دور المستخدم
  const { data: member } = await supabase
    .from('company_members')
    .select('role, branch_id, cost_center_id')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!member) {
    // ليس عضواً في الشركة
    return {
      canCreate: false,
      canView: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
      canApply: false,
      branchFilter: null,
      costCenterFilter: null,
      createdByFilter: null
    }
  }

  const role = member.role as UserRole

  // تحديد الصلاحيات حسب الدور
  switch (role) {
    case 'admin':
      return {
        canCreate: true,
        canView: true,
        canEdit: true,
        canDelete: true,
        canApprove: true,
        canApply: true,
        branchFilter: null,
        costCenterFilter: null,
        createdByFilter: null
      }

    case 'manager':
      return {
        canCreate: true,
        canView: true,
        canEdit: true,
        canDelete: false,
        canApprove: true,
        canApply: true,
        branchFilter: member.branch_id,
        costCenterFilter: null,
        createdByFilter: null
      }

    case 'accountant':
      return {
        canCreate: true,
        canView: true,
        canEdit: true,
        canDelete: false,
        canApprove: true,
        canApply: true,
        branchFilter: member.branch_id,
        costCenterFilter: member.cost_center_id,
        createdByFilter: null
      }

    case 'staff':
      return {
        canCreate: true,
        canView: true,
        canEdit: true,
        canDelete: false,
        canApprove: false,
        canApply: false,
        branchFilter: member.branch_id,
        costCenterFilter: member.cost_center_id,
        createdByFilter: userId // الموظف يرى فقط ما أنشأه
      }

    default:
      return {
        canCreate: false,
        canView: true,
        canEdit: false,
        canDelete: false,
        canApprove: false,
        canApply: false,
        branchFilter: member.branch_id,
        costCenterFilter: member.cost_center_id,
        createdByFilter: userId
      }
  }
}

/**
 * 📌 تطبيق فلتر الوصول على استعلام Supabase
 * 
 * @param query - استعلام Supabase
 * @param filter - فلتر الوصول
 * @returns الاستعلام مع الفلاتر المطبقة
 */
export function applyVendorCreditAccessFilter(
  query: any,
  filter: AccessFilter
): any {
  if (filter.branchFilter) {
    query = query.eq('branch_id', filter.branchFilter)
  }

  if (filter.costCenterFilter) {
    query = query.eq('cost_center_id', filter.costCenterFilter)
  }

  if (filter.createdByFilter) {
    query = query.eq('created_by', filter.createdByFilter)
  }

  return query
}


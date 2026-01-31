"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { getRoleAccessLevel } from "@/lib/validation"

export interface Branch {
  id: string
  name: string
  code?: string
}

export interface UseBranchFilterReturn {
  // البيانات
  branches: Branch[]
  selectedBranchId: string | null
  userBranchId: string | null
  
  // الحالة
  loading: boolean
  error: string | null
  
  // الصلاحيات
  canFilterByBranch: boolean  // هل يمكن للمستخدم رؤية فلتر الفروع؟
  canSeeAllBranches: boolean  // هل يمكن للمستخدم رؤية جميع الفروع؟
  userRole: string | null
  
  // الإجراءات
  setSelectedBranchId: (branchId: string | null) => void
  resetFilter: () => void
  refresh: () => Promise<void>
  
  // مساعدات
  getBranchName: (branchId: string | null) => string
  getFilteredBranchId: () => string | null  // يرجع الفرع المحدد أو فرع المستخدم
}

/**
 * Hook موحد لإدارة فلترة الفروع حسب صلاحيات المستخدم
 * 
 * 🔐 قواعد الصلاحيات:
 * - Owner / Admin / General Manager: يرون فلتر الفروع ويمكنهم اختيار أي فرع
 * - Manager / Accountant: لا يرون فلتر الفروع، يرون فقط بيانات فرعهم
 * - Staff / Sales / Employee: لا يرون فلتر الفروع، يرون فقط ما أنشأوه
 * 
 * @example
 * const { branches, selectedBranchId, setSelectedBranchId, canFilterByBranch } = useBranchFilter()
 * 
 * // في الـ JSX
 * {canFilterByBranch && (
 *   <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
 *     {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
 *   </Select>
 * )}
 */
export function useBranchFilter(): UseBranchFilterReturn {
  const supabase = useSupabase()
  
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)
  const [userBranchId, setUserBranchId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // الأدوار التي يمكنها رؤية فلتر الفروع
  const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError("لم يتم تسجيل الدخول")
        return
      }

      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        setError("لم يتم تحديد شركة نشطة")
        return
      }

      // جلب بيانات العضوية
      const { data: member } = await supabase
        .from("company_members")
        .select("role, branch_id")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .maybeSingle()

      // التحقق من ملكية الشركة
      const { data: company } = await supabase
        .from("companies")
        .select("user_id")
        .eq("id", companyId)
        .single()

      const isOwner = company?.user_id === user.id
      const role = isOwner ? "owner" : (member?.role || "viewer")
      
      setUserRole(role)
      setUserBranchId(member?.branch_id || null)

      // جلب الفروع
      const { data: branchesData, error: branchesError } = await supabase
        .from("branches")
        .select("id, name, code")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name")

      if (branchesError) {
        setError(branchesError.message)
        return
      }

      setBranches(branchesData || [])
    } catch (e: any) {
      setError(e?.message || "خطأ في جلب البيانات")
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadData()
  }, [loadData])

  // هل يمكن للمستخدم رؤية فلتر الفروع؟
  const canFilterByBranch = useMemo(() => {
    if (!userRole) return false
    return PRIVILEGED_ROLES.includes(userRole.toLowerCase())
  }, [userRole])

  // هل يمكن للمستخدم رؤية جميع الفروع؟
  const canSeeAllBranches = useMemo(() => {
    if (!userRole) return false
    const accessLevel = getRoleAccessLevel(userRole)
    return accessLevel === 'company'
  }, [userRole])

  // الحصول على اسم الفرع
  const getBranchName = useCallback((branchId: string | null): string => {
    if (!branchId) return "الكل"
    const branch = branches.find(b => b.id === branchId)
    return branch?.name || "غير معروف"
  }, [branches])

  // الحصول على الفرع المحدد للفلترة
  const getFilteredBranchId = useCallback((): string | null => {
    // إذا كان المستخدم يمكنه الفلترة واختار فرعاً معيناً
    if (canFilterByBranch && selectedBranchId) {
      return selectedBranchId
    }
    // إذا كان المستخدم لا يمكنه الفلترة، استخدم فرعه
    if (!canFilterByBranch && userBranchId) {
      return userBranchId
    }
    // إذا كان المستخدم يمكنه الفلترة ولم يختر شيئاً، أرجع null (كل الفروع)
    return null
  }, [canFilterByBranch, selectedBranchId, userBranchId])

  const resetFilter = useCallback(() => {
    setSelectedBranchId(null)
  }, [])

  return {
    branches,
    selectedBranchId,
    userBranchId,
    loading,
    error,
    canFilterByBranch,
    canSeeAllBranches,
    userRole,
    setSelectedBranchId,
    resetFilter,
    refresh: loadData,
    getBranchName,
    getFilteredBranchId,
  }
}


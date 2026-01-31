"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Building2, GitBranch, ChevronDown, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { type DashboardScope } from "@/lib/dashboard-visibility"

interface Branch {
  id: string
  name: string
  default_cost_center_id?: string | null
}

interface DashboardScopeSwitcherProps {
  /** هل يمكن للمستخدم التبديل */
  canSwitch: boolean
  /** النطاق الحالي */
  currentScope: DashboardScope
  /** معرف الفرع المحدد */
  currentBranchId?: string | null
  /** اسم الفرع المحدد */
  currentBranchName?: string | null
  /** اللغة */
  lang?: 'ar' | 'en'
  /** عند تغيير النطاق */
  onScopeChange?: (scope: DashboardScope, branchId?: string | null) => void
}

export default function DashboardScopeSwitcher({
  canSwitch,
  currentScope,
  currentBranchId,
  currentBranchName,
  lang = 'ar',
  onScopeChange
}: DashboardScopeSwitcherProps) {
  const supabase = useSupabase()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(false)

  // جلب الفروع
  useEffect(() => {
    if (!canSwitch) return
    
    const loadBranches = async () => {
      setLoading(true)
      try {
        const companyId = await getActiveCompanyId(supabase)
        if (!companyId) return
        
        const { data } = await supabase
          .from('branches')
          .select('id, name, default_cost_center_id')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('name')
        
        setBranches(data || [])
      } catch (error) {
        console.error('Error loading branches:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadBranches()
  }, [supabase, canSwitch])

  // إذا لم يكن مسموحاً بالتبديل، لا نعرض شيئاً
  if (!canSwitch) {
    return (
      <Badge variant="outline" className="gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
        <GitBranch className="w-4 h-4" />
        {currentBranchName || (lang === 'en' ? 'My Branch' : 'فرعي')}
      </Badge>
    )
  }

  const handleScopeChange = (scope: DashboardScope, branchId?: string | null) => {
    // تحديث URL params
    const params = new URLSearchParams(searchParams.toString())
    params.set('scope', scope)
    if (scope === 'branch' && branchId) {
      params.set('branch', branchId)
    } else {
      params.delete('branch')
    }
    
    router.push(`/dashboard?${params.toString()}`)
    onScopeChange?.(scope, branchId)
  }

  const labels = {
    ar: {
      companyView: 'عرض الشركة',
      branchView: 'عرض الفرع',
      selectBranch: 'اختر الفرع',
      allBranches: 'جميع الفروع',
      loading: 'جاري التحميل...',
    },
    en: {
      companyView: 'Company View',
      branchView: 'Branch View',
      selectBranch: 'Select Branch',
      allBranches: 'All Branches',
      loading: 'Loading...',
    }
  }

  const t = labels[lang]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 min-w-[180px] justify-between">
          <div className="flex items-center gap-2">
            {currentScope === 'company' ? (
              <>
                <Building2 className="w-4 h-4 text-indigo-600" />
                <span>{t.companyView}</span>
              </>
            ) : (
              <>
                <GitBranch className="w-4 h-4 text-blue-600" />
                <span>{currentBranchName || t.branchView}</span>
              </>
            )}
          </div>
          <ChevronDown className="w-4 h-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px]">
        <DropdownMenuLabel>
          {lang === 'en' ? 'Dashboard View' : 'نطاق العرض'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {/* Company View */}
        <DropdownMenuItem
          onClick={() => handleScopeChange('company')}
          className="gap-2 cursor-pointer"
        >
          <Building2 className="w-4 h-4 text-indigo-600" />
          <span className="flex-1">{t.companyView}</span>
          {currentScope === 'company' && <Check className="w-4 h-4 text-green-600" />}
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-gray-500">
          {t.selectBranch}
        </DropdownMenuLabel>
        
        {/* Branch Options */}
        {loading ? (
          <DropdownMenuItem disabled>{t.loading}</DropdownMenuItem>
        ) : branches.length === 0 ? (
          <DropdownMenuItem disabled>
            {lang === 'en' ? 'No branches found' : 'لا توجد فروع'}
          </DropdownMenuItem>
        ) : (
          branches.map((branch) => (
            <DropdownMenuItem
              key={branch.id}
              onClick={() => handleScopeChange('branch', branch.id)}
              className="gap-2 cursor-pointer"
            >
              <GitBranch className="w-4 h-4 text-blue-600" />
              <span className="flex-1">{branch.name}</span>
              {currentScope === 'branch' && currentBranchId === branch.id && (
                <Check className="w-4 h-4 text-green-600" />
              )}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}


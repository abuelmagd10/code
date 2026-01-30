// ملف: components/branch-cost-center-selector-enhanced.tsx
// مكون محسن لضمان عرض القيم الافتراضية بشكل صحيح

"use client"

import { useState, useEffect } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Building2, Target, Warehouse } from "lucide-react"

interface Branch {
  id: string
  name: string
  code: string
  is_main: boolean
  default_cost_center_id?: string | null
  default_warehouse_id?: string | null
}

interface CostCenter {
  id: string
  cost_center_name: string
  cost_center_code: string
  branch_id: string
}

interface WarehouseData {
  id: string
  name: string
  code: string
  branch_id: string | null
  cost_center_id: string | null
  is_main: boolean
}

interface BranchCostCenterSelectorProps {
  branchId: string | null
  costCenterId: string | null
  warehouseId?: string | null
  onBranchChange: (branchId: string | null) => void
  onCostCenterChange: (costCenterId: string | null) => void
  onWarehouseChange?: (warehouseId: string | null) => void
  disabled?: boolean
  required?: boolean
  lang?: 'ar' | 'en'
  showLabels?: boolean
  showWarehouse?: boolean
  className?: string
}

export function BranchCostCenterSelectorEnhanced({
  branchId,
  costCenterId,
  warehouseId,
  onBranchChange,
  onCostCenterChange,
  onWarehouseChange,
  disabled = false,
  required = false,
  lang = 'ar',
  showLabels = true,
  showWarehouse = false,
  className = ""
}: BranchCostCenterSelectorProps) {
  const supabase = useSupabase()
  const [loading, setLoading] = useState(true)
  const [branches, setBranches] = useState<Branch[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([])
  const [filteredCostCenters, setFilteredCostCenters] = useState<CostCenter[]>([])
  const [filteredWarehouses, setFilteredWarehouses] = useState<WarehouseData[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [defaultsApplied, setDefaultsApplied] = useState(false)

  // ترجمة بسيطة
  const t = (en: string, ar: string) => lang === 'en' ? en : ar

  // تحميل البيانات الأولية
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const activeCompanyId = await getActiveCompanyId(supabase)
        if (!activeCompanyId) return

        setCompanyId(activeCompanyId)

        // جلب الفروع
        const { data: branchesData, error: branchesError } = await supabase
          .from('branches')
          .select('*')
          .eq('company_id', activeCompanyId)
          .eq('is_active', true)
          .order('is_main', { ascending: false })
          .order('name', { ascending: true })

        if (branchesError) throw branchesError
        setBranches(branchesData || [])

        // جلب مراكز التكلفة
        const { data: costCentersData, error: costCentersError } = await supabase
          .from('cost_centers')
          .select('*')
          .eq('company_id', activeCompanyId)
          .eq('is_active', true)
          .order('cost_center_name', { ascending: true })

        if (costCentersError) throw costCentersError
        setCostCenters(costCentersData || [])

        // جلب المخازن إذا كان مطلوباً
        if (showWarehouse && onWarehouseChange) {
          const { data: warehousesData, error: warehousesError } = await supabase
            .from('warehouses')
            .select('*')
            .eq('company_id', activeCompanyId)
            .eq('is_active', true)
            .order('is_main', { ascending: false })
            .order('name', { ascending: true })

          if (warehousesError) throw warehousesError
          setWarehouses(warehousesData || [])
        }

      } catch (error) {
        console.error('Error loading data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [supabase, showWarehouse, onWarehouseChange])

  // منطق مُحسَّن لتصفية مراكز التكلفة وتعيين القيم الافتراضية
  useEffect(() => {
    if (loading) return

    if (branchId) {
      const filtered = costCenters.filter(cc => cc.branch_id === branchId)
      setFilteredCostCenters(filtered)

      const branch = branches.find((b) => b.id === branchId)
      const defaultCostCenterId = branch?.default_cost_center_id || null
      const defaultExists = defaultCostCenterId ? filtered.some((cc) => cc.id === defaultCostCenterId) : false

      console.log('Cost Center Logic:', {
        branchId,
        filteredCount: filtered.length,
        defaultCostCenterId,
        defaultExists,
        currentCostCenterId: costCenterId,
        required
      })

      if (required) {
        if (!costCenterId) {
          // لا توجد قيمة حالية - استخدم الافتراضي
          if (defaultCostCenterId && defaultExists) {
            console.log('Setting default cost center:', defaultCostCenterId)
            onCostCenterChange(defaultCostCenterId)
          } else if (filtered.length > 0) {
            console.log('Setting first cost center:', filtered[0].id)
            onCostCenterChange(filtered[0].id)
          }
        } else if (!filtered.find(cc => cc.id === costCenterId)) {
          // القيمة الحالية غير صالحة - استخدم الافتراضي
          if (defaultCostCenterId && defaultExists) {
            console.log('Resetting to default cost center:', defaultCostCenterId)
            onCostCenterChange(defaultCostCenterId)
          } else if (filtered.length > 0) {
            console.log('Resetting to first cost center:', filtered[0].id)
            onCostCenterChange(filtered[0].id)
          } else {
            console.log('No valid cost centers available')
            onCostCenterChange(null)
          }
        } else {
          console.log('Current cost center is valid, keeping it:', costCenterId)
        }
      } else {
        // غير مطلوب - فقط تحقق من صلاحية القيمة الحالية
        if (costCenterId && !filtered.find(cc => cc.id === costCenterId)) {
          console.log('Clearing invalid cost center')
          onCostCenterChange(null)
        }
      }
    } else {
      // لا يوجد فرع محدد
      setFilteredCostCenters([])
      onCostCenterChange(null)
    }
  }, [branchId, costCenters, branches, required, loading])

  // منطق مُحسَّن لتصفية المخازن وتعيين القيم الافتراضية
  useEffect(() => {
    if (loading) return
    if (!showWarehouse || !onWarehouseChange) return

    if (branchId) {
      let filtered = warehouses.filter(w => w.branch_id === branchId)
      setFilteredWarehouses(filtered)

      const branch = branches.find((b) => b.id === branchId)
      const defaultWarehouseId = branch?.default_warehouse_id || null
      const defaultExists = defaultWarehouseId ? filtered.some((w) => w.id === defaultWarehouseId) : false

      console.log('Warehouse Logic:', {
        branchId,
        filteredCount: filtered.length,
        defaultWarehouseId,
        defaultExists,
        currentWarehouseId: warehouseId,
        required
      })

      if (required) {
        if (!warehouseId) {
          // لا توجد قيمة حالية - استخدم الافتراضي
          if (defaultWarehouseId && defaultExists) {
            console.log('Setting default warehouse:', defaultWarehouseId)
            onWarehouseChange(defaultWarehouseId)
          } else if (filtered.length > 0) {
            const mainWarehouse = filtered.find(w => w.is_main) || filtered[0]
            console.log('Setting main/first warehouse:', mainWarehouse.id)
            onWarehouseChange(mainWarehouse.id)
          }
        } else if (!filtered.find(w => w.id === warehouseId)) {
          // القيمة الحالية غير صالحة - استخدم الافتراضي
          if (defaultWarehouseId && defaultExists) {
            console.log('Resetting to default warehouse:', defaultWarehouseId)
            onWarehouseChange(defaultWarehouseId)
          } else if (filtered.length > 0) {
            const mainWarehouse = filtered.find(w => w.is_main) || filtered[0]
            console.log('Resetting to main/first warehouse:', mainWarehouse.id)
            onWarehouseChange(mainWarehouse.id)
          } else {
            console.log('No valid warehouses available')
            onWarehouseChange(null)
          }
        } else {
          console.log('Current warehouse is valid, keeping it:', warehouseId)
        }
      } else {
        // غير مطلوب - فقط تحقق من صلاحية القيمة الحالية
        if (warehouseId && !filtered.find(w => w.id === warehouseId)) {
          console.log('Clearing invalid warehouse')
          onWarehouseChange(null)
        }
      }
    } else {
      // لا يوجد فرع محدد
      setFilteredWarehouses([])
      onWarehouseChange(null)
    }
  }, [branchId, warehouses, branches, required, loading, showWarehouse, onWarehouseChange])

  // تأخير لتطبيق الافتراضيات بعد التحميل الكامل
  useEffect(() => {
    if (!loading && !defaultsApplied && branchId) {
      const timer = setTimeout(() => {
        console.log('Applying defaults after delay...')
        setDefaultsApplied(true)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [loading, branchId, defaultsApplied])

  if (loading) {
    return (
      <div className={`grid grid-cols-1 ${showWarehouse ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-4 ${className}`}>
        <div className="space-y-2">
          {showLabels && <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>}
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
        </div>
        <div className="space-y-2">
          {showLabels && <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>}
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
        </div>
        {showWarehouse && (
          <div className="space-y-2">
            {showLabels && <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>}
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          </div>
        )}
      </div>
    )
  }

  const gridCols = showWarehouse ? 'sm:grid-cols-3' : 'sm:grid-cols-2'

  return (
    <div className={`grid grid-cols-1 ${gridCols} gap-4 ${className}`}>
      {/* Branch Selector */}
      <div className="space-y-2">
        {showLabels && (
          <Label className="flex items-center gap-2 text-sm font-medium">
            <Building2 className="w-4 h-4 text-indigo-500" />
            {t("Branch", "الفرع")}
            {required && <span className="text-red-500">*</span>}
          </Label>
        )}
        <Select
          value={branchId || ""}
          onValueChange={(v) => onBranchChange(v || null)}
          disabled={disabled || branches.length === 0}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("Select branch", "اختر الفرع")} />
          </SelectTrigger>
          <SelectContent>
            {branches.map((branch) => (
              <SelectItem key={branch.id} value={branch.id}>
                <span className="flex items-center gap-2">
                  {branch.is_main && <span className="text-amber-500">★</span>}
                  {branch.name} ({branch.code})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Cost Center Selector */}
      <div className="space-y-2">
        {showLabels && (
          <Label className="flex items-center gap-2 text-sm font-medium">
            <Target className="w-4 h-4 text-teal-500" />
            {t("Cost Center", "مركز التكلفة")}
            {required && <span className="text-red-500">*</span>}
          </Label>
        )}
        <Select
          value={required ? (costCenterId || "") : (costCenterId || "none")}
          onValueChange={(v) => onCostCenterChange(required ? (v || null) : (v === "none" ? null : v))}
          disabled={disabled || !branchId || filteredCostCenters.length === 0}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={filteredCostCenters.length === 0
              ? t("No cost centers", "لا توجد مراكز تكلفة")
              : t("Select cost center", "اختر مركز التكلفة")}
            />
          </SelectTrigger>
          <SelectContent>
            {!required && <SelectItem value="none">{t("None", "بدون")}</SelectItem>}
            {filteredCostCenters.map((cc) => (
              <SelectItem key={cc.id} value={cc.id}>
                {cc.cost_center_name} ({cc.cost_center_code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Warehouse Selector */}
      {showWarehouse && onWarehouseChange && (
        <div className="space-y-2">
          {showLabels && (
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Warehouse className="w-4 h-4 text-blue-500" />
              {t("Warehouse", "المخزن")}
              {required && <span className="text-red-500">*</span>}
            </Label>
          )}
          <Select
            value={warehouseId || ""}
            onValueChange={(v) => onWarehouseChange(v || null)}
            disabled={disabled || filteredWarehouses.length === 0}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={filteredWarehouses.length === 0
                ? t("No warehouses", "لا توجد مخازن")
                : t("Select warehouse", "اختر المخزن")}
              />
            </SelectTrigger>
            <SelectContent>
              {filteredWarehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  <span className="flex items-center gap-2">
                    {w.is_main && <span className="text-amber-500">★</span>}
                    {w.name} ({w.code})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
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

export function BranchCostCenterSelector({
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
  const [branches, setBranches] = useState<Branch[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([])
  const [filteredCostCenters, setFilteredCostCenters] = useState<CostCenter[]>([])
  const [filteredWarehouses, setFilteredWarehouses] = useState<WarehouseData[]>([])
  const [loading, setLoading] = useState(true)

  const t = (en: string, ar: string) => lang === 'en' ? en : ar

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const activeCompanyId = await getActiveCompanyId(supabase)
        if (!activeCompanyId) {
          setLoading(false)
          return
        }

        // جلب الفروع
        const { data: branchesData, error: branchesError } = await supabase
          .from('branches')
          .select('*')
          .eq('company_id', activeCompanyId)
          .eq('is_active', true)
          .order('is_main', { ascending: false })
          .order('name', { ascending: true })

        if (branchesError) throw branchesError
        const mappedBranches = (branchesData || []).map((b: any) => ({
          id: b.id,
          name: b.name || b.branch_name || '',
          code: b.code || b.branch_code || '',
          is_main: b.is_main || b.is_head_office || false,
          default_cost_center_id: b.default_cost_center_id ?? null,
          default_warehouse_id: b.default_warehouse_id ?? null
        }))
        setBranches(mappedBranches)

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
        if (showWarehouse) {
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

        // Auto-select main branch if no branch selected - بعد التحميل الكامل مع تأخير إضافي
        if (!disabled && !branchId && mappedBranches.length > 0) {
          const mainBranch = mappedBranches.find((b: Branch) => b.is_main) || mappedBranches[0]
          console.log('Auto-selecting main branch with delay:', mainBranch.id)
          setTimeout(() => {
            console.log('Executing branch auto-selection:', mainBranch.id)
            onBranchChange(mainBranch.id)
          }, 500) // تأخير إضافي لضمان تحميل كل البيانات
        }

      } catch (error) {
        console.error('Error loading data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [supabase, showWarehouse, disabled, branchId, onBranchChange])

  // Filter cost centers when branch changes - Enhanced with detailed logging and better timing
  useEffect(() => {
    if (loading) return
    console.log('=== COST CENTER FILTER DEBUG ===')
    console.log('Branch ID:', branchId)
    console.log('All cost centers count:', costCenters.length)
    console.log('Current cost center ID:', costCenterId)
    console.log('Required:', required)
    
    if (branchId) {
      const filtered = costCenters.filter(cc => {
        const matches = cc.branch_id === branchId
        console.log(`Cost center ${cc.id}: ${cc.cost_center_name} (${cc.cost_center_code}) - Branch: ${cc.branch_id} - Matches: ${matches}`)
        return matches
      })
      
      console.log('Filtered cost centers count:', filtered.length)
      console.log('Filtered cost centers:', filtered.map(cc => ({id: cc.id, name: cc.cost_center_name, code: cc.cost_center_code})))
      
      setFilteredCostCenters(filtered)
      const branch = branches.find((b) => b.id === branchId)
      const defaultCostCenterId = branch?.default_cost_center_id || null
      const defaultExists = defaultCostCenterId ? filtered.some((cc) => cc.id === defaultCostCenterId) : false
      
      console.log('Branch details:', {
        id: branch?.id,
        name: branch?.name,
        default_cost_center_id: branch?.default_cost_center_id,
        default_cost_center_exists: defaultExists
      })

      // Enhanced logic with better timing for cost center assignment
      const assignCostCenter = () => {
        if (required) {
          console.log('Processing required cost center...')
          if (!costCenterId) {
            console.log('No current cost center value - applying default logic')
            if (defaultCostCenterId && defaultExists) {
              console.log('✅ Applying default cost center:', defaultCostCenterId)
              onCostCenterChange(defaultCostCenterId)
            } else if (filtered.length > 0) {
              console.log('⚠️ No default found, applying first cost center:', filtered[0].id)
              onCostCenterChange(filtered[0].id)
            } else {
              console.log('❌ No cost centers available for this branch')
            }
          } else if (!filtered.find(cc => cc.id === costCenterId)) {
            console.log('Current cost center invalid, resetting to default...')
            if (defaultCostCenterId && defaultExists) {
              console.log('✅ Resetting to default cost center:', defaultCostCenterId)
              onCostCenterChange(defaultCostCenterId)
            } else if (filtered.length > 0) {
              console.log('⚠️ Resetting to first cost center:', filtered[0].id)
              onCostCenterChange(filtered[0].id)
            } else {
              console.log('❌ No valid cost centers available, clearing selection')
              onCostCenterChange(null)
            }
          } else {
            console.log('✅ Current cost center is valid, keeping:', costCenterId)
          }
        } else {
          console.log('Processing optional cost center...')
          if (costCenterId && !filtered.find(cc => cc.id === costCenterId)) {
            console.log('Clearing invalid cost center selection')
            onCostCenterChange(null)
          } else {
            console.log('Cost center selection is valid or empty')
          }
        }
      }

      // Apply assignment with proper timing
      if (filtered.length > 0) {
        console.log('Scheduling cost center assignment...')
        setTimeout(() => {
          console.log('Executing cost center assignment...')
          assignCostCenter()
        }, 300) // Increased delay to ensure UI is fully ready
      } else {
        console.log('No cost centers to assign')
      }
    } else {
      console.log('No branch selected, clearing cost centers')
      setFilteredCostCenters([])
      onCostCenterChange(null)
    }
    console.log('=== END COST CENTER FILTER DEBUG ===')
  }, [branchId, costCenters, branches, required, costCenterId, onCostCenterChange])

  // Filter warehouses when branch/cost center changes
  useEffect(() => {
    if (loading) return
    if (showWarehouse && onWarehouseChange) {
      let filtered = warehouses
      if (branchId) {
        filtered = filtered.filter(w => w.branch_id === branchId)
      }
      setFilteredWarehouses(filtered)

      const branch = branchId ? branches.find((b) => b.id === branchId) : undefined
      const defaultWarehouseId = branch?.default_warehouse_id || null
      const defaultExists = defaultWarehouseId ? filtered.some((w) => w.id === defaultWarehouseId) : false

      if (required) {
        if (!warehouseId) {
          // No current value - apply default with delay to ensure UI updates
          if (defaultWarehouseId && defaultExists) {
            console.log('Applying default warehouse:', defaultWarehouseId)
            setTimeout(() => onWarehouseChange(defaultWarehouseId), 100)
          } else if (filtered.length > 0) {
            const mainWarehouse = filtered.find(w => w.is_main) || filtered[0]
            console.log('Applying main/first warehouse:', mainWarehouse.id)
            setTimeout(() => onWarehouseChange(mainWarehouse.id), 100)
          }
        } else if (!filtered.find(w => w.id === warehouseId)) {
          // Current value invalid - reset to default
          if (defaultWarehouseId && defaultExists) {
            console.log('Resetting to default warehouse:', defaultWarehouseId)
            setTimeout(() => onWarehouseChange(defaultWarehouseId), 100)
          } else if (filtered.length > 0) {
            const mainWarehouse = filtered.find(w => w.is_main) || filtered[0]
            console.log('Resetting to main/first warehouse:', mainWarehouse.id)
            setTimeout(() => onWarehouseChange(mainWarehouse.id), 100)
          } else {
            console.log('No valid warehouses available')
            onWarehouseChange(null)
          }
        } else {
          console.log('Current warehouse is valid, keeping:', warehouseId)
        }
      } else {
        if (!warehouseId && filtered.length > 0) {
          const mainWarehouse = filtered.find(w => w.is_main) || filtered[0]
          console.log('Applying main/first warehouse (optional):', mainWarehouse.id)
          setTimeout(() => onWarehouseChange(mainWarehouse.id), 100)
        } else if (warehouseId && !filtered.find(w => w.id === warehouseId)) {
          const mainWarehouse = filtered.find(w => w.is_main) || filtered[0]
          console.log('Resetting to main/first warehouse (optional):', mainWarehouse.id)
          setTimeout(() => onWarehouseChange(mainWarehouse?.id || null), 100)
        }
      }
    }
  }, [branchId, warehouses, showWarehouse, branches, required, warehouseId, onWarehouseChange])

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
            {filteredCostCenters.map((cc) => {
              const isDefault = branchId && branches.find(b => b.id === branchId)?.default_cost_center_id === cc.id
              return (
                <SelectItem key={cc.id} value={cc.id}>
                  <span className="flex items-center gap-2">
                    {cc.cost_center_name} ({cc.cost_center_code})
                    {isDefault && <span className="text-green-500 text-xs">(افتراضي)</span>}
                  </span>
                </SelectItem>
              )
            })}
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
              {filteredWarehouses.map((wh) => {
                const isDefault = branchId && branches.find(b => b.id === branchId)?.default_warehouse_id === wh.id
                return (
                  <SelectItem key={wh.id} value={wh.id}>
                    <span className="flex items-center gap-2">
                      {wh.is_main && <span className="text-amber-500">★</span>}
                      {wh.name} {wh.code ? `(${wh.code})` : ''}
                      {isDefault && <span className="text-green-500 text-xs">(افتراضي)</span>}
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
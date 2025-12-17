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
}

interface CostCenter {
  id: string
  name: string
  code: string
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

  useEffect(() => {
    const loadData = async () => {
      try {
        const companyId = await getActiveCompanyId(supabase)
        if (!companyId) return

        // Load branches
        const { data: branchData } = await supabase
          .from("branches")
          .select("id, name, code, is_main, is_head_office")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("is_main", { ascending: false })
          .order("name")

        const mappedBranches = (branchData || []).map(b => ({
          id: b.id,
          name: b.name || (b as any).branch_name || '',
          code: b.code || (b as any).branch_code || '',
          is_main: b.is_main || (b as any).is_head_office || false
        }))
        setBranches(mappedBranches)

        // Auto-select main branch if no branch selected
        if (!branchId && mappedBranches.length > 0) {
          const mainBranch = mappedBranches.find(b => b.is_main) || mappedBranches[0]
          onBranchChange(mainBranch.id)
        }

        // Load cost centers
        const { data: ccData } = await supabase
          .from("cost_centers")
          .select("id, name, code, branch_id")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("name")

        setCostCenters(ccData || [])

        // Load warehouses if needed
        if (showWarehouse) {
          const { data: whData } = await supabase
            .from("warehouses")
            .select("id, name, code, branch_id, cost_center_id, is_main")
            .eq("company_id", companyId)
            .eq("is_active", true)
            .order("is_main", { ascending: false })
            .order("name")

          setWarehouses(whData || [])
        }
      } catch (err) {
        console.error("Error loading branches/cost centers/warehouses:", err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [supabase, showWarehouse])

  // Filter cost centers when branch changes
  useEffect(() => {
    if (branchId) {
      const filtered = costCenters.filter(cc => cc.branch_id === branchId)
      setFilteredCostCenters(filtered)
      // Reset cost center if not in filtered list
      if (costCenterId && !filtered.find(cc => cc.id === costCenterId)) {
        onCostCenterChange(null)
      }
    } else {
      setFilteredCostCenters([])
      onCostCenterChange(null)
    }
  }, [branchId, costCenters])

  // Filter warehouses when branch/cost center changes
  useEffect(() => {
    if (showWarehouse && onWarehouseChange) {
      let filtered = warehouses
      if (branchId) {
        filtered = filtered.filter(w => !w.branch_id || w.branch_id === branchId)
      }
      setFilteredWarehouses(filtered)

      // Auto-select main warehouse if none selected
      if (!warehouseId && filtered.length > 0) {
        const mainWarehouse = filtered.find(w => w.is_main) || filtered[0]
        onWarehouseChange(mainWarehouse.id)
      } else if (warehouseId && !filtered.find(w => w.id === warehouseId)) {
        // Reset warehouse if not in filtered list
        const mainWarehouse = filtered.find(w => w.is_main) || filtered[0]
        onWarehouseChange(mainWarehouse?.id || null)
      }
    }
  }, [branchId, warehouses, showWarehouse])

  if (loading) {
    return (
      <div className={`grid grid-cols-2 gap-4 ${className}`}>
        <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse"></div>
        <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse"></div>
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
          </Label>
        )}
        <Select
          value={costCenterId || ""}
          onValueChange={(v) => onCostCenterChange(v || null)}
          disabled={disabled || !branchId || filteredCostCenters.length === 0}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={filteredCostCenters.length === 0
              ? t("No cost centers", "لا توجد مراكز تكلفة")
              : t("Select cost center", "اختر مركز التكلفة")}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("None", "بدون")}</SelectItem>
            {filteredCostCenters.map((cc) => (
              <SelectItem key={cc.id} value={cc.id}>
                {cc.name} ({cc.code})
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
              {filteredWarehouses.map((wh) => (
                <SelectItem key={wh.id} value={wh.id}>
                  <span className="flex items-center gap-2">
                    {wh.is_main && <span className="text-amber-500">★</span>}
                    {wh.name} {wh.code ? `(${wh.code})` : ''}
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

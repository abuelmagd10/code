/**
 * Branch Defaults Manager Component
 * 
 * This component allows admins to configure default warehouse and cost center
 * for each branch, implementing the enterprise pattern:
 * User → Branch → (Default Warehouse, Default Cost Center)
 */

"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { getActiveCompanyId } from "@/lib/company"
import { Warehouse, Target, AlertTriangle, Save, RefreshCw } from "lucide-react"

interface BranchDefaultsManagerProps {
  branchId: string
  branchName: string
  lang?: 'ar' | 'en'
  onDefaultsUpdated?: () => void
}

interface WarehouseOption {
  id: string
  name: string
  code: string
}

interface CostCenterOption {
  id: string
  name: string
  code: string
}

export function BranchDefaultsManager({ 
  branchId, 
  branchName, 
  lang = 'ar',
  onDefaultsUpdated 
}: BranchDefaultsManagerProps) {
  const supabase = createClient()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  
  // Current defaults
  const [currentDefaults, setCurrentDefaults] = useState({
    default_warehouse_id: '',
    default_cost_center_id: ''
  })
  
  // Form state
  const [selectedWarehouse, setSelectedWarehouse] = useState('')
  const [selectedCostCenter, setSelectedCostCenter] = useState('')
  
  // Available options
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([])
  
  const t = (en: string, ar: string) => lang === 'en' ? en : ar

  // Load current defaults and available options
  useEffect(() => {
    loadDefaultsAndOptions()
  }, [branchId])

  const loadDefaultsAndOptions = async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // Load current branch defaults
      const { data: branchData, error: branchError } = await supabase
        .from('branches')
        .select('default_warehouse_id, default_cost_center_id')
        .eq('id', branchId)
        .single()

      if (branchError) throw branchError

      if (branchData) {
        setCurrentDefaults({
          default_warehouse_id: branchData.default_warehouse_id || '',
          default_cost_center_id: branchData.default_cost_center_id || ''
        })
        setSelectedWarehouse(branchData.default_warehouse_id || '')
        setSelectedCostCenter(branchData.default_cost_center_id || '')
      }

      // Load available warehouses for this branch
      const { data: warehouseData, error: warehouseError } = await supabase
        .from('warehouses')
        .select('id, name, code')
        .eq('company_id', companyId)
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .order('name')

      if (warehouseError) throw warehouseError
      setWarehouses(warehouseData || [])

      // Load available cost centers for this branch
      const { data: costCenterData, error: costCenterError } = await supabase
        .from('cost_centers')
        .select('id, name, code')
        .eq('company_id', companyId)
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .order('name')

      if (costCenterError) throw costCenterError
      setCostCenters(costCenterData || [])

    } catch (error) {
      console.error('Failed to load branch defaults:', error)
      toastActionError(toast, t("Failed to load defaults", "فشل تحميل الإعدادات الافتراضية"), error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveDefaults = async () => {
    try {
      setIsSaving(true)

      // Validate required fields
      if (!selectedWarehouse || !selectedCostCenter) {
        throw new Error(t("Please select both warehouse and cost center", "يرجى اختيار المخزن ومركز التكلفة"))
      }

      const { error } = await supabase
        .from('branches')
        .update({
          default_warehouse_id: selectedWarehouse,
          default_cost_center_id: selectedCostCenter,
          updated_at: new Date().toISOString()
        })
        .eq('id', branchId)

      if (error) throw error

      // Update current defaults
      setCurrentDefaults({
        default_warehouse_id: selectedWarehouse,
        default_cost_center_id: selectedCostCenter
      })

      toastActionSuccess(toast, t("Defaults updated successfully", "تم تحديث الإعدادات الافتراضية بنجاح"))
      
      if (onDefaultsUpdated) {
        onDefaultsUpdated()
      }

    } catch (error) {
      console.error('Failed to save branch defaults:', error)
      toastActionError(toast, t("Failed to save defaults", "فشل حفظ الإعدادات الافتراضية"), error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const hasChanges = 
    selectedWarehouse !== currentDefaults.default_warehouse_id ||
    selectedCostCenter !== currentDefaults.default_cost_center_id

  const isComplete = selectedWarehouse && selectedCostCenter

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          {t("Branch Defaults", "إعدادات الفرع الافتراضية")}
          <Badge variant="outline" className="ml-2">
            {branchName}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Warning if defaults are missing */}
            {!currentDefaults.default_warehouse_id || !currentDefaults.default_cost_center_id ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t(
                    "Branch is missing required defaults. This will break sales order creation.",
                    "الفرع يفتقد إلى الإعدادات الافتراضية المطلوبة. سيؤدي هذا إلى كسر إنشاء أوامر البيع."
                  )}
                </AlertDescription>
              </Alert>
            ) : null}

            {/* Default Warehouse Selection */}
            <div className="space-y-2">
              <Label htmlFor="default-warehouse" className="flex items-center gap-2">
                <Warehouse className="h-4 w-4" />
                {t("Default Warehouse", "المخزن الافتراضي")}
                <span className="text-red-500">*</span>
              </Label>
              <Select 
                value={selectedWarehouse} 
                onValueChange={setSelectedWarehouse}
                disabled={isLoading || warehouses.length === 0}
              >
                <SelectTrigger id="default-warehouse">
                  <SelectValue 
                    placeholder={t("Select default warehouse...", "اختر المخزن الافتراضي...")} 
                  />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name} ({warehouse.code})
                    </SelectItem>
                  ))}
                  {warehouses.length === 0 && (
                    <div className="p-4 text-center text-sm text-gray-500">
                      {t("No active warehouses found for this branch", "لا توجد مخازن نشطة لهذا الفرع")}
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Default Cost Center Selection */}
            <div className="space-y-2">
              <Label htmlFor="default-cost-center" className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                {t("Default Cost Center", "مركز التكلفة الافتراضي")}
                <span className="text-red-500">*</span>
              </Label>
              <Select 
                value={selectedCostCenter} 
                onValueChange={setSelectedCostCenter}
                disabled={isLoading || costCenters.length === 0}
              >
                <SelectTrigger id="default-cost-center">
                  <SelectValue 
                    placeholder={t("Select default cost center...", "اختر مركز التكلفة الافتراضي...")} 
                  />
                </SelectTrigger>
                <SelectContent>
                  {costCenters.map((costCenter) => (
                    <SelectItem key={costCenter.id} value={costCenter.id}>
                      {costCenter.name} ({costCenter.code})
                    </SelectItem>
                  ))}
                  {costCenters.length === 0 && (
                    <div className="p-4 text-center text-sm text-gray-500">
                      {t("No active cost centers found for this branch", "لا توجد مراكز تكلفة نشطة لهذا الفرع")}
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-4">
              <Button 
                onClick={handleSaveDefaults}
                disabled={isSaving || !hasChanges || !isComplete}
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                {t("Save Defaults", "حفظ الإعدادات الافتراضية")}
                {isSaving && <RefreshCw className="h-4 w-4 animate-spin" />}
              </Button>
            </div>

            {/* Current Status */}
            {currentDefaults.default_warehouse_id && currentDefaults.default_cost_center_id && (
              <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-700 dark:text-green-300">
                  {t(
                    "Current defaults: Warehouse and Cost Center are properly configured.",
                    "الإعدادات الحالية: تم تكوين المخزن ومركز التكلفة بشكل صحيح."
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
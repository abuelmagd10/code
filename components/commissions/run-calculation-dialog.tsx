"use client"

/**
 * Commission Run Calculation Dialog
 * 
 * Initiates commission calculation for a period
 * 
 * Features:
 * - Period selection (date range)
 * - Plan selection (multi-select from active plans)
 * - Validation (no overlaps, no future periods)
 * - Calls backend RPC via API
 * - Loading state during calculation
 * 
 * CRITICAL: No preview, no dry-run
 * Calculation creates a draft run immediately
 */

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, Calculator } from "lucide-react"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"

interface CommissionPlan {
    id: string
    name: string
    type: string
    is_active: boolean
}

interface RunCalculationDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onCalculationComplete: (runId: string) => void
    lang?: 'ar' | 'en'
}

export function RunCalculationDialog({
    open,
    onOpenChange,
    onCalculationComplete,
    lang = 'ar'
}: RunCalculationDialogProps) {
    const supabase = useSupabase()
    const { toast } = useToast()

    // State
    const [periodStart, setPeriodStart] = useState<string>("")
    const [periodEnd, setPeriodEnd] = useState<string>("")
    const [plans, setPlans] = useState<CommissionPlan[]>([])
    const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set())
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingPlans, setIsLoadingPlans] = useState(false)
    const [canWrite, setCanWrite] = useState(false)

    // Validation errors
    const [errors, setErrors] = useState<Record<string, string>>({})

    /**
     * Load permissions
     */
    useEffect(() => {
        const loadPermissions = async () => {
            const write = await canAction(supabase, 'commission_runs', 'write')
            setCanWrite(write)
        }
        loadPermissions()
    }, [supabase])

    /**
     * Load active plans
     */
    useEffect(() => {
        if (open) {
            loadPlans()
        }
    }, [open])

    const loadPlans = async () => {
        try {
            setIsLoadingPlans(true)

            const activeCompanyId = await getActiveCompanyId(supabase)
            if (!activeCompanyId) return

            const { data, error } = await supabase
                .from('commission_plans')
                .select('id, name, type, is_active')
                .eq('company_id', activeCompanyId)
                .eq('is_active', true)
                .order('name')

            if (error) throw error

            setPlans(data || [])
        } catch (error) {
            console.error('Error loading plans:', error)
        } finally {
            setIsLoadingPlans(false)
        }
    }

    /**
     * Toggle plan selection
     */
    const togglePlan = (planId: string) => {
        setSelectedPlanIds(prev => {
            const updated = new Set(prev)
            if (updated.has(planId)) {
                updated.delete(planId)
            } else {
                updated.add(planId)
            }
            return updated
        })
        // Clear plan selection error
        setErrors(prev => {
            const updated = { ...prev }
            delete updated.plans
            return updated
        })
    }

    /**
     * Validate form
     */
    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {}

        // Period start required
        if (!periodStart) {
            newErrors.periodStart = lang === 'en' ? 'Period start is required' : 'تاريخ البداية مطلوب'
        }

        // Period end required
        if (!periodEnd) {
            newErrors.periodEnd = lang === 'en' ? 'Period end is required' : 'تاريخ النهاية مطلوب'
        }

        // Period end must be after start
        if (periodStart && periodEnd && periodEnd < periodStart) {
            newErrors.periodEnd = lang === 'en' ? 'Period end must be after start' : 'تاريخ النهاية يجب أن يكون بعد البداية'
        }

        // Period cannot be in future
        const today = new Date().toISOString().split('T')[0]
        if (periodEnd && periodEnd > today) {
            newErrors.periodEnd = lang === 'en' ? 'Period cannot be in the future' : 'الفترة لا يمكن أن تكون في المستقبل'
        }

        // At least one plan must be selected
        if (selectedPlanIds.size === 0) {
            newErrors.plans = lang === 'en' ? 'Select at least one plan' : 'اختر خطة واحدة على الأقل'
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    /**
     * Handle submit
     */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!validateForm()) {
            toast({
                title: lang === 'en' ? 'Validation Error' : 'خطأ في التحقق',
                description: lang === 'en' ? 'Please fix the errors in the form' : 'يرجى إصلاح الأخطاء في النموذج',
                variant: 'destructive'
            })
            return
        }

        if (!canWrite) {
            toast({
                title: lang === 'en' ? 'Permission Denied' : 'تم رفض الإذن',
                description: lang === 'en' ? 'You do not have permission to create runs' : 'ليس لديك إذن لإنشاء التشغيلات',
                variant: 'destructive'
            })
            return
        }

        setIsLoading(true)

        try {
            const response = await fetch('/api/commissions/runs/calculate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    period_start: periodStart,
                    period_end: periodEnd,
                    plan_ids: Array.from(selectedPlanIds)
                })
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to calculate commission')
            }

            const result = await response.json()

            toast({
                title: lang === 'en' ? 'Calculation Complete' : 'اكتمل الحساب',
                description: lang === 'en'
                    ? `Commission run created successfully`
                    : `تم إنشاء تشغيل العمولة بنجاح`
            })

            onCalculationComplete(result.run_id)
            onOpenChange(false)

            // Reset form
            setPeriodStart('')
            setPeriodEnd('')
            setSelectedPlanIds(new Set())
            setErrors({})
        } catch (error: any) {
            toast({
                title: lang === 'en' ? 'Error' : 'خطأ',
                description: error.message || (lang === 'en' ? 'Failed to calculate commission' : 'فشل حساب العمولة'),
                variant: 'destructive'
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Calculator className="h-5 w-5" />
                        {lang === 'en' ? 'Calculate Commission Run' : 'حساب تشغيل العمولة'}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Period Selection */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="period_start">
                                {lang === 'en' ? 'Period Start' : 'بداية الفترة'} *
                            </Label>
                            <Input
                                id="period_start"
                                type="date"
                                value={periodStart}
                                onChange={(e) => {
                                    setPeriodStart(e.target.value)
                                    setErrors(prev => {
                                        const updated = { ...prev }
                                        delete updated.periodStart
                                        return updated
                                    })
                                }}
                                className={errors.periodStart ? 'border-red-500' : ''}
                            />
                            {errors.periodStart && (
                                <p className="text-sm text-red-600 dark:text-red-400">{errors.periodStart}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="period_end">
                                {lang === 'en' ? 'Period End' : 'نهاية الفترة'} *
                            </Label>
                            <Input
                                id="period_end"
                                type="date"
                                value={periodEnd}
                                onChange={(e) => {
                                    setPeriodEnd(e.target.value)
                                    setErrors(prev => {
                                        const updated = { ...prev }
                                        delete updated.periodEnd
                                        return updated
                                    })
                                }}
                                className={errors.periodEnd ? 'border-red-500' : ''}
                            />
                            {errors.periodEnd && (
                                <p className="text-sm text-red-600 dark:text-red-400">{errors.periodEnd}</p>
                            )}
                        </div>
                    </div>

                    {/* Plan Selection */}
                    <div className="space-y-2">
                        <Label>
                            {lang === 'en' ? 'Select Plans' : 'اختر الخطط'} *
                        </Label>

                        {isLoadingPlans ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                            </div>
                        ) : plans.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                {lang === 'en' ? 'No active plans found' : 'لا توجد خطط نشطة'}
                            </div>
                        ) : (
                            <div className={`border rounded-lg p-4 space-y-3 max-h-60 overflow-y-auto ${errors.plans ? 'border-red-500' : ''}`}>
                                {plans.map((plan) => (
                                    <div key={plan.id} className="flex items-center space-x-2 space-x-reverse">
                                        <Checkbox
                                            id={`plan-${plan.id}`}
                                            checked={selectedPlanIds.has(plan.id)}
                                            onCheckedChange={() => togglePlan(plan.id)}
                                        />
                                        <Label
                                            htmlFor={`plan-${plan.id}`}
                                            className="flex-1 cursor-pointer text-sm font-normal"
                                        >
                                            {plan.name}
                                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                                                ({plan.type === 'flat_percent'
                                                    ? (lang === 'en' ? 'Flat' : 'ثابت')
                                                    : (lang === 'en' ? 'Tiered' : 'شرائح')})
                                            </span>
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        )}

                        {errors.plans && (
                            <p className="text-sm text-red-600 dark:text-red-400">{errors.plans}</p>
                        )}
                    </div>

                    {/* Selected Count */}
                    {selectedPlanIds.size > 0 && (
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                            {lang === 'en'
                                ? `${selectedPlanIds.size} plan(s) selected`
                                : `تم اختيار ${selectedPlanIds.size} خطة`}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isLoading}
                        >
                            {lang === 'en' ? 'Cancel' : 'إلغاء'}
                        </Button>
                        <Button
                            type="submit"
                            disabled={!canWrite || isLoading || isLoadingPlans}
                        >
                            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {lang === 'en' ? 'Calculate' : 'حساب'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

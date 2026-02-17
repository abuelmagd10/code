"use client"

/**
 * Commission Plan Form Dialog
 * 
 * Create/Edit commission plans with:
 * - Zod validation schema
 * - Conditional tier rules rendering (flat vs tiered)
 * - Proper default values
 * - Error surface mapping
 * - RBAC enforcement (Owner only)
 * - API-only operations
 * 
 * CRITICAL: No business logic, no financial calculations
 */

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2 } from "lucide-react"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { canAction } from "@/lib/authz"
import { TierRulesBuilder, validateTierRules, type TierRule } from "./tier-rules-builder"
import { z } from "zod"

/**
 * Zod Schema for Commission Plan
 * CRITICAL REFINEMENTS:
 * 1. effective_to >= effective_from validation
 * 2. tier_type required when tiered
 * 3. calculation_basis matches DB enum exactly
 */
const commissionPlanSchema = z.object({
    name: z.string()
        .min(3, 'Name must be at least 3 characters')
        .max(100, 'Name must not exceed 100 characters'),

    type: z.enum(['flat_percent', 'tiered_revenue'], {
        required_error: 'Plan type is required'
    }),

    tier_type: z.enum(['progressive', 'slab']).nullable(),

    // FIXED: Matches DB enum exactly
    calculation_basis: z.enum(['before_discount', 'after_discount', 'before_vat', 'after_vat'], {
        required_error: 'Calculation basis is required'
    }),

    handle_returns: z.boolean(),

    effective_from: z.string()
        .min(1, 'Effective from date is required')
        .refine((date) => !isNaN(Date.parse(date)), 'Invalid date format'),

    effective_to: z.string()
        .nullable()
        .refine((date) => {
            if (!date) return true
            return !isNaN(Date.parse(date))
        }, 'Invalid date format'),

    flat_rate: z.number()
        .min(0, 'Rate cannot be negative')
        .max(100, 'Rate cannot exceed 100%')
        .nullable(),

    tier_rules: z.array(z.object({
        id: z.string(),
        min_amount: z.number(),
        max_amount: z.number().nullable(),
        commission_rate: z.number()
    })).nullable()
})
    // CRITICAL REFINEMENT 1: effective_to >= effective_from
    .refine((data) => {
        if (data.effective_to) {
            return new Date(data.effective_to) >= new Date(data.effective_from)
        }
        return true
    }, {
        message: 'Effective To must be after or equal to Effective From',
        path: ['effective_to']
    })
    // CRITICAL REFINEMENT 2: tier_type required when tiered
    .refine((data) => {
        if (data.type === 'tiered_revenue' && !data.tier_type) {
            return false
        }
        return true
    }, {
        message: 'Tier type is required for tiered revenue plans',
        path: ['tier_type']
    })
    // Flat rate required when flat type
    .refine((data) => {
        if (data.type === 'flat_percent' && (data.flat_rate === null || data.flat_rate === undefined)) {
            return false
        }
        return true
    }, {
        message: 'Flat rate is required for flat percentage plans',
        path: ['flat_rate']
    })
    // Tier rules required when tiered type
    .refine((data) => {
        if (data.type === 'tiered_revenue' && (!data.tier_rules || data.tier_rules.length === 0)) {
            return false
        }
        return true
    }, {
        message: 'At least one tier rule is required for tiered revenue plans',
        path: ['general'] // REFINEMENT 3: Map to general for better UX
    })

type CommissionPlanFormData = z.infer<typeof commissionPlanSchema>

interface CommissionPlan {
    id: string
    name: string
    type: 'flat_percent' | 'tiered_revenue'
    tier_type: 'progressive' | 'slab' | null
    calculation_basis: 'before_discount' | 'after_discount' | 'before_vat' | 'after_vat'
    handle_returns: boolean
    effective_from: string
    effective_to: string | null
    flat_rate: number | null
    tier_rules: TierRule[] | null
}

interface PlanFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    editingPlan?: CommissionPlan | null
    onSaveComplete: () => void
    trigger?: React.ReactNode
    lang?: 'ar' | 'en'
}

export function PlanFormDialog({
    open,
    onOpenChange,
    editingPlan,
    onSaveComplete,
    trigger,
    lang = 'ar'
}: PlanFormDialogProps) {
    const supabase = useSupabase()
    const { toast } = useToast()

    // Permissions
    const [canWrite, setCanWrite] = useState(false)
    const [canUpdate, setCanUpdate] = useState(false)
    const [permissionsLoaded, setPermissionsLoaded] = useState(false)

    // Form state
    const [formData, setFormData] = useState<CommissionPlanFormData>({
        name: '',
        type: 'flat_percent',
        tier_type: null,
        calculation_basis: 'after_discount',
        handle_returns: true,
        effective_from: new Date().toISOString().split('T')[0],
        effective_to: null,
        flat_rate: 0,
        tier_rules: null
    })

    const [formErrors, setFormErrors] = useState<Record<string, string>>({})
    const [isSubmitting, setIsSubmitting] = useState(false)

    /**
     * Load permissions
     */
    useEffect(() => {
        const loadPermissions = async () => {
            const write = await canAction(supabase, 'commission_plans', 'write')
            const update = await canAction(supabase, 'commission_plans', 'update')
            setCanWrite(write)
            setCanUpdate(update)
            setPermissionsLoaded(true)
        }
        loadPermissions()
    }, [supabase])

    /**
     * Initialize form data when editing
     */
    useEffect(() => {
        if (editingPlan) {
            setFormData({
                name: editingPlan.name,
                type: editingPlan.type,
                tier_type: editingPlan.tier_type,
                calculation_basis: editingPlan.calculation_basis,
                handle_returns: editingPlan.handle_returns,
                effective_from: editingPlan.effective_from,
                effective_to: editingPlan.effective_to,
                flat_rate: editingPlan.flat_rate,
                tier_rules: editingPlan.tier_rules
            })
        } else {
            // Reset to defaults for new plan
            setFormData({
                name: '',
                type: 'flat_percent',
                tier_type: null,
                calculation_basis: 'after_discount',
                handle_returns: true,
                effective_from: new Date().toISOString().split('T')[0],
                effective_to: null,
                flat_rate: 0,
                tier_rules: null
            })
        }
        setFormErrors({})
    }, [editingPlan, open])

    /**
     * Handle field change
     */
    const handleFieldChange = (field: keyof CommissionPlanFormData, value: any) => {
        setFormData(prev => {
            const updated = { ...prev, [field]: value }

            // Clear tier_type and tier_rules if switching to flat
            if (field === 'type' && value === 'flat_percent') {
                updated.tier_type = null
                updated.tier_rules = null
                updated.flat_rate = 0
            }

            // Clear flat_rate if switching to tiered
            if (field === 'type' && value === 'tiered_revenue') {
                updated.flat_rate = null
                updated.tier_type = 'progressive'
                updated.tier_rules = []
            }

            return updated
        })

        // Clear error for this field
        setFormErrors(prev => {
            const updated = { ...prev }
            delete updated[field]
            return updated
        })
    }

    /**
     * Validate form
     */
    const validateForm = (): boolean => {
        try {
            // Validate with Zod
            commissionPlanSchema.parse(formData)

            // Additional tier rules validation if tiered
            if (formData.type === 'tiered_revenue' && formData.tier_rules) {
                const tierErrors = validateTierRules(formData.tier_rules, lang)
                if (Object.keys(tierErrors).length > 0) {
                    setFormErrors(tierErrors)
                    return false
                }
            }

            setFormErrors({})
            return true
        } catch (error) {
            if (error instanceof z.ZodError) {
                const errors: Record<string, string> = {}
                error.errors.forEach(err => {
                    const path = err.path.join('.')
                    errors[path] = err.message
                })
                setFormErrors(errors)
            }
            return false
        }
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

        // Check permissions
        if (editingPlan && !canUpdate) {
            toast({
                title: lang === 'en' ? 'Permission Denied' : 'تم رفض الإذن',
                description: lang === 'en' ? 'You do not have permission to update plans' : 'ليس لديك إذن لتحديث الخطط',
                variant: 'destructive'
            })
            return
        }

        if (!editingPlan && !canWrite) {
            toast({
                title: lang === 'en' ? 'Permission Denied' : 'تم رفض الإذن',
                description: lang === 'en' ? 'You do not have permission to create plans' : 'ليس لديك إذن لإنشاء الخطط',
                variant: 'destructive'
            })
            return
        }

        setIsSubmitting(true)

        try {
            const endpoint = editingPlan
                ? `/api/commissions/plans/${editingPlan.id}`
                : '/api/commissions/plans'

            const method = editingPlan ? 'PUT' : 'POST'

            const response = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to save plan')
            }

            toast({
                title: lang === 'en'
                    ? (editingPlan ? 'Plan Updated' : 'Plan Created')
                    : (editingPlan ? 'تم تحديث الخطة' : 'تم إنشاء الخطة'),
                description: lang === 'en'
                    ? (editingPlan ? 'Plan updated successfully' : 'Plan created successfully')
                    : (editingPlan ? 'تم تحديث الخطة بنجاح' : 'تم إنشاء الخطة بنجاح')
            })

            onSaveComplete()
            onOpenChange(false)
        } catch (error: any) {
            toast({
                title: lang === 'en' ? 'Error' : 'خطأ',
                description: error.message || (lang === 'en' ? 'Failed to save plan' : 'فشل حفظ الخطة'),
                variant: 'destructive'
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!permissionsLoaded) {
        return null
    }

    const isEditing = !!editingPlan
    const canSubmit = isEditing ? canUpdate : canWrite

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {trigger}
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {isEditing
                            ? (lang === 'en' ? 'Edit Commission Plan' : 'تعديل خطة العمولة')
                            : (lang === 'en' ? 'Create Commission Plan' : 'إنشاء خطة عمولة')}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* General Error (for tier rules and other general errors) */}
                    {formErrors.general && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
                            <p className="text-sm text-red-800 dark:text-red-300">{formErrors.general}</p>
                        </div>
                    )}

                    {/* Plan Name */}
                    <div className="space-y-2">
                        <Label htmlFor="name">
                            {lang === 'en' ? 'Plan Name' : 'اسم الخطة'} *
                        </Label>
                        <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => handleFieldChange('name', e.target.value)}
                            placeholder={lang === 'en' ? 'e.g., Sales Team Q1 2026' : 'مثال: فريق المبيعات Q1 2026'}
                            className={formErrors.name ? 'border-red-500' : ''}
                        />
                        {formErrors.name && (
                            <p className="text-sm text-red-600 dark:text-red-400">{formErrors.name}</p>
                        )}
                    </div>

                    {/* Plan Type */}
                    <div className="space-y-2">
                        <Label htmlFor="type">
                            {lang === 'en' ? 'Plan Type' : 'نوع الخطة'} *
                        </Label>
                        <Select
                            value={formData.type}
                            onValueChange={(value) => handleFieldChange('type', value as 'flat_percent' | 'tiered_revenue')}
                        >
                            <SelectTrigger className={formErrors.type ? 'border-red-500' : ''}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="flat_percent">
                                    {lang === 'en' ? 'Flat Percentage' : 'نسبة ثابتة'}
                                </SelectItem>
                                <SelectItem value="tiered_revenue">
                                    {lang === 'en' ? 'Tiered Revenue' : 'شرائح الإيرادات'}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        {formErrors.type && (
                            <p className="text-sm text-red-600 dark:text-red-400">{formErrors.type}</p>
                        )}
                    </div>

                    {/* Tier Type (only if tiered) */}
                    {formData.type === 'tiered_revenue' && (
                        <div className="space-y-2">
                            <Label htmlFor="tier_type">
                                {lang === 'en' ? 'Tier Type' : 'نوع الشرائح'} *
                            </Label>
                            <Select
                                value={formData.tier_type || 'progressive'}
                                onValueChange={(value) => handleFieldChange('tier_type', value as 'progressive' | 'slab')}
                            >
                                <SelectTrigger className={formErrors.tier_type ? 'border-red-500' : ''}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="progressive">
                                        {lang === 'en' ? 'Progressive' : 'تصاعدي'}
                                    </SelectItem>
                                    <SelectItem value="slab">
                                        {lang === 'en' ? 'Slab' : 'شرائح'}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            {formErrors.tier_type && (
                                <p className="text-sm text-red-600 dark:text-red-400">{formErrors.tier_type}</p>
                            )}
                        </div>
                    )}

                    {/* Calculation Basis */}
                    <div className="space-y-2">
                        <Label htmlFor="calculation_basis">
                            {lang === 'en' ? 'Calculation Basis' : 'أساس الحساب'} *
                        </Label>
                        <Select
                            value={formData.calculation_basis}
                            onValueChange={(value) => handleFieldChange('calculation_basis', value as any)}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="before_discount">
                                    {lang === 'en' ? 'Before Discount' : 'قبل الخصم'}
                                </SelectItem>
                                <SelectItem value="after_discount">
                                    {lang === 'en' ? 'After Discount' : 'بعد الخصم'}
                                </SelectItem>
                                <SelectItem value="before_vat">
                                    {lang === 'en' ? 'Before VAT' : 'قبل الضريبة'}
                                </SelectItem>
                                <SelectItem value="after_vat">
                                    {lang === 'en' ? 'After VAT' : 'بعد الضريبة'}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Handle Returns */}
                    <div className="flex items-center space-x-2 space-x-reverse">
                        <Checkbox
                            id="handle_returns"
                            checked={formData.handle_returns}
                            onCheckedChange={(checked) => handleFieldChange('handle_returns', checked)}
                        />
                        <Label htmlFor="handle_returns" className="cursor-pointer">
                            {lang === 'en' ? 'Deduct Returns from Commission' : 'خصم المرتجعات من العمولة'}
                        </Label>
                    </div>

                    {/* Effective Dates */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="effective_from">
                                {lang === 'en' ? 'Effective From' : 'ساري من'} *
                            </Label>
                            <Input
                                id="effective_from"
                                type="date"
                                value={formData.effective_from}
                                onChange={(e) => handleFieldChange('effective_from', e.target.value)}
                                className={formErrors.effective_from ? 'border-red-500' : ''}
                            />
                            {formErrors.effective_from && (
                                <p className="text-sm text-red-600 dark:text-red-400">{formErrors.effective_from}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="effective_to">
                                {lang === 'en' ? 'Effective To' : 'ساري حتى'}
                            </Label>
                            <Input
                                id="effective_to"
                                type="date"
                                value={formData.effective_to || ''}
                                onChange={(e) => handleFieldChange('effective_to', e.target.value || null)}
                                className={formErrors.effective_to ? 'border-red-500' : ''}
                            />
                            {formErrors.effective_to && (
                                <p className="text-sm text-red-600 dark:text-red-400">{formErrors.effective_to}</p>
                            )}
                        </div>
                    </div>

                    {/* Flat Rate (only if flat type) */}
                    {formData.type === 'flat_percent' && (
                        <div className="space-y-2">
                            <Label htmlFor="flat_rate">
                                {lang === 'en' ? 'Commission Rate (%)' : 'نسبة العمولة (%)'} *
                            </Label>
                            <Input
                                id="flat_rate"
                                type="number"
                                step="0.01"
                                value={formData.flat_rate ?? 0}
                                onChange={(e) => handleFieldChange('flat_rate', parseFloat(e.target.value) || 0)}
                                className={formErrors.flat_rate ? 'border-red-500' : ''}
                            />
                            {formErrors.flat_rate && (
                                <p className="text-sm text-red-600 dark:text-red-400">{formErrors.flat_rate}</p>
                            )}
                        </div>
                    )}

                    {/* Tier Rules Builder (only if tiered type) */}
                    {formData.type === 'tiered_revenue' && (
                        <TierRulesBuilder
                            tiers={formData.tier_rules || []}
                            onChange={(tiers) => handleFieldChange('tier_rules', tiers)}
                            errors={formErrors}
                            lang={lang}
                        />
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isSubmitting}
                        >
                            {lang === 'en' ? 'Cancel' : 'إلغاء'}
                        </Button>
                        <Button
                            type="submit"
                            disabled={!canSubmit || isSubmitting}
                        >
                            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {isEditing
                                ? (lang === 'en' ? 'Update Plan' : 'تحديث الخطة')
                                : (lang === 'en' ? 'Create Plan' : 'إنشاء الخطة')}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

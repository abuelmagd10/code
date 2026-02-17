"use client"

/**
 * Tier Rules Builder Component
 * 
 * Dynamic tier configuration for commission plans with:
 * - Add/Remove tier rows
 * - Auto-fill next tier from previous tier's "to" amount
 * - Comprehensive validation (no overlaps, no gaps, ascending order)
 * - Summary display (tier count, max rate)
 * - Auto-scroll on add
 * 
 * CRITICAL: This is UI-only validation - no financial calculations
 */

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Trash2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export interface TierRule {
    id: string
    min_amount: number
    max_amount: number | null
    commission_rate: number
}

interface TierRulesBuilderProps {
    tiers: TierRule[]
    onChange: (tiers: TierRule[]) => void
    errors?: Record<string, string>
    lang?: 'ar' | 'en'
}

/**
 * Generate unique ID for new tier
 */
function generateTierId(): string {
    return `tier_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Validate tier rules
 * Returns validation errors or empty object if valid
 */
export function validateTierRules(tiers: TierRule[], lang: 'ar' | 'en' = 'ar'): Record<string, string> {
    const errors: Record<string, string> = {}

    if (tiers.length === 0) {
        errors.general = lang === 'en'
            ? 'At least one tier is required'
            : 'يجب إضافة شريحة واحدة على الأقل'
        return errors
    }

    // Sort tiers by min_amount for validation
    const sortedTiers = [...tiers].sort((a, b) => a.min_amount - b.min_amount)

    sortedTiers.forEach((tier, index) => {
        const tierKey = `tier_${tier.id}`

        // Validate min_amount
        if (tier.min_amount < 0) {
            errors[`${tierKey}_min`] = lang === 'en'
                ? 'From amount cannot be negative'
                : 'المبلغ من لا يمكن أن يكون سالباً'
        }

        // Validate max_amount
        if (tier.max_amount !== null) {
            if (tier.max_amount <= tier.min_amount) {
                errors[`${tierKey}_max`] = lang === 'en'
                    ? 'To amount must be greater than From amount'
                    : 'المبلغ إلى يجب أن يكون أكبر من المبلغ من'
            }
        }

        // Validate commission_rate
        if (tier.commission_rate < 0 || tier.commission_rate > 100) {
            errors[`${tierKey}_rate`] = lang === 'en'
                ? 'Rate must be between 0 and 100'
                : 'النسبة يجب أن تكون بين 0 و 100'
        }

        // Check for gaps and overlaps with next tier
        if (index < sortedTiers.length - 1) {
            const nextTier = sortedTiers[index + 1]

            // Current tier must have max_amount if not last
            if (tier.max_amount === null) {
                errors[`${tierKey}_max`] = lang === 'en'
                    ? 'Only the last tier can have unlimited (empty) To amount'
                    : 'فقط الشريحة الأخيرة يمكن أن تكون غير محدودة (المبلغ إلى فارغ)'
            } else {
                // Check for gaps
                if (tier.max_amount !== nextTier.min_amount) {
                    errors[`${tierKey}_gap`] = lang === 'en'
                        ? `Gap detected: This tier ends at ${tier.max_amount} but next tier starts at ${nextTier.min_amount}`
                        : `فجوة: هذه الشريحة تنتهي عند ${tier.max_amount} لكن الشريحة التالية تبدأ من ${nextTier.min_amount}`
                }
            }
        }

        // Last tier can have null max_amount (unlimited)
        if (index === sortedTiers.length - 1 && tier.max_amount === null) {
            // This is valid - unlimited last tier
        }
    })

    return errors
}

export function TierRulesBuilder({
    tiers,
    onChange,
    errors = {},
    lang = 'ar'
}: TierRulesBuilderProps) {
    const [localErrors, setLocalErrors] = useState<Record<string, string>>({})
    const containerRef = useRef<HTMLDivElement>(null)

    // Merge external and local errors
    const allErrors = { ...localErrors, ...errors }

    /**
     * Add new tier with auto-fill from previous tier
     */
    const handleAddTier = () => {
        const lastTier = tiers[tiers.length - 1]
        const newMinAmount = lastTier?.max_amount ?? 0

        const newTier: TierRule = {
            id: generateTierId(),
            min_amount: newMinAmount,
            max_amount: null,
            commission_rate: 0
        }

        onChange([...tiers, newTier])

        // Auto-scroll to new tier
        setTimeout(() => {
            if (containerRef.current) {
                containerRef.current.scrollTop = containerRef.current.scrollHeight
            }
        }, 100)
    }

    /**
     * Remove tier
     */
    const handleRemoveTier = (tierId: string) => {
        onChange(tiers.filter(t => t.id !== tierId))
    }

    /**
     * Update tier field
     * FIXED: Single onChange call with all updates
     */
    const handleUpdateTier = (tierId: string, field: keyof TierRule, value: any) => {
        const updatedTiers = tiers.map(tier => {
            if (tier.id === tierId) {
                return { ...tier, [field]: value }
            }
            return tier
        })

        // Auto-fill next tier's min_amount if current tier's max_amount changed
        if (field === 'max_amount' && value !== null) {
            const currentIndex = updatedTiers.findIndex(t => t.id === tierId)
            if (currentIndex !== -1 && currentIndex < updatedTiers.length - 1) {
                const nextTier = updatedTiers[currentIndex + 1]
                if (nextTier.min_amount !== value) {
                    // Update next tier's min_amount in the same array
                    updatedTiers[currentIndex + 1] = {
                        ...nextTier,
                        min_amount: value
                    }
                }
            }
        }

        // Call onChange only once with all updates
        onChange(updatedTiers)
    }

    /**
     * Validate on change
     */
    useEffect(() => {
        if (tiers.length > 0) {
            const validationErrors = validateTierRules(tiers, lang)
            setLocalErrors(validationErrors)
        } else {
            setLocalErrors({})
        }
    }, [tiers, lang])

    /**
     * Calculate summary
     */
    const tierCount = tiers.length
    const maxRate = tiers.length > 0
        ? Math.max(...tiers.map(t => t.commission_rate))
        : 0

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                    {lang === 'en' ? 'Tier Rules' : 'قواعد الشرائح'}
                </Label>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddTier}
                    className="h-8"
                >
                    <Plus className="w-4 h-4 mr-1" />
                    {lang === 'en' ? 'Add Tier' : 'إضافة شريحة'}
                </Button>
            </div>

            {/* General Error */}
            {allErrors.general && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5" />
                    <p className="text-sm text-red-800 dark:text-red-300">{allErrors.general}</p>
                </div>
            )}

            {/* Tier Rows */}
            <div
                ref={containerRef}
                className="space-y-3 max-h-[400px] overflow-y-auto pr-2"
            >
                {tiers.map((tier, index) => {
                    const tierKey = `tier_${tier.id}`
                    const isLast = index === tiers.length - 1

                    return (
                        <div
                            key={tier.id}
                            className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50 space-y-3"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {lang === 'en' ? `Tier ${index + 1}` : `الشريحة ${index + 1}`}
                                </span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveTier(tier.id)}
                                    className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                {/* From Amount */}
                                <div className="space-y-1">
                                    <Label className="text-xs">
                                        {lang === 'en' ? 'From' : 'من'}
                                    </Label>
                                    <Input
                                        type="number"
                                        value={tier.min_amount}
                                        onChange={(e) => handleUpdateTier(tier.id, 'min_amount', parseFloat(e.target.value) || 0)}
                                        className={cn(
                                            'h-9',
                                            allErrors[`${tierKey}_min`] && 'border-red-500'
                                        )}
                                        disabled={index > 0}
                                        title={index > 0 ? (lang === 'en' ? 'Auto-calculated from previous tier' : 'محسوب تلقائياً من الشريحة السابقة') : ''}
                                    />
                                    {allErrors[`${tierKey}_min`] && (
                                        <p className="text-xs text-red-600 dark:text-red-400">{allErrors[`${tierKey}_min`]}</p>
                                    )}
                                </div>

                                {/* To Amount */}
                                <div className="space-y-1">
                                    <Label className="text-xs">
                                        {lang === 'en' ? 'To' : 'إلى'}
                                        {isLast && (
                                            <span className="text-xs text-gray-500 mr-1">
                                                ({lang === 'en' ? 'optional' : 'اختياري'})
                                            </span>
                                        )}
                                    </Label>
                                    <Input
                                        type="number"
                                        value={tier.max_amount ?? ''}
                                        onChange={(e) => handleUpdateTier(tier.id, 'max_amount', e.target.value ? parseFloat(e.target.value) : null)}
                                        placeholder={isLast ? (lang === 'en' ? '∞' : '∞') : ''}
                                        className={cn(
                                            'h-9',
                                            (allErrors[`${tierKey}_max`] || allErrors[`${tierKey}_gap`]) && 'border-red-500'
                                        )}
                                    />
                                    {allErrors[`${tierKey}_max`] && (
                                        <p className="text-xs text-red-600 dark:text-red-400">{allErrors[`${tierKey}_max`]}</p>
                                    )}
                                    {allErrors[`${tierKey}_gap`] && (
                                        <p className="text-xs text-red-600 dark:text-red-400">{allErrors[`${tierKey}_gap`]}</p>
                                    )}
                                </div>

                                {/* Commission Rate */}
                                <div className="space-y-1">
                                    <Label className="text-xs">
                                        {lang === 'en' ? 'Rate %' : 'النسبة %'}
                                    </Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={tier.commission_rate}
                                        onChange={(e) => handleUpdateTier(tier.id, 'commission_rate', parseFloat(e.target.value) || 0)}
                                        className={cn(
                                            'h-9',
                                            allErrors[`${tierKey}_rate`] && 'border-red-500'
                                        )}
                                    />
                                    {allErrors[`${tierKey}_rate`] && (
                                        <p className="text-xs text-red-600 dark:text-red-400">{allErrors[`${tierKey}_rate`]}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Summary */}
            {tiers.length > 0 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-blue-800 dark:text-blue-300">
                            {lang === 'en'
                                ? `${tierCount} Tier${tierCount > 1 ? 's' : ''} Configured`
                                : `${tierCount} شريحة مُعدّة`}
                        </span>
                        <span className="text-blue-800 dark:text-blue-300 font-medium">
                            {lang === 'en' ? 'Max Rate:' : 'أعلى نسبة:'} {maxRate.toFixed(2)}%
                        </span>
                    </div>
                </div>
            )}
        </div>
    )
}

"use client"

/**
 * Plan Type Badge Component
 * 
 * Visual distinction for commission plan types:
 * - Flat → Blue (Neutral/Simple)
 * - Progressive → Green (Growth-oriented)
 * - Slab → Purple (Tier-based)
 * 
 * Enterprise UX: Instant visual recognition without reading text
 */

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { BarChart3, TrendingUp, Layers, CheckCircle2, Clock, XCircle } from "lucide-react"

export type PlanType = 'flat_percent' | 'tiered_revenue'
export type TierType = 'progressive' | 'slab' | null

interface PlanTypeBadgeProps {
    type: PlanType
    tierType?: TierType
    className?: string
    lang?: 'ar' | 'en'
}

/**
 * Plan type configuration map (optimized - defined once)
 */
const PLAN_TYPE_CONFIG = {
    flat: {
        label: { en: 'Flat', ar: 'ثابت' },
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-300 dark:border-blue-700',
        Icon: BarChart3
    },
    progressive: {
        label: { en: 'Progressive', ar: 'تصاعدي' },
        className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-300 dark:border-green-700',
        Icon: TrendingUp
    },
    slab: {
        label: { en: 'Slab', ar: 'شرائح' },
        className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-300 dark:border-purple-700',
        Icon: Layers
    }
} as const

/**
 * Get plan type display info
 */
function getPlanTypeInfo(type: PlanType, tierType: TierType, lang: 'ar' | 'en') {
    if (type === 'flat_percent') {
        const config = PLAN_TYPE_CONFIG.flat
        return {
            label: config.label[lang],
            className: config.className,
            Icon: config.Icon
        }
    }

    if (type === 'tiered_revenue') {
        if (tierType === 'progressive') {
            const config = PLAN_TYPE_CONFIG.progressive
            return {
                label: config.label[lang],
                className: config.className,
                Icon: config.Icon
            }
        }

        if (tierType === 'slab') {
            const config = PLAN_TYPE_CONFIG.slab
            return {
                label: config.label[lang],
                className: config.className,
                Icon: config.Icon
            }
        }
    }

    // Fallback
    return {
        label: lang === 'en' ? 'Tiered' : 'متدرج',
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300 border-gray-300 dark:border-gray-700',
        Icon: BarChart3
    }
}

export function PlanTypeBadge({ type, tierType, className, lang = 'ar' }: PlanTypeBadgeProps) {
    const info = getPlanTypeInfo(type, tierType ?? null, lang)
    const Icon = info.Icon

    return (
        <Badge
            variant="default"
            className={cn(
                'font-medium border',
                info.className,
                className
            )}
        >
            <Icon className={cn('w-3 h-3', lang === 'ar' ? 'ml-1' : 'mr-1')} />
            {info.label}
        </Badge>
    )
}

/**
 * Effective Period Status Badge
 * 
 * Visual indicator for plan status based on effective dates:
 * - Active (current date within period)
 * - Upcoming (starts in future)
 * - Expired (ended in past)
 * 
 * Note: This is UI-level display logic only (non-financial)
 */

interface EffectivePeriodBadgeProps {
    effectiveFrom: string | Date
    effectiveTo?: string | Date | null
    className?: string
    lang?: 'ar' | 'en'
}

/**
 * Get date without time component for accurate comparison
 */
function getDateOnly(date: string | Date): Date {
    const d = new Date(date)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function getEffectiveStatus(effectiveFrom: string | Date, effectiveTo?: string | Date | null) {
    const today = getDateOnly(new Date())
    const from = getDateOnly(effectiveFrom)
    const to = effectiveTo ? getDateOnly(effectiveTo) : null

    // Upcoming: starts in future
    if (from > today) {
        return 'upcoming'
    }

    // Expired: ended in past
    if (to && to < today) {
        return 'expired'
    }

    // Active: current date within period (including today as start/end)
    return 'active'
}

const EFFECTIVE_STATUS_CONFIG = {
    active: {
        label: { en: 'Active', ar: 'نشط' },
        className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-300 dark:border-green-700',
        Icon: CheckCircle2
    },
    upcoming: {
        label: { en: 'Upcoming', ar: 'قادم' },
        className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700',
        Icon: Clock
    },
    expired: {
        label: { en: 'Expired', ar: 'منتهي' },
        className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-300 dark:border-red-700',
        Icon: XCircle
    }
} as const

export function EffectivePeriodBadge({
    effectiveFrom,
    effectiveTo,
    className,
    lang = 'ar'
}: EffectivePeriodBadgeProps) {
    const status = getEffectiveStatus(effectiveFrom, effectiveTo)
    const config = EFFECTIVE_STATUS_CONFIG[status]
    const Icon = config.Icon

    return (
        <Badge
            variant="default"
            className={cn(
                'font-medium border',
                config.className,
                className
            )}
        >
            <Icon className={cn('w-3 h-3', lang === 'ar' ? 'ml-1' : 'mr-1')} />
            {config.label[lang]}
        </Badge>
    )
}

"use client"

/**
 * Commission Run Status Badge
 * 
 * Visual indicator for commission run workflow status
 * 
 * Status Flow:
 * Draft (Gray) → Reviewed (Blue) → Approved (Yellow) → Posted (Green) → Paid (Purple)
 * 
 * Features:
 * - Distinct colors for each status
 * - Lucide icons for visual clarity
 * - Dark mode support
 * - RTL safe
 * - Bilingual (AR/EN)
 */

import { Badge } from "@/components/ui/badge"
import {
    FileText,
    Eye,
    CheckCircle2,
    BookOpen,
    Wallet,
    XCircle
} from "lucide-react"

type RunStatus = 'draft' | 'reviewed' | 'approved' | 'posted' | 'paid' | 'cancelled'

interface RunStatusBadgeProps {
    status: RunStatus
    lang?: 'ar' | 'en'
    className?: string
}

interface StatusConfig {
    label: { ar: string; en: string }
    icon: React.ComponentType<{ className?: string }>
    className: string
}

const STATUS_CONFIG: Record<RunStatus, StatusConfig> = {
    draft: {
        label: { ar: 'مسودة', en: 'Draft' },
        icon: FileText,
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-300 dark:border-gray-600'
    },
    reviewed: {
        label: { ar: 'تمت المراجعة', en: 'Reviewed' },
        icon: Eye,
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-300 dark:border-blue-700'
    },
    approved: {
        label: { ar: 'معتمد', en: 'Approved' },
        icon: CheckCircle2,
        className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700'
    },
    posted: {
        label: { ar: 'مُرحّل', en: 'Posted' },
        icon: BookOpen,
        className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-300 dark:border-green-700'
    },
    paid: {
        label: { ar: 'مدفوع', en: 'Paid' },
        icon: Wallet,
        className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 border-purple-300 dark:border-purple-700'
    },
    cancelled: {
        label: { ar: 'ملغي', en: 'Cancelled' },
        icon: XCircle,
        className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-300 dark:border-red-700'
    }
}

export function RunStatusBadge({
    status,
    lang = 'ar',
    className = ''
}: RunStatusBadgeProps) {
    const config = STATUS_CONFIG[status]
    const Icon = config.icon

    return (
        <Badge
            variant="outline"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border ${config.className} ${className}`}
        >
            <Icon className="h-3.5 w-3.5" />
            <span>{config.label[lang]}</span>
        </Badge>
    )
}

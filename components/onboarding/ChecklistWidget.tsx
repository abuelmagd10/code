'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface OnboardingSteps {
  company_created: boolean
  branch_added: boolean
  first_product: boolean
  first_invoice: boolean
  first_purchase_order: boolean
}

const STEP_LABELS: Record<keyof OnboardingSteps, string> = {
  company_created: 'إنشاء الشركة',
  branch_added: 'إضافة فرع',
  first_product: 'إضافة أول منتج',
  first_invoice: 'إنشاء أول فاتورة',
  first_purchase_order: 'إنشاء أول أمر شراء',
}

const STEP_LINKS: Record<keyof OnboardingSteps, string> = {
  company_created: '/settings',
  branch_added: '/settings/branches',
  first_product: '/inventory',
  first_invoice: '/invoices/new',
  first_purchase_order: '/purchase-orders/new',
}

export default function OnboardingChecklist({ companyId }: { companyId: string }) {
  const [steps, setSteps] = useState<OnboardingSteps | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('onboarding_progress')
      .select('steps, dismissed_at, completed_at')
      .eq('company_id', companyId)
      .maybeSingle()
      .then(({ data }: { data: { steps: OnboardingSteps; dismissed_at: string | null; completed_at: string | null } | null }) => {
        if (data?.dismissed_at || data?.completed_at) {
          setDismissed(true)
        } else {
          setSteps(data?.steps ?? {
            company_created: false, branch_added: false,
            first_product: false, first_invoice: false, first_purchase_order: false,
          })
        }
        setLoading(false)
      })
  }, [companyId])

  const dismiss = async () => {
    setDismissed(true)
    await fetch('/api/onboarding/dismiss', { method: 'POST' })
  }

  if (loading || dismissed || !steps) return null

  const stepKeys = Object.keys(steps) as (keyof OnboardingSteps)[]
  const completedCount = stepKeys.filter(k => steps[k]).length
  const allDone = completedCount === stepKeys.length

  if (allDone) return null

  const progress = Math.round((completedCount / stepKeys.length) * 100)

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-sm text-gray-900 dark:text-white">🚀 ابدأ مع النظام</h3>
          <p className="text-xs text-gray-500">{completedCount} من {stepKeys.length} خطوات مكتملة</p>
        </div>
        <button
          onClick={dismiss}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none"
          aria-label="إغلاق"
        >×</button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {stepKeys.map(key => (
          <a
            key={key}
            href={steps[key] ? '#' : STEP_LINKS[key]}
            className={`flex items-center gap-3 p-2 rounded-lg text-sm transition-colors ${
              steps[key]
                ? 'opacity-50 cursor-default'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
              steps[key]
                ? 'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400'
                : 'bg-gray-100 text-gray-400 dark:bg-gray-700'
            }`}>
              {steps[key] ? '✓' : '○'}
            </span>
            <span className={`${steps[key] ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
              {STEP_LABELS[key]}
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}

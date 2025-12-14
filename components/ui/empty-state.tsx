'use client'

import * as React from 'react'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
    icon?: LucideIcon
  }
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className
}: EmptyStateProps) {
  const appLang = typeof window !== 'undefined' 
    ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
    : 'ar'

  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-4', className)}>
      {Icon && (
        <Icon className="h-12 w-12 text-muted-foreground mb-4" />
      )}
      <h3 className={cn(
        'text-lg font-semibold text-foreground mb-2',
        appLang === 'ar' ? 'text-right' : 'text-left'
      )}>
        {title}
      </h3>
      {description && (
        <p className={cn(
          'text-sm text-muted-foreground mb-4 max-w-md',
          appLang === 'ar' ? 'text-right' : 'text-left'
        )}>
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick} className="mt-2">
          {action.icon && <action.icon className="h-4 w-4 mr-2" />}
          {action.label}
        </Button>
      )}
    </div>
  )
}

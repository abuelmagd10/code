/**
 * 🔐 Action Button - زر عملية محمية بالصلاحيات
 * 
 * مكون زر يتعطل تلقائياً عند سحب الصلاحية
 */

"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { useAccess } from "@/lib/access-context"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface ActionButtonProps extends React.ComponentProps<typeof Button> {
  resource: string
  action: string
  disabledTooltip?: string
  fallback?: React.ReactNode // ما يعرض عند عدم الصلاحية
}

/**
 * Action Button Component
 * 
 * زر عملية محمي بالصلاحيات. يتعطل تلقائياً عند سحب الصلاحية.
 * 
 * @example
 * ```tsx
 * <ActionButton
 *   resource="invoices"
 *   action="delete"
 *   variant="destructive"
 *   onClick={handleDelete}
 *   disabledTooltip="ليس لديك صلاحية حذف الفواتير"
 * >
 *   حذف
 * </ActionButton>
 * ```
 */
export function ActionButton({
  resource,
  action,
  children,
  disabledTooltip,
  fallback,
  disabled: externalDisabled,
  onClick,
  ...props
}: ActionButtonProps) {
  const { isReady, canAction } = useAccess()
  
  // التحقق من الصلاحية
  const hasPermission = isReady ? canAction(resource, action) : false
  const isDisabled = externalDisabled || !hasPermission

  // إذا لم يكن هناك صلاحية وتم توفير fallback
  if (!hasPermission && fallback) {
    return <>{fallback}</>
  }

  // إذا لم يكن هناك صلاحية وتم توفير tooltip
  if (!hasPermission && disabledTooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button {...props} disabled={true}>
                {children}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{disabledTooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // إذا لم يكن هناك صلاحية، إخفاء الزر
  if (!hasPermission) {
    return null
  }

  // عرض الزر مع الصلاحية
  return (
    <Button
      {...props}
      disabled={isDisabled}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

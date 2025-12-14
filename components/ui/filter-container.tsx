'use client'

import * as React from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

interface FilterContainerProps {
  title: string
  children: React.ReactNode
  activeCount: number
  onClear: () => void
  defaultOpen?: boolean
  className?: string
}

export function FilterContainer({
  title,
  children,
  activeCount,
  onClear,
  defaultOpen = false,
  className
}: FilterContainerProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  return (
    <Card className={cn('mb-4', className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2 p-0 h-auto font-semibold hover:bg-transparent"
              >
                <span>{title}</span>
                {activeCount > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {activeCount}
                  </Badge>
                )}
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            {activeCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <X className="h-3 w-3 mr-1" />
                {typeof window !== 'undefined' && (localStorage.getItem('app_language') || 'ar') === 'en' 
                  ? 'Clear All' 
                  : 'مسح الكل'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {children}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

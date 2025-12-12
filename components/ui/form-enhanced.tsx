'use client'

import React from 'react'
import { useFormField } from '@/components/ui/form'
import { cn } from '@/lib/utils'
import { getErrorMessage, formatValidationError } from '@/lib/error-messages'
// Language detection from localStorage

interface FormMessageEnhancedProps extends React.ComponentProps<'p'> {
  errorKey?: string
  fieldName?: string
  errorType?: 'required' | 'invalid' | 'custom'
}

export function FormMessageEnhanced({ 
  className, 
  errorKey, 
  fieldName, 
  errorType = 'invalid',
  children,
  ...props 
}: FormMessageEnhancedProps) {
  const { error, formMessageId } = useFormField()
  const language = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'
  
  let body = ''
  
  if (error) {
    if (errorKey) {
      // Use predefined error message
      body = getErrorMessage(errorKey, language)
    } else if (fieldName) {
      // Use field-specific error message
      body = formatValidationError(fieldName, errorType, language)
    } else {
      // Use the original error message
      body = String(error?.message ?? '')
    }
  } else if (children) {
    body = String(children)
  }

  if (!body) {
    return null
  }

  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      className={cn('text-destructive text-sm', className)}
      {...props}
    >
      {body}
    </p>
  )
}

export function FormDescriptionEnhanced({ className, ...props }: React.ComponentProps<'p'>) {
  const { formDescriptionId } = useFormField()

  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}
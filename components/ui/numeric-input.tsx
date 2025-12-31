"use client"

import * as React from 'react'
import { cn } from '@/lib/utils'

interface NumericInputProps extends Omit<React.ComponentProps<'input'>, 'type' | 'onChange' | 'value'> {
  value: number | string
  onChange: (value: number) => void
  /** الحد الأدنى للقيمة */
  min?: number
  /** الحد الأقصى للقيمة */
  max?: number
  /** خطوة الزيادة/النقصان */
  step?: number | string
  /** عدد المنازل العشرية المسموح بها */
  decimalPlaces?: number
  /** السماح بالقيم السالبة */
  allowNegative?: boolean
  /** مسح القيمة عند التركيز إذا كانت صفر */
  clearOnFocus?: boolean
  /** تحديد النص بالكامل عند التركيز */
  selectOnFocus?: boolean
}

/**
 * مكون إدخال رقمي محسّن
 * - يحدد النص بالكامل عند التركيز
 * - يمسح الصفر عند بدء الكتابة
 * - يمنع السلوك غير المرغوب للأرقام العشرية
 */
function NumericInput({
  className,
  value,
  onChange,
  min,
  max,
  step = "0.01",
  decimalPlaces,
  allowNegative = false,
  clearOnFocus = true,
  selectOnFocus = true,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: NumericInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [displayValue, setDisplayValue] = React.useState<string>('')
  const [isFocused, setIsFocused] = React.useState(false)

  // تحديث القيمة المعروضة عند تغيير القيمة من الخارج
  React.useEffect(() => {
    if (!isFocused) {
      const numValue = typeof value === 'string' ? parseFloat(value) : value
      if (isNaN(numValue)) {
        setDisplayValue('')
      } else {
        setDisplayValue(numValue.toString())
      }
    }
  }, [value, isFocused])

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true)
    
    // مسح القيمة إذا كانت صفر
    const numValue = parseFloat(e.target.value)
    if (clearOnFocus && (numValue === 0 || e.target.value === '0')) {
      setDisplayValue('')
    }
    
    // تحديد النص بالكامل
    if (selectOnFocus) {
      setTimeout(() => {
        e.target.select()
      }, 0)
    }
    
    onFocus?.(e)
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false)
    
    // تحويل القيمة النهائية
    let finalValue = parseFloat(displayValue)
    if (isNaN(finalValue)) {
      finalValue = 0
    }
    
    // تطبيق الحدود
    if (min !== undefined && finalValue < min) finalValue = min
    if (max !== undefined && finalValue > max) finalValue = max
    
    // تطبيق المنازل العشرية
    if (decimalPlaces !== undefined) {
      finalValue = parseFloat(finalValue.toFixed(decimalPlaces))
    }
    
    setDisplayValue(finalValue.toString())
    onChange(finalValue)
    
    onBlur?.(e)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value
    
    // السماح بالقيمة الفارغة أثناء الكتابة
    if (inputValue === '' || inputValue === '-') {
      setDisplayValue(inputValue)
      return
    }
    
    // التحقق من صحة الإدخال
    const regex = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/
    if (!regex.test(inputValue)) {
      return
    }
    
    // منع أكثر من نقطة عشرية
    if ((inputValue.match(/\./g) || []).length > 1) {
      return
    }
    
    setDisplayValue(inputValue)
    
    // تحديث القيمة الفعلية
    const numValue = parseFloat(inputValue)
    if (!isNaN(numValue)) {
      onChange(numValue)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // منع بعض المفاتيح غير المرغوبة
    if (e.key === 'e' || e.key === 'E') {
      e.preventDefault()
    }
    
    // منع السالب إذا غير مسموح
    if (!allowNegative && e.key === '-') {
      e.preventDefault()
    }
    
    onKeyDown?.(e)
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      {...props}
    />
  )
}

export { NumericInput }
export type { NumericInputProps }


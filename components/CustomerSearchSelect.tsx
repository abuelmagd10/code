"use client"

import { useState, useMemo, useCallback } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"

export interface CustomerOption {
  id: string
  name: string
  phone?: string | null
}

interface CustomerSearchSelectProps {
  customers: CustomerOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  className?: string
  disabled?: boolean
}

/**
 * Customer search select component with dual search (name + phone)
 * - Letters → search by name
 * - Numbers → search by phone
 * - Mixed → search in both fields
 */
export function CustomerSearchSelect({
  customers,
  value,
  onValueChange,
  placeholder = "اختر عميل",
  searchPlaceholder = "ابحث عن عميل...",
  className = "",
  disabled = false,
}: CustomerSearchSelectProps) {
  const [searchQuery, setSearchQuery] = useState("")

  // Optimized search function
  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim()
    if (!query) return customers

    const lowerQuery = query.toLowerCase()

    // Check if query is purely numeric (phone search)
    const isNumeric = /^\d+$/.test(query)
    // Check if query is purely letters/arabic (name search)
    const isAlphabetic = /^[\u0600-\u06FF\u0750-\u077Fa-zA-Z\s]+$/.test(query)

    return customers.filter((customer) => {
      // ✅ تأكد من وجود customer وأن له id
      if (!customer || !customer.id) return false

      if (isNumeric) {
        // Search by phone only
        const phone = customer.phone ? String(customer.phone).replace(/[\s\-\(\)]/g, "") : ""
        return phone.includes(query)
      } else if (isAlphabetic) {
        // Search by name only
        const name = customer.name ? String(customer.name) : ""
        return name.toLowerCase().includes(lowerQuery)
      } else {
        // Mixed - search in both
        const name = customer.name ? String(customer.name) : ""
        const nameMatch = name.toLowerCase().includes(lowerQuery)
        const phone = customer.phone ? String(customer.phone).replace(/[\s\-\(\)]/g, "") : ""
        const phoneMatch = phone.includes(query.replace(/[\s\-\(\)]/g, ""))
        return nameMatch || phoneMatch
      }
    })
  }, [customers, searchQuery])

  // Reset search when dropdown closes
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setSearchQuery("")
    }
  }, [])

  // Get selected customer name for display
  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === value)
  }, [customers, value])

  // Handle empty value for "All" option
  const selectValue = value || '__all__'
  const handleChange = (val: string) => {
    onValueChange(val === '__all__' ? '' : val)
  }

  return (
    <Select value={selectValue} onValueChange={handleChange} disabled={disabled} onOpenChange={handleOpenChange}>
      <SelectTrigger className={`w-full ${className}`}>
        <SelectValue placeholder={placeholder}>
          {selectedCustomer?.name || placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-[300px]">
        <div className="p-2 sticky top-0 bg-white dark:bg-slate-950 z-10">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="text-sm"
            autoComplete="off"
          />
          <div className="text-xs text-gray-400 mt-1 px-1">
            {searchQuery && (
              <span>
                {/^\d+$/.test(searchQuery.trim()) ? "🔍 بحث برقم الهاتف" :
                  /^[\u0600-\u06FF\u0750-\u077Fa-zA-Z\s]+$/.test(searchQuery.trim()) ? "🔍 بحث بالاسم" :
                    "🔍 بحث بالاسم والهاتف"}
              </span>
            )}
          </div>
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {filteredCustomers.length === 0 ? (
            <div className="p-3 text-center text-gray-500 text-sm">
              لا توجد نتائج
            </div>
          ) : (
            filteredCustomers.map((customer) => (
              <SelectItem key={customer.id || '__all__'} value={customer.id || '__all__'}>
                <div className="flex flex-col">
                  <span className="font-medium">{customer.name}</span>
                  {customer.phone && (
                    <span className="text-xs text-gray-500 dir-ltr">{customer.phone}</span>
                  )}
                </div>
              </SelectItem>
            ))
          )}
        </div>
      </SelectContent>
    </Select>
  )
}


"use client"

import { useState, useMemo, useCallback } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"

export interface ProductOption {
  id: string
  name: string
  sku?: string | null
  unit_price?: number
  item_type?: 'product' | 'service'
  quantity_on_hand?: number
}

interface ProductSearchSelectProps {
  products: ProductOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  className?: string
  disabled?: boolean
  showPrice?: boolean
  showStock?: boolean
  currency?: string
  lang?: 'ar' | 'en'
}

/**
 * Product/Service search select component with advanced search
 * - Search by name
 * - Search by SKU code
 * - Filter by type (product/service)
 * - Shows price and stock info
 */
export function ProductSearchSelect({
  products,
  value,
  onValueChange,
  placeholder,
  searchPlaceholder,
  className = "",
  disabled = false,
  showPrice = true,
  showStock = true,
  currency = "EGP",
  lang = 'ar',
}: ProductSearchSelectProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<'all' | 'product' | 'service'>('all')

  const labels = {
    placeholder: lang === 'en' ? 'Select item' : 'اختر صنف',
    searchPlaceholder: lang === 'en' ? 'Search by name or SKU...' : 'ابحث بالاسم أو الرمز...',
    noResults: lang === 'en' ? 'No results found' : 'لا توجد نتائج',
    all: lang === 'en' ? 'All' : 'الكل',
    products: lang === 'en' ? 'Products' : 'منتجات',
    services: lang === 'en' ? 'Services' : 'خدمات',
    inStock: lang === 'en' ? 'In stock' : 'متوفر',
    outOfStock: lang === 'en' ? 'Out of stock' : 'غير متوفر',
    searchByName: lang === 'en' ? '🔍 Search by name' : '🔍 بحث بالاسم',
    searchBySku: lang === 'en' ? '🔍 Search by SKU' : '🔍 بحث بالرمز',
  }

  // Optimized search function
  const filteredProducts = useMemo(() => {
    let result = products

    // Apply type filter
    if (typeFilter !== 'all') {
      result = result.filter(p => p.item_type === typeFilter)
    }

    // Apply search
    const query = searchQuery.trim()
    if (!query) return result

    const lowerQuery = query.toLowerCase()
    
    return result.filter((product) => {
      const nameMatch = String(product.name || "").toLowerCase().includes(lowerQuery)
      const skuMatch = String(product.sku || "").toLowerCase().includes(lowerQuery)
      return nameMatch || skuMatch
    })
  }, [products, searchQuery, typeFilter])

  // Reset search when dropdown closes
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setSearchQuery("")
    }
  }, [])

  // Get selected product for display
  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === value)
  }, [products, value])

  // Detect search type
  const searchType = useMemo(() => {
    const query = searchQuery.trim()
    if (!query) return null
    // If all alphanumeric/dash (typical SKU format)
    if (/^[A-Za-z0-9\-_]+$/.test(query) && /[A-Z]/i.test(query) && /\d/.test(query)) {
      return 'sku'
    }
    return 'name'
  }, [searchQuery])

  return (
    <Select value={value || '__none__'} onValueChange={(v) => onValueChange(v === '__none__' ? '' : v)} disabled={disabled} onOpenChange={handleOpenChange}>
      <SelectTrigger className={`w-full ${className}`}>
        <SelectValue placeholder={placeholder || labels.placeholder}>
          {selectedProduct ? (
            <span className="flex items-center gap-1">
              {selectedProduct.item_type === 'service' ? '🔧' : '📦'}
              {selectedProduct.name}
            </span>
          ) : (placeholder || labels.placeholder)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-[350px]">
        <div
          className="p-2 sticky top-0 bg-white dark:bg-slate-950 z-10 space-y-2"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search Input */}
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchPlaceholder || labels.searchPlaceholder}
            className="text-sm"
            autoComplete="off"
            onKeyDown={(e) => e.stopPropagation()}
          />

          {/* Type Filter Buttons */}
          <div className="flex gap-1">
            {(['all', 'product', 'service'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setTypeFilter(type)
                }}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  typeFilter === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700'
                }`}
              >
                {type === 'all' ? labels.all : type === 'product' ? `📦 ${labels.products}` : `🔧 ${labels.services}`}
              </button>
            ))}
          </div>

          {/* Search type indicator */}
          {searchType && (
            <div className="text-xs text-gray-400 px-1">
              {searchType === 'sku' ? labels.searchBySku : labels.searchByName}
            </div>
          )}
        </div>
        
        <div className="max-h-[300px] overflow-y-auto">
          <SelectItem value="__none__" className="text-gray-400">
            {placeholder || labels.placeholder}
          </SelectItem>
          {filteredProducts.length === 0 ? (
            <div className="p-3 text-center text-gray-500 text-sm">
              {labels.noResults}
            </div>
          ) : (
            filteredProducts.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                <div className="flex flex-col w-full">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium flex items-center gap-1">
                      {product.item_type === 'service' ? '🔧' : '📦'}
                      {product.name}
                    </span>
                    {showPrice && product.unit_price !== undefined && (
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold">
                        {product.unit_price.toLocaleString()} {currency}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 mt-0.5">
                    {product.sku && <span className="font-mono">{product.sku}</span>}
                    {showStock && product.item_type !== 'service' && product.quantity_on_hand !== undefined && (
                      <span className={product.quantity_on_hand > 0 ? 'text-green-600' : 'text-red-500'}>
                        {product.quantity_on_hand > 0 ? `${labels.inStock}: ${product.quantity_on_hand}` : labels.outOfStock}
                      </span>
                    )}
                  </div>
                </div>
              </SelectItem>
            ))
          )}
        </div>
      </SelectContent>
    </Select>
  )
}


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
  /** v3.74.497: صور الصنف — تُعرض أول صورة كمصغرة في القائمة */
  image_urls?: string[] | null
}

/** v3.74.497: مصغرة الصنف — صورة أولى إن وجدت، وإلا أيقونة النوع */
function ProductThumb({ product, size = 24 }: { product: ProductOption; size?: number }) {
  const firstImage = product.image_urls?.[0]
  if (firstImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={firstImage}
        alt={product.name}
        width={size}
        height={size}
        loading="lazy"
        className="rounded object-cover flex-shrink-0 border border-gray-200 dark:border-slate-700"
        style={{ width: size, height: size }}
      />
    )
  }
  return <span className="flex-shrink-0">{product.item_type === 'service' ? '🔧' : '📦'}</span>
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
  productsOnly?: boolean  // Hide services, show only products (for purchase pages)
  /**
   * 🔐 Branch-specific stock quantities
   * Map of product_id -> available quantity in the selected branch's warehouses
   * If provided, this overrides quantity_on_hand for stock display
   */
  branchStockMap?: Record<string, number>
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
  productsOnly = false,
  branchStockMap,
}: ProductSearchSelectProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<'all' | 'product' | 'service'>(productsOnly ? 'product' : 'all')

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

    // If productsOnly, always filter out services
    if (productsOnly) {
      result = result.filter(p => p.item_type !== 'service')
    } else if (typeFilter !== 'all') {
      // Apply type filter only if not productsOnly
      result = result.filter(p => p.item_type === typeFilter)
    }

    // Apply search
    const query = String(searchQuery || "").trim()
    if (!query) return result

    const lowerQuery = String(query).toLowerCase()

    return result.filter((product) => {
      try {
        const productName = String(product?.name || "").toLowerCase()
        const productSku = product?.sku ? String(product.sku).toLowerCase() : ""
        return productName.includes(lowerQuery) || productSku.includes(lowerQuery)
      } catch (err) {
        console.error("Error filtering product:", err, product)
        return false
      }
    })
  }, [products, searchQuery, typeFilter, productsOnly])

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
            <span className="flex items-center gap-1.5">
              <ProductThumb product={selectedProduct} size={20} />
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
          {/* Type Filter Buttons - Hide if productsOnly */}
          {!productsOnly && (
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
          )}

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
                    <span className="font-medium flex items-center gap-1.5">
                      <ProductThumb product={product} size={28} />
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
                    {showStock && product.item_type !== 'service' && (() => {
                      // 🔐 Use branch-specific stock if available, otherwise fall back to quantity_on_hand
                      const stockQty = branchStockMap !== undefined
                        ? (branchStockMap[product.id] ?? 0)
                        : product.quantity_on_hand

                      if (stockQty === undefined) return null

                      return (
                        <span className={stockQty > 0 ? 'text-green-600' : 'text-red-500'}>
                          {stockQty > 0 ? `${labels.inStock}: ${stockQty}` : labels.outOfStock}
                        </span>
                      )
                    })()}
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


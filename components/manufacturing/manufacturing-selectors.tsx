"use client"

/**
 * ManufacturingProductSelector
 * Reusable combobox for selecting products in manufacturing forms.
 * Fetches from /api/products-list and optionally filters by product_type.
 */

import { useEffect, useState, useCallback, useRef } from "react"
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type ProductType = "manufactured" | "raw_material" | "any"

interface ProductOption {
  id: string
  sku?: string | null
  name?: string | null
  product_type?: string | null
}

interface ManufacturingProductSelectorProps {
  /** Currently selected product ID (UUID) */
  value: string
  /** Called with new product ID when selection changes */
  onChange: (productId: string, product: ProductOption | null) => void
  /** Filter by product_type. "manufactured" | "raw_material" | "any" */
  productType?: ProductType
  /** Placeholder text in the trigger button */
  placeholder?: string
  /** Label for the "no options" state */
  emptyLabel?: string
  /** Whether the selector is disabled */
  disabled?: boolean
  /** Optional branch_id to scope the product list */
  branchId?: string | null
}

function buildLabel(p: ProductOption): string {
  const sku = p.sku ? `[${p.sku}] ` : ""
  return `${sku}${p.name || p.id}`
}

export function ManufacturingProductSelector({
  value,
  onChange,
  productType = "any",
  placeholder = "اختر منتجاً...",
  emptyLabel = "لا توجد نتائج",
  disabled = false,
  branchId,
}: ManufacturingProductSelectorProps) {
  const [open, setOpen] = useState(false)
  const [products, setProducts] = useState<ProductOption[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const fetchedRef = useRef(false)

  const loadProducts = useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (productType !== "any") params.set("product_type", productType)
      if (branchId) params.set("branch_id", branchId)
      params.set("limit", "200")

      const response = await fetch(`/api/products-list?${params.toString()}`)
      if (!response.ok) throw new Error("Failed to load products")
      const data = await response.json()
      // Support both {data: [...]} and [...] shapes
      const items: ProductOption[] = Array.isArray(data) ? data : (data?.data ?? [])
      setProducts(items)
    } catch {
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [productType, branchId, loading])

  // Load on first open
  useEffect(() => {
    if (open && !fetchedRef.current) {
      fetchedRef.current = true
      loadProducts()
    }
  }, [open, loadProducts])

  // Reload when branchId changes
  useEffect(() => {
    fetchedRef.current = false
  }, [branchId])

  const selectedProduct = products.find((p) => p.id === value) ?? null

  const filtered = products.filter((p) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      p.name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    )
  })

  const triggerLabel = value
    ? selectedProduct
      ? buildLabel(selectedProduct)
      : value.slice(0, 8) + "…" // UUID fallback if not loaded yet
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal text-start",
            !value && "text-muted-foreground"
          )}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[340px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder="ابحث بالاسم أو الكود..."
              value={search}
              onValueChange={setSearch}
              className="border-0 focus:ring-0"
            />
          </div>

          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                جاري التحميل...
              </div>
            ) : filtered.length === 0 ? (
              <CommandEmpty>{emptyLabel}</CommandEmpty>
            ) : (
              <CommandGroup>
                {filtered.map((product) => (
                  <CommandItem
                    key={product.id}
                    value={product.id}
                    onSelect={() => {
                      const newVal = product.id === value ? "" : product.id
                      onChange(newVal, newVal ? product : null)
                      setOpen(false)
                      setSearch("")
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        value === product.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-sm truncate">{product.name || "—"}</span>
                      {product.sku && (
                        <span className="text-xs text-muted-foreground">{product.sku}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ─────────────────────────────────────────────────────────────────
// BOM Selector — loads BOMs for a given product
// ─────────────────────────────────────────────────────────────────
interface BomOption {
  id: string
  bom_code?: string | null
  bom_name?: string | null
}

interface BomSelectorProps {
  value: string
  onChange: (bomId: string, bom: BomOption | null) => void
  productId?: string
  placeholder?: string
  disabled?: boolean
}

export function BomSelector({
  value,
  onChange,
  productId,
  placeholder = "اختر قائمة المواد...",
  disabled = false,
}: BomSelectorProps) {
  const [open, setOpen] = useState(false)
  const [boms, setBoms] = useState<BomOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setBoms([])
    if (!productId) return
    setLoading(true)

    const params = new URLSearchParams()
    params.set("product_id", productId)
    params.set("is_active", "true")

    fetch(`/api/manufacturing/boms?${params}`)
      .then((r) => r.json())
      .then((data) => {
        const items: BomOption[] = Array.isArray(data?.data) ? data.data : []
        setBoms(items)
      })
      .catch(() => setBoms([]))
      .finally(() => setLoading(false))
  }, [productId])

  const selected = boms.find((b) => b.id === value) ?? null
  const triggerLabel = value
    ? selected
      ? `${selected.bom_code || ""} ${selected.bom_name || ""}`.trim() || value.slice(0, 8)
      : value.slice(0, 8) + "…"
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled || (!productId && !value)}
          className={cn("w-full justify-between font-normal text-start", !value && "text-muted-foreground")}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                جاري التحميل...
              </div>
            ) : boms.length === 0 ? (
              <div className="py-4 px-3 text-sm text-center text-muted-foreground">
                {productId ? "لا توجد قوائم مواد لهذا المنتج" : "اختر المنتج أولاً"}
              </div>
            ) : (
              <CommandGroup>
                {boms.map((bom) => (
                  <CommandItem
                    key={bom.id}
                    value={bom.id}
                    onSelect={() => {
                      const newVal = bom.id === value ? "" : bom.id
                      onChange(newVal, newVal ? bom : null)
                      setOpen(false)
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === bom.id ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{bom.bom_name || bom.bom_code || bom.id}</span>
                      {bom.bom_code && <span className="text-xs text-muted-foreground">{bom.bom_code}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ─────────────────────────────────────────────────────────────────
// BOM Version Selector
// ─────────────────────────────────────────────────────────────────
interface BomVersionOption {
  id: string
  version_no?: number | null
  status?: string | null
  is_default?: boolean | null
}

interface BomVersionSelectorProps {
  value: string
  onChange: (versionId: string, version: BomVersionOption | null) => void
  bomId?: string
  placeholder?: string
  disabled?: boolean
}

export function BomVersionSelector({
  value,
  onChange,
  bomId,
  placeholder = "اختر إصدار قائمة المواد...",
  disabled = false,
}: BomVersionSelectorProps) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<BomVersionOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setVersions([])
    if (!bomId) return
    setLoading(true)
    fetch(`/api/manufacturing/boms/${bomId}`)
      .then((r) => r.json())
      .then((data) => {
        const v: BomVersionOption[] = Array.isArray(data?.data?.versions) ? data.data.versions : []
        setVersions(v)
        // Auto-select default version
        const def = v.find((x) => x.is_default && x.status === "approved")
        if (def && !value) onChange(def.id, def)
      })
      .catch(() => setVersions([]))
      .finally(() => setLoading(false))
  }, [bomId])

  const selected = versions.find((v) => v.id === value) ?? null
  const triggerLabel = value
    ? selected
      ? `إصدار ${selected.version_no ?? ""} — ${selected.status ?? ""}${selected.is_default ? " ★" : ""}`
      : value.slice(0, 8) + "…"
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled || (!bomId && !value)}
          className={cn("w-full justify-between font-normal text-start", !value && "text-muted-foreground")}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandList>
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : versions.length === 0 ? (
              <div className="py-4 px-3 text-sm text-center text-muted-foreground">
                {bomId ? "لا توجد إصدارات لهذه القائمة" : "اختر قائمة المواد أولاً"}
              </div>
            ) : (
              <CommandGroup>
                {versions.map((v) => (
                  <CommandItem key={v.id} value={v.id} onSelect={() => { onChange(v.id === value ? "" : v.id, v); setOpen(false) }}>
                    <Check className={cn("mr-2 h-4 w-4", value === v.id ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">
                        إصدار {v.version_no ?? "—"} {v.is_default ? "★" : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">{v.status}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ─────────────────────────────────────────────────────────────────
// Routing Selector
// ─────────────────────────────────────────────────────────────────
interface RoutingOption {
  id: string
  routing_code?: string | null
  routing_name?: string | null
}

interface RoutingSelectorProps {
  value: string
  onChange: (routingId: string, routing: RoutingOption | null) => void
  productId?: string
  placeholder?: string
  disabled?: boolean
}

export function RoutingSelector({
  value,
  onChange,
  productId,
  placeholder = "اختر مسار التصنيع...",
  disabled = false,
}: RoutingSelectorProps) {
  const [open, setOpen] = useState(false)
  const [routings, setRoutings] = useState<RoutingOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setRoutings([])
    if (!productId) return
    setLoading(true)
    const params = new URLSearchParams({ product_id: productId, is_active: "true" })
    fetch(`/api/manufacturing/routings?${params}`)
      .then((r) => r.json())
      .then((data) => setRoutings(Array.isArray(data?.data) ? data.data : []))
      .catch(() => setRoutings([]))
      .finally(() => setLoading(false))
  }, [productId])

  const selected = routings.find((r) => r.id === value) ?? null
  const triggerLabel = value
    ? selected ? `${selected.routing_code || ""} ${selected.routing_name || ""}`.trim() : value.slice(0, 8) + "…"
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled || (!productId && !value)}
          className={cn("w-full justify-between font-normal text-start", !value && "text-muted-foreground")}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandList>
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : routings.length === 0 ? (
              <div className="py-4 px-3 text-sm text-center text-muted-foreground">
                {productId ? "لا توجد مسارات لهذا المنتج" : "اختر المنتج أولاً"}
              </div>
            ) : (
              <CommandGroup>
                {routings.map((r) => (
                  <CommandItem key={r.id} value={r.id} onSelect={() => { onChange(r.id === value ? "" : r.id, r); setOpen(false) }}>
                    <Check className={cn("mr-2 h-4 w-4", value === r.id ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{r.routing_name || r.routing_code || r.id}</span>
                      {r.routing_code && <span className="text-xs text-muted-foreground">{r.routing_code}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ─────────────────────────────────────────────────────────────────
// Routing Version Selector
// ─────────────────────────────────────────────────────────────────
interface RoutingVersionOption {
  id: string
  version_no?: number | null
  status?: string | null
}

interface RoutingVersionSelectorProps {
  value: string
  onChange: (versionId: string, version: RoutingVersionOption | null) => void
  routingId?: string
  placeholder?: string
  disabled?: boolean
}

export function RoutingVersionSelector({
  value,
  onChange,
  routingId,
  placeholder = "اختر إصدار مسار التصنيع...",
  disabled = false,
}: RoutingVersionSelectorProps) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<RoutingVersionOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setVersions([])
    if (!routingId) return
    setLoading(true)
    fetch(`/api/manufacturing/routings/${routingId}`)
      .then((r) => r.json())
      .then((data) => {
        const v: RoutingVersionOption[] = Array.isArray(data?.data?.versions) ? data.data.versions : []
        setVersions(v)
        const approved = v.find((x) => x.status === "approved")
        if (approved && !value) onChange(approved.id, approved)
      })
      .catch(() => setVersions([]))
      .finally(() => setLoading(false))
  }, [routingId])

  const selected = versions.find((v) => v.id === value) ?? null
  const triggerLabel = value
    ? selected ? `إصدار ${selected.version_no ?? ""} — ${selected.status ?? ""}` : value.slice(0, 8) + "…"
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled || (!routingId && !value)}
          className={cn("w-full justify-between font-normal text-start", !value && "text-muted-foreground")}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandList>
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : versions.length === 0 ? (
              <div className="py-4 px-3 text-sm text-center text-muted-foreground">
                {routingId ? "لا توجد إصدارات لهذا المسار" : "اختر المسار أولاً"}
              </div>
            ) : (
              <CommandGroup>
                {versions.map((v) => (
                  <CommandItem key={v.id} value={v.id} onSelect={() => { onChange(v.id === value ? "" : v.id, v); setOpen(false) }}>
                    <Check className={cn("mr-2 h-4 w-4", value === v.id ? "opacity-100" : "opacity-0")} />
                    <span className="text-sm">إصدار {v.version_no ?? "—"} — {v.status}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ─────────────────────────────────────────────────────────────────
// Warehouse Selector (generic)
// ─────────────────────────────────────────────────────────────────
interface WarehouseOption {
  id: string
  name?: string | null
  code?: string | null
}

interface WarehouseSelectorProps {
  value: string
  onChange: (warehouseId: string) => void
  placeholder?: string
  disabled?: boolean
  branchId?: string | null
}

export function WarehouseSelector({
  value,
  onChange,
  placeholder = "اختر المستودع...",
  disabled = false,
  branchId,
}: WarehouseSelectorProps) {
  const [open, setOpen] = useState(false)
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [loading, setLoading] = useState(false)
  const fetchedRef = useRef(false)

  useEffect(() => { fetchedRef.current = false }, [branchId])

  const loadWarehouses = useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (branchId) params.set("branch_id", branchId)
      const r = await fetch(`/api/warehouses?${params}`)
      const data = await r.json()
      setWarehouses(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [])
    } catch {
      setWarehouses([])
    } finally {
      setLoading(false)
    }
  }, [branchId, loading])

  useEffect(() => {
    if (open && !fetchedRef.current) {
      fetchedRef.current = true
      loadWarehouses()
    }
  }, [open, loadWarehouses])

  const selected = warehouses.find((w) => w.id === value) ?? null
  const triggerLabel = value
    ? selected ? `${selected.code ? `[${selected.code}] ` : ""}${selected.name || value}` : value.slice(0, 8) + "…"
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn("w-full justify-between font-normal text-start", !value && "text-muted-foreground")}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandList>
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : warehouses.length === 0 ? (
              <div className="py-4 px-3 text-sm text-center text-muted-foreground">لا توجد مستودعات</div>
            ) : (
              <CommandGroup>
                {warehouses.map((w) => (
                  <CommandItem key={w.id} value={w.id} onSelect={() => { onChange(w.id === value ? "" : w.id); setOpen(false) }}>
                    <Check className={cn("mr-2 h-4 w-4", value === w.id ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{w.name || w.id}</span>
                      {w.code && <span className="text-xs text-muted-foreground">{w.code}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

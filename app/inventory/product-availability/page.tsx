"use client"

import { useState, useEffect, useCallback } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { ProductSearchSelect, type ProductOption } from "@/components/ProductSearchSelect"
import { Search, Package, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { usePermissions } from "@/lib/permissions-context"
import { useRouter } from "next/navigation"
import { getActiveCompanyId } from "@/lib/company"

interface ProductAvailabilityResult {
  branch_id: string
  branch_name: string
  warehouse_id: string
  warehouse_name: string
  cost_center_id: string | null
  cost_center_name: string | null
  available_quantity: number
}

export default function ProductAvailabilityPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [hydrated, setHydrated] = useState(false)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [products, setProducts] = useState<ProductOption[]>([])
  const [selectedProductId, setSelectedProductId] = useState<string>("")
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null)
  const [availabilityData, setAvailabilityData] = useState<ProductAvailabilityResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)

  useEffect(() => {
    setHydrated(true)
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch { }
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  // جلب المنتجات - متاح لجميع الأعضاء في الشركة
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          console.error("Error getting user:", userError)
          return
        }

        // ✅ استخدام getActiveCompanyId للتعامل مع المستخدمين في عدة شركات
        // هذه الدالة تجلب الشركة النشطة من الكوكيز أو localStorage
        const activeCompanyId = await getActiveCompanyId(supabase)

        if (!activeCompanyId) {
          console.warn("No active company found for user")
          toast({
            variant: "destructive",
            title: appLang === 'en' ? "Error" : "خطأ",
            description: appLang === 'en' 
              ? "No active company found. Please select a company."
              : "لم يتم العثور على شركة نشطة. يرجى اختيار شركة."
          })
          return
        }

        setCompanyId(activeCompanyId)

        // 📋 جلب جميع المنتجات في الشركة - بدون فلترة بناءً على الفرع أو الصلاحيات
        // الهدف: تمكين جميع الأعضاء من البحث عن توفر المنتج في جميع الفروع
        const { data: productsData, error: productsError } = await supabase
          .from("products")
          .select("id, name, sku, item_type, unit_price")
          .eq("company_id", activeCompanyId)
          .eq("is_active", true)
          .order("name")

        if (productsError) {
          console.error("Error loading products:", productsError)
          toast({
            variant: "destructive",
            title: appLang === 'en' ? "Error" : "خطأ",
            description: appLang === 'en' 
              ? "Failed to load products"
              : "فشل تحميل المنتجات"
          })
          return
        }

        console.log(`✅ Loaded ${productsData?.length || 0} products for company ${activeCompanyId}`)

        setProducts(
          (productsData || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            item_type: p.item_type || 'product',
            unit_price: p.unit_price || 0
          }))
        )
      } catch (error) {
        console.error("Error in loadProducts:", error)
        toast({
          variant: "destructive",
          title: appLang === 'en' ? "Error" : "خطأ",
          description: appLang === 'en' 
            ? "Failed to load products"
            : "فشل تحميل المنتجات"
        })
      }
    }

    loadProducts()
  }, [supabase, toast, appLang])

  // البحث عن توفر المنتج
  const searchAvailability = useCallback(async () => {
    if (!selectedProductId || !companyId) {
      toast({
        variant: "destructive",
        title: appLang === 'en' ? "Missing Information" : "بيانات ناقصة",
        description: appLang === 'en' 
          ? "Please select a product first"
          : "يرجى اختيار منتج أولاً"
      })
      return
    }

    setIsSearching(true)
    setAvailabilityData([])

    try {
      const response = await fetch(
        `/api/inventory/product-availability?product_id=${selectedProductId}&company_id=${companyId}`
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error_ar || errorData.error || "Failed to fetch availability")
      }

      const result = await response.json()
      setAvailabilityData(result.data || [])

      if (result.data && result.data.length === 0) {
        toast({
          variant: "default",
          title: appLang === 'en' ? "No Results" : "لا توجد نتائج",
          description: appLang === 'en'
            ? "No inventory found for this product in any branch"
            : "لم يتم العثور على مخزون لهذا المنتج في أي فرع"
        })
      }
    } catch (error: any) {
      console.error("Error searching availability:", error)
      toast({
        variant: "destructive",
        title: appLang === 'en' ? "Error" : "خطأ",
        description: error.message || (appLang === 'en' ? "Failed to search availability" : "فشل البحث عن التوفر")
      })
    } finally {
      setIsSearching(false)
    }
  }, [selectedProductId, companyId, toast, appLang])

  // عند تغيير المنتج المحدد
  useEffect(() => {
    if (selectedProductId) {
      const product = products.find(p => p.id === selectedProductId)
      setSelectedProduct(product || null)
    } else {
      setSelectedProduct(null)
      setAvailabilityData([])
    }
  }, [selectedProductId, products])

  const isAr = appLang === 'ar'

  // منع hydration mismatch - عرض محتوى افتراضي حتى يتم hydration
  if (!hydrated) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* Header - رأس الصفحة */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <Search className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                    {isAr ? "البحث في مخزون الفروع" : "Branch Inventory Search"}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                    {isAr 
                      ? "ابحث عن توفر المنتجات في جميع الفروع والمخازن (للاطلاع فقط)"
                      : "Search for product availability across all branches and warehouses (Read-only)"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                {isAr ? "بحث عن منتج" : "Search for Product"}
              </CardTitle>
              <CardDescription>
                {isAr
                  ? "اختر منتجاً للبحث عن توفر المخزون في جميع الفروع والمخازن"
                  : "Select a product to search for inventory availability across all branches and warehouses"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{isAr ? "المنتج" : "Product"}</Label>
              <ProductSearchSelect
                products={products}
                value={selectedProductId}
                onValueChange={setSelectedProductId}
                placeholder={isAr ? "اختر منتجاً..." : "Select a product..."}
                searchPlaceholder={isAr ? "ابحث بالاسم أو الرمز..." : "Search by name or SKU..."}
                lang={appLang}
                productsOnly={true}
              />
            </div>

            {selectedProduct && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Package className="h-4 w-4" />
                <span className="font-medium">{selectedProduct.name}</span>
                {selectedProduct.sku && (
                  <Badge variant="outline" className="ml-2">
                    {isAr ? "الرمز:" : "SKU:"} {selectedProduct.sku}
                  </Badge>
                )}
              </div>
            )}

            <Button
              onClick={searchAvailability}
              disabled={!selectedProductId || isSearching}
              className="w-full"
            >
              {isSearching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isAr ? "جاري البحث..." : "Searching..."}
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  {isAr ? "بحث عن التوفر" : "Search Availability"}
                </>
              )}
            </Button>
            </CardContent>
          </Card>

          {availabilityData.length > 0 && (
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  {isAr ? "نتائج البحث" : "Search Results"}
                </CardTitle>
                <CardDescription>
                  {isAr
                    ? `تم العثور على ${availabilityData.length} ${isAr ? "مخزن" : "warehouse"} يحتوي على هذا المنتج`
                    : `Found ${availabilityData.length} ${isAr ? "مخزن" : "warehouse(s)"} containing this product`}
                </CardDescription>
              </CardHeader>
              <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={isAr ? "text-right" : "text-left"}>
                        {isAr ? "الفرع" : "Branch"}
                      </TableHead>
                      <TableHead className={isAr ? "text-right" : "text-left"}>
                        {isAr ? "المخزن" : "Warehouse"}
                      </TableHead>
                      <TableHead className={isAr ? "text-right" : "text-left"}>
                        {isAr ? "مركز التكلفة" : "Cost Center"}
                      </TableHead>
                      <TableHead className={isAr ? "text-right" : "text-left"}>
                        {isAr ? "الكمية المتاحة" : "Available Quantity"}
                      </TableHead>
                      <TableHead className={isAr ? "text-right" : "text-left"}>
                        {isAr ? "الحالة" : "Status"}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {availabilityData.map((item, index) => {
                      const hasStock = item.available_quantity > 0
                      return (
                        <TableRow key={`${item.branch_id}-${item.warehouse_id}-${index}`}>
                          <TableCell className={isAr ? "text-right" : "text-left"}>
                            <div className="font-medium">{item.branch_name}</div>
                          </TableCell>
                          <TableCell className={isAr ? "text-right" : "text-left"}>
                            <div>{item.warehouse_name}</div>
                          </TableCell>
                          <TableCell className={isAr ? "text-right" : "text-left"}>
                            <div className="text-sm text-muted-foreground">
                              {item.cost_center_name || (isAr ? "غير محدد" : "Not specified")}
                            </div>
                          </TableCell>
                          <TableCell className={isAr ? "text-right" : "text-left"}>
                            <div className={`font-semibold ${hasStock ? "text-green-600 dark:text-green-400" : "text-gray-500"}`}>
                              {item.available_quantity.toLocaleString()}
                            </div>
                          </TableCell>
                          <TableCell className={isAr ? "text-right" : "text-left"}>
                            {hasStock ? (
                              <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                {isAr ? "متوفر" : "Available"}
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <AlertCircle className="mr-1 h-3 w-3" />
                                {isAr ? "غير متوفر" : "Out of Stock"}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* ملخص سريع */}
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {isAr ? "إجمالي الكمية المتاحة:" : "Total Available Quantity:"}
                    </p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {availabilityData.reduce((sum, item) => sum + item.available_quantity, 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {isAr ? "عدد المخازن المتوفرة:" : "Available Warehouses:"}
                    </p>
                    <p className="text-2xl font-bold">
                      {availabilityData.filter(item => item.available_quantity > 0).length}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

          {availabilityData.length === 0 && !isSearching && selectedProductId && (
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
              <CardContent className="py-8 text-center">
                <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {isAr
                    ? "لم يتم العثور على مخزون لهذا المنتج في أي فرع"
                    : "No inventory found for this product in any branch"}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}

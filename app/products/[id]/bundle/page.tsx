"use client"

import { useEffect, useState } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ERPPageHeader } from "@/components/erp-page-header"
import { Button } from "@/components/ui/button"
import { LoadingState } from "@/components/ui/loading-state"
import { BundleItemsManager } from "@/components/products/BundleItemsManager"
import { useToast } from "@/hooks/use-toast"
import { toastActionError } from "@/lib/notifications"
import { ArrowLeft } from "lucide-react"

interface SimpleProduct {
  id: string
  name: string
  sku?: string
  item_type?: string
}

export default function ProductBundlePage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const appLang = searchParams.get("lang") === "en" ? "en" : "ar"
  const isAr = appLang !== "en"
  const t = (ar: string, en: string) => (isAr ? ar : en)
  const q = appLang === "en" ? "?lang=en" : ""

  const { toast } = useToast()
  const [product, setProduct] = useState<SimpleProduct | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/products?limit=500`, { cache: "no-store" })
        const json = await res.json()
        const match = (json?.products ?? []).find((p: any) => p.id === id)
        if (!match) {
          toastActionError(toast, t("غير موجود", "Not found"), t("المنتج غير موجود", "Product not found"))
          router.push(`/products${q}`)
          return
        }
        setProduct(match)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <LoadingState message={t("جاري التحميل...", "Loading…")} />
        </main>
      </div>
    )
  }

  if (!product) return null

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <ERPPageHeader
          title={t(`الأصناف المرفقة: ${product.name}`, `Bundle Items: ${product.name}`)}
          description={product.sku}
          variant="form"
          backHref={`/products${q}`}
          actions={
            <Link href={`/products${q}`} prefetch={false}>
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                {t("العودة للمنتجات", "Back to Products")}
              </Button>
            </Link>
          }
        />

        <div className="mt-6 max-w-5xl mx-auto">
          <BundleItemsManager productId={product.id} parentName={product.name} lang={appLang} />
        </div>
      </main>
    </div>
  )
}

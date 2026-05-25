/**
 * Custom 404 Not Found Page (permission-aware)
 * v3.48.2 — force Turbopack rebuild after build-cache miss
 * صفحة 404 مُخَصَّصة تَحترم صلاحيات الأدوار
 *
 * v3.48.1 — UI Phase 1 Step 9
 *
 * Suggested links are filtered via useAccess().canAccessPage() so a user
 * never sees a link to a page their role is not allowed to open.
 */

"use client"

import * as React from "react"
import Link from "next/link"
import { Home, Search, ArrowRight, ArrowLeft } from "lucide-react"
import { useAccess } from "@/lib/access-context"

interface Suggestion {
  href: string
  labelAr: string
  labelEn: string
  /** Resource key in allowed_pages; null = always visible. */
  resource: string | null
}

const ALL_SUGGESTIONS: Suggestion[] = [
  { href: "/invoices",  labelAr: "الفواتير",    labelEn: "Invoices",   resource: "invoices" },
  { href: "/customers", labelAr: "العملاء",     labelEn: "Customers",  resource: "customers" },
  { href: "/reports",   labelAr: "التقارير",    labelEn: "Reports",    resource: "reports" },
  { href: "/settings",  labelAr: "الإعدادات",   labelEn: "Settings",   resource: "settings" },
]

export default function NotFound() {
  const { canAccessPage, isReady, profile } = useAccess()

  // Filter suggestions by role permissions
  const visibleSuggestions = React.useMemo(() => {
    if (!isReady || !profile) return ALL_SUGGESTIONS  // fail-open while loading
    if (profile.is_owner || profile.is_admin) return ALL_SUGGESTIONS
    return ALL_SUGGESTIONS.filter((s) => s.resource === null || canAccessPage(s.resource))
  }, [isReady, profile, canAccessPage])

  // Decide where the "Home" button should land — first allowed page
  const homeHref = React.useMemo(() => {
    if (!isReady || !profile) return "/dashboard"
    if (profile.is_owner || profile.is_admin) return "/dashboard"
    // canAccessPage('dashboard') usually true; otherwise fall back to first allowed page
    if (canAccessPage("dashboard")) return "/dashboard"
    if (profile.allowed_pages?.[0]) {
      // Best-effort: rewrite resource → route
      const first = profile.allowed_pages[0]
      const map: Record<string, string> = {
        invoices: "/invoices",
        customers: "/customers",
        reports: "/reports",
        products: "/products",
        inventory: "/inventory",
        bills: "/bills",
        suppliers: "/suppliers",
      }
      return map[first] || "/dashboard"
    }
    return "/dashboard"
  }, [isReady, profile, canAccessPage])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      <div className="max-w-lg w-full text-center">
        {/* Big 404 with gradient */}
        <div className="relative mb-8">
          <h1
            className="text-[120px] sm:text-[160px] font-extrabold leading-none bg-gradient-to-br from-primary via-info to-info bg-clip-text text-transparent select-none"
            aria-hidden="true"
          >
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-info/10 blur-3xl" aria-hidden="true" />
          </div>
        </div>

        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3" dir="rtl" lang="ar">
          الصفحة غير مَوجودة
        </h2>

        <p className="text-lg sm:text-xl font-semibold text-muted-foreground mb-4" dir="ltr" lang="en">
          Page Not Found
        </p>

        <p className="text-sm sm:text-base text-muted-foreground mb-2 leading-relaxed" dir="rtl" lang="ar">
          الرابط الذى تَبحث عنه غير صحيح أو تَم نَقل الصفحة، أَو لا تَملك صلاحية للوصول إليها.
        </p>
        <p className="text-sm text-muted-foreground/80 mb-8 leading-relaxed" dir="ltr" lang="en">
          This page does not exist, has been moved, or you lack permission to access it.
        </p>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mb-10">
          <Link
            href={homeHref}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity tap-target shadow-sm"
          >
            <Home className="w-5 h-5" aria-hidden="true" />
            <span>الصفحة الرَئيسية</span>
          </Link>

          <Link
            href={homeHref}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent transition-colors tap-target"
            aria-label="Go home"
          >
            <span dir="ltr" lang="en">Go Home</span>
            <ArrowLeft className="w-4 h-4 rtl:hidden" aria-hidden="true" />
            <ArrowRight className="w-4 h-4 ltr:hidden hidden rtl:inline" aria-hidden="true" />
          </Link>
        </div>

        {/* Helpful suggestions (permission-filtered) */}
        {visibleSuggestions.length > 0 && (
          <div className="bg-card border border-border rounded-lg p-4 sm:p-5 text-start" dir="rtl" lang="ar">
            <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Search className="w-4 h-4 text-info" />
              هل تَبحث عن...؟
            </p>
            <ul className="space-y-2 text-sm">
              {visibleSuggestions.map((s) => (
                <li key={s.href}>
                  <Link href={s.href} className="text-info hover:underline">
                    ← {s.labelAr}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mt-4">
              💡 يُمكنك أيضاً الضَغط على <kbd className="text-code">Ctrl + K</kbd> للبحث السريع
            </p>
          </div>
        )}

        <p className="mt-8 text-xs text-muted-foreground">
          7esab.com — Enterprise Resource Planning
        </p>
      </div>
    </div>
  )
}

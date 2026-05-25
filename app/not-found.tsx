/**
 * Custom 404 Not Found Page
 * صفحة 404 مُخَصَّصة لـ 7esab.com
 *
 * v3.48.0 — UI Phase 1 Step 9
 *
 * Replaces Next.js default 404 with a branded, bilingual page.
 * Server-rendered (no client state needed for static content).
 */

import Link from "next/link"
import { Home, Search, ArrowRight, ArrowLeft } from "lucide-react"

export default function NotFound() {
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

        {/* Arabic title — always visible (app is RTL-first) */}
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3" dir="rtl" lang="ar">
          الصفحة غير مَوجودة
        </h2>

        {/* English subtitle */}
        <p className="text-lg sm:text-xl font-semibold text-muted-foreground mb-4" dir="ltr" lang="en">
          Page Not Found
        </p>

        {/* Description — bilingual */}
        <p className="text-sm sm:text-base text-muted-foreground mb-2 leading-relaxed" dir="rtl" lang="ar">
          الرابط الذى تَبحث عنه غير صحيح أو تَم نَقل الصفحة. تأكد من العُنوان أو عُد للصفحة الرَئيسية.
        </p>
        <p className="text-sm text-muted-foreground/80 mb-8 leading-relaxed" dir="ltr" lang="en">
          The page you are looking for does not exist or has been moved.
        </p>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mb-10">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity tap-target shadow-sm"
          >
            <Home className="w-5 h-5" aria-hidden="true" />
            <span>لوحة التحكم</span>
          </Link>

          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-border bg-card text-foreground font-medium hover:bg-accent transition-colors tap-target"
            aria-label="Go to dashboard"
          >
            <span dir="ltr" lang="en">Go Home</span>
            <ArrowLeft className="w-4 h-4 rtl:hidden" aria-hidden="true" />
            <ArrowRight className="w-4 h-4 ltr:hidden hidden rtl:inline" aria-hidden="true" />
          </Link>
        </div>

        {/* Helpful suggestions */}
        <div className="bg-card border border-border rounded-lg p-4 sm:p-5 text-start" dir="rtl" lang="ar">
          <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Search className="w-4 h-4 text-info" />
            هل تَبحث عن...؟
          </p>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/invoices" className="text-info hover:underline">
                ← الفواتير
              </Link>
            </li>
            <li>
              <Link href="/customers" className="text-info hover:underline">
                ← العملاء
              </Link>
            </li>
            <li>
              <Link href="/reports" className="text-info hover:underline">
                ← التقارير
              </Link>
            </li>
            <li>
              <Link href="/settings" className="text-info hover:underline">
                ← الإعدادات
              </Link>
            </li>
          </ul>
          <p className="text-xs text-muted-foreground mt-4">
            💡 يُمكنك أيضاً الضَغط على <kbd className="text-code">Ctrl + K</kbd> للبحث السريع
          </p>
        </div>

        {/* Footer */}
        <p className="mt-8 text-xs text-muted-foreground">
          7esab.com — Enterprise Resource Planning
        </p>
      </div>
    </div>
  )
}

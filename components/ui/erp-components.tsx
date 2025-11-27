// مكونات ERP الموحدة
// هذا الملف يصدر جميع المكونات المشتركة للاستخدام السهل

export { PageHeader, PageHeaderActions } from "./page-header"
export { PageContainer, PageContent, PageAlert, StatsGrid } from "./page-container"
export { StatusBadge, getStatusColor, getStatusLabel } from "./status-badge"
export { DataTable } from "./data-table"
export { StatCard, MiniStat } from "./stat-card"

// Re-export shadcn components commonly used
export { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "./card"
export { Button } from "./button"
export { Input } from "./input"
export { Label } from "./label"
export { Badge } from "./badge"
export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger } from "./dialog"
export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"

// Utility function for language
export function useAppLang(): "ar" | "en" {
  if (typeof window === "undefined") return "ar"
  try {
    const docLang = document.documentElement?.lang
    if (docLang === "en") return "en"
    const fromCookie = document.cookie.split("; ").find((x) => x.startsWith("app_language="))?.split("=")[1]
    const v = fromCookie || localStorage.getItem("app_language") || "ar"
    return v === "en" ? "en" : "ar"
  } catch {
    return "ar"
  }
}

// Format number helper
export function formatNumber(num: number, currency?: string): string {
  const formatted = num.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return currency ? `${formatted} ${currency}` : formatted
}

// Format date helper
export function formatDate(date: string | Date, lang: "ar" | "en" = "ar"): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString(lang === "en" ? "en-US" : "ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}


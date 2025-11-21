"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  FileText,
  Package,
  ShoppingCart,
  Users,
  Building2,
  LogOut,
  Menu,
  X,
  DollarSign,
  BookOpen,
  Settings,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { getActiveCompanyId } from "@/lib/company"
import { useRouter } from "next/navigation"

function buildMenuItems(lang: string) {
  const ar = {
    dashboard: "لوحة التحكم",
    products: "المنتجات",
    inventory: "المخزون",
    customers: "العملاء",
    suppliers: "الموردين",
    purchaseOrders: "أوامر الشراء",
    invoices: "فواتير المبيعات",
    bills: "فواتير المشتريات",
    payments: "المدفوعات",
    journal: "القيود اليومية",
    banking: "الأعمال المصرفية",
    reports: "التقارير",
    coa: "الشجرة المحاسبية",
    shareholders: "المساهمون",
    taxes: "الضرائب",
    settings: "الإعدادات",
  }
  const en = {
    dashboard: "Dashboard",
    products: "Products",
    inventory: "Inventory",
    customers: "Customers",
    suppliers: "Suppliers",
    purchaseOrders: "Purchase Orders",
    invoices: "Sales Invoices",
    bills: "Purchase Bills",
    payments: "Payments",
    journal: "Journal Entries",
    banking: "Banking",
    reports: "Reports",
    coa: "Chart of Accounts",
    shareholders: "Shareholders",
    taxes: "Taxes",
    settings: "Settings",
  }
  const L = lang === "en" ? en : ar
  const q = lang === "en" ? "?lang=en" : ""
  return [
    { label: L.dashboard, href: `/dashboard${q}` , icon: BarChart3 },
    { label: L.products, href: `/products${q}`, icon: Package },
    { label: L.inventory, href: `/inventory${q}`, icon: DollarSign },
    { label: L.customers, href: `/customers${q}`, icon: Users },
    { label: L.suppliers, href: `/suppliers${q}`, icon: ShoppingCart },
    { label: L.purchaseOrders, href: `/purchase-orders${q}`, icon: ShoppingCart },
    { label: L.invoices, href: `/invoices${q}`, icon: FileText },
    { label: L.bills, href: `/bills${q}`, icon: FileText },
    { label: L.payments, href: `/payments${q}`, icon: DollarSign },
    { label: L.journal, href: `/journal-entries${q}`, icon: FileText },
    { label: L.banking, href: `/banking${q}`, icon: DollarSign },
    { label: L.reports, href: `/reports${q}`, icon: BarChart3 },
    { label: L.coa, href: `/chart-of-accounts${q}`, icon: BookOpen },
    { label: L.shareholders, href: `/shareholders${q}`, icon: Users },
    { label: L.taxes, href: `/settings/taxes${q}`, icon: Settings },
    { label: L.settings, href: `/settings${q}`, icon: Settings },
  ]
}

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const [companyName, setCompanyName] = useState<string>("")
  const [logoUrl, setLogoUrl] = useState<string>("")
  const [appLanguage, setAppLanguage] = useState<string>("ar")
  const [hydrated, setHydrated] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  useEffect(() => {
    const supabase = createClient()
    try {
      const n = typeof window !== 'undefined' ? (localStorage.getItem('company_name') || '') : ''
      if (n) setCompanyName(n)
    } catch {}
    const loadCompany = async () => {
      const cid = await getActiveCompanyId(supabase)
      if (!cid) return
      const { data } = await supabase
        .from("companies")
        .select("name, logo_url")
        .eq("id", cid)
        .maybeSingle()
      if (data?.name) setCompanyName(data.name)
      else {
        try { const n = typeof window !== 'undefined' ? (localStorage.getItem('company_name') || '') : ''; if (n) setCompanyName(n) } catch {}
      }
      const lu = (data as any)?.logo_url || (typeof window !== 'undefined' ? localStorage.getItem('company_logo_url') : '') || ''
      setLogoUrl(lu || '')
      const lang = (typeof window !== 'undefined' ? (localStorage.getItem('app_language') || 'ar') : 'ar')
      setAppLanguage(lang === 'en' ? 'en' : 'ar')
    }
    loadCompany()
    const handler = () => {
      const v = typeof window !== 'undefined' ? (localStorage.getItem('app_language') || 'ar') : 'ar'
      setAppLanguage(v === 'en' ? 'en' : 'ar')
    }
    const onCompanyUpdated = () => { loadCompany() }
    if (typeof window !== 'undefined') {
      window.addEventListener('app_language_changed', handler)
      window.addEventListener('storage', (e: any) => { if (e?.key === 'app_language') handler() })
      window.addEventListener('company_updated', onCompanyUpdated)
    }
    setHydrated(true)
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('app_language_changed', handler)
        window.removeEventListener('company_updated', onCompanyUpdated)
      }
    }
  }, [])

  return (
    <>
      {/* Mobile menu button */}
      <div className="md:hidden fixed top-4 right-4 z-50">
        <Button variant="outline" size="icon" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </Button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed right-0 top-0 w-64 h-screen bg-slate-900 text-white transform transition-transform duration-300 z-40 md:translate-x-0 overflow-y-auto ${
          isOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"
        }`}
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8 p-3 rounded-xl bg-blue-600 dark:bg-blue-600 border border-blue-700">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-12 h-12 rounded-xl object-cover ring-2 ring-white bg-white" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center ring-2 ring-white">
                <Building2 className="w-7 h-7 text-white" />
              </div>
            )}
            <h1 className="text-xl font-bold text-white truncate" suppressHydrationWarning>{companyName || ((hydrated && appLanguage === 'en') ? 'Company' : 'الشركة')}</h1>
          </div>

          <nav className="space-y-2">
            {buildMenuItems(appLanguage).map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              return (
                <Link key={item.href} href={item.href} prefetch={false}>
                  <button
                    onClick={() => setIsOpen(false)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                      isActive ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-slate-800"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span suppressHydrationWarning>{item.label}</span>
                  </button>
                </Link>
              )
            })}
          </nav>

          <div className="mt-8 pt-8 border-t border-slate-700">
            <Button
              variant="ghost"
              className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-slate-800"
              onClick={handleLogout}
            >
              <LogOut className="w-5 h-5 mr-2" />
              <span suppressHydrationWarning>{(hydrated && appLanguage === 'en') ? 'Log out' : 'تسجيل الخروج'}</span>
            </Button>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden" onClick={() => setIsOpen(false)} />
      )}
    </>
  )
}

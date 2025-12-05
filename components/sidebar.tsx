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
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { getActiveCompanyId } from "@/lib/company"
import { useRouter } from "next/navigation"
import { useSupabase } from "@/lib/supabase/hooks"

function buildMenuItems(lang: string) {
  const ar = {
    dashboard: "لوحة التحكم",
    products: "المنتجات والخدمات",
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
    products: "Products & Services",
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
  const items = [
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
  return items
}

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const [companyName, setCompanyName] = useState<string>("")
  const [logoUrl, setLogoUrl] = useState<string>("")
  const [appLanguage, setAppLanguage] = useState<string>("ar")
  const [hydrated, setHydrated] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabaseHook = useSupabase()
  const [deniedResources, setDeniedResources] = useState<string[]>([])
  const [myRole, setMyRole] = useState<string>("")
  const GroupAccordion = ({ group, q }: any) => {
    const pathname = usePathname()
    const isAnyActive = Array.isArray(group.items) && group.items.some((it: any) => pathname === it.href)
    const [open, setOpen] = useState<boolean>(isAnyActive)
    const IconMain = group.icon
    const filterAllowed = (href: string) => {
      const res = href.includes('/invoices') ? 'invoices'
        : href.includes('/bills') ? 'bills'
        : href.includes('/inventory') ? 'inventory'
        : href.includes('/products') ? 'products'
        : href.includes('/customers') ? 'customers'
        : href.includes('/suppliers') ? 'suppliers'
        : href.includes('/purchase-orders') ? 'purchase_orders'
        : href.includes('/payments') ? 'payments'
        : href.includes('/journal-entries') ? 'journal'
        : href.includes('/banking') ? 'banking'
        : href.includes('/reports') ? 'reports'
        : href.includes('/chart-of-accounts') ? 'chart_of_accounts'
        : href.includes('/shareholders') ? 'shareholders'
        : href.includes('/settings/taxes') ? 'taxes'
        : href.includes('/settings') ? 'settings'
        : href.includes('/hr') ? 'hr'
        : href.includes('/dashboard') ? 'dashboard'
        : ''
      return !res || deniedResources.indexOf(res) === -1
    }
    return (
      <div key={group.key} className="space-y-0.5 sm:space-y-1">
        <button
          onClick={() => setOpen(!open)}
          className={`w-full flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg transition text-sm sm:text-base ${isAnyActive ? 'bg-blue-700 text-white' : 'text-gray-200 hover:bg-slate-800 active:bg-slate-700'}`}
        >
          <span className="flex items-center gap-2 sm:gap-3">
            <IconMain className="w-5 h-5 flex-shrink-0" />
            <span suppressHydrationWarning>{group.label}</span>
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="space-y-0.5 sm:space-y-1">
            {group.items.filter((it: any) => filterAllowed(it.href)).map((it: any) => {
              const Icon = it.icon
              const isActive = pathname === it.href
              return (
                <Link key={it.href} href={it.href} prefetch={false}>
                  <button
                    onClick={() => setIsOpen(false)}
                    className={`w-full flex items-center gap-2 sm:gap-3 px-5 sm:px-6 py-2.5 sm:py-2 rounded-lg transition text-sm sm:text-base ${isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-slate-800 active:bg-slate-700'}`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span suppressHydrationWarning>{it.label}</span>
                  </button>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

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
      try {
        const r = await fetch('/api/my-company')
        if (r.ok) {
          const j = await r.json()
          const c = j?.company || {}
          const nm = String(c?.name || (typeof window !== 'undefined' ? (localStorage.getItem('company_name') || '') : '') || '')
          setCompanyName(nm)
          const lu = String(c?.logo_url || (typeof window !== 'undefined' ? (localStorage.getItem('company_logo_url') || '') : '') || '')
          setLogoUrl(lu)
        } else {
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
        }
      } finally {
        const lang = (typeof window !== 'undefined' ? (localStorage.getItem('app_language') || 'ar') : 'ar')
        setAppLanguage(lang === 'en' ? 'en' : 'ar')
      }
    }
    loadCompany()
    const loadPerms = async () => {
      const { data: { user } } = await supabaseHook.auth.getUser()
      const cid = await getActiveCompanyId(supabaseHook)
      if (!user || !cid) return
      const { data: myMember } = await supabaseHook.from('company_members').select('role').eq('company_id', cid).eq('user_id', user.id).maybeSingle()
      const role = String(myMember?.role || '')
      setMyRole(role)
      if (["owner","admin"].includes(role)) { setDeniedResources([]); return }
      const { data: perms } = await supabaseHook
        .from('company_role_permissions')
        .select('resource, can_read, can_write, can_update, can_delete, all_access')
        .eq('company_id', cid)
        .eq('role', role)
      const denied = (perms || []).filter((p: any) => !p.all_access && !p.can_read && !p.can_write && !p.can_update && !p.can_delete).map((p: any) => String(p.resource || ''))
      setDeniedResources(denied)
    }
    loadPerms()
    const handler = () => {
      const v = typeof window !== 'undefined' ? (localStorage.getItem('app_language') || 'ar') : 'ar'
      setAppLanguage(v === 'en' ? 'en' : 'ar')
    }
    const onCompanyUpdated = () => { loadCompany() }
    const onPermissionsUpdated = () => { loadPerms() }
    if (typeof window !== 'undefined') {
      window.addEventListener('app_language_changed', handler)
      window.addEventListener('storage', (e: any) => { if (e?.key === 'app_language') handler() })
      window.addEventListener('company_updated', onCompanyUpdated)
      window.addEventListener('permissions_updated', onPermissionsUpdated)
    }
    setHydrated(true)
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('app_language_changed', handler)
        window.removeEventListener('company_updated', onCompanyUpdated)
        window.removeEventListener('permissions_updated', onPermissionsUpdated)
      }
    }
  }, [])

  return (
    <>
      {/* Mobile Header Bar - شريط علوي للهاتف */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 z-[9996] flex items-center justify-between px-4 shadow-lg">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="w-9 h-9 rounded-lg object-cover ring-2 ring-blue-500 bg-white" />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center ring-2 ring-blue-400">
              <Building2 className="w-5 h-5 text-white" />
            </div>
          )}
          <span className="text-white font-semibold text-sm truncate max-w-[150px]">
            {companyName || ((hydrated && appLanguage === 'en') ? 'VitaSlims' : 'فيتاسليمز')}
          </span>
        </div>

        {/* زر القائمة */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`h-11 w-11 flex items-center justify-center text-white rounded-xl active:scale-95 transition-all duration-200
            ${isOpen
              ? 'bg-red-600 shadow-lg shadow-red-600/30'
              : 'bg-blue-600 shadow-lg shadow-blue-600/30'
            }`}
          aria-label="Toggle menu"
          style={{ touchAction: 'manipulation' }}
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar - القائمة الجانبية */}
      <aside
        className={`fixed right-0 bg-slate-900 text-white transform transition-transform duration-300 overflow-y-auto
          w-[280px] sm:w-72 md:w-64
          ${isOpen ? "translate-x-0 z-[9998]" : "translate-x-full md:translate-x-0 z-[9998] md:z-40"}
          top-16 md:top-0 h-[calc(100vh-64px)] md:h-screen`}
      >
        {/* Header - مخفي على الهاتف لأنه موجود في الشريط العلوي */}
        <div className="hidden md:block sticky top-0 bg-slate-900 z-10 p-4 sm:p-5 md:p-6 border-b border-slate-800 md:border-0 pt-6 md:pt-4">
          <div className="flex items-center gap-3 p-2 sm:p-3 rounded-xl bg-blue-600 border border-blue-700">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-cover ring-2 ring-white bg-white flex-shrink-0" />
            ) : (
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-500 flex items-center justify-center ring-2 ring-white flex-shrink-0">
                <Building2 className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
            )}
            <h1 className="text-base sm:text-lg md:text-xl font-bold text-white truncate" suppressHydrationWarning>
              {companyName || ((hydrated && appLanguage === 'en') ? 'Company' : 'الشركة')}
            </h1>
          </div>
        </div>

        {/* Navigation */}
        <div className="p-3 sm:p-4 md:p-6 pt-2 md:pt-0">
          <nav className="space-y-1 sm:space-y-2">
            {(() => {
              const q = appLanguage==='en' ? '?lang=en' : ''
              const allowHr = ["owner","admin","manager"].includes(myRole)
              const groups: Array<{ key: string; icon: any; label: string; items: Array<{ label: string; href: string; icon: any }>}> = [
                { key: 'dashboard', icon: BarChart3, label: (appLanguage==='en' ? 'Dashboard' : 'لوحة التحكم'), items: [ { label: (appLanguage==='en' ? 'Dashboard' : 'لوحة التحكم'), href: `/dashboard${q}`, icon: BarChart3 } ] },
                { key: 'sales', icon: FileText, label: (appLanguage==='en' ? 'Sales' : 'المبيعات'), items: [
                  { label: (appLanguage==='en' ? 'Customers' : 'العملاء'), href: `/customers${q}`, icon: Users },
                  { label: (appLanguage==='en' ? 'Sales Invoices' : 'فواتير المبيعات'), href: `/invoices${q}`, icon: FileText },
                  { label: (appLanguage==='en' ? 'Sales Returns' : 'مرتجعات المبيعات'), href: `/sales-returns${q}`, icon: FileText },
                ] },
                { key: 'purchases', icon: ShoppingCart, label: (appLanguage==='en' ? 'Purchases' : 'المشتريات'), items: [
                  { label: (appLanguage==='en' ? 'Suppliers' : 'الموردين'), href: `/suppliers${q}`, icon: ShoppingCart },
                  { label: (appLanguage==='en' ? 'Purchase Orders' : 'أوامر الشراء'), href: `/purchase-orders${q}`, icon: ShoppingCart },
                  { label: (appLanguage==='en' ? 'Purchase Bills' : 'فواتير المشتريات'), href: `/bills${q}`, icon: FileText },
                  { label: (appLanguage==='en' ? 'Vendor Credits' : 'إشعارات دائن الموردين'), href: `/vendor-credits${q}`, icon: FileText },
                ] },
                { key: 'inventory', icon: Package, label: (appLanguage==='en' ? 'Inventory' : 'المخزون'), items: [
                  { label: (appLanguage==='en' ? 'Products & Services' : 'المنتجات والخدمات'), href: `/products${q}`, icon: Package },
                  { label: (appLanguage==='en' ? 'Inventory' : 'المخزون'), href: `/inventory${q}`, icon: DollarSign },
                ] },
                { key: 'accounting', icon: BookOpen, label: (appLanguage==='en' ? 'Accounting' : 'الحسابات'), items: [
                  { label: (appLanguage==='en' ? 'Payments' : 'المدفوعات'), href: `/payments${q}`, icon: DollarSign },
                  { label: (appLanguage==='en' ? 'Journal Entries' : 'القيود اليومية'), href: `/journal-entries${q}`, icon: FileText },
                  { label: (appLanguage==='en' ? 'Banking' : 'الأعمال المصرفية'), href: `/banking${q}`, icon: DollarSign },
                  { label: (appLanguage==='en' ? 'Chart of Accounts' : 'الشجرة المحاسبية'), href: `/chart-of-accounts${q}`, icon: BookOpen },
                  { label: (appLanguage==='en' ? 'Taxes' : 'الضرائب'), href: `/settings/taxes${q}`, icon: Settings },
                  { label: (appLanguage==='en' ? 'Shareholders' : 'المساهمون'), href: `/shareholders${q}`, icon: Users },
                  { label: (appLanguage==='en' ? 'Financial Reports' : 'التقارير المالية'), href: `/reports${q}`, icon: BarChart3 },
                ] },
                ...(allowHr ? [{ key: 'hr', icon: Users, label: (appLanguage==='en' ? 'HR & Payroll' : 'الموظفون والمرتبات'), items: [
                  { label: (appLanguage==='en' ? 'Employees' : 'الموظفون'), href: `/hr/employees${q}`, icon: Users },
                  { label: (appLanguage==='en' ? 'Attendance' : 'الحضور والانصراف'), href: `/hr/attendance${q}`, icon: FileText },
                  { label: (appLanguage==='en' ? 'Payroll' : 'المرتبات'), href: `/hr/payroll${q}`, icon: DollarSign },
                ] }] : []),
                { key: 'settings', icon: Settings, label: (appLanguage==='en' ? 'Settings' : 'الإعدادات'), items: [ { label: (appLanguage==='en' ? 'General Settings' : 'الإعدادات العامة'), href: `/settings${q}`, icon: Settings } ] },
              ]
              return groups.map((g) => <GroupAccordion key={g.key} group={g} q={q} />)
            })()}
          </nav>

          {/* Logout button */}
          <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-slate-700">
            <Button
              variant="ghost"
              className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-slate-800 py-3"
              onClick={handleLogout}
            >
              <LogOut className="w-5 h-5 ml-2" />
              <span suppressHydrationWarning>{(hydrated && appLanguage === 'en') ? 'Log out' : 'تسجيل الخروج'}</span>
            </Button>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile - تحسين التفاعل */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9997] md:hidden top-16"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}

"use client"

import { useEffect, useState, useRef, useCallback } from "react"
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
  DollarSign,
  BookOpen,
  Settings,
  ChevronDown,
  AlertTriangle,
  Plus,
  Truck,
  ArrowLeftRight,
  Bell,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"
import { getActiveCompanyId } from "@/lib/company"
import { useRouter } from "next/navigation"
import { useSupabase } from "@/lib/supabase/hooks"
import { getCachedPermissions, clearPermissionsCache, getResourceFromPath } from "@/lib/permissions-context"
import { useAccess } from "@/lib/access-context"
import { NotificationCenter } from "@/components/NotificationCenter"
import { getUnreadNotificationCount } from "@/lib/governance-layer"

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
    { label: L.dashboard, href: `/dashboard${q}`, icon: BarChart3 },
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
  const [myCompanies, setMyCompanies] = useState<Array<{ id: string; name: string; logo_url?: string }>>([])
  const [activeCompanyId, setActiveCompanyId] = useState<string>("")
  const [showCompanySwitcher, setShowCompanySwitcher] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabaseHook = useSupabase()

  // 🔐 استخدام AccessContext كمصدر وحيد للصلاحيات
  const { isReady: accessReady, canAccessPage, profile, getFirstAllowedPage } = useAccess()
  
  // 🔐 استخدام role من AccessContext
  const myRole = profile?.role || ""
  
  // الحفاظ على التوافق مع النظام القديم (fallback)
  const [permissionsReady, setPermissionsReady] = useState<boolean>(false)
  const [deniedResources, setDeniedResources] = useState<string[]>([])

  // تحميل من الكاش عند التركيب (Hydration) - Fallback
  useEffect(() => {
    if (accessReady && profile) {
      // استخدام AccessContext
      setPermissionsReady(true)
      // حساب deniedResources من allowed_pages
      const allResources = [
        "dashboard", "products", "inventory", "customers", "suppliers",
        "sales_orders", "purchase_orders", "invoices", "bills", "payments",
        "journal_entries", "banking", "reports", "chart_of_accounts",
        "shareholders", "settings", "users", "taxes", "branches", "warehouses"
      ]
      const denied = allResources.filter(r => !profile.allowed_pages.includes(r) && r !== "profile")
      setDeniedResources(denied)
    } else {
      // Fallback: استخدام الكاش القديم
      const cached = getCachedPermissions()
      if (cached.isValid) {
        setDeniedResources(cached.deniedResources)
        setPermissionsReady(true)
      }
    }
  }, [accessReady, profile])
  const [userProfile, setUserProfile] = useState<{ username?: string; display_name?: string } | null>(null)
  const [userBranch, setUserBranch] = useState<{ id: string; name: string } | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string>("")
  // دالة مساعدة لتحويل المسار إلى اسم المورد
  const getResourceFromHref = (href: string): string => {
    // Important: Check more specific paths before general ones
    // المخزون - الأكثر تحديداً أولاً
    if (href.includes('/inventory-transfers')) return 'inventory_transfers'
    if (href.includes('/inventory/third-party')) return 'third_party_inventory'
    if (href.includes('/inventory/write-offs')) return 'write_offs'
    if (href.includes('/inventory')) return 'inventory'
    // الموارد البشرية
    if (href.includes('/hr/employees')) return 'employees'
    if (href.includes('/hr/attendance')) return 'attendance'
    if (href.includes('/hr/payroll')) return 'payroll'
    if (href.includes('/hr')) return 'hr'
    // الإعدادات - الأكثر تحديداً أولاً
    if (href.includes('/settings/taxes')) return 'taxes'
    if (href.includes('/settings/exchange-rates')) return 'exchange_rates'
    if (href.includes('/settings/audit-log')) return 'audit_log'
    if (href.includes('/settings/users')) return 'users'
    if (href.includes('/settings/profile')) return 'profile' // الملف الشخصي متاح للجميع
    if (href.includes('/settings/backup')) return 'backup'
    if (href.includes('/settings/shipping')) return 'shipping'
    if (href.includes('/settings/orders-rules')) return 'orders_rules'
    if (href.includes('/settings/accounting-maintenance')) return 'accounting_maintenance'
    if (href.includes('/settings')) return 'settings'
    // صفحة "لا توجد صلاحيات" - متاحة دائماً
    if (href.includes('/no-permissions')) return 'no_permissions'
    // الأصول الثابتة
    if (href.includes('/fixed-assets/categories')) return 'asset_categories'
    if (href.includes('/fixed-assets/reports')) return 'fixed_assets_reports'
    if (href.includes('/fixed-assets')) return 'fixed_assets'
    // الهيكل التنظيمي
    if (href.includes('/branches')) return 'branches'
    if (href.includes('/cost-centers')) return 'cost_centers'
    if (href.includes('/warehouses')) return 'warehouses'
    // المبيعات
    if (href.includes('/sales-orders')) return 'sales_orders'
    if (href.includes('/sales-returns')) return 'sales_returns'
    if (href.includes('/sent-invoice-returns')) return 'sent_invoice_returns'
    if (href.includes('/customer-debit-notes')) return 'customer_debit_notes'
    if (href.includes('/invoices')) return 'invoices'
    if (href.includes('/customers')) return 'customers'
    if (href.includes('/estimates')) return 'estimates'
    // المشتريات
    if (href.includes('/vendor-credits')) return 'vendor_credits'
    if (href.includes('/purchase-orders')) return 'purchase_orders'
    if (href.includes('/purchase-returns')) return 'purchase_returns'
    if (href.includes('/bills')) return 'bills'
    if (href.includes('/suppliers')) return 'suppliers'
    // المالية والمحاسبة
    if (href.includes('/journal-entries')) return 'journal_entries'
    if (href.includes('/chart-of-accounts')) return 'chart_of_accounts'
    if (href.includes('/payments')) return 'payments'
    if (href.includes('/banking')) return 'banking'
    if (href.includes('/shareholders')) return 'shareholders'
    // أخرى
    if (href.includes('/products')) return 'products'
    if (href.includes('/reports')) return 'reports'
    if (href.includes('/dashboard')) return 'dashboard'
    return ''
  }

  // دالة للتحقق من صلاحية الوصول - 🔐 محدثة لاستخدام AccessContext
  const isItemAllowed = (href: string): boolean => {
    const res = getResourceFromHref(href)
    if (res === 'profile' || res === 'no_permissions') return true
    
    // 🔐 استخدام AccessContext إذا كان جاهزاً
    if (accessReady && profile) {
      return canAccessPage(res)
    }
    
    // Fallback: استخدام النظام القديم
    if (!permissionsReady) return false
    return !res || deniedResources.indexOf(res) === -1
  }

  const GroupAccordion = ({ group, q }: any) => {
    const pathname = usePathname()

    // فلترة العناصر المسموح بها
    const allowedItems = Array.isArray(group.items)
      ? group.items.filter((it: any) => isItemAllowed(it.href))
      : []

    // إخفاء المجموعة بالكامل إذا لم يكن هناك عناصر مسموح بها
    if (allowedItems.length === 0) {
      return null
    }

    const isAnyActive = allowedItems.some((it: any) => pathname === it.href)
    const [open, setOpen] = useState<boolean>(isAnyActive)
    const IconMain = group.icon

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
            {allowedItems.map((it: any) => {
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
    // مسح كاش الصلاحيات عند تسجيل الخروج
    clearPermissionsCache()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  // ✅ جلب عدد الإشعارات غير المقروءة - خارج useEffect لتجنب scope issues
  const loadUnreadCount = useCallback(async () => {
    try {
      const { data: { user } } = await supabaseHook.auth.getUser()
      if (!user) {
        setCurrentUserId("")
        setUnreadCount(0)
        return
      }
      
      setCurrentUserId(user.id)
      const cid = await getActiveCompanyId(supabaseHook)
      if (!cid) {
        setUnreadCount(0)
        return
      }

      // جلب branch_id و role من company_members
      const { data: member } = await supabaseHook
        .from('company_members')
        .select('branch_id, role')
        .eq('company_id', cid)
        .eq('user_id', user.id)
        .maybeSingle()

      try {
        const count = await getUnreadNotificationCount(
          user.id, 
          cid,
          member?.branch_id || undefined,
          member?.role || undefined
        )
        setUnreadCount(count || 0)
      } catch (notifError: any) {
        // ✅ معالجة AbortError بشكل صحيح
        if (notifError?.name === 'AbortError' || notifError?.message?.includes('aborted')) {
          console.warn('⚠️ [Sidebar] Loading unread count aborted (component unmounted)')
          setUnreadCount(0)
          return
        }
        // إذا كان الجدول غير موجود (404)، لا نعرض خطأ
        if (notifError?.message?.includes('404') || notifError?.message?.includes('does not exist')) {
          console.warn("Notifications table not found - run SQL script first")
          setUnreadCount(0)
        } else {
          console.error("Error loading unread count:", notifError)
          setUnreadCount(0)
        }
      }
    } catch (error: any) {
      // ✅ معالجة AbortError بشكل صحيح
      if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
        console.warn('⚠️ [Sidebar] loadUnreadCount aborted (component unmounted)')
        setUnreadCount(0)
        return
      }
      // لا نعطل باقي الوظائف عند فشل تحميل الإشعارات
      console.error("Error in loadUnreadCount:", error)
      setUnreadCount(0)
    }
  }, [supabaseHook])

  // ✅ استخدام useRef لتخزين أحدث إصدار من loadUnreadCount لتجنب infinite loop
  const loadUnreadCountRef = useRef(loadUnreadCount)
  useEffect(() => {
    loadUnreadCountRef.current = loadUnreadCount
  }, [loadUnreadCount])

  // 🔔 Real-Time: تحديث عدد الإشعارات غير المقروءة تلقائياً (ERP Standard)
  useEffect(() => {
    if (!currentUserId || !activeCompanyId) return

    console.log('🔔 [SIDEBAR_REALTIME] Setting up enterprise notification count subscription...', {
      userId: currentUserId,
      companyId: activeCompanyId
    })

    // ✅ جلب دور المستخدم للفلترة الصحيحة
    let userRoleForFiltering: string | null = null
    const loadUserRole = async () => {
      try {
        const { data: member } = await supabaseHook
          .from('company_members')
          .select('role')
          .eq('company_id', activeCompanyId)
          .eq('user_id', currentUserId)
          .maybeSingle()
        userRoleForFiltering = member?.role || null
      } catch (error: any) {
        // ✅ معالجة AbortError بشكل صحيح
        if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
          console.warn('⚠️ [Sidebar] Loading user role for notification filtering aborted')
          return
        }
        console.error('Error loading user role for notification filtering:', error)
      }
    }
    loadUserRole()

    // ✅ دالة مساعدة للتحقق من أن الإشعار يؤثر على العدد
    const shouldAffectCount = (notification: any): boolean => {
      // 1. التحقق من company_id
      if (notification.company_id !== activeCompanyId) {
        return false
      }

      // 2. التحقق من assigned_to_user
      if (notification.assigned_to_user) {
        if (notification.assigned_to_user !== currentUserId) {
          // إلا إذا كان owner أو admin
          if (userRoleForFiltering !== 'owner' && userRoleForFiltering !== 'admin') {
            return false
          }
        }
      }

      // 3. التحقق من assigned_to_role
      if (notification.assigned_to_role) {
        if (notification.assigned_to_role !== userRoleForFiltering) {
          // إلا إذا كان owner أو admin
          if (userRoleForFiltering !== 'owner' && userRoleForFiltering !== 'admin') {
            // owner يرى إشعارات admin
            if (!(notification.assigned_to_role === 'admin' && userRoleForFiltering === 'owner')) {
              return false
            }
          }
        }
      }

      // 4. التحقق من الحالة (unread فقط)
      if (notification.status !== 'unread') {
        return false
      }

      // 5. التحقق من انتهاء الصلاحية
      if (notification.expires_at) {
        const expiresAt = new Date(notification.expires_at)
        if (expiresAt <= new Date()) {
          return false
        }
      }

      // 6. استبعاد المؤرشفة
      if (notification.status === 'archived') {
        return false
      }

      return true
    }

    // إنشاء Realtime channel لتحديث عدد الإشعارات
    const channel = supabaseHook
      .channel(`notification_count:${activeCompanyId}:${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'notifications',
          filter: `company_id=eq.${activeCompanyId}` // فلترة حسب الشركة
        },
        async (payload: any) => {
          console.log('🔔 [SIDEBAR_REALTIME] Notification event received:', {
            eventType: payload.eventType,
            notificationId: payload.new?.id || payload.old?.id
          })

          // ✅ تحديث العدد مباشرة بناءً على الحدث
          if (payload.eventType === 'INSERT') {
            const notification = payload.new as any
            if (shouldAffectCount(notification)) {
              console.log('➕ [SIDEBAR_REALTIME] New unread notification - incrementing count')
              setUnreadCount(prev => prev + 1)
            }
          } else if (payload.eventType === 'UPDATE') {
            const notification = payload.new as any
            const oldNotification = payload.old as any
            
            // إذا تغيرت الحالة من unread إلى read/archived
            if (oldNotification.status === 'unread' && notification.status !== 'unread') {
              if (shouldAffectCount(oldNotification)) {
                console.log('➖ [SIDEBAR_REALTIME] Notification marked as read - decrementing count')
                setUnreadCount(prev => Math.max(0, prev - 1))
              }
            }
            // إذا تغيرت الحالة من read إلى unread
            else if (oldNotification.status !== 'unread' && notification.status === 'unread') {
              if (shouldAffectCount(notification)) {
                console.log('➕ [SIDEBAR_REALTIME] Notification marked as unread - incrementing count')
                setUnreadCount(prev => prev + 1)
              }
            }
          } else if (payload.eventType === 'DELETE') {
            const notification = payload.old as any
            if (shouldAffectCount(notification)) {
              console.log('➖ [SIDEBAR_REALTIME] Notification deleted - decrementing count')
              setUnreadCount(prev => Math.max(0, prev - 1))
            }
          }

          // ✅ أيضاً تحديث العدد الكامل (للتأكد من الدقة)
          // استخدام ref لتجنب infinite loop
          setTimeout(() => {
            loadUnreadCountRef.current()
          }, 500)
        }
      )
      .subscribe((status: any) => {
        console.log('🔔 [SIDEBAR_REALTIME] Subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('✅ [SIDEBAR_REALTIME] Successfully subscribed to notification count')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ [SIDEBAR_REALTIME] Channel error - check Supabase Realtime configuration')
        }
      })

    // تنظيف الاشتراك عند إلغاء التثبيت
    return () => {
      console.log('🔕 [SIDEBAR_REALTIME] Unsubscribing from notification count updates...')
      supabaseHook.removeChannel(channel)
    }
  }, [currentUserId, activeCompanyId, supabaseHook])

  useEffect(() => {
    const supabase = createClient()
    try {
      const n = typeof window !== 'undefined' ? (localStorage.getItem('company_name') || '') : ''
      if (n) setCompanyName(n)
    } catch { }
    const loadCompany = async () => {
      try {
        const r = await fetch('/api/my-company')
        if (r.ok) {
          const j = await r.json()
          // API response structure: { success, data: { company, accounts } }
          const c = j?.data?.company || j?.company || {}
          const nm = String(c?.name || (typeof window !== 'undefined' ? (localStorage.getItem('company_name') || '') : '') || '')
          setCompanyName(nm)
          const lu = String(c?.logo_url || (typeof window !== 'undefined' ? (localStorage.getItem('company_logo_url') || '') : '') || '')
          setLogoUrl(lu)
          // حفظ في localStorage للاستخدام اللاحق
          if (nm && typeof window !== 'undefined') {
            try { localStorage.setItem('company_name', nm) } catch { }
          }
          if (lu && typeof window !== 'undefined') {
            try { localStorage.setItem('company_logo_url', lu) } catch { }
          }
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
            try { const n = typeof window !== 'undefined' ? (localStorage.getItem('company_name') || '') : ''; if (n) setCompanyName(n) } catch { }
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
    // جلب قائمة الشركات التي ينتمي إليها المستخدم
    const loadMyCompanies = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const companies: Array<{ id: string; name: string; logo_url?: string }> = []

        // 1️⃣ جلب الشركات من company_members
        const { data: members } = await supabase
          .from('company_members')
          .select('company_id, companies(id, name, logo_url)')
          .eq('user_id', user.id)
        if (members && members.length > 0) {
          members.forEach((m: any) => {
            if (m.companies && m.companies.id) {
              companies.push({ id: m.companies.id, name: m.companies.name || '', logo_url: m.companies.logo_url || '' })
            }
          })
        }

        // 2️⃣ جلب الشركات المملوكة أيضاً (حتى لو لم يكن عضواً)
        const { data: ownedCompanies } = await supabase
          .from('companies')
          .select('id, name, logo_url')
          .eq('user_id', user.id)
        if (ownedCompanies) {
          ownedCompanies.forEach((oc: any) => {
            if (!companies.find((c: any) => c.id === oc.id)) {
              companies.push({ id: oc.id, name: oc.name || '', logo_url: oc.logo_url || '' })
            }
          })
        }

        setMyCompanies(companies)

        // تعيين الشركة النشطة
        const cid = await getActiveCompanyId(supabase)
        if (cid) setActiveCompanyId(cid)
      } catch { }
    }
    loadMyCompanies()
    const loadPerms = async () => {
      // أولاً: استخدام الكاش إذا كان صالحاً (للعرض الفوري)
      const cached = getCachedPermissions()
      if (cached.isValid) {
        setDeniedResources(cached.deniedResources)
        setPermissionsReady(true)
      }

      // ثانياً: تحميل من الخادم للتحديث
      const { data: { user } } = await supabaseHook.auth.getUser()
      const cid = await getActiveCompanyId(supabaseHook)
      if (!user || !cid) {
        setPermissionsReady(true) // تعيين جاهزية حتى في حالة عدم وجود مستخدم
        return
      }
      const { data: myMember } = await supabaseHook.from('company_members').select('role').eq('company_id', cid).eq('user_id', user.id).maybeSingle()
      const role = String(myMember?.role || '')
      // 🔐 myRole يأتي من AccessContext الآن (profile?.role)
      if (["owner", "admin"].includes(role)) {
        setDeniedResources([])
        setPermissionsReady(true)
        return
      }
      const { data: perms } = await supabaseHook
        .from('company_role_permissions')
        .select('resource, can_read, can_write, can_update, can_delete, all_access, can_access')
        .eq('company_id', cid)
        .eq('role', role)
      // الموارد المخفية: can_access = false أو (لا يوجد أي صلاحية)
      const denied = (perms || []).filter((p: any) => {
        // إذا كان can_access = false صراحةً، نخفي الصفحة
        if (p.can_access === false) return true
        // إذا لم يكن هناك أي صلاحية (ولم يكن can_access = true صراحةً)
        if (!p.all_access && !p.can_read && !p.can_write && !p.can_update && !p.can_delete && p.can_access !== true) return true
        return false
      }).map((p: any) => String(p.resource || ''))
      setDeniedResources(denied)
      setPermissionsReady(true)
    }
    loadPerms()
    
    // جلب عدد الإشعارات غير المقروءة (استخدام الدالة المعرفة خارج useEffect)
    loadUnreadCount()
    
    // تحديث عدد الإشعارات عند تغيير الشركة أو عند استقبال حدث
    const handleNotificationsUpdate = () => {
      loadUnreadCount()
    }
    
    // جلب ملف المستخدم (username)
    const loadUserProfile = async () => {
      try {
        const res = await fetch('/api/user-profile')
        if (res.ok) {
          const data = await res.json()
          setUserProfile(data.profile || null)
        }
      } catch { }
    }
    // جلب الدور والفرع للمستخدم
    const loadUserRoleAndBranch = async () => {
      try {
        const { data: { user } } = await supabaseHook.auth.getUser()
        if (!user) return
        const cid = await getActiveCompanyId(supabaseHook)
        if (!cid) return

        // جلب الدور والفرع من company_members
        const { data: member } = await supabaseHook
          .from("company_members")
          .select("role, branch_id")
          .eq("company_id", cid)
          .eq("user_id", user.id)
          .maybeSingle()

        if (member?.branch_id) {
          // جلب اسم الفرع
          const { data: branch } = await supabaseHook
            .from("branches")
            .select("id, name")
            .eq("id", member.branch_id)
            .maybeSingle()
          if (branch) {
            setUserBranch({ id: branch.id, name: branch.name })
          }
        } else {
          // إذا لم يكن هناك branch_id في company_members، جرب user_branch_access
          const { data: branchAccess } = await supabaseHook
            .from("user_branch_access")
            .select("branch_id, is_primary")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .order("is_primary", { ascending: false })
            .limit(1)
            .maybeSingle()

          if (branchAccess?.branch_id) {
            const { data: branch } = await supabaseHook
              .from("branches")
              .select("id, name")
              .eq("id", branchAccess.branch_id)
              .maybeSingle()
            if (branch) {
              setUserBranch({ id: branch.id, name: branch.name })
            }
          }
        }
      } catch (err: any) {
        // ✅ معالجة AbortError بشكل صحيح
        if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
          console.warn('⚠️ [Sidebar] Loading user role and branch aborted (component unmounted)')
          return
        }
        console.error("Error loading user role and branch:", err)
      }
    }
    loadUserProfile()
    loadUserRoleAndBranch()
    const handler = () => {
      const v = typeof window !== 'undefined' ? (localStorage.getItem('app_language') || 'ar') : 'ar'
      setAppLanguage(v === 'en' ? 'en' : 'ar')
    }
    const onCompanyUpdated = () => { 
      loadCompany()
      loadUserRoleAndBranch()
      handleNotificationsUpdate() // تحديث عدد الإشعارات عند تغيير الشركة
    }
    const onPermissionsUpdated = async () => { 
      // ✅ تحديث الصلاحيات فقط - لا إعادة توجيه
      // ✅ إعادة التوجيه يتم التعامل معها في RealtimeRouteGuard
      console.log('🔄 [Sidebar] Permissions updated, reloading permissions...')
      setTimeout(() => {
        loadPerms()
      }, 100)
    }
    
    const onAccessProfileUpdated = async () => {
      // ✅ تحديث Access Profile - تحديث القوائم فقط
      // ✅ لا إعادة توجيه - يتم التعامل معه في RealtimeRouteGuard
      console.log('🔄 [Sidebar] Access profile updated, UI will refresh automatically via React state')
      // ✅ Sidebar سيتم تحديثه تلقائياً عبر React state من AccessContext
      // ✅ لا حاجة لإعادة تحميل يدوي - React سيتعامل معه
    }
    const onProfileUpdated = () => { loadUserProfile() }
    if (typeof window !== 'undefined') {
      window.addEventListener('app_language_changed', handler)
      window.addEventListener('storage', (e: any) => { if (e?.key === 'app_language') handler() })
      window.addEventListener('company_updated', onCompanyUpdated)
      window.addEventListener('permissions_updated', onPermissionsUpdated)
      window.addEventListener('access_profile_updated', onAccessProfileUpdated)
      window.addEventListener('profile_updated', onProfileUpdated)
      window.addEventListener('notifications_updated', handleNotificationsUpdate)
      // company_updated يتم التعامل معه في onCompanyUpdated
    }
    setHydrated(true)
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('app_language_changed', handler)
        window.removeEventListener('company_updated', onCompanyUpdated)
        window.removeEventListener('permissions_updated', onPermissionsUpdated)
        window.removeEventListener('access_profile_updated', onAccessProfileUpdated)
        window.removeEventListener('profile_updated', onProfileUpdated)
        window.removeEventListener('notifications_updated', handleNotificationsUpdate)
      }
    }
  }, [])

  return (
    <>
      {/* Mobile Header Bar - شريط علوي للهاتف */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 z-[9996] flex items-center justify-between px-4 shadow-lg">
        <div className="relative">
          <button
            onClick={() => myCompanies.length > 1 && setShowCompanySwitcher(!showCompanySwitcher)}
            className="flex items-center gap-3"
          >
            <div suppressHydrationWarning>
              {hydrated && logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-9 h-9 rounded-lg object-cover ring-2 ring-blue-500 bg-white" />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center ring-2 ring-blue-400">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
              )}
            </div>
            <div className="text-right">
              <span className="text-white font-semibold text-sm truncate max-w-[120px] block" suppressHydrationWarning>
                {hydrated ? (companyName || '7ESAB') : '7ESAB'}
              </span>
              {hydrated && myCompanies.length > 1 && (
                <span className="text-xs text-blue-300 flex items-center gap-1">
                  <ChevronDown className={`w-3 h-3 ${showCompanySwitcher ? 'rotate-180' : ''}`} />
                  تبديل
                </span>
              )}
            </div>
          </button>
          {/* قائمة تبديل الشركات للهاتف */}
          {hydrated && showCompanySwitcher && myCompanies.length > 1 && (
            <div className="absolute top-full right-0 mt-2 w-64 bg-slate-800 rounded-xl border border-slate-700 shadow-xl z-[9999] overflow-hidden">
              <div className="p-2 border-b border-slate-700">
                <p className="text-xs text-gray-400 text-center">اختر الشركة</p>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {myCompanies.map((company) => (
                  <button
                    key={company.id}
                    onClick={async () => {
                      if (company.id === activeCompanyId) {
                        setShowCompanySwitcher(false)
                        return
                      }
                      try {
                        // 🔹 حفظ ID الشركة الجديدة
                        localStorage.setItem('active_company_id', company.id)
                        document.cookie = `active_company_id=${company.id}; path=/; max-age=31536000`
                        // 🔹 حفظ اسم ولوجو الشركة الجديدة
                        localStorage.setItem('company_name', company.name || '')
                        localStorage.setItem('company_logo_url', company.logo_url || '')

                        // مسح كاش الصلاحيات
                        clearPermissionsCache()

                        // 🔄 إطلاق حدث التحديث
                        window.dispatchEvent(new CustomEvent('company_updated', {
                          detail: { companyId: company.id, companyName: company.name }
                        }))
                        window.dispatchEvent(new Event('permissions_updated'))

                        // ✅ الحصول على أول صفحة مسموح بها والتوجيه إليها
                        try {
                          // 🔐 استخدام getFirstAllowedPage من AccessContext
                          const targetPath = getFirstAllowedPage()
                          router.push(targetPath)
                        } catch (err) {
                          console.error('❌ Error switching company:', err)
                          // في حالة الخطأ، استخدام getFirstAllowedPage
                          const fallbackPath = getFirstAllowedPage()
                          router.push(fallbackPath)
                        }
                        setShowCompanySwitcher(false)
                      } catch (err) {
                        console.error('❌ Error switching company:', err)
                        setShowCompanySwitcher(false)
                      }
                    }}
                    className={`w-full flex items-center gap-3 p-3 hover:bg-slate-700 ${company.id === activeCompanyId ? 'bg-blue-600/20 border-r-2 border-blue-500' : ''}`}
                  >
                    {company.logo_url ? (
                      <img src={company.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover bg-white" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-slate-600 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-gray-300" />
                      </div>
                    )}
                    <span className={`text-sm truncate ${company.id === activeCompanyId ? 'text-blue-400 font-medium' : 'text-gray-300'}`}>
                      {company.name}
                    </span>
                    {company.id === activeCompanyId && <span className="mr-auto text-xs text-blue-400">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* زر القائمة */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="h-11 w-11 flex items-center justify-center text-white rounded-xl active:scale-95 transition-all duration-200 bg-blue-600 shadow-lg shadow-blue-600/30"
          aria-label="Toggle menu"
          style={{ touchAction: 'manipulation' }}
        >
          <Menu className="w-6 h-6" />
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
          <div className="relative">
            <button
              onClick={() => myCompanies.length > 1 && setShowCompanySwitcher(!showCompanySwitcher)}
              className={`w-full flex items-center gap-3 p-2 sm:p-3 rounded-xl bg-blue-600 border border-blue-700 ${hydrated && myCompanies.length > 1 ? 'cursor-pointer hover:bg-blue-700 transition-colors' : ''}`}
            >
              <div suppressHydrationWarning className="flex-shrink-0">
                {hydrated && logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-cover ring-2 ring-white bg-white" />
                ) : (
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-500 flex items-center justify-center ring-2 ring-white">
                    <Building2 className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                  </div>
                )}
              </div>
              <div className="flex-1 text-right min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-white truncate" suppressHydrationWarning>
                  {hydrated ? (companyName || (appLanguage === 'en' ? 'Company' : 'الشركة')) : 'الشركة'}
                </h1>
                {hydrated && myCompanies.length > 1 && (
                  <p className="text-xs text-blue-200 flex items-center gap-1 justify-end">
                    <ChevronDown className={`w-3 h-3 transition-transform ${showCompanySwitcher ? 'rotate-180' : ''}`} />
                    {appLanguage === 'en' ? 'Switch company' : 'تغيير الشركة'}
                  </p>
                )}
              </div>
            </button>
            {/* قائمة تبديل الشركات */}
            {hydrated && showCompanySwitcher && myCompanies.length > 1 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 rounded-xl border border-slate-700 shadow-xl z-50 overflow-hidden">
                <div className="p-2 border-b border-slate-700">
                  <p className="text-xs text-gray-400 text-center">
                    {appLanguage === 'en' ? 'Select company' : 'اختر الشركة'}
                  </p>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {myCompanies.map((company) => (
                    <button
                      key={company.id}
                      onClick={async () => {
                        if (company.id === activeCompanyId) {
                          setShowCompanySwitcher(false)
                          return
                        }
                        // تغيير الشركة النشطة
                        try {
                          console.log('🔄 Switching to company:', company.id, company.name)

                          // 🔹 حفظ ID الشركة الجديدة
                          localStorage.setItem('active_company_id', company.id)
                          document.cookie = `active_company_id=${company.id}; path=/; max-age=31536000`

                          // 🔹 حفظ اسم ولوجو الشركة الجديدة مباشرة
                          localStorage.setItem('company_name', company.name || '')
                          localStorage.setItem('company_logo_url', company.logo_url || '')

                          // مسح كاش الصلاحيات
                          clearPermissionsCache()

                          // 🔄 إطلاق حدث التحديث مع بيانات الشركة الجديدة
                          window.dispatchEvent(new CustomEvent('company_updated', {
                            detail: { companyId: company.id, companyName: company.name }
                          }))
                          window.dispatchEvent(new Event('permissions_updated'))

                          // ✅ الحصول على أول صفحة مسموح بها والتوجيه إليها
                          try {
                            // 🔐 استخدام getFirstAllowedPage من AccessContext
                            const targetPath = getFirstAllowedPage()
                            console.log('✅ Redirecting to first allowed page:', targetPath)
                            router.push(targetPath)
                          } catch (err) {
                            console.error('❌ Error switching company:', err)
                            // في حالة الخطأ، استخدام getFirstAllowedPage
                            const fallbackPath = getFirstAllowedPage()
                            router.push(fallbackPath)
                          }
                          setShowCompanySwitcher(false)
                        } catch (err) {
                          console.error('❌ Error switching company:', err)
                          setShowCompanySwitcher(false)
                        }
                      }}
                      className={`w-full flex items-center gap-3 p-3 hover:bg-slate-700 transition-colors ${company.id === activeCompanyId ? 'bg-blue-600/20 border-r-2 border-blue-500' : ''}`}
                    >
                      {company.logo_url ? (
                        <img src={company.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover bg-white" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-slate-600 flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-gray-300" />
                        </div>
                      )}
                      <span className={`text-sm truncate ${company.id === activeCompanyId ? 'text-blue-400 font-medium' : 'text-gray-300'}`}>
                        {company.name}
                      </span>
                      {company.id === activeCompanyId && (
                        <span className="mr-auto text-xs text-blue-400">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="p-3 sm:p-4 md:p-6 pt-2 md:pt-0">
          <nav className="space-y-1 sm:space-y-2">
            {(() => {
              // استخدام appLanguage فقط بعد hydration لتجنب مشاكل hydration
              const lang = hydrated ? appLanguage : 'ar'
              const q = lang === 'en' ? '?lang=en' : ''
              const allowHr = ["owner", "admin", "manager"].includes(myRole)
              const groups: Array<{ key: string; icon: any; label: string; items: Array<{ label: string; href: string; icon: any }> }> = [
                { key: 'dashboard', icon: BarChart3, label: (lang === 'en' ? 'Dashboard' : 'لوحة التحكم'), items: [{ label: (lang === 'en' ? 'Dashboard' : 'لوحة التحكم'), href: `/dashboard${q}`, icon: BarChart3 }] },
                {
                  key: 'sales', icon: FileText, label: (lang === 'en' ? 'Sales' : 'المبيعات'), items: [
                    { label: (lang === 'en' ? 'Customers' : 'العملاء'), href: `/customers${q}`, icon: Users },
                    { label: (lang === 'en' ? 'Sales Orders' : 'أوامر البيع'), href: `/sales-orders${q}`, icon: ShoppingCart },
                    { label: (lang === 'en' ? 'Sales Invoices' : 'فواتير المبيعات'), href: `/invoices${q}`, icon: FileText },
                    { label: (lang === 'en' ? 'Sales Returns' : 'مرتجعات المبيعات'), href: `/sales-returns${q}`, icon: FileText },
                    { label: (lang === 'en' ? 'Customer Debit Notes' : 'إشعارات مدين العملاء'), href: `/customer-debit-notes${q}`, icon: FileText },
                  ]
                },
                {
                  key: 'purchases', icon: ShoppingCart, label: (lang === 'en' ? 'Purchases' : 'المشتريات'), items: [
                    { label: (lang === 'en' ? 'Suppliers' : 'الموردين'), href: `/suppliers${q}`, icon: ShoppingCart },
                    { label: (lang === 'en' ? 'Purchase Orders' : 'أوامر الشراء'), href: `/purchase-orders${q}`, icon: ShoppingCart },
                    { label: (lang === 'en' ? 'Purchase Bills' : 'فواتير المشتريات'), href: `/bills${q}`, icon: FileText },
                    { label: (lang === 'en' ? 'Purchase Returns' : 'مرتجعات المشتريات'), href: `/purchase-returns${q}`, icon: FileText },
                    { label: (lang === 'en' ? 'Vendor Credits' : 'إشعارات دائن الموردين'), href: `/vendor-credits${q}`, icon: FileText },
                  ]
                },
                {
                  key: 'inventory', icon: Package, label: (lang === 'en' ? 'Inventory' : 'المخزون'), items: [
                    { label: (lang === 'en' ? 'Products & Services' : 'المنتجات والخدمات'), href: `/products${q}`, icon: Package },
                    { label: (lang === 'en' ? 'Inventory' : 'المخزون'), href: `/inventory${q}`, icon: DollarSign },
                    { label: (lang === 'en' ? 'Inventory Transfers' : 'نقل المخزون'), href: `/inventory-transfers${q}`, icon: ArrowLeftRight },
                    { label: (lang === 'en' ? 'Third Party Goods' : 'بضائع لدى الغير'), href: `/inventory/third-party${q}`, icon: Truck },
                    { label: (lang === 'en' ? 'Write-offs' : 'إهلاك المخزون'), href: `/inventory/write-offs${q}`, icon: AlertTriangle },
                  ]
                },
                {
                  key: 'accounting', icon: BookOpen, label: (lang === 'en' ? 'Accounting' : 'الحسابات'), items: [
                    { label: (lang === 'en' ? 'Payments' : 'المدفوعات'), href: `/payments${q}`, icon: DollarSign },
                    { label: (lang === 'en' ? 'Journal Entries' : 'القيود اليومية'), href: `/journal-entries${q}`, icon: FileText },
                    { label: (lang === 'en' ? 'Banking' : 'الأعمال المصرفية'), href: `/banking${q}`, icon: DollarSign },
                    { label: (lang === 'en' ? 'Chart of Accounts' : 'الشجرة المحاسبية'), href: `/chart-of-accounts${q}`, icon: BookOpen },
                    { label: (lang === 'en' ? 'Taxes' : 'الضرائب'), href: `/settings/taxes${q}`, icon: Settings },
                    { label: (lang === 'en' ? 'Shareholders' : 'المساهمون'), href: `/shareholders${q}`, icon: Users },
                    { label: (lang === 'en' ? 'Financial Reports' : 'التقارير المالية'), href: `/reports${q}`, icon: BarChart3 },
                  ]
                },
                {
                  key: 'fixed_assets', icon: Building2, label: (lang === 'en' ? 'Fixed Assets' : 'الأصول الثابتة'), items: [
                    { label: (lang === 'en' ? 'Assets List' : 'قائمة الأصول'), href: `/fixed-assets${q}`, icon: Package },
                    { label: (lang === 'en' ? 'Add Asset' : 'إضافة أصل'), href: `/fixed-assets/new${q}`, icon: Plus },
                    { label: (lang === 'en' ? 'Asset Categories' : 'فئات الأصول'), href: `/fixed-assets/categories${q}`, icon: FileText },
                    { label: (lang === 'en' ? 'Asset Reports' : 'تقارير الأصول'), href: `/fixed-assets/reports${q}`, icon: BarChart3 },
                  ]
                },
                ...(allowHr ? [{
                  key: 'hr', icon: Users, label: (lang === 'en' ? 'HR & Payroll' : 'الموظفون والمرتبات'), items: [
                    { label: (lang === 'en' ? 'Employees' : 'الموظفون'), href: `/hr/employees${q}`, icon: Users },
                    { label: (lang === 'en' ? 'Attendance' : 'الحضور والانصراف'), href: `/hr/attendance${q}`, icon: FileText },
                    { label: (lang === 'en' ? 'Payroll' : 'المرتبات'), href: `/hr/payroll${q}`, icon: DollarSign },
                  ]
                }] : []),
                {
                  key: 'settings', icon: Settings, label: (lang === 'en' ? 'Settings' : 'الإعدادات'), items: [
                    { label: (lang === 'en' ? 'General Settings' : 'الإعدادات العامة'), href: `/settings${q}`, icon: Settings },
                    { label: (lang === 'en' ? 'Branches' : 'الفروع'), href: `/branches${q}`, icon: Building2 },
                    { label: (lang === 'en' ? 'Cost Centers' : 'مراكز التكلفة'), href: `/cost-centers${q}`, icon: DollarSign },
                    { label: (lang === 'en' ? 'Warehouses' : 'المخازن'), href: `/warehouses${q}`, icon: Package },
                    { label: (lang === 'en' ? 'My Profile' : 'ملفي الشخصي'), href: `/settings/profile${q}`, icon: Users },
                  ]
                },
              ]
              return groups.map((g) => <GroupAccordion key={g.key} group={g} q={q} />)
            })()}
          </nav>

          {/* User Profile & Logout */}
          <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-slate-700 space-y-3">
            {/* Notification Bell */}
            {currentUserId && activeCompanyId && (
              <Button
                variant="ghost"
                className="w-full justify-start text-gray-300 hover:text-white hover:bg-slate-800 py-3 relative"
                onClick={() => setNotificationCenterOpen(true)}
              >
                <Bell className="w-5 h-5 ml-2" />
                <span suppressHydrationWarning>
                  {hydrated ? ((appLanguage === 'en') ? 'Notifications' : 'الإشعارات') : 'الإشعارات'}
                </span>
                {unreadCount > 0 && (
                  <Badge className="absolute top-1 right-1 h-5 min-w-5 px-1.5 bg-red-500 text-white text-xs flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Badge>
                )}
              </Button>
            )}
            
            {/* عرض معلومات المستخدم */}
            {userProfile && (
              <div className="px-2 py-2 rounded-lg bg-slate-800/50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                    {(userProfile.display_name || userProfile.username || 'U')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    {userProfile.display_name && (
                      <p className="text-sm font-medium text-white truncate">{userProfile.display_name}</p>
                    )}
                    {userProfile.username && (
                      <p className="text-xs text-slate-400 truncate">@{userProfile.username}</p>
                    )}
                    {/* عرض الدور والفرع */}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {myRole && (
                        <span className="text-xs text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded">
                          {myRole === 'owner' ? 'مالك' :
                            myRole === 'admin' ? 'مدير عام' :
                              myRole === 'manager' ? 'مدير' :
                                myRole === 'accountant' ? 'محاسب' :
                                  myRole === 'store_manager' ? 'مسؤول مخزن' :
                                    myRole === 'staff' ? 'موظف' :
                                      myRole === 'viewer' ? 'عرض فقط' : myRole}
                        </span>
                      )}
                      {userBranch && (
                        <span className="text-xs text-emerald-400 bg-emerald-900/30 px-1.5 py-0.5 rounded">
                          {userBranch.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
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
      
      {/* Notification Center */}
      {currentUserId && activeCompanyId && (
        <NotificationCenter
          open={notificationCenterOpen}
          onOpenChange={setNotificationCenterOpen}
          userId={currentUserId}
          companyId={activeCompanyId}
          branchId={userBranch?.id}
          warehouseId={undefined}
          userRole={myRole || ''}
        />
      )}
    </>
  )
}

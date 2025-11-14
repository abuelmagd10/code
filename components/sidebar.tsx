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

const menuItems = [
  {
    label: "لوحة التحكم",
    href: "/dashboard",
    icon: BarChart3,
  },
  {
    label: "العملاء",
    href: "/customers",
    icon: Users,
  },
  {
    label: "المساهمون",
    href: "/shareholders",
    icon: Users,
  },
  {
    label: "الموردين",
    href: "/suppliers",
    icon: ShoppingCart,
  },
  {
    label: "أوامر الشراء",
    href: "/purchase-orders",
    icon: ShoppingCart,
  },
  {
    label: "المدفوعات",
    href: "/payments",
    icon: DollarSign,
  },
  {
    label: "المنتجات",
    href: "/products",
    icon: Package,
  },
  {
    label: "المخزون",
    href: "/inventory",
    icon: DollarSign,
  },
  {
    label: "الفواتير",
    href: "/invoices",
    icon: FileText,
  },
  {
    label: "فواتير الموردين",
    href: "/bills",
    icon: FileText,
  },
  {
    label: "إشعارات مورد دائن",
    href: "/vendor-credits",
    icon: FileText,
  },
  {
    label: "الأعمال المصرفية",
    href: "/banking",
    icon: DollarSign,
  },
  {
    label: "الشجرة المحاسبية",
    href: "/chart-of-accounts",
    icon: BookOpen,
  },
  {
    label: "قيود اليومية",
    href: "/journal-entries",
    icon: FileText,
  },
  {
    label: "التقارير",
    href: "/reports",
    icon: BarChart3,
  },
  {
    label: "الإعدادات",
    href: "/settings",
    icon: Settings,
  },
  {
    label: "الضرائب",
    href: "/settings/taxes",
    icon: Settings,
  },
]

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const [companyName, setCompanyName] = useState<string>("")
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  useEffect(() => {
    const supabase = createClient()
    const loadCompany = async () => {
      const cid = await getActiveCompanyId(supabase)
      if (!cid) return
      const { data } = await supabase
        .from("companies")
        .select("name")
        .eq("id", cid)
        .single()
      if (data?.name) setCompanyName(data.name)
    }
    loadCompany()
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
          <div className="flex items-center gap-2 mb-8">
            <Building2 className="w-8 h-8 text-blue-400" />
            <h1 className="text-xl font-bold">{companyName || "نظام الإدارة"}</h1>
          </div>

          <nav className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              return (
                <Link key={item.href} href={item.href}>
                  <button
                    onClick={() => setIsOpen(false)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                      isActive ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-slate-800"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
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
              تسجيل الخروج
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

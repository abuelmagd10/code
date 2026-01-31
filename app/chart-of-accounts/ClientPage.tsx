"use client"

import { useState, useEffect, useRef, useMemo, useTransition } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { useSupabase } from "@/lib/supabase/hooks"
import { detectCoaColumns, buildCoaFormPayload } from "@/lib/accounts"
import { computeLeafAccountBalancesAsOf } from "@/lib/ledger"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { Plus, Edit2, Trash2, Search, Banknote, Wallet, GitBranch, Building2, MapPin } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastDeleteSuccess, toastDeleteError, toastActionSuccess, toastActionError } from "@/lib/notifications"
import { Switch } from "@/components/ui/switch"
import { validatePrice, getValidationError } from "@/lib/validation"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface Account {
  id: string
  account_code: string
  account_name: string
  account_type: string
  description: string
  opening_balance: number
  is_active: boolean
  sub_type?: string | null
  parent_id?: string | null
  level?: number | null
  branch_id?: string | null
  cost_center_id?: string | null
  branch_name?: string
  cost_center_name?: string
}

type Branch = { id: string; name: string; code: string }
type CostCenter = { id: string; cost_center_name: string; cost_center_code: string; branch_id: string }

const ACCOUNT_TYPES = [
  { value: "asset", label: "أصول" },
  { value: "liability", label: "التزامات" },
  { value: "equity", label: "حقوق الملكية" },
  { value: "income", label: "الإيرادات" },
  { value: "expense", label: "المصروفات" },
]

const SUB_TYPE_LABELS: Record<string, string> = {
  cash: "النقد",
  bank: "المصرف",
  accounts_receivable: "الحسابات المدينة",
  accounts_payable: "الحسابات الدائنة",
  vat_input: "ضريبة القيمة المضافة (مدخلات)",
  vat_output: "ضريبة القيمة المضافة المستحقة",
  excise_input: "ضريبة انتقائية (مدخلات)",
  excise_output: "ضريبة انتقائية مستحقة",
  tax_prepaid: "ضرائب مدفوعة مقدمة",
  employee_advance: "سلفة الموظفين",
  prepaid_expense: "مصروفات مدفوعة مقدمًا",
  fixed_assets: "الأصول الثابتة",
  capital: "رأس المال",
  retained_earnings: "أرباح محتجزة",
  sales_revenue: "إيرادات المبيعات",
  cogs: "تكلفة البضائع المباعة",
  operating_expenses: "مصروفات تشغيلية",
  inventory: "المخزون",
}

const getSubtypeLabel = (subType?: string | null): string | null => {
  if (!subType) return null
  const key = subType.toLowerCase()
  return SUB_TYPE_LABELS[key] || subType
}

const getSubtypeColor = (subType?: string | null): string => {
  const key = (subType || "").toLowerCase()
  const colors: Record<string, string> = {
    cash: "bg-emerald-100 text-emerald-800",
    bank: "bg-indigo-100 text-indigo-800",
    accounts_receivable: "bg-amber-100 text-amber-800",
    accounts_payable: "bg-red-100 text-red-800",
    vat_input: "bg-cyan-100 text-cyan-800",
    excise_input: "bg-cyan-100 text-cyan-800",
    tax_prepaid: "bg-cyan-100 text-cyan-800",
    employee_advance: "bg-cyan-100 text-cyan-800",
    prepaid_expense: "bg-cyan-100 text-cyan-800",
    fixed_assets: "bg-gray-100 text-gray-800",
    capital: "bg-purple-100 text-purple-800",
    retained_earnings: "bg-purple-100 text-purple-800",
    sales_revenue: "bg-green-100 text-green-800",
    cogs: "bg-orange-100 text-orange-800",
    operating_expenses: "bg-orange-100 text-orange-800",
    inventory: "bg-yellow-100 text-yellow-800",
  }
  return colors[key] || "bg-slate-100 text-slate-800"
}

function ChartOfAccountsPage() {
  const { toast } = useToast()
  const supabase = useSupabase()
  const [appLang, setAppLang] = useState<'ar' | 'en'>(() => {
    if (typeof window === 'undefined') return 'ar'
    try {
      const docLang = document.documentElement?.lang
      if (docLang === 'en') return 'en'
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      const v = fromCookie || localStorage.getItem('app_language') || 'ar'
      return v === 'en' ? 'en' : 'ar'
    } catch { return 'ar' }
  })
  const [hydrated, setHydrated] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState<string>("all")

  // 🚀 تحسين الأداء - استخدام useTransition للفلاتر
  const [isPending, startTransition] = useTransition()

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showHierarchy, setShowHierarchy] = useState<boolean>(true)
  const [hasAutoReset, setHasAutoReset] = useState<boolean>(false)
  const [showGroupsOnly, setShowGroupsOnly] = useState<boolean>(false)
  const [hasNormalized, setHasNormalized] = useState<boolean>(false)
  const [hasCoaNormalBalanceColumn, setHasCoaNormalBalanceColumn] = useState<boolean>(true)
  const [hasSchemaWarningShown, setHasSchemaWarningShown] = useState<boolean>(false)
  const [cleanupLoading, setCleanupLoading] = useState<boolean>(false)
  const [cleanupSummary, setCleanupSummary] = useState<string | null>(null)
  const [asOfDate, setAsOfDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [currentById, setCurrentById] = useState<Record<string, number>>({})
  const [companyIdState, setCompanyIdState] = useState<string | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [formData, setFormData] = useState({
    account_code: "",
    account_name: "",
    account_type: "asset",
    sub_type: "",
    is_cash: false,
    is_bank: false,
    parent_id: "",
    level: 1,
    description: "",
    opening_balance: 0,
    branch_id: "",
    cost_center_id: "",
    normal_balance: "debit", // القيمة الافتراضية للأصول
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [permWrite, setPermWrite] = useState(false)
  const [permUpdate, setPermUpdate] = useState(false)
  const [permDelete, setPermDelete] = useState(false)
  const isReplacingRef = useRef<boolean>(false)

  useEffect(() => {
    setHydrated(true)
    const handler = () => {
      try {
        const docLang = document.documentElement?.lang
        if (docLang === 'en') { setAppLang('en'); return }
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        const v = fromCookie || localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch { }
    }
    window.addEventListener('app_language_changed', handler)
    window.addEventListener('storage', (e: any) => { if (e?.key === 'app_language') handler() })
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, [])

  useEffect(() => {
    (async () => {
      setPermWrite(await canAction(supabase, 'chart_of_accounts', 'write'))
      setPermUpdate(await canAction(supabase, 'chart_of_accounts', 'update'))
      setPermDelete(await canAction(supabase, 'chart_of_accounts', 'delete'))
    })()
  }, [supabase])
  useEffect(() => {
    const handler = async () => {
      setPermWrite(await canAction(supabase, 'chart_of_accounts', 'write'))
      setPermUpdate(await canAction(supabase, 'chart_of_accounts', 'update'))
      setPermDelete(await canAction(supabase, 'chart_of_accounts', 'delete'))
    }
    if (typeof window !== 'undefined') window.addEventListener('permissions_updated', handler)
    return () => { if (typeof window !== 'undefined') window.removeEventListener('permissions_updated', handler) }
  }, [supabase])

  const seedZohoDefault = async () => {
    try {
      const flags = await detectCoaColumns(supabase)
      const { normalExists, parentIdExists, levelExists, subTypeExists } = flags
      setHasCoaNormalBalanceColumn(normalExists)
      if ((!normalExists || !parentIdExists || !levelExists || !subTypeExists) && !hasSchemaWarningShown) {
        setHasSchemaWarningShown(true)
        toast({
          title: "تنبيه المخطط",
          description:
            "مخطط الحسابات لا يحتوي على بعض الأعمدة الاختيارية (normal_balance أو parent_id أو level أو sub_type). سيتم المتابعة بدونها.",
          variant: "default",
        })
      }

      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const getIdByCode = async (code: string): Promise<string | null> => {
        const existing = await supabase
          .from("chart_of_accounts")
          .select("id")
          .eq("company_id", companyId)
          .eq("account_code", code)
          .maybeSingle()
        return existing.data?.id ?? null
      }

      const ensureNode = async (node: {
        code: string
        name: string
        type: "asset" | "liability" | "equity" | "income" | "expense"
        normal: "debit" | "credit"
        level: number
        parentCode?: string
        sub_type?: string
      }) => {
        const existsId = await getIdByCode(node.code)
        if (existsId) return existsId

        let parent_id: string | null = null
        if (node.parentCode) {
          parent_id = await getIdByCode(node.parentCode)
        }

        const payload: any = {
          company_id: companyId,
          account_code: node.code,
          account_name: node.name,
          account_type: node.type,
          is_active: true,
          opening_balance: 0,
          description: "",
        }
        if (subTypeExists) {
          payload.sub_type = node.sub_type ?? null
        }
        if (parentIdExists) {
          payload.parent_id = parent_id
        }
        if (levelExists) {
          payload.level = node.level
        }
        if (normalExists) {
          payload.normal_balance = node.normal
        }

        const { data, error } = await supabase.from("chart_of_accounts").insert([payload]).select("id")
        if (error) throw error
        return data?.[0]?.id ?? null
      }

      await ensureNode({ code: "A", name: "الأصول", type: "asset", normal: "debit", level: 1 })
      await ensureNode({ code: "L", name: "الخصوم", type: "liability", normal: "credit", level: 1 })
      await ensureNode({ code: "E", name: "حقوق الملكية", type: "equity", normal: "credit", level: 1 })
      await ensureNode({ code: "I", name: "الإيرادات", type: "income", normal: "credit", level: 1 })
      await ensureNode({ code: "X", name: "المصروفات", type: "expense", normal: "debit", level: 1 })

      await ensureNode({ code: "A1", name: "الأصول المتداولة", type: "asset", normal: "debit", level: 2, parentCode: "A" })
      await ensureNode({ code: "A2", name: "الأصول غير المتداولة", type: "asset", normal: "debit", level: 2, parentCode: "A" })
      await ensureNode({ code: "L1", name: "الخصوم المتداولة", type: "liability", normal: "credit", level: 2, parentCode: "L" })
      await ensureNode({ code: "L2", name: "الخصوم غير المتداولة", type: "liability", normal: "credit", level: 2, parentCode: "L" })
      await ensureNode({ code: "E1", name: "مكونات حقوق الملكية", type: "equity", normal: "credit", level: 2, parentCode: "E" })
      await ensureNode({ code: "I1", name: "مصادر الدخل", type: "income", normal: "credit", level: 2, parentCode: "I" })
      await ensureNode({ code: "X1", name: "مصروفات التشغيل", type: "expense", normal: "debit", level: 2, parentCode: "X" })

      await ensureNode({ code: "A1C", name: "النقد", type: "asset", normal: "debit", level: 3, parentCode: "A1" })
      await ensureNode({ code: "A1B", name: "المصرف", type: "asset", normal: "debit", level: 3, parentCode: "A1" })
      await ensureNode({ code: "A1AR", name: "الحسابات المدينة", type: "asset", normal: "debit", level: 3, parentCode: "A1" })
      await ensureNode({ code: "A1O", name: "الأصول المتداولة الأخرى", type: "asset", normal: "debit", level: 3, parentCode: "A1" })
      await ensureNode({ code: "A1INVG", name: "المخزون", type: "asset", normal: "debit", level: 3, parentCode: "A1" })

      await ensureNode({ code: "L1AP", name: "الحسابات الدائنة", type: "liability", normal: "credit", level: 3, parentCode: "L1" })
      await ensureNode({ code: "L1O", name: "خصوم متداولة أخرى", type: "liability", normal: "credit", level: 3, parentCode: "L1" })

      await ensureNode({ code: "1110", name: "المبالغ الصغيرة", type: "asset", normal: "debit", level: 4, parentCode: "A1C", sub_type: "cash" })
      await ensureNode({ code: "1115", name: "أموال غير مودعة", type: "asset", normal: "debit", level: 4, parentCode: "A1C", sub_type: "cash" })
      await ensureNode({ code: "1121", name: "حساب بنكي", type: "asset", normal: "debit", level: 4, parentCode: "A1B", sub_type: "bank" })
      await ensureNode({ code: "1130", name: "الحسابات المدينة", type: "asset", normal: "debit", level: 4, parentCode: "A1AR", sub_type: "accounts_receivable" })
      await ensureNode({ code: "1140", name: "Input VAT", type: "asset", normal: "debit", level: 4, parentCode: "A1O", sub_type: "vat_input" })
      await ensureNode({ code: "2000", name: "الحسابات الدائنة", type: "liability", normal: "credit", level: 4, parentCode: "L1AP", sub_type: "accounts_payable" })
      await ensureNode({ code: "2100", name: "VAT Payable", type: "liability", normal: "credit", level: 4, parentCode: "L1O", sub_type: "vat_output" })
      await ensureNode({ code: "3000", name: "رأس مال الشركة", type: "equity", normal: "credit", level: 3, parentCode: "E1", sub_type: "capital" })
      await ensureNode({ code: "3100", name: "أرباح محتجزة", type: "equity", normal: "credit", level: 3, parentCode: "E1", sub_type: "retained_earnings" })
      await ensureNode({ code: "4000", name: "المبيعات", type: "income", normal: "credit", level: 3, parentCode: "I1", sub_type: "sales_revenue" })
      await ensureNode({ code: "4010", name: "دخل آخر", type: "income", normal: "credit", level: 3, parentCode: "I1" })
      await ensureNode({ code: "5000", name: "تكلفة البضائع المباعة", type: "expense", normal: "debit", level: 3, parentCode: "X1", sub_type: "cogs" })
      await ensureNode({ code: "5100", name: "مصروفات تشغيلية", type: "expense", normal: "debit", level: 3, parentCode: "X1", sub_type: "operating_expenses" })

      await loadAccounts()
    } catch (error) {
      console.error("Error seeding Zoho default:", error)
    }
  }

  const replaceWithZohoTree = async () => {
    try {
      if (isReplacingRef.current) return
      isReplacingRef.current = true
      const flags = await detectCoaColumns(supabase)
      const { normalExists, parentIdExists, levelExists, subTypeExists } = flags
      setHasCoaNormalBalanceColumn(flags.normalExists)
      if ((!flags.normalExists || !flags.parentIdExists || !flags.levelExists || !flags.subTypeExists) && !hasSchemaWarningShown) {
        setHasSchemaWarningShown(true)
        toast({
          title: "تنبيه المخطط",
          description:
            "مخطط الحسابات لا يحتوي على بعض الأعمدة الاختيارية (normal_balance أو parent_id أو level أو sub_type). سيتم المتابعة بدونها.",
          variant: "default",
        })
      }

      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const buildPayload = (node: {
        code: string
        name: string
        type: "asset" | "liability" | "equity" | "income" | "expense"
        normal: "debit" | "credit"
        level: number
        parent_id?: string | null
        sub_type?: string
      }) => {
        const payload: any = {
          company_id: companyId,
          account_code: node.code,
          account_name: node.name,
          account_type: node.type,
          is_active: true,
          opening_balance: 0,
          description: "",
        }
        if (subTypeExists) payload.sub_type = node.sub_type ?? null
        if (parentIdExists) payload.parent_id = node.parent_id ?? null
        if (levelExists) payload.level = node.level
        if (normalExists) payload.normal_balance = node.normal
        return payload
      }

      const desired = [
        { code: "A", name: "الأصول", type: "asset", normal: "debit", level: 1 },
        { code: "L", name: "الخصوم", type: "liability", normal: "credit", level: 1 },
        { code: "E", name: "حقوق الملكية", type: "equity", normal: "credit", level: 1 },
        { code: "I", name: "الإيرادات", type: "income", normal: "credit", level: 1 },
        { code: "X", name: "المصروفات", type: "expense", normal: "debit", level: 1 },

        { code: "A1", name: "الأصول المتداولة", type: "asset", normal: "debit", level: 2, parentCode: "A" },
        { code: "A2", name: "الأصول غير المتداولة", type: "asset", normal: "debit", level: 2, parentCode: "A" },
        { code: "L1", name: "الخصوم المتداولة", type: "liability", normal: "credit", level: 2, parentCode: "L" },
        { code: "L2", name: "الخصوم غير المتداولة", type: "liability", normal: "credit", level: 2, parentCode: "L" },
        { code: "E1", name: "مكونات حقوق الملكية", type: "equity", normal: "credit", level: 2, parentCode: "E" },
        { code: "I1", name: "مصادر الدخل", type: "income", normal: "credit", level: 2, parentCode: "I" },
        { code: "X1", name: "مصروفات التشغيل", type: "expense", normal: "debit", level: 2, parentCode: "X" },

        { code: "A1C", name: "النقد", type: "asset", normal: "debit", level: 3, parentCode: "A1" },
        { code: "A1B", name: "المصرف", type: "asset", normal: "debit", level: 3, parentCode: "A1" },
        { code: "A1AR", name: "الحسابات المدينة", type: "asset", normal: "debit", level: 3, parentCode: "A1" },
        { code: "A1O", name: "الأصول المتداولة الأخرى", type: "asset", normal: "debit", level: 3, parentCode: "A1" },
        { code: "A1INVG", name: "المخزون", type: "asset", normal: "debit", level: 3, parentCode: "A1" },

        { code: "L1AP", name: "الحسابات الدائنة", type: "liability", normal: "credit", level: 3, parentCode: "L1" },
        { code: "L1O", name: "خصوم متداولة أخرى", type: "liability", normal: "credit", level: 3, parentCode: "L1" },

        { code: "1110", name: "المبالغ الصغيرة", type: "asset", normal: "debit", level: 4, parentCode: "A1C", sub_type: "cash" },
        { code: "1115", name: "أموال غير مودعة", type: "asset", normal: "debit", level: 4, parentCode: "A1C", sub_type: "cash" },
        { code: "1121", name: "حساب بنكي", type: "asset", normal: "debit", level: 4, parentCode: "A1B", sub_type: "bank" },
        { code: "1130", name: "الحسابات المدينة", type: "asset", normal: "debit", level: 4, parentCode: "A1AR", sub_type: "accounts_receivable" },
        { code: "1140", name: "Input VAT", type: "asset", normal: "debit", level: 4, parentCode: "A1O", sub_type: "vat_input" },
        { code: "2000", name: "الحسابات الدائنة", type: "liability", normal: "credit", level: 4, parentCode: "L1AP", sub_type: "accounts_payable" },
        { code: "2100", name: "VAT Payable", type: "liability", normal: "credit", level: 4, parentCode: "L1O", sub_type: "vat_output" },
        { code: "3000", name: "رأس مال الشركة", type: "equity", normal: "credit", level: 3, parentCode: "E1", sub_type: "capital" },
        { code: "3100", name: "أرباح محتجزة", type: "equity", normal: "credit", level: 3, parentCode: "E1", sub_type: "retained_earnings" },
        { code: "4000", name: "المبيعات", type: "income", normal: "credit", level: 3, parentCode: "I1", sub_type: "sales_revenue" },
        { code: "4010", name: "دخل آخر", type: "income", normal: "credit", level: 3, parentCode: "I1" },
        { code: "5000", name: "تكلفة البضائع المباعة", type: "expense", normal: "debit", level: 3, parentCode: "X1", sub_type: "cogs" },
        { code: "5100", name: "مصروفات تشغيلية", type: "expense", normal: "debit", level: 3, parentCode: "X1", sub_type: "operating_expenses" },
      ] as any

      const roots = desired.filter((d: any) => d.level === 1)
      const level2 = desired.filter((d: any) => d.level === 2)
      const level3 = desired.filter((d: any) => d.level === 3)
      const level4 = desired.filter((d: any) => d.level === 4)

      if (roots.length) {
        const rootPayloads = roots.map((n: any) => buildPayload({ ...n, parent_id: null }))
        const { error: rootErr } = await supabase
          .from("chart_of_accounts")
          .upsert(rootPayloads, { onConflict: "company_id,account_code" })
        if (rootErr) throw rootErr
      }

      const codeToId: Record<string, string> = {}
      const fetchIds = async (codes: string[]) => {
        if (!codes.length) return
        const { data: idsData, error: idsErr } = await supabase
          .from("chart_of_accounts")
          .select("id, account_code")
          .eq("company_id", companyId)
          .in("account_code", codes)
        if (idsErr) throw idsErr
        for (const row of idsData || []) codeToId[row.account_code] = row.id
      }

      await fetchIds(roots.map((r: any) => r.code))

      if (level2.length) {
        const lvl2Payloads = level2.map((n: any) => buildPayload({ ...n, parent_id: codeToId[n.parentCode as string] || null }))
        const { error: lvl2Err } = await supabase
          .from("chart_of_accounts")
          .upsert(lvl2Payloads, { onConflict: "company_id,account_code" })
        if (lvl2Err) throw lvl2Err
      }

      await fetchIds(level2.map((r: any) => r.code))

      if (level3.length) {
        const lvl3Payloads = level3.map((n: any) => buildPayload({ ...n, parent_id: codeToId[n.parentCode as string] || null }))
        const { error: lvl3Err } = await supabase
          .from("chart_of_accounts")
          .upsert(lvl3Payloads, { onConflict: "company_id,account_code" })
        if (lvl3Err) throw lvl3Err
      }

      await fetchIds(level3.map((r: any) => r.code))

      if (level4.length) {
        const lvl4Payloads = level4.map((n: any) => buildPayload({ ...n, parent_id: codeToId[n.parentCode as string] || null }))
        const { error: lvl4Err } = await supabase
          .from("chart_of_accounts")
          .upsert(lvl4Payloads, { onConflict: "company_id,account_code" })
        if (lvl4Err) throw lvl4Err
      }

      const desiredCodesArr = (desired as any[]).map((d) => d.code)
      if (desiredCodesArr.length > 0) {
        const inList = `(${desiredCodesArr.map((c) => `'${c}'`).join(",")})`
        const { error: deactivateErr } = await supabase
          .from("chart_of_accounts")
          .update({ is_active: false })
          .eq("company_id", companyId)
          .not("account_code", "in", inList)
        if (deactivateErr) throw deactivateErr
      }

      await loadAccounts()
    } catch (err: any) {
      const msg = err?.message || err?.details || err?.hint || (() => {
        try { return JSON.stringify(err) } catch { return String(err) }
      })()
      console.error("Error replacing tree with Zoho:", msg)
    } finally {
      isReplacingRef.current = false
    }
  }

  const quickAdd = async (type: "bank" | "cash") => {
    try {
      const parentCode = type === "bank" ? "A1B" : "A1C"
      const parentNode = accounts.find((a) => a.account_code === parentCode)
      const parentId = parentNode?.id ?? ""
      const level = parentNode ? ((parentNode.level ?? 1) + 1) : 1

      // التأكد من تحميل الفروع ومراكز التكلفة قبل فتح النموذج
      try {
        const companyId = companyIdState || await getActiveCompanyId(supabase)
        if (companyId && (branches.length === 0 || costCenters.length === 0)) {
          await loadBranchesAndCostCenters(companyId)
        }
      } catch (error) {
        // في حالة انقطاع الاتصال، نفتح النموذج بدون تحميل الفروع ومراكز التكلفة
        console.warn("Could not load branches and cost centers, continuing anyway:", error)
      }

      setEditingId(null)
      setFormData({
        account_code: type === "bank" ? "1010" : "1000",
        account_name: type === "bank" ? "حساب بنكي" : "خزينة الشركة",
        account_type: "asset",
        sub_type: type === "bank" ? "bank" : "cash",
        is_cash: type === "cash",
        is_bank: type === "bank",
        parent_id: parentId,
        level,
        description: type === "bank" ? "حساب بنكي (نقد بالبنك)" : "خزينة الشركة (نقد بالصندوق)",
        opening_balance: 0,
        branch_id: "",
        cost_center_id: "",
        normal_balance: "debit", // الأصول دائماً debit
      })
      setIsDialogOpen(true)
    } catch (error) {
      console.error("Error in quickAdd:", error)
      toast({
        title: appLang === 'en' ? 'Error' : 'خطأ',
        description: appLang === 'en' ? 'Failed to open form. Please check your internet connection.' : 'فشل فتح النموذج. يرجى التحقق من اتصال الإنترنت.',
        variant: "destructive"
      })
    }
  }

  useEffect(() => { loadAccounts() }, [])

  // دالة منفصلة لتحميل الفروع ومراكز التكلفة
  const loadBranchesAndCostCenters = async (companyId: string) => {
    try {
      const [branchRes, ccRes] = await Promise.all([
        supabase
          .from("branches")
          .select("id, name, code")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("cost_centers")
          .select("id, cost_center_name, cost_center_code, branch_id")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("cost_center_name")
      ])
      if (branchRes.error) {
        console.error("Error loading branches:", branchRes.error)
      } else {
        setBranches(branchRes.data || [])
      }
      if (ccRes.error) {
        console.error("Error loading cost centers:", ccRes.error)
      } else {
        setCostCenters(ccRes.data || [])
      }
    } catch (error) {
      console.error("Error loading branches and cost centers:", error)
      // في حالة انقطاع الاتصال، لا نوقف التطبيق
      // فقط نسجل الخطأ ونستمر
    }
  }

  const loadAccounts = async () => {
    try {
      setIsLoading(true)
      let companyId: string | null = null
      try {
        const res = await fetch('/api/my-company')
        if (res.ok) {
          const j = await res.json()
          // API response structure: { success, data: { company, accounts } }
          companyId = String(j?.data?.company?.id || j?.company?.id || '') || null
          if (companyId) { try { localStorage.setItem('active_company_id', companyId) } catch { } }
          const accountsList = j?.data?.accounts || j?.accounts
          if (Array.isArray(accountsList)) {
            const list = accountsList as Account[]
            setAccounts(list)
            setCompanyIdState(companyId)
            if (!hasNormalized) await normalizeCashBankParents(companyId!, list)
            // تحميل الفروع ومراكز التكلفة حتى في حالة العودة المبكرة
            await loadBranchesAndCostCenters(companyId!)
            return
          }
        }
      } catch { }
      if (!companyId) companyId = await getActiveCompanyId(supabase)
      if (!companyId) return
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .eq("company_id", companyId)
        .order("account_code")
      if (error) {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data: memberCompany } = await supabase
              .from('company_members')
              .select('company_id')
              .eq('user_id', user.id)
              .limit(1)
            const mc = Array.isArray(memberCompany) ? (memberCompany[0]?.company_id || null) : null
            if (mc) {
              try { localStorage.setItem('active_company_id', mc) } catch { }
              const { data: fixedData } = await supabase
                .from('chart_of_accounts')
                .select('*')
                .eq('company_id', mc)
                .order('account_code')
              setAccounts(fixedData || [])
              if (!hasNormalized) await normalizeCashBankParents(mc, fixedData || [])
              // تحميل الفروع ومراكز التكلفة
              await loadBranchesAndCostCenters(mc)
              return
            }
          }
        } catch { }
      }
      const list = data || []
      setAccounts(list)
      setCompanyIdState(companyId)
      if (!hasNormalized) {
        await normalizeCashBankParents(companyId, list)
      }
      // Load branches and cost centers
      await loadBranchesAndCostCenters(companyId)
    } catch (error) {
      console.error("Error loading accounts:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const normalizeCashBankParents = async (companyId: string, list: Account[]) => {
    try {
      let parentIdExists = false
      let levelExists = false
      try {
        const { data: probeData } = await supabase.from("chart_of_accounts").select("*").limit(1)
        parentIdExists = Array.isArray(probeData) && probeData[0] && Object.prototype.hasOwnProperty.call(probeData[0], "parent_id")
        levelExists = Array.isArray(probeData) && probeData[0] && Object.prototype.hasOwnProperty.call(probeData[0], "level")
      } catch (_) {
        parentIdExists = false
        levelExists = false
      }
      if (!parentIdExists || !levelExists) { setHasNormalized(true); return }
      const bankGroup = list.find((a) => a.account_code === "A1B")
      const cashGroup = list.find((a) => a.account_code === "A1C")
      if (!bankGroup && !cashGroup) { setHasNormalized(true); return }

      const updates: { id: string; parent_id: string; level: number }[] = []
      for (const acc of list) {
        if ((acc.sub_type || "").toLowerCase() === "cash" && cashGroup && acc.parent_id !== cashGroup.id) {
          updates.push({ id: acc.id, parent_id: cashGroup.id, level: (cashGroup.level ?? 1) + 1 })
        }
        if ((acc.sub_type || "").toLowerCase() === "bank" && bankGroup && acc.parent_id !== bankGroup.id) {
          updates.push({ id: acc.id, parent_id: bankGroup.id, level: (bankGroup.level ?? 1) + 1 })
        }
      }
      if (updates.length === 0) { setHasNormalized(true); return }
      for (const u of updates) {
        try {
          const { error } = await supabase
            .from("chart_of_accounts")
            .update({ parent_id: u.parent_id, level: u.level })
            .eq("id", u.id)
          if (error) { console.warn("فشل تحديث ترتيب الحساب (normalizeCashBankParents)", { id: u.id, error }) }
        } catch (e) { console.warn("خطأ شبكة أثناء تحديث ترتيب الحساب", { id: u.id, e }) }
      }
      setHasNormalized(true)
      await loadAccounts()
    } catch (err) {
      console.error("Error normalizing cash/bank parents:", err)
      setHasNormalized(true)
    }
  }

  const childrenMap = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const a of accounts) {
      const p = a.parent_id || null
      if (p) {
        const arr = m.get(p) || []
        arr.push(a.id)
        m.set(p, arr)
      }
    }
    return m
  }, [accounts])

  const sumGroup = (id: string) => {
    let s = 0
    const stack: string[] = [...(childrenMap.get(id) || [])]
    while (stack.length) {
      const cur = stack.pop() as string
      const kids = childrenMap.get(cur) || []
      if (kids.length > 0) stack.push(...kids)
      else s += Number(currentById[cur] || 0)
    }
    return s
  }

  useEffect(() => {
    const f = async () => {
      try {
        let cid = companyIdState
        if (!cid) cid = await getActiveCompanyId(supabase)
        if (!cid) { setCurrentById({}); return }
        const res = await fetch(`/api/account-balances?companyId=${encodeURIComponent(cid)}&asOf=${encodeURIComponent(asOfDate)}`)
        if (!res.ok) { setCurrentById({}); return }
        const arr = await res.json()
        const obj: Record<string, number> = {}
        for (const b of (Array.isArray(arr) ? arr : [])) obj[String(b.account_id)] = Number(b.balance || 0)
        setCurrentById(obj)
      } catch { setCurrentById({}) }
    }
    if (accounts.length > 0) f()
  }, [accounts, asOfDate, supabase, companyIdState])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate opening balance
    if (formData.opening_balance !== 0) {
      const isValidPrice = validatePrice(formData.opening_balance.toString())
      if (!isValidPrice) {
        const errorMsg = appLang === 'en' ? 'Invalid opening balance' : 'رصيد افتتاحي غير صالح'
        toastActionError(toast, "الإنشاء", "الحساب", errorMsg)
        setFormErrors({ opening_balance: errorMsg })
        return
      }
    }

    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return
      const parent = accounts.find((a) => a.id === (formData.parent_id || ""))
      const computedLevel = parent ? ((parent.level ?? 1) + 1) : 1
      const flags = await detectCoaColumns(supabase)

      let dupQuery = supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("company_id", companyId)
        .eq("account_code", formData.account_code)
      if (editingId) { dupQuery = dupQuery.neq("id", editingId) }
      const { data: dupRows } = await dupQuery
      if ((dupRows?.length || 0) > 0) {
        toastActionError(toast, editingId ? "التحديث" : "الإنشاء", "الحساب", "رمز الحساب مستخدم بالفعل")
        return
      }

      const payload: any = {
        ...buildCoaFormPayload({
          account_code: formData.account_code,
          account_name: formData.account_name,
          account_type: formData.account_type,
          sub_type: formData.sub_type,
          parent_id: formData.parent_id,
          normal_balance: formData.normal_balance // إضافة normal_balance من formData
        }, computedLevel, flags),
        description: formData.description,
        opening_balance: formData.opening_balance,
        branch_id: (formData.is_bank || formData.is_cash) && formData.branch_id ? formData.branch_id : null,
        cost_center_id: (formData.is_bank || formData.is_cash) && formData.cost_center_id ? formData.cost_center_id : null,
      }

      if (editingId) {
        const { error } = await supabase.from("chart_of_accounts").update(payload).eq("id", editingId)
        if (error) throw error
        toastActionSuccess(toast, "التحديث", "الحساب")
      } else {
        const { error } = await supabase.from("chart_of_accounts").insert([{ ...payload, company_id: companyId }])
        if (error) throw error
        toastActionSuccess(toast, "الإنشاء", "الحساب")
      }

      setIsDialogOpen(false)
      setEditingId(null)
      setFormData({
        account_code: "",
        account_name: "",
        account_type: "asset",
        sub_type: "",
        is_cash: false,
        is_bank: false,
        parent_id: "",
        level: 1,
        description: "",
        opening_balance: 0,
        branch_id: "",
        cost_center_id: "",
      })
      setFormErrors({})
      loadAccounts()
    } catch (error) {
      console.error("Error saving account:", error)
      toastActionError(toast, editingId ? "التحديث" : "الإنشاء", "الحساب")
    }
  }

  const handleEdit = async (account: Account) => {
    try {
      // التأكد من تحميل الفروع ومراكز التكلفة قبل فتح النموذج
      try {
        const companyId = companyIdState || await getActiveCompanyId(supabase)
        if (companyId && (branches.length === 0 || costCenters.length === 0)) {
          await loadBranchesAndCostCenters(companyId)
        }
      } catch (error) {
        // في حالة انقطاع الاتصال، نفتح النموذج بدون تحميل الفروع ومراكز التكلفة
        console.warn("Could not load branches and cost centers, continuing anyway:", error)
      }

      setFormData({
        account_code: account.account_code,
        account_name: account.account_name,
        account_type: account.account_type,
        sub_type: account.sub_type || "",
        is_cash: String(account.sub_type || "").toLowerCase() === "cash",
        is_bank: String(account.sub_type || "").toLowerCase() === "bank",
        parent_id: account.parent_id || "",
        level: account.level ?? 1,
        description: account.description,
        opening_balance: account.opening_balance,
        branch_id: account.branch_id || "",
        cost_center_id: account.cost_center_id || "",
        normal_balance: account.account_type === 'asset' || account.account_type === 'expense' ? 'debit' : 'credit',
      })
      setEditingId(account.id)
      setIsDialogOpen(true)
    } catch (error) {
      console.error("Error in handleEdit:", error)
      toast({
        title: appLang === 'en' ? 'Error' : 'خطأ',
        description: appLang === 'en' ? 'Failed to open edit form. Please check your internet connection.' : 'فشل فتح نموذج التعديل. يرجى التحقق من اتصال الإنترنت.',
        variant: "destructive"
      })
    }
  }

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const requestDelete = (id: string) => { setPendingDeleteId(id); setConfirmOpen(true) }

  const handleDelete = async (id: string) => {
    const acc = accounts.find((a) => a.id === id)
    const hasChildren = accounts.some((a) => (a.parent_id ?? null) === id)
    if (hasChildren) {
      toast({ title: "تعذر الحذف", description: "لا يمكن حذف حساب أب أو حساب تجميعي. يرجى حذف/نقل الأبناء أولًا.", variant: "destructive" })
      return
    }
    try {
      const { error } = await supabase.from("chart_of_accounts").delete().eq("id", id)
      if (error) throw error
      loadAccounts()
      toastDeleteSuccess(toast, "الحساب")
    } catch (error: any) {
      const rawMsg = error?.message || error?.details || error?.hint || (() => { try { return JSON.stringify(error) } catch { return String(error) } })()
      const isFk = /foreign key|violat(es|ion).*foreign key/i.test(String(rawMsg))
      console.error("Error deleting account:", { error: rawMsg })
      if (isFk) {
        try {
          const { error: deactErr } = await supabase.from("chart_of_accounts").update({ is_active: false }).eq("id", id)
          if (deactErr) throw deactErr
          await loadAccounts()
          toastActionSuccess(toast, "التعطيل", "الحساب")
        } catch (deactError: any) {
          const deactMsg = deactError?.message || deactError?.details || String(deactError)
          toastDeleteError(toast, "الحساب", `لا يمكن حذف أو تعطيل الحساب بسبب ارتباطات: ${deactMsg}`)
        }
      } else {
        toastDeleteError(toast, "الحساب", rawMsg)
      }
    }
  }

  const deleteUnusedInventoryAccounts = async () => {
    try {
      setCleanupLoading(true)
      setCleanupSummary(null)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) { toastActionError(toast, "الحذف", "المخزون", "لا توجد شركة فعّالة"); setCleanupLoading(false); return }
      const parentIds = new Set((accounts || []).map((a) => a.parent_id).filter(Boolean))
      const leafInventory = (accounts || []).filter((a) => !parentIds.has(a.id) && String(a.sub_type || "").toLowerCase() === "inventory")
      let deletedCount = 0
      let deactivatedCount = 0
      const skipped: string[] = []
      for (const acc of leafInventory) {
        const opening = Number(acc.opening_balance || 0)
        if (opening !== 0) { skipped.push(`${acc.account_code} - ${acc.account_name} (رصيد افتتاحي)`); continue }
        const { data: usedLine } = await supabase.from("journal_entry_lines").select("id").eq("account_id", acc.id).limit(1)
        if (usedLine && usedLine.length > 0) { skipped.push(`${acc.account_code} - ${acc.account_name} (مستخدم في القيود)`); continue }
        try {
          const { error: delErr } = await supabase.from("chart_of_accounts").delete().eq("id", acc.id)
          if (delErr) throw delErr
          deletedCount++
        } catch (err: any) {
          const rawMsg = err?.message || err?.details || String(err)
          const isFk = /foreign key|violat(es|ion).*foreign key/i.test(String(rawMsg))
          if (isFk) {
            const { error: deactErr } = await supabase.from("chart_of_accounts").update({ is_active: false }).eq("id", acc.id)
            if (!deactErr) { deactivatedCount++ } else { skipped.push(`${acc.account_code} - ${acc.account_name} (فشل التعطيل)`) }
          } else {
            skipped.push(`${acc.account_code} - ${acc.account_name} (خطأ: ${rawMsg})`)
          }
        }
      }
      await loadAccounts()
      const summary = `تم حذف ${deletedCount} وتعطيل ${deactivatedCount}. تم تجاوز ${skipped.length}.`
      setCleanupSummary(summary)
      toastActionSuccess(toast, "تنظيف", "المخزون")
    } catch (error) {
      console.error("Cleanup inventory accounts error:", error)
      toastActionError(toast, "تنظيف", "المخزون")
    } finally { setCleanupLoading(false) }
  }

  const deriveType = (account: Account): string => {
    const base = (account.account_type || "").toLowerCase()
    if (account.sub_type === "cash" || account.sub_type === "bank") return "asset"
    if (["asset", "liability", "equity", "income", "expense"].includes(base)) return base
    return "asset"
  }

  const filteredAccounts = accounts.filter((account) => {
    const matchSearch = account.account_name.toLowerCase().includes(searchTerm.toLowerCase()) || account.account_code.toLowerCase().includes(searchTerm.toLowerCase())
    const matchType = filterType === "all" || deriveType(account) === filterType
    if (!(matchSearch && matchType)) return false
    if (showGroupsOnly) { return accounts.some((a) => (a.parent_id ?? null) === account.id) }
    return true
  })

  const typeLabel = (type: string) => {
    const useEn = hydrated && appLang === 'en'
    const map = useEn
      ? { asset: 'Assets', liability: 'Liabilities', equity: 'Equity', income: 'Income', expense: 'Expenses' }
      : { asset: 'أصول', liability: 'التزامات', equity: 'حقوق الملكية', income: 'الإيرادات', expense: 'المصروفات' }
    return (map as any)[type] || type
  }

  const subTypeLabel = (subType?: string | null) => {
    if (!subType) return null
    const key = String(subType).toLowerCase()
    const useEn = hydrated && appLang === 'en'
    const map = useEn ? {
      cash: 'Cash',
      bank: 'Bank',
      accounts_receivable: 'Accounts Receivable',
      accounts_payable: 'Accounts Payable',
      vat_input: 'VAT Input',
      vat_output: 'VAT Payable',
      excise_input: 'Excise (Input)',
      excise_output: 'Excise (Output)',
      tax_prepaid: 'Tax Prepaid',
      employee_advance: 'Employee Advance',
      prepaid_expense: 'Prepaid Expense',
      fixed_assets: 'Fixed Assets',
      capital: 'Capital',
      retained_earnings: 'Retained Earnings',
      sales_revenue: 'Sales Revenue',
      cogs: 'COGS',
      operating_expenses: 'Operating Expenses',
      inventory: 'Inventory',
    } : SUB_TYPE_LABELS
    return (map as any)[key] || subType
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      asset: "bg-blue-100 text-blue-800",
      liability: "bg-red-100 text-red-800",
      equity: "bg-purple-100 text-purple-800",
      income: "bg-green-100 text-green-800",
      expense: "bg-orange-100 text-orange-800",
    }
    return colors[type] || "bg-gray-100 text-gray-800"
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* رأس الصفحة - تحسين للهاتف */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-teal-100 dark:bg-teal-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <GitBranch className="w-5 h-5 sm:w-6 sm:h-6 text-teal-600 dark:text-teal-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Chart of Accounts' : 'الشجرة المحاسبية'}</h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Manage accounting structure and accounts' : 'إدارة الهيكل المحاسبي والحسابات'}</p>
                  {/* 🔐 Governance Notice - Chart of Accounts is company-wide */}
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1" suppressHydrationWarning>
                    {(hydrated && appLang === 'en') ? '👑 Company-wide accounts - All accounts visible' : '👑 حسابات على مستوى الشركة - جميع الحسابات مرئية'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="w-full sm:w-40 border rounded px-3 py-2 text-sm bg-white dark:bg-slate-900" />
                <Button variant="outline" onClick={() => quickAdd("bank")}>
                  <Banknote className="w-4 h-4 mr-2" /> {(hydrated && appLang === 'en') ? 'Quick bank account' : 'حساب بنكي سريع'}
                </Button>
                <Button variant="outline" onClick={() => quickAdd("cash")}>
                  <Wallet className="w-4 h-4 mr-2" /> {(hydrated && appLang === 'en') ? 'Quick company cash' : 'خزينة الشركة سريعة'}
                </Button>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  {permWrite ? (<DialogTrigger asChild>
                    <Button onClick={async () => {
                      try {
                        setEditingId(null)
                        setFormData({ account_code: "", account_name: "", account_type: "asset", sub_type: "", is_cash: false, is_bank: false, parent_id: "", level: 1, description: "", opening_balance: 0, branch_id: "", cost_center_id: "", normal_balance: "debit" })
                        setFormErrors({})
                        // التأكد من تحميل الفروع ومراكز التكلفة قبل فتح النموذج
                        try {
                          const companyId = companyIdState || await getActiveCompanyId(supabase)
                          if (companyId && (branches.length === 0 || costCenters.length === 0)) {
                            await loadBranchesAndCostCenters(companyId)
                          }
                        } catch (error) {
                          // في حالة انقطاع الاتصال، نفتح النموذج بدون تحميل الفروع ومراكز التكلفة
                          console.warn("Could not load branches and cost centers, continuing anyway:", error)
                        }
                      } catch (error) {
                        console.error("Error opening new account form:", error)
                        toast({
                          title: appLang === 'en' ? 'Error' : 'خطأ',
                          description: appLang === 'en' ? 'Failed to open form. Please check your internet connection.' : 'فشل فتح النموذج. يرجى التحقق من اتصال الإنترنت.',
                          variant: "destructive"
                        })
                      }
                    }}>
                      <Plus className="w-4 h-4 mr-2" />{(hydrated && appLang === 'en') ? 'New Account' : 'حساب جديد'}
                    </Button>
                  </DialogTrigger>) : null}
                  <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle suppressHydrationWarning>{editingId ? ((hydrated && appLang === 'en') ? 'Edit Account' : 'تعديل حساب') : ((hydrated && appLang === 'en') ? 'Add New Account' : 'إضافة حساب جديد')}</DialogTitle>
                      <DialogDescription suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Please fill the fields to add a new account.' : 'يرجى ملء الحقول لإضافة حساب جديد.'}</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="account_code">{appLang === 'en' ? 'Account Code' : 'رمز الحساب'}</Label>
                        <Input id="account_code" value={formData.account_code} onChange={(e) => setFormData({ ...formData, account_code: e.target.value })} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="account_name">{appLang === 'en' ? 'Account Name' : 'اسم الحساب'}</Label>
                        <Input id="account_name" value={formData.account_name} onChange={(e) => setFormData({ ...formData, account_name: e.target.value })} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="account_type">{appLang === 'en' ? 'Account Type' : 'نوع الحساب'}</Label>
                        <select id="account_type" value={formData.account_type} onChange={(e) => {
                          const newType = e.target.value
                          // تحديث normal_balance تلقائياً بناءً على نوع الحساب
                          const newNormalBalance = (newType === 'asset' || newType === 'expense') ? 'debit' : 'credit'
                          setFormData({ ...formData, account_type: newType, normal_balance: newNormalBalance })
                        }} className="w-full px-3 py-2 border rounded-lg">
                          {ACCOUNT_TYPES.map((type) => (<option key={type.value} value={type.value}>{type.label}</option>))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="parent_id">{appLang === 'en' ? 'Parent Account (optional)' : 'الحساب الأب (اختياري)'} </Label>
                        <select id="parent_id" value={formData.parent_id} onChange={(e) => {
                          const newParentId = e.target.value
                          const parentAcc = accounts.find((a) => a.id === newParentId)
                          setFormData({ ...formData, parent_id: newParentId, level: parentAcc ? ((parentAcc.level ?? 1) + 1) : 1 })
                        }} className="w-full px-3 py-2 border rounded-lg">
                          <option value="">لا يوجد</option>
                          {accounts.map((a) => (<option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="is_bank">{appLang === 'en' ? 'Bank Account' : 'حساب بنكي'}</Label>
                          <input id="is_bank" type="checkbox" checked={formData.is_bank} onChange={(e) => setFormData({ ...formData, is_bank: e.target.checked, sub_type: e.target.checked ? "bank" : formData.sub_type === "bank" ? "" : formData.sub_type })} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="is_cash">{appLang === 'en' ? 'Cash in Hand' : 'نقد بالصندوق'}</Label>
                          <input id="is_cash" type="checkbox" checked={formData.is_cash} onChange={(e) => setFormData({ ...formData, is_cash: e.target.checked, sub_type: e.target.checked ? "cash" : formData.sub_type === "cash" ? "" : formData.sub_type })} />
                        </div>
                      </div>
                      {/* Branch and Cost Center for Bank/Cash accounts */}
                      {(formData.is_bank || formData.is_cash) && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="branch_id">{appLang === 'en' ? 'Branch' : 'الفرع'}</Label>
                            <select
                              id="branch_id"
                              value={formData.branch_id}
                              onChange={(e) => setFormData({ ...formData, branch_id: e.target.value, cost_center_id: "" })}
                              className="w-full px-3 py-2 border rounded-lg"
                            >
                              <option value="">{appLang === 'en' ? 'Select Branch' : 'اختر الفرع'}</option>
                              {branches.map((b) => (<option key={b.id} value={b.id}>{b.code} - {b.name}</option>))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="cost_center_id">{appLang === 'en' ? 'Cost Center' : 'مركز التكلفة'}</Label>
                            <select
                              id="cost_center_id"
                              value={formData.cost_center_id}
                              onChange={(e) => setFormData({ ...formData, cost_center_id: e.target.value })}
                              className="w-full px-3 py-2 border rounded-lg"
                              disabled={!formData.branch_id}
                            >
                              <option value="">{appLang === 'en' ? 'Select Cost Center' : 'اختر مركز التكلفة'}</option>
                              {costCenters
                                .filter((cc) => !formData.branch_id || cc.branch_id === formData.branch_id)
                                .map((cc) => (<option key={cc.id} value={cc.id}>{cc.cost_center_code} - {cc.cost_center_name}</option>))}
                            </select>
                          </div>
                        </>
                      )}
                      <div className="space-y-2">
                        <Label htmlFor="description">{appLang === 'en' ? 'Description' : 'الوصف'}</Label>
                        <Input id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="opening_balance">{appLang === 'en' ? 'Opening Balance' : 'الرصيد الافتتاحي'}</Label>
                        <NumericInput
                          id="opening_balance"
                          step="0.01"
                          value={formData.opening_balance}
                          disabled={Boolean(editingId && accounts.some((a) => (a.parent_id ?? null) === editingId))}
                          onChange={(val) => {
                            setFormData({ ...formData, opening_balance: val })
                            setFormErrors({ ...formErrors, opening_balance: '' })
                          }}
                          allowNegative={true}
                          decimalPlaces={2}
                          className={formErrors.opening_balance ? 'border-red-500' : ''}
                        />
                        {formErrors.opening_balance && (
                          <p className="text-sm text-red-500">{formErrors.opening_balance}</p>
                        )}
                      </div>
                      <Button type="submit" className="w-full">{editingId ? (appLang === 'en' ? 'Update' : 'تحديث') : (appLang === 'en' ? 'Add' : 'إضافة')}</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <Input
                    placeholder="البحث عن حساب..."
                    value={searchTerm}
                    onChange={(e) => {
                      const val = e.target.value
                      startTransition(() => setSearchTerm(val))
                    }}
                    className={`flex-1 ${isPending ? 'opacity-70' : ''}`}
                  />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <select
                  value={filterType}
                  onChange={(e) => {
                    const val = e.target.value
                    startTransition(() => setFilterType(val))
                  }}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="all" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'All types' : 'جميع الأنواع'}</option>
                  {['asset', 'liability', 'equity', 'income', 'expense'].map((t) => (<option key={t} value={t}>{typeLabel(t)}</option>))}
                </select>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 flex items-center justify-between">
                <div className="text-sm text-gray-700 dark:text-gray-300" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Hierarchical View' : 'عرض هرمي'}</div>
                <div className="flex items-center gap-2"><span className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Show tree' : 'عرض الشجرة'}</span><Switch checked={showHierarchy} onCheckedChange={setShowHierarchy} /></div>
                <div className="flex items-center gap-2 mt-4"><span className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Show groups only' : 'عرض المجموعات فقط'}</span><Switch checked={showGroupsOnly} onCheckedChange={setShowGroupsOnly} /></div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {['asset', 'liability', 'equity', 'income', 'expense'].map((value) => {
              const count = accounts.filter((a) => deriveType(a) === value).length
              return (
                <Card key={value}>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">{typeLabel(value)}</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{count}</div></CardContent>
                </Card>
              )
            })}
          </div>

          <Card>
            <CardHeader><CardTitle suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Accounts' : 'الحسابات'}</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center py-8 text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</p>
              ) : filteredAccounts.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400 mb-4">{appLang === 'en' ? 'No accounts yet' : 'لا توجد حسابات حتى الآن'}</p>
                </div>
              ) : showHierarchy ? (
                <div className="space-y-2">
                  {(() => {
                    const renderTree = (parentId: string | null, lvl: number): React.ReactNode => {
                      const children = filteredAccounts.filter((a) => (a.parent_id ?? null) === parentId)
                      return children.map((acc) => (
                        <div key={acc.id} className="border-b py-2" style={{ paddingLeft: lvl * 16 }}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="font-medium">{acc.account_code}</span>
                              <span>{acc.account_name}</span>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(deriveType(acc))}`}>{typeLabel(deriveType(acc))}</span>
                              {accounts.some((a) => (a.parent_id ?? null) === acc.id) ? (<span className="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200">مجموعة</span>) : null}
                              {!accounts.some((a) => (a.parent_id ?? null) === acc.id) && getSubtypeLabel(acc.sub_type) ? (
                                <span className={`px-2 py-1 rounded text-xs font-medium ${getSubtypeColor(acc.sub_type)}`}>{subTypeLabel(acc.sub_type)}</span>
                              ) : null}
                              {/* Branch and Cost Center badges for bank/cash accounts */}
                              {(acc.sub_type === 'bank' || acc.sub_type === 'cash') && acc.branch_id && (
                                <span className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                  <Building2 className="w-3 h-3" />
                                  {branches.find(b => b.id === acc.branch_id)?.name || (appLang === 'en' ? 'Branch' : 'فرع')}
                                </span>
                              )}
                              {(acc.sub_type === 'bank' || acc.sub_type === 'cash') && acc.cost_center_id && (
                                <span className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                                  <MapPin className="w-3 h-3" />
                                  {costCenters.find(cc => cc.id === acc.cost_center_id)?.cost_center_name || (appLang === 'en' ? 'Cost Center' : 'مركز تكلفة')}
                                </span>
                              )}
                              <span className="text-xs text-gray-500 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Level:' : 'مستوى:'} {acc.level ?? 1}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-600 dark:text-gray-400">{accounts.some((a) => (a.parent_id ?? null) === acc.id) ? sumGroup(acc.id).toFixed(2) : (Number.isFinite(currentById[acc.id]) ? (currentById[acc.id]).toFixed(2) : acc.opening_balance.toFixed(2))}</span>
                              {permUpdate ? (<Button variant="outline" size="sm" onClick={() => handleEdit(acc)}><Edit2 className="w-4 h-4" /></Button>) : null}
                              {permDelete ? (<Button variant="outline" size="sm" onClick={() => requestDelete(acc.id)} className="text-red-600 hover:text-red-700" disabled={accounts.some((a) => (a.parent_id ?? null) === acc.id)}><Trash2 className="w-4 h-4" /></Button>) : null}
                            </div>
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">{acc.description}</div>
                          {renderTree(acc.id, lvl + 1)}
                        </div>
                      ))
                    }
                    return renderTree(null, 0)
                  })()}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[640px] w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Code' : 'الرمز'}</th>
                        <th className="px-4 py-3 text-right" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Name' : 'الاسم'}</th>
                        <th className="px-4 py-3 text-right" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Type' : 'النوع'}</th>
                        <th className="px-4 py-3 text-right" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Category' : 'الفئة'}</th>
                        <th className="px-4 py-3 text-right" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Nature' : 'صفة'}</th>
                        <th className="px-4 py-3 text-right" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Opening Balance' : 'الرصيد الافتتاحي'}</th>
                        <th className="px-4 py-3 text-right" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Current Balance' : 'الرصيد الحالي'}</th>
                        <th className="px-4 py-3 text-right" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Description' : 'الوصف'}</th>
                        <th className="px-4 py-3 text-right" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Actions' : 'الإجراءات'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAccounts.map((account) => (
                        <tr key={account.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3 font-medium">{account.account_code}</td>
                          <td className="px-4 py-3">{account.account_name}</td>
                          <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(deriveType(account))}`}>{typeLabel(deriveType(account))}</span></td>
                          <td className="px-4 py-3">
                            {!accounts.some((a) => (a.parent_id ?? null) === account.id) && subTypeLabel(account.sub_type) ? (
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getSubtypeColor(account.sub_type)}`}>{subTypeLabel(account.sub_type)}</span>
                            ) : (<span className="text-xs text-gray-500 dark:text-gray-400">-</span>)}
                          </td>
                          <td className="px-4 py-3">{accounts.some((a) => (a.parent_id ?? null) === account.id) ? (<span className="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Group' : 'مجموعة'}</span>) : (<span className="px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Posting' : 'تفصيلي'}</span>)}</td>
                          <td className="px-4 py-3">{accounts.some((a) => (a.parent_id ?? null) === account.id) ? "-" : account.opening_balance.toFixed(2)}</td>
                          <td className="px-4 py-3">{accounts.some((a) => (a.parent_id ?? null) === account.id) ? sumGroup(account.id).toFixed(2) : (Number.isFinite(currentById[account.id]) ? (currentById[account.id]).toFixed(2) : account.opening_balance.toFixed(2))}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{account.description}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2 flex-wrap">
                              {permUpdate ? (<Button variant="outline" size="sm" onClick={() => handleEdit(account)}><Edit2 className="w-4 h-4" /></Button>) : null}
                              {permDelete ? (<Button variant="outline" size="sm" onClick={() => requestDelete(account.id)} className="text-red-600 hover:text-red-700" disabled={accounts.some((a) => (a.parent_id ?? null) === account.id)}><Trash2 className="w-4 h-4" /></Button>) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent dir={appLang === 'en' ? 'ltr' : 'rtl'}>
            <AlertDialogHeader>
              <AlertDialogTitle>{appLang === 'en' ? 'Confirm Delete' : 'تأكيد الحذف'}</AlertDialogTitle>
              <AlertDialogDescription>{appLang === 'en' ? 'Are you sure you want to delete this account? This action cannot be undone.' : 'هل أنت متأكد من حذف هذا الحساب؟ لا يمكن التراجع عن هذا الإجراء.'}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</AlertDialogCancel>
              <AlertDialogAction onClick={() => { if (pendingDeleteId) { handleDelete(pendingDeleteId) } setConfirmOpen(false); setPendingDeleteId(null) }}>{appLang === 'en' ? 'Delete' : 'حذف'}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  )
}

export default ChartOfAccountsPage

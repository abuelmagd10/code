"use client"

import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { getActiveCompanyId } from "@/lib/company"
import { Settings, Moon, Sun, Users, Mail, Lock, Building2, Globe, Palette, ChevronRight, Camera, Upload, Shield, Percent, Wrench, Save, History, Download, UploadCloud, Database, FileJson, CheckCircle2, AlertCircle, Loader2, HardDrive, RefreshCcw, Calendar, FileText, Package, ShoppingCart, Truck, CreditCard, BookOpen, Users2 } from "lucide-react"
import { Progress } from "@/components/ui/progress"

export default function SettingsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const { resolvedTheme, setTheme } = useTheme()
  const router = useRouter()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [myCompanies, setMyCompanies] = useState<Array<{ id: string; name: string }>>([])
  const [currency, setCurrency] = useState<string>("EGP")
  const [language, setLanguage] = useState<string>("ar")
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState<string>("")
  const [address, setAddress] = useState<string>("")
  const [city, setCity] = useState<string>("")
  const [country, setCountry] = useState<string>("")
  const [phone, setPhone] = useState<string>("")
  const [taxId, setTaxId] = useState<string>("")
  const [logoUrl, setLogoUrl] = useState<string>("")
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const darkEnabled = resolvedTheme === "dark"
  const texts = {
    ar: {
      settings: "الإعدادات",
      customize: "تخصيص مظهر التطبيق وبيانات شركتك",
      appearance: "المظهر",
      darkMode: "الوضع الداكن",
      darkToggle: "تفعيل/تعطيل الوضع الداكن",
      usersPerms: "المستخدمون والصلاحيات",
      manageMembers: "إدارة أعضاء الشركة وأدوارهم",
      gotoUsersBtn: "الانتقال إلى إدارة المستخدمين",
      accountSettings: "إعدادات الحساب",
      email: "البريد الإلكتروني",
      changePassword: "تغيير كلمة المرور",
      updateEmail: "تحديث البريد الإلكتروني",
      companyData: "بيانات الشركة",
      companyName: "اسم الشركة",
      currencyLabel: "العملة",
      city: "المدينة",
      country: "الدولة",
      phone: "رقم الهاتف",
      taxIdLabel: "الرقم الضريبي",
      address: "العنوان",
      saveChanges: "حفظ التغييرات",
      appLanguage: "لغة التطبيق",
      arabic: "العربية",
      english: "English",
    },
    en: {
      settings: "Settings",
      customize: "Customize app appearance and your company data",
      appearance: "Appearance",
      darkMode: "Dark Mode",
      darkToggle: "Enable/disable dark mode",
      usersPerms: "Users & Permissions",
      manageMembers: "Manage company members and roles",
      gotoUsersBtn: "Go to Users Management",
      accountSettings: "Account Settings",
      email: "Email",
      changePassword: "Change Password",
      updateEmail: "Update Email",
      companyData: "Company Information",
      companyName: "Company Name",
      currencyLabel: "Currency",
      city: "City",
      country: "Country",
      phone: "Phone",
      taxIdLabel: "Tax ID",
      address: "Address",
      saveChanges: "Save Changes",
      appLanguage: "App Language",
      arabic: "Arabic",
      english: "English",
    }
  }
  const L = language === "en" ? texts.en : texts.ar

  const [isChangePassOpen, setIsChangePassOpen] = useState(false)
  const [isUpdateEmailOpen, setIsUpdateEmailOpen] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [newEmailField, setNewEmailField] = useState("")
  const [accountSaving, setAccountSaving] = useState(false)

  // Backup states
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [importProgress, setImportProgress] = useState(0)
  const [backupStats, setBackupStats] = useState<Record<string, number>>({})
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null)
  const [isBackupDialogOpen, setIsBackupDialogOpen] = useState(false)
  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [restorePreview, setRestorePreview] = useState<Record<string, number> | null>(null)
  const backupFileInputRef = useRef<HTMLInputElement | null>(null)

  // Load last backup date
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const lastBackup = localStorage.getItem('last_backup_date')
      if (lastBackup) setLastBackupDate(lastBackup)
    }
  }, [])

  // Export backup function
  const handleExportBackup = async () => {
    if (!companyId) {
      toastActionError(toast, language === 'en' ? 'Export' : 'التصدير', language === 'en' ? 'Backup' : 'النسخة الاحتياطية', language === 'en' ? 'No active company' : 'لا توجد شركة نشطة')
      return
    }

    try {
      setIsExporting(true)
      setExportProgress(0)
      setIsBackupDialogOpen(true)

      const tables = [
        { name: 'companies', label: language === 'en' ? 'Company Data' : 'بيانات الشركة', icon: 'Building2' },
        { name: 'customers', label: language === 'en' ? 'Customers' : 'العملاء', icon: 'Users' },
        { name: 'vendors', label: language === 'en' ? 'Vendors' : 'الموردين', icon: 'Truck' },
        { name: 'products', label: language === 'en' ? 'Products' : 'المنتجات', icon: 'Package' },
        { name: 'invoices', label: language === 'en' ? 'Invoices' : 'الفواتير', icon: 'FileText' },
        { name: 'invoice_items', label: language === 'en' ? 'Invoice Items' : 'عناصر الفواتير', icon: 'FileText' },
        { name: 'bills', label: language === 'en' ? 'Bills' : 'فواتير الموردين', icon: 'FileText' },
        { name: 'bill_items', label: language === 'en' ? 'Bill Items' : 'عناصر فواتير الموردين', icon: 'FileText' },
        { name: 'payments', label: language === 'en' ? 'Payments' : 'المدفوعات', icon: 'CreditCard' },
        { name: 'journal_entries', label: language === 'en' ? 'Journal Entries' : 'القيود اليومية', icon: 'BookOpen' },
        { name: 'journal_entry_lines', label: language === 'en' ? 'Journal Lines' : 'سطور القيود', icon: 'BookOpen' },
        { name: 'accounts', label: language === 'en' ? 'Chart of Accounts' : 'دليل الحسابات', icon: 'BookOpen' },
        { name: 'inventory_transactions', label: language === 'en' ? 'Inventory Transactions' : 'حركات المخزون', icon: 'Package' },
        { name: 'bank_accounts', label: language === 'en' ? 'Bank Accounts' : 'الحسابات البنكية', icon: 'CreditCard' },
        { name: 'bank_transactions', label: language === 'en' ? 'Bank Transactions' : 'المعاملات البنكية', icon: 'CreditCard' },
        { name: 'employees', label: language === 'en' ? 'Employees' : 'الموظفين', icon: 'Users' },
        { name: 'shareholders', label: language === 'en' ? 'Shareholders' : 'المساهمون', icon: 'Users' },
        { name: 'estimates', label: language === 'en' ? 'Estimates' : 'العروض السعرية', icon: 'FileText' },
        { name: 'sales_orders', label: language === 'en' ? 'Sales Orders' : 'أوامر البيع', icon: 'ShoppingCart' },
        { name: 'purchase_orders', label: language === 'en' ? 'Purchase Orders' : 'أوامر الشراء', icon: 'Truck' },
        { name: 'credit_notes', label: language === 'en' ? 'Credit Notes' : 'إشعارات الدائن', icon: 'FileText' },
        { name: 'sales_returns', label: language === 'en' ? 'Sales Returns' : 'مرتجعات المبيعات', icon: 'RefreshCcw' },
      ]

      const backupData: Record<string, any[]> = {}
      const stats: Record<string, number> = {}
      let progress = 0
      const progressStep = 100 / tables.length

      for (const table of tables) {
        try {
          const { data, error } = await supabase
            .from(table.name)
            .select('*')
            .eq('company_id', companyId)

          if (!error && data) {
            backupData[table.name] = data
            stats[table.name] = data.length
          } else {
            backupData[table.name] = []
            stats[table.name] = 0
          }
        } catch {
          backupData[table.name] = []
          stats[table.name] = 0
        }
        progress += progressStep
        setExportProgress(Math.min(progress, 95))
        await new Promise(r => setTimeout(r, 50))
      }

      // Get company info separately (no company_id filter)
      try {
        const { data: companyData } = await supabase
          .from('companies')
          .select('*')
          .eq('id', companyId)
          .single()
        if (companyData) {
          backupData['companies'] = [companyData]
          stats['companies'] = 1
        }
      } catch {}

      setExportProgress(100)
      setBackupStats(stats)

      // Create backup file
      const backup = {
        version: '1.0',
        created_at: new Date().toISOString(),
        company_id: companyId,
        company_name: name || 'Unknown',
        tables: backupData,
        stats: stats
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backup_${name?.replace(/\s+/g, '_') || 'company'}_${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // Save last backup date
      const now = new Date().toISOString()
      localStorage.setItem('last_backup_date', now)
      setLastBackupDate(now)

      toastActionSuccess(toast, language === 'en' ? 'Export' : 'التصدير', language === 'en' ? 'Backup' : 'النسخة الاحتياطية')
    } catch (err: any) {
      console.error('Backup error:', err)
      toastActionError(toast, language === 'en' ? 'Export' : 'التصدير', language === 'en' ? 'Backup' : 'النسخة الاحتياطية', err?.message)
    } finally {
      setIsExporting(false)
      setTimeout(() => setIsBackupDialogOpen(false), 2000)
    }
  }

  // Handle file selection for restore
  const handleRestoreFileSelect = async (file: File) => {
    try {
      const text = await file.text()
      const data = JSON.parse(text)

      if (!data.version || !data.tables || !data.company_id) {
        toastActionError(toast, language === 'en' ? 'Import' : 'الاستيراد', language === 'en' ? 'Backup' : 'النسخة الاحتياطية', language === 'en' ? 'Invalid backup file format' : 'تنسيق ملف النسخة الاحتياطية غير صالح')
        return
      }

      setRestoreFile(file)
      setRestorePreview(data.stats || {})
      setIsRestoreDialogOpen(true)
    } catch (err: any) {
      toastActionError(toast, language === 'en' ? 'Import' : 'الاستيراد', language === 'en' ? 'Backup' : 'النسخة الاحتياطية', language === 'en' ? 'Error reading backup file' : 'خطأ في قراءة ملف النسخة الاحتياطية')
    }
  }

  // Import/Restore backup function
  const handleImportBackup = async () => {
    if (!restoreFile || !companyId) return

    try {
      setIsImporting(true)
      setImportProgress(0)

      const text = await restoreFile.text()
      const backup = JSON.parse(text)

      const tables = Object.keys(backup.tables).filter(t => t !== 'companies')
      let progress = 0
      const progressStep = 100 / tables.length

      for (const tableName of tables) {
        const records = backup.tables[tableName]
        if (Array.isArray(records) && records.length > 0) {
          // Update company_id for all records
          const updatedRecords = records.map((r: any) => ({
            ...r,
            company_id: companyId,
            id: undefined // Remove id to let Supabase generate new ones
          }))

          try {
            // Try to upsert (some tables might have unique constraints)
            const { error } = await supabase
              .from(tableName)
              .upsert(updatedRecords, { onConflict: 'id', ignoreDuplicates: true })

            if (error) {
              console.warn(`Warning restoring ${tableName}:`, error.message)
            }
          } catch (e) {
            console.warn(`Error restoring ${tableName}:`, e)
          }
        }
        progress += progressStep
        setImportProgress(Math.min(progress, 95))
        await new Promise(r => setTimeout(r, 100))
      }

      setImportProgress(100)
      toastActionSuccess(toast, language === 'en' ? 'Import' : 'الاستيراد', language === 'en' ? 'Backup restored successfully' : 'تم استعادة النسخة الاحتياطية بنجاح')

      // Reload page after successful import
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    } catch (err: any) {
      console.error('Restore error:', err)
      toastActionError(toast, language === 'en' ? 'Import' : 'الاستيراد', language === 'en' ? 'Backup' : 'النسخة الاحتياطية', err?.message)
    } finally {
      setIsImporting(false)
      setIsRestoreDialogOpen(false)
      setRestoreFile(null)
      setRestorePreview(null)
    }
  }

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dir = language === "en" ? "ltr" : "rtl"
      document.documentElement.lang = language === "en" ? "en" : "ar"
    }
  }, [language])

  useEffect(() => {
    const loadCompany = async () => {
      try {
        setLoading(true)
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user) {
          setUserId(user.id)
          setUserEmail(user.email)
        }

        // استخدم دالة موحدة للحصول على company_id حتى بدون جلسة
        const cid = await getActiveCompanyId(supabase)
        if (cid) {
          setCompanyId(cid)
          const { data: company } = await supabase
            .from("companies")
            .select("*")
            .eq("id", cid)
            .maybeSingle()
          if (company) {
            setCurrency(company.currency || "EGP")
            setName(company.name || "")
            setAddress(company.address || "")
            setCity(company.city || "")
            setCountry(company.country || "")
            setPhone(company.phone || "")
            setTaxId(company.tax_id || "")
            setLanguage((company as any).language || (typeof window !== 'undefined' ? (localStorage.getItem('app_language') || 'ar') : 'ar'))
            const lu = (company as any).logo_url || (typeof window !== 'undefined' ? localStorage.getItem('company_logo_url') : '') || ''
            setLogoUrl(lu || '')
            try {
              if (user?.id) {
                const { data: exists } = await supabase
                  .from("company_members")
                  .select("id")
                  .eq("company_id", cid)
                  .eq("user_id", user.id)
                  .limit(1)
                const hasMembership = Array.isArray(exists) && exists.length > 0
                if (!hasMembership) {
                  await supabase
                    .from("company_members")
                    .insert({ company_id: cid, user_id: user.id, role: "owner" })
                }
              }
            } catch {}
            try {
              if (user?.id) {
                const { data: myMemberships } = await supabase
                  .from("company_members")
                  .select("company_id")
                  .eq("user_id", user.id)
                const ids = (myMemberships || []).map((m: any) => String(m.company_id)).filter(Boolean)
                if (ids.length > 0) {
                  const { data: companies } = await supabase
                    .from("companies")
                    .select("id,name")
                    .in("id", ids)
                  setMyCompanies(((companies || []) as any).map((c: any) => ({ id: String(c.id), name: String(c.name || "شركة") })))
                }
              }
            } catch {}
          } else {
            try {
              const res = await fetch('/api/my-company', { method: 'GET' })
              const js = await res.json()
              if (res.ok && js?.company?.id) {
                const c = js.company
                setCompanyId(String(c.id))
                setCurrency(c.currency || "EGP")
                setName(c.name || "")
                setAddress(c.address || "")
                setCity(c.city || "")
                setCountry(c.country || "")
                setPhone(c.phone || "")
                setTaxId(c.tax_id || "")
                setLanguage(String(c.language || (typeof window !== 'undefined' ? (localStorage.getItem('app_language') || 'ar') : 'ar')))
                const lu2 = String(c.logo_url || (typeof window !== 'undefined' ? localStorage.getItem('company_logo_url') : '') || '')
                setLogoUrl(lu2 || '')
                try {
                  if (user?.id) {
                    const { data: myMemberships } = await supabase
                      .from("company_members")
                      .select("company_id")
                      .eq("user_id", user.id)
                    const ids = (myMemberships || []).map((m: any) => String(m.company_id)).filter(Boolean)
                    if (ids.length > 0) {
                      const { data: companies } = await supabase
                        .from("companies")
                        .select("id,name")
                        .in("id", ids)
                      setMyCompanies(((companies || []) as any).map((c: any) => ({ id: String(c.id), name: String(c.name || "شركة") })))
                    }
                  }
                } catch {}
              }
            } catch {}
            try {
              if (user?.id) {
                const { data: myMemberships } = await supabase
                  .from("company_members")
                  .select("company_id")
                  .eq("user_id", user.id)
                const ids = (myMemberships || []).map((m: any) => String(m.company_id)).filter(Boolean)
                if (ids.length > 0) {
                  const { data: companies } = await supabase
                    .from("companies")
                    .select("*")
                    .in("id", ids)
                    .limit(1)
                  const c = (Array.isArray(companies) ? companies[0] : null) as any
                  if (c) {
                    setCompanyId(String(c.id))
                    setCurrency(c.currency || "EGP")
                    setName(c.name || "")
                    setAddress(c.address || "")
                    setCity(c.city || "")
                    setCountry(c.country || "")
                    setPhone(c.phone || "")
                    setTaxId(c.tax_id || "")
                    setLanguage(String(c.language || (typeof window !== 'undefined' ? (localStorage.getItem('app_language') || 'ar') : 'ar')))
                    const lu2 = String(c.logo_url || (typeof window !== 'undefined' ? localStorage.getItem('company_logo_url') : '') || '')
                    setLogoUrl(lu2 || '')
                    try { setMyCompanies([{ id: String(c.id), name: String(c.name || 'شركة') }]) } catch {}
                  }
                }
              }
            } catch {}
          }
        }
      } finally {
        setLoading(false)
      }
    }
    loadCompany()
  }, [supabase])

  const handleSave = async () => {
    try {
      setSaving(true)
      // If company exists, update it; otherwise create a new one for this user
      if (companyId) {
        const { error } = await supabase
          .from("companies")
          .update({ name, address, city, country, phone, tax_id: taxId, currency, language, logo_url: logoUrl || null })
          .eq("id", companyId)
        if (error) {
          const msg = String(error.message || "")
          const looksMissingLanguage = msg.toLowerCase().includes("language") && (msg.toLowerCase().includes("column") || msg.toLowerCase().includes("does not exist"))
          const looksMissingLogo = msg.toLowerCase().includes("logo_url") && (msg.toLowerCase().includes("column") || msg.toLowerCase().includes("does not exist"))
          if ((looksMissingLanguage || looksMissingLogo) && typeof window !== 'undefined') {
            try { localStorage.setItem('app_language', language) } catch {}
            try { localStorage.setItem('company_name', name || '') } catch {}
            try { if (logoUrl) localStorage.setItem('company_logo_url', logoUrl) } catch {}
            toastActionSuccess(toast, "الحفظ", "الإعدادات")
            try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('company_updated')) } catch {}
          } else {
            throw error
          }
        } else {
          if (typeof window !== 'undefined') { try { localStorage.setItem('app_language', language) } catch {} }
          if (typeof window !== 'undefined') { try { localStorage.setItem('company_name', name || '') } catch {} }
          if (typeof window !== 'undefined') { try { if (logoUrl) localStorage.setItem('company_logo_url', logoUrl) } catch {} }
          toastActionSuccess(toast, "الحفظ", "الإعدادات")
          try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('company_updated')) } catch {}
        }
      } else {
        if (!userId || !userEmail) {
          toast({ title: "غير مسجل", description: "يجب تسجيل الدخول لحفظ الإعدادات" })
          return
        }
        const { data, error } = await supabase
          .from("companies")
          .insert({ user_id: userId, name: name || "الشركة", email: userEmail, address, city, country, phone, tax_id: taxId, currency, language, logo_url: logoUrl || null })
          .select("id")
          .single()
        if (error) throw error
        setCompanyId(data.id)
        try {
          await supabase
            .from("company_members")
            .insert({ company_id: data.id, user_id: userId, role: "owner" })
        } catch {}
        if (typeof window !== 'undefined') { try { localStorage.setItem('app_language', language) } catch {} }
        if (typeof window !== 'undefined') { try { localStorage.setItem('company_name', name || '') } catch {} }
        if (typeof window !== 'undefined') { try { if (logoUrl) localStorage.setItem('company_logo_url', logoUrl) } catch {} }
        toastActionSuccess(toast, "الإنشاء", "الشركة")
        try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('company_updated')) } catch {}
      }
    } catch (err: any) {
      console.error(err)
      toastActionError(toast, "الحفظ", "الإعدادات", err?.message || undefined)
    } finally {
      setSaving(false)
    }
  }

  const handleLogoUpload = async (file: File) => {
    if (!file || !companyId) return
    try {
      setUploadingLogo(true)
      const fd = new FormData()
      fd.append('file', file)
      fd.append('company_id', companyId)
      const res = await fetch('/api/company-logo', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(String(json?.error || 'upload_failed'))
      const url = String(json?.url || '')
      setLogoUrl(url)
      toastActionSuccess(toast, "رفع", "الشعار")
      try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('company_updated')) } catch {}
    } catch (e: any) {
      toastActionError(toast, "رفع", "الشعار", e?.message || undefined)
    } finally { setUploadingLogo(false) }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8 space-y-6">
        {/* رأس الصفحة */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl shadow-lg shadow-violet-500/20">
                  <Settings className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{L.settings}</h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{L.customize}</p>
                </div>
              </div>
              <Badge variant="outline" className="hidden sm:flex items-center gap-1 px-3 py-1.5 border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-300">
                <Globe className="w-3.5 h-3.5" />
                {language === 'en' ? 'English' : 'العربية'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* روابط سريعة */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Link href="/settings/users" className="group">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group-hover:border-blue-200 dark:group-hover:border-blue-800">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg group-hover:scale-110 transition-transform">
                  <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{L.usersPerms}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
              </CardContent>
            </Card>
          </Link>
          <Link href="/settings/taxes" className="group">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group-hover:border-green-200 dark:group-hover:border-green-800">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg group-hover:scale-110 transition-transform">
                  <Percent className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{language === 'en' ? 'Taxes' : 'الضرائب'}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-green-500 transition-colors" />
              </CardContent>
            </Card>
          </Link>
          <Link href="/settings/maintenance" className="group">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group-hover:border-amber-200 dark:group-hover:border-amber-800">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg group-hover:scale-110 transition-transform">
                  <Wrench className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{language === 'en' ? 'Maintenance' : 'الصيانة'}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-amber-500 transition-colors" />
              </CardContent>
            </Card>
          </Link>
          <Link href="/settings/audit-log" className="group">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group-hover:border-purple-200 dark:group-hover:border-purple-800">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg group-hover:scale-110 transition-transform">
                  <History className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{language === 'en' ? 'Audit Log' : 'سجل المراجعة'}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-purple-500 transition-colors" />
              </CardContent>
            </Card>
          </Link>
          <div className="group">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg transition-all ${darkEnabled ? 'bg-slate-800' : 'bg-amber-100'}`}>
                  {darkEnabled ? <Moon className="w-5 h-5 text-violet-400" /> : <Sun className="w-5 h-5 text-amber-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{L.darkMode}</p>
                </div>
                <Switch
                  checked={!!darkEnabled}
                  onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* إعدادات الحساب */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg">
                  <Shield className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                </div>
                <CardTitle className="text-base">{L.accountSettings}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Mail className="w-4 h-4" />
                  {L.email}
                </Label>
                <Input value={userEmail || (language === 'en' ? 'Not logged in' : 'غير مسجل')} disabled className="bg-gray-50 dark:bg-slate-800" />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setIsChangePassOpen(true)} className="flex-1 gap-2">
                  <Lock className="w-4 h-4" />
                  {L.changePassword}
                </Button>
                <Button variant="outline" onClick={() => setIsUpdateEmailOpen(true)} className="flex-1 gap-2">
                  <Mail className="w-4 h-4" />
                  {L.updateEmail}
                </Button>
              </div>
            </CardContent>
          </Card>

        <Dialog open={isChangePassOpen} onOpenChange={setIsChangePassOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{language==='en' ? 'Change Password' : 'تغيير كلمة المرور'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>{language==='en' ? 'New Password' : 'كلمة المرور الجديدة'}</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{language==='en' ? 'Confirm Password' : 'تأكيد كلمة المرور'}</Label>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsChangePassOpen(false)}>{language==='en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button
                onClick={async () => {
                  if (!newPassword || newPassword.length < 6) { toastActionError(toast, language==='en' ? 'Update' : 'التحديث', language==='en' ? 'Password' : 'كلمة المرور', language==='en' ? 'Password must be at least 6 characters' : 'يجب أن تكون كلمة المرور 6 أحرف على الأقل'); return }
                  if (newPassword !== confirmPassword) { toastActionError(toast, language==='en' ? 'Update' : 'التحديث', language==='en' ? 'Password' : 'كلمة المرور', language==='en' ? 'Passwords do not match' : 'كلمتا المرور غير متطابقتين'); return }
                  try {
                    setAccountSaving(true)
                    const { error } = await supabase.auth.updateUser({ password: newPassword })
                    if (error) { toastActionError(toast, language==='en' ? 'Update' : 'التحديث', language==='en' ? 'Password' : 'كلمة المرور', error.message || undefined); return }
                    setNewPassword("")
                    setConfirmPassword("")
                    setIsChangePassOpen(false)
                    toastActionSuccess(toast, language==='en' ? 'Update' : 'التحديث', language==='en' ? 'Password' : 'كلمة المرور')
                  } finally { setAccountSaving(false) }
                }}
                disabled={accountSaving}
              >{accountSaving ? (language==='en' ? 'Saving...' : 'جاري الحفظ...') : (language==='en' ? 'Save' : 'حفظ')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isUpdateEmailOpen} onOpenChange={setIsUpdateEmailOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{language==='en' ? 'Update Email' : 'تحديث البريد الإلكتروني'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>{language==='en' ? 'New Email' : 'البريد الإلكتروني الجديد'}</Label>
                <Input type="email" value={newEmailField} onChange={(e) => setNewEmailField(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsUpdateEmailOpen(false)}>{language==='en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button
                onClick={async () => {
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
                  const newEmail = (newEmailField || '').trim()
                  if (!emailRegex.test(newEmail)) { toastActionError(toast, language==='en' ? 'Update' : 'التحديث', language==='en' ? 'Email' : 'البريد الإلكتروني', language==='en' ? 'Invalid email address' : 'البريد الإلكتروني غير صالح'); return }
                  try {
                    setAccountSaving(true)
                    if (companyId) {
                      const { data: exists } = await supabase
                        .from('company_members')
                        .select('user_id')
                        .eq('company_id', companyId)
                        .eq('email', newEmail)
                      const conflict = Array.isArray(exists) && exists.some((r: any) => String(r.user_id || '') !== String(userId || ''))
                      if (conflict) { toastActionError(toast, language==='en' ? 'Update' : 'التحديث', language==='en' ? 'Email' : 'البريد الإلكتروني', language==='en' ? 'Email already exists in this company' : 'البريد مستخدم بالفعل في هذه الشركة'); return }
                    }
                    const { error } = await supabase.auth.updateUser({ email: newEmail })
                    if (error) { toastActionError(toast, language==='en' ? 'Update' : 'التحديث', language==='en' ? 'Email' : 'البريد الإلكتروني', error.message || undefined); return }
                    if (companyId && userId) {
                      await supabase
                        .from('company_members')
                        .update({ email: newEmail })
                        .eq('company_id', companyId)
                        .eq('user_id', userId)
                    }
                    setIsUpdateEmailOpen(false)
                    setNewEmailField("")
                    setUserEmail(newEmail)
                    toastActionSuccess(toast, language==='en' ? 'Update' : 'التحديث', language==='en' ? 'Email' : 'البريد الإلكتروني')
                  } finally { setAccountSaving(false) }
                }}
                disabled={accountSaving}
              >{accountSaving ? (language==='en' ? 'Saving...' : 'جاري الحفظ...') : (language==='en' ? 'Save' : 'حفظ')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

          {/* بيانات الشركة */}
          <Card className="lg:col-span-2 bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
                  <Building2 className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <CardTitle className="text-base">{L.companyData}</CardTitle>
              </div>
            </CardHeader>
          <CardContent className="pt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {myCompanies.length > 0 && (
              <div className="space-y-2 md:col-span-2">
                <Label className="text-gray-600 dark:text-gray-400">{language==='en' ? 'Active company' : 'الشركة الحالية'}</Label>
                <Select value={companyId || ''} onValueChange={(val) => {
                  setCompanyId(val)
                  try { if (typeof window !== 'undefined') localStorage.setItem('active_company_id', val) } catch {}
                  try { document.cookie = `active_company_id=${val}; path=/; max-age=31536000` } catch {}
                  try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('company_updated')) } catch {}
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {myCompanies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* شعار الشركة */}
            <div className="space-y-3 md:col-span-2">
              <Label className="text-gray-600 dark:text-gray-400">{language === 'en' ? 'Company Logo' : 'شعار الشركة'}</Label>
              <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-slate-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-slate-700">
                {logoUrl ? (
                  <div className="relative group">
                    <img src={logoUrl} alt="Company Logo" className="h-16 w-16 rounded-xl object-cover border-2 border-white shadow-lg" />
                    <div className="absolute inset-0 bg-black/50 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}>
                      <Camera className="w-5 h-5 text-white" />
                    </div>
                  </div>
                ) : (
                  <div
                    className="h-16 w-16 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30 flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-6 h-6 text-violet-500" />
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f) }}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{logoUrl ? (language==='en' ? 'Logo uploaded' : 'تم رفع الشعار') : (language==='en' ? 'Upload logo' : 'رفع الشعار')}</p>
                  <p className="text-xs text-gray-500 mt-1">{language==='en' ? 'PNG, JPG up to 2MB' : 'PNG, JPG حتى 2 ميجا'}</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingLogo || !companyId}
                  className="gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {uploadingLogo ? (language==='en' ? 'Uploading...' : 'جاري الرفع...') : (language==='en' ? 'Browse' : 'استعراض')}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-600 dark:text-gray-400">{L.companyName}</Label>
              <Input placeholder={language==='en' ? 'Company name' : 'اسم الشركة'} value={name} onChange={(e) => setName(e.target.value)} className="bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700" />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-600 dark:text-gray-400">{L.currencyLabel}</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v)} disabled={loading}>
                <SelectTrigger className="w-full bg-gray-50 dark:bg-slate-800">
                  <SelectValue placeholder={language==='en' ? 'Select currency' : 'اختر العملة'} />
                </SelectTrigger>
                <SelectContent position="item-aligned">
                  <SelectItem value="EGP">{language === 'en' ? 'Egyptian Pound (EGP)' : 'الجنيه المصري (EGP)'}</SelectItem>
                  <SelectItem value="USD">{language === 'en' ? 'US Dollar (USD)' : 'الدولار الأمريكي (USD)'}</SelectItem>
                  <SelectItem value="EUR">{language === 'en' ? 'Euro (EUR)' : 'اليورو (EUR)'}</SelectItem>
                  <SelectItem value="SAR">{language === 'en' ? 'Saudi Riyal (SAR)' : 'الريال السعودي (SAR)'}</SelectItem>
                  <SelectItem value="AED">{language === 'en' ? 'UAE Dirham (AED)' : 'الدرهم الإماراتي (AED)'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                <Globe className="w-4 h-4" />
                {L.appLanguage}
              </Label>
              <Select value={language} onValueChange={(v) => { setLanguage(v); try { localStorage.setItem('app_language', v); document.cookie = `app_language=${v}; path=/; max-age=31536000`; window.dispatchEvent(new Event('app_language_changed')) } catch {} }} disabled={loading}>
                <SelectTrigger className="w-full bg-gray-50 dark:bg-slate-800">
                  <SelectValue placeholder={language==='en' ? 'Select language' : 'اختر اللغة'} />
                </SelectTrigger>
                <SelectContent position="item-aligned">
                  <SelectItem value="ar">{L.arabic}</SelectItem>
                  <SelectItem value="en">{L.english}</SelectItem>
                </SelectContent>
              </Select>
            </div>
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400">{L.city}</Label>
                <Input placeholder={language==='en' ? 'City' : 'المدينة'} value={city} onChange={(e) => setCity(e.target.value)} className="bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400">{L.country}</Label>
                <Input placeholder={language==='en' ? 'Country' : 'الدولة'} value={country} onChange={(e) => setCountry(e.target.value)} className="bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400">{L.phone}</Label>
                <Input placeholder={language==='en' ? 'Phone number' : 'رقم الهاتف'} value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400">{L.taxIdLabel}</Label>
                <Input placeholder={language==='en' ? 'Tax ID' : 'الرقم الضريبي'} value={taxId} onChange={(e) => setTaxId(e.target.value)} className="bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-gray-600 dark:text-gray-400">{L.address}</Label>
                <Input placeholder={language==='en' ? 'Address' : 'العنوان'} value={address} onChange={(e) => setAddress(e.target.value)} className="bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700" />
              </div>
              <div className="md:col-span-2 pt-4 border-t border-gray-100 dark:border-slate-800">
                <Button
                  className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-lg shadow-violet-500/20"
                  onClick={handleSave}
                  disabled={saving || loading || !name.trim()}
                >
                  <Save className="w-4 h-4" />
                  {saving ? (language === 'en' ? 'Saving...' : 'جاري الحفظ...') : L.saveChanges}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* قسم النسخ الاحتياطي */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
          <CardHeader className="border-b border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg shadow-lg shadow-emerald-500/20">
                  <Database className="w-5 h-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">{language === 'en' ? 'Backup & Restore' : 'النسخ الاحتياطي والاستعادة'}</CardTitle>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {language === 'en' ? 'Export or import your company data' : 'تصدير أو استيراد بيانات شركتك'}
                  </p>
                </div>
              </div>
              {lastBackupDate && (
                <Badge variant="outline" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                  <Calendar className="w-3.5 h-3.5" />
                  {language === 'en' ? 'Last backup: ' : 'آخر نسخة: '}
                  {new Date(lastBackupDate).toLocaleDateString(language === 'en' ? 'en-US' : 'ar-EG')}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* تصدير النسخة الاحتياطية */}
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl blur-xl opacity-20 group-hover:opacity-30 transition-opacity" />
                <div className="relative p-6 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-white dark:bg-slate-800 rounded-xl shadow-lg">
                      <Download className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                        {language === 'en' ? 'Export Backup' : 'تصدير نسخة احتياطية'}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {language === 'en'
                          ? 'Download a complete backup of all your company data as a JSON file'
                          : 'تحميل نسخة احتياطية كاملة من جميع بيانات شركتك كملف JSON'}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <Users2 className="w-3 h-3" />
                          {language === 'en' ? 'Customers' : 'العملاء'}
                        </Badge>
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <FileText className="w-3 h-3" />
                          {language === 'en' ? 'Invoices' : 'الفواتير'}
                        </Badge>
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <Package className="w-3 h-3" />
                          {language === 'en' ? 'Products' : 'المنتجات'}
                        </Badge>
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <BookOpen className="w-3 h-3" />
                          {language === 'en' ? 'Journal' : 'القيود'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button
                    className="w-full mt-4 gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/20"
                    onClick={handleExportBackup}
                    disabled={isExporting || !companyId}
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {language === 'en' ? 'Exporting...' : 'جاري التصدير...'}
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        {language === 'en' ? 'Download Backup' : 'تحميل النسخة الاحتياطية'}
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* استيراد النسخة الاحتياطية */}
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl blur-xl opacity-20 group-hover:opacity-30 transition-opacity" />
                <div className="relative p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl border border-blue-200 dark:border-blue-800">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-white dark:bg-slate-800 rounded-xl shadow-lg">
                      <UploadCloud className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                        {language === 'en' ? 'Restore Backup' : 'استعادة نسخة احتياطية'}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {language === 'en'
                          ? 'Upload a backup file to restore your company data'
                          : 'رفع ملف نسخة احتياطية لاستعادة بيانات شركتك'}
                      </p>
                      <div className="mt-3 p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg border border-amber-200 dark:border-amber-800">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            {language === 'en'
                              ? 'Warning: Restoring a backup may overwrite existing data'
                              : 'تحذير: قد تؤدي استعادة النسخة الاحتياطية إلى استبدال البيانات الموجودة'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <input
                    ref={backupFileInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleRestoreFileSelect(file)
                    }}
                  />
                  <Button
                    variant="outline"
                    className="w-full mt-4 gap-2 border-blue-300 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                    onClick={() => backupFileInputRef.current?.click()}
                    disabled={isImporting || !companyId}
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {language === 'en' ? 'Importing...' : 'جاري الاستيراد...'}
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-4 h-4" />
                        {language === 'en' ? 'Select Backup File' : 'اختيار ملف النسخة الاحتياطية'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* إحصائيات البيانات */}
            <div className="mt-6 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <HardDrive className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {language === 'en' ? 'Backup includes all company data:' : 'تشمل النسخة الاحتياطية جميع بيانات الشركة:'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                {[
                  { icon: Users2, label: language === 'en' ? 'Customers' : 'العملاء', color: 'blue' },
                  { icon: Truck, label: language === 'en' ? 'Vendors' : 'الموردين', color: 'orange' },
                  { icon: Package, label: language === 'en' ? 'Products' : 'المنتجات', color: 'purple' },
                  { icon: FileText, label: language === 'en' ? 'Invoices' : 'الفواتير', color: 'green' },
                  { icon: CreditCard, label: language === 'en' ? 'Payments' : 'المدفوعات', color: 'emerald' },
                  { icon: BookOpen, label: language === 'en' ? 'Journal' : 'القيود', color: 'indigo' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700">
                    <item.icon className={`w-4 h-4 text-${item.color}-500`} />
                    <span className="text-xs text-gray-600 dark:text-gray-400">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Export Progress Dialog */}
        <Dialog open={isBackupDialogOpen} onOpenChange={setIsBackupDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="w-5 h-5 text-emerald-600" />
                {language === 'en' ? 'Exporting Backup' : 'جاري تصدير النسخة الاحتياطية'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Progress value={exportProgress} className="h-2" />
              <p className="text-sm text-center text-gray-600 dark:text-gray-400">
                {exportProgress < 100
                  ? (language === 'en' ? 'Collecting data...' : 'جاري جمع البيانات...')
                  : (language === 'en' ? 'Backup complete!' : 'تم التصدير بنجاح!')}
              </p>
              {exportProgress === 100 && (
                <div className="flex items-center justify-center gap-2 text-emerald-600">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">{language === 'en' ? 'Download started' : 'بدأ التحميل'}</span>
                </div>
              )}
              {Object.keys(backupStats).length > 0 && exportProgress === 100 && (
                <div className="mt-4 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-xs font-medium text-gray-500 mb-2">
                    {language === 'en' ? 'Exported records:' : 'السجلات المصدرة:'}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(backupStats).slice(0, 8).map(([table, count]) => (
                      <div key={table} className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400 capitalize">{table.replace(/_/g, ' ')}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Restore Confirmation Dialog */}
        <Dialog open={isRestoreDialogOpen} onOpenChange={setIsRestoreDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-blue-600" />
                {language === 'en' ? 'Confirm Restore' : 'تأكيد الاستعادة'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      {language === 'en' ? 'Are you sure you want to restore this backup?' : 'هل أنت متأكد من استعادة هذه النسخة الاحتياطية؟'}
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                      {language === 'en'
                        ? 'This action may modify or add records to your current data.'
                        : 'قد يؤدي هذا الإجراء إلى تعديل أو إضافة سجلات إلى بياناتك الحالية.'}
                    </p>
                  </div>
                </div>
              </div>

              {restorePreview && (
                <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-xs font-medium text-gray-500 mb-2">
                    {language === 'en' ? 'Records to restore:' : 'السجلات للاستعادة:'}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs max-h-40 overflow-y-auto">
                    {Object.entries(restorePreview).map(([table, count]) => (
                      <div key={table} className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400 capitalize">{table.replace(/_/g, ' ')}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isImporting && (
                <div className="space-y-2">
                  <Progress value={importProgress} className="h-2" />
                  <p className="text-sm text-center text-gray-600 dark:text-gray-400">
                    {language === 'en' ? 'Restoring data...' : 'جاري استعادة البيانات...'}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setIsRestoreDialogOpen(false)} disabled={isImporting}>
                {language === 'en' ? 'Cancel' : 'إلغاء'}
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700"
                onClick={handleImportBackup}
                disabled={isImporting}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    {language === 'en' ? 'Restoring...' : 'جاري الاستعادة...'}
                  </>
                ) : (
                  <>
                    <RefreshCcw className="w-4 h-4 mr-2" />
                    {language === 'en' ? 'Restore Backup' : 'استعادة النسخة'}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}

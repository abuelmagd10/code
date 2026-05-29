"use client"

import { useEffect, useState, useRef } from "react"
import { PassphraseDialog } from "@/components/backup/PassphraseDialog"
import { encryptBackup, decryptBackup, isEncryptedBackup, type EncryptedBackup } from "@/lib/backup/crypto-utils"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
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
import { Settings, Moon, Sun, Users, Mail, Lock, Building2, Globe, Palette, ChevronRight, Camera, Upload, Shield, Percent, Save, History, Download, UploadCloud, Database, FileJson, CheckCircle2, AlertCircle, Loader2, HardDrive, RefreshCcw, Calendar, FileText, Package, ShoppingCart, Truck, CreditCard, BookOpen, Users2, Coins, Eye, Bot, Bell } from "lucide-react"
import { ERPPageHeader } from "@/components/erp-page-header"
import { type AISettings, DEFAULT_AI_SETTINGS, fetchAISettings, saveAISettings } from "@/lib/page-guides"
import { Progress } from "@/components/ui/progress"
import { getActiveCurrencies, getFXAccounts, type Currency } from "@/lib/currency-service"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"

// Professional currency list with symbols and flags (fallback)
const FALLBACK_CURRENCIES = [
  { code: "EGP", name: "Egyptian Pound", nameAr: "الجنيه المصري", symbol: "£", flag: "🇪🇬" },
  { code: "USD", name: "US Dollar", nameAr: "الدولار الأمريكي", symbol: "$", flag: "🇺🇸" },
  { code: "EUR", name: "Euro", nameAr: "اليورو", symbol: "€", flag: "🇪🇺" },
  { code: "GBP", name: "British Pound", nameAr: "الجنيه الإسترليني", symbol: "£", flag: "🇬🇧" },
  { code: "SAR", name: "Saudi Riyal", nameAr: "الريال السعودي", symbol: "﷼", flag: "🇸🇦" },
  { code: "AED", name: "UAE Dirham", nameAr: "الدرهم الإماراتي", symbol: "د.إ", flag: "🇦🇪" },
  { code: "KWD", name: "Kuwaiti Dinar", nameAr: "الدينار الكويتي", symbol: "د.ك", flag: "🇰🇼" },
  { code: "QAR", name: "Qatari Riyal", nameAr: "الريال القطري", symbol: "﷼", flag: "🇶🇦" },
  { code: "BHD", name: "Bahraini Dinar", nameAr: "الدينار البحريني", symbol: "د.ب", flag: "🇧🇭" },
  { code: "OMR", name: "Omani Rial", nameAr: "الريال العماني", symbol: "﷼", flag: "🇴🇲" },
  { code: "JOD", name: "Jordanian Dinar", nameAr: "الدينار الأردني", symbol: "د.أ", flag: "🇯🇴" },
  { code: "LBP", name: "Lebanese Pound", nameAr: "الليرة اللبنانية", symbol: "ل.ل", flag: "🇱🇧" },
  { code: "MAD", name: "Moroccan Dirham", nameAr: "الدرهم المغربي", symbol: "د.م", flag: "🇲🇦" },
  { code: "TND", name: "Tunisian Dinar", nameAr: "الدينار التونسي", symbol: "د.ت", flag: "🇹🇳" },
  { code: "DZD", name: "Algerian Dinar", nameAr: "الدينار الجزائري", symbol: "د.ج", flag: "🇩🇿" },
  { code: "IQD", name: "Iraqi Dinar", nameAr: "الدينار العراقي", symbol: "د.ع", flag: "🇮🇶" },
  { code: "TRY", name: "Turkish Lira", nameAr: "الليرة التركية", symbol: "₺", flag: "🇹🇷" },
  { code: "INR", name: "Indian Rupee", nameAr: "الروبية الهندية", symbol: "₹", flag: "🇮🇳" },
  { code: "CNY", name: "Chinese Yuan", nameAr: "اليوان الصيني", symbol: "¥", flag: "🇨🇳" },
  { code: "JPY", name: "Japanese Yen", nameAr: "الين الياباني", symbol: "¥", flag: "🇯🇵" },
]

// Currency flags map
const CURRENCY_FLAGS: Record<string, string> = {
  EGP: "🇪🇬", USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", SAR: "🇸🇦", AED: "🇦🇪", KWD: "🇰🇼",
  QAR: "🇶🇦", BHD: "🇧🇭", OMR: "🇴🇲", JOD: "🇯🇴", LBP: "🇱🇧", MAD: "🇲🇦", TND: "🇹🇳",
  DZD: "🇩🇿", IQD: "🇮🇶", TRY: "🇹🇷", INR: "🇮🇳", CNY: "🇨🇳", JPY: "🇯🇵", SYP: "🇸🇾",
  YER: "🇾🇪", SDG: "🇸🇩", LYD: "🇱🇾", CHF: "🇨🇭", CAD: "🇨🇦", AUD: "🇦🇺", NZD: "🇳🇿",
  SGD: "🇸🇬", HKD: "🇭🇰", MYR: "🇲🇾", PHP: "🇵🇭", THB: "🇹🇭", IDR: "🇮🇩", KRW: "🇰🇷",
  ZAR: "🇿🇦", BRL: "🇧🇷", MXN: "🇲🇽", RUB: "🇷🇺", PLN: "🇵🇱", SEK: "🇸🇪", NOK: "🇳🇴", DKK: "🇩🇰",
}

export default function SettingsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const { resolvedTheme, setTheme } = useTheme()
  const router = useRouter()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [myCompanies, setMyCompanies] = useState<Array<{ id: string; name: string }>>([])
  const [currency, setCurrency] = useState<string>('EGP')
  const [language, setLanguage] = useState<string>('ar')
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
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'editor' | 'viewer'>('viewer') // Track user role
  const [isCompanyOwner, setIsCompanyOwner] = useState<boolean>(false) // Is user the company owner?
  // FX Account Configuration states
  const [fxGainAccountId, setFxGainAccountId] = useState<string | null>(null)
  const [fxLossAccountId, setFxLossAccountId] = useState<string | null>(null)
  const [fxIncomeAccounts, setFxIncomeAccounts] = useState<Array<{ id: string; code: string; name: string }>>([])
  const [fxExpenseAccounts, setFxExpenseAccounts] = useState<Array<{ id: string; code: string; name: string }>>([])
  const [savingFX, setSavingFX] = useState(false)
  const [fxColumnsAvailable, setFxColumnsAvailable] = useState(true)

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

  // Currency states - load from database
  const [availableCurrencies, setAvailableCurrencies] = useState<Currency[]>([])
  const [loadingCurrencies, setLoadingCurrencies] = useState(true)

  // Helper to create fallback currencies
  const createFallbackCurrencies = (): Currency[] => {
    return FALLBACK_CURRENCIES.map((c) => ({
      id: `fallback-${c.code}`,
      code: c.code,
      name: c.name,
      name_ar: c.nameAr,
      symbol: c.symbol,
      decimals: 2,
      is_active: true,
      is_base: c.code === 'EGP'
    }))
  }

  // Load currencies from database
  useEffect(() => {
    const loadCurrencies = async () => {
      if (!supabase) return
      try {
        setLoadingCurrencies(true)
        const currencies = await getActiveCurrencies(supabase, companyId || undefined)
        if (currencies && currencies.length > 0) {
          setAvailableCurrencies(currencies)
        } else {
          // Use fallback if no currencies in database
          setAvailableCurrencies(createFallbackCurrencies())
        }
      } catch (error) {
        console.error('Error loading currencies:', error)
        // Use fallback on error
        setAvailableCurrencies(createFallbackCurrencies())
      } finally {
        setLoadingCurrencies(false)
      }
    }
    loadCurrencies()
  }, [supabase, companyId])

  // Load FX account configuration
  useEffect(() => {
    const loadFXConfig = async () => {
      if (!supabase || !companyId) return
      try {
        // Step 1: Try reading FX config from companies table
        try {
          const { data, error } = await supabase
            .from('companies')
            .select('fx_gain_account_id, fx_loss_account_id')
            .eq('id', companyId)
            .single()
          if (data && !error) {
            setFxGainAccountId(data.fx_gain_account_id)
            setFxLossAccountId(data.fx_loss_account_id)
            setFxColumnsAvailable(true)
          }
        } catch {
          // Columns don't exist yet (migration not applied)
          setFxColumnsAvailable(false)
        }

        // Step 2: Load accounts for dropdowns
        const { data: incomeAccts } = await supabase
          .from('chart_of_accounts')
          .select('id, account_code, account_name')
          .eq('company_id', companyId)
          .eq('account_type', 'income')
          .eq('is_active', true)
          .order('account_code')

        const { data: expenseAccts } = await supabase
          .from('chart_of_accounts')
          .select('id, account_code, account_name')
          .eq('company_id', companyId)
          .eq('account_type', 'expense')
          .eq('is_active', true)
          .order('account_code')

        setFxIncomeAccounts((incomeAccts || []).map((a: any) => ({
          id: a.id, code: a.account_code, name: a.account_name
        })))
        setFxExpenseAccounts((expenseAccts || []).map((a: any) => ({
          id: a.id, code: a.account_code, name: a.account_name
        })))
      } catch (err) {
        console.error('[Settings] Error loading FX config:', err)
      }
    }
    loadFXConfig()
  }, [supabase, companyId])

  // Bonus settings states
  const [bonusSettings, setBonusSettings] = useState<{
    bonus_enabled: boolean
    bonus_type: 'percentage' | 'fixed' | 'points'
    bonus_percentage: number
    bonus_fixed_amount: number
    bonus_points_per_value: number
    bonus_daily_cap: number | null
    bonus_monthly_cap: number | null
    bonus_payout_mode: 'immediate' | 'payroll'
  }>({
    bonus_enabled: false,
    bonus_type: 'percentage',
    bonus_percentage: 2,
    bonus_fixed_amount: 0,
    bonus_points_per_value: 100,
    bonus_daily_cap: null,
    bonus_monthly_cap: null,
    bonus_payout_mode: 'payroll'
  })
  const [savingBonus, setSavingBonus] = useState(false)

  // ─── AI Assistant Settings ──────────────────────────────────────────────
  const [aiSettings, setAiSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS)
  const [savingAI, setSavingAI] = useState(false)
  const [aiSettingsLoaded, setAiSettingsLoaded] = useState(false)

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

  // v3.61.2 A7 — encryption state
  const [passDialogOpen, setPassDialogOpen] = useState(false)
  const [passDialogMode, setPassDialogMode] = useState<"encrypt" | "decrypt">("encrypt")
  const [passDialogHint, setPassDialogHint] = useState<EncryptedBackup["metadata_hint"] | null>(null)
  const [passDialogError, setPassDialogError] = useState<string | null>(null)
  const [pendingExportData, setPendingExportData] = useState<any | null>(null)
  const [pendingEncryptedFile, setPendingEncryptedFile] = useState<EncryptedBackup | null>(null)

  // Load last backup date
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const lastBackup = localStorage.getItem('last_backup_date')
      if (lastBackup) setLastBackupDate(lastBackup)
    }
  }, [])

  // Export backup function — v3.61.0: routed through hardened API (Phase A).
  // The old inline client-side export bypassed the API entirely, missing
  // checksum, audit log, sensitive-field cleanup, and 120+ tables. Now we
  // go through /api/backup/export which has all of those.
  const handleExportBackup = async () => {
    if (!companyId) {
      toastActionError(toast, language === 'en' ? 'Export' : 'التصدير', language === 'en' ? 'Backup' : 'النسخة الاحتياطية', language === 'en' ? 'No active company' : 'لا توجد شركة نشطة')
      return
    }

    try {
      setIsExporting(true)
      setExportProgress(10)
      setIsBackupDialogOpen(true)

      setExportProgress(30)
      const response = await fetch('/api/backup/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: name || 'Unknown' }),
      })
      setExportProgress(60)

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || err.error_en || (language === 'en' ? 'Export failed' : 'فشل التصدير'))
      }

      const result = await response.json()
      const backup = result.data
      setExportProgress(85)

      // Stats for the dialog (table name -> row count)
      const stats: Record<string, number> = {}
      if (backup && backup.data && typeof backup.data === 'object') {
        for (const [tbl, rows] of Object.entries(backup.data)) {
          if (Array.isArray(rows)) stats[tbl] = rows.length
        }
      }
      setBackupStats(stats)

      // v3.61.2 A7 — defer download. Ask the user whether to encrypt first.
      // The actual write-to-disk happens in finishExport() after the dialog.
      setExportProgress(100)
      setIsBackupDialogOpen(false)
      setPendingExportData(backup)
      setPassDialogMode("encrypt")
      setPassDialogError(null)
      setPassDialogOpen(true)
      // toast deferred to finishExport
    } catch (err: any) {
      console.error('Backup error:', err)
      toastActionError(toast, language === 'en' ? 'Export' : 'التصدير', language === 'en' ? 'Backup' : 'النسخة الاحتياطية', err?.message)
    } finally {
      setIsExporting(false)
      setTimeout(() => setIsBackupDialogOpen(false), 2000)
    }
  }

  // Handle file selection for restore — v3.61.0 + A7: accepts new BackupData
  // format AND encrypted backups. Legacy v1.0 files are rejected.
  const handleRestoreFileSelect = async (file: File) => {
    try {
      const text = await file.text()
      const data = JSON.parse(text)

      const isOldFormat = data && data.version === '1.0' && data.tables && !data.metadata
      if (isOldFormat) {
        toastActionError(
          toast,
          language === 'en' ? 'Import' : 'الاستيراد',
          language === 'en' ? 'Backup' : 'النسخة الاحتياطية',
          language === 'en'
            ? 'This backup uses the legacy format and is no longer supported. Please re-export to upgrade.'
            : 'هذه النسخة بصيغة قديمة وغير مدعومة. أنشئ نسخة احتياطية جديدة أولاً.'
        )
        return
      }

      // v3.61.2 A7 — encrypted backup: ask for passphrase before validating
      if (isEncryptedBackup(data)) {
        setRestoreFile(file)
        setPendingEncryptedFile(data)
        setPassDialogHint(data.metadata_hint)
        setPassDialogMode("decrypt")
        setPassDialogError(null)
        setPassDialogOpen(true)
        return
      }

      if (!data || !data.metadata || !data.data) {
        toastActionError(toast, language === 'en' ? 'Import' : 'الاستيراد', language === 'en' ? 'Backup' : 'النسخة الاحتياطية', language === 'en' ? 'Invalid backup file format' : 'تنسيق ملف النسخة الاحتياطية غير صالح')
        return
      }

      setRestoreFile(file)
      const stats: Record<string, number> = {}
      if (data.data && typeof data.data === 'object') {
        for (const [tbl, rows] of Object.entries(data.data)) {
          if (Array.isArray(rows)) stats[tbl] = (rows as unknown[]).length
        }
      }
      setRestorePreview(stats)
      setIsRestoreDialogOpen(true)
    } catch (err: any) {
      toastActionError(toast, language === 'en' ? 'Import' : 'الاستيراد', language === 'en' ? 'Backup' : 'النسخة الاحتياطية', language === 'en' ? 'Error reading backup file' : 'خطأ في قراءة ملف النسخة الاحتياطية')
    }
  }

  // v3.61.2 A7 — finalize an export: optionally encrypt then download.
  const finishExport = async (passphrase: string | null) => {
    const backup = pendingExportData
    if (!backup) return
    try {
      let fileContent: string
      let suffix = ""
      if (passphrase) {
        const enc = await encryptBackup(backup, passphrase)
        fileContent = JSON.stringify(enc, null, 2)
        suffix = "_encrypted"
      } else {
        fileContent = JSON.stringify(backup, null, 2)
      }
      const blob = new Blob([fileContent], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backup_${name?.replace(/\s+/g, '_') || 'company'}_${new Date().toISOString().split('T')[0]}${suffix}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      const now = new Date().toISOString()
      localStorage.setItem('last_backup_date', now)
      setLastBackupDate(now)

      toastActionSuccess(toast, language === 'en' ? 'Export' : 'التصدير', language === 'en' ? 'Backup' : 'النسخة الاحتياطية')
    } catch (err: any) {
      console.error('Encryption error:', err)
      toastActionError(toast, language === 'en' ? 'Export' : 'التصدير', language === 'en' ? 'Backup' : 'النسخة الاحتياطية', err?.message)
    } finally {
      setPendingExportData(null)
      setPassDialogOpen(false)
    }
  }

  // v3.61.2 A7 — finalize a restore from an encrypted file.
  const finishDecryptAndStage = async (passphrase: string) => {
    const enc = pendingEncryptedFile
    if (!enc) return
    try {
      const plain = await decryptBackup(enc, passphrase)
      // Pass to the normal restore staging UX
      const stats: Record<string, number> = {}
      if (plain.data && typeof plain.data === 'object') {
        for (const [tbl, rows] of Object.entries(plain.data)) {
          if (Array.isArray(rows)) stats[tbl] = (rows as unknown[]).length
        }
      }
      setRestorePreview(stats)
      // Replace the restoreFile blob in memory with a decrypted-text Blob so
      // handleImportBackup re-parses cleanly.
      const decBlob = new Blob([JSON.stringify(plain)], { type: 'application/json' })
      const decFile = new File([decBlob], (restoreFile?.name || 'backup.json'), { type: 'application/json' })
      setRestoreFile(decFile)
      setPendingEncryptedFile(null)
      setPassDialogOpen(false)
      setIsRestoreDialogOpen(true)
    } catch (err: any) {
      const msg = err?.message === 'WRONG_PASSPHRASE' ? 'WRONG_PASSPHRASE' : (err?.message || 'Decryption failed')
      setPassDialogError(msg)
    }
  }

  // v3.61.2 A7 — passphrase dialog handlers (encrypt mode = optional)
  const handlePassDialogConfirm = (pass: string | null) => {
    if (passDialogMode === "encrypt") {
      // null = user chose plain export
      void finishExport(pass)
    } else {
      if (!pass) {
        setPassDialogOpen(false)
        return
      }
      void finishDecryptAndStage(pass)
    }
  }

  const handlePassDialogCancel = () => {
    setPassDialogOpen(false)
    setPassDialogError(null)
    if (passDialogMode === "encrypt") {
      setPendingExportData(null)
    } else {
      setPendingEncryptedFile(null)
      setRestoreFile(null)
    }
  }

  // Import/Restore backup — v3.61.0: routed through hardened API path.
  // The old inline implementation looped INSERT/UPDATE on every record
  // bypassing transactions, governance, validation, dry-run, and cross-tenant
  // protection. Now we delegate to /api/backup/validate then
  // /api/backup/restore which run as a single atomic RPC with full safeguards.
  const handleImportBackup = async () => {
    if (!restoreFile || !companyId) return

    try {
      setIsImporting(true)
      setImportProgress(0)

      const text = await restoreFile.text()
      const backupData = JSON.parse(text)

      setImportProgress(15)

      // 1. Validate first — this checks checksum, schema, FKs, accounting, AND
      //    the v3.61.0 A2 cross-tenant guard.
      const validateResponse = await fetch('/api/backup/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupData }),
      })
      setImportProgress(40)

      if (!validateResponse.ok) {
        const err = await validateResponse.json().catch(() => ({}))
        throw new Error(err.error || err.error_en || (language === 'en' ? 'Validation failed' : 'فشل التحقق'))
      }
      const validation = await validateResponse.json()
      if (validation.validation && validation.validation.valid === false) {
        const firstErr = validation.validation.errors?.[0]
        throw new Error(firstErr?.message || (language === 'en' ? 'Backup did not pass validation' : 'النسخة الاحتياطية لم تجتز التحقق'))
      }

      // 2. Perform the actual restore (atomic, governed, audited).
      setImportProgress(55)
      const restoreResponse = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupData, dryRun: false }),
      })
      setImportProgress(90)

      if (!restoreResponse.ok) {
        const err = await restoreResponse.json().catch(() => ({}))
        throw new Error(err.error || err.error_en || (language === 'en' ? 'Restore failed' : 'فشل الاستعادة'))
      }
      const restoreResult = await restoreResponse.json()
      if (restoreResult.success === false) {
        throw new Error(restoreResult.error || restoreResult.error_en || (language === 'en' ? 'Restore failed' : 'فشل الاستعادة'))
      }

      setImportProgress(100)
      toastActionSuccess(toast, language === 'en' ? 'Import' : 'الاستيراد', language === 'en' ? 'Backup restored successfully' : 'تم استعادة النسخة الاحتياطية بنجاح')

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

  // 🔧 قراءة القيم من localStorage بعد الـ mount لتجنب hydration mismatch
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedCurrency = localStorage.getItem('app_currency')
        const savedLanguage = localStorage.getItem('app_language')
        if (savedCurrency) setCurrency(savedCurrency)
        if (savedLanguage) setLanguage(savedLanguage)
      } catch { }
    }
  }, [])

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

        // 🔍 Debug: تحقق من localStorage
        if (typeof window !== 'undefined') {
          const savedId = localStorage.getItem('active_company_id')
          const savedName = localStorage.getItem('company_name')
          console.log('🔍 [Settings] localStorage check:', { savedId, savedName })
        }

        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user) {
          setUserId(user.id)
          setUserEmail(user.email)
        }

        // استخدم دالة موحدة للحصول على company_id حتى بدون جلسة
        const cid = await getActiveCompanyId(supabase)
        console.log('🔍 [Settings] Loading company:', cid)
        if (cid) {
          setCompanyId(cid)
          // ✅ استخدام API بدلاً من استعلام مباشر
          try {
            const timestamp = Date.now()
            const response = await fetch(`/api/company-info?companyId=${cid}&_t=${timestamp}`, {
              cache: 'no-store',
              headers: { 'Cache-Control': 'no-cache' }
            })
            const data = await response.json()
            console.log('📦 [Settings] API Response:', data)
            const company = data.success ? data.data?.company : null
            console.log('📦 [Settings] Received company data:', company?.id, company?.name)
            if (company) {
              const companyCurrency = company.base_currency || (typeof window !== 'undefined' ? (localStorage.getItem('app_currency') || 'EGP') : 'EGP')
              setCurrency(companyCurrency)
              // Sync currency to localStorage
              if (typeof window !== 'undefined') {
                try { localStorage.setItem('app_currency', companyCurrency); document.cookie = `app_currency=${companyCurrency}; path=/; max-age=31536000` } catch { }
              }
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
                  // Check membership and get role
                  const { data: memberData } = await supabase
                    .from("company_members")
                    .select("id, role, invited_by")
                    .eq("company_id", cid)
                    .eq("user_id", user.id)
                    .limit(1)
                    .maybeSingle()

                  if (memberData) {
                    // User is a member - check role
                    const role = memberData.role as 'owner' | 'admin' | 'editor' | 'viewer'
                    setUserRole(role)
                    // Owner = role is 'owner' OR user created the company (no invited_by)
                    setIsCompanyOwner(role === 'owner' || !memberData.invited_by)
                  } else {
                    // No membership - create as owner (first user)
                    await supabase
                      .from("company_members")
                      .insert({ company_id: cid, user_id: user.id, role: "owner" })
                    setUserRole('owner')
                    setIsCompanyOwner(true)
                  }
                }
              } catch { }
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
              } catch { }
            } else {
              try {
                const res = await fetch('/api/my-company', { method: 'GET' })
                const js = await res.json()
                // API response structure: { success, data: { company, accounts } }
                const c = js?.data?.company || js?.company
                if (res.ok && c?.id) {
                  setCompanyId(String(c.id))
                  setCurrency(c.base_currency || "EGP")
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
                  } catch { }
                }
              } catch { }
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
                      .select("id, user_id, name, email, phone, address, city, country, tax_id, base_currency, fiscal_year_start, logo_url, created_at, updated_at")
                      .in("id", ids)
                      .limit(1)
                    const c = (Array.isArray(companies) ? companies[0] : null) as any
                    if (c) {
                      setCompanyId(String(c.id))
                      setCurrency(c.base_currency || "EGP")
                      setName(c.name || "")
                      setAddress(c.address || "")
                      setCity(c.city || "")
                      setCountry(c.country || "")
                      setPhone(c.phone || "")
                      setTaxId(c.tax_id || "")
                      setLanguage(String(c.language || (typeof window !== 'undefined' ? (localStorage.getItem('app_language') || 'ar') : 'ar')))
                      const lu2 = String(c.logo_url || (typeof window !== 'undefined' ? localStorage.getItem('company_logo_url') : '') || '')
                      setLogoUrl(lu2 || '')
                      try { setMyCompanies([{ id: String(c.id), name: String(c.name || 'شركة') }]) } catch { }
                    }
                  }
                }
              } catch { }
            }
          } catch (error) {
            console.error('[Settings] Error fetching company info:', error)
          }
        }
      } finally {
        setLoading(false)
      }
    }
    loadCompany()
  }, [supabase])

  // ─── Load AI Settings when companyId is available ──────────────────────
  useEffect(() => {
    const loadAI = async () => {
      if (!companyId || aiSettingsLoaded) return
      try {
        const fetched = await fetchAISettings(supabase, companyId)
        setAiSettings(fetched)
        setAiSettingsLoaded(true)
      } catch {}
    }
    loadAI()
  }, [companyId, supabase, aiSettingsLoaded])

  const handleSaveAISettings = async () => {
    if (!companyId) return
    try {
      setSavingAI(true)
      const { error } = await saveAISettings(supabase, companyId, aiSettings)
      if (error) {
        toastActionError(toast, language === 'en' ? 'Save' : 'حفظ', language === 'en' ? 'AI Assistant Settings' : 'إعدادات المساعد الذكي', error)
      } else {
        // Notify the floating assistant to reload its settings
        window.dispatchEvent(new Event('ai_settings_changed'))
        toastActionSuccess(toast, language === 'en' ? 'Save' : 'حفظ', language === 'en' ? 'AI Assistant Settings' : 'إعدادات المساعد الذكي')
      }
    } catch (err: any) {
      toastActionError(toast, language === 'en' ? 'Save' : 'حفظ', language === 'en' ? 'AI Assistant Settings' : 'إعدادات المساعد الذكي', err?.message)
    } finally {
      setSavingAI(false)
    }
  }

  // Load bonus settings when companyId changes
  useEffect(() => {
    const loadBonusSettings = async () => {
      if (!companyId) return
      try {
        const res = await fetch(`/api/bonuses/settings?companyId=${companyId}`)
        if (res.ok) {
          const data = await res.json()
          setBonusSettings({
            bonus_enabled: data.bonus_enabled || false,
            bonus_type: data.bonus_type || 'percentage',
            bonus_percentage: data.bonus_percentage || 2,
            bonus_fixed_amount: data.bonus_fixed_amount || 0,
            bonus_points_per_value: data.bonus_points_per_value || 100,
            bonus_daily_cap: data.bonus_daily_cap || null,
            bonus_monthly_cap: data.bonus_monthly_cap || null,
            bonus_payout_mode: data.bonus_payout_mode || 'payroll'
          })
        }
      } catch (err) {
        console.error('Error loading bonus settings:', err)
      }
    }
    loadBonusSettings()
  }, [companyId])

  // Save bonus settings
  const handleSaveBonusSettings = async () => {
    if (!companyId) return
    try {
      setSavingBonus(true)
      const res = await fetch('/api/bonuses/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, ...bonusSettings })
      })
      if (res.ok) {
        toastActionSuccess(toast, language === 'en' ? 'Save' : 'حفظ', language === 'en' ? 'Bonus Settings' : 'إعدادات البونص')
      } else {
        const data = await res.json()
        toastActionError(toast, language === 'en' ? 'Save' : 'حفظ', language === 'en' ? 'Bonus Settings' : 'إعدادات البونص', data.error)
      }
    } catch (err) {
      toastActionError(toast, language === 'en' ? 'Save' : 'حفظ', language === 'en' ? 'Bonus Settings' : 'إعدادات البونص')
    } finally {
      setSavingBonus(false)
    }
  }

  // Save FX account configuration
  const handleSaveFXAccounts = async () => {
    if (!isCompanyOwner || !companyId || !userId) return

    setSavingFX(true)
    try {
      // Capture previous values for audit log
      let prevGain: string | null = null
      let prevLoss: string | null = null
      try {
        const { data: prevData } = await supabase
          .from('companies')
          .select('fx_gain_account_id, fx_loss_account_id')
          .eq('id', companyId)
          .single()
        if (prevData) {
          prevGain = prevData.fx_gain_account_id
          prevLoss = prevData.fx_loss_account_id
        }
      } catch { /* columns may not exist */ }

      const { error: updateError } = await supabase
        .from('companies')
        .update({
          fx_gain_account_id: fxGainAccountId,
          fx_loss_account_id: fxLossAccountId
        })
        .eq('id', companyId)

      if (updateError) throw updateError

      // Audit log (best-effort)
      // Schema constraints: action must be one of (INSERT, UPDATE, DELETE, SETTINGS, ...) per audit_logs_action_check.
      // We use 'SETTINGS' for config changes and put the specific event in `reason`.
      try {
        await supabase.from('audit_logs').insert({
          company_id: companyId,
          user_id: userId,
          action: 'SETTINGS',
          target_table: 'companies',
          record_id: companyId,
          reason: 'fx_accounts_configured',
          new_data: { fx_gain_account_id: fxGainAccountId, fx_loss_account_id: fxLossAccountId },
          old_data: { fx_gain_account_id: prevGain, fx_loss_account_id: prevLoss }
        })
      } catch { /* Don't fail if audit log fails */ }

      toastActionSuccess(toast, language === 'en' ? 'Save' : 'حفظ', language === 'en' ? 'FX Account Settings' : 'إعدادات حسابات فروق العملة')
    } catch (err) {
      console.error('[Settings] Error saving FX accounts:', err)
      toastActionError(toast, language === 'en' ? 'Save' : 'حفظ', language === 'en' ? 'FX Account Settings' : 'إعدادات حسابات فروق العملة',
        err instanceof Error ? err.message : undefined)
    } finally {
      setSavingFX(false)
    }
  }

  // Reset FX accounts to defaults (state only — user must press Save to apply)
  const handleResetFX = () => {
    if (!isCompanyOwner) return
    setFxGainAccountId(null)
    setFxLossAccountId(null)
    toastActionSuccess(toast, language === 'en' ? 'Reset' : 'إعادة تعيين', language === 'en' ? 'FX Accounts' : 'حسابات فروق العملة')
  }

  const handleSave = async () => {
    try {
      setSaving(true)

      // If company exists, update it; otherwise create a new one for this user
      if (companyId) {
        const { error } = await supabase
          .from("companies")
          .update({ name, address, city, country, phone, tax_id: taxId, base_currency: currency, logo_url: logoUrl || null })
          .eq("id", companyId)
        if (error) {
          const msg = String(error.message || "")
          const looksMissingLogo = msg.toLowerCase().includes("logo_url") && (msg.toLowerCase().includes("column") || msg.toLowerCase().includes("does not exist"))
          if (looksMissingLogo && typeof window !== 'undefined') {
            // Try saving without logo_url
            const { error: retryError } = await supabase
              .from("companies")
              .update({ name, address, city, country, phone, tax_id: taxId, base_currency: currency })
              .eq("id", companyId)
            if (retryError) {
              console.error('Retry save error:', retryError)
            }
          } else {
            throw error
          }
        }

        // No need to update separate currencies table - base_currency is in companies table

        // Save to localStorage and cookies
        if (typeof window !== 'undefined') {
          try { localStorage.setItem('app_language', language) } catch { }
          try { localStorage.setItem('app_currency', currency); document.cookie = `app_currency=${currency}; path=/; max-age=31536000` } catch { }
          try { localStorage.setItem('original_system_currency', currency) } catch { }
          try { localStorage.setItem('company_name', name || '') } catch { }
          try { if (logoUrl) localStorage.setItem('company_logo_url', logoUrl) } catch { }
          try {
            window.dispatchEvent(new Event('app_currency_changed'))
            window.dispatchEvent(new Event('company_updated'))
          } catch { }
        }

        // تسجيل تغيير الإعدادات في سجل المراجعة
        try {
          await fetch("/api/audit-log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "SETTINGS",
              companyId: companyId,
              userId: userId,
              details: {
                user_email: userEmail,
                user_name: name,
                target_table: "companies",
                record_id: companyId,
                record_identifier: name,
                new_data: { name, address, city, country, phone, tax_id: taxId, base_currency: currency },
              },
            }),
          })
        } catch (logError) {
          console.error("Failed to log settings change:", logError)
        }

        toastActionSuccess(toast, language === 'en' ? "Save" : "الحفظ", language === 'en' ? "Settings" : "الإعدادات")

      } else {
        // Creating new company
        if (!userId || !userEmail) {
          toast({ title: language === 'en' ? "Not logged in" : "غير مسجل", description: language === 'en' ? "Please login to save settings" : "يجب تسجيل الدخول لحفظ الإعدادات" })
          return
        }

        const { data, error } = await supabase
          .from("companies")
          .insert({
            user_id: userId,
            name: name || (language === 'en' ? "My Company" : "شركتي"),
            email: userEmail,
            address,
            city,
            country,
            phone,
            tax_id: taxId,
            base_currency: currency,
            logo_url: logoUrl || null
          })
          .select("id")
          .single()
        if (error) throw error

        setCompanyId(data.id)

        // Create company member entry
        try {
          await supabase
            .from("company_members")
            .insert({ company_id: data.id, user_id: userId, role: "owner" })
        } catch { }

        // No need to call updateBaseCurrency - base_currency is already in companies table

        // Save to localStorage
        if (typeof window !== 'undefined') {
          try { localStorage.setItem('app_language', language) } catch { }
          try { localStorage.setItem('app_currency', currency); document.cookie = `app_currency=${currency}; path=/; max-age=31536000` } catch { }
          try { localStorage.setItem('original_system_currency', currency) } catch { }
          try { localStorage.setItem('company_name', name || '') } catch { }
          try { localStorage.setItem('active_company_id', data.id) } catch { }
          try { if (logoUrl) localStorage.setItem('company_logo_url', logoUrl) } catch { }
          try {
            window.dispatchEvent(new Event('app_currency_changed'))
            window.dispatchEvent(new Event('company_updated'))
          } catch { }
        }

        toastActionSuccess(toast, language === 'en' ? "Create" : "الإنشاء", language === 'en' ? "Company" : "الشركة")
      }
    } catch (err: any) {
      console.error(err)
      toastActionError(toast, language === 'en' ? "Save" : "الحفظ", language === 'en' ? "Settings" : "الإعدادات", err?.message || undefined)
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
      try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('company_updated')) } catch { }
    } catch (e: any) {
      toastActionError(toast, "رفع", "الشعار", e?.message || undefined)
    } finally { setUploadingLogo(false) }
  }

  // Currency conversion states
  const [showCurrencyDialog, setShowCurrencyDialog] = useState(false)
  const [pendingCurrency, setPendingCurrency] = useState<string>('')
  const [previousCurrency, setPreviousCurrency] = useState<string>('')
  const [conversionRate, setConversionRate] = useState<number>(1)
  const [isConverting, setIsConverting] = useState(false)
  const [originalSystemCurrency, setOriginalSystemCurrency] = useState<string>('EGP')

  // Load original system currency on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('original_system_currency')
      if (saved) {
        setOriginalSystemCurrency(saved)
      } else {
        // First time - save current as original
        localStorage.setItem('original_system_currency', currency)
        setOriginalSystemCurrency(currency)
      }
    }
  }, [currency])

  // Fetch exchange rate
  const fetchExchangeRate = async (from: string, to: string): Promise<number> => {
    if (from === to) return 1
    try {
      // Try database first - direct rate
      if (companyId) {
        const { data } = await supabase
          .from('exchange_rates')
          .select('rate')
          .eq('company_id', companyId)
          .eq('from_currency', from)
          .eq('to_currency', to)
          .order('rate_date', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (data?.rate) return Number(data.rate)

        // Try reverse rate (1 / rate)
        const { data: reverseData } = await supabase
          .from('exchange_rates')
          .select('rate')
          .eq('company_id', companyId)
          .eq('from_currency', to)
          .eq('to_currency', from)
          .order('rate_date', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (reverseData?.rate && Number(reverseData.rate) > 0) {
          return 1 / Number(reverseData.rate)
        }
      }
      // Fallback to API
      const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`)
      if (res.ok) {
        const data = await res.json()
        return data.rates?.[to] || 1
      }
    } catch (e) {
      console.error('Error fetching rate:', e)
    }
    return 1
  }

  // Handle currency change - show dialog for conversion options
  const handleCurrencyChange = async (newCurrency: string) => {
    if (newCurrency === currency) return

    setPreviousCurrency(currency)
    setPendingCurrency(newCurrency)

    // Fetch exchange rate
    const rate = await fetchExchangeRate(originalSystemCurrency, newCurrency)
    setConversionRate(rate)
    setShowCurrencyDialog(true)
  }

  // Apply currency change with conversion and revaluation
  const applyCurrencyWithConversion = async () => {
    if (!companyId) return

    setIsConverting(true)
    try {
      // Import the conversion function dynamically and set authenticated client
      const { convertAllToDisplayCurrency, setAuthClient } = await import('@/lib/currency-conversion-system')
      const { performCurrencyRevaluation } = await import('@/lib/currency-service')

      // Set the authenticated Supabase client
      setAuthClient(supabase)

      // Step 1: Perform accounting revaluation (creates journal entries for differences)
      const revalResult = await performCurrencyRevaluation(
        supabase,
        companyId,
        originalSystemCurrency,
        pendingCurrency,
        conversionRate,
        userId || undefined
      )

      if (!revalResult.success) {
        console.warn('Revaluation warning:', revalResult.error)
        // Continue even if revaluation fails - it's not critical
      }

      // Step 2: Convert all display amounts to new currency
      const result = await convertAllToDisplayCurrency(companyId, pendingCurrency, conversionRate)

      if (!result.success) {
        throw new Error(result.error || 'Conversion failed')
      }

      // Step 3: Update base currency in database
      await supabase
        .from('currencies')
        .update({ is_base: false })
        .eq('company_id', companyId)

      // Set new currency as base
      const { data: existingCurrency } = await supabase
        .from('currencies')
        .select('id')
        .eq('company_id', companyId)
        .eq('code', pendingCurrency)
        .maybeSingle()

      if (existingCurrency) {
        await supabase
          .from('currencies')
          .update({ is_base: true, is_active: true })
          .eq('id', existingCurrency.id)
      } else {
        // Create new currency as base
        const currencyInfo = FALLBACK_CURRENCIES.find(c => c.code === pendingCurrency)
        await supabase.from('currencies').insert({
          company_id: companyId,
          code: pendingCurrency,
          name: currencyInfo?.name || pendingCurrency,
          name_ar: currencyInfo?.nameAr || pendingCurrency,
          symbol: currencyInfo?.symbol || pendingCurrency,
          decimals: 2,
          is_active: true,
          is_base: true
        })
      }

      // Update company currency
      await supabase
        .from('companies')
        .update({ currency: pendingCurrency })
        .eq('id', companyId)

      // Update local state and storage
      setCurrency(pendingCurrency)
      setOriginalSystemCurrency(pendingCurrency) // Update original since base changed
      localStorage.setItem('app_currency', pendingCurrency)
      localStorage.setItem('original_system_currency', pendingCurrency)
      document.cookie = `app_currency=${pendingCurrency}; path=/; max-age=31536000`
      window.dispatchEvent(new Event('app_currency_changed'))

      setShowCurrencyDialog(false)

      // Show success with revaluation info
      const revalInfo = revalResult.success && revalResult.revaluedAccounts > 0
        ? (language === 'en'
          ? ` | Revaluation: ${revalResult.revaluedAccounts} accounts, Gain: ${revalResult.totalGain.toFixed(2)}, Loss: ${revalResult.totalLoss.toFixed(2)}`
          : ` | إعادة التقييم: ${revalResult.revaluedAccounts} حساب، ربح: ${revalResult.totalGain.toFixed(2)}، خسارة: ${revalResult.totalLoss.toFixed(2)}`)
        : ''

      toastActionSuccess(
        toast,
        language === 'en' ? 'Base Currency Changed' : 'تم تغيير العملة الأساسية',
        language === 'en'
          ? `Currency changed to ${pendingCurrency} with rate ${conversionRate.toFixed(4)}${revalInfo}`
          : `تم تغيير العملة إلى ${pendingCurrency} بسعر ${conversionRate.toFixed(4)}${revalInfo}`
      )
    } catch (e: any) {
      toastActionError(
        toast,
        language === 'en' ? 'Conversion' : 'التحويل',
        language === 'en' ? 'Failed' : 'فشل',
        e?.message
      )
    } finally {
      setIsConverting(false)
    }
  }

  // Reset to original currency
  const resetToOriginalCurrency = async () => {
    if (!companyId) return

    setIsConverting(true)
    try {
      const { resetToOriginalCurrency: resetFn, setAuthClient } = await import('@/lib/currency-conversion-system')

      // Set the authenticated Supabase client
      setAuthClient(supabase)

      const result = await resetFn(companyId)

      if (!result.success) {
        throw new Error(result.error || 'Reset failed')
      }

      // Update to original currency
      setCurrency(originalSystemCurrency)
      localStorage.setItem('app_currency', originalSystemCurrency)
      document.cookie = `app_currency=${originalSystemCurrency}; path=/; max-age=31536000`
      window.dispatchEvent(new Event('app_currency_changed'))

      setShowCurrencyDialog(false)
      toastActionSuccess(
        toast,
        language === 'en' ? 'Currency' : 'العملة',
        language === 'en'
          ? `Restored to original currency ${originalSystemCurrency}`
          : `تم العودة للعملة الأصلية ${originalSystemCurrency}`
      )
    } catch (e: any) {
      toastActionError(
        toast,
        language === 'en' ? 'Reset' : 'الاستعادة',
        language === 'en' ? 'Failed' : 'فشل',
        e?.message
      )
    } finally {
      setIsConverting(false)
    }
  }

  // Change display only without converting data
  const changeDisplayOnly = () => {
    setCurrency(pendingCurrency)
    localStorage.setItem('app_currency', pendingCurrency)
    document.cookie = `app_currency=${pendingCurrency}; path=/; max-age=31536000`
    window.dispatchEvent(new Event('app_currency_changed'))

    setShowCurrencyDialog(false)
    toastActionSuccess(
      toast,
      language === 'en' ? 'Currency' : 'العملة',
      language === 'en' ? 'Display currency changed (no conversion)' : 'تم تغيير عملة العرض (بدون تحويل)'
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        {/* رأس الصفحة — Migrated to ERPPageHeader (v3.55.0) */}
        <ERPPageHeader
          title={L.settings}
          description={language === 'en' ? 'Manage app and company settings' : 'إدارة إعدادات التطبيق والشركة'}
          variant="list"
          lang={language as "ar" | "en"}
          actions={
            <Badge variant="outline" className="hidden sm:flex items-center gap-1 px-3 py-1.5 border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-300">
              <Globe className="w-3.5 h-3.5" />
              {language === 'en' ? 'English' : 'العربية'}
            </Badge>
          }
          extra={
            <p className="text-xs text-green-600 dark:text-green-400">
              {language === 'en' ? '👑 Admin access - Full settings control' : '👑 صلاحية إدارية - تحكم كامل في الإعدادات'}
            </p>
          }
        />

        {/* روابط سريعة */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Link href="/branches" className="group">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group-hover:border-indigo-200 dark:group-hover:border-indigo-800">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg group-hover:scale-110 transition-transform">
                  <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{language === 'en' ? 'Branches' : 'الفروع'}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-indigo-500 transition-colors" />
              </CardContent>
            </Card>
          </Link>
          <Link href="/cost-centers" className="group">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group-hover:border-teal-200 dark:group-hover:border-teal-800">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-lg group-hover:scale-110 transition-transform">
                  <Coins className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{language === 'en' ? 'Cost Centers' : 'مراكز التكلفة'}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-teal-500 transition-colors" />
              </CardContent>
            </Card>
          </Link>
          <Link href="/settings/users" className="group">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group-hover:border-blue-200 dark:group-hover:border-blue-800">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg group-hover:scale-110 transition-transform">
                  <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{L.usersPerms}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-blue-500 transition-colors" />
              </CardContent>
            </Card>
          </Link>
          <Link href="/settings/notifications" className="group">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group-hover:border-violet-200 dark:group-hover:border-violet-800">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg group-hover:scale-110 transition-transform">
                  <Bell className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {language === 'en' ? 'Notification Preferences' : 'تفضيلات الإشعارات'}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-violet-500 transition-colors" />
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
                <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-green-500 transition-colors" />
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
                <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-purple-500 transition-colors" />
              </CardContent>
            </Card>
          </Link>
          <Link href="/settings/shipping" className="group">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group-hover:border-cyan-200 dark:group-hover:border-cyan-800">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg group-hover:scale-110 transition-transform">
                  <Truck className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{language === 'en' ? 'Shipping' : 'الشحن'}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-cyan-500 transition-colors" />
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

        {/* ─── AI Assistant Settings ──────────────────────────────────────── */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
          <CardHeader className="border-b border-gray-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                  <CardTitle className="text-base">
                    {language === 'en' ? 'AI Assistant Settings' : 'إعدادات المساعد الذكي'}
                  </CardTitle>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {language === 'en'
                      ? 'A smart, read-only assistant that helps you on every page — explains the workflow, clarifies permissions, and answers your questions. Appears as a floating button.'
                        : 'مساعد ذكى للقراءة فقط يساعدك فى كل صفحة — يشرح الخطوات، يُوضِّح صلاحياتك، ويُجيب على أسئلتك. يظهر كزر عائم فى كل صفحة.'}
                      </p>
                </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5 space-y-5">
            {/* Enable / Disable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {language === 'en' ? 'Enable AI Assistant' : 'تفعيل المساعد الذكي'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {language === 'en'
                    ? 'Show a floating help button on every page'
                    : 'عرض زر المساعدة العائم في كل صفحة'}
                </p>
              </div>
              <Switch
                checked={aiSettings.ai_assistant_enabled}
                onCheckedChange={(v) => setAiSettings(s => ({ ...s, ai_assistant_enabled: v }))}
              />
            </div>

            {/* Mode selector */}
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-700 dark:text-gray-300">
                {language === 'en' ? 'Display Mode' : 'وضع العرض'}
              </Label>
              <Select
                value={aiSettings.ai_mode}
                onValueChange={(v) => setAiSettings(s => ({ ...s, ai_mode: v as AISettings['ai_mode'] }))}
                disabled={!aiSettings.ai_assistant_enabled}
              >
                <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="disabled">
                    {language === 'en' ? 'Disabled — hide button completely' : 'معطّل — إخفاء الزر كلياً'}
                  </SelectItem>
                  <SelectItem value="manual">
                    {language === 'en' ? 'Manual — show button, open on click' : 'يدوي — يظهر الزر ويُفتح عند الضغط'}
                  </SelectItem>
                  <SelectItem value="auto">
                    {language === 'en' ? 'Auto — open guide automatically on first visit' : 'تلقائي — يفتح الدليل تلقائياً عند أول زيارة للصفحة'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Language mode selector */}
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-700 dark:text-gray-300">
                {language === 'en' ? 'Guide Language' : 'لغة الدليل'}
              </Label>
              <Select
                value={aiSettings.ai_language_mode}
                onValueChange={(v) => setAiSettings(s => ({ ...s, ai_language_mode: v as AISettings['ai_language_mode'] }))}
                disabled={!aiSettings.ai_assistant_enabled}
              >
                <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="follow_app_language">
                    {language === 'en' ? 'Follow app language (recommended)' : 'تتبع لغة التطبيق (موصى به)'}
                  </SelectItem>
                  <SelectItem value="custom">
                    {language === 'en' ? 'Custom — always use a fixed language' : 'مخصص — استخدم لغة ثابتة دائماً'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom language picker — only shown when mode = custom */}
            {aiSettings.ai_language_mode === 'custom' && (
              <div className="space-y-1.5">
                <Label className="text-sm text-gray-700 dark:text-gray-300">
                  {language === 'en' ? 'Fixed Guide Language' : 'لغة الدليل الثابتة'}
                </Label>
                <Select
                  value={aiSettings.ai_custom_language}
                  onValueChange={(v) => setAiSettings(s => ({ ...s, ai_custom_language: v as AISettings['ai_custom_language'] }))}
                  disabled={!aiSettings.ai_assistant_enabled}
                >
                  <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">
                      {language === 'en' ? 'Arabic (العربية)' : 'العربية'}
                    </SelectItem>
                    <SelectItem value="en">
                      {language === 'en' ? 'English' : 'الإنجليزية'}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Info note */}
                  <div className="text-xs text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2.5 border border-blue-100 dark:border-blue-800/40">
                    {language === 'en'
                  ? 'The assistant is read-only. It shows you a quick page overview on opening, then chats with you in plain language. It cannot execute financial operations, approve requests, or modify any data.'
                    : 'هذا المساعد للقراءة فقط. يَفتَح لك نظرة سريعة على الصفحة عند الضغط على الزر العائم، ثم يَرُد على أسئلتك بلغة طبيعية. لا يُنفِّذ أى عملية مالية، ولا يَعتمد أى طلب، ولا يُعدِّل أى بيانات.'}
                  </div>

            <Button
              onClick={handleSaveAISettings}
              disabled={savingAI || !companyId}
              className="gap-2"
              size="sm"
            >
              {savingAI ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {savingAI
                ? (language === 'en' ? 'Saving...' : 'جاري الحفظ...')
                : (language === 'en' ? 'Save AI Settings' : 'حفظ إعدادات المساعد')}
            </Button>
          </CardContent>
        </Card>

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
                <DialogTitle>{language === 'en' ? 'Change Password' : 'تغيير كلمة المرور'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>{language === 'en' ? 'New Password' : 'كلمة المرور الجديدة'}</Label>
                  <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{language === 'en' ? 'Confirm Password' : 'تأكيد كلمة المرور'}</Label>
                  <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsChangePassOpen(false)}>{language === 'en' ? 'Cancel' : 'إلغاء'}</Button>
                <Button
                  onClick={async () => {
                    if (!newPassword || newPassword.length < 6) { toastActionError(toast, language === 'en' ? 'Update' : 'التحديث', language === 'en' ? 'Password' : 'كلمة المرور', language === 'en' ? 'Password must be at least 6 characters' : 'يجب أن تكون كلمة المرور 6 أحرف على الأقل'); return }
                    if (newPassword !== confirmPassword) { toastActionError(toast, language === 'en' ? 'Update' : 'التحديث', language === 'en' ? 'Password' : 'كلمة المرور', language === 'en' ? 'Passwords do not match' : 'كلمتا المرور غير متطابقتين'); return }
                    try {
                      setAccountSaving(true)
                      const { error } = await supabase.auth.updateUser({ password: newPassword })
                      if (error) { toastActionError(toast, language === 'en' ? 'Update' : 'التحديث', language === 'en' ? 'Password' : 'كلمة المرور', error.message || undefined); return }
                      setNewPassword("")
                      setConfirmPassword("")
                      setIsChangePassOpen(false)
                      toastActionSuccess(toast, language === 'en' ? 'Update' : 'التحديث', language === 'en' ? 'Password' : 'كلمة المرور')
                    } finally { setAccountSaving(false) }
                  }}
                  disabled={accountSaving}
                >{accountSaving ? (language === 'en' ? 'Saving...' : 'جاري الحفظ...') : (language === 'en' ? 'Save' : 'حفظ')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isUpdateEmailOpen} onOpenChange={setIsUpdateEmailOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{language === 'en' ? 'Update Email' : 'تحديث البريد الإلكتروني'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>{language === 'en' ? 'New Email' : 'البريد الإلكتروني الجديد'}</Label>
                  <Input type="email" value={newEmailField} onChange={(e) => setNewEmailField(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsUpdateEmailOpen(false)}>{language === 'en' ? 'Cancel' : 'إلغاء'}</Button>
                <Button
                  onClick={async () => {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
                    const newEmail = (newEmailField || '').trim()
                    if (!emailRegex.test(newEmail)) { toastActionError(toast, language === 'en' ? 'Update' : 'التحديث', language === 'en' ? 'Email' : 'البريد الإلكتروني', language === 'en' ? 'Invalid email address' : 'البريد الإلكتروني غير صالح'); return }
                    try {
                      setAccountSaving(true)
                      if (companyId) {
                        const { data: exists } = await supabase
                          .from('company_members')
                          .select('user_id')
                          .eq('company_id', companyId)
                          .eq('email', newEmail)
                        const conflict = Array.isArray(exists) && exists.some((r: any) => String(r.user_id || '') !== String(userId || ''))
                        if (conflict) { toastActionError(toast, language === 'en' ? 'Update' : 'التحديث', language === 'en' ? 'Email' : 'البريد الإلكتروني', language === 'en' ? 'Email already exists in this company' : 'البريد مستخدم بالفعل في هذه الشركة'); return }
                      }
                      const { error } = await supabase.auth.updateUser({ email: newEmail })
                      if (error) { toastActionError(toast, language === 'en' ? 'Update' : 'التحديث', language === 'en' ? 'Email' : 'البريد الإلكتروني', error.message || undefined); return }
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
                      toastActionSuccess(toast, language === 'en' ? 'Update' : 'التحديث', language === 'en' ? 'Email' : 'البريد الإلكتروني')
                    } finally { setAccountSaving(false) }
                  }}
                  disabled={accountSaving}
                >{accountSaving ? (language === 'en' ? 'Saving...' : 'جاري الحفظ...') : (language === 'en' ? 'Save' : 'حفظ')}</Button>
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
                  <Label className="text-gray-600 dark:text-gray-400">{language === 'en' ? 'Active company' : 'الشركة الحالية'}</Label>
                  <Select value={companyId || ''} onValueChange={(val) => {
                    setCompanyId(val)
                    try { if (typeof window !== 'undefined') localStorage.setItem('active_company_id', val) } catch { }
                    try { document.cookie = `active_company_id=${val}; path=/; max-age=31536000` } catch { }
                    try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('company_updated')) } catch { }
                    // إعادة تحميل الصفحة لتحديث جميع البيانات
                    setTimeout(() => window.location.reload(), 100)
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
                      className="relative group cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <img src="/icons/icon-128x128.svg" alt="7ESAB Default Logo" className="h-16 w-16 rounded-xl object-cover border-2 border-white shadow-lg opacity-60" />
                      <div className="absolute inset-0 bg-black/50 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Upload className="w-5 h-5 text-white" />
                      </div>
                      <span className="absolute -bottom-1 -right-1 bg-amber-500 text-white text-[8px] px-1 rounded">{language === 'en' ? 'Default' : 'افتراضي'}</span>
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
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{logoUrl ? (language === 'en' ? 'Logo uploaded' : 'تم رفع الشعار') : (language === 'en' ? 'Upload logo' : 'رفع الشعار')}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{language === 'en' ? 'PNG, JPG up to 2MB' : 'PNG, JPG حتى 2 ميجا'}</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingLogo || !companyId}
                    className="gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    {uploadingLogo ? (language === 'en' ? 'Uploading...' : 'جاري الرفع...') : (language === 'en' ? 'Browse' : 'استعراض')}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400">{L.companyName}</Label>
                <Input placeholder={language === 'en' ? 'Company name' : 'اسم الشركة'} value={name} onChange={(e) => setName(e.target.value)} className="bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700" />
              </div>
              <div className="space-y-3">
                <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-500" />
                  {L.currencyLabel}
                  {availableCurrencies.find(c => c.code === currency)?.is_base && (
                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                      {language === 'en' ? 'Base Currency' : 'العملة الأساسية'}
                    </Badge>
                  )}
                </Label>
                <Select value={currency} onValueChange={(v) => handleCurrencyChange(v)} disabled={loading || loadingCurrencies}>
                  <SelectTrigger className="w-full h-12 bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700">
                    <SelectValue placeholder={language === 'en' ? 'Select currency' : 'اختر العملة'}>
                      {currency && (
                        <span className="flex items-center gap-3">
                          <span className="text-lg">{CURRENCY_FLAGS[currency] || '💱'}</span>
                          <span className="font-semibold text-violet-600 dark:text-violet-400">{currency}</span>
                          <span className="text-gray-500 dark:text-gray-400">-</span>
                          <span className="text-gray-700 dark:text-gray-300">
                            {language === 'en'
                              ? availableCurrencies.find(c => c.code === currency)?.name || currency
                              : availableCurrencies.find(c => c.code === currency)?.name_ar || currency
                            }
                          </span>
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent position="item-aligned" className="max-h-[350px]">
                    {loadingCurrencies ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-violet-600" />
                        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">{language === 'en' ? 'Loading currencies...' : 'جاري تحميل العملات...'}</span>
                      </div>
                    ) : (
                      <>
                        {/* Base currency first */}
                        {availableCurrencies.filter(c => c.is_base).map((c) => (
                          <SelectItem key={c.code} value={c.code} className="py-3">
                            <span className="flex items-center gap-3">
                              <span className="text-lg">{CURRENCY_FLAGS[c.code] || '💱'}</span>
                              <span className="font-bold text-green-600 dark:text-green-400 min-w-[50px]">{c.code}</span>
                              <span className="text-gray-600 dark:text-gray-400">{language === 'en' ? c.name : (c.name_ar || c.name)}</span>
                              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 ml-auto">
                                {language === 'en' ? 'Base' : 'أساسية'}
                              </Badge>
                            </span>
                          </SelectItem>
                        ))}
                        {/* Separator */}
                        {availableCurrencies.some(c => c.is_base) && availableCurrencies.some(c => !c.is_base) && (
                          <div className="border-t border-gray-200 dark:border-slate-700 my-2" />
                        )}
                        {/* Other currencies */}
                        {availableCurrencies.filter(c => !c.is_base).map((c) => (
                          <SelectItem key={c.code} value={c.code} className="py-3">
                            <span className="flex items-center gap-3">
                              <span className="text-lg">{CURRENCY_FLAGS[c.code] || '💱'}</span>
                              <span className="font-semibold text-violet-600 dark:text-violet-400 min-w-[50px]">{c.code}</span>
                              <span className="text-gray-600 dark:text-gray-400">{language === 'en' ? c.name : (c.name_ar || c.name)}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>

                {/* Currency info card */}
                {currency && (
                  <div className="p-3 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-lg border border-violet-200 dark:border-violet-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{CURRENCY_FLAGS[currency] || '💱'}</span>
                        <div>
                          <p className="font-semibold text-violet-700 dark:text-violet-300">{currency}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {language === 'en'
                              ? availableCurrencies.find(c => c.code === currency)?.name
                              : availableCurrencies.find(c => c.code === currency)?.name_ar
                            }
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {language === 'en' ? 'Symbol:' : 'الرمز:'} <span className="font-bold text-lg">{availableCurrencies.find(c => c.code === currency)?.symbol || currency}</span>
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {language === 'en' ? 'Decimals:' : 'الكسور:'} {availableCurrencies.find(c => c.code === currency)?.decimals || 2}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Warning about changing currency - different for owner vs invited user */}
                <div className={`p-3 rounded-lg border ${isCompanyOwner
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                  : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'}`}>
                  <div className="flex items-start gap-2">
                    {isCompanyOwner ? (
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    ) : (
                      <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    )}
                    <div>
                      <p className={`text-xs ${isCompanyOwner
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-blue-700 dark:text-blue-300'}`}>
                        {isCompanyOwner
                          ? (language === 'en'
                            ? 'As the company owner, you can change the base currency. This will affect all financial reports. You can choose to convert existing amounts or display only.'
                            : 'كمالك للشركة، يمكنك تغيير العملة الأساسية. سيؤثر هذا على جميع التقارير المالية. يمكنك اختيار تحويل المبالغ الحالية أو العرض فقط.')
                          : (language === 'en'
                            ? 'As an invited user, you can only change the display currency. The company base currency remains unchanged and no data will be converted.'
                            : 'كمستخدم مدعو، يمكنك فقط تغيير عملة العرض. تبقى العملة الأساسية للشركة دون تغيير ولن يتم تحويل أي بيانات.')
                        }
                      </p>
                      {!isCompanyOwner && (
                        <Badge variant="outline" className="mt-2 text-xs bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700">
                          <Eye className="w-3 h-3 mr-1" />
                          {language === 'en' ? 'Display Only Mode' : 'وضع العرض فقط'}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <Link href="/settings/exchange-rates" className="inline-flex items-center gap-2 text-sm text-violet-600 hover:text-violet-800 dark:text-violet-400 dark:hover:text-violet-300 font-medium transition-colors">
                  <RefreshCcw className="w-4 h-4" />
                  {language === 'en' ? 'Manage Exchange Rates' : 'إدارة أسعار الصرف'}
                  <ChevronRight className="w-4 h-4" />
                </Link>

                {/* ─── FX Account Configuration ─────────────────────── */}
                <div className="mt-4 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Coins className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      <h3 className="font-semibold text-emerald-800 dark:text-emerald-200">
                        {language === 'en' ? 'FX Account Configuration' : 'إعدادات حسابات فروق العملة'}
                      </h3>
                    </div>
                    {!isCompanyOwner && (
                      <Badge variant="outline" className="text-xs bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700">
                        <Eye className="w-3 h-3 mr-1" />
                        {language === 'en' ? 'View only' : 'عرض فقط'}
                      </Badge>
                    )}
                  </div>

                  {!fxColumnsAvailable && (
                    <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-3 text-sm text-yellow-800 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-800">
                      <AlertCircle className="w-4 h-4 inline mr-1" />
                      {language === 'en'
                        ? 'Migration 20260519000200 must be applied first to enable this feature.'
                        : 'يلزم تطبيق Migration 20260519000200 أولاً لتفعيل هذه الميزة.'}
                    </div>
                  )}

                  <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 p-3 text-xs text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    {language === 'en'
                      ? 'Changing these accounts affects only future entries. Existing entries remain linked to the previous account.'
                      : 'تنبيه: تغيير هذه الحسابات سيؤثر فقط على القيود المستقبلية. القيود السابقة ستبقى مرتبطة بالحساب السابق.'}
                  </div>

                  {/* FX Gain Account */}
                  <div className="space-y-1">
                    <Label className="text-gray-600 dark:text-gray-400 text-sm">
                      {language === 'en' ? 'FX Gains Account' : 'حساب أرباح فروق العملة'}
                    </Label>
                    <Select
                      value={fxGainAccountId || ''}
                      onValueChange={(v) => setFxGainAccountId(v || null)}
                      disabled={!isCompanyOwner || savingFX || !fxColumnsAvailable}
                    >
                      <SelectTrigger className="w-full bg-white dark:bg-slate-800">
                        <SelectValue placeholder={language === 'en'
                          ? 'Default: 4320 - FX Gains'
                          : 'افتراضي: 4320 - أرباح فروق العملة'} />
                      </SelectTrigger>
                      <SelectContent>
                        {fxIncomeAccounts.map(a => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.code} - {a.name}
                            {a.code === '4320' && !fxGainAccountId && (
                              <span className="text-xs text-muted-foreground mr-2"> ({language === 'en' ? 'default' : 'افتراضي'})</span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* FX Loss Account */}
                  <div className="space-y-1">
                    <Label className="text-gray-600 dark:text-gray-400 text-sm">
                      {language === 'en' ? 'FX Losses Account' : 'حساب خسائر فروق العملة'}
                    </Label>
                    <Select
                      value={fxLossAccountId || ''}
                      onValueChange={(v) => setFxLossAccountId(v || null)}
                      disabled={!isCompanyOwner || savingFX || !fxColumnsAvailable}
                    >
                      <SelectTrigger className="w-full bg-white dark:bg-slate-800">
                        <SelectValue placeholder={language === 'en'
                          ? 'Default: 5310 - FX Losses'
                          : 'افتراضي: 5310 - خسائر فروق العملة'} />
                      </SelectTrigger>
                      <SelectContent>
                        {fxExpenseAccounts.map(a => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.code} - {a.name}
                            {a.code === '5310' && !fxLossAccountId && (
                              <span className="text-xs text-muted-foreground mr-2"> ({language === 'en' ? 'default' : 'افتراضي'})</span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={handleSaveFXAccounts}
                      disabled={!isCompanyOwner || savingFX || !fxColumnsAvailable}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Save className="w-4 h-4 mr-1" />
                      {savingFX
                        ? (language === 'en' ? 'Saving...' : 'جاري الحفظ...')
                        : (language === 'en' ? 'Save Configuration' : 'حفظ التهيئة')}
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={!isCompanyOwner || savingFX}>
                          {language === 'en' ? 'Reset to Defaults' : 'إعادة تعيين للافتراضي'}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {language === 'en' ? 'Confirm Reset' : 'تأكيد إعادة التعيين'}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {language === 'en'
                              ? 'FX accounts will be reset to defaults (4320/5310). Press "Save Configuration" to apply.'
                              : 'سيتم إعادة حسابات فروق العملة إلى الافتراضي (4320/5310). اضغط "حفظ التهيئة" للتطبيق.'}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{language === 'en' ? 'Cancel' : 'إلغاء'}</AlertDialogCancel>
                          <AlertDialogAction onClick={handleResetFX}>
                            {language === 'en' ? 'Confirm' : 'تأكيد'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  {L.appLanguage}
                </Label>
                <Select value={language} onValueChange={(v) => { setLanguage(v); try { localStorage.setItem('app_language', v); document.cookie = `app_language=${v}; path=/; max-age=31536000`; window.dispatchEvent(new Event('app_language_changed')) } catch { } }} disabled={loading}>
                  <SelectTrigger className="w-full bg-gray-50 dark:bg-slate-800">
                    <SelectValue placeholder={language === 'en' ? 'Select language' : 'اختر اللغة'} />
                  </SelectTrigger>
                  <SelectContent position="item-aligned">
                    <SelectItem value="ar">{L.arabic}</SelectItem>
                    <SelectItem value="en">{L.english}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400">{L.city}</Label>
                <Input placeholder={language === 'en' ? 'City' : 'المدينة'} value={city} onChange={(e) => setCity(e.target.value)} className="bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400">{L.country}</Label>
                <Input placeholder={language === 'en' ? 'Country' : 'الدولة'} value={country} onChange={(e) => setCountry(e.target.value)} className="bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400">{L.phone}</Label>
                <Input placeholder={language === 'en' ? 'Phone number' : 'رقم الهاتف'} value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400">{L.taxIdLabel}</Label>
                <Input placeholder={language === 'en' ? 'Tax ID' : 'الرقم الضريبي'} value={taxId} onChange={(e) => setTaxId(e.target.value)} className="bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-gray-600 dark:text-gray-400">{L.address}</Label>
                <Input placeholder={language === 'en' ? 'Address' : 'العنوان'} value={address} onChange={(e) => setAddress(e.target.value)} className="bg-gray-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700" />
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

        {/* قسم إعدادات بونص المبيعات */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
          <CardHeader className="border-b border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg shadow-lg shadow-green-500/20">
                  <Coins className="w-5 h-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">{language === 'en' ? 'Sales Bonus Settings' : 'إعدادات بونص المبيعات'}</CardTitle>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {language === 'en' ? 'Configure sales commission and bonus system' : 'تكوين نظام العمولات والبونص للمبيعات'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/settings/employee-bonuses">
                  <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300">
                    <Users2 className="w-4 h-4 mr-1" />
                    {language === 'en' ? 'Per-Employee Bonuses' : 'بونصات الموظفين'}
                  </Button>
                </Link>
                <Label htmlFor="bonus-enabled" className="text-sm text-gray-600 dark:text-gray-400">
                  {language === 'en' ? 'Enable' : 'تفعيل'}
                </Label>
                <Switch
                  id="bonus-enabled"
                  checked={bonusSettings.bonus_enabled}
                  onCheckedChange={(checked) => setBonusSettings({ ...bonusSettings, bonus_enabled: checked })}
                  disabled={!isCompanyOwner}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {bonusSettings.bonus_enabled ? (
              <div className="space-y-6">
                {/* نوع البونص */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-600 dark:text-gray-400">{language === 'en' ? 'Bonus Type' : 'نوع البونص'}</Label>
                    <Select value={bonusSettings.bonus_type} onValueChange={(v: 'percentage' | 'fixed' | 'points') => setBonusSettings({ ...bonusSettings, bonus_type: v })} disabled={!isCompanyOwner}>
                      <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">{language === 'en' ? 'Percentage of Invoice' : 'نسبة من الفاتورة'}</SelectItem>
                        <SelectItem value="fixed">{language === 'en' ? 'Fixed Amount per Invoice' : 'مبلغ ثابت لكل فاتورة'}</SelectItem>
                        <SelectItem value="points">{language === 'en' ? 'Points System' : 'نظام النقاط'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* قيمة البونص حسب النوع */}
                  {bonusSettings.bonus_type === 'percentage' && (
                    <div className="space-y-2">
                      <Label className="text-gray-600 dark:text-gray-400">{language === 'en' ? 'Bonus Percentage (%)' : 'نسبة البونص (%)'}</Label>
                      <NumericInput
                        min={0}
                        max={100}
                        step="0.1"
                        value={bonusSettings.bonus_percentage}
                        onChange={(val) => setBonusSettings({ ...bonusSettings, bonus_percentage: val })}
                        decimalPlaces={1}
                        className="bg-gray-50 dark:bg-slate-800"
                        disabled={!isCompanyOwner}
                      />
                    </div>
                  )}
                  {bonusSettings.bonus_type === 'fixed' && (
                    <div className="space-y-2">
                      <Label className="text-gray-600 dark:text-gray-400">{language === 'en' ? 'Fixed Amount per Invoice' : 'المبلغ الثابت لكل فاتورة'}</Label>
                      <NumericInput
                        min={0}
                        step="1"
                        value={bonusSettings.bonus_fixed_amount}
                        onChange={(val) => setBonusSettings({ ...bonusSettings, bonus_fixed_amount: Math.round(val) })}
                        className="bg-gray-50 dark:bg-slate-800"
                        disabled={!isCompanyOwner}
                      />
                    </div>
                  )}
                  {bonusSettings.bonus_type === 'points' && (
                    <div className="space-y-2">
                      <Label className="text-gray-600 dark:text-gray-400">{language === 'en' ? 'Points per 100 Currency' : 'نقاط لكل 100 وحدة عملة'}</Label>
                      <NumericInput
                        min={0}
                        step="1"
                        value={bonusSettings.bonus_points_per_value}
                        onChange={(val) => setBonusSettings({ ...bonusSettings, bonus_points_per_value: Math.round(val) })}
                        className="bg-gray-50 dark:bg-slate-800"
                        disabled={!isCompanyOwner}
                      />
                    </div>
                  )}
                </div>

                {/* الحدود القصوى */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-600 dark:text-gray-400">{language === 'en' ? 'Daily Cap (optional)' : 'الحد اليومي (اختياري)'}</Label>
                    <NumericInput
                      min={0}
                      placeholder={language === 'en' ? 'No limit' : 'بدون حد'}
                      value={bonusSettings.bonus_daily_cap || 0}
                      onChange={(val) => setBonusSettings({ ...bonusSettings, bonus_daily_cap: val > 0 ? Math.round(val) : null })}
                      className="bg-gray-50 dark:bg-slate-800"
                      disabled={!isCompanyOwner}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-600 dark:text-gray-400">{language === 'en' ? 'Monthly Cap (optional)' : 'الحد الشهري (اختياري)'}</Label>
                    <NumericInput
                      min={0}
                      placeholder={language === 'en' ? 'No limit' : 'بدون حد'}
                      value={bonusSettings.bonus_monthly_cap || 0}
                      onChange={(val) => setBonusSettings({ ...bonusSettings, bonus_monthly_cap: val > 0 ? Math.round(val) : null })}
                      className="bg-gray-50 dark:bg-slate-800"
                      disabled={!isCompanyOwner}
                    />
                  </div>
                </div>

                {/* طريقة الصرف - ثابتة على "مع المرتبات" */}
                <div className="space-y-2">
                  <Label className="text-gray-600 dark:text-gray-400">{language === 'en' ? 'Payout Mode' : 'طريقة الصرف'}</Label>
                  <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-blue-700 dark:text-blue-300 font-medium">
                      {language === 'en' ? 'With Payroll (Monthly)' : 'مع المرتبات (شهرياً)'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {language === 'en'
                      ? 'Commissions are automatically added to monthly salary. Use Early Payout page for advance payments.'
                      : 'يتم إضافة العمولات تلقائياً للمرتب الشهري. استخدم صفحة الصرف المبكر للسلف.'}
                  </p>
                </div>

                {/* زر الحفظ */}
                <div className="pt-4 border-t border-gray-100 dark:border-slate-800">
                  <Button
                    className="gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-lg shadow-green-500/20"
                    onClick={handleSaveBonusSettings}
                    disabled={savingBonus || !isCompanyOwner}
                  >
                    <Save className="w-4 h-4" />
                    {savingBonus ? (language === 'en' ? 'Saving...' : 'جاري الحفظ...') : (language === 'en' ? 'Save Bonus Settings' : 'حفظ إعدادات البونص')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Coins className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-gray-500 dark:text-gray-400">
                  {language === 'en' ? 'Sales bonus system is disabled. Enable it to configure bonus settings.' : 'نظام بونص المبيعات معطل. قم بتفعيله لتكوين إعدادات البونص.'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

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

              {/* استيراد النسخة الاحتياطية - متاح فقط للمالك */}
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl blur-xl opacity-20 group-hover:opacity-30 transition-opacity" />
                <div className={`relative p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl border ${isCompanyOwner ? 'border-blue-200 dark:border-blue-800' : 'border-gray-300 dark:border-gray-700 opacity-60'}`}>
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-white dark:bg-slate-800 rounded-xl shadow-lg">
                      <UploadCloud className={`w-8 h-8 ${isCompanyOwner ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
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
                      {isCompanyOwner ? (
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
                      ) : (
                        <div className="mt-3 p-3 bg-red-100 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-red-700 dark:text-red-300">
                              {language === 'en'
                                ? 'Only the company owner can restore backups'
                                : 'فقط مالك الشركة يمكنه استعادة النسخ الاحتياطية'}
                            </p>
                          </div>
                        </div>
                      )}
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
                    disabled={isImporting || !companyId || !isCompanyOwner}
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
                <HardDrive className="w-4 h-4 text-gray-500 dark:text-gray-400" />
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

        {/* v3.61.2 A7 — Encrypt/Decrypt passphrase dialog */}
        <PassphraseDialog
          open={passDialogOpen}
          mode={passDialogMode}
          language={language as 'ar' | 'en'}
          hint={passDialogHint}
          error={passDialogError}
          onConfirm={handlePassDialogConfirm}
          onCancel={handlePassDialogCancel}
        />

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
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
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
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
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

        {/* Currency Conversion Dialog */}
        <Dialog open={showCurrencyDialog} onOpenChange={setShowCurrencyDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <RefreshCcw className="w-5 h-5 text-violet-600" />
                {isCompanyOwner
                  ? (language === 'en' ? 'Currency Change Options' : 'خيارات تغيير العملة')
                  : (language === 'en' ? 'Display Currency' : 'عملة العرض')
                }
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Role-based info banner */}
              {!isCompanyOwner && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        {language === 'en' ? 'Display Currency Only' : 'عملة العرض فقط'}
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                        {language === 'en'
                          ? 'As an invited user, you can only change the display currency. This will not affect the company\'s base currency or convert any data.'
                          : 'كمستخدم مدعو، يمكنك فقط تغيير عملة العرض. لن يؤثر هذا على العملة الأساسية للشركة أو تحويل أي بيانات.'
                        }
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Exchange rate info */}
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="w-4 h-4 text-blue-600" />
                  <span className="font-medium text-blue-800 dark:text-blue-200">
                    {language === 'en' ? 'Exchange Rate' : 'سعر الصرف'}
                  </span>
                </div>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  1 {originalSystemCurrency} = {conversionRate.toFixed(4)} {pendingCurrency}
                </p>
              </div>

              {/* Original currency info */}
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {language === 'en' ? 'Company Base Currency' : 'العملة الأساسية للشركة'}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{CURRENCY_FLAGS[originalSystemCurrency] || '💱'}</span>
                  <p className="font-medium text-gray-900 dark:text-white">{originalSystemCurrency}</p>
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                    {language === 'en' ? 'Base' : 'أساسية'}
                  </Badge>
                </div>
              </div>

              {/* Options description - only for owners */}
              {isCompanyOwner && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {language === 'en' ? 'Choose how to apply the currency change:' : 'اختر طريقة تطبيق تغيير العملة:'}
                  </p>

                  {/* Option descriptions */}
                  <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
                    <div className="flex items-start gap-2 p-2 bg-violet-50 dark:bg-violet-900/20 rounded-lg">
                      <RefreshCcw className="w-4 h-4 text-violet-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-violet-700 dark:text-violet-300">
                          {language === 'en' ? 'Convert All Amounts' : 'تحويل جميع المبالغ'}
                        </p>
                        <p className="text-violet-600 dark:text-violet-400">
                          {language === 'en'
                            ? 'Changes the base currency and converts all amounts. Original values are preserved for reversal.'
                            : 'يغير العملة الأساسية ويحول جميع المبالغ. يتم حفظ القيم الأصلية للعودة إليها.'
                          }
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                      <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-gray-700 dark:text-gray-300">
                          {language === 'en' ? 'Display Only' : 'عرض فقط'}
                        </p>
                        <p>
                          {language === 'en'
                            ? 'Shows amounts in the selected currency without changing base currency or data.'
                            : 'يعرض المبالغ بالعملة المختارة دون تغيير العملة الأساسية أو البيانات.'
                          }
                        </p>
                      </div>
                    </div>

                    {currency !== originalSystemCurrency && (
                      <div className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                        <History className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-amber-700 dark:text-amber-300">
                            {language === 'en' ? 'Reset to Original' : 'العودة للأصل'}
                          </p>
                          <p className="text-amber-600 dark:text-amber-400">
                            {language === 'en'
                              ? 'Restores all amounts to their original values before any conversion.'
                              : 'يستعيد جميع المبالغ إلى قيمها الأصلية قبل أي تحويل.'
                            }
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              {/* For invited users - only display option */}
              {!isCompanyOwner ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setShowCurrencyDialog(false)}
                    className="flex-1"
                  >
                    {language === 'en' ? 'Cancel' : 'إلغاء'}
                  </Button>
                  <Button
                    className="flex-1 bg-violet-600 hover:bg-violet-700"
                    onClick={changeDisplayOnly}
                    disabled={isConverting}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    {language === 'en' ? 'Change Display Currency' : 'تغيير عملة العرض'}
                  </Button>
                </>
              ) : (
                <>
                  {/* Reset to original button - only show if not already on original */}
                  {currency !== originalSystemCurrency && (
                    <Button
                      variant="outline"
                      onClick={resetToOriginalCurrency}
                      disabled={isConverting}
                      className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300"
                    >
                      <History className="w-4 h-4 mr-2" />
                      {language === 'en' ? 'Reset to Original' : 'العودة للأصل'}
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    onClick={changeDisplayOnly}
                    disabled={isConverting}
                    className="flex-1"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    {language === 'en' ? 'Display Only' : 'عرض فقط'}
                  </Button>

                  <Button
                    className="flex-1 bg-violet-600 hover:bg-violet-700"
                    onClick={applyCurrencyWithConversion}
                    disabled={isConverting}
                  >
                    {isConverting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        {language === 'en' ? 'Converting...' : 'جاري التحويل...'}
                      </>
                    ) : (
                      <>
                        <RefreshCcw className="w-4 h-4 mr-2" />
                        {language === 'en' ? 'Convert All Amounts' : 'تحويل جميع المبالغ'}
                      </>
                    )}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}

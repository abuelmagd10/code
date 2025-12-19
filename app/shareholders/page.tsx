"use client"

import { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { CompanyHeader } from "@/components/company-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Plus, Edit2, Trash2, DollarSign, Users } from "lucide-react"
import { filterLeafAccounts, filterCashBankAccounts } from "@/lib/accounts"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { canAction } from "@/lib/authz"
import { BranchCostCenterSelector } from "@/components/branch-cost-center-selector"

interface Shareholder {
  id: string
  name: string
  email?: string
  phone?: string
  national_id?: string
  percentage: number
  notes?: string
}

interface ContributionForm {
  shareholder_id: string
  contribution_date: string
  amount: number
  notes?: string
  payment_account_id?: string // الحساب المصرفي أو الخزنة
}

interface AccountOption {
  id: string
  account_code: string
  account_name: string
  account_type: string
}

interface DistributionSettings {
  id?: string
  debit_account_id?: string
  credit_account_id?: string
}

export default function ShareholdersPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar'|'en'>(() => {
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
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [shareholders, setShareholders] = useState<Shareholder[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [originalName, setOriginalName] = useState<string | null>(null)
  const [formData, setFormData] = useState<Shareholder>({
    id: "",
    name: "",
    email: "",
    phone: "",
    national_id: "",
    percentage: 0,
    notes: "",
  })
  const [isSavingShareholder, setIsSavingShareholder] = useState<boolean>(false)
  const [isContributionOpen, setIsContributionOpen] = useState<boolean>(false)
  const [contributionForm, setContributionForm] = useState<ContributionForm>({
    shareholder_id: "",
    contribution_date: new Date().toISOString().slice(0, 10),
    amount: 0,
    notes: "",
  })
  const [distributionAmount, setDistributionAmount] = useState<number>(0)
  const [distributionDate, setDistributionDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [distributionSaving, setDistributionSaving] = useState<boolean>(false)

  // Branch and Cost Center for profit distribution
  const [branchId, setBranchId] = useState<string | null>(null)
  const [costCenterId, setCostCenterId] = useState<string | null>(null)

  // Accounts and default settings
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [cashBankAccounts, setCashBankAccounts] = useState<AccountOption[]>([]) // الحسابات المصرفية والخزائن
  const [settings, setSettings] = useState<DistributionSettings>({})
  const [isSavingDefaults, setIsSavingDefaults] = useState<boolean>(false)

  // === إصلاح أمني: صلاحيات المساهمين ===
  const [permWrite, setPermWrite] = useState(false)
  const [permUpdate, setPermUpdate] = useState(false)
  const [permDelete, setPermDelete] = useState(false)

  // التحقق من الصلاحيات
  useEffect(() => {
    const checkPerms = async () => {
      const [write, update, del] = await Promise.all([
        canAction(supabase, "shareholders", "write"),
        canAction(supabase, "shareholders", "update"),
        canAction(supabase, "shareholders", "delete"),
      ])
      setPermWrite(write)
      setPermUpdate(update)
      setPermDelete(del)
    }
    checkPerms()
  }, [supabase])

  const totalPercentage = useMemo(
    () => shareholders.reduce((sum, s) => sum + Number(s.percentage || 0), 0),
    [shareholders],
  )

  useEffect(() => {
    const init = async () => {
      try {
        setIsLoading(true)
        const cid = await getActiveCompanyId(supabase)
        if (!cid) return
        setCompanyId(cid)
        await Promise.all([loadShareholders(cid), loadAccounts(cid), loadCashBankAccounts(cid), loadDistributionSettings(cid)])
      } catch (e) {
        console.error(e)
      } finally {
        setIsLoading(false)
      }
    }
    init()
    setHydrated(true)
    const handler = () => {
      try {
        const docLang = document.documentElement?.lang
        if (docLang === 'en') { setAppLang('en'); return }
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        const v = fromCookie || localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch {}
    }
    window.addEventListener('app_language_changed', handler)
    window.addEventListener('storage', (e: any) => { if (e?.key === 'app_language') handler() })
    return () => { window.removeEventListener('app_language_changed', handler) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadShareholders = async (company_id: string) => {
    const { data } = await supabase
      .from("shareholders")
      .select("id, name, email, phone, national_id, percentage, notes")
      .eq("company_id", company_id)
      .order("created_at", { ascending: true })
    setShareholders((data || []) as Shareholder[])
  }

  const loadAccounts = async (company_id: string) => {
    const { data } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type, parent_id")
      .eq("company_id", company_id)
      .order("account_code", { ascending: true })
    const list = (data || []) as any
    const leafOnly = filterLeafAccounts(list)
    setAccounts(leafOnly as AccountOption[])
  }

  const loadCashBankAccounts = async (company_id: string) => {
    const { data } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type, sub_type, parent_id")
      .eq("company_id", company_id)
      .order("account_code", { ascending: true })
    const list = (data || []) as any
    const cashBankOnly = filterCashBankAccounts(list, true) // leaf accounts only
    setCashBankAccounts(cashBankOnly as AccountOption[])
  }

  const loadDistributionSettings = async (company_id: string) => {
    const { data } = await supabase
      .from("profit_distribution_settings")
      .select("id, debit_account_id, credit_account_id")
      .eq("company_id", company_id)
      .maybeSingle()
    if (data) {
      setSettings({ id: data.id, debit_account_id: data.debit_account_id || undefined, credit_account_id: data.credit_account_id || undefined })
    }
  }

  const saveDefaultAccounts = async () => {
    if (!companyId) return
    if (!settings.debit_account_id || !settings.credit_account_id) {
      toast({ title: "حقول مطلوبة", description: "يرجى اختيار الحسابين الافتراضيين" })
      return
    }
    try {
      setIsSavingDefaults(true)
      if (settings.id) {
        const { error } = await supabase
          .from("profit_distribution_settings")
          .update({ debit_account_id: settings.debit_account_id, credit_account_id: settings.credit_account_id })
          .eq("id", settings.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from("profit_distribution_settings")
          .insert([{ company_id: companyId, debit_account_id: settings.debit_account_id, credit_account_id: settings.credit_account_id }])
          .select("id")
          .single()
        if (error) throw error
        setSettings({ ...settings, id: data.id })
      }
      toastActionSuccess(toast, "الحفظ", "الحسابات الافتراضية")
    } catch (err) {
      console.error("Error saving defaults:", err)
      toastActionError(toast, "الحفظ", "الحسابات الافتراضية")
    } finally {
      setIsSavingDefaults(false)
    }
  }

  const resetForm = () => {
    setFormData({ id: "", name: "", email: "", phone: "", national_id: "", percentage: 0, notes: "" })
    setEditingId(null)
    setOriginalName(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId) {
      toast({ title: "لا يمكن الحفظ", description: "لم يتم العثور على شركة مرتبطة بالمستخدم. يرجى إنشاء شركة أولًا.", variant: "destructive" })
      return
    }
    if (!formData.name || String(formData.name).trim().length === 0) {
      toast({ title: "بيانات غير مكتملة", description: "يرجى إدخال اسم المساهم", variant: "destructive" })
      return
    }
    try {
      setIsSavingShareholder(true)
      const payload = {
        name: formData.name,
        email: formData.email || null,
        phone: formData.phone || null,
        national_id: formData.national_id || null,
        percentage: Number(formData.percentage || 0),
        notes: formData.notes || null,
      }
      if (editingId) {
        const { error } = await supabase.from("shareholders").update(payload).eq("id", editingId)
        if (error) throw error

        // Auto-rename the capital account if the shareholder name changed
        try {
          const prevName = (originalName || "").trim()
          const newName = (payload.name || "").trim()
          if (prevName && newName && prevName !== newName) {
            const oldAccountName = `رأس مال - ${prevName}`
            const newAccountName = `رأس مال - ${newName}`
            const { data: targetAccount } = await supabase
              .from("chart_of_accounts")
              .select("id")
              .eq("company_id", companyId)
              .eq("account_type", "equity")
              .eq("account_name", oldAccountName)
              .maybeSingle()

            if (targetAccount) {
              const { error: renameErr } = await supabase
                .from("chart_of_accounts")
                .update({ account_name: newAccountName })
                .eq("id", targetAccount.id)
              if (renameErr) {
                console.warn("فشل إعادة تسمية حساب رأس المال تلقائيًا", renameErr)
              }
            }
          }
        } catch (e) {
          console.warn("حدث خطأ أثناء محاولة إعادة تسمية حساب رأس المال تلقائيًا", e)
        }
      } else {
        const { data: insertedRow, error } = await supabase
          .from("shareholders")
          .insert([{ ...payload, company_id: companyId }])
          .select("id")
          .single()
        if (error) throw error

        // Auto-create a capital account for the new shareholder
        try {
          const capitalAccountName = `رأس مال - ${payload.name}`

          // Check if an account with the same name already exists for this company
          const { data: existingAccount } = await supabase
            .from("chart_of_accounts")
            .select("id")
            .eq("company_id", companyId)
            .eq("account_name", capitalAccountName)
            .maybeSingle()

          if (!existingAccount) {
            // Find the next available equity account code
            const { data: equityAccounts, error: loadEquityErr } = await supabase
              .from("chart_of_accounts")
              .select("account_code")
              .eq("company_id", companyId)
              .eq("account_type", "equity")

            if (loadEquityErr) {
              console.warn("تعذر تحميل حسابات حقوق الملكية لتوليد كود جديد", loadEquityErr)
            }

            const numericCodes = (equityAccounts || [])
              .map((a: any) => parseInt(a.account_code, 10))
              .filter((n: number) => !isNaN(n))
            const nextCode = numericCodes.length > 0 ? Math.max(...numericCodes) + 1 : 3000

            const { error: createAccErr } = await supabase.from("chart_of_accounts").insert([
              {
                company_id: companyId,
                account_code: String(nextCode),
                account_name: capitalAccountName,
                account_type: "equity",
                description: "حساب رأس مال خاص بالمساهم",
                opening_balance: 0,
              },
            ])

            if (createAccErr) {
              console.warn("فشل إنشاء حساب رأس المال تلقائيًا", createAccErr)
            }
          }
        } catch (e) {
          console.warn("حدث خطأ أثناء محاولة إنشاء حساب رأس المال تلقائيًا", e)
        }
      }
      setIsDialogOpen(false)
      resetForm()
      await loadShareholders(companyId)
      // Refresh accounts so the new capital account appears immediately
      await loadAccounts(companyId)
      toastActionSuccess(toast, "الحفظ", "بيانات المساهم")
    } catch (error: any) {
      const serialized = typeof error === "object" ? JSON.stringify(error) : String(error)
      console.error("Error saving shareholder:", serialized)
      const msg: string = (error && typeof error.message === "string" && error.message.length > 0) ? error.message : (serialized || "خطأ غير معروف")
      // محاولة تقديم رسالة أدق حسب نوع الخطأ
      if (msg.toLowerCase().includes("row-level security") || msg.toLowerCase().includes("rls")) {
        toast({ title: "تم رفض العملية", description: "تم رفض العملية بواسطة RLS. تأكد أن company_id للمساهم يعود لشركة مملوكة لحسابك وأنك مسجل الدخول.", variant: "destructive" })
      } else if (msg.toLowerCase().includes("relation \"shareholders\" does not exist") || msg.toLowerCase().includes("shareholders")) {
        toast({ title: "جدول غير موجود", description: "جدول المساهمين غير موجود. يرجى تطبيق سكربت SQL: scripts/003_shareholders.sql في Supabase.", variant: "destructive" })
      } else {
        toastActionError(toast, "الحفظ", "بيانات المساهم", `حدث خطأ أثناء حفظ بيانات المساهم: ${msg}`)
      }
    } finally {
      setIsSavingShareholder(false)
    }
  }

  const handleEdit = (s: Shareholder) => {
    setFormData(s)
    setEditingId(s.id)
    setOriginalName(s.name)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("shareholders").delete().eq("id", id)
      if (error) throw error
      if (companyId) await loadShareholders(companyId)
    } catch (error) {
      console.error("Error deleting shareholder:", error)
    }
  }

  const openContributionDialog = async (s: Shareholder) => {
    setContributionForm({
      shareholder_id: s.id,
      amount: 0,
      contribution_date: new Date().toISOString().slice(0, 10),
      notes: "",
      payment_account_id: "", // سيتم اختياره من المستخدم
    })
    setIsContributionOpen(true)
    
    // تحميل الحسابات المصرفية والخزائن عند فتح النموذج (للتأكد من أنها محدثة)
    if (companyId) {
      await loadCashBankAccounts(companyId)
    }
  }

  const saveContribution = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId) {
      toast({ title: "خطأ", description: "لم يتم العثور على الشركة", variant: "destructive" })
      return
    }

    // التحقق من البيانات المطلوبة
    if (!contributionForm.payment_account_id) {
      toast({ 
        title: appLang === 'en' ? 'Required Field' : 'حقل مطلوب', 
        description: appLang === 'en' ? 'Please select a payment account (Bank or Cash)' : 'يرجى اختيار حساب الدفع (بنك أو خزنة)', 
        variant: "destructive" 
      })
      return
    }

    if (!contributionForm.amount || contributionForm.amount <= 0) {
      toast({ 
        title: appLang === 'en' ? 'Invalid Amount' : 'مبلغ غير صحيح', 
        description: appLang === 'en' ? 'Please enter a valid contribution amount' : 'يرجى إدخال مبلغ مساهمة صحيح', 
        variant: "destructive" 
      })
      return
    }

    try {
      // 1. العثور على المساهم وحساب رأس ماله
      const { data: shareholder } = await supabase
        .from("shareholders")
        .select("id, name")
        .eq("id", contributionForm.shareholder_id)
        .eq("company_id", companyId)
        .single()

      if (!shareholder) {
        toast({ title: "خطأ", description: "لم يتم العثور على المساهم", variant: "destructive" })
        return
      }

      const capitalAccountName = `رأس مال - ${shareholder.name}`
      const { data: capitalAccount } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name")
        .eq("company_id", companyId)
        .eq("account_type", "equity")
        .eq("account_name", capitalAccountName)
        .maybeSingle()

      if (!capitalAccount) {
        toast({ 
          title: appLang === 'en' ? 'Account Not Found' : 'حساب غير موجود', 
          description: appLang === 'en' 
            ? `Capital account not found for ${shareholder.name}. Please create it first.` 
            : `حساب رأس المال غير موجود لـ ${shareholder.name}. يرجى إنشاؤه أولاً.`, 
          variant: "destructive" 
        })
        return
      }

      // 2. التحقق من وجود الحساب المصرفي/الخزنة
      const { data: paymentAccount } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name")
        .eq("id", contributionForm.payment_account_id)
        .eq("company_id", companyId)
        .maybeSingle()

      if (!paymentAccount) {
        toast({ title: "خطأ", description: "الحساب المصرفي/الخزنة غير موجود", variant: "destructive" })
        return
      }

      const contributionAmount = Number(contributionForm.amount || 0)

      // 3. التحقق من صحة القيد (Debit = Credit)
      const totalDebit = contributionAmount
      const totalCredit = contributionAmount
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        toast({ 
          title: appLang === 'en' ? 'Invalid Entry' : 'قيد غير صحيح', 
          description: appLang === 'en' 
            ? 'Debit and Credit amounts must be equal' 
            : 'يجب أن يكون المبلغ المدين مساوياً للمبلغ الدائن', 
          variant: "destructive" 
        })
        return
      }

      // 4. حفظ المساهمة
      const { data: contribution, error: contribError } = await supabase
        .from("capital_contributions")
        .insert([
          {
            company_id: companyId,
            shareholder_id: contributionForm.shareholder_id,
            contribution_date: contributionForm.contribution_date,
            amount: contributionAmount,
            notes: contributionForm.notes || null,
          },
        ])
        .select("id")
        .single()

      if (contribError) throw contribError

      // 5. إنشاء القيد المحاسبي (Double Entry)
      const { data: journalEntry, error: entryError } = await supabase
        .from("journal_entries")
        .insert([
          {
            company_id: companyId,
            reference_type: "capital_contribution",
            reference_id: contribution.id,
            entry_date: contributionForm.contribution_date,
            description: `مساهمة رأس مال من ${shareholder.name} - ${contributionAmount.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          },
        ])
        .select("id")
        .single()

      if (entryError) {
        // Rollback: حذف المساهمة إذا فشل إنشاء القيد
        await supabase.from("capital_contributions").delete().eq("id", contribution.id)
        throw entryError
      }

      // 6. إنشاء سطور القيد (Double Entry Accounting)
      const journalLines = [
        {
          journal_entry_id: journalEntry.id,
          account_id: capitalAccount.id, // حساب رأس المال (Equity) - مدين
          debit_amount: contributionAmount,
          credit_amount: 0,
          description: `مساهمة رأس مال من ${shareholder.name}`,
        },
        {
          journal_entry_id: journalEntry.id,
          account_id: paymentAccount.id, // الحساب المصرفي/الخزنة - دائن
          debit_amount: 0,
          credit_amount: contributionAmount,
          description: `استلام مساهمة رأس مال من ${shareholder.name}`,
        },
      ]

      const { error: linesError } = await supabase
        .from("journal_entry_lines")
        .insert(journalLines)

      if (linesError) {
        // Rollback: حذف القيد والمساهمة
        await supabase.from("journal_entries").delete().eq("id", journalEntry.id)
        await supabase.from("capital_contributions").delete().eq("id", contribution.id)
        throw linesError
      }

      // 7. التحقق النهائي من توازن القيد
      const { data: linesCheck } = await supabase
        .from("journal_entry_lines")
        .select("debit_amount, credit_amount")
        .eq("journal_entry_id", journalEntry.id)

      const finalDebit = (linesCheck || []).reduce((sum, line) => sum + (line.debit_amount || 0), 0)
      const finalCredit = (linesCheck || []).reduce((sum, line) => sum + (line.credit_amount || 0), 0)

      if (Math.abs(finalDebit - finalCredit) > 0.01) {
        // Rollback: حذف كل شيء إذا كان القيد غير متوازن
        await supabase.from("journal_entry_lines").delete().eq("journal_entry_id", journalEntry.id)
        await supabase.from("journal_entries").delete().eq("id", journalEntry.id)
        await supabase.from("capital_contributions").delete().eq("id", contribution.id)
        throw new Error("القيد غير متوازن - Debit و Credit غير متساويين")
      }

      setIsContributionOpen(false)
      toastActionSuccess(toast, "التسجيل", "مساهمة رأس المال")
      
      // تحديث البيانات
      if (companyId) {
        await loadShareholders(companyId)
        await loadAccounts(companyId)
      }
    } catch (error: any) {
      console.error("Error saving contribution:", error)
      const errorMsg = error?.message || (appLang === 'en' ? 'Failed to save contribution' : 'فشل حفظ المساهمة')
      toastActionError(toast, "التسجيل", "مساهمة رأس المال", errorMsg)
    }
  }

  const distributeProfit = async () => {
    if (!companyId) return
    if (distributionAmount <= 0) return
    if (shareholders.length === 0) return
    // Optional check: percentages total to 100
    if (Math.round(totalPercentage) !== 100) {
      toast({ title: "نِسَب غير صالحة", description: "يجب أن يكون مجموع نسب الملكية 100% قبل توزيع الأرباح", variant: "destructive" })
      return
    }
    if (!settings.debit_account_id || !settings.credit_account_id) {
      toast({ title: "بيانات غير مكتملة", description: "يرجى اختيار الحسابات الافتراضية (مدين/دائن) أولًا", variant: "destructive" })
      return
    }
    try {
      setDistributionSaving(true)
      // Create distribution header
      const { data: header, error: hErr } = await supabase
        .from("profit_distributions")
        .insert([
          { company_id: companyId, distribution_date: distributionDate, total_profit: distributionAmount },
        ])
        .select("id")
        .single()
      if (hErr) throw hErr
      const distribution_id = header.id
      // Create lines
      const lines = shareholders.map((s) => ({
        distribution_id,
        shareholder_id: s.id,
        percentage_at_distribution: Number(s.percentage || 0),
        amount: Number(((distributionAmount * Number(s.percentage || 0)) / 100).toFixed(2)),
      }))
      const { error: lErr } = await supabase.from("profit_distribution_lines").insert(lines)
      if (lErr) throw lErr

      // Create journal entry (automatic)
      const { data: entry, error: jErr } = await supabase
        .from("journal_entries")
        .insert([
          {
            company_id: companyId,
            reference_type: "profit_distribution",
            reference_id: distribution_id,
            entry_date: distributionDate,
            description: `توزيع أرباح بمبلغ ${distributionAmount.toFixed(2)}`,
            branch_id: branchId || null,
            cost_center_id: costCenterId || null,
          },
        ])
        .select("id")
        .single()
      if (jErr) throw jErr

      const debitLine = {
        journal_entry_id: entry.id,
        account_id: settings.debit_account_id!,
        debit_amount: Number(distributionAmount.toFixed(2)),
        credit_amount: 0,
        description: "توزيع الأرباح",
        branch_id: branchId || null,
        cost_center_id: costCenterId || null,
      }

      const creditLines = shareholders.map((s) => ({
        journal_entry_id: entry.id,
        account_id: settings.credit_account_id!,
        debit_amount: 0,
        credit_amount: Number(((distributionAmount * Number(s.percentage || 0)) / 100).toFixed(2)),
        description: `حصة ${s.name}`,
        branch_id: branchId || null,
        cost_center_id: costCenterId || null,
      }))

      const { error: jlErr } = await supabase.from("journal_entry_lines").insert([debitLine, ...creditLines])
      if (jlErr) throw jlErr

      setDistributionAmount(0)
      toastActionSuccess(toast, "التسجيل", "توزيع الأرباح")
    } catch (error) {
      console.error("Error distributing profit:", error)
      toastActionError(toast, "التسجيل", "توزيع الأرباح")
    } finally {
      setDistributionSaving(false)
    }
  }

  // Create equity accounts for shareholders to appear in journal entries
  const ensureShareholderCapitalAccounts = async () => {
    try {
      if (!companyId) {
        toast({ title: "شركة غير محددة", description: "يرجى تحديد الشركة أولاً" })
        return
      }

      const { data: sh } = await supabase
        .from("shareholders")
        .select("id, name")
        .eq("company_id", companyId)

      const { data: eqAcc } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type")
        .eq("company_id", companyId)
        .eq("account_type", "equity")

      const existingNames = new Set((eqAcc || []).map((a: any) => a.account_name))
      const toCreate = (sh || [])
        .filter((s: any) => !existingNames.has(`رأس مال - ${s.name}`))
        .map((s: any) => ({
          company_id: companyId,
          account_code: "", // سيُحدّث لاحقًا
          account_name: `رأس مال - ${s.name}`,
          account_type: "equity",
          description: "حساب رأس مال خاص بالمساهم",
          opening_balance: 0,
        }))

      if (toCreate.length === 0) {
        toast({ title: "لا شيء مطلوب", description: "جميع حسابات رأس المال للمساهمين موجودة بالفعل" })
        return
      }

      const numericCodes = (eqAcc || [])
        .map((a: any) => parseInt(String(a.account_code), 10))
        .filter((n: number) => Number.isFinite(n))
      let nextCode = numericCodes.length > 0 ? Math.max(...numericCodes) + 1 : 3000
      toCreate.forEach((acc: any) => {
        acc.account_code = String(nextCode++)
      })

      const { error } = await supabase.from("chart_of_accounts").insert(toCreate)
      if (error) throw error

      await loadAccounts(companyId)
      toastActionSuccess(toast, "الإنشاء", "حسابات رأس المال للمساهمين")
    } catch (err) {
      console.error("Error creating shareholder capital accounts:", err)
      toastActionError(toast, "الإنشاء", "حسابات رأس المال للمساهمين")
    }
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
                <div className="p-2 sm:p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <Users className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Shareholders' : 'المساهمون'}</h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Ownership & profit distribution' : 'الملكية وتوزيع الأرباح'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {permWrite && (
                  <Button variant="outline" onClick={ensureShareholderCapitalAccounts}>
                    {(hydrated && appLang==='en') ? 'Create shareholder capital accounts' : 'إنشاء حسابات رأس المال للمساهمين'}
                  </Button>
                )}
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              {permWrite && (
                <DialogTrigger asChild>
                  <Button
                    onClick={() => {
                      resetForm()
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {(hydrated && appLang==='en') ? 'New Shareholder' : 'مساهم جديد'}
                  </Button>
                </DialogTrigger>
              )}
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle suppressHydrationWarning>{editingId ? ((hydrated && appLang==='en') ? 'Edit Shareholder' : 'تعديل مساهم') : ((hydrated && appLang==='en') ? 'Add Shareholder' : 'إضافة مساهم')}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Shareholder name' : 'اسم المساهم'}</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Email' : 'البريد الإلكتروني'}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email || ""}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Phone' : 'الهاتف'}</Label>
                    <Input
                      id="phone"
                      value={formData.phone || ""}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="national_id" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'National ID / Registry' : 'الرقم القومي / سجل'}</Label>
                    <Input
                      id="national_id"
                      value={formData.national_id || ""}
                      onChange={(e) => setFormData({ ...formData, national_id: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="percentage" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Ownership percentage (%)' : 'نسبة الملكية (%)'}</Label>
                    <Input
                      id="percentage"
                      type="number"
                      step="0.01"
                      value={formData.percentage}
                      onChange={(e) => setFormData({ ...formData, percentage: Number(e.target.value) })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Notes' : 'ملاحظات'}</Label>
                    <Input
                      id="notes"
                      value={formData.notes || ""}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>
                      {(hydrated && appLang==='en') ? 'Cancel' : 'إلغاء'}
                    </Button>
                    <Button type="submit" disabled={isSavingShareholder} className="disabled:opacity-50">
                      {isSavingShareholder ? ((hydrated && appLang==='en') ? 'Saving...' : 'جاري الحفظ...') : ((hydrated && appLang==='en') ? 'Save' : 'حفظ')}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
              </div>
            </div>
          </div>

          <CompanyHeader />

          <Card>
            <CardHeader>
              <CardTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Shareholders List' : 'قائمة المساهمين'}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Loading...' : 'جاري التحميل...'}</div>
              ) : shareholders.length === 0 ? (
                <div className="text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'No shareholders yet' : 'لا توجد بيانات مساهمين بعد'}</div>
              ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Name' : 'الاسم'}</TableHead>
                      <TableHead suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Email' : 'البريد'}</TableHead>
                      <TableHead suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Phone' : 'الهاتف'}</TableHead>
                      <TableHead suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Percentage (%)' : 'النسبة (%)'}</TableHead>
                      <TableHead suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Actions' : 'إجراءات'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shareholders.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>{s.email || (hydrated && appLang==='en' ? '-' : "-")}</TableCell>
                        <TableCell>{s.phone || (hydrated && appLang==='en' ? '-' : "-")}</TableCell>
                        <TableCell>{Number(s.percentage || 0).toFixed(2)}%</TableCell>
                        <TableCell className="space-x-2 rtl:space-x-reverse">
                          {permUpdate && (
                            <Button variant="outline" size="sm" onClick={() => handleEdit(s)}>
                              <Edit2 className="w-4 h-4 mr-1" /> {(hydrated && appLang==='en') ? 'Edit' : 'تعديل'}
                            </Button>
                          )}
                          {permWrite && (
                            <Button variant="outline" size="sm" onClick={() => openContributionDialog(s)}>
                              <DollarSign className="w-4 h-4 mr-1" /> {(hydrated && appLang==='en') ? 'Capital contribution' : 'مساهمة رأس مال'}
                            </Button>
                          )}
                          {permDelete && (
                            <Button variant="destructive" size="sm" onClick={() => handleDelete(s.id)}>
                              <Trash2 className="w-4 h-4 mr-1" /> {(hydrated && appLang==='en') ? 'Delete' : 'حذف'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              )}
              <div className="mt-4 text-sm text-gray-700 dark:text-gray-300">
                <span suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Current total of percentages:' : 'المجموع الحالي للنِسَب:'}</span> <span className={Math.round(totalPercentage) === 100 ? "text-green-600" : "text-red-600"}>{totalPercentage.toFixed(2)}%</span>
              </div>
            </CardContent>
          </Card>

          {/* Contribution dialog */}
          <Dialog open={isContributionOpen} onOpenChange={setIsContributionOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Record capital contribution' : 'تسجيل مساهمة رأس مال'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={saveContribution} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="contribution_date" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Contribution date' : 'تاريخ المساهمة'}</Label>
                  <Input
                    id="contribution_date"
                    type="date"
                    value={contributionForm.contribution_date}
                    onChange={(e) => setContributionForm({ ...contributionForm, contribution_date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Amount' : 'المبلغ'}</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={contributionForm.amount}
                    onChange={(e) => setContributionForm({ ...contributionForm, amount: Number(e.target.value) })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment_account_id" suppressHydrationWarning>
                    {(hydrated && appLang==='en') ? 'Payment Account (Bank or Cash)' : 'حساب الدفع (بنك أو خزنة)'} *
                  </Label>
                  {cashBankAccounts.length === 0 ? (
                    <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200" suppressHydrationWarning>
                        {(hydrated && appLang==='en') 
                          ? 'No bank or cash accounts found. Please create bank or cash accounts in Chart of Accounts first.' 
                          : 'لا توجد حسابات بنكية أو خزائن. يرجى إنشاء حسابات بنكية أو خزائن في الشجرة المحاسبية أولاً.'}
                      </p>
                    </div>
                  ) : (
                    <Select
                      value={contributionForm.payment_account_id || ""}
                      onValueChange={(value) => setContributionForm({ ...contributionForm, payment_account_id: value })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={(hydrated && appLang==='en') ? 'Select account' : 'اختر حساب الدفع'} />
                      </SelectTrigger>
                      <SelectContent>
                        {cashBankAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.account_code} - {account.account_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-gray-500 mt-1" suppressHydrationWarning>
                    {(hydrated && appLang==='en') 
                      ? 'Select the bank account or cash account where the contribution will be received' 
                      : 'اختر الحساب المصرفي أو الخزنة التي سيتم استلام المساهمة فيها'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Notes' : 'ملاحظات'}</Label>
                  <Input
                    id="notes"
                    value={contributionForm.notes || ""}
                    onChange={(e) => setContributionForm({ ...contributionForm, notes: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setIsContributionOpen(false)}>
                    {(hydrated && appLang==='en') ? 'Cancel' : 'إلغاء'}
                  </Button>
                  <Button type="submit" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Save' : 'حفظ'}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* Profit distribution */}
          <Card>
            <CardHeader>
              <CardTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Profit distribution by percentages' : 'توزيع الأرباح حسب النِسَب'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Default accounts selection */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Default debit account' : 'الحساب المدين الافتراضي'}</Label>
                  <select
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    value={settings.debit_account_id || ""}
                    onChange={(e) => setSettings({ ...settings, debit_account_id: e.target.value })}
                  >
                    <option value="" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Select account' : 'اختر حسابًا'}</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.account_code} - {acc.account_name} ({acc.account_type})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Prefer an Equity account like Retained Earnings' : 'يفضّل اختيار حساب من نوع Equity مثل الأرباح المحتجزة'}</p>
                </div>
                <div>
                  <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Default credit account' : 'الحساب الدائن الافتراضي'}</Label>
                  <select
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    value={settings.credit_account_id || ""}
                    onChange={(e) => setSettings({ ...settings, credit_account_id: e.target.value })}
                  >
                    <option value="" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Select account' : 'اختر حسابًا'}</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.account_code} - {acc.account_name} ({acc.account_type})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Prefer a Liability account like Dividends Payable' : 'يفضّل اختيار حساب من نوع Liability مثل أرباح موزعة مستحقة'}</p>
                </div>
                <div className="flex items-end">
                  <Button type="button" onClick={saveDefaultAccounts} disabled={isSavingDefaults} className="w-full md:w-auto">
                    {isSavingDefaults ? ((hydrated && appLang==='en') ? 'Saving...' : 'جاري الحفظ...') : ((hydrated && appLang==='en') ? 'Save default accounts' : 'حفظ الحسابات الافتراضية')}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="distribution_date" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Distribution date' : 'تاريخ التوزيع'}</Label>
                  <Input
                    id="distribution_date"
                    type="date"
                    value={distributionDate}
                    onChange={(e) => setDistributionDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="distribution_amount" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total profit to distribute' : 'إجمالي الأرباح للتوزيع'}</Label>
                  <Input
                    id="distribution_amount"
                    type="number"
                    step="0.01"
                    value={distributionAmount}
                    onChange={(e) => setDistributionAmount(Number(e.target.value))}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={distributeProfit} disabled={distributionSaving || distributionAmount <= 0 || Math.round(totalPercentage) !== 100}>
                    {distributionSaving ? ((hydrated && appLang==='en') ? 'Saving...' : 'جاري الحفظ...') : ((hydrated && appLang==='en') ? 'Record distribution' : 'تسجيل توزيع')}
                  </Button>
                </div>
              </div>

              {/* Branch and Cost Center Selection */}
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <Label className="text-sm font-medium mb-2 block" suppressHydrationWarning>
                  {(hydrated && appLang==='en') ? 'Branch & Cost Center' : 'الفرع ومركز التكلفة'}
                </Label>
                <BranchCostCenterSelector
                  branchId={branchId}
                  costCenterId={costCenterId}
                  onBranchChange={setBranchId}
                  onCostCenterChange={setCostCenterId}
                  lang={appLang}
                  showLabels={true}
                  showWarehouse={false}
                />
              </div>

              {distributionAmount > 0 && shareholders.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Shareholder' : 'المساهم'}</TableHead>
                        <TableHead suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Percentage (%)' : 'النسبة (%)'}</TableHead>
                        <TableHead suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Amount due' : 'المبلغ المستحق'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shareholders.map((s) => {
                        const amount = Number(((distributionAmount * Number(s.percentage || 0)) / 100).toFixed(2))
                        return (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell>{Number(s.percentage || 0).toFixed(2)}%</TableCell>
                            <TableCell>{amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { canAction } from "@/lib/authz"
import { getActiveCompanyId } from "@/lib/company"
import { Building2, Plus, Trash2, Edit2, Save, X, CheckCircle, XCircle, MapPin, Phone, Mail, User, DollarSign } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { BranchDefaultsManager } from "@/components/branch-defaults-manager"

// قائمة العملات المتاحة
const CURRENCIES = [
  { code: 'EGP', name: 'Egyptian Pound', nameAr: 'جنيه مصري', flag: '🇪🇬' },
  { code: 'USD', name: 'US Dollar', nameAr: 'دولار أمريكي', flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro', nameAr: 'يورو', flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound', nameAr: 'جنيه إسترليني', flag: '🇬🇧' },
  { code: 'SAR', name: 'Saudi Riyal', nameAr: 'ريال سعودي', flag: '🇸🇦' },
  { code: 'AED', name: 'UAE Dirham', nameAr: 'درهم إماراتي', flag: '🇦🇪' },
  { code: 'KWD', name: 'Kuwaiti Dinar', nameAr: 'دينار كويتي', flag: '🇰🇼' },
  { code: 'QAR', name: 'Qatari Riyal', nameAr: 'ريال قطري', flag: '🇶🇦' },
  { code: 'BHD', name: 'Bahraini Dinar', nameAr: 'دينار بحريني', flag: '🇧🇭' },
  { code: 'OMR', name: 'Omani Rial', nameAr: 'ريال عماني', flag: '🇴🇲' },
  { code: 'JOD', name: 'Jordanian Dinar', nameAr: 'دينار أردني', flag: '🇯🇴' },
  { code: 'LBP', name: 'Lebanese Pound', nameAr: 'ليرة لبنانية', flag: '🇱🇧' },
]

interface Branch {
  id: string
  company_id: string
  name: string
  code: string
  address: string | null
  city: string | null
  phone: string | null
  email: string | null
  manager_name: string | null
  is_active: boolean
  is_main: boolean
  currency: string | null
  created_at: string
}

export default function BranchesPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [branches, setBranches] = useState<Branch[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [canRead, setCanRead] = useState(false)
  const [canWrite, setCanWrite] = useState(false)
  const [permChecked, setPermChecked] = useState(false)
  const [appLang, setAppLang] = useState<'ar'|'en'>('ar')
  const [baseCurrency, setBaseCurrency] = useState('EGP')

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [branchToDelete, setBranchToDelete] = useState<Branch | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    address: "",
    city: "",
    phone: "",
    email: "",
    manager_name: "",
    is_active: true,
    currency: ""
  })

  const t = (en: string, ar: string) => appLang === 'en' ? en : ar

  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch {}
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  useEffect(() => {
    const checkPerms = async () => {
      const [read, write] = await Promise.all([
        canAction(supabase, "branches", "read"),
        canAction(supabase, "branches", "write")
      ])
      setCanRead(read)
      setCanWrite(write)
      setPermChecked(true)
    }
    checkPerms()
  }, [supabase])

  useEffect(() => {
    const loadData = async () => {
      if (!permChecked) return
      setIsLoading(true)
      try {
        const cid = await getActiveCompanyId(supabase)
        setCompanyId(cid)
        if (!cid) {
          setIsLoading(false)
          return
        }
        // ✅ جلب عملة الشركة الافتراضية من API
        try {
          const response = await fetch(`/api/company-info?companyId=${cid}`, { cache: 'no-store' })
          const data = await response.json()
          if (data.success && data.company?.base_currency) {
            setBaseCurrency(data.company.base_currency)
          }
        } catch (error) {
          console.error('[Branches] Error fetching company currency:', error)
        }
        const { data, error } = await supabase
          .from("branches")
          .select("*")
          .eq("company_id", cid)
          .order("is_main", { ascending: false })
          .order("name")
        if (error) throw error
        setBranches(data || [])
      } catch (err: any) {
        toastActionError(toast, t("Failed to load branches", "فشل تحميل الفروع"), err.message)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [supabase, permChecked, toast])

  const resetForm = () => {
    setFormData({
      name: "",
      code: "",
      address: "",
      city: "",
      phone: "",
      email: "",
      manager_name: "",
      is_active: true,
      currency: baseCurrency
    })
    setEditingBranch(null)
  }

  const openNewDialog = () => {
    resetForm()
    setIsDialogOpen(true)
  }

  const openEditDialog = (branch: Branch) => {
    setEditingBranch(branch)
    setFormData({
      name: branch.name,
      code: branch.code,
      address: branch.address || "",
      city: branch.city || "",
      phone: branch.phone || "",
      email: branch.email || "",
      manager_name: branch.manager_name || "",
      is_active: branch.is_active,
      currency: branch.currency || baseCurrency
    })
    setIsDialogOpen(true)
  }

  const handleSave = async () => {
    if (!companyId) return
    if (!formData.name.trim() || !formData.code.trim()) {
      toastActionError(toast, t("Validation Error", "خطأ في البيانات"), t("Name and code are required", "الاسم والكود مطلوبان"))
      return
    }
    setIsSaving(true)
    try {
      if (editingBranch) {
        const { error } = await supabase
          .from("branches")
          .update({
            name: formData.name.trim(),
            branch_name: formData.name.trim(),
            code: formData.code.trim().toUpperCase(),
            branch_code: formData.code.trim().toUpperCase(),
            address: formData.address.trim() || null,
            city: formData.city.trim() || null,
            phone: formData.phone.trim() || null,
            email: formData.email.trim() || null,
            manager_name: formData.manager_name.trim() || null,
            is_active: formData.is_active,
            currency: formData.currency || baseCurrency,
            updated_at: new Date().toISOString()
          })
          .eq("id", editingBranch.id)
        if (error) throw error
        toastActionSuccess(toast, t("Branch updated", "تم تحديث الفرع"))
      } else {
        const { error } = await supabase
          .from("branches")
          .insert({
            company_id: companyId,
            name: formData.name.trim(),
            branch_name: formData.name.trim(),
            code: formData.code.trim().toUpperCase(),
            branch_code: formData.code.trim().toUpperCase(),
            address: formData.address.trim() || null,
            city: formData.city.trim() || null,
            phone: formData.phone.trim() || null,
            email: formData.email.trim() || null,
            manager_name: formData.manager_name.trim() || null,
            is_active: formData.is_active,
            currency: formData.currency || baseCurrency,
            is_main: false,
            is_head_office: false
          })
        if (error) throw error
        toastActionSuccess(toast, t("Branch created", "تم إنشاء الفرع"))
      }
      setIsDialogOpen(false)
      resetForm()
      const { data } = await supabase
        .from("branches")
        .select("*")
        .eq("company_id", companyId)
        .order("is_main", { ascending: false })
        .order("name")
      setBranches(data || [])
    } catch (err: any) {
      toastActionError(toast, t("Failed to save", "فشل الحفظ"), err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!branchToDelete || !companyId) return
    if (branchToDelete.is_main) {
      toastActionError(toast, t("Cannot delete", "لا يمكن الحذف"), t("Cannot delete main branch", "لا يمكن حذف الفرع الرئيسي"))
      setDeleteDialogOpen(false)
      return
    }
    try {
      const { error } = await supabase
        .from("branches")
        .delete()
        .eq("id", branchToDelete.id)
      if (error) throw error
      toastActionSuccess(toast, t("Branch deleted", "تم حذف الفرع"))
      setBranches(branches.filter(b => b.id !== branchToDelete.id))
    } catch (err: any) {
      toastActionError(toast, t("Failed to delete", "فشل الحذف"), err.message)
    } finally {
      setDeleteDialogOpen(false)
      setBranchToDelete(null)
    }
  }

  if (!permChecked || isLoading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
          </div>
        </main>
      </div>
    )
  }

  if (!canRead) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <Card>
            <CardContent className="p-8 text-center">
              <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="text-lg text-gray-600 dark:text-gray-400">
                {t("You don't have permission to view branches", "ليس لديك صلاحية لعرض الفروع")}
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* Header */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                    {t("Branches", "الفروع")}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                    {t("Manage company branches", "إدارة فروع الشركة")}
                  </p>
                </div>
              </div>
              {canWrite && (
                <Button onClick={openNewDialog} className="bg-orange-600 hover:bg-orange-700 h-10 sm:h-11 text-sm sm:text-base px-3 sm:px-4">
                  <Plus className="w-4 h-4 ml-1 sm:ml-2" />
                  {t("New Branch", "فرع جديد")}
                </Button>
              )}
            </div>
          </div>

          {/* Branches List */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {branches.map((branch) => (
              <Card key={branch.id} className={`relative ${!branch.is_active ? 'opacity-60' : ''}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{branch.name}</CardTitle>
                      {branch.is_main && (
                        <Badge variant="default" className="bg-orange-600">
                          {t("Main", "رئيسي")}
                        </Badge>
                      )}
                    </div>
                    <Badge variant={branch.is_active ? "default" : "secondary"}>
                      {branch.is_active ? t("Active", "نشط") : t("Inactive", "غير نشط")}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-500 font-mono">{branch.code}</p>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {branch.address && (
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <MapPin className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{branch.address}{branch.city ? `, ${branch.city}` : ''}</span>
                    </div>
                  )}
                  {branch.phone && (
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Phone className="w-4 h-4 flex-shrink-0" />
                      <span>{branch.phone}</span>
                    </div>
                  )}
                  {branch.email && (
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Mail className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{branch.email}</span>
                    </div>
                  )}
                  {branch.manager_name && (
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <User className="w-4 h-4 flex-shrink-0" />
                      <span>{branch.manager_name}</span>
                    </div>
                  )}
                  {/* العملة */}
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <DollarSign className="w-4 h-4 flex-shrink-0" />
                    <span className="flex items-center gap-1">
                      <span>{CURRENCIES.find(c => c.code === (branch.currency || baseCurrency))?.flag || '💱'}</span>
                      <span className="font-medium">{branch.currency || baseCurrency}</span>
                      {branch.currency && branch.currency !== baseCurrency && (
                        <span className="text-xs text-amber-600 dark:text-amber-400">({t("Different from company", "مختلف عن الشركة")})</span>
                      )}
                    </span>
                  </div>
                  {canWrite && (
                    <div className="flex gap-2 pt-2 border-t">
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(branch)}>
                        <Edit2 className="w-4 h-4 ml-1" />
                        {t("Edit", "تعديل")}
                      </Button>
                      {!branch.is_main && (
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => { setBranchToDelete(branch); setDeleteDialogOpen(true) }}>
                          <Trash2 className="w-4 h-4 ml-1" />
                          {t("Delete", "حذف")}
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {branches.length === 0 && (
              <div className="col-span-full text-center py-12 text-gray-500">
                {t("No branches found", "لا توجد فروع")}
              </div>
            )}
          </div>
        </div>

        {/* Add/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingBranch ? t("Edit Branch", "تعديل الفرع") : t("New Branch", "فرع جديد")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("Name", "الاسم")} *</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder={t("Branch name", "اسم الفرع")} />
                </div>
                <div className="space-y-2">
                  <Label>{t("Code", "الكود")} *</Label>
                  <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })} placeholder="BR01" className="font-mono" disabled={editingBranch?.is_main} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("Address", "العنوان")}</Label>
                <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder={t("Street address", "عنوان الشارع")} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("City", "المدينة")}</Label>
                  <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t("Phone", "الهاتف")}</Label>
                  <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("Email", "البريد الإلكتروني")}</Label>
                <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t("Manager Name", "اسم المدير")}</Label>
                <Input value={formData.manager_name} onChange={(e) => setFormData({ ...formData, manager_name: e.target.value })} />
              </div>
              {/* اختيار العملة */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  {t("Currency", "العملة")}
                </Label>
                <Select value={formData.currency || baseCurrency} onValueChange={(v) => setFormData({ ...formData, currency: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("Select currency", "اختر العملة")}>
                      {formData.currency && (
                        <span className="flex items-center gap-2">
                          <span>{CURRENCIES.find(c => c.code === formData.currency)?.flag || '💱'}</span>
                          <span className="font-medium">{formData.currency}</span>
                          <span className="text-gray-500">-</span>
                          <span className="text-gray-600">{appLang === 'en' ? CURRENCIES.find(c => c.code === formData.currency)?.name : CURRENCIES.find(c => c.code === formData.currency)?.nameAr}</span>
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        <span className="flex items-center gap-2">
                          <span>{c.flag}</span>
                          <span className="font-medium">{c.code}</span>
                          <span className="text-gray-500">-</span>
                          <span className="text-gray-600">{appLang === 'en' ? c.name : c.nameAr}</span>
                          {c.code === baseCurrency && (
                            <Badge variant="outline" className="text-xs ml-2">{t("Company Default", "افتراضي الشركة")}</Badge>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.currency && formData.currency !== baseCurrency && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    ⚠️ {t("This branch uses a different currency than the company default", "هذا الفرع يستخدم عملة مختلفة عن افتراضي الشركة")} ({baseCurrency})
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between">
                <Label>{t("Active", "نشط")}</Label>
                <Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} disabled={editingBranch?.is_main} />
              </div>

              {/* Branch Defaults Manager (Only for existing branches) */}
              {editingBranch && (
                <div className="pt-4 border-t">
                  <BranchDefaultsManager 
                    branchId={editingBranch.id} 
                    branchName={editingBranch.name}
                    lang={appLang}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>{t("Cancel", "إلغاء")}</Button>
              <Button onClick={handleSave} disabled={isSaving} className="bg-orange-600 hover:bg-orange-700">
                {isSaving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : <Save className="w-4 h-4 ml-1" />}
                {t("Save", "حفظ")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("Delete Branch", "حذف الفرع")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("Are you sure you want to delete this branch? This action cannot be undone.", "هل أنت متأكد من حذف هذا الفرع؟ لا يمكن التراجع عن هذا الإجراء.")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("Cancel", "إلغاء")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                {t("Delete", "حذف")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  )
}

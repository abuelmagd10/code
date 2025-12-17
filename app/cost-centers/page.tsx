"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { canAction } from "@/lib/authz"
import { getActiveCompanyId } from "@/lib/company"
import { Target, Plus, Trash2, Edit2, Save, Building2, XCircle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

interface Branch {
  id: string
  name: string
  code: string
}

interface CostCenter {
  id: string
  company_id: string
  branch_id: string
  name: string
  code: string
  description: string | null
  is_active: boolean
  created_at: string
  branches?: Branch
}

export default function CostCentersPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [canRead, setCanRead] = useState(false)
  const [canWrite, setCanWrite] = useState(false)
  const [permChecked, setPermChecked] = useState(false)
  const [appLang, setAppLang] = useState<'ar'|'en'>('ar')
  
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCC, setEditingCC] = useState<CostCenter | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [ccToDelete, setCcToDelete] = useState<CostCenter | null>(null)

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    branch_id: "",
    description: "",
    is_active: true
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
        canAction(supabase, "cost_centers", "read"),
        canAction(supabase, "cost_centers", "write")
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
        const [ccRes, brRes] = await Promise.all([
          supabase.from("cost_centers").select("*, branches(id, name, code)").eq("company_id", cid).order("name"),
          supabase.from("branches").select("id, name, code").eq("company_id", cid).eq("is_active", true).order("name")
        ])
        if (ccRes.error) throw ccRes.error
        if (brRes.error) throw brRes.error
        setCostCenters(ccRes.data || [])
        setBranches(brRes.data || [])
      } catch (err: any) {
        toastActionError(toast, t("Failed to load", "فشل التحميل"), err.message)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [supabase, permChecked, toast])

  const resetForm = () => {
    setFormData({ name: "", code: "", branch_id: branches[0]?.id || "", description: "", is_active: true })
    setEditingCC(null)
  }

  const openNewDialog = () => {
    resetForm()
    setFormData(prev => ({ ...prev, branch_id: branches[0]?.id || "" }))
    setIsDialogOpen(true)
  }

  const openEditDialog = (cc: CostCenter) => {
    setEditingCC(cc)
    setFormData({
      name: cc.name,
      code: cc.code,
      branch_id: cc.branch_id,
      description: cc.description || "",
      is_active: cc.is_active
    })
    setIsDialogOpen(true)
  }

  const handleSave = async () => {
    if (!companyId) return
    if (!formData.name.trim() || !formData.code.trim() || !formData.branch_id) {
      toastActionError(toast, t("Validation Error", "خطأ في البيانات"), t("Name, code and branch are required", "الاسم والكود والفرع مطلوبين"))
      return
    }
    setIsSaving(true)
    try {
      if (editingCC) {
        const { error } = await supabase
          .from("cost_centers")
          .update({
            name: formData.name.trim(),
            code: formData.code.trim().toUpperCase(),
            branch_id: formData.branch_id,
            description: formData.description.trim() || null,
            is_active: formData.is_active,
            updated_at: new Date().toISOString()
          })
          .eq("id", editingCC.id)
        if (error) throw error
        toastActionSuccess(toast, t("Cost center updated", "تم تحديث مركز التكلفة"))
      } else {
        const { error } = await supabase
          .from("cost_centers")
          .insert({
            company_id: companyId,
            branch_id: formData.branch_id,
            name: formData.name.trim(),
            code: formData.code.trim().toUpperCase(),
            description: formData.description.trim() || null,
            is_active: formData.is_active
          })
        if (error) throw error
        toastActionSuccess(toast, t("Cost center created", "تم إنشاء مركز التكلفة"))
      }
      setIsDialogOpen(false)
      resetForm()
      const { data } = await supabase.from("cost_centers").select("*, branches(id, name, code)").eq("company_id", companyId).order("name")
      setCostCenters(data || [])
    } catch (err: any) {
      toastActionError(toast, t("Failed to save", "فشل الحفظ"), err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!ccToDelete || !companyId) return
    try {
      const { error } = await supabase.from("cost_centers").delete().eq("id", ccToDelete.id)
      if (error) throw error
      toastActionSuccess(toast, t("Cost center deleted", "تم حذف مركز التكلفة"))
      setCostCenters(costCenters.filter(c => c.id !== ccToDelete.id))
    } catch (err: any) {
      toastActionError(toast, t("Failed to delete", "فشل الحذف"), err.message)
    } finally {
      setDeleteDialogOpen(false)
      setCcToDelete(null)
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
                {t("You don't have permission to view cost centers", "ليس لديك صلاحية لعرض مراكز التكلفة")}
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
                <div className="p-2 sm:p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <Target className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                    {t("Cost Centers", "مراكز التكلفة")}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                    {t("Manage cost centers", "إدارة مراكز التكلفة")}
                  </p>
                </div>
              </div>
              {canWrite && branches.length > 0 && (
                <Button onClick={openNewDialog} className="bg-purple-600 hover:bg-purple-700 h-10 sm:h-11 text-sm sm:text-base px-3 sm:px-4">
                  <Plus className="w-4 h-4 ml-1 sm:ml-2" />
                  {t("New Cost Center", "مركز تكلفة جديد")}
                </Button>
              )}
            </div>
          </div>

          {branches.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-lg text-gray-600 dark:text-gray-400">
                  {t("Please create a branch first", "يرجى إنشاء فرع أولاً")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {costCenters.map((cc) => (
                <Card key={cc.id} className={`relative ${!cc.is_active ? 'opacity-60' : ''}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{cc.name}</CardTitle>
                      <Badge variant={cc.is_active ? "default" : "secondary"}>
                        {cc.is_active ? t("Active", "نشط") : t("Inactive", "غير نشط")}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 font-mono">{cc.code}</p>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Building2 className="w-4 h-4 flex-shrink-0" />
                      <span>{cc.branches?.name || '-'}</span>
                    </div>
                    {cc.description && (
                      <p className="text-gray-500 text-xs">{cc.description}</p>
                    )}
                    {canWrite && (
                      <div className="flex gap-2 pt-2 border-t">
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(cc)}>
                          <Edit2 className="w-4 h-4 ml-1" />
                          {t("Edit", "تعديل")}
                        </Button>
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => { setCcToDelete(cc); setDeleteDialogOpen(true) }}>
                          <Trash2 className="w-4 h-4 ml-1" />
                          {t("Delete", "حذف")}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {costCenters.length === 0 && (
                <div className="col-span-full text-center py-12 text-gray-500">
                  {t("No cost centers found", "لا توجد مراكز تكلفة")}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Add/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingCC ? t("Edit Cost Center", "تعديل مركز التكلفة") : t("New Cost Center", "مركز تكلفة جديد")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("Name", "الاسم")} *</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder={t("Cost center name", "اسم مركز التكلفة")} />
                </div>
                <div className="space-y-2">
                  <Label>{t("Code", "الكود")} *</Label>
                  <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })} placeholder="CC01" className="font-mono" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("Branch", "الفرع")} *</Label>
                <Select value={formData.branch_id} onValueChange={(v) => setFormData({ ...formData, branch_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("Select branch", "اختر الفرع")} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name} ({b.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("Description", "الوصف")}</Label>
                <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={2} />
              </div>
              <div className="flex items-center justify-between">
                <Label>{t("Active", "نشط")}</Label>
                <Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>{t("Cancel", "إلغاء")}</Button>
              <Button onClick={handleSave} disabled={isSaving} className="bg-purple-600 hover:bg-purple-700">
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
              <AlertDialogTitle>{t("Delete Cost Center", "حذف مركز التكلفة")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("Are you sure you want to delete this cost center?", "هل أنت متأكد من حذف مركز التكلفة هذا؟")}
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

"use client"

import { useEffect, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { Plus, Pencil, Trash2, Warehouse, Building2, MapPin, Phone, User } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
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

interface WarehouseData {
  id: string
  company_id: string
  branch_id: string | null
  cost_center_id: string | null
  name: string
  code: string | null
  address: string | null
  city: string | null
  phone: string | null
  manager_name: string | null
  is_main: boolean
  is_active: boolean
  notes: string | null
  branches?: { name?: string; branch_name?: string }
  cost_centers?: { name: string }
}

interface Branch {
  id: string
  name?: string
  branch_name?: string
}

interface CostCenter {
  id: string
  name: string
  branch_id: string | null
}

export default function WarehousesPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [filteredCostCenters, setFilteredCostCenters] = useState<CostCenter[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseData | null>(null)
  const [saving, setSaving] = useState(false)

  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    branch_id: '',
    cost_center_id: '',
    address: '',
    city: '',
    phone: '',
    manager_name: '',
    is_active: true,
    notes: ''
  })

  useEffect(() => {
    const handler = () => {
      try {
        setAppLang(localStorage.getItem('app_language') === 'en' ? 'en' : 'ar')
      } catch {}
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    // Filter cost centers based on selected branch
    if (formData.branch_id) {
      setFilteredCostCenters(costCenters.filter(cc => cc.branch_id === formData.branch_id))
    } else {
      setFilteredCostCenters(costCenters)
    }
  }, [formData.branch_id, costCenters])

  const loadData = async () => {
    try {
      setLoading(true)
      const { getActiveCompanyId } = await import("@/lib/company")
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // Load warehouses
      const { data: warehousesData } = await supabase
        .from("warehouses")
        .select("*, branches(name, branch_name), cost_centers(name)")
        .eq("company_id", companyId)
        .order("is_main", { ascending: false })
        .order("name")
      setWarehouses(warehousesData || [])

      // Load branches
      const { data: branchesData } = await supabase
        .from("branches")
        .select("id, name, branch_name")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name")
      setBranches(branchesData || [])

      // Load cost centers
      const { data: ccData } = await supabase
        .from("cost_centers")
        .select("id, name, branch_id")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name")
      setCostCenters(ccData || [])
    } catch (err) {
      console.error("Error loading data:", err)
    } finally {
      setLoading(false)
    }
  }

  const openCreateDialog = () => {
    setSelectedWarehouse(null)
    setFormData({
      name: '', code: '', branch_id: '', cost_center_id: '',
      address: '', city: '', phone: '', manager_name: '',
      is_active: true, notes: ''
    })
    setDialogOpen(true)
  }

  const openEditDialog = (warehouse: WarehouseData) => {
    setSelectedWarehouse(warehouse)
    setFormData({
      name: warehouse.name || '',
      code: warehouse.code || '',
      branch_id: warehouse.branch_id || '',
      cost_center_id: warehouse.cost_center_id || '',
      address: warehouse.address || '',
      city: warehouse.city || '',
      phone: warehouse.phone || '',
      manager_name: warehouse.manager_name || '',
      is_active: warehouse.is_active,
      notes: warehouse.notes || ''
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ variant: "destructive", title: appLang === 'en' ? 'Error' : 'خطأ', description: appLang === 'en' ? 'Name is required' : 'الاسم مطلوب' })
      return
    }
    try {
      setSaving(true)
      const { getActiveCompanyId } = await import("@/lib/company")
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) throw new Error("No company")

      const payload = {
        company_id: companyId,
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase() || null,
        branch_id: formData.branch_id || null,
        cost_center_id: formData.cost_center_id || null,
        address: formData.address.trim() || null,
        city: formData.city.trim() || null,
        phone: formData.phone.trim() || null,
        manager_name: formData.manager_name.trim() || null,
        is_active: formData.is_active,
        notes: formData.notes.trim() || null,
        updated_at: new Date().toISOString()
      }

      if (selectedWarehouse) {
        const { error } = await supabase.from("warehouses").update(payload).eq("id", selectedWarehouse.id)
        if (error) throw error
        toast({ title: appLang === 'en' ? 'Success' : 'تم بنجاح', description: appLang === 'en' ? 'Warehouse updated' : 'تم تحديث المخزن' })
      } else {
        const { error } = await supabase.from("warehouses").insert({ ...payload, is_main: false })
        if (error) throw error
        toast({ title: appLang === 'en' ? 'Success' : 'تم بنجاح', description: appLang === 'en' ? 'Warehouse created' : 'تم إنشاء المخزن' })
      }
      setDialogOpen(false)
      loadData()
    } catch (err: any) {
      toast({ variant: "destructive", title: appLang === 'en' ? 'Error' : 'خطأ', description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedWarehouse) return
    try {
      setSaving(true)
      const { error } = await supabase.from("warehouses").delete().eq("id", selectedWarehouse.id)
      if (error) throw error
      toast({ title: appLang === 'en' ? 'Success' : 'تم بنجاح', description: appLang === 'en' ? 'Warehouse deleted' : 'تم حذف المخزن' })
      setDeleteDialogOpen(false)
      setSelectedWarehouse(null)
      loadData()
    } catch (err: any) {
      toast({ variant: "destructive", title: appLang === 'en' ? 'Error' : 'خطأ', description: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Warehouse className="h-6 w-6" />
              {appLang === 'en' ? 'Warehouses' : 'المخازن'}
            </CardTitle>
            <Button onClick={openCreateDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              {appLang === 'en' ? 'Add Warehouse' : 'إضافة مخزن'}
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</div>
            ) : warehouses.length === 0 ? (
              <div className="text-center py-8 text-gray-500">{appLang === 'en' ? 'No warehouses found' : 'لا توجد مخازن'}</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {warehouses.map((wh) => (
                  <Card key={wh.id} className={`relative ${!wh.is_active ? 'opacity-60' : ''}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Warehouse className="h-5 w-5 text-blue-600" />
                          <span className="font-semibold">{wh.name}</span>
                          {wh.is_main && (
                            <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                              {appLang === 'en' ? 'Main' : 'رئيسي'}
                            </span>
                          )}
                        </div>
                        {!wh.is_main && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(wh)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-red-600" onClick={() => { setSelectedWarehouse(wh); setDeleteDialogOpen(true) }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                      {wh.code && <div className="text-sm text-gray-500 mb-2">{appLang === 'en' ? 'Code' : 'الكود'}: {wh.code}</div>}
                      <div className="space-y-1 text-sm">
                        {wh.branches && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <Building2 className="h-4 w-4" />
                            <span>{wh.branches.name || wh.branches.branch_name}</span>
                          </div>
                        )}
                        {wh.cost_centers && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <span className="text-xs">{appLang === 'en' ? 'CC' : 'م.ت'}:</span>
                            <span>{wh.cost_centers.name}</span>
                          </div>
                        )}
                        {wh.address && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <MapPin className="h-4 w-4" />
                            <span>{wh.address}{wh.city ? `, ${wh.city}` : ''}</span>
                          </div>
                        )}
                        {wh.phone && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <Phone className="h-4 w-4" />
                            <span dir="ltr">{wh.phone}</span>
                          </div>
                        )}
                        {wh.manager_name && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <User className="h-4 w-4" />
                            <span>{wh.manager_name}</span>
                          </div>
                        )}
                      </div>
                      {!wh.is_active && (
                        <div className="mt-2 text-xs text-red-600">{appLang === 'en' ? 'Inactive' : 'غير نشط'}</div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {selectedWarehouse ? (appLang === 'en' ? 'Edit Warehouse' : 'تعديل المخزن') : (appLang === 'en' ? 'Add Warehouse' : 'إضافة مخزن')}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{appLang === 'en' ? 'Name' : 'الاسم'} <span className="text-red-500">*</span></Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                </div>
                <div>
                  <Label>{appLang === 'en' ? 'Code' : 'الكود'}</Label>
                  <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{appLang === 'en' ? 'Branch' : 'الفرع'}</Label>
                  <select className="w-full border rounded-lg p-2" value={formData.branch_id} onChange={(e) => setFormData({ ...formData, branch_id: e.target.value, cost_center_id: '' })}>
                    <option value="">{appLang === 'en' ? 'Select branch' : 'اختر الفرع'}</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name || b.branch_name}</option>)}
                  </select>
                </div>
                <div>
                  <Label>{appLang === 'en' ? 'Cost Center' : 'مركز التكلفة'}</Label>
                  <select className="w-full border rounded-lg p-2" value={formData.cost_center_id} onChange={(e) => setFormData({ ...formData, cost_center_id: e.target.value })}>
                    <option value="">{appLang === 'en' ? 'Select cost center' : 'اختر مركز التكلفة'}</option>
                    {filteredCostCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Address' : 'العنوان'}</Label>
                <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{appLang === 'en' ? 'City' : 'المدينة'}</Label>
                  <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
                </div>
                <div>
                  <Label>{appLang === 'en' ? 'Phone' : 'الهاتف'}</Label>
                  <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>{appLang === 'en' ? 'Manager Name' : 'اسم المدير'}</Label>
                <Input value={formData.manager_name} onChange={(e) => setFormData({ ...formData, manager_name: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_active" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />
                <Label htmlFor="is_active">{appLang === 'en' ? 'Active' : 'نشط'}</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? (appLang === 'en' ? 'Saving...' : 'جاري الحفظ...') : (appLang === 'en' ? 'Save' : 'حفظ')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{appLang === 'en' ? 'Delete Warehouse?' : 'حذف المخزن؟'}</AlertDialogTitle>
              <AlertDialogDescription>
                {appLang === 'en' ? 'This action cannot be undone.' : 'لا يمكن التراجع عن هذا الإجراء.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                {saving ? (appLang === 'en' ? 'Deleting...' : 'جاري الحذف...') : (appLang === 'en' ? 'Delete' : 'حذف')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  )
}


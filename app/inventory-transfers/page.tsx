"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TableSkeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import Link from "next/link"
import { ArrowLeftRight, Plus, Package, Warehouse, Calendar, User, CheckCircle2, Clock, XCircle, Truck, Eye } from "lucide-react"

interface Transfer {
  id: string
  transfer_number: string
  status: string
  transfer_date: string
  expected_arrival_date?: string
  received_date?: string
  notes?: string
  source_warehouses?: { id: string; name: string }
  destination_warehouses?: { id: string; name: string }
  created_by_user?: { email: string }
  received_by_user?: { email: string }
  items_count?: number
}

export default function InventoryTransfersPage() {
  const supabase = createClient()
  const { toast } = useToast()

  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userRole, setUserRole] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch { }
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: member } = await supabase
        .from("company_members")
        .select("role")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .single()

      setUserRole(member?.role || "staff")

      // جلب طلبات النقل
      const { data: transfersData, error } = await supabase
        .from("inventory_transfers")
        .select(`
          id, transfer_number, status, transfer_date, expected_arrival_date, received_date, notes, created_by, received_by,
          source_warehouses:warehouses!inventory_transfers_source_warehouse_id_fkey(id, name),
          destination_warehouses:warehouses!inventory_transfers_destination_warehouse_id_fkey(id, name)
        `)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("transfer_date", { ascending: false })

      if (error) throw error

      // جلب عدد البنود لكل طلب
      const transferIds = (transfersData || []).map((t: any) => t.id)
      if (transferIds.length > 0) {
        const { data: itemsCounts } = await supabase
          .from("inventory_transfer_items")
          .select("transfer_id")
          .in("transfer_id", transferIds)

        const countsMap: Record<string, number> = {}
          ; (itemsCounts || []).forEach((item: any) => {
            countsMap[item.transfer_id] = (countsMap[item.transfer_id] || 0) + 1
          })

        const transfersWithCounts = (transfersData || []).map((t: any) => ({
          ...t,
          items_count: countsMap[t.id] || 0
        }))
        setTransfers(transfersWithCounts)
      } else {
        setTransfers(transfersData || [])
      }
    } catch (error) {
      console.error("Error loading transfers:", error)
      toast({ title: appLang === 'en' ? 'Error loading data' : 'خطأ في تحميل البيانات', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  const canCreate = ["owner", "admin", "manager"].includes(userRole)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="gap-1 bg-yellow-50 text-yellow-700 border-yellow-300"><Clock className="w-3 h-3" />{appLang === 'en' ? 'Pending' : 'قيد الانتظار'}</Badge>
      case 'in_transit':
        return <Badge variant="outline" className="gap-1 bg-blue-50 text-blue-700 border-blue-300"><Truck className="w-3 h-3" />{appLang === 'en' ? 'In Transit' : 'قيد النقل'}</Badge>
      case 'received':
        return <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 border-green-300"><CheckCircle2 className="w-3 h-3" />{appLang === 'en' ? 'Received' : 'تم الاستلام'}</Badge>
      case 'cancelled':
        return <Badge variant="outline" className="gap-1 bg-gray-50 text-gray-700 border-gray-300"><XCircle className="w-3 h-3" />{appLang === 'en' ? 'Cancelled' : 'ملغي'}</Badge>
      case 'rejected':
        return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />{appLang === 'en' ? 'Rejected' : 'مرفوض'}</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const filteredTransfers = statusFilter === 'all'
    ? transfers
    : transfers.filter(t => t.status === statusFilter)

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="space-y-6 max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                  <ArrowLeftRight className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                    {appLang === 'en' ? 'Inventory Transfers' : 'نقل المخزون'}
                  </h1>
                  <p className="text-gray-500 dark:text-gray-400">
                    {appLang === 'en' ? 'Transfer products between warehouses' : 'نقل المنتجات بين المخازن'}
                  </p>
                </div>
              </div>
              {canCreate && (
                <Link href="/inventory-transfers/new">
                  <Button className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700">
                    <Plus className="w-4 h-4" />
                    {appLang === 'en' ? 'New Transfer' : 'طلب نقل جديد'}
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setStatusFilter('all')}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{appLang === 'en' ? 'Total' : 'الإجمالي'}</p>
                    <p className="text-2xl font-bold">{transfers.length}</p>
                  </div>
                  <Package className="w-8 h-8 text-gray-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setStatusFilter('pending')}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-yellow-600">{appLang === 'en' ? 'Pending' : 'قيد الانتظار'}</p>
                    <p className="text-2xl font-bold text-yellow-600">{transfers.filter(t => t.status === 'pending').length}</p>
                  </div>
                  <Clock className="w-8 h-8 text-yellow-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setStatusFilter('in_transit')}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600">{appLang === 'en' ? 'In Transit' : 'قيد النقل'}</p>
                    <p className="text-2xl font-bold text-blue-600">{transfers.filter(t => t.status === 'in_transit').length}</p>
                  </div>
                  <Truck className="w-8 h-8 text-blue-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setStatusFilter('received')}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-600">{appLang === 'en' ? 'Received' : 'تم الاستلام'}</p>
                    <p className="text-2xl font-bold text-green-600">{transfers.filter(t => t.status === 'received').length}</p>
                  </div>
                  <CheckCircle2 className="w-8 h-8 text-green-400" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Transfers Table */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800">
              <CardTitle className="flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-indigo-500" />
                {appLang === 'en' ? 'Transfer Requests' : 'طلبات النقل'}
                {statusFilter !== 'all' && (
                  <Badge variant="outline" className="mr-2">{filteredTransfers.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <TableSkeleton cols={6} rows={5} className="m-4" />
              ) : filteredTransfers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                  <Package className="w-12 h-12 mb-3 text-gray-300" />
                  <p>{appLang === 'en' ? 'No transfer requests yet' : 'لا توجد طلبات نقل بعد'}</p>
                  {canCreate && (
                    <Link href="/inventory-transfers/new" className="mt-4">
                      <Button variant="outline" className="gap-2">
                        <Plus className="w-4 h-4" />
                        {appLang === 'en' ? 'Create First Transfer' : 'إنشاء أول طلب نقل'}
                      </Button>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-slate-800">
                      <tr>
                        <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">{appLang === 'en' ? 'Transfer #' : 'رقم النقل'}</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">{appLang === 'en' ? 'From' : 'من'}</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">{appLang === 'en' ? 'To' : 'إلى'}</th>
                        <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">{appLang === 'en' ? 'Items' : 'الأصناف'}</th>
                        <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">{appLang === 'en' ? 'Status' : 'الحالة'}</th>
                        <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                        <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">{appLang === 'en' ? 'Actions' : 'الإجراءات'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                      {filteredTransfers.map((transfer) => (
                        <tr key={transfer.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3">
                            <span className="font-mono font-medium text-indigo-600">{transfer.transfer_number}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Warehouse className="w-4 h-4 text-gray-400" />
                              {(transfer.source_warehouses as any)?.name || '-'}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Warehouse className="w-4 h-4 text-green-500" />
                              {(transfer.destination_warehouses as any)?.name || '-'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="secondary">{transfer.items_count || 0}</Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {getStatusBadge(transfer.status)}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-500">
                            {new Date(transfer.transfer_date).toLocaleDateString('ar-EG')}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Link href={`/inventory-transfers/${transfer.id}`}>
                              <Button variant="ghost" size="sm" className="gap-1">
                                <Eye className="w-4 h-4" />
                                {appLang === 'en' ? 'View' : 'عرض'}
                              </Button>
                            </Link>
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
      </main>
    </div>
  )
}


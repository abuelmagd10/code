"use client";

import { useEffect, useMemo, useState } from "react";
import { useSupabase } from "@/lib/supabase/hooks";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast as sonnerToast } from "sonner";
import { useToast } from "@/hooks/use-toast";
import { toastActionError, toastActionSuccess, toastDeleteSuccess, toastDeleteError } from "@/lib/notifications";
import { ClipboardList, Plus, Eye, Pencil, Trash2, FileText, AlertCircle } from "lucide-react";
import { canAction } from "@/lib/authz";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getActiveCompanyId } from "@/lib/company";

type Supplier = { id: string; name: string; phone?: string | null };
type Product = { id: string; name: string; cost_price?: number; item_type?: 'product' | 'service' };

type PurchaseOrder = {
  id: string;
  company_id: string;
  supplier_id: string;
  po_number: string;
  po_date: string;
  due_date: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  total?: number;
  status: string;
  notes?: string | null;
  currency?: string;
  bill_id?: string | null;
  suppliers?: { name: string; phone?: string | null };
};

type LinkedBill = {
  id: string;
  status: string;
};

export default function PurchaseOrdersPage() {
  const supabase = useSupabase();
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [permRead, setPermRead] = useState(false);
  const [permWrite, setPermWrite] = useState(false);
  const [permUpdate, setPermUpdate] = useState(false);
  const [permDelete, setPermDelete] = useState(false);
  const [appLang, setAppLang] = useState<'ar'|'en'>(() => {
    if (typeof window === 'undefined') return 'ar'
    try {
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      return (fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar'
    } catch { return 'ar' }
  });
  const [hydrated, setHydrated] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<PurchaseOrder | null>(null);
  const [linkedBills, setLinkedBills] = useState<Record<string, LinkedBill>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
  };

  useEffect(() => {
    setHydrated(true);
    const handler = () => {
      try {
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      } catch {}
    }
    window.addEventListener('app_language_changed', handler)
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, []);

  useEffect(() => {
    const checkPerms = async () => {
      const [read, write, update, del] = await Promise.all([
        canAction(supabase, "purchase_orders", "read"),
        canAction(supabase, "purchase_orders", "write"),
        canAction(supabase, "purchase_orders", "update"),
        canAction(supabase, "purchase_orders", "delete"),
      ]);
      setPermRead(read);
      setPermWrite(write);
      setPermUpdate(update);
      setPermDelete(del);
    };
    checkPerms();
  }, [supabase]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const companyId = await getActiveCompanyId(supabase);
      if (!companyId) { setLoading(false); return; }

      const { data: supp } = await supabase.from("suppliers").select("id, name, phone").eq("company_id", companyId).order("name");
      setSuppliers(supp || []);
      const { data: prod } = await supabase.from("products").select("id, name, cost_price, item_type").eq("company_id", companyId).order("name");
      setProducts(prod || []);

      let query = supabase
        .from("purchase_orders")
        .select("id, company_id, supplier_id, po_number, po_date, due_date, subtotal, tax_amount, total_amount, total, status, notes, currency, bill_id, suppliers(name, phone)")
        .eq("company_id", companyId);

      if (filterStatus !== "all") {
        query = query.eq("status", filterStatus);
      }

      const { data: po } = await query.order("created_at", { ascending: false });
      setOrders(po || []);

      // Load linked bills status
      const billIds = (po || []).filter(o => o.bill_id).map(o => o.bill_id);
      if (billIds.length > 0) {
        const { data: bills } = await supabase
          .from("bills")
          .select("id, status")
          .in("id", billIds);
        const billMap: Record<string, LinkedBill> = {};
        (bills || []).forEach((b: any) => {
          billMap[b.id] = { id: b.id, status: b.status };
        });
        setLinkedBills(billMap);
      }

      setLoading(false);
    };
    load();
  }, [supabase, filterStatus]);

  const filteredOrders = useMemo(() => {
    if (!searchTerm) return orders;
    const term = searchTerm.toLowerCase();
    return orders.filter((o) =>
      o.po_number?.toLowerCase().includes(term) ||
      o.suppliers?.name?.toLowerCase().includes(term)
    );
  }, [orders, searchTerm]);

  const getStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string; label: { ar: string; en: string } }> = {
      draft: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300', label: { ar: 'مسودة', en: 'Draft' } },
      sent: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', label: { ar: 'مُرسل', en: 'Sent' } },
      received: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: { ar: 'مُستلم', en: 'Received' } },
      billed: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', label: { ar: 'تم التحويل', en: 'Billed' } },
      cancelled: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: { ar: 'ملغي', en: 'Cancelled' } },
    };
    const c = config[status] || config.draft;
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>{c.label[appLang]}</span>;
  };

  const handleDelete = async () => {
    if (!orderToDelete) return;
    setLoading(true);
    try {
      // Check if linked bill is still draft
      if (orderToDelete.bill_id) {
        const linkedBill = linkedBills[orderToDelete.bill_id];
        if (linkedBill && linkedBill.status !== 'draft') {
          sonnerToast.error(appLang === 'en' ? 'Cannot delete - linked bill is not draft' : 'لا يمكن الحذف - الفاتورة المرتبطة ليست مسودة');
          setDeleteConfirmOpen(false);
          setLoading(false);
          return;
        }
        // Delete linked bill if draft
        await supabase.from("bills").delete().eq("id", orderToDelete.bill_id);
      }
      // Delete order items first
      await supabase.from("purchase_order_items").delete().eq("purchase_order_id", orderToDelete.id);
      // Delete order
      const { error } = await supabase.from("purchase_orders").delete().eq("id", orderToDelete.id);
      if (error) throw error;
      toastDeleteSuccess(toast, appLang === 'en' ? 'Purchase Order' : 'أمر الشراء');
      setOrders(orders.filter(o => o.id !== orderToDelete.id));
    } catch (err) {
      console.error("Error deleting:", err);
      toastDeleteError(toast, appLang === 'en' ? 'Purchase Order' : 'أمر الشراء');
    } finally {
      setDeleteConfirmOpen(false);
      setOrderToDelete(null);
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const total = orders.length;
    const draft = orders.filter(o => o.status === 'draft').length;
    const sent = orders.filter(o => o.status === 'sent').length;
    const billed = orders.filter(o => o.status === 'billed').length;
    return { total, draft, sent, billed };
  }, [orders]);

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
                  <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang==='en' ? 'Purchase Orders' : 'أوامر الشراء'}</h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang==='en' ? 'Manage purchase orders' : 'إدارة أوامر الشراء'}</p>
                </div>
              </div>
              {permWrite && (
                <Link href="/purchase-orders/new">
                  <Button className="bg-orange-600 hover:bg-orange-700 h-10 sm:h-11 text-sm sm:text-base px-3 sm:px-4">
                    <Plus className="w-4 h-4 ml-1 sm:ml-2" />
                    {appLang==='en' ? 'New Order' : 'أمر جديد'}
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <Card className="p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4"><CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Total' : 'الإجمالي'}</CardTitle></CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0"><div className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div></CardContent>
            </Card>
            <Card className="p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4"><CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Draft' : 'مسودة'}</CardTitle></CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0"><div className="text-lg sm:text-2xl font-bold text-gray-500">{stats.draft}</div></CardContent>
            </Card>
            <Card className="p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4"><CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Sent' : 'مُرسل'}</CardTitle></CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0"><div className="text-lg sm:text-2xl font-bold text-blue-600">{stats.sent}</div></CardContent>
            </Card>
            <Card className="p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4"><CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Billed' : 'تم التحويل'}</CardTitle></CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0"><div className="text-lg sm:text-2xl font-bold text-purple-600">{stats.billed}</div></CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Input
              placeholder={appLang === 'en' ? 'Search...' : 'بحث...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:w-64"
            />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder={appLang === 'en' ? 'Status' : 'الحالة'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{appLang === 'en' ? 'All' : 'الكل'}</SelectItem>
                <SelectItem value="draft">{appLang === 'en' ? 'Draft' : 'مسودة'}</SelectItem>
                <SelectItem value="sent">{appLang === 'en' ? 'Sent' : 'مُرسل'}</SelectItem>
                <SelectItem value="received">{appLang === 'en' ? 'Received' : 'مُستلم'}</SelectItem>
                <SelectItem value="billed">{appLang === 'en' ? 'Billed' : 'تم التحويل'}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <p className="py-8 text-center">{appLang==='en' ? 'Loading...' : 'جاري التحميل...'}</p>
              ) : filteredOrders.length === 0 ? (
                <p className="py-8 text-center text-gray-500 dark:text-gray-400">{appLang==='en' ? 'No purchase orders' : 'لا توجد أوامر شراء'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 dark:bg-slate-900">
                        <th className="px-3 py-2 text-right font-semibold">{appLang==='en' ? 'PO No.' : 'رقم الأمر'}</th>
                        <th className="px-3 py-2 text-right font-semibold">{appLang==='en' ? 'Date' : 'التاريخ'}</th>
                        <th className="px-3 py-2 text-right font-semibold">{appLang==='en' ? 'Supplier' : 'المورد'}</th>
                        <th className="px-3 py-2 text-right font-semibold">{appLang==='en' ? 'Total' : 'الإجمالي'}</th>
                        <th className="px-3 py-2 text-right font-semibold">{appLang==='en' ? 'Status' : 'الحالة'}</th>
                        <th className="px-3 py-2 text-right font-semibold">{appLang==='en' ? 'Actions' : 'إجراءات'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((po) => {
                        const linkedBill = po.bill_id ? linkedBills[po.bill_id] : null;
                        const canEditDelete = !linkedBill || linkedBill.status === 'draft';
                        const symbol = currencySymbols[po.currency || 'SAR'] || po.currency || 'SAR';
                        return (
                          <tr key={po.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                            <td className="px-3 py-2 font-medium">{po.po_number}</td>
                            <td className="px-3 py-2">{new Date(po.po_date).toLocaleDateString(appLang==='en' ? 'en' : 'ar')}</td>
                            <td className="px-3 py-2">{po.suppliers?.name}</td>
                            <td className="px-3 py-2">{symbol}{Number(po.total_amount || po.total || 0).toFixed(2)}</td>
                            <td className="px-3 py-2">{getStatusBadge(po.status)}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                <Link href={`/purchase-orders/${po.id}`}>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" title={appLang === 'en' ? 'View' : 'عرض'}>
                                    <Eye className="h-4 w-4 text-gray-500" />
                                  </Button>
                                </Link>
                                {canEditDelete && permUpdate && (
                                  <Link href={`/purchase-orders/${po.id}/edit`}>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" title={appLang === 'en' ? 'Edit' : 'تعديل'}>
                                      <Pencil className="h-4 w-4 text-blue-500" />
                                    </Button>
                                  </Link>
                                )}
                                {canEditDelete && permDelete && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    title={appLang === 'en' ? 'Delete' : 'حذف'}
                                    onClick={() => { setOrderToDelete(po); setDeleteConfirmOpen(true); }}
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                )}
                                {!canEditDelete && (
                                  <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    {appLang === 'en' ? 'Billed' : 'مرتبط بفاتورة'}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{appLang === 'en' ? 'Confirm Deletion' : 'تأكيد الحذف'}</DialogTitle>
          </DialogHeader>
          <p className="text-gray-600 dark:text-gray-400">
            {appLang === 'en'
              ? `Are you sure you want to delete order "${orderToDelete?.po_number}"?`
              : `هل أنت متأكد من حذف الأمر "${orderToDelete?.po_number}"؟`}
          </p>
          {orderToDelete?.bill_id && (
            <p className="text-amber-600 dark:text-amber-400 text-sm">
              {appLang === 'en'
                ? 'The linked bill will also be deleted.'
                : 'سيتم حذف الفاتورة المرتبطة أيضاً.'}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              {appLang === 'en' ? 'Cancel' : 'إلغاء'}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {appLang === 'en' ? 'Delete' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
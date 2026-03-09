"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSupabase } from "@/lib/supabase/hooks";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast as sonnerToast } from "sonner";
import { useToast } from "@/hooks/use-toast";
import { toastActionError, toastActionSuccess } from "@/lib/notifications";
import { Package, Plus, Eye, Pencil, Trash2, FileText, AlertCircle } from "lucide-react";
import { canAction } from "@/lib/authz";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getActiveCompanyId } from "@/lib/company";
import { usePagination } from "@/lib/pagination";
import { DataPagination } from "@/components/data-pagination";
import { type UserContext, GOODS_RECEIPT_ROLE_PERMISSIONS } from "@/lib/validation";
import { buildDataVisibilityFilter, applyDataVisibilityFilter } from "@/lib/data-visibility-control";
import { useBranchFilter } from "@/hooks/use-branch-filter";
import { BranchFilter } from "@/components/BranchFilter";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { StatusBadge } from "@/components/DataTableFormatters";
import { PageHeaderList } from "@/components/PageHeader";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterContainer } from "@/components/ui/filter-container";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { useUserContext } from "@/hooks/use-user-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type GoodsReceipt = {
  id: string;
  company_id: string;
  grn_number: string;
  receipt_date: string;
  status: string;
  purchase_order_id: string | null;
  bill_id: string | null;
  warehouse_id: string | null;
  total_quantity_received: number;
  total_quantity_accepted: number;
  total_quantity_rejected: number;
  received_by: string | null;
  received_at: string | null;
  purchase_order?: { id: string; po_number: string };
  bill?: { id: string; bill_number: string };
  warehouses?: { name: string };
};

export default function GoodsReceiptsPage() {
  const supabase = useSupabase();
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [permRead, setPermRead] = useState(false);
  const [permWrite, setPermWrite] = useState(false);
  const [permUpdate, setPermUpdate] = useState(false);
  const [permDelete, setPermDelete] = useState(false);
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar');
  const [hydrated, setHydrated] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [receiptToDelete, setReceiptToDelete] = useState<GoodsReceipt | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  const branchFilter = useBranchFilter();
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [pageSize, setPageSize] = useState<number>(10);

  // Status options
  const allStatusOptions = useMemo(() => [
    { value: "draft", label: appLang === 'en' ? "Draft" : "مسودة" },
    { value: "received", label: appLang === 'en' ? "Received" : "مستلم" },
    { value: "partially_received", label: appLang === 'en' ? "Partially Received" : "مستلم جزئياً" },
    { value: "rejected", label: appLang === 'en' ? "Rejected" : "مرفوض" },
    { value: "cancelled", label: appLang === 'en' ? "Cancelled" : "ملغي" },
  ], [appLang]);

  // Initialize language
  useEffect(() => {
    try {
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      setHydrated(true)
    } catch { }
  }, []);

  // Load user context
  const { userContext: contextFromHook, loading: contextLoading } = useUserContext();
  useEffect(() => {
    if (contextFromHook) {
      setUserContext(contextFromHook);
    }
  }, [contextFromHook]);

  // Check permissions
  useEffect(() => {
    const checkPerms = async () => {
      const companyId = await getActiveCompanyId(supabase);
      if (!companyId) return;

      const [read, write, update, del] = await Promise.all([
        canAction(supabase, 'goods_receipts', 'read'),
        canAction(supabase, 'goods_receipts', 'write'),
        canAction(supabase, 'goods_receipts', 'update'),
        canAction(supabase, 'goods_receipts', 'delete'),
      ]);

      setPermRead(read);
      setPermWrite(write);
      setPermUpdate(update);
      setPermDelete(del);
    };

    if (hydrated) {
      checkPerms();
    }
  }, [supabase, hydrated]);

  // Load receipts
  useEffect(() => {
    if (!hydrated || !permRead) return;

    const loadReceipts = async () => {
      try {
        setLoading(true);
        const companyId = await getActiveCompanyId(supabase);
        if (!companyId) return;

        let query = supabase
          .from("goods_receipts")
          .select(`
            *,
            purchase_order:purchase_orders!purchase_order_id (id, po_number),
            bill:bills!bill_id (id, bill_number),
            warehouses (id, name)
          `)
          .eq("company_id", companyId)
          .order("created_at", { ascending: false });

        // Apply branch filter if user has limited access
        if (userContext && userContext.branch_id) {
          query = query.eq("branch_id", userContext.branch_id);
        }

        const { data, error } = await query;

        if (error) throw error;
        setReceipts(data || []);
      } catch (err: any) {
        console.error("Error loading goods receipts:", err);
        toastActionError(toast, appLang === 'en' ? 'Load' : 'تحميل', appLang === 'en' ? 'Goods Receipts' : 'إيصالات الاستلام');
      } finally {
        setLoading(false);
      }
    };

    loadReceipts();
  }, [supabase, hydrated, permRead, userContext]);

  // Filter receipts
  const filteredReceipts = useMemo(() => {
    return receipts.filter(rec => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
          rec.grn_number.toLowerCase().includes(searchLower) ||
          rec.purchase_order?.po_number?.toLowerCase().includes(searchLower) ||
          rec.bill?.bill_number?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (filterStatuses.length > 0 && !filterStatuses.includes(rec.status)) {
        return false;
      }

      // Date filter
      if (dateFrom && rec.receipt_date < dateFrom) return false;
      if (dateTo && rec.receipt_date > dateTo) return false;

      return true;
    });
  }, [receipts, searchTerm, filterStatuses, dateFrom, dateTo]);

  // Pagination
  const { currentPage, totalPages, paginatedItems, goToPage, setPageSize: setPaginationPageSize } = usePagination(filteredReceipts, { pageSize });

  // Delete receipt
  const handleDelete = async () => {
    if (!receiptToDelete) return;

    try {
      const { error } = await supabase
        .from("goods_receipts")
        .delete()
        .eq("id", receiptToDelete.id)
        .eq("status", "draft"); // Only allow deletion of draft receipts

      if (error) throw error;

      toastActionSuccess(toast, appLang === 'en' ? 'Delete' : 'حذف', appLang === 'en' ? 'Goods Receipt' : 'إيصال الاستلام');
      setReceipts(prev => prev.filter(r => r.id !== receiptToDelete.id));
      setDeleteConfirmOpen(false);
      setReceiptToDelete(null);
    } catch (err: any) {
      console.error("Error deleting receipt:", err);
      toastActionError(toast, appLang === 'en' ? 'Delete' : 'حذف', appLang === 'en' ? 'Goods Receipt' : 'إيصال الاستلام', err.message);
    }
  };

  // Table columns
  const tableColumns: DataTableColumn<GoodsReceipt>[] = useMemo(() => [
    {
      key: 'grn_number',
      header: appLang === 'en' ? 'GRN Number' : 'رقم الإيصال',
      format: (_, row) => (
        <Link href={`/goods-receipts/${row.id}`} className="text-blue-600 hover:underline font-medium">
          {row.grn_number}
        </Link>
      )
    },
    {
      key: 'receipt_date',
      header: appLang === 'en' ? 'Date' : 'التاريخ',
      format: (_, row) => new Date(row.receipt_date).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')
    },
    {
      key: 'purchase_order',
      header: appLang === 'en' ? 'Purchase Order' : 'أمر الشراء',
      format: (_, row) => {
        if (row.purchase_order) {
          return (
            <Link href={`/purchase-orders/${row.purchase_order.id}`} className="text-blue-600 hover:underline">
              {row.purchase_order.po_number}
            </Link>
          );
        }
        return <span className="text-gray-400">-</span>;
      }
    },
    {
      key: 'warehouse',
      header: appLang === 'en' ? 'Warehouse' : 'المخزن',
      format: (_, row) => row.warehouses?.name || '-'
    },
    {
      key: 'status',
      header: appLang === 'en' ? 'Status' : 'الحالة',
      format: (_, row) => <StatusBadge status={row.status} lang={appLang} />
    },
    {
      key: 'total_quantity_accepted',
      header: appLang === 'en' ? 'Accepted Qty' : 'الكمية المقبولة',
      format: (_, row) => Number(row.total_quantity_accepted || 0).toFixed(2)
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Actions' : 'إجراءات',
      type: 'actions',
      align: 'center',
      format: (_, row) => (
        <div className="flex gap-2 justify-center">
          <Link href={`/goods-receipts/${row.id}`}>
            <Button variant="ghost" size="sm">
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
          {row.status === 'draft' && permUpdate && (
            <Link href={`/goods-receipts/${row.id}/edit`}>
              <Button variant="ghost" size="sm">
                <Pencil className="h-4 w-4" />
              </Button>
            </Link>
          )}
          {row.status === 'draft' && permDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setReceiptToDelete(row);
                setDeleteConfirmOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          )}
        </div>
      )
    }
  ], [appLang, permUpdate, permDelete]);

  if (!hydrated) {
    return <LoadingState />;
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-8 pt-20 md:pt-8">
        <PageHeaderList
          title={appLang === 'en' ? 'Goods Receipts' : 'إيصالات الاستلام'}
          description={appLang === 'en' ? 'Manage goods receipt notes (GRN) for received inventory' : 'إدارة إيصالات استلام البضاعة'}
          createLabel={appLang === 'en' ? 'New GRN' : 'إيصال جديد'}
          createHref={permWrite ? "/goods-receipts/new" : undefined}
          lang={appLang}
        />

        <FilterContainer
          title={appLang === 'en' ? 'Filters' : 'تصفية'}
          activeCount={filterStatuses.length + (searchTerm ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)}
          onClear={() => { setFilterStatuses([]); setSearchTerm(''); setDateFrom(''); setDateTo(''); }}
        >
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder={appLang === 'en' ? 'Search by GRN, PO, Bill...' : 'البحث برقم الإيصال، أمر الشراء، الفاتورة...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs"
            />
            <MultiSelect
              options={allStatusOptions}
              selected={filterStatuses}
              onChange={setFilterStatuses}
              placeholder={appLang === 'en' ? 'All Statuses' : 'جميع الحالات'}
            />
            <Input
              type="date"
              placeholder={appLang === 'en' ? 'From Date' : 'من تاريخ'}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="max-w-xs"
            />
            <Input
              type="date"
              placeholder={appLang === 'en' ? 'To Date' : 'إلى تاريخ'}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </FilterContainer>

        {loading ? (
          <LoadingState />
        ) : filteredReceipts.length === 0 ? (
          <EmptyState
            title={appLang === 'en' ? 'No Goods Receipts' : 'لا توجد إيصالات استلام'}
            description={appLang === 'en' ? 'Create your first goods receipt to get started' : 'أنشئ أول إيصال استلام للبدء'}
            action={permWrite ? { label: appLang === 'en' ? 'New GRN' : 'إيصال جديد', onClick: () => router.push('/goods-receipts/new') } : undefined}
          />
        ) : (
          <>
            <DataTable
              data={paginatedItems}
              columns={tableColumns}
              keyField="id"
              lang={appLang}
            />
            <DataPagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={goToPage}
              pageSize={pageSize}
              onPageSizeChange={(size) => { setPageSize(size); setPaginationPageSize(size); }}
              totalItems={filteredReceipts.length}
              lang={appLang}
            />
          </>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang === 'en' ? 'Delete Goods Receipt' : 'حذف إيصال الاستلام'}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {appLang === 'en' 
                ? `Are you sure you want to delete ${receiptToDelete?.grn_number}? This action cannot be undone.`
                : `هل أنت متأكد من حذف ${receiptToDelete?.grn_number}؟ لا يمكن التراجع عن هذا الإجراء.`}
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
                {appLang === 'en' ? 'Cancel' : 'إلغاء'}
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                {appLang === 'en' ? 'Delete' : 'حذف'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

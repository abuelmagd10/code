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
import { toastActionError, toastActionSuccess, toastDeleteSuccess, toastDeleteError } from "@/lib/notifications";
import { ClipboardList, Plus, Eye, Pencil, Trash2, FileText, AlertCircle } from "lucide-react";
import { canAction } from "@/lib/authz";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getActiveCompanyId } from "@/lib/company";
import { usePagination } from "@/lib/pagination";
import { DataPagination } from "@/components/data-pagination";
import { type UserContext, PURCHASE_REQUEST_ROLE_PERMISSIONS } from "@/lib/validation";
import { buildDataVisibilityFilter, applyDataVisibilityFilter, canAccessDocument, canCreateDocument } from "@/lib/data-visibility-control";
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

type PurchaseRequest = {
  id: string;
  company_id: string;
  request_number: string;
  request_date: string;
  required_date: string | null;
  priority: string;
  status: string;
  total_estimated_cost: number;
  currency: string;
  branch_id: string | null;
  cost_center_id: string | null;
  warehouse_id: string | null;
  requested_by: string;
  approved_by: string | null;
  rejected_by: string | null;
  converted_to_po_id: string | null;
  requested_by_user?: { email: string };
  approved_by_user?: { email: string };
  converted_to_po?: { id: string; po_number: string };
  purchase_request_items?: Array<{ id: string; product_id: string | null; quantity_requested: number; quantity_approved: number }>;
};

export default function PurchaseRequestsPage() {
  const supabase = useSupabase();
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [permRead, setPermRead] = useState(false);
  const [permWrite, setPermWrite] = useState(false);
  const [permUpdate, setPermUpdate] = useState(false);
  const [permDelete, setPermDelete] = useState(false);
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar');
  const [hydrated, setHydrated] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<PurchaseRequest | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [filterPriorities, setFilterPriorities] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  const branchFilter = useBranchFilter();
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [pageSize, setPageSize] = useState<number>(10);

  // Status options
  const allStatusOptions = useMemo(() => [
    { value: "draft", label: appLang === 'en' ? "Draft" : "مسودة" },
    { value: "submitted", label: appLang === 'en' ? "Submitted" : "مقدم" },
    { value: "pending_approval", label: appLang === 'en' ? "Pending Approval" : "في انتظار الموافقة" },
    { value: "approved", label: appLang === 'en' ? "Approved" : "معتمد" },
    { value: "rejected", label: appLang === 'en' ? "Rejected" : "مرفوض" },
    { value: "converted_to_po", label: appLang === 'en' ? "Converted to PO" : "محول إلى أمر شراء" },
    { value: "cancelled", label: appLang === 'en' ? "Cancelled" : "ملغي" },
  ], [appLang]);

  const priorityOptions = useMemo(() => [
    { value: "low", label: appLang === 'en' ? "Low" : "منخفض" },
    { value: "normal", label: appLang === 'en' ? "Normal" : "عادي" },
    { value: "high", label: appLang === 'en' ? "High" : "عالي" },
    { value: "urgent", label: appLang === 'en' ? "Urgent" : "عاجل" },
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
        canAction(supabase, 'purchase_requests', 'read'),
        canAction(supabase, 'purchase_requests', 'write'),
        canAction(supabase, 'purchase_requests', 'update'),
        canAction(supabase, 'purchase_requests', 'delete'),
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

  // Load requests
  useEffect(() => {
    if (!hydrated || !permRead) return;

    const loadRequests = async () => {
      try {
        setLoading(true);
        const companyId = await getActiveCompanyId(supabase);
        if (!companyId) return;

        let query = supabase
          .from("purchase_requests")
          .select(`
            *,
            requested_by_user:requested_by (id, email),
            approved_by_user:approved_by (id, email),
            converted_to_po:purchase_orders!converted_to_po_id (id, po_number),
            purchase_request_items (*)
          `)
          .eq("company_id", companyId)
          .order("created_at", { ascending: false });

        // Apply branch filter if user has limited access
        if (userContext && userContext.branch_id) {
          query = query.eq("branch_id", userContext.branch_id);
        }

        const { data, error } = await query;

        if (error) throw error;
        setRequests(data || []);
      } catch (err: any) {
        console.error("Error loading purchase requests:", err);
        toastActionError(toast, appLang === 'en' ? 'Load' : 'تحميل', appLang === 'en' ? 'Purchase Requests' : 'طلبات الشراء');
      } finally {
        setLoading(false);
      }
    };

    loadRequests();
  }, [supabase, hydrated, permRead, userContext]);

  // Filter requests
  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
          req.request_number.toLowerCase().includes(searchLower) ||
          req.requested_by_user?.email?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (filterStatuses.length > 0 && !filterStatuses.includes(req.status)) {
        return false;
      }

      // Priority filter
      if (filterPriorities.length > 0 && !filterPriorities.includes(req.priority)) {
        return false;
      }

      // Date filter
      if (dateFrom && req.request_date < dateFrom) return false;
      if (dateTo && req.request_date > dateTo) return false;

      return true;
    });
  }, [requests, searchTerm, filterStatuses, filterPriorities, dateFrom, dateTo]);

  // Pagination
  const { currentPage, totalPages, paginatedItems, goToPage, setPageSize: setPaginationPageSize } = usePagination(filteredRequests, { pageSize });

  // Delete request
  const handleDelete = async () => {
    if (!requestToDelete) return;

    try {
      const { error } = await supabase
        .from("purchase_requests")
        .delete()
        .eq("id", requestToDelete.id)
        .eq("status", "draft"); // Only allow deletion of draft requests

      if (error) throw error;

      toastDeleteSuccess(toast, appLang === 'en' ? 'Purchase Request' : 'طلب الشراء');
      setRequests(prev => prev.filter(r => r.id !== requestToDelete.id));
      setDeleteConfirmOpen(false);
      setRequestToDelete(null);
    } catch (err: any) {
      console.error("Error deleting request:", err);
      toastDeleteError(toast, appLang === 'en' ? 'Purchase Request' : 'طلب الشراء', err.message);
    }
  };

  // Table columns
  const tableColumns: DataTableColumn<PurchaseRequest>[] = useMemo(() => [
    {
      key: 'request_number',
      header: appLang === 'en' ? 'Request Number' : 'رقم الطلب',
      format: (_, row) => (
        <Link href={`/purchase-requests/${row.id}`} className="text-blue-600 hover:underline font-medium">
          {row.request_number}
        </Link>
      )
    },
    {
      key: 'request_date',
      header: appLang === 'en' ? 'Date' : 'التاريخ',
      format: (_, row) => new Date(row.request_date).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')
    },
    {
      key: 'priority',
      header: appLang === 'en' ? 'Priority' : 'الأولوية',
      format: (_, row) => {
        const colors: Record<string, string> = {
          low: 'bg-gray-100 text-gray-800',
          normal: 'bg-blue-100 text-blue-800',
          high: 'bg-orange-100 text-orange-800',
          urgent: 'bg-red-100 text-red-800'
        };
        return (
          <span className={`px-2 py-1 rounded text-xs font-medium ${colors[row.priority] || colors.normal}`}>
            {priorityOptions.find(p => p.value === row.priority)?.label || row.priority}
          </span>
        );
      }
    },
    {
      key: 'status',
      header: appLang === 'en' ? 'Status' : 'الحالة',
      format: (_, row) => <StatusBadge status={row.status} lang={appLang} />
    },
    {
      key: 'total_estimated_cost',
      header: appLang === 'en' ? 'Estimated Cost' : 'التكلفة المقدرة',
      format: (_, row) => `${Number(row.total_estimated_cost || 0).toFixed(2)} ${row.currency || 'EGP'}`
    },
    {
      key: 'converted_to_po',
      header: appLang === 'en' ? 'PO' : 'أمر الشراء',
      format: (_, row) => {
        if (row.converted_to_po) {
          return (
            <Link href={`/purchase-orders/${row.converted_to_po.id}`} className="text-blue-600 hover:underline">
              {row.converted_to_po.po_number}
            </Link>
          );
        }
        return <span className="text-gray-400">-</span>;
      }
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Actions' : 'إجراءات',
      type: 'actions',
      align: 'center',
      format: (_, row) => (
        <div className="flex gap-2 justify-center">
          <Link href={`/purchase-requests/${row.id}`}>
            <Button variant="ghost" size="sm">
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
          {row.status === 'draft' && permUpdate && (
            <Link href={`/purchase-requests/${row.id}/edit`}>
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
                setRequestToDelete(row);
                setDeleteConfirmOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          )}
        </div>
      )
    }
  ], [appLang, permUpdate, permDelete, priorityOptions]);

  if (!hydrated) {
    return <LoadingState />;
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-8 pt-20 md:pt-8">
        <PageHeaderList
          title={appLang === 'en' ? 'Purchase Requests' : 'طلبات الشراء'}
          description={appLang === 'en' ? 'Manage purchase requests before creating purchase orders' : 'إدارة طلبات الشراء قبل إنشاء أوامر الشراء'}
          createLabel={appLang === 'en' ? 'New Request' : 'طلب جديد'}
          createHref={permWrite ? "/purchase-requests/new" : undefined}
          lang={appLang}
        />

        <FilterContainer
          title={appLang === 'en' ? 'Filters' : 'تصفية'}
          activeCount={filterStatuses.length + filterPriorities.length + (searchTerm ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)}
          onClear={() => { setFilterStatuses([]); setFilterPriorities([]); setSearchTerm(''); setDateFrom(''); setDateTo(''); }}
        >
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder={appLang === 'en' ? 'Search by number...' : 'البحث برقم الطلب...'}
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
            <MultiSelect
              options={priorityOptions}
              selected={filterPriorities}
              onChange={setFilterPriorities}
              placeholder={appLang === 'en' ? 'All Priorities' : 'جميع الأولويات'}
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
        ) : filteredRequests.length === 0 ? (
          <EmptyState
            title={appLang === 'en' ? 'No Purchase Requests' : 'لا توجد طلبات شراء'}
            description={appLang === 'en' ? 'Create your first purchase request to get started' : 'أنشئ أول طلب شراء للبدء'}
            action={permWrite ? { label: appLang === 'en' ? 'New Request' : 'طلب جديد', onClick: () => router.push('/purchase-requests/new') } : undefined}
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
              totalItems={filteredRequests.length}
              lang={appLang}
            />
          </>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang === 'en' ? 'Delete Purchase Request' : 'حذف طلب الشراء'}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {appLang === 'en' 
                ? `Are you sure you want to delete ${requestToDelete?.request_number}? This action cannot be undone.`
                : `هل أنت متأكد من حذف ${requestToDelete?.request_number}؟ لا يمكن التراجع عن هذا الإجراء.`}
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

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/hooks";
import { SupabaseConfigError } from "@/components/supabase-config-error";
import { useSupabase } from "@/lib/supabase/hooks";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { FilterContainer } from "@/components/ui/filter-container";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { toast as sonnerToast } from "sonner";
import { useToast } from "@/hooks/use-toast";
import { toastActionError, toastActionSuccess } from "@/lib/notifications";
import { ShoppingCart, Plus, Eye, Pencil, Trash2, FileText, AlertCircle, UserCheck, X } from "lucide-react";
import { CustomerSearchSelect } from "@/components/CustomerSearchSelect";
import { canAction } from "@/lib/authz";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePagination } from "@/lib/pagination";
import { DataPagination } from "@/components/data-pagination";
import { OrderActions } from "@/components/OrderActions";
import { getActiveCompanyId } from "@/lib/company";
import { type UserContext, getRoleAccessLevel, getAccessFilter, validateRecordModification } from "@/lib/validation";
import { buildDataVisibilityFilter, applyDataVisibilityFilter, canAccessDocument, canCreateDocument } from "@/lib/data-visibility-control";
import { PageHeaderList } from "@/components/PageHeader";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { StatusBadge } from "@/components/DataTableFormatters";

type Customer = { id: string; name: string; phone?: string | null };
type Product = { id: string; name: string; unit_price?: number; item_type?: 'product' | 'service' };

// نوع بيانات الموظف للفلترة
type Employee = {
  user_id: string;
  display_name: string;
  role: string;
  email?: string;
};

type SalesOrder = {
  id: string;
  company_id: string;
  customer_id: string;
  so_number: string;
  so_date: string;
  due_date: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  total?: number;
  status: string;
  notes?: string | null;
  currency?: string;
  invoice_id?: string | null;
  shipping_provider_id?: string | null;
  created_by_user_id?: string | null;
  // 🔐 ERP Access Control fields
  branch_id?: string | null;
  cost_center_id?: string | null;
  warehouse_id?: string | null;
};

type LinkedInvoice = {
  id: string;
  status: string;
  total_amount?: number;
  paid_amount?: number;
  returned_amount?: number;
  return_status?: string;
};

type SOItem = {
  id?: string;
  product_id?: string | null;
  description?: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  discount_percent?: number;
  line_total: number;
};

// نوع لبنود الأمر مع المنتج
type SOItemWithProduct = {
  sales_order_id: string;
  quantity: number;
  product_id?: string | null;
  products?: { name: string } | null;
};

// نوع للكميات المرتجعة لكل منتج
type ReturnedQuantity = {
  invoice_id: string;
  product_id: string;
  quantity: number;
};

// نوع لعرض ملخص المنتجات
type ProductSummary = { name: string; quantity: number; returned?: number };

function SalesOrdersContent() {
  const supabase = useSupabase();
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [orderItems, setOrderItems] = useState<SOItemWithProduct[]>([]);
  const [returnedQuantities, setReturnedQuantities] = useState<ReturnedQuantity[]>([]);
  const [filterProducts, setFilterProducts] = useState<string[]>([]);
  const [filterShippingProviders, setFilterShippingProviders] = useState<string[]>([]);
  const [shippingProviders, setShippingProviders] = useState<{ id: string; provider_name: string }[]>([]);
  const [permRead, setPermRead] = useState(false);
  const [permWrite, setPermWrite] = useState(false);
  const [permUpdate, setPermUpdate] = useState(false);
  const [permDelete, setPermDelete] = useState(false);
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar');
  const [hydrated, setHydrated] = useState(false);

  // تهيئة اللغة بعد hydration
  useEffect(() => {
    try {
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
    } catch { }
  }, []);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<SalesOrder | null>(null);
  const [linkedInvoices, setLinkedInvoices] = useState<Record<string, LinkedInvoice>>({});

  // Pagination state
  const [pageSize, setPageSize] = useState<number>(10);

  // Filter & Search states
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [filterCustomers, setFilterCustomers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // 🚀 تحسين الأداء - استخدام useTransition للفلاتر
  const [isPending, startTransition] = useTransition();

  // فلترة الموظفين (للمديرين فقط)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  const [canViewAllOrders, setCanViewAllOrders] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>("all");
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState<string>("");

  // 🔐 ERP Access Control - سياق المستخدم
  const [userContext, setUserContext] = useState<UserContext | null>(null);

  // 🔐 قائمة المستخدمين الذين شاركوا صلاحياتهم (للتحقق من أوامر البيع المشتركة)
  const [sharedGrantorIds, setSharedGrantorIds] = useState<string[]>([]);

  // Status options for multi-select
  const statusOptions = [
    { value: "draft", label: appLang === 'en' ? "Draft" : "مسودة" },
    { value: "sent", label: appLang === 'en' ? "Sent" : "مُرسل" },
    { value: "invoiced", label: appLang === 'en' ? "Invoiced" : "تم الفوترة" },
    { value: "paid", label: appLang === 'en' ? "Paid" : "مدفوع" },
    { value: "partially_paid", label: appLang === 'en' ? "Partially Paid" : "مدفوع جزئياً" },
    { value: "returned", label: appLang === 'en' ? "Returned" : "مرتجع" },
    { value: "fully_returned", label: appLang === 'en' ? "Fully Returned" : "مرتجع بالكامل" },
    { value: "cancelled", label: appLang === 'en' ? "Cancelled" : "ملغي" },
  ];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SalesOrder | null>(null);

  const [customerId, setCustomerId] = useState<string>("");
  const [soNumber, setSONumber] = useState<string>("");
  const [soDate, setSODate] = useState<string>("");
  
  useEffect(() => {
    setSODate(new Date().toISOString().slice(0, 10));
  }, []);
  const [dueDate, setDueDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [items, setItems] = useState<SOItem[]>([]);
  const [taxAmount, setTaxAmount] = useState<number>(0);

  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
  };

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, i) => sum + i.line_total, 0);
    const total = subtotal + taxAmount;
    return { subtotal, total };
  }, [items, taxAmount]);

    // Filtered orders - إصدار مبسط بدون فلاتر حوكمة
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Status filter - Multi-select
      if (filterStatuses.length > 0) {
        const linkedInvoice = order.invoice_id ? linkedInvoices[order.invoice_id] : null;
        const displayStatus = linkedInvoice ? linkedInvoice.status : order.status;
        if (!filterStatuses.includes(displayStatus)) return false;
      }

      // Customer filter - show orders for any of the selected customers
      if (filterCustomers.length > 0 && !filterCustomers.includes(order.customer_id)) return false;

      // Date range filter
      if (dateFrom && order.so_date < dateFrom) return false;
      if (dateTo && order.so_date > dateTo) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const customerName = String(customers.find(c => c.id === order.customer_id)?.name || "").toLowerCase();
        const customerPhone = String(customers.find(c => c.id === order.customer_id)?.phone || "").toLowerCase();
        const soNumber = order.so_number ? String(order.so_number).toLowerCase() : "";
        if (!customerName.includes(q) && !customerPhone.includes(q) && !soNumber.includes(q)) return false;
      }

      return true;
    });
  }, [orders, filterStatuses, filterCustomers, searchQuery, dateFrom, dateTo, customers, linkedInvoices]);

  // Pagination logic
  const {
    currentPage,
    totalPages,
    totalItems,
    paginatedItems: paginatedOrders,
    hasNext,
    hasPrevious,
    goToPage,
    nextPage,
    previousPage,
    setPageSize: updatePageSize
  } = usePagination(filteredOrders, { pageSize });

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    updatePageSize(newSize);
  };

  // Statistics - تعمل مع الفلترة
  const stats = useMemo(() => {
    const total = filteredOrders.length;
    const draft = filteredOrders.filter(o => {
      const linked = o.invoice_id ? linkedInvoices[o.invoice_id] : null;
      return (linked ? linked.status : o.status) === 'draft';
    }).length;
    const invoiced = filteredOrders.filter(o => {
      const linked = o.invoice_id ? linkedInvoices[o.invoice_id] : null;
      const status = linked ? linked.status : o.status;
      return status === 'invoiced' || status === 'sent';
    }).length;
    const paid = filteredOrders.filter(o => {
      const linked = o.invoice_id ? linkedInvoices[o.invoice_id] : null;
      return (linked ? linked.status : o.status) === 'paid';
    }).length;
    // حساب إجمالي القيمة مع خصم المرتجعات من الفواتير المرتبطة
    const totalValue = filteredOrders.reduce((sum, o) => {
      const orderTotal = o.total || o.total_amount || 0;
      const linked = o.invoice_id ? linkedInvoices[o.invoice_id] : null;
      // إذا كانت هناك فاتورة مرتبطة بمرتجعات، نخصم المرتجع
      const returnedAmount = linked?.returned_amount || 0;
      return sum + (orderTotal - returnedAmount);
    }, 0);
    return { total, draft, invoiced, paid, totalValue };
  }, [filteredOrders, linkedInvoices]);

  const clearFilters = () => {
    setFilterStatuses([]);
    setFilterCustomers([]);
    setFilterProducts([]);
    setFilterShippingProviders([]);
    setFilterEmployeeId("all");
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
  };

  // حساب عدد الفلاتر النشطة
  const activeFilterCount = [
    filterStatuses.length > 0,
    filterCustomers.length > 0,
    filterProducts.length > 0,
    filterShippingProviders.length > 0,
    filterEmployeeId !== "all",
    !!searchQuery,
    !!dateFrom,
    !!dateTo
  ].filter(Boolean).length;

  // تعريف أعمدة الجدول
  const tableColumns: DataTableColumn<SalesOrder>[] = useMemo(() => [
    {
      key: 'so_number',
      header: appLang === 'en' ? 'SO No.' : 'رقم الأمر',
      type: 'text',
      align: 'left',
      width: 'min-w-[120px]',
      format: (value) => (
        <span className="font-medium text-blue-600 dark:text-blue-400">{value}</span>
      )
    },
    {
      key: 'customer_id',
      header: appLang === 'en' ? 'Customer' : 'العميل',
      type: 'text',
      align: 'left',
      format: (_, row) => {
        const customer = customers.find(c => c.id === row.customer_id);
        return customer?.name || '-';
      }
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Products' : 'المنتجات',
      type: 'custom',
      align: 'left',
      hidden: 'lg',
      width: 'max-w-[200px]',
      format: (_, row) => {
        const summary = getProductsSummary(row.id, row.invoice_id);
        if (summary.length === 0) return '-';
        return (
          <div className="text-xs space-y-0.5">
            {summary.slice(0, 3).map((p, idx) => (
              <div key={idx} className="truncate">
                {p.name} — <span className="font-medium">{p.quantity}</span>
                {p.returned && p.returned > 0 && (
                  <span className="text-orange-600 dark:text-orange-400 text-[10px]">
                    {' '}({appLang === 'en' ? 'ret:' : 'مرتجع:'} {p.returned})
                  </span>
                )}
              </div>
            ))}
            {summary.length > 3 && (
              <div className="text-gray-500 dark:text-gray-400">
                +{summary.length - 3} {appLang === 'en' ? 'more' : 'أخرى'}
              </div>
            )}
          </div>
        );
      }
    },
    {
      key: 'so_date',
      header: appLang === 'en' ? 'Date' : 'التاريخ',
      type: 'date',
      align: 'right',
      hidden: 'sm',
      format: (value) => value || '-'
    },
    {
      key: 'total',
      header: appLang === 'en' ? 'Total' : 'المجموع',
      type: 'currency',
      align: 'right',
      format: (_, row) => {
        const total = row.total || row.total_amount || 0;
        const currency = row.currency || 'EGP';
        const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
        const linkedInvoice = row.invoice_id ? linkedInvoices[row.invoice_id] : null;

        // إذا كانت هناك فاتورة مرتبطة بها مرتجعات، نعرض التفاصيل
        if (linkedInvoice && (linkedInvoice.returned_amount || 0) > 0) {
          const returnedAmount = linkedInvoice.returned_amount || 0;
          const paidAmount = linkedInvoice.paid_amount || 0;
          const netRemaining = total - paidAmount - returnedAmount;

          return (
            <div className="flex flex-col items-end gap-0.5 text-xs">
              <span className="font-medium">{symbol}{total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              <span className="text-red-600 dark:text-red-400">
                {appLang === 'en' ? 'Ret:' : 'مرتجع:'} -{symbol}{returnedAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
              {paidAmount > 0 && (
                <span className="text-green-600 dark:text-green-400">
                  {appLang === 'en' ? 'Paid:' : 'مدفوع:'} {symbol}{paidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              )}
              <span className={`font-bold ${netRemaining > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
                {appLang === 'en' ? 'Due:' : 'متبقي:'} {symbol}{netRemaining.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          );
        }

        // إذا كانت هناك فاتورة مرتبطة بمدفوعات فقط (بدون مرتجعات)
        if (linkedInvoice && (linkedInvoice.paid_amount || 0) > 0) {
          const paidAmount = linkedInvoice.paid_amount || 0;
          const remaining = total - paidAmount;

          return (
            <div className="flex flex-col items-end gap-0.5 text-xs">
              <span className="font-medium">{symbol}{total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              <span className="text-green-600 dark:text-green-400">
                {appLang === 'en' ? 'Paid:' : 'مدفوع:'} {symbol}{paidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
              {remaining > 0 && (
                <span className="text-yellow-600 dark:text-yellow-400 font-bold">
                  {appLang === 'en' ? 'Due:' : 'متبقي:'} {symbol}{remaining.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
          );
        }

        // بدون فاتورة أو فاتورة بدون مدفوعات/مرتجعات
        return `${symbol}${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      }
    },
    {
      key: 'shipping_provider_id',
      header: appLang === 'en' ? 'Shipping' : 'الشحن',
      type: 'text',
      align: 'center',
      hidden: 'lg',
      format: (_, row) => {
        if (!row.shipping_provider_id) return '-';
        const provider = shippingProviders.find(p => p.id === row.shipping_provider_id);
        return provider?.provider_name || '-';
      }
    },
    {
      key: 'status',
      header: appLang === 'en' ? 'Status' : 'الحالة',
      type: 'status',
      align: 'center',
      format: (_, row) => {
        const linkedInvoice = row.invoice_id ? linkedInvoices[row.invoice_id] : null;
        // إذا مرتبط بفاتورة: نعرض حالة أمر البيع "invoiced" + حالة الفاتورة + المرتجعات
        if (linkedInvoice || row.invoice_id) {
          // تصحيح للبيانات القديمة: إذا مرتبط بفاتورة، الحالة الصحيحة هي invoiced
          const orderStatus = row.invoice_id ? 'invoiced' : row.status;
          const hasReturns = linkedInvoice && (linkedInvoice.returned_amount || 0) > 0;
          const returnStatus = linkedInvoice?.return_status;

          // تحديد نص حالة الفاتورة
          const getInvoiceStatusText = () => {
            if (returnStatus === 'full') return appLang === 'en' ? 'Fully Returned' : 'مرتجع كامل';
            if (returnStatus === 'partial') return appLang === 'en' ? 'Partial Return' : 'مرتجع جزئي';
            if (linkedInvoice?.status === 'paid') return appLang === 'en' ? 'Paid' : 'مدفوعة';
            if (linkedInvoice?.status === 'partially_paid') return appLang === 'en' ? 'Partial' : 'جزئي';
            if (linkedInvoice?.status === 'draft') return appLang === 'en' ? 'Draft' : 'مسودة';
            if (linkedInvoice?.status === 'sent') return appLang === 'en' ? 'Sent' : 'مرسلة';
            return linkedInvoice?.status || '';
          };

          // تحديد لون حالة الفاتورة
          const getInvoiceStatusColor = () => {
            if (returnStatus === 'full') return 'text-red-600 dark:text-red-400';
            if (returnStatus === 'partial') return 'text-orange-600 dark:text-orange-400';
            if (linkedInvoice?.status === 'paid') return 'text-green-600 dark:text-green-400';
            if (linkedInvoice?.status === 'partially_paid') return 'text-yellow-600 dark:text-yellow-400';
            return 'text-gray-600 dark:text-gray-400';
          };

          return (
            <div className="flex flex-col items-center gap-0.5">
              <StatusBadge status={orderStatus} lang={appLang} />
              {linkedInvoice && (
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  {appLang === 'en' ? 'Inv:' : 'الفاتورة:'}
                  <span className={`mx-1 ${getInvoiceStatusColor()}`}>
                    {getInvoiceStatusText()}
                  </span>
                </span>
              )}
            </div>
          );
        }
        return <StatusBadge status={row.status} lang={appLang} />;
      }
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Actions' : 'إجراءات',
      type: 'actions',
      align: 'center',
      format: (_, row) => {
        const linkedInvoice = row.invoice_id ? linkedInvoices[row.invoice_id] : null;
        const displayStatus = linkedInvoice ? linkedInvoice.status : row.status;

        return (
          <OrderActions
            orderId={row.id}
            orderType="sales"
            orderStatus={row.status}
            invoiceId={row.invoice_id}
            invoiceStatus={displayStatus}
            hasPayments={displayStatus === 'paid' || displayStatus === 'partially_paid'}
            onDelete={() => { setOrderToDelete(row); setDeleteConfirmOpen(true); }}
            onConvertToInvoice={() => convertToInvoice(row)}
            lang={appLang}
            permissions={{
              canView: permRead,
              canEdit: permUpdate,
              canDelete: permDelete,
              canCreate: permWrite
            }}
          />
        );
      }
    }
  ], [appLang, customers, linkedInvoices, shippingProviders, permRead, permUpdate, permDelete, permWrite]);

  useEffect(() => {
    setHydrated(true);
    const handler = () => {
      try {
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      } catch { }
    }
    window.addEventListener('app_language_changed', handler)
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, []);

  useEffect(() => {
    const checkPerms = async () => {
      const [read, write, update, del] = await Promise.all([
        canAction(supabase, "sales_orders", "read"),
        canAction(supabase, "sales_orders", "write"),
        canAction(supabase, "sales_orders", "update"),
        canAction(supabase, "sales_orders", "delete"),
      ]);
      setPermRead(read);
      setPermWrite(write);
      setPermUpdate(update);
      setPermDelete(del);

      // جلب معلومات المستخدم الحالي والصلاحيات
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const activeCompanyId = await getActiveCompanyId(supabase);
        if (activeCompanyId) {
          const { data: member } = await supabase
            .from("company_members")
            .select("role, branch_id, cost_center_id, warehouse_id")
            .eq("company_id", activeCompanyId)
            .eq("user_id", user.id)
            .single();

          const role = member?.role || "staff";
          setCurrentUserRole(role);

          // 🔐 ERP Access Control - تعيين سياق المستخدم
          const context: UserContext = {
            user_id: user.id,
            company_id: activeCompanyId,
            branch_id: member?.branch_id || null,
            cost_center_id: member?.cost_center_id || null,
            warehouse_id: member?.warehouse_id || null,
            role: role
          };
          setUserContext(context);

          // استخدام دالة getRoleAccessLevel لتحديد مستوى الوصول
          const accessLevel = getRoleAccessLevel(role);
          // المديرين (owner, admin, manager) يرون جميع الأوامر أو أوامر الفرع
          const canViewAll = accessLevel === 'all' || accessLevel === 'company' || accessLevel === 'branch';
          setCanViewAllOrders(canViewAll);

          // تحميل قائمة الموظفين للفلترة (للأدوار المصرح لها)
          if (canViewAll) {
            const { data: members } = await supabase
              .from("company_members")
              .select("user_id, role, branch_id")
              .eq("company_id", activeCompanyId);

            // إذا كان المستخدم مدير فرع، يرى فقط موظفي فرعه
            let filteredMembers = members || [];
            if (accessLevel === 'branch' && member?.branch_id) {
              filteredMembers = filteredMembers.filter((m: any) => m.branch_id === member.branch_id);
            }

            if (filteredMembers.length > 0) {
              const userIds = filteredMembers.map((m: { user_id: string }) => m.user_id);
              const { data: profiles } = await supabase
                .from("user_profiles")
                .select("user_id, display_name, username")
                .in("user_id", userIds);

              const profileMap = new Map((profiles || []).map((p: { user_id: string; display_name?: string; username?: string }) => [p.user_id, p]));

              const roleLabels: Record<string, string> = {
                owner: appLang === 'en' ? 'Owner' : 'مالك',
                admin: appLang === 'en' ? 'Admin' : 'مدير',
                manager: appLang === 'en' ? 'Manager' : 'مدير فرع',
                supervisor: appLang === 'en' ? 'Supervisor' : 'مشرف',
                staff: appLang === 'en' ? 'Staff' : 'موظف',
                accountant: appLang === 'en' ? 'Accountant' : 'محاسب',
                sales: appLang === 'en' ? 'Sales' : 'مبيعات',
                viewer: appLang === 'en' ? 'Viewer' : 'مشاهد'
              };

              const employeesList: Employee[] = filteredMembers.map((m: { user_id: string; role: string }) => {
                const profile = profileMap.get(m.user_id) as { user_id: string; display_name?: string; username?: string } | undefined;
                return {
                  user_id: m.user_id,
                  display_name: profile?.display_name || profile?.username || m.user_id.slice(0, 8),
                  role: roleLabels[m.role] || m.role,
                  email: profile?.username
                };
              });
              setEmployees(employeesList);
            }
          }
        }
      }
    };
    checkPerms();
  }, [supabase, appLang]);

    // تحميل الأوامر - إصدار مبسط جداً
  const loadOrders = async () => {
  try {
    setLoading(true);
    const activeCompanyId = await getActiveCompanyId(supabase);
    if (!activeCompanyId) {
      setLoading(false);
      return;
    }

    // Load sales orders
    const response = await fetch('/api/sales-orders');
    const result = await response.json();
    const so = result.success ? result.data : [];

    setOrders(so || []);

    // Load customers
    const { data: customersData } = await supabase
      .from("customers")
      .select("id, name, phone")
      .eq("company_id", activeCompanyId);
    
    setCustomers(customersData || []);

    // Load products
    const { data: productsData } = await supabase
      .from("products")
      .select("id, name, unit_price, item_type")
      .eq("company_id", activeCompanyId);
    
    setProducts(productsData || []);

    // Load order items
    if (so && so.length > 0) {
      const { data: items } = await supabase
        .from("sales_order_items")
        .select("sales_order_id, quantity, product_id, products(name)")
        .in("sales_order_id", so.map((o: SalesOrder) => o.id));
      
      setOrderItems(items || []);
    }

    // Load shipping providers
    const { data: shipping } = await supabase
      .from("shipping_providers")
      .select("id, provider_name")
      .eq("company_id", activeCompanyId);
    
    setShippingProviders(shipping || []);

    // Load linked invoices
    const invoiceIds = (so || []).filter((o: SalesOrder) => o.invoice_id).map((o: SalesOrder) => o.invoice_id);
    if (invoiceIds.length > 0) {
      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, status, total_amount, paid_amount, returned_amount, return_status")
        .in("id", invoiceIds);

      const invoiceMap: Record<string, LinkedInvoice> = {};
      (invoices || []).forEach((inv: any) => {
        invoiceMap[inv.id] = {
          id: inv.id,
          status: inv.status,
          total_amount: inv.total_amount || 0,
          paid_amount: inv.paid_amount || 0,
          returned_amount: inv.returned_amount || 0,
          return_status: inv.return_status
        };
      });
      setLinkedInvoices(invoiceMap);
    }

    setLoading(false);
  } catch (error) {
    console.error('Error loading orders:', error);
    setLoading(false);
  }
};

  // دالة لتحديث حالة الفاتورة المرتبطة
  const refreshInvoiceStatus = async (invoiceId: string) => {
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, status")
      .eq("id", invoiceId)
      .single();

    if (invoice) {
      setLinkedInvoices(prev => ({
        ...prev,
        [invoice.id]: { id: invoice.id, status: invoice.status }
      }));

      // تحديث حالة أمر البيع المرتبط
      const linkedOrder = orders.find(o => o.invoice_id === invoice.id);
      if (linkedOrder) {
        syncOrderWithInvoice(linkedOrder.id, invoice.status);
      }
    }
  };

  // تحديث حالة أمر البيع بناءً على حالة الفاتورة
  const syncOrderWithInvoice = async (orderId: string, invoiceStatus: string) => {
    let orderStatus = 'draft';

    switch (invoiceStatus) {
      case 'draft':
        orderStatus = 'invoiced';
        break;
      case 'sent':
        orderStatus = 'sent';
        break;
      case 'paid':
        orderStatus = 'paid';
        break;
      case 'partially_paid':
        orderStatus = 'partially_paid';
        break;
      case 'overdue':
        orderStatus = 'sent';
        break;
      case 'cancelled':
        orderStatus = 'cancelled';
        break;
      case 'returned':
      case 'fully_returned':
        orderStatus = 'fully_returned';
        break;
      case 'partially_returned':
        orderStatus = 'returned';
        break;
      default:
        orderStatus = 'invoiced';
    }

    const { error } = await supabase
      .from('sales_orders')
      .update({ status: orderStatus })
      .eq('id', orderId);

    if (!error) {
      setOrders(prev => prev.map(order =>
        order.id === orderId ? { ...order, status: orderStatus } : order
      ));
    }
  };

  // تحديث حالة جميع الفواتير المرتبطة
  const refreshAllInvoicesStatus = async () => {
    const invoiceIds = orders.filter(o => o.invoice_id).map(o => o.invoice_id);
    if (invoiceIds.length > 0) {
      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, status, total_amount, paid_amount, returned_amount, return_status")
        .in("id", invoiceIds);

      const invoiceMap: Record<string, LinkedInvoice> = {};
      (invoices || []).forEach((inv: any) => {
        invoiceMap[inv.id] = {
          id: inv.id,
          status: inv.status,
          total_amount: inv.total_amount || 0,
          paid_amount: inv.paid_amount || 0,
          returned_amount: inv.returned_amount || 0,
          return_status: inv.return_status
        };

        // تحديث حالة أمر البيع المرتبط
        const linkedOrder = orders.find(o => o.invoice_id === inv.id);
        if (linkedOrder) {
          syncOrderWithInvoice(linkedOrder.id, inv.status);
        }
      });
      setLinkedInvoices(invoiceMap);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [supabase]);

  // 🔄 الاستماع لتغيير الشركة وإعادة تحميل البيانات
  useEffect(() => {
    const handleCompanyChange = () => {
      loadOrders();
    };
    window.addEventListener('company_updated', handleCompanyChange);
    return () => window.removeEventListener('company_updated', handleCompanyChange);
  }, [supabase]);

  // تحديث دوري لحالة الفواتير كل 30 ثانية
  useEffect(() => {
    const interval = setInterval(() => {
      if (orders.length > 0) {
        refreshAllInvoicesStatus();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [orders]);

  // دالة للحصول على ملخص المنتجات لأمر معين مع الكميات المرتجعة
  const getProductsSummary = (orderId: string, invoiceId?: string | null): ProductSummary[] => {
    const items = orderItems.filter(item => item.sales_order_id === orderId);
    return items.map(item => {
      // حساب الكمية المرتجعة لهذا المنتج من هذه الفاتورة
      const returnedQty = invoiceId && item.product_id
        ? returnedQuantities
          .filter(r => r.invoice_id === invoiceId && r.product_id === item.product_id)
          .reduce((sum, r) => sum + r.quantity, 0)
        : 0;
      return {
        name: item.products?.name || '-',
        quantity: item.quantity,
        returned: returnedQty > 0 ? returnedQty : undefined
      };
    });
  };

  const resetForm = () => {
    setCustomerId("");
    setSONumber("");
    setSODate(new Date().toISOString().slice(0, 10));
    setDueDate("");
    setNotes("");
    setItems([]);
    setTaxAmount(0);
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { quantity: 1, unit_price: 0, line_total: 0, product_id: null, description: "" },
    ]);
  };

  const updateItem = (index: number, patch: Partial<SOItem>) => {
    setItems((prev) => {
      const next = [...prev];
      const item = { ...next[index], ...patch };
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      const discount = Number(item.discount_percent) || 0;
      const tax = Number(item.tax_rate) || 0;
      const base = qty * price * (1 - discount / 100);
      const total = base + base * (tax / 100);
      item.line_total = Number(total.toFixed(2));
      next[index] = item;
      return next;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // 🔐 سياق الحوكمة للقراءة فقط
  const [governanceInfo, setGovernanceInfo] = useState<{
    branchName?: string;
    warehouseName?: string;
    costCenterName?: string;
  }>({});

  useEffect(() => {
    const fetchGovernanceNames = async () => {
      if (!userContext || !supabase) {
        console.log('Governance fetch skipped - missing userContext or supabase');
        return;
      }
      
      // Wait for authentication to be ready
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        console.error('Governance fetch - auth error or no user:', authError);
        return;
      }
      
      console.log('Governance fetch - user authenticated:', user.id);
      const info: any = {};
      
      if (userContext.branch_id) {
        try {
          console.log('Fetching branch name for ID:', userContext.branch_id);
          const { data, error } = await supabase.from('branches').select('name').eq('id', userContext.branch_id).single();
          if (error) {
            console.error('Error fetching branch name:', error);
          } else if (data) {
            info.branchName = data.name;
            console.log('Branch name fetched:', data.name);
          }
        } catch (error) {
          console.error('Exception fetching branch name:', error);
        }
      }
      
      if (userContext.warehouse_id) {
        try {
          console.log('Fetching warehouse name for ID:', userContext.warehouse_id);
          const { data, error } = await supabase.from('warehouses').select('name').eq('id', userContext.warehouse_id).single();
          if (error) {
            console.error('Error fetching warehouse name:', error);
          } else if (data) {
            info.warehouseName = data.name;
            console.log('Warehouse name fetched:', data.name);
          }
        } catch (error) {
          console.error('Exception fetching warehouse name:', error);
        }
      }
      
      if (userContext.cost_center_id) {
        try {
          console.log('Fetching cost center name for ID:', userContext.cost_center_id);
          console.log('User context:', userContext);
          
          // First, let's try to see what columns are available
          const { data: costCenterData, error: costCenterError } = await supabase
            .from('cost_centers')
            .select('*')
            .eq('id', userContext.cost_center_id)
            .eq('company_id', userContext.company_id)
            .single();
            
          if (costCenterError) {
            console.error('Error fetching cost center:', costCenterError);
            console.error('Error details:', JSON.stringify(costCenterError, null, 2));
          } else if (costCenterData) {
            console.log('Cost center data structure:', costCenterData);
            // Try different possible name fields
            const name = costCenterData.name || costCenterData.title || costCenterData.label || costCenterData.code;
            if (name) {
              info.costCenterName = name;
              console.log('Cost center name fetched:', name);
            } else {
              console.log('No name field found in cost center data');
            }
          } else {
            console.log('No cost center found with ID:', userContext.cost_center_id);
          }
        } catch (error) {
          console.error('Exception fetching cost center name:', error);
        }
      }
      
      console.log('Governance info fetched:', info);
      setGovernanceInfo(info);
    };
    
    fetchGovernanceNames();
  }, [userContext, supabase]);

  const onEdit = async (so: SalesOrder) => {
    setEditing(so);
    setOpen(true);
    setCustomerId(so.customer_id);
    setSONumber(so.so_number);
    setSODate(so.so_date);
    setDueDate(so.due_date || "");
    setNotes(so.notes || "");
    setTaxAmount(so.tax_amount || 0);
    const { data } = await supabase
      .from("sales_order_items")
      .select("id, product_id, description, quantity, unit_price, tax_rate, discount_percent, line_total")
      .eq("sales_order_id", so.id);
    setItems(data || []);
  };

  const onOpenNew = () => {
    setEditing(null);
    resetForm();
    setOpen(true);
    setSONumber(`SO-${Date.now()}`);
  };

  const saveSO = async () => {
    if (!customerId) {
      sonnerToast.error("الرجاء اختيار العميل");
      return;
    }
    if (!soNumber) {
      sonnerToast.error("رقم أمر البيع مطلوب");
      return;
    }
    setLoading(true);

    // الحصول على user_id الحالي
    const { data: { user } } = await supabase.auth.getUser();

    const payload: any = {
      customer_id: customerId,
      so_number: soNumber,
      so_date: soDate,
      due_date: dueDate || null,
      subtotal: Number(totals.subtotal.toFixed(2)),
      tax_amount: Number(taxAmount.toFixed(2)),
      total_amount: Number(totals.total.toFixed(2)),
      status: editing ? editing.status : "draft",
      notes: notes || null,
    };

    // إضافة created_by_user_id فقط عند الإنشاء الجديد
    if (!editing && user?.id) {
      payload.created_by_user_id = user.id;
    }

    let soId = editing?.id;
    if (editing) {
      const { error } = await supabase.from("sales_orders").update(payload).eq("id", editing.id);
      if (error) {
        toastActionError(toast, "التحديث", "أمر البيع", "تعذر تحديث أمر البيع");
        setLoading(false);
        return;
      }
      await supabase.from("sales_order_items").delete().eq("sales_order_id", editing.id);
      soId = editing.id;
    } else {
      const { data, error } = await supabase.from("sales_orders").insert(payload).select("id").single();
      if (error) {
        toastActionError(toast, "الإنشاء", "أمر البيع", "تعذر إنشاء أمر البيع");
        setLoading(false);
        return;
      }
      soId = data.id;
    }

    if (soId) {
      const rows = items.map((i) => ({
        sales_order_id: soId,
        product_id: i.product_id || null,
        description: i.description || null,
        quantity: i.quantity,
        unit_price: i.unit_price,
        tax_rate: i.tax_rate || 0,
        discount_percent: i.discount_percent || 0,
        line_total: i.line_total,
      }));
      const { error: ie } = await supabase.from("sales_order_items").insert(rows);
      if (ie) {
        sonnerToast.error("تم إنشاء أمر البيع بدون البنود لخطأ ما");
      }
    }

    toastActionSuccess(toast, editing ? "التحديث" : "الإنشاء", "أمر البيع");
    setOpen(false);
    resetForm();
    const { data: so } = await supabase
      .from("sales_orders")
      .select("id, company_id, customer_id, so_number, so_date, due_date, subtotal, tax_amount, total_amount, status, notes")
      .order("created_at", { ascending: false });
    setOrders(so || []);
    setLoading(false);
  };

  const convertToInvoice = async (so: SalesOrder) => {
    // 🔒 التحقق من النمط المحاسبي قبل التحويل
    if (so.invoice_id) {
      toast({
        title: appLang === 'en' ? 'Already Converted' : 'تم التحويل مسبقاً',
        description: appLang === 'en' ? 'This order is already linked to an invoice' : 'هذا الأمر مرتبط بفاتورة بالفعل',
        variant: 'destructive'
      });
      return;
    }

    if (so.status !== 'draft') {
      toast({
        title: appLang === 'en' ? 'Cannot Convert' : 'لا يمكن التحويل',
        description: appLang === 'en' ? 'Only draft orders can be converted to invoices' : 'يمكن تحويل أوامر المسودة فقط',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);

    setTimeout(async () => {
      const invPayload = {
        customer_id: so.customer_id,
        invoice_number: `INV-${Date.now()}`,
        invoice_date: new Date().toISOString().slice(0, 10),
        due_date: null,
        subtotal: so.subtotal,
        tax_amount: so.tax_amount,
        total_amount: so.total_amount || so.total,
        status: "draft",
        notes: so.notes || null,
        sales_order_id: so.id, // ربط الفاتورة بأمر البيع
        shipping_provider_id: so.shipping_provider_id, // نقل شركة الشحن
        // 🔐 ERP Access Control - ربط بالفرع ومركز التكلفة
        branch_id: userContext?.branch_id,
        cost_center_id: userContext?.cost_center_id,
        warehouse_id: userContext?.warehouse_id,
      } as any;
      // Attempt insertion aligned with existing invoices schema
      const { data: inv, error } = await supabase.from("invoices").insert(invPayload).select("id").single();
      if (error) {
        toast({ title: appLang === 'en' ? "Failed to convert to invoice" : "تعذر التحويل لفاتورة", variant: "destructive" });
        setLoading(false);
        return;
      }
      const { data: soItems } = await supabase
        .from("sales_order_items")
        .select("product_id, description, quantity, unit_price, tax_rate, discount_percent, line_total")
        .eq("sales_order_id", so.id);
      if (soItems && soItems.length) {
        const rows = soItems.map((i: any) => ({
          invoice_id: inv.id,
          product_id: i.product_id || null,
          description: i.description || null,
          quantity: i.quantity,
          unit_price: i.unit_price,
          tax_rate: i.tax_rate || 0,
          discount_percent: i.discount_percent || 0,
          line_total: i.line_total,
          returned_quantity: 0, // تهيئة الكمية المرتجعة
        }));
        await supabase.from("invoice_items").insert(rows);
      }
      // تحديث أمر البيع: حالة invoiced + ربط الفاتورة
      await supabase.from("sales_orders").update({
        status: "invoiced",
        invoice_id: inv.id
      }).eq("id", so.id);
      toastActionSuccess(toast, appLang === 'en' ? "Converted" : "التحويل", appLang === 'en' ? "to invoice" : "إلى فاتورة");
      const { data: list } = await supabase
        .from("sales_orders")
        .select("id, company_id, customer_id, so_number, so_date, due_date, subtotal, tax_amount, total_amount, total, status, notes, currency, invoice_id")
        .order("created_at", { ascending: false });
      setOrders(list || []);

      // تحديث قائمة الفواتير المرتبطة
      if (inv.id) {
        setLinkedInvoices(prev => ({
          ...prev,
          [inv.id]: { id: inv.id, status: 'draft' }
        }));
      }
      setLoading(false);
    }, 0);
  };

  const handleDeleteOrder = async () => {
    if (!orderToDelete) return;

    // 🔐 ERP Access Control - التحقق من صلاحية حذف هذا الأمر بالذات
    if (currentUserId) {
      const modResult = validateRecordModification(
        currentUserRole,
        currentUserId,
        orderToDelete.created_by_user_id || null,
        userContext?.branch_id || null,
        orderToDelete.branch_id || null,
        'delete',
        appLang
      );
      if (!modResult.isValid) {
        toast({
          title: modResult.error?.title || (appLang === 'en' ? 'Access Denied' : 'تم رفض الوصول'),
          description: modResult.error?.description || '',
          variant: 'destructive'
        });
        setDeleteConfirmOpen(false);
        setOrderToDelete(null);
        return;
      }
    }

    setLoading(true);
    try {
      // If there's a linked invoice (draft), delete it first
      if (orderToDelete.invoice_id) {
        const linkedInvoice = linkedInvoices[orderToDelete.invoice_id];
        if (linkedInvoice && linkedInvoice.status === 'draft') {
          // Delete invoice items first
          await supabase.from("invoice_items").delete().eq("invoice_id", orderToDelete.invoice_id);
          // Delete invoice
          await supabase.from("invoices").delete().eq("id", orderToDelete.invoice_id);
        }
      }
      // Delete sales order items
      await supabase.from("sales_order_items").delete().eq("sales_order_id", orderToDelete.id);
      // Delete sales order
      const { error } = await supabase.from("sales_orders").delete().eq("id", orderToDelete.id);
      if (error) throw error;
      toastActionSuccess(toast, appLang === 'en' ? "Deleted" : "الحذف", appLang === 'en' ? "Sales order" : "أمر البيع");
      setOrders(orders.filter(o => o.id !== orderToDelete.id));
    } catch (error) {
      toastActionError(toast, appLang === 'en' ? "Failed to delete" : "فشل الحذف");
    } finally {
      setDeleteConfirmOpen(false);
      setOrderToDelete(null);
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { bg: string; text: string; label: { ar: string; en: string } }> = {
      draft: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300', label: { ar: 'مسودة', en: 'Draft' } },
      sent: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', label: { ar: 'مُرسل', en: 'Sent' } },
      invoiced: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: { ar: 'تم التحويل لفاتورة', en: 'Invoiced' } },
      cancelled: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: { ar: 'ملغي', en: 'Cancelled' } },
      paid: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', label: { ar: 'مدفوع', en: 'Paid' } },
      partially_paid: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', label: { ar: 'مدفوع جزئياً', en: 'Partially Paid' } },
      overdue: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', label: { ar: 'متأخر', en: 'Overdue' } },
      returned: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', label: { ar: 'مرتجع بالكامل', en: 'Fully Returned' } },
      partially_returned: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300', label: { ar: 'مرتجع جزئياً', en: 'Partially Returned' } },
      fully_returned: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', label: { ar: 'مرتجع بالكامل', en: 'Fully Returned' } },
    };
    const config = statusConfig[status] || statusConfig.draft;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {appLang === 'en' ? config.label.en : config.label.ar}
      </span>
    );
  };

  if (!hydrated) return null;

  return (
    <div className={`flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 ${appLang === 'ar' ? 'rtl' : 'ltr'}`} dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
      <Sidebar />
      {/* Main Content */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        {/* ✅ Unified Page Header */}
        <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
          <PageHeaderList
            title={appLang === 'en' ? 'Sales Orders' : 'أوامر البيع'}
            description={appLang === 'en' ? 'Manage customer sales orders' : 'إدارة أوامر بيع العملاء'}
            icon={ShoppingCart}
            createHref={permWrite ? "/sales-orders/new" : undefined}
            createLabel={appLang === 'en' ? 'New Sales Order' : 'أمر بيع جديد'}
            createDisabled={!permWrite}
            createTitle={!permWrite ? (appLang === 'en' ? 'No permission to create sales orders' : 'لا توجد صلاحية لإنشاء أوامر بيع') : undefined}
            lang={appLang}
          />
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">
              {appLang === 'en' ? 'Total Orders' : 'إجمالي الأوامر'}
            </div>
            <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
          </Card>
          <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">
              {appLang === 'en' ? 'Draft' : 'مسودة'}
            </div>
            <div className="text-xl sm:text-2xl font-bold text-yellow-600">{stats.draft}</div>
          </Card>
          <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">
              {appLang === 'en' ? 'Invoiced' : 'تم فوترتها'}
            </div>
            <div className="text-xl sm:text-2xl font-bold text-blue-600">{stats.invoiced}</div>
          </Card>
          <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">
              {appLang === 'en' ? 'Paid' : 'مدفوعة'}
            </div>
            <div className="text-xl sm:text-2xl font-bold text-green-600">{stats.paid}</div>
          </Card>
          <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800 col-span-2 sm:col-span-1">
            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">
              {appLang === 'en' ? 'Total Value' : 'إجمالي القيمة'}
            </div>
            <div className="text-xl sm:text-2xl font-bold text-purple-600">
              {currencySymbols['EGP']}{stats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </Card>
        </div>

        {/* Filters Section */}
        <FilterContainer
          title={appLang === 'en' ? 'Filters' : 'الفلاتر'}
          activeCount={activeFilterCount}
          onClear={clearFilters}
          defaultOpen={false}
        >
          <div className="space-y-4">
            {/* فلتر الموظفين - صف منفصل أعلى الفلاتر - يظهر فقط للمديرين */}
            {canViewAllOrders && employees.length > 0 && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <UserCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  {appLang === 'en' ? 'Filter by Employee:' : 'فلترة حسب الموظف:'}
                </span>
                <Select
                  value={filterEmployeeId}
                  onValueChange={(value) => setFilterEmployeeId(value)}
                >
                  <SelectTrigger className="w-[220px] h-9 bg-white dark:bg-slate-800">
                    <SelectValue placeholder={appLang === 'en' ? 'All Employees' : 'جميع الموظفين'} />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="p-2 sticky top-0 bg-white dark:bg-slate-950 z-10 border-b">
                      <Input
                        value={employeeSearchQuery}
                        onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                        placeholder={appLang === 'en' ? 'Search employees...' : 'بحث في الموظفين...'}
                        className="text-sm h-8"
                        autoComplete="off"
                      />
                    </div>
                    <SelectItem value="all">
                      {appLang === 'en' ? '👥 All Employees' : '👥 جميع الموظفين'}
                    </SelectItem>
                    {employees
                      .filter(emp => {
                        if (!employeeSearchQuery.trim()) return true;
                        const q = employeeSearchQuery.toLowerCase();
                        return (
                          emp.display_name.toLowerCase().includes(q) ||
                          (emp.email || '').toLowerCase().includes(q) ||
                          emp.role.toLowerCase().includes(q)
                        );
                      })
                      .map((emp) => (
                        <SelectItem key={emp.user_id} value={emp.user_id}>
                          👤 {emp.display_name} <span className="text-xs text-gray-400">({emp.role})</span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {filterEmployeeId !== "all" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilterEmployeeId("all")}
                    className="h-8 px-3 text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                  >
                    <X className="w-4 h-4 mr-1" />
                    {appLang === 'en' ? 'Clear' : 'مسح'}
                  </Button>
                )}
              </div>
            )}

            {/* Search and Advanced Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Search */}
              <div className="sm:col-span-2 lg:col-span-2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder={appLang === 'en' ? 'Search by order #, customer name or phone...' : 'بحث برقم الأمر، اسم العميل أو الهاتف...'}
                    value={searchQuery}
                    onChange={(e) => {
                      const val = e.target.value
                      startTransition(() => setSearchQuery(val))
                    }}
                    className={`w-full h-10 px-4 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-700 text-sm ${isPending ? 'opacity-70' : ''}`}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => startTransition(() => setSearchQuery(""))}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Status Filter - Multi-select */}
              <MultiSelect
                options={statusOptions}
                selected={filterStatuses}
                onChange={(val) => startTransition(() => setFilterStatuses(val))}
                placeholder={appLang === 'en' ? 'All Statuses' : 'جميع الحالات'}
                searchPlaceholder={appLang === 'en' ? 'Search status...' : 'بحث في الحالات...'}
                emptyMessage={appLang === 'en' ? 'No status found' : 'لا توجد حالات'}
                className="h-10 text-sm"
              />

              {/* Customer Filter */}
              <MultiSelect
                options={customers.map((c) => ({ value: c.id, label: c.name }))}
                selected={filterCustomers}
                onChange={(val) => startTransition(() => setFilterCustomers(val))}
                placeholder={appLang === 'en' ? 'All Customers' : 'جميع العملاء'}
                searchPlaceholder={appLang === 'en' ? 'Search customers...' : 'بحث في العملاء...'}
                emptyMessage={appLang === 'en' ? 'No customers found' : 'لا يوجد عملاء'}
                className="h-10 text-sm"
              />

              {/* Products Filter */}
              <MultiSelect
                options={products.map((p) => ({ value: p.id, label: p.name }))}
                selected={filterProducts}
                onChange={(val) => startTransition(() => setFilterProducts(val))}
                placeholder={appLang === 'en' ? 'Filter by Products' : 'فلترة بالمنتجات'}
                searchPlaceholder={appLang === 'en' ? 'Search products...' : 'بحث في المنتجات...'}
                emptyMessage={appLang === 'en' ? 'No products found' : 'لا توجد منتجات'}
                className="h-10 text-sm"
              />

              {/* Shipping Company Filter */}
              <MultiSelect
                options={shippingProviders.map((p) => ({ value: p.id, label: p.provider_name }))}
                selected={filterShippingProviders}
                onChange={(val) => startTransition(() => setFilterShippingProviders(val))}
                placeholder={appLang === 'en' ? 'Shipping Company' : 'شركة الشحن'}
                searchPlaceholder={appLang === 'en' ? 'Search shipping...' : 'بحث في شركات الشحن...'}
                emptyMessage={appLang === 'en' ? 'No shipping companies' : 'لا توجد شركات شحن'}
                className="h-10 text-sm"
              />

              {/* Date From */}
              <div className="space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">
                  {appLang === 'en' ? 'From Date' : 'من تاريخ'}
                </label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    const val = e.target.value
                    startTransition(() => setDateFrom(val))
                  }}
                  className="h-10 text-sm"
                />
              </div>

              {/* Date To */}
              <div className="space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">
                  {appLang === 'en' ? 'To Date' : 'إلى تاريخ'}
                </label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    const val = e.target.value
                    startTransition(() => setDateTo(val))
                  }}
                  className="h-10 text-sm"
                />
              </div>
            </div>

            {/* عرض عدد النتائج */}
            {(filterStatuses.length > 0 || filterCustomers.length > 0 || filterProducts.length > 0 || filterShippingProviders.length > 0 || filterEmployeeId !== "all" || searchQuery || dateFrom || dateTo) && (
              <div className="flex justify-start items-center pt-2 border-t">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {appLang === 'en'
                    ? `Showing ${filteredOrders.length} of ${orders.length} orders`
                    : `عرض ${filteredOrders.length} من ${orders.length} أمر`}
                </span>
              </div>
            )}
          </div>
        </FilterContainer>

        {/* Orders Table */}
        <Card className="p-4 dark:bg-slate-900 dark:border-slate-800">
          {loading ? (
            <LoadingState type="table" rows={8} />
          ) : orders.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title={appLang === 'en' ? 'No sales orders yet' : 'لا توجد أوامر بيع بعد'}
              description={appLang === 'en' ? 'Create your first sales order to get started' : 'أنشئ أمر البيع الأول للبدء'}
              action={permWrite ? {
                label: appLang === 'en' ? 'Create Sales Order' : 'إنشاء أمر بيع',
                onClick: () => window.location.href = '/sales-orders/new',
                icon: Plus
              } : undefined}
            />
          ) : filteredOrders.length === 0 ? (
            <EmptyState
              icon={AlertCircle}
              title={appLang === 'en' ? 'No results found' : 'لا توجد نتائج'}
              description={appLang === 'en' ? 'Try adjusting your filters or search query' : 'حاول تعديل الفلاتر أو كلمة البحث'}
              action={{
                label: appLang === 'en' ? 'Clear Filters' : 'مسح الفلاتر',
                onClick: clearFilters
              }}
            />
          ) : (
            <>
              <DataTable
                columns={tableColumns}
                data={paginatedOrders}
                keyField="id"
                lang={appLang}
                minWidth="min-w-[640px]"
                emptyMessage={appLang === 'en' ? 'No sales orders found' : 'لا توجد أوامر بيع'}
                footer={{
                  render: () => {
                    const totalOrders = filteredOrders.length
                    // حساب إجمالي القيمة مع خصم المرتجعات من الفواتير المرتبطة
                    const totalAmount = filteredOrders.reduce((sum, o) => {
                      const orderTotal = o.total || o.total_amount || 0;
                      const linked = o.invoice_id ? linkedInvoices[o.invoice_id] : null;
                      const returnedAmount = linked?.returned_amount || 0;
                      return sum + (orderTotal - returnedAmount);
                    }, 0)

                    return (
                      <tr>
                        <td className="px-3 py-4 text-right" colSpan={tableColumns.length - 1}>
                          <span className="text-gray-700 dark:text-gray-200">
                            {appLang === 'en' ? 'Totals' : 'الإجماليات'} ({totalOrders} {appLang === 'en' ? 'orders' : 'أمر'})
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Total Value:' : 'إجمالي القيمة:'}</span>
                              <span className="text-blue-600 dark:text-blue-400 font-semibold">
                                {totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  }
                }}
              />
              {filteredOrders.length > 0 && (
                <DataPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  pageSize={pageSize}
                  onPageChange={goToPage}
                  onPageSizeChange={handlePageSizeChange}
                  lang={appLang}
                />
              )}
            </>
          )}
        </Card>

        {/* Edit Dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-3xl dark:bg-gray-800 dark:border-gray-700">
            <DialogHeader>
              <DialogTitle className="dark:text-white">{editing ? (appLang === 'en' ? "Edit Sales Order" : "تعديل أمر البيع") : (appLang === 'en' ? "New Sales Order" : "أمر بيع جديد")}</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs dark:text-gray-300">{appLang === 'en' ? 'Customer' : 'العميل'}</label>
                <CustomerSearchSelect
                  customers={customers}
                  value={customerId}
                  onValueChange={setCustomerId}
                  placeholder={appLang === 'en' ? 'Select customer' : 'اختر العميل'}
                  searchPlaceholder={appLang === 'en' ? 'Search by name or phone...' : 'ابحث بالاسم أو الهاتف...'}
                />
              </div>
              <div>
                <label className="text-xs dark:text-gray-300">{appLang === 'en' ? 'SO Number' : 'رقم أمر البيع'}</label>
                <Input value={soNumber} onChange={(e) => setSONumber(e.target.value)} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <label className="text-xs dark:text-gray-300">{appLang === 'en' ? 'Order Date' : 'تاريخ أمر البيع'}</label>
                <Input type="date" value={soDate} onChange={(e) => setSODate(e.target.value)} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <label className="text-xs dark:text-gray-300">{appLang === 'en' ? 'Due Date' : 'تاريخ الاستحقاق'}</label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs dark:text-gray-300">{appLang === 'en' ? 'Notes' : 'ملاحظات'}</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
              
              {/* 🔐 حقول الحوكمة للقراءة فقط */}
              {!editing && (
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t mt-2">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Branch' : 'الفرع'}</label>
                    <Input value={governanceInfo.branchName || '-'} disabled className="bg-gray-100 dark:bg-gray-800 text-gray-500 cursor-not-allowed h-8 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Warehouse' : 'المخزن'}</label>
                    <Input value={governanceInfo.warehouseName || '-'} disabled className="bg-gray-100 dark:bg-gray-800 text-gray-500 cursor-not-allowed h-8 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Cost Center' : 'مركز التكلفة'}</label>
                    <Input value={governanceInfo.costCenterName || '-'} disabled className="bg-gray-100 dark:bg-gray-800 text-gray-500 cursor-not-allowed h-8 text-sm" />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium dark:text-white">{appLang === 'en' ? 'Order Items' : 'بنود أمر البيع'}</h3>
                <Button variant="secondary" onClick={addItem}>{appLang === 'en' ? 'Add Item' : 'إضافة بند'}</Button>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left dark:text-gray-300">
                      <th>{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                      <th>{appLang === 'en' ? 'Description' : 'الوصف'}</th>
                      <th>{appLang === 'en' ? 'Qty' : 'الكمية'}</th>
                      <th>{appLang === 'en' ? 'Unit Price' : 'سعر الوحدة'}</th>
                      <th>{appLang === 'en' ? 'Disc%' : 'خصم %'}</th>
                      <th>{appLang === 'en' ? 'Tax%' : 'ضريبة %'}</th>
                      <th>{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                      <th>{appLang === 'en' ? 'Delete' : 'حذف'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={idx} className="border-t dark:border-gray-700">
                        <td>
                          <Select
                            value={it.product_id || ""}
                            onValueChange={(v) => {
                              const prod = products.find((p) => p.id === v);
                              updateItem(idx, { product_id: v, unit_price: prod?.unit_price || it.unit_price });
                            }}
                          >
                            <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"><SelectValue placeholder={appLang === 'en' ? 'Select item' : 'اختر الصنف'} /></SelectTrigger>
                            <SelectContent>
                              {products.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.item_type === 'service' ? '🔧 ' : '📦 '}{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td>
                          <Input value={it.description || ""} onChange={(e) => updateItem(idx, { description: e.target.value })} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                        </td>
                        <td>
                          <Input type="number" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                        </td>
                        <td>
                          <Input type="number" value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                        </td>
                        <td>
                          <Input type="number" value={it.discount_percent || 0} onChange={(e) => updateItem(idx, { discount_percent: Number(e.target.value) })} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                        </td>
                        <td>
                          <Input type="number" value={it.tax_rate || 0} onChange={(e) => updateItem(idx, { tax_rate: Number(e.target.value) })} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                        </td>
                        <td className="dark:text-white">{it.line_total.toFixed(2)}</td>
                        <td>
                          <Button variant="destructive" size="sm" onClick={() => removeItem(idx)}>{appLang === 'en' ? 'Delete' : 'حذف'}</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs dark:text-gray-300">{appLang === 'en' ? 'Total Tax' : 'ضريبة إجمالية'}</label>
                  <Input type="number" value={taxAmount} onChange={(e) => setTaxAmount(Number(e.target.value))} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div className="flex items-end text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Subtotal' : 'المجموع الفرعي'}: {totals.subtotal.toFixed(2)}</div>
                <div className="flex items-end font-bold text-gray-900 dark:text-white">{appLang === 'en' ? 'Total' : 'الإجمالي'}: {totals.total.toFixed(2)}</div>
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setOpen(false)} className="dark:border-gray-600 dark:text-gray-300">{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button onClick={saveSO} disabled={loading} className="bg-blue-600 hover:bg-blue-700">{editing ? (appLang === 'en' ? "Save" : "حفظ") : (appLang === 'en' ? "Create" : "إنشاء")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
            <DialogHeader>
              <DialogTitle className="dark:text-white flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" />
                {appLang === 'en' ? 'Confirm Delete' : 'تأكيد الحذف'}
              </DialogTitle>
            </DialogHeader>
            <p className="text-gray-600 dark:text-gray-400">
              {appLang === 'en'
                ? `Are you sure you want to delete sales order "${orderToDelete?.so_number}"? This action cannot be undone.`
                : `هل أنت متأكد من حذف أمر البيع "${orderToDelete?.so_number}"؟ لا يمكن التراجع عن هذا الإجراء.`
              }
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} className="dark:border-gray-600 dark:text-gray-300">
                {appLang === 'en' ? 'Cancel' : 'إلغاء'}
              </Button>
              <Button variant="destructive" onClick={handleDeleteOrder} disabled={loading}>
                {appLang === 'en' ? 'Delete' : 'حذف'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

export default function SalesOrdersPage() {
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
    } catch { }
  }, []);

  // عرض loading قبل hydration
  if (!hydrated) {
    return null
  }

  // التحقق من إعدادات Supabase قبل عرض المحتوى
  if (!isSupabaseConfigured()) {
    return <SupabaseConfigError lang={appLang} />
  }

  return <SalesOrdersContent />
}



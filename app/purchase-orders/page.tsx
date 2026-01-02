"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSupabase } from "@/lib/supabase/hooks";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
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
import { usePagination } from "@/lib/pagination";
import { DataPagination } from "@/components/data-pagination";
import { type UserContext, canViewPurchasePrices } from "@/lib/validation";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { StatusBadge } from "@/components/DataTableFormatters";
import { PageHeaderList } from "@/components/PageHeader";
import { OrderActions } from "@/components/OrderActions";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterContainer } from "@/components/ui/filter-container";

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
  total_amount?: number;
  paid_amount?: number;
  returned_amount?: number;
  return_status?: string;
};

// نوع لبنود الأمر مع المنتج
type POItemWithProduct = {
  purchase_order_id: string;
  quantity: number;
  product_id?: string | null;
  product_name?: string | null;
};

// نوع للكميات المرتجعة لكل منتج
type ReturnedQuantity = {
  bill_id: string;
  product_id: string;
  quantity: number;
};

// نوع لعرض ملخص المنتجات
type ProductSummary = { name: string; quantity: number; returned?: number };

export default function PurchaseOrdersPage() {
  const supabase = useSupabase();
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [orderItems, setOrderItems] = useState<POItemWithProduct[]>([]);
  const [returnedQuantities, setReturnedQuantities] = useState<ReturnedQuantity[]>([]);
  const [permRead, setPermRead] = useState(false);
  const [permWrite, setPermWrite] = useState(false);
  const [permUpdate, setPermUpdate] = useState(false);
  const [permDelete, setPermDelete] = useState(false);
  const [filterProducts, setFilterProducts] = useState<string[]>([]);
  const [filterShippingProviders, setFilterShippingProviders] = useState<string[]>([]);
  const [shippingProviders, setShippingProviders] = useState<{ id: string; provider_name: string }[]>([]);
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
  const [orderToDelete, setOrderToDelete] = useState<PurchaseOrder | null>(null);
  const [linkedBills, setLinkedBills] = useState<Record<string, LinkedBill>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);

  // 🚀 تحسين الأداء - استخدام useTransition للفلاتر
  const [isPending, startTransition] = useTransition();

  // 🔐 ERP Access Control - سياق المستخدم
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  const [canViewPrices, setCanViewPrices] = useState(false);
  const [filterSuppliers, setFilterSuppliers] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Pagination state
  const [pageSize, setPageSize] = useState<number>(10);

  // Status options for multi-select
  const statusOptions = [
    { value: "draft", label: appLang === 'en' ? "Draft" : "مسودة" },
    { value: "sent", label: appLang === 'en' ? "Sent" : "مُرسل" },
    { value: "received", label: appLang === 'en' ? "Received" : "مُستلم" },
    { value: "billed", label: appLang === 'en' ? "Billed" : "تم التحويل" },
    { value: "paid", label: appLang === 'en' ? "Paid" : "مدفوع" },
    { value: "partially_paid", label: appLang === 'en' ? "Partially Paid" : "مدفوع جزئياً" },
    { value: "returned", label: appLang === 'en' ? "Returned" : "مرتجع" },
    { value: "fully_returned", label: appLang === 'en' ? "Fully Returned" : "مرتجع بالكامل" },
    { value: "cancelled", label: appLang === 'en' ? "Cancelled" : "ملغي" },
  ];

  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
  };

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

      // 🔐 ERP Access Control - جلب سياق المستخدم
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: member } = await supabase
        .from("company_members")
        .select("role, branch_id, cost_center_id, warehouse_id")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .single();

      const role = member?.role || "staff";
      const context: UserContext = {
        user_id: user.id,
        company_id: companyId,
        branch_id: member?.branch_id || null,
        cost_center_id: member?.cost_center_id || null,
        warehouse_id: member?.warehouse_id || null,
        role: role
      };
      setUserContext(context);
      setCanViewPrices(canViewPurchasePrices(context));

      const canOverride = ["owner", "admin", "manager"].includes(role);

      const { data: supp } = await supabase.from("suppliers").select("id, name, phone").eq("company_id", companyId).order("name");
      setSuppliers(supp || []);
      const { data: prod } = await supabase.from("products").select("id, name, cost_price, item_type").eq("company_id", companyId).order("name");
      setProducts(prod || []);

      // 🔐 ERP Access Control - تصفية أوامر الشراء حسب الفرع ومركز التكلفة
      let poQuery = supabase
        .from("purchase_orders")
        .select("id, company_id, supplier_id, po_number, po_date, due_date, subtotal, tax_amount, total_amount, total, status, notes, currency, bill_id, branch_id, cost_center_id, warehouse_id, suppliers(name, phone)")
        .eq("company_id", companyId);

      // تطبيق فلترة الصلاحيات للأدوار غير المديرة
      if (!canOverride) {
        if (member?.branch_id) {
          poQuery = poQuery.eq("branch_id", member.branch_id);
        }
        if (member?.cost_center_id) {
          poQuery = poQuery.eq("cost_center_id", member.cost_center_id);
        }
      }

      const { data: po } = await poQuery.order("created_at", { ascending: false });
      setOrders(po || []);

      // Load linked bills with full details
      const billIds = (po || []).filter((o: PurchaseOrder) => o.bill_id).map((o: PurchaseOrder) => o.bill_id);
      if (billIds.length > 0) {
        const { data: bills } = await supabase
          .from("bills")
          .select("id, status, total_amount, paid_amount, returned_amount, return_status")
          .in("id", billIds);
        const billMap: Record<string, LinkedBill> = {};
        (bills || []).forEach((b: any) => {
          billMap[b.id] = {
            id: b.id,
            status: b.status,
            total_amount: b.total_amount || 0,
            paid_amount: b.paid_amount || 0,
            returned_amount: b.returned_amount || 0,
            return_status: b.return_status
          };
        });
        setLinkedBills(billMap);
      }

      // تحميل بنود الأوامر مع أسماء المنتجات و product_id للفلترة
      const orderIds = (po || []).map((o: PurchaseOrder) => o.id);
      if (orderIds.length > 0) {
        const { data: itemsData } = await supabase
          .from("purchase_order_items")
          .select("purchase_order_id, quantity, product_id")
          .in("purchase_order_id", orderIds);

        // جلب أسماء المنتجات منفصلة وربطها
        const productIds = [...new Set((itemsData || []).map(i => i.product_id).filter(Boolean))];
        let productNames: Record<string, string> = {};
        if (productIds.length > 0) {
          const { data: productsData } = await supabase
            .from("products")
            .select("id, name")
            .in("id", productIds);
          productNames = (productsData || []).reduce((acc, p) => {
            acc[p.id] = p.name;
            return acc;
          }, {} as Record<string, string>);
        }

        // دمج أسماء المنتجات مع البنود
        const itemsWithNames = (itemsData || []).map(item => ({
          ...item,
          product_name: item.product_id ? productNames[item.product_id] : null
        }));
        setOrderItems(itemsWithNames);
      }

      // تحميل شركات الشحن
      const { data: providersData } = await supabase
        .from("shipping_providers")
        .select("id, provider_name")
        .order("provider_name");
      setShippingProviders(providersData || []);

      // تحميل الكميات المرتجعة من bill_items.returned_quantity عبر الفواتير المرتبطة
      const linkedBillIds = (po || []).map((o: PurchaseOrder) => o.bill_id).filter(Boolean);
      if (linkedBillIds.length > 0) {
        const { data: billItemsData } = await supabase
          .from("bill_items")
          .select("bill_id, product_id, returned_quantity")
          .in("bill_id", linkedBillIds)
          .gt("returned_quantity", 0);

        // ربط الكميات المرتجعة بالفواتير
        const returnedQty: ReturnedQuantity[] = (billItemsData || []).map(item => ({
          bill_id: item.bill_id || '',
          product_id: item.product_id || '',
          quantity: item.returned_quantity || 0
        })).filter(r => r.bill_id && r.product_id && r.quantity > 0);
        setReturnedQuantities(returnedQty);
      } else {
        setReturnedQuantities([]);
      }

      setLoading(false);
    };
    load();
  }, [supabase]);

  // دالة للحصول على ملخص المنتجات لأمر معين مع الكميات المرتجعة
  const getProductsSummary = (orderId: string, billId?: string | null): ProductSummary[] => {
    const items = orderItems.filter(item => item.purchase_order_id === orderId);
    return items.map(item => {
      // حساب الكمية المرتجعة لهذا المنتج من هذه الفاتورة
      const returnedQty = billId && item.product_id
        ? returnedQuantities
          .filter(r => r.bill_id === billId && r.product_id === item.product_id)
          .reduce((sum, r) => sum + r.quantity, 0)
        : 0;
      return {
        name: item.product_name || '-',
        quantity: item.quantity,
        returned: returnedQty > 0 ? returnedQty : undefined
      };
    });
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // Status filter - Multi-select
      if (filterStatuses.length > 0) {
        const linkedBill = o.bill_id ? linkedBills[o.bill_id] : null;
        const displayStatus = linkedBill ? linkedBill.status : o.status;
        if (!filterStatuses.includes(displayStatus)) return false;
      }

      // Supplier filter - Multi-select
      if (filterSuppliers.length > 0 && !filterSuppliers.includes(o.supplier_id)) return false;

      // Products filter - show orders containing any of the selected products
      if (filterProducts.length > 0) {
        const orderProductIds = orderItems
          .filter(item => item.purchase_order_id === o.id)
          .map(item => item.product_id)
          .filter(Boolean) as string[];
        const hasSelectedProduct = filterProducts.some(productId => orderProductIds.includes(productId));
        if (!hasSelectedProduct) return false;
      }

      // Shipping provider filter
      if (filterShippingProviders.length > 0) {
        const orderProviderId = (o as any).shipping_provider_id;
        if (!orderProviderId || !filterShippingProviders.includes(orderProviderId)) return false;
      }

      // Date range filter
      if (dateFrom && o.po_date < dateFrom) return false;
      if (dateTo && o.po_date > dateTo) return false;

      // Search filter
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return o.po_number?.toLowerCase().includes(term) ||
        o.suppliers?.name?.toLowerCase().includes(term);
    });
  }, [orders, filterStatuses, filterSuppliers, filterProducts, filterShippingProviders, orderItems, searchTerm, dateFrom, dateTo, linkedBills]);

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

  // تعريف أعمدة الجدول
  const tableColumns: DataTableColumn<PurchaseOrder>[] = useMemo(() => [
    {
      key: 'po_number',
      header: appLang === 'en' ? 'PO No.' : 'رقم الأمر',
      type: 'text',
      align: 'left',
      width: 'min-w-[120px]',
      format: (value) => (
        <span className="font-medium text-blue-600 dark:text-blue-400">{value}</span>
      )
    },
    {
      key: 'supplier_id',
      header: appLang === 'en' ? 'Supplier' : 'المورد',
      type: 'text',
      align: 'left',
      format: (_, row) => (row as any).suppliers?.name || '-'
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Products' : 'المنتجات',
      type: 'custom',
      align: 'left',
      hidden: 'lg',
      width: 'max-w-[200px]',
      format: (_, row) => {
        const summary = getProductsSummary(row.id, row.bill_id);
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
      key: 'po_date',
      header: appLang === 'en' ? 'Date' : 'التاريخ',
      type: 'date',
      align: 'right',
      hidden: 'sm',
      format: (value) => value || '-'
    },
    {
      key: 'total_amount',
      header: appLang === 'en' ? 'Total' : 'المجموع',
      type: 'currency',
      align: 'right',
      format: (_, row) => {
        // 🔐 ERP Access Control: إخفاء الإجمالي للموظفين
        if (!canViewPrices) return '-';
        const total = row.total_amount || 0;
        const symbol = currencySymbols[row.currency || 'SAR'] || row.currency || 'SAR';
        const linkedBill = row.bill_id ? linkedBills[row.bill_id] : null;

        // إذا كانت هناك فاتورة مرتبطة بها مرتجعات، نعرض التفاصيل
        if (linkedBill && (linkedBill.returned_amount || 0) > 0) {
          const returnedAmount = linkedBill.returned_amount || 0;
          const paidAmount = linkedBill.paid_amount || 0;
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
        if (linkedBill && (linkedBill.paid_amount || 0) > 0) {
          const paidAmount = linkedBill.paid_amount || 0;
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
        const providerId = (row as any).shipping_provider_id;
        if (!providerId) return '-';
        return shippingProviders.find(p => p.id === providerId)?.provider_name || '-';
      }
    },
    {
      key: 'status',
      header: appLang === 'en' ? 'Status' : 'الحالة',
      type: 'status',
      align: 'center',
      format: (_, row) => {
        const linkedBill = row.bill_id ? linkedBills[row.bill_id] : null;
        // إذا مرتبط بفاتورة: نعرض حالة أمر الشراء "billed" + حالة الفاتورة + المرتجعات
        if (linkedBill || row.bill_id) {
          const orderStatus = row.bill_id ? 'billed' : row.status;
          const hasReturns = linkedBill && (linkedBill.returned_amount || 0) > 0;
          const returnStatus = linkedBill?.return_status;

          // تحديد نص حالة الفاتورة
          const getBillStatusText = () => {
            if (returnStatus === 'full') return appLang === 'en' ? 'Fully Returned' : 'مرتجع كامل';
            if (returnStatus === 'partial') return appLang === 'en' ? 'Partial Return' : 'مرتجع جزئي';
            if (linkedBill?.status === 'paid') return appLang === 'en' ? 'Paid' : 'مدفوعة';
            if (linkedBill?.status === 'partially_paid') return appLang === 'en' ? 'Partial' : 'جزئي';
            if (linkedBill?.status === 'draft') return appLang === 'en' ? 'Draft' : 'مسودة';
            if (linkedBill?.status === 'sent') return appLang === 'en' ? 'Sent' : 'مرسلة';
            return linkedBill?.status || '';
          };

          // تحديد لون حالة الفاتورة
          const getBillStatusColor = () => {
            if (returnStatus === 'full') return 'text-red-600 dark:text-red-400';
            if (returnStatus === 'partial') return 'text-orange-600 dark:text-orange-400';
            if (linkedBill?.status === 'paid') return 'text-green-600 dark:text-green-400';
            if (linkedBill?.status === 'partially_paid') return 'text-yellow-600 dark:text-yellow-400';
            return 'text-gray-600 dark:text-gray-400';
          };

          return (
            <div className="flex flex-col items-center gap-0.5">
              <StatusBadge status={orderStatus} lang={appLang} />
              {linkedBill && (
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  {appLang === 'en' ? 'Bill:' : 'الفاتورة:'}
                  <span className={`mx-1 ${getBillStatusColor()}`}>
                    {getBillStatusText()}
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
        const linkedBill = row.bill_id ? linkedBills[row.bill_id] : null;
        const displayStatus = linkedBill ? linkedBill.status : row.status;

        return (
          <OrderActions
            orderId={row.id}
            orderType="purchase"
            orderStatus={row.status}
            invoiceId={row.bill_id}
            invoiceStatus={displayStatus}
            hasPayments={displayStatus === 'paid' || displayStatus === 'partially_paid'}
            onDelete={() => { setOrderToDelete(row); setDeleteConfirmOpen(true); }}
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
  ], [appLang, linkedBills, permRead, permUpdate, permDelete, permWrite, orderItems, returnedQuantities]);

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

  // Statistics - تعمل مع الفلترة
  const stats = useMemo(() => {
    const total = filteredOrders.length;
    const draft = filteredOrders.filter(o => o.status === 'draft').length;
    const sent = filteredOrders.filter(o => o.status === 'sent').length;
    const billed = filteredOrders.filter(o => o.status === 'billed').length;
    // حساب إجمالي القيمة مع خصم المرتجعات من الفواتير المرتبطة
    const totalValue = filteredOrders.reduce((sum, o) => {
      const orderTotal = o.total || o.total_amount || 0;
      const linked = o.bill_id ? linkedBills[o.bill_id] : null;
      // إذا كانت هناك فاتورة مرتبطة بمرتجعات، نخصم المرتجع
      const returnedAmount = linked?.returned_amount || 0;
      return sum + (orderTotal - returnedAmount);
    }, 0);
    return { total, draft, sent, billed, totalValue };
  }, [filteredOrders, linkedBills]);

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
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang === 'en' ? 'Purchase Orders' : 'أوامر الشراء'}</h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang === 'en' ? 'Manage purchase orders' : 'إدارة أوامر الشراء'}</p>
                </div>
              </div>
              {permWrite && (
                <Link href="/purchase-orders/new">
                  <Button className="bg-orange-600 hover:bg-orange-700 h-10 sm:h-11 text-sm sm:text-base px-3 sm:px-4">
                    <Plus className="w-4 h-4 ml-1 sm:ml-2" />
                    {appLang === 'en' ? 'New Order' : 'أمر جديد'}
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <Card className="p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4"><CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Total' : 'الإجمالي'}</CardTitle></CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0"><div className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div></CardContent>
            </Card>
            <Card className="p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4"><CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Draft' : 'مسودة'}</CardTitle></CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0"><div className="text-lg sm:text-2xl font-bold text-gray-500">{stats.draft}</div></CardContent>
            </Card>
            <Card className="p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4"><CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Sent' : 'مُرسل'}</CardTitle></CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0"><div className="text-lg sm:text-2xl font-bold text-blue-600">{stats.sent}</div></CardContent>
            </Card>
            <Card className="p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4"><CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Billed' : 'تم التحويل'}</CardTitle></CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0"><div className="text-lg sm:text-2xl font-bold text-purple-600">{stats.billed}</div></CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                {/* Search */}
                <div className="sm:col-span-2 lg:col-span-2">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={appLang === 'en' ? 'Search by order #, supplier name...' : 'بحث برقم الأمر، اسم المورد...'}
                      value={searchTerm}
                      onChange={(e) => {
                        const val = e.target.value
                        startTransition(() => setSearchTerm(val))
                      }}
                      className={`w-full h-10 px-4 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 dark:bg-slate-800 dark:border-slate-700 text-sm ${isPending ? 'opacity-70' : ''}`}
                    />
                    {searchTerm && (
                      <button
                        onClick={() => startTransition(() => setSearchTerm(""))}
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

                {/* Supplier Filter - Multi-select */}
                <MultiSelect
                  options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                  selected={filterSuppliers}
                  onChange={(val) => startTransition(() => setFilterSuppliers(val))}
                  placeholder={appLang === 'en' ? 'All Suppliers' : 'جميع الموردين'}
                  searchPlaceholder={appLang === 'en' ? 'Search suppliers...' : 'بحث في الموردين...'}
                  emptyMessage={appLang === 'en' ? 'No suppliers found' : 'لا يوجد موردين'}
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

              {/* Clear Filters */}
              {(filterStatuses.length > 0 || filterSuppliers.length > 0 || filterProducts.length > 0 || filterShippingProviders.length > 0 || searchTerm || dateFrom || dateTo) && (
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => { setFilterStatuses([]); setFilterSuppliers([]); setFilterProducts([]); setFilterShippingProviders([]); setSearchTerm(""); setDateFrom(""); setDateTo(""); }} className="text-xs text-red-500 hover:text-red-600">
                    {appLang === 'en' ? 'Clear All Filters' : 'مسح جميع الفلاتر'} ✕
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* Table */}
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <LoadingState type="table" rows={8} />
              ) : filteredOrders.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title={appLang === 'en' ? 'No purchase orders yet' : 'لا توجد أوامر شراء بعد'}
                  description={appLang === 'en' ? 'Create your first purchase order to get started' : 'أنشئ أمر الشراء الأول للبدء'}
                  action={permWrite ? {
                    label: appLang === 'en' ? 'Create Purchase Order' : 'إنشاء أمر شراء',
                    onClick: () => router.push('/purchase-orders/new'),
                    icon: Plus
                  } : undefined}
                />
              ) : (
                <>
                  <DataTable
                    columns={tableColumns}
                    data={paginatedOrders}
                    keyField="id"
                    lang={appLang}
                    minWidth="min-w-[640px]"
                    emptyMessage={appLang === 'en' ? 'No purchase orders found' : 'لا توجد أوامر شراء'}
                    footer={{
                      render: () => {
                        const totalOrders = filteredOrders.length
                        // حساب إجمالي القيمة مع خصم المرتجعات من الفواتير المرتبطة
                        const totalAmount = filteredOrders.reduce((sum, o) => {
                          const orderTotal = o.total || o.total_amount || 0;
                          const linked = o.bill_id ? linkedBills[o.bill_id] : null;
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
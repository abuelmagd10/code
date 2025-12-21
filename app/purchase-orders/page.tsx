"use client";

import { useEffect, useMemo, useState } from "react";
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

// نوع لبنود الأمر مع المنتج
type POItemWithProduct = {
  purchase_order_id: string;
  quantity: number;
  product_id?: string | null;
  products?: { name: string } | null;
};

// نوع لعرض ملخص المنتجات
type ProductSummary = { name: string; quantity: number };

export default function PurchaseOrdersPage() {
  const supabase = useSupabase();
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [orderItems, setOrderItems] = useState<POItemWithProduct[]>([]);
  const [permRead, setPermRead] = useState(false);
  const [permWrite, setPermWrite] = useState(false);
  const [permUpdate, setPermUpdate] = useState(false);
  const [permDelete, setPermDelete] = useState(false);
  const [filterProducts, setFilterProducts] = useState<string[]>([]);
  const [filterShippingProviders, setFilterShippingProviders] = useState<string[]>([]);
  const [shippingProviders, setShippingProviders] = useState<{ id: string; provider_name: string }[]>([]);
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
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
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

      // Load linked bills status
      const billIds = (po || []).filter((o: PurchaseOrder) => o.bill_id).map((o: PurchaseOrder) => o.bill_id);
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

      // تحميل بنود الأوامر مع أسماء المنتجات و product_id للفلترة
      const orderIds = (po || []).map((o: PurchaseOrder) => o.id);
      if (orderIds.length > 0) {
        const { data: itemsData } = await supabase
          .from("purchase_order_items")
          .select("purchase_order_id, quantity, product_id, products(name)")
          .in("purchase_order_id", orderIds);
        setOrderItems(itemsData || []);
      }

      // تحميل شركات الشحن
      const { data: providersData } = await supabase
        .from("shipping_providers")
        .select("id, provider_name")
        .order("provider_name");
      setShippingProviders(providersData || []);

      setLoading(false);
    };
    load();
  }, [supabase]);

  // دالة للحصول على ملخص المنتجات لأمر معين
  const getProductsSummary = (orderId: string): ProductSummary[] => {
    const items = orderItems.filter(item => item.purchase_order_id === orderId);
    return items.map(item => ({
      name: item.products?.name || '-',
      quantity: item.quantity
    }));
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
    const totalValue = filteredOrders.reduce((sum, o) => sum + (o.total || o.total_amount || 0), 0);
    return { total, draft, sent, billed, totalValue };
  }, [filteredOrders]);

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
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full h-10 px-4 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 dark:bg-slate-800 dark:border-slate-700 text-sm"
                    />
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm("")}
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
                  onChange={setFilterStatuses}
                  placeholder={appLang === 'en' ? 'All Statuses' : 'جميع الحالات'}
                  searchPlaceholder={appLang === 'en' ? 'Search status...' : 'بحث في الحالات...'}
                  emptyMessage={appLang === 'en' ? 'No status found' : 'لا توجد حالات'}
                  className="h-10 text-sm"
                />

                {/* Supplier Filter - Multi-select */}
                <MultiSelect
                  options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                  selected={filterSuppliers}
                  onChange={setFilterSuppliers}
                  placeholder={appLang === 'en' ? 'All Suppliers' : 'جميع الموردين'}
                  searchPlaceholder={appLang === 'en' ? 'Search suppliers...' : 'بحث في الموردين...'}
                  emptyMessage={appLang === 'en' ? 'No suppliers found' : 'لا يوجد موردين'}
                  className="h-10 text-sm"
                />

                {/* Products Filter */}
                <MultiSelect
                  options={products.map((p) => ({ value: p.id, label: p.name }))}
                  selected={filterProducts}
                  onChange={setFilterProducts}
                  placeholder={appLang === 'en' ? 'Filter by Products' : 'فلترة بالمنتجات'}
                  searchPlaceholder={appLang === 'en' ? 'Search products...' : 'بحث في المنتجات...'}
                  emptyMessage={appLang === 'en' ? 'No products found' : 'لا توجد منتجات'}
                  className="h-10 text-sm"
                />

                {/* Shipping Company Filter */}
                <MultiSelect
                  options={shippingProviders.map((p) => ({ value: p.id, label: p.provider_name }))}
                  selected={filterShippingProviders}
                  onChange={setFilterShippingProviders}
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
                    onChange={(e) => setDateFrom(e.target.value)}
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
                    onChange={(e) => setDateTo(e.target.value)}
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
                <p className="py-8 text-center">{appLang==='en' ? 'Loading...' : 'جاري التحميل...'}</p>
              ) : filteredOrders.length === 0 ? (
                <p className="py-8 text-center text-gray-500 dark:text-gray-400">{appLang==='en' ? 'No purchase orders' : 'لا توجد أوامر شراء'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[640px] w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-800">
                      <tr>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang==='en' ? 'PO No.' : 'رقم الأمر'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang==='en' ? 'Supplier' : 'المورد'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden lg:table-cell">{appLang==='en' ? 'Products' : 'المنتجات'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden sm:table-cell">{appLang==='en' ? 'Date' : 'التاريخ'}</th>
                        {/* 🔐 ERP Access Control: إخفاء الإجمالي للموظفين */}
                        {canViewPrices && <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang==='en' ? 'Total' : 'الإجمالي'}</th>}
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden lg:table-cell">{appLang==='en' ? 'Shipping' : 'الشحن'}</th>
                        <th className="px-3 py-3 text-center font-semibold text-gray-900 dark:text-white">{appLang==='en' ? 'Status' : 'الحالة'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang==='en' ? 'Actions' : 'إجراءات'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedOrders.map((po) => {
                        const linkedBill = po.bill_id ? linkedBills[po.bill_id] : null;
                        const canEditDelete = !linkedBill || linkedBill.status === 'draft';
                        const symbol = currencySymbols[po.currency || 'SAR'] || po.currency || 'SAR';
                        const productsSummary = getProductsSummary(po.id);
                        // عرض حالة الفاتورة إذا كانت موجودة، وإلا عرض حالة أمر الشراء
                        const displayStatus = linkedBill ? linkedBill.status : po.status;
                        return (
                          <tr key={po.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                            <td className="px-3 py-3 font-medium text-blue-600 dark:text-blue-400">{po.po_number}</td>
                            <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{po.suppliers?.name || '-'}</td>
                            <td className="px-3 py-3 text-gray-600 dark:text-gray-400 hidden lg:table-cell max-w-[200px]">
                              {productsSummary.length > 0 ? (
                                <div className="text-xs space-y-0.5">
                                  {productsSummary.slice(0, 3).map((p, idx) => (
                                    <div key={idx} className="truncate">
                                      {p.name} — <span className="font-medium">{p.quantity}</span>
                                    </div>
                                  ))}
                                  {productsSummary.length > 3 && (
                                    <div className="text-gray-400">+{productsSummary.length - 3} {appLang === 'en' ? 'more' : 'أخرى'}</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-gray-600 dark:text-gray-400 hidden sm:table-cell">{new Date(po.po_date).toLocaleDateString(appLang==='en' ? 'en' : 'ar')}</td>
                            {/* 🔐 ERP Access Control: إخفاء الإجمالي للموظفين */}
                            {canViewPrices && <td className="px-3 py-3 font-medium text-gray-900 dark:text-white">{symbol}{Number(po.total_amount || po.total || 0).toFixed(2)}</td>}
                            <td className="px-3 py-3 text-gray-600 dark:text-gray-400 hidden lg:table-cell text-xs">
                              {(po as any).shipping_provider_id ? (
                                shippingProviders.find(p => p.id === (po as any).shipping_provider_id)?.provider_name || '-'
                              ) : '-'}
                            </td>
                            <td className="px-3 py-3 text-center">{getStatusBadge(displayStatus)}</td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-1">
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
                  {/* Pagination */}
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
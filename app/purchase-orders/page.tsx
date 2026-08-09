"use client";

import { attachProductCosts } from "@/lib/product-costs"
import { useEffect, useMemo, useState, useTransition, useCallback, useRef } from "react";
import { useSupabase } from "@/lib/supabase/hooks";
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
import { ERPPageHeader } from "@/components/erp-page-header";
import { canAction } from "@/lib/authz";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getActiveCompanyId } from "@/lib/company";
// ⚡ v2: Server-side pagination (الـ hook القديم usePagination محفوظ في lib/pagination.ts دون تغيير)
import { buildPaginatedUrl } from "@/lib/server-pagination";
import { DataPagination } from "@/components/data-pagination";
// v3.74.938 — `canViewPurchasePrices` كانت تُقرَّر من جدول أدوارٍ محلىٍّ فى
// `lib/validation.ts`. وهذا **بيتٌ ثانٍ لنفس القاعدة** — وهو ما مُنع فى 934
// حين حُذف `isUpperRole` من شاشة المنتجات. القاعدةُ واحدةٌ فى القاعدة
// (`can_view_purchase_cost`)، وما يُعرض يُقرَّر من البيانات نفسها: المبلغُ
// المحجوب يصل `null` فيُعرض «—».
import { type UserContext, getAccessFilter } from "@/lib/validation";
import { sumOrHidden, isHiddenMoney, rowMoneyHidden, HIDDEN_MONEY, HIDDEN_MONEY_HINT_AR, HIDDEN_MONEY_HINT_EN } from "@/lib/purchase-money";
import { buildDataVisibilityFilter, applyDataVisibilityFilter, canAccessDocument, canCreateDocument } from "@/lib/data-visibility-control";
import { useBranchFilter } from "@/hooks/use-branch-filter";
import { BranchFilter } from "@/components/BranchFilter";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { StatusBadge } from "@/components/DataTableFormatters";
import { PageHeaderList } from "@/components/PageHeader";
import { OrderActions } from "@/components/OrderActions";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterContainer } from "@/components/ui/filter-container";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { getCachedPage, setCachedPage, invalidateCache, prefetchPage } from "@/lib/page-cache";
// 🏷️ Canonical shared types — Single Source of Truth
import type {
  PurchaseOrder,
  Supplier,
  LinkedBill,
  POItemWithProduct,
  ReturnedQuantity,
  ProductSummary,
} from "@/types/database";

// نوع المنتج (خاص بهذه الصفحة — لا يُشارَك)
type Product = { id: string; name: string; cost_price?: number; item_type?: 'product' | 'service' };

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
  // v3.74.938 — مبالغُ الفاتورة المرتبطة قد تصل محجوبةً (`null`). والنوعُ
  // المشترك يعدها أرقاماً دائماً، فلو تُركت كما هى لكتب `|| 0` صفراً كاذباً.
  type LinkedBillMasked = Omit<LinkedBill, 'total_amount' | 'paid_amount' | 'returned_amount'> & {
    total_amount: number | null; paid_amount: number | null; returned_amount: number | null
  };
  const [linkedBills, setLinkedBills] = useState<Record<string, LinkedBillMasked>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);

  // 🚀 تحسين الأداء - استخدام useTransition للفلاتر
  const [isPending, startTransition] = useTransition();

  // 🔐 ERP Access Control - سياق المستخدم
  const [userContext, setUserContext] = useState<UserContext | null>(null);

  // 🔐 فلتر الفروع الموحد - يظهر فقط للأدوار المميزة (Owner/Admin/General Manager)
  const branchFilter = useBranchFilter();
  const [filterSuppliers, setFilterSuppliers] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // ⚡ Server-Side Pagination State
  const [pageSize, setPageSize] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [serverLoading, setServerLoading] = useState<boolean>(false);
  // ref لإلغاء الطلبات القديمة عند التنقل السريع
  const fetchAbortRef = useRef<AbortController | null>(null);

  // Status options for multi-select - قائمة ثابتة بجميع الحالات الممكنة
  const allStatusOptions = useMemo(() => [
    { value: "draft", label: appLang === 'en' ? "Draft" : "مسودة" },
    { value: "pending_approval", label: appLang === 'en' ? "Pending Approval" : "في انتظار الموافقة" },
    { value: "approved", label: appLang === 'en' ? "Approved" : "معتمد" },
    { value: "sent_to_vendor", label: appLang === 'en' ? "Sent to Vendor" : "تم الإرسال للمورد" },
    { value: "partially_received", label: appLang === 'en' ? "Partially Received" : "مستلم جزئياً" },
    { value: "received", label: appLang === 'en' ? "Received" : "تم الاستلام" },
    { value: "billed", label: appLang === 'en' ? "Billed" : "مفوتر بالكامل" },
    { value: "closed", label: appLang === 'en' ? "Closed" : "مغلق" },
    { value: "rejected", label: appLang === 'en' ? "Rejected" : "مرفوض" },
    { value: "paid", label: appLang === 'en' ? "Paid" : "مدفوع" },
    { value: "partially_paid", label: appLang === 'en' ? "Partially Paid" : "مدفوع جزئياً" },
    { value: "returned", label: appLang === 'en' ? "Returned" : "مرتجع" },
    { value: "fully_returned", label: appLang === 'en' ? "Fully Returned" : "مرتجع بالكامل" },
    { value: "cancelled", label: appLang === 'en' ? "Cancelled" : "ملغي" },
  ], [appLang]);

  // ✅ قائمة الحالات المتاحة بناءً على البيانات الفعلية للشركة
  const statusOptions = useMemo(() => {
    // جمع جميع الحالات الفعلية من الأوامر
    const availableStatuses = new Set<string>();

    orders.forEach((order) => {
      // استخدام حالة الفاتورة المرتبطة إذا كانت موجودة، وإلا استخدام حالة الأمر
      const linkedBill = order.bill_id ? linkedBills[order.bill_id] : null;
      const displayStatus = linkedBill ? linkedBill.status : order.status;

      availableStatuses.add(displayStatus);

      // إضافة حالة الأمر نفسه أيضاً
      availableStatuses.add(order.status);
    });

    // إرجاع فقط الحالات المتاحة من القائمة الكاملة
    return allStatusOptions.filter(opt => availableStatuses.has(opt.value));
  }, [orders, linkedBills, allStatusOptions]);

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

  // ⚡ دالة جلب بيانات جانبية (موردون، منتجات، شركات الشحن) — تُستدعى مرة واحدة عند التحميل الأول
  const loadSupportingData = useCallback(async () => {
    const companyId = await getActiveCompanyId(supabase);
    if (!companyId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

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

    const accessFilter = getAccessFilter(role, user.id, member?.branch_id || null, member?.cost_center_id || null);

    // ⚡ Parallel Fetching: جلب كل البيانات الجانبية بالتوازي
    const suppQueryBase = supabase.from("suppliers").select("id, name, phone").eq("company_id", companyId);
    let suppQuery = suppQueryBase;
    if (accessFilter.filterByCreatedBy && accessFilter.createdByUserId) suppQuery = suppQuery.eq("created_by_user_id", accessFilter.createdByUserId);
    if (accessFilter.filterByBranch && accessFilter.branchId) suppQuery = suppQuery.eq("branch_id", accessFilter.branchId);

    const [
      { data: supp },
      { data: prod },
      { data: providersData },
    ] = await Promise.all([
      suppQuery.order("name"),
      // ⚡ Lazy: نجلب فقط id, name للـ dropdown — بدون cost_price
      supabase.from("products").select("id, name, item_type").eq("company_id", companyId).order("name"),
      supabase.from("shipping_providers").select("id, provider_name").order("provider_name"),
    ]);

    setSuppliers(supp || []);
    // v3.74.909 — التكلفة تُلحَق من المسار المخوَّل.
    setProducts(await attachProductCosts(supabase, (prod || []) as any[]));
    setShippingProviders(providersData || []);
  }, [supabase]);

  useEffect(() => {
    loadSupportingData();
  }, [loadSupportingData]);

  // ⚡ دالة جلب أوامر الشراء من /api/v2/purchase-orders (Server-Side Pagination)
  // v3.74.57 - تَحديث تِلقائى عِندَ العَودَة للنّافِذَة/التَّبويب
  useAutoRefresh({ onRefresh: () => fetchOrders(currentPage, pageSize) })

  // v3.74.905 — توابع الصفحة (البنود، الفواتير المرتبطة، الكميات المرتجعة)
  // كانت مكتوبةً داخل مسار الجلب وحده، فمسار «إصابة الكاش» كان يعرض الأوامر
  // ويعود مبكراً بلا تحميلها — فيبقى `orderItems` فارغاً ويظهر عمود المنتجات
  // «-» فى كل سطر (ملاحظة المالك الحية 30/7)، وتختفى تفاصيل المدفوع/المرتجع.
  // الكاش يحفظ جزءاً من الحالة، فلا يجوز أن يُعامل كأنه كلها.
  const loadPageDependencies = useCallback(async (newOrders: PurchaseOrder[]) => {
    // تحميل الفواتير المرتبطة بالصفحة الحالية فقط
    const billIds = newOrders.filter((o) => o.bill_id).map((o) => o.bill_id as string);
    if (billIds.length > 0) {
      const { data: bills } = await supabase
        .from("bills_masked")
        .select("id, status, total_amount, paid_amount, returned_amount, return_status")
        .in("id", billIds);
      const billMap: Record<string, LinkedBillMasked> = {};
      (bills || []).forEach((b: any) => {
        // v3.74.938 — كان `|| 0`: مبلغٌ محجوبٌ يصير صفراً **يُصدَّق**. المحجوبُ
        // يبقى `null` حتى موضع العرض، فيُقرأ «—» لا «0.00».
        billMap[b.id] = {
          id: b.id, status: b.status, return_status: b.return_status,
          total_amount: b.total_amount ?? null,
          paid_amount: b.paid_amount ?? null,
          returned_amount: b.returned_amount ?? null,
        } as LinkedBillMasked;
      });
      setLinkedBills(billMap);
    } else {
      setLinkedBills({});
    }

    // تحميل بنود أوامر الشراء للصفحة الحالية فقط
    const orderIds = newOrders.map((o) => o.id);
    if (orderIds.length > 0) {
      const { data: itemsData } = await supabase
        .from("purchase_order_items_masked")
        .select("purchase_order_id, quantity, product_id")
        .in("purchase_order_id", orderIds);
      const productIds = [...new Set((itemsData || []).map((i: any) => i.product_id).filter(Boolean))];
      let productNames: Record<string, string> = {};
      if (productIds.length > 0) {
        const { data: productsData } = await supabase.from("products").select("id, name").in("id", productIds);
        productNames = (productsData || []).reduce((acc: Record<string, string>, p: any) => { acc[p.id] = p.name; return acc; }, {});
      }
      const itemsWithNames = (itemsData || []).map((item: any) => ({ ...item, product_name: item.product_id ? productNames[item.product_id] : null }));
      setOrderItems(itemsWithNames);

      // تحميل الكميات المرتجعة للصفحة الحالية فقط
      if (billIds.length > 0) {
        const { data: billItemsData } = await supabase
          .from("bill_items_masked")
          .select("bill_id, product_id, returned_quantity")
          .in("bill_id", billIds)
          .gt("returned_quantity", 0);
        const returnedQty: ReturnedQuantity[] = (billItemsData || []).map((item: any) => ({ bill_id: item.bill_id || '', product_id: item.product_id || '', quantity: item.returned_quantity || 0 })).filter((r: ReturnedQuantity) => r.bill_id && r.product_id && r.quantity > 0);
        setReturnedQuantities(returnedQty);
      } else {
        setReturnedQuantities([]);
      }
    } else {
      setOrderItems([]);
      setReturnedQuantities([]);
    }
  }, [supabase]);

  const fetchOrders = useCallback(async (page: number, size: number) => {
    // إلغاء الطلب السابق
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    fetchAbortRef.current = new AbortController();

    setServerLoading(true);
    try {
      // بناء cache key يعكس جميع معاملات الصفحة
      const cacheParams = {
        entity: 'purchase-orders' as const,
        page,
        pageSize: size,
        filters: {
          search: searchTerm,
          statuses: filterStatuses,
          suppliers: filterSuppliers,
          dateFrom,
          dateTo,
          branchId: branchFilter.getFilteredBranchId() || '',
        },
      }

      // ✅ Cache Hit → عرض فوري
      const cached = getCachedPage<{ orders: PurchaseOrder[]; totalCount: number }>(cacheParams)
      if (cached) {
        setOrders(cached.orders)
        setTotalCount(cached.totalCount)
        setServerLoading(false)
        // v3.74.905 — الكاش يحفظ الأوامر وحدها؛ توابعها تُجلب على أى حال
        // وإلا ظهر عمود المنتجات «-» وذهبت تفاصيل المدفوع/المرتجع.
        await loadPageDependencies(cached.orders)
        return
      }

      const url = buildPaginatedUrl('/api/v2/purchase-orders', {
        page,
        pageSize: size,
        search: searchTerm,
        status: filterStatuses,
        supplier: filterSuppliers,
        dateFrom,
        dateTo,
        branchId: branchFilter.getFilteredBranchId() || '',
      });

      const res = await fetch(url, { signal: fetchAbortRef.current.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      const newOrders: PurchaseOrder[] = json.data || [];
      setOrders(newOrders);
      setTotalCount(json.meta?.totalCount ?? 0);

      // ✅ Cache Write — احفظ نتيجة الصفحة
      setCachedPage(cacheParams, { orders: newOrders, totalCount: json.meta?.totalCount ?? 0 })

      // 🚀 Prefetch الصفحة التالية في الخلفية (بدون انتظار)
      const totalPagesNow = Math.ceil((json.meta?.totalCount ?? 0) / size)
      if (page < totalPagesNow) {
        const nextCacheParams = { ...cacheParams, page: page + 1 }
        prefetchPage(
          nextCacheParams,
          async () => {
            const nextUrl = buildPaginatedUrl('/api/v2/purchase-orders', {
              page: page + 1,
              pageSize: size,
              search: searchTerm,
              status: filterStatuses,
              supplier: filterSuppliers,
              dateFrom,
              dateTo,
              branchId: branchFilter.getFilteredBranchId() || '',
            })
            const nextRes = await fetch(nextUrl)
            if (!nextRes.ok) throw new Error('prefetch failed')
            const nextJson = await nextRes.json()
            return { orders: nextJson.data || [], totalCount: nextJson.meta?.totalCount ?? 0 }
          }
        )
      }

      await loadPageDependencies(newOrders);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('[PO List v2] Fetch error:', err);
    } finally {
      setServerLoading(false);
    }
  }, [supabase, searchTerm, filterStatuses, filterSuppliers, dateFrom, dateTo, branchFilter, loadPageDependencies]);

  // ⚡ جلب الصفحة الأولى عند تغيير الفلاتر
  useEffect(() => {
    setCurrentPage(1);
    fetchOrders(1, pageSize);
  }, [searchTerm, filterStatuses, filterSuppliers, dateFrom, dateTo, branchFilter.selectedBranchId, pageSize]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchOrders(page, pageSize);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    fetchOrders(1, newSize);
  };

  // ✅ Realtime: الاشتراك في تحديثات أوامر الشراء
  // ⚠️ ملاحظة: Realtime لا يرسل البيانات المنضمة (joined data) مثل branches و suppliers
  // لذا نقوم بجلب البيانات المنضمة للسجلات الجديدة
  useRealtimeTable<PurchaseOrder>({
    table: 'purchase_orders',
    enabled: !!userContext?.company_id,
    onInsert: async (newOrder) => {
      // ✅ إبطال الكاش عند إضافة سجل جديد
      invalidateCache('purchase-orders')
      const existingOrder = orders.find(o => o.id === newOrder.id);
      if (existingOrder) return;

      // ⚠️ Realtime لا يرسل البيانات المنضمة، لذا نجلبها من قاعدة البيانات
      const { data: fullOrder } = await supabase
        .from("purchase_orders_masked")
        .select("*, suppliers(name, phone), branches(name)")
        .eq("id", newOrder.id)
        .single();

      if (fullOrder) {
        // v3.74.689 — realtime must respect branch isolation. Without this, a
        // newly-created PO for ANY branch was pushed into every user's list
        // (RLS is company-scoped), leaking other branches' orders to
        // branch-restricted users. Privileged roles and central purchasing
        // (no branch) see all; everyone else only their own branch.
        const _r = String(userContext?.role || '').toLowerCase().replace(/\s+/g, '_')
        const _privileged = ['owner','admin','gm','superadmin','super_admin','generalmanager'].includes(_r)
        const _centralPurchasing = _r === 'purchasing_officer' && !userContext?.branch_id
        if (!_privileged && !_centralPurchasing) {
          if (!userContext?.branch_id || (fullOrder as any).branch_id !== userContext.branch_id) return
        }
        setOrders(prev => {
          // Prevent duplicates one more time just in case
          if (prev.some(o => o.id === fullOrder.id)) return prev;
          return [fullOrder, ...prev];
        });

        // ⚠️ Fetch items for the new order to prevent it from disappearing if filtered by products
        const { data: itemsData } = await supabase
          .from("purchase_order_items_masked")
          .select("purchase_order_id, quantity, product_id")
          .eq("purchase_order_id", newOrder.id);

        if (itemsData && itemsData.length > 0) {
          const productIds = [...new Set(itemsData.map((i: any) => i.product_id).filter(Boolean))];
          if (productIds.length > 0) {
            const { data: productsData } = await supabase
              .from("products")
              .select("id, name")
              .in("id", productIds);

            const productNames = (productsData || []).reduce((acc: Record<string, string>, p: { id: string; name: string }) => {
              acc[p.id] = p.name;
              return acc;
            }, {});

            const newItemsWithNames = itemsData.map((item: any) => ({
              ...item,
              product_name: item.product_id ? productNames[item.product_id] : null
            }));

            setOrderItems(prev => [...prev, ...newItemsWithNames]);
          } else {
            setOrderItems(prev => [...prev, ...itemsData]);
          }
        }
      }
    },
    onUpdate: async (newOrder, oldOrder) => {
      // ✅ إبطال الكاش عند تحديث سجل
      invalidateCache('purchase-orders')
      // ⚠️ Realtime لا يرسل البيانات المنضمة (branches, suppliers)
      // لذا نجلب البيانات الكاملة من قاعدة البيانات لضمان دقة البيانات
      const { data: fullOrder } = await supabase
        .from("purchase_orders_masked")
        .select("*, suppliers(name, phone), branches(name)")
        .eq("id", newOrder.id)
        .single();

      if (fullOrder) {
        setOrders(prev => prev.map(order =>
          order.id === newOrder.id ? fullOrder : order
        ));

        // ✅ إذا تغيرت الفاتورة المرتبطة، تحديث linkedBills
        if (newOrder.bill_id !== oldOrder.bill_id) {
          if (newOrder.bill_id) {
            // تحديث حالة الفاتورة المرتبطة
            const { data: bill } = await supabase
              .from("bills_masked")
              .select("id, status, total_amount, paid_amount, returned_amount, return_status")
              .eq("id", newOrder.bill_id)
              .single();

            if (bill) {
              setLinkedBills(prev => ({
                ...prev,
                [bill.id]: {
                  id: bill.id,
                  status: bill.status,
                  total_amount: bill.total_amount ?? null,
                  paid_amount: bill.paid_amount ?? null,
                  returned_amount: bill.returned_amount ?? null,
                  return_status: bill.return_status
                } as LinkedBillMasked
              }));
            }
          }
        }
      }
    },
    onDelete: (oldOrder) => {
      // ✅ إبطال الكاش عند حذف سجل
      invalidateCache('purchase-orders')
      setOrders(prev => prev.filter(order => order.id !== oldOrder.id));
    },
    filter: (event) => {
      // ✅ فلتر إضافي: التحقق من company_id
      const record = event.new || event.old;
      if (!record || !userContext?.company_id) {
        return false;
      }
      return record.company_id === userContext.company_id;
    }
  });

  // 🔄 إعادة تحميل الصفحة الحالية عند العودة إلى tab النافذة
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchOrders(currentPage, pageSize);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchOrders, currentPage, pageSize]);

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

  // ⚡ فلترة المنتجات وشركات الشحن تبقى client-side لأنها بيانات خفيفة ومحمّلة مسبقاً
  const paginatedOrders = useMemo(() => {
    // فلتر المنتجات وشركات الشحن فقط (الفلاتر الثقيلة نُقلت للسيرفر)
    let result = orders;
    if (filterProducts.length > 0) {
      result = result.filter((o) => {
        const orderProductIds = orderItems
          .filter(item => item.purchase_order_id === o.id)
          .map(item => item.product_id)
          .filter(Boolean) as string[];
        return filterProducts.some(productId => orderProductIds.includes(productId));
      });
    }
    if (filterShippingProviders.length > 0) {
      result = result.filter((o) => {
        const orderProviderId = (o as any).shipping_provider_id;
        return orderProviderId && filterShippingProviders.includes(orderProviderId);
      });
    }
    return result;
  }, [orders, filterProducts, filterShippingProviders, orderItems]);

  // ⚡ Server Pagination meta
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const totalItems = totalCount;

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
      key: 'branch_id',
      header: appLang === 'en' ? 'Branch' : 'الفرع',
      type: 'text',
      align: 'center',
      hidden: 'md',
      format: (_, row) => {
        const branchName = (row as any).branches?.name
        return branchName ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
            {branchName}
          </span>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">{appLang === 'en' ? 'Main' : 'رئيسي'}</span>
        )
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
        // v3.74.938 — لا قائمةَ أدوارٍ هنا بعد اليوم. المبلغُ المحجوب يصل
        // `null` من `purchase_orders_masked` فيُعرض «—» بتلميحٍ يشرح السبب،
        // ولا يُعرض «***» يُظنّ عطباً ولا «0.00» يُصدَّق.
        // `total_amount` عمودٌ `NOT NULL` فى الجدول، ففراغُه شاهدُ الحجب لا شاهدُ النقص.
        const hint = appLang === 'en' ? HIDDEN_MONEY_HINT_EN : HIDDEN_MONEY_HINT_AR;
        if (rowMoneyHidden((row as any).total_amount)) return <span title={hint}>{HIDDEN_MONEY}</span>;
        const total = Number((row as any).total_amount);
        const symbol = currencySymbols[row.currency || 'SAR'] || row.currency || 'SAR';
        const linkedBill = row.bill_id ? linkedBills[row.bill_id] : null;
        const fmt = (n: number) => `${symbol}${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

        // ⚠️ «مطروحٌ من مجهولٍ مجهول»: لو حُجب المدفوعُ أو المرتجعُ فالمتبقى
        // لا يُحسب — `sumOrHidden` تُعيد `null` إن كان فى المجموعة محجوبٌ واحد.
        const returnedAmount = linkedBill ? linkedBill.returned_amount : null;
        const paidAmount = linkedBill ? linkedBill.paid_amount : null;

        // إذا كانت هناك فاتورة مرتبطة بها مرتجعات، نعرض التفاصيل
        if (linkedBill && (linkedBill.return_status === 'full' || linkedBill.return_status === 'partial' || Number(returnedAmount ?? 0) > 0)) {
          const netRemaining = (isHiddenMoney(paidAmount) || isHiddenMoney(returnedAmount))
            ? null
            : total - Number(paidAmount) - Number(returnedAmount);

          return (
            <div className="flex flex-col items-end gap-0.5 text-xs">
              <span className="font-medium">{fmt(total)}</span>
              <span className="text-red-600 dark:text-red-400" title={isHiddenMoney(returnedAmount) ? hint : undefined}>
                {appLang === 'en' ? 'Ret:' : 'مرتجع:'} {isHiddenMoney(returnedAmount) ? HIDDEN_MONEY : `-${fmt(Number(returnedAmount))}`}
              </span>
              {(isHiddenMoney(paidAmount) || Number(paidAmount) > 0) && (
                <span className="text-green-600 dark:text-green-400" title={isHiddenMoney(paidAmount) ? hint : undefined}>
                  {appLang === 'en' ? 'Paid:' : 'مدفوع:'} {isHiddenMoney(paidAmount) ? HIDDEN_MONEY : fmt(Number(paidAmount))}
                </span>
              )}
              <span
                className={`font-bold ${netRemaining !== null && netRemaining > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}
                title={netRemaining === null ? hint : undefined}
              >
                {appLang === 'en' ? 'Due:' : 'متبقي:'} {netRemaining === null ? HIDDEN_MONEY : fmt(netRemaining)}
              </span>
            </div>
          );
        }

        // إذا كانت هناك فاتورة مرتبطة بمدفوعات فقط (بدون مرتجعات)
        if (linkedBill && (isHiddenMoney(paidAmount) || Number(paidAmount) > 0)) {
          const remaining = isHiddenMoney(paidAmount) ? null : total - Number(paidAmount);

          return (
            <div className="flex flex-col items-end gap-0.5 text-xs">
              <span className="font-medium">{fmt(total)}</span>
              <span className="text-green-600 dark:text-green-400" title={isHiddenMoney(paidAmount) ? hint : undefined}>
                {appLang === 'en' ? 'Paid:' : 'مدفوع:'} {isHiddenMoney(paidAmount) ? HIDDEN_MONEY : fmt(Number(paidAmount))}
              </span>
              {(remaining === null || remaining > 0) && (
                <span className="text-yellow-600 dark:text-yellow-400 font-bold" title={remaining === null ? hint : undefined}>
                  {appLang === 'en' ? 'Due:' : 'متبقي:'} {remaining === null ? HIDDEN_MONEY : fmt(remaining)}
                </span>
              )}
            </div>
          );
        }

        // بدون فاتورة أو فاتورة بدون مدفوعات/مرتجعات
        return fmt(total);
      }
    },
    {
      key: 'shipping_provider_id',
      header: appLang === 'en' ? 'Shipping' : 'الشحن',
      type: 'text',
      align: 'center',
      hidden: 'lg',
      format: (_, row) => {
        // v3.74.905 — العمود كان يقرأ `shipping_provider_id` وواجهة
        // /api/v2/purchase-orders لا ترسله (ولا ترسل تكلفة الشحن) — فكان
        // «-» فى كل سطر ولو كان للأمر شركة شحنٍ وتكلفة. أُضيفت الحقول
        // للـ select، وهنا: اسم الشركة إن وُجدت، وإلا التكلفة إن كانت،
        // والتكلفة مالٌ فتُحجب عمَّن لا يرى الأسعار.
        const providerId = (row as any).shipping_provider_id;
        if (providerId) {
          return shippingProviders.find(p => p.id === providerId)?.provider_name
            || (appLang === 'en' ? 'Provider' : 'شركة شحن');
        }
        // v3.74.938 — تكلفةُ الشحن عمودُ مالٍ مقنَّع. و«-» هنا معناها «لا شحن»،
        // فلا يجوز أن تعنى «محجوب» أيضاً — ولا يُقاس الحجبُ على `shipping`
        // نفسِه لأنه يقبل الفراغ افتراضاً؛ يُقاس على شاهدٍ `NOT NULL`.
        if (rowMoneyHidden((row as any).total_amount)) {
          return <span title={appLang === 'en' ? HIDDEN_MONEY_HINT_EN : HIDDEN_MONEY_HINT_AR}>{HIDDEN_MONEY}</span>;
        }
        const shippingCost = Number((row as any).shipping || 0);
        if (shippingCost > 0) {
          const symbol = currencySymbols[row.currency || 'EGP'] || row.currency || '';
          return `${symbol}${shippingCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        }
        return '-';
      }
    },
    {
      key: 'status',
      header: appLang === 'en' ? 'Status' : 'الحالة',
      type: 'status',
      align: 'center',
      format: (_, row) => {
        const linkedBill = row.bill_id ? linkedBills[row.bill_id] : null;
        // ✅ إذا مرتبط بفاتورة: نعرض حالة أمر الشراء بناءً على حالة الفاتورة
        if (linkedBill || row.bill_id) {
          // ✅ إذا كانت الفاتورة Draft، لا نعرض "billed"
          const orderStatus = (linkedBill && linkedBill.status !== 'draft' && row.bill_id)
            ? 'billed'
            : row.status;
          // v3.74.938 — «هل لها مرتجعات؟» سؤالُ حالةٍ لا سؤالُ مبلغ:
          // `return_status` ليس عمودَ مالٍ فيُقرأ دائماً، والمبلغُ قد يُحجب.
          const hasReturns = linkedBill && (linkedBill.return_status === 'full' || linkedBill.return_status === 'partial');
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
              {/* v3.74.449 — surface a rejected discount even when a bill is linked */}
              {(row as any).discount_approval_status === 'rejected' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 font-medium">
                  {appLang === 'en' ? '⚠ Discount rejected' : '⚠ الخصم مرفوض'}
                </span>
              )}
              {(row as any).discount_approval_status === 'pending' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200 font-medium">
                  {appLang === 'en' ? 'Discount pending' : 'الخصم قيد الاعتماد'}
                </span>
              )}
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
        // v3.74.449 — same discount indicator for the no-bill path
        return (
          <div className="flex flex-col items-center gap-0.5">
            <StatusBadge status={row.status} lang={appLang} />
            {(row as any).discount_approval_status === 'rejected' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 font-medium">
                {appLang === 'en' ? '⚠ Discount rejected' : '⚠ الخصم مرفوض'}
              </span>
            )}
            {(row as any).discount_approval_status === 'pending' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200 font-medium">
                {appLang === 'en' ? 'Discount pending' : 'الخصم قيد الاعتماد'}
              </span>
            )}
          </div>
        );
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
              // v3.74.451 — delete is allowed only on draft. The DB
              // gate already refuses non-draft deletes; this hides the
              // button so users don't try.
              canDelete: permDelete && row.status === 'draft',
              canCreate: permWrite
            }}
          />
        );
      }
    }
  // v3.74.905 — `shippingProviders` يُحمَّل بعد أول رسم، ولم يكن فى قائمة
  // الاعتماد: فالأعمدة كانت قد تُحسب مرة بحالةٍ قديمة (شركة شحنٍ بلا اسم).
  // v3.74.938 — `canViewPrices` رُفع من القائمة لأنه رُفع من الشاشة كلِّها:
  // ما يُعرض صار يُقرَّر من البيانات (`null` ⇒ «—») لا من جدول أدوارٍ محلى.
  ], [appLang, linkedBills, permRead, permUpdate, permDelete, permWrite, orderItems, returnedQuantities, shippingProviders]);

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
      // 🔒 منع حذف الفواتير المرتبطة إذا كانت مرسلة أو مدفوعة جزئياً أو كلياً
      if (orderToDelete.bill_id) {
        const linkedBill = linkedBills[orderToDelete.bill_id];
        if (linkedBill) {
          // منع الحذف للفواتير المرسلة أو المدفوعة
          if (linkedBill.status === 'sent' || linkedBill.status === 'partially_paid' || linkedBill.status === 'paid') {
            sonnerToast.error(
              appLang === 'en'
                ? 'Cannot delete - linked bill is sent or paid. Use Return instead.'
                : 'لا يمكن الحذف - الفاتورة المرتبطة مرسلة أو مدفوعة. استخدم المرتجع بدلاً من ذلك.'
            );
            setDeleteConfirmOpen(false);
            setLoading(false);
            return;
          }
          // منع الحذف للفواتير غير المسودة
          if (linkedBill.status !== 'draft') {
            sonnerToast.error(appLang === 'en' ? 'Cannot delete - linked bill is not draft' : 'لا يمكن الحذف - الفاتورة المرتبطة ليست مسودة');
            setDeleteConfirmOpen(false);
            setLoading(false);
            return;
          }
        }
        // Delete linked bill if draft
        // ⚠️ v3.74.874 — كان بلا فحص، ثم يُحذف أمر الشراء بعده. فلو فشل
        // حذف الفاتورة صامتاً، حُذف الأمر وبقيت **فاتورة شراءٍ يتيمة** بلا
        // مصدر — ومحسوبةٌ فى أرصدة الموردين والالتزامات.
        const { error: billErr } = await supabase
          .from("bills").delete().eq("id", orderToDelete.bill_id);
        if (billErr) {
          throw new Error(
            appLang === 'en'
              ? `Could not delete the linked bill (${orderToDelete.bill_id}): ${billErr.message}`
              : `تعذّر حذف فاتورة الشراء المرتبطة (${orderToDelete.bill_id}): ${billErr.message}`
          );
        }
      }
      // Delete order items first
      const { error: poItemsErr } = await supabase
        .from("purchase_order_items").delete().eq("purchase_order_id", orderToDelete.id);
      if (poItemsErr) {
        throw new Error(
          appLang === 'en'
            ? `Could not delete the order items: ${poItemsErr.message}`
            : `تعذّر حذف بنود أمر الشراء: ${poItemsErr.message}`
        );
      }
      // Delete order
      const { error } = await supabase.from("purchase_orders").delete().eq("id", orderToDelete.id);
      if (error) throw error;
      toastDeleteSuccess(toast, appLang === 'en' ? 'Purchase Order' : 'أمر الشراء');
      setOrders(orders.filter(o => o.id !== orderToDelete.id));
      // 🔄 تحديث البيانات في الصفحة
      router.refresh();
    } catch (err) {
      console.error("Error deleting:", err);
      toastDeleteError(toast, appLang === 'en' ? 'Purchase Order' : 'أمر الشراء');
    } finally {
      setDeleteConfirmOpen(false);
      setOrderToDelete(null);
      setLoading(false);
    }
  };

  // ⚡ Statistics — تعمل على كل السجلات المحمّلة في الصفحة الحالية (أسرع من حساب filteredOrders الكاملة)
  const stats = useMemo(() => {
    const total = totalCount; // من السيرفر (count: 'exact')
    const draft = orders.filter((o: PurchaseOrder) => o.status === 'draft').length;
    const sent = orders.filter((o: PurchaseOrder) => o.status === 'sent').length;
    const billed = orders.filter((o: PurchaseOrder) => o.bill_id != null && o.bill_id !== '').length;
    // v3.74.938 — مجموعٌ ينقصه بندٌ محجوبٌ رقمٌ خاطئٌ يبدو صحيحاً. فإن كان فى
    // الصفحة أمرٌ واحدٌ محجوبٌ عنى فالمجموعُ كلُّه «—» — وهذا امتدادُ قرار 905
    // نفسِه: «مَن حُجب عنه الجزء يُحجب عنه الكل».
    const totalValue = sumOrHidden(orders.flatMap((o: PurchaseOrder) => {
      const linked = o.bill_id ? linkedBills[o.bill_id] : null;
      return [(o as any).total_amount ?? null,
              linked ? (linked.returned_amount === null ? null : -Number(linked.returned_amount)) : 0];
    }));
    return { total, draft, sent, billed, totalValue };
  }, [orders, totalCount, linkedBills]);

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* Header — Migrated to ERPPageHeader (v3.55.0) */}
          <ERPPageHeader
            title={appLang === 'en' ? 'Purchase Orders' : 'أوامر الشراء'}
            description={appLang === 'en' ? 'Manage supplier purchase orders and track deliveries' : 'إدارة أوامر شراء الموردين وتتبع التوريدات'}
            variant="list"
            lang={appLang}
            actions={
              permWrite ? (
                <Link href="/purchase-orders/new">
                  <Button className="bg-orange-600 hover:bg-orange-700 gap-2">
                    <Plus className="w-4 h-4" />
                    {appLang === 'en' ? 'New Order' : 'أمر جديد'}
                  </Button>
                </Link>
              ) : undefined
            }
            extra={
              <>
                {(userContext?.role === 'manager' || userContext?.role === 'accountant') && (
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    {appLang === 'en' ? '🏢 Showing purchase orders from your branch only' : '🏢 تعرض أوامر الشراء الخاصة بفرعك فقط'}
                  </p>
                )}
                {(userContext?.role === 'staff' || userContext?.role === 'sales' || userContext?.role === 'employee') && (
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    {appLang === 'en' ? '👨‍💼 Showing purchase orders you created only' : '👨‍💼 تعرض أوامر الشراء التي أنشأتها فقط'}
                  </p>
                )}
              </>
            }
          />

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
              {/* 🔐 فلتر الفروع - يظهر فقط للأدوار المميزة (Owner/Admin/General Manager) */}
              <BranchFilter
                lang={appLang as 'ar' | 'en'}
                externalHook={branchFilter}
                className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800"
              />

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
              {loading || serverLoading ? (
                <LoadingState type="table" rows={8} />
              ) : paginatedOrders.length === 0 ? (
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
                        const totalOrders = totalCount
                        // v3.74.938 — نفسُ قاعدة الإحصاء: محجوبٌ واحدٌ يحجب المجموع.
                        const totalAmount = sumOrHidden(paginatedOrders.flatMap((o: PurchaseOrder) => {
                          const linked = o.bill_id ? linkedBills[o.bill_id] : null;
                          return [(o as any).total_amount ?? null,
                                  linked ? (linked.returned_amount === null ? null : -Number(linked.returned_amount)) : 0];
                        }))

                        return (
                          <tr>
                            <td className="px-3 py-4 text-right" colSpan={tableColumns.length - 1}>
                              <span className="text-gray-700 dark:text-gray-200">
                                {appLang === 'en' ? 'Totals' : 'الإجماليات'} ({totalOrders} {appLang === 'en' ? 'orders' : 'أمر'})
                              </span>
                            </td>
                            <td className="px-3 py-4">
                              {/* v3.74.905 — الحماية كانت مسرحية: تُحجب أسعار
                                  السطور عمَّن لا يراها ثم يُطبع لهم المجموع
                                  كاملاً هنا. مَن حُجب عنه الجزء يُحجب عنه الكل.
                                  v3.74.938 — والقاعدةُ صارت فى الحساب نفسِه
                                  (`sumOrHidden`) لا فى شرطِ عرضٍ يُنسى. */}
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Total Value:' : 'إجمالي القيمة:'}</span>
                                  <span
                                    className="text-blue-600 dark:text-blue-400 font-semibold"
                                    title={totalAmount === null ? (appLang === 'en' ? HIDDEN_MONEY_HINT_EN : HIDDEN_MONEY_HINT_AR) : undefined}
                                  >
                                    {totalAmount === null
                                      ? HIDDEN_MONEY
                                      : totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )
                      }
                    }}
                  />
                  {totalCount > 0 && (
                    <DataPagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      totalItems={totalItems}
                      pageSize={pageSize}
                      onPageChange={handlePageChange}
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
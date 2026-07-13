"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSupabase } from "@/lib/supabase/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { toast as sonnerToast } from "sonner";
import { useToast } from "@/hooks/use-toast";
import { toastActionError, toastActionSuccess } from "@/lib/notifications";
import { FileText, UserCheck, X } from "lucide-react";
import { ERPPageHeader } from "@/components/erp-page-header";
import { CustomerSearchSelect } from "@/components/CustomerSearchSelect";
import { FilterContainer } from "@/components/ui/filter-container";
import { BranchFilter } from "@/components/BranchFilter";
import { useBranchFilter } from "@/hooks/use-branch-filter";
import { getActiveCompanyId } from "@/lib/company";
import { buildDataVisibilityFilter, applyDataVisibilityFilter } from "@/lib/data-visibility-control";
import type { UserContext } from "@/lib/validation";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { DataPagination } from "@/components/data-pagination";
import { usePagination } from "@/lib/pagination";
import { StatusBadge } from "@/components/DataTableFormatters";

type Customer = { id: string; name: string; phone?: string | null };
type Member   = { user_id: string; full_name?: string | null; email?: string | null; role?: string };
type Employee = { user_id: string; display_name: string; role: string; email?: string };
type Product  = { id: string; name: string; unit_price?: number; item_type?: 'product' | 'service'; branch_id?: string | null };

type Estimate = {
  id: string;
  company_id: string;
  customer_id: string;
  estimate_number: string;
  estimate_date: string;
  expiry_date: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  notes?: string | null;
  branch_id?: string | null;
  cost_center_id?: string | null;
  created_by_user_id?: string | null;
  converted_so_id?: string | null;
  // Joined fields (loaded via FK join in SELECT)
  branches?: { name: string } | null;
  converted_so?: { id: string; so_number: string } | null;
};

type EstimateItem = {
  id?: string;
  product_id?: string | null;
  description?: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  discount_percent?: number;
  line_total: number;
};

export default function EstimatesPage() {
  const supabase = useSupabase();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar');

  useEffect(() => {
    const handler = () => {
      try {
        setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar');
      } catch { }
    };
    handler();
    window.addEventListener('app_language_changed', handler);
    return () => { window.removeEventListener('app_language_changed', handler); };
  }, []);

  const t = (en: string, ar: string) => appLang === 'en' ? en : ar;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  // 🔐 Governance context (role + branch + creator scope)
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  // Members (legacy, kept for compatibility)
  const [members, setMembers] = useState<Member[]>([]);
  // Employees (enriched, used by blue Employee filter row)
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState<string>("");

  // Branch filter hook (visible internally only for privileged roles)
  const branchFilter = useBranchFilter();
  const [isPending, startTransition] = useTransition();

  // Filter state — aligned with /sales-orders pattern
  const [filterStatuses, setFilterStatuses]     = useState<string[]>([]);
  const [filterCustomers, setFilterCustomers]   = useState<string[]>([]);
  const [filterProducts, setFilterProducts]     = useState<string[]>([]);
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo]     = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Pagination state
  const [pageSize, setPageSize] = useState(10);

  // estimate_id -> product_ids index for Products filter
  const [itemsByEstimate, setItemsByEstimate] = useState<Record<string, string[]>>({});

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Estimate | null>(null);

  const [customerId, setCustomerId] = useState<string>("");
  const [estimateNumber, setEstimateNumber] = useState<string>("");
  const [estimateDate, setEstimateDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [items, setItems] = useState<EstimateItem[]>([]);
  const [taxAmount, setTaxAmount] = useState<number>(0);

  // Filtered estimates — multi-select status + multi-select customer + employee + dates + search
  const filteredEstimates = useMemo(() => {
    return estimates.filter((e) => {
      if (filterStatuses.length > 0 && !filterStatuses.includes(e.status)) return false;
      if (filterCustomers.length > 0 && !filterCustomers.includes(e.customer_id)) return false;
      if (filterProducts.length > 0) {
        const ids = itemsByEstimate[e.id] || [];
        const hit = filterProducts.some(pid => ids.includes(pid));
        if (!hit) return false;
      }
      if (filterEmployeeId !== "all" && (e.created_by_user_id || "") !== filterEmployeeId) return false;
      if (dateFrom && e.estimate_date < dateFrom) return false;
      if (dateTo && e.estimate_date > dateTo) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const customerName = (customers.find(c => c.id === e.customer_id)?.name || "").toLowerCase();
        const num = (e.estimate_number || "").toLowerCase();
        if (!customerName.includes(q) && !num.includes(q)) return false;
      }
      return true;
    });
  }, [estimates, filterStatuses, filterCustomers, filterProducts, itemsByEstimate, filterEmployeeId, dateFrom, dateTo, searchQuery, customers]);

  const activeFilterCount = [
    filterStatuses.length > 0,
    filterCustomers.length > 0,
    filterProducts.length > 0,
    filterEmployeeId !== "all",
    !!dateFrom,
    !!dateTo,
    !!searchQuery,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setFilterStatuses([]);
    setFilterCustomers([]);
    setFilterProducts([]);
    setFilterEmployeeId("all");
    setDateFrom("");
    setDateTo("");
    setSearchQuery("");
  };

  // Pagination — placed before any early return to keep hook order stable
  const {
    currentPage,
    totalPages,
    totalItems,
    paginatedItems: paginatedEstimates,
    goToPage,
    setPageSize: updatePageSize,
  } = usePagination(filteredEstimates, { pageSize });

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    updatePageSize(newSize);
  };

  // Main estimates list columns — standard DataTable (matches /invoices)
  const estimateColumns: DataTableColumn<Estimate>[] = [
    {
      key: 'estimate_number',
      header: t("Estimate #", "رقم العرض"),
      type: 'text',
      align: 'right',
      format: (value) => (
        <span className="font-medium text-blue-600 dark:text-blue-400">{value}</span>
      ),
    },
    {
      key: 'customer_id',
      header: t("Customer", "العميل"),
      type: 'text',
      align: 'right',
      format: (_, row) => customers.find((c) => c.id === row.customer_id)?.name || "-",
    },
    {
      key: 'branch_id',
      header: t("Branch", "الفرع"),
      type: 'text',
      align: 'center',
      hidden: 'md',
      format: (_, row) => (
        row.branches?.name ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
            {row.branches.name}
          </span>
        ) : (
          <span className="text-gray-400 dark:text-gray-500 text-xs">{t("Main", "رئيسي")}</span>
        )
      ),
    },
    {
      key: 'estimate_date',
      header: t("Date", "التاريخ"),
      type: 'date',
      align: 'right',
      hidden: 'sm',
      className: 'text-gray-600 dark:text-gray-300',
      format: (value) => value,
    },
    {
      key: 'total_amount',
      header: t("Total", "المجموع"),
      type: 'currency',
      align: 'right',
      className: 'font-medium text-gray-900 dark:text-white',
      format: (value) => Number(value).toFixed(2),
    },
    {
      key: 'status',
      header: t("Status", "الحالة"),
      type: 'status',
      align: 'center',
      format: (_, row) => <StatusBadge status={row.status} lang={appLang} />,
    },
    {
      key: 'converted_so',
      header: t("Linked Sales Order", "أمر البيع المرتبط"),
      type: 'text',
      align: 'center',
      hidden: 'md',
      format: (_, row) => (
        row.converted_so ? (
          <a
            href={"/sales-orders/" + row.converted_so.id}
            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50"
          >
            {row.converted_so.so_number}
          </a>
        ) : (
          <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
        )
      ),
    },
    {
      key: 'id',
      header: t("Actions", "إجراءات"),
      type: 'actions',
      align: 'center',
      format: (_, row) => (
        <div className="flex gap-2 flex-wrap justify-center">
          <Button variant="secondary" onClick={() => onEdit(row)} disabled={!!row.converted_so_id}>
            {t("Edit", "تعديل")}
          </Button>
          <Button variant="outline" onClick={() => convertToSO(row)} disabled={!!row.converted_so_id || row.status === "converted"}>
            {row.converted_so_id ? t("Converted", "مُحَوَّل") : t("Convert to Sales Order", "تحويل لأمر بيع")}
          </Button>
          {canDeleteEstimate(row) && (
            <Button variant="destructive" onClick={() => deleteEstimate(row)}>
              {t("Delete", "حذف")}
            </Button>
          )}
        </div>
      ),
    },
  ];

  // Privileged role flag — used to gate BranchFilter + Employee filter
  const canViewAllEstimates = ['owner', 'admin', 'general_manager'].includes(
    (userContext?.role || '').toLowerCase()
  );

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, i) => sum + i.line_total, 0);
    const total = subtotal + taxAmount;
    return { subtotal, total };
  }, [items, taxAmount]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const companyId = await getActiveCompanyId(supabase);
        if (!companyId) { setLoading(false); return; }

        // 🔐 Governance: build full UserContext (role + branch + cost_center + warehouse)
        const { data: { user } } = await supabase.auth.getUser();
        let ctx: UserContext | null = null;
        let userBranchId: string | null = null;
        let canOverrideBranch = true;
        if (user) {
          const { data: member } = await supabase
            .from("company_members")
            .select("role, branch_id, cost_center_id, warehouse_id")
            .eq("user_id", user.id)
            .eq("company_id", companyId)
            .maybeSingle();
          if (member) {
            ctx = {
              user_id: user.id,
              company_id: companyId,
              role: member.role,
              branch_id: member.branch_id || null,
              cost_center_id: member.cost_center_id || null,
              warehouse_id: member.warehouse_id || null,
            };
            setUserContext(ctx);
            // For products query
            canOverrideBranch = ['owner', 'admin', 'manager'].includes(member.role);
            userBranchId = member.branch_id || null;

            // 🔐 Load company members for the "Employee" filter — only for privileged roles
            //    (other roles already only see their own estimates, so a filter is useless)
            if (['owner', 'admin', 'general_manager'].includes(member.role)) {
              const { data: mems } = await supabase
                .from("company_members")
                .select("user_id, role, email")
                .eq("company_id", companyId);
              setMembers((mems as Member[]) || []);

              // Enriched list for blue Employee filter row
              const userIds = (mems || []).map((m: any) => m.user_id);
              const { data: profiles } = userIds.length > 0
                ? await supabase
                    .from("user_profiles")
                    .select("user_id, display_name, username")
                    .in("user_id", userIds)
                : { data: [] as any[] };
              const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
              const roleLabels: Record<string, string> = appLang === 'en' ? {
                owner: 'Owner', admin: 'Admin', manager: 'Branch Manager',
                supervisor: 'Supervisor', staff: 'Staff', accountant: 'Accountant',
                sales: 'Sales', viewer: 'Viewer',
              } : {
                owner: 'مالك', admin: 'مدير', manager: 'مدير فرع',
                supervisor: 'مشرف', staff: 'موظف', accountant: 'محاسب',
                sales: 'مبيعات', viewer: 'مشاهد',
              };
              const employeesList: Employee[] = (mems || []).map((m: any) => {
                const profile: any = profileMap.get(m.user_id);
                return {
                  user_id: m.user_id,
                  display_name: profile?.display_name || profile?.username || m.email || m.user_id.slice(0, 8),
                  role: roleLabels[m.role] || m.role,
                  email: profile?.username || m.email,
                };
              });
              setEmployees(employeesList);
            }
          }
        }

        // 🔐 Customers — mirror /customers page governance exactly:
        //   Owner/Admin/General_Manager  → all company customers
        //   Manager                      → branch customers only
        //   Accountant                   → branch customers + shared (branch_id IS NULL)
        //   Staff/Sales/Employee         → customers they themselves created
        let custQuery: any = supabase
          .from("customers")
          .select("id, name, phone")
          .eq("company_id", companyId)
          .order("name");

        const role = (ctx?.role || '').toLowerCase();
        const privileged = ['owner', 'admin', 'general_manager'].includes(role);
        const isBranchLevel = ['manager', 'accountant', 'branch_manager'].includes(role);
        const isCreatorLevel = ['staff', 'sales', 'employee'].includes(role);

        if (privileged) {
          // All company customers — no extra filter
        } else if (isBranchLevel && ctx?.branch_id) {
          if (role === 'accountant') {
            // Accountant: branch customers + customers without a branch
            custQuery = custQuery.or(`branch_id.eq.${ctx.branch_id},branch_id.is.null`);
          } else {
            // Manager: only branch customers
            custQuery = custQuery.eq('branch_id', ctx.branch_id);
          }
        } else if (isCreatorLevel && ctx?.user_id) {
          // Staff/Sales/Employee: only customers they themselves created
          custQuery = custQuery.eq('created_by_user_id', ctx.user_id);
        }
        // ctx unresolved → defaults to company-only (no role-based filter)

        const { data: cust, error: custErr } = await custQuery;
        if (custErr) console.error("Failed to load customers:", custErr);
        setCustomers(cust || []);

        // 🔐 Products query — uses unit_price (correct column),
        // filters is_active=true, includes item_type for icon,
        // and applies branch governance for non-admin users
        let productsQuery = supabase
          .from("products")
          .select("id, name, unit_price, item_type, branch_id")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("name");

        if (!canOverrideBranch && userBranchId) {
          productsQuery = productsQuery.or(`branch_id.eq.${userBranchId},branch_id.is.null`);
        }

        const { data: prod, error: prodErr } = await productsQuery;
        if (prodErr) {
          console.error("Failed to load products:", prodErr);
          toastActionError(toast, t("Product Loading", "خطأ في تحميل المنتجات"), prodErr.message);
        }
        setProducts(prod || []);

        // 🔐 Estimates query — explicit governance (estimates has no warehouse_id,
        // so we can't use applyDataVisibilityFilter as-is). Mirrors /customers pattern.
        let estQuery: any = supabase
          .from("estimates")
          .select("id, company_id, customer_id, estimate_number, estimate_date, expiry_date, subtotal, tax_amount, total_amount, status, notes, branch_id, cost_center_id, created_by_user_id, converted_so_id, branches:branch_id(name), converted_so:converted_so_id(id, so_number)")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false });

        const selectedBranchOverride = branchFilter.getFilteredBranchId();
        if (privileged) {
          if (selectedBranchOverride) {
            estQuery = estQuery.eq('branch_id', selectedBranchOverride);
          }
        } else if (isBranchLevel && ctx?.branch_id) {
          if (role === 'accountant') {
            estQuery = estQuery.or(`branch_id.eq.${ctx.branch_id},branch_id.is.null`);
          } else {
            estQuery = estQuery.eq('branch_id', ctx.branch_id);
          }
        } else if (isCreatorLevel && ctx?.user_id) {
          estQuery = estQuery.eq('created_by_user_id', ctx.user_id);
        }

        const { data: est, error: estErr } = await estQuery;
        if (estErr) console.error("Failed to load estimates:", estErr);
        setEstimates(est || []);

        // Build estimate_id -> product_ids index for Products filter
        if (est && est.length > 0) {
          const estIds = est.map((e: any) => e.id);
          const { data: itemRows } = await supabase
            .from("estimate_items")
            .select("estimate_id, product_id")
            .in("estimate_id", estIds);
          const idx: Record<string, string[]> = {};
          (itemRows || []).forEach((row: any) => {
            if (!row.product_id) return;
            if (!idx[row.estimate_id]) idx[row.estimate_id] = [];
            idx[row.estimate_id].push(row.product_id);
          });
          setItemsByEstimate(idx);
        } else {
          setItemsByEstimate({});
        }
      } catch (err: any) {
        console.error("Estimates load error:", err);
        toastActionError(toast, t("Loading", "خطأ في التحميل"), err?.message || "");
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, toast, appLang, branchFilter.selectedBranchId]);

  const resetForm = () => {
    setCustomerId("");
    setEstimateNumber("");
    setEstimateDate(new Date().toISOString().slice(0, 10));
    setExpiryDate("");
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

  const updateItem = (index: number, patch: Partial<EstimateItem>) => {
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

  const onEdit = (estimate: Estimate) => {
    setEditing(estimate);
    setOpen(true);
    setCustomerId(estimate.customer_id);
    setEstimateNumber(estimate.estimate_number);
    setEstimateDate(estimate.estimate_date);
    setExpiryDate(estimate.expiry_date || "");
    setNotes(estimate.notes || "");
    setTaxAmount(estimate.tax_amount || 0);
    // Load items
    supabase
      .from("estimate_items")
      .select("id, product_id, description, quantity, unit_price, tax_rate, discount_percent, line_total")
      .eq("estimate_id", estimate.id)
      .then(({ data }: { data: any }) => setItems(data || []));
  };

  const onOpenNew = () => {
    setEditing(null);
    resetForm();
    setOpen(true);
    setEstimateNumber(`EST-${Date.now()}`);
  };

  const saveEstimate = async () => {
    if (!customerId) {
      sonnerToast.error(t("Please select a customer", "الرجاء اختيار العميل"));
      return;
    }
    if (!estimateNumber) {
      sonnerToast.error(t("Estimate number is required", "رقم العرض مطلوب"));
      return;
    }

    // v3.74.140 — Mandatory items check. Same fix pattern as PO (v3.74.139)
    // and Invoices / Sales Orders below. Without this an estimate could
    // be saved with no products at all, or with placeholder rows that
    // had product_id=null and quantity=0. Estimates feed directly into
    // sales orders via convertToSO, so junk lines here propagate forward.
    if (!items || items.length === 0) {
      sonnerToast.error(t("The estimate cannot be saved without line items. Please add at least one product.", "لا يمكن حفظ العرض بدون بنود. الرجاء إضافة منتج واحد على الأقل."));
      return;
    }
    const invalidEstimateRows: number[] = [];
    items.forEach((it: any, idx: number) => {
      const hasProduct = Boolean(it?.product_id);
      const qty = Number(it?.quantity) || 0;
      const price = Number(it?.unit_price) || 0;
      if (!hasProduct || qty <= 0 || price < 0) {
        invalidEstimateRows.push(idx + 1);
      }
    });
    if (invalidEstimateRows.length > 0) {
      sonnerToast.error(
        appLang === 'en'
          ? `Incomplete line item(s) on row(s): ${invalidEstimateRows.join(", ")}. Each line must have a product, a quantity greater than zero, and a unit price.`
          : `بنود ناقصة فى السطر/السطور: ${invalidEstimateRows.join("، ")}. كل بند يجب أن يحتوى على منتج، كمية أكبر من صفر، وسعر وحدة.`
      );
      return;
    }

    setLoading(true);

    // 🔐 Required for RLS: company_id must be in payload (can_modify_data check)
    const companyId = await getActiveCompanyId(supabase);
    if (!companyId) {
      toastActionError(toast, t("Save", "خطأ"), t("estimate", "العرض"), t("Could not determine the active company", "تعذر تحديد الشركة"));
      setLoading(false);
      return;
    }

    // 🔐 Governance scoping — branch + cost_center + created_by (from userContext if available)
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      company_id: companyId,
      customer_id: customerId,
      estimate_number: estimateNumber,
      estimate_date: estimateDate,
      expiry_date: expiryDate || null,
      subtotal: Number(totals.subtotal.toFixed(2)),
      tax_amount: Number(taxAmount.toFixed(2)),
      total_amount: Number(totals.total.toFixed(2)),
      status: editing ? editing.status : "draft",
      notes: notes || null,
      // Preserve existing values on edit; set from userContext on new
      branch_id: editing ? (editing.branch_id ?? userContext?.branch_id ?? null) : (userContext?.branch_id ?? null),
      cost_center_id: editing ? (editing.cost_center_id ?? userContext?.cost_center_id ?? null) : (userContext?.cost_center_id ?? null),
      created_by_user_id: editing ? (editing.created_by_user_id ?? user?.id ?? null) : (user?.id ?? null),
    };
    let estimateId = editing?.id;
    if (editing) {
      const { error } = await supabase.from("estimates").update(payload).eq("id", editing.id);
      if (error) {
        console.error("Estimate update error:", error);
        toastActionError(toast, t("Update", "التحديث"), t("estimate", "العرض"), error.message || t("Could not update the estimate", "تعذر تحديث العرض"));
        setLoading(false);
        return;
      }
      // replace items
      await supabase.from("estimate_items").delete().eq("estimate_id", editing.id);
      estimateId = editing.id;
    } else {
      const { data, error } = await supabase.from("estimates").insert(payload).select("id").single();
      if (error) {
        console.error("Estimate insert error:", error);
        toastActionError(toast, t("Create", "الإنشاء"), t("estimate", "العرض"), error.message || t("Could not create the estimate", "تعذر إنشاء العرض"));
        setLoading(false);
        return;
      }
      estimateId = data.id;
    }

    if (estimateId) {
      const rows = items.map((i) => ({
        estimate_id: estimateId,
        product_id: i.product_id || null,
        description: i.description || null,
        quantity: i.quantity,
        unit_price: i.unit_price,
        tax_rate: i.tax_rate || 0,
        discount_percent: i.discount_percent || 0,
        line_total: i.line_total,
      }));
      const { error: ie } = await supabase.from("estimate_items").insert(rows);
      if (ie) {
        toast({ title: t("The estimate was created without its line items due to an error", "تم إنشاء العرض بدون البنود لخطأ ما"), variant: "destructive" });
      }
    }

    toastActionSuccess(toast, editing ? t("Update", "التحديث") : t("Create", "الإنشاء"), t("estimate", "العرض"));
    setOpen(false);
    resetForm();
    // 🔐 Reload with same explicit governance as initial load (no applyDataVisibilityFilter
    //    because estimates lacks warehouse_id and that helper would add an invalid filter)
    let estReload: any = supabase
      .from("estimates")
      .select("id, company_id, customer_id, estimate_number, estimate_date, expiry_date, subtotal, tax_amount, total_amount, status, notes, branch_id, cost_center_id, created_by_user_id, converted_so_id, branches:branch_id(name), converted_so:converted_so_id(id, so_number)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    const reloadRole = (userContext?.role || "").toLowerCase();
    const reloadPrivileged   = ["owner", "admin", "general_manager"].includes(reloadRole);
    const reloadBranchLevel  = ["manager", "accountant", "branch_manager"].includes(reloadRole);
    const reloadCreatorLevel = ["staff", "sales", "employee"].includes(reloadRole);
    if (reloadPrivileged) {
      // no extra filter
    } else if (reloadBranchLevel && userContext?.branch_id) {
      if (reloadRole === "accountant") {
        estReload = estReload.or(`branch_id.eq.${userContext.branch_id},branch_id.is.null`);
      } else {
        estReload = estReload.eq("branch_id", userContext.branch_id);
      }
    } else if (reloadCreatorLevel && userContext?.user_id) {
      estReload = estReload.eq("created_by_user_id", userContext.user_id);
    }
    const { data: est } = await estReload;
    setEstimates(est || []);
    setLoading(false);
  };

  const convertToSO = async (estimate: Estimate) => {
    // Simplified flow: stash estimate data in sessionStorage and navigate to
    // /sales-orders/new -- the new SO page will read it and prefill the form.
    // This avoids replicating SO insert logic (NOT NULL checks, branch defaults,
    // shipping, currency, etc.) and lets the user review before saving.
    setLoading(true);
    try {
      const { data: estItems } = await supabase
        .from("estimate_items")
        .select("product_id, description, quantity, unit_price, tax_rate, discount_percent")
        .eq("estimate_id", estimate.id);

      const prefill = {
        source: "estimate" as const,
        estimate_id: estimate.id,
        customer_id: estimate.customer_id,
        notes: estimate.notes || "",
        branch_id: estimate.branch_id ?? null,
        cost_center_id: estimate.cost_center_id ?? null,
        items: (estItems || []).map((i: any) => ({
          product_id: i.product_id || null,
          description: i.description || "",
          quantity: Number(i.quantity) || 1,
          unit_price: Number(i.unit_price) || 0,
          tax_rate: Number(i.tax_rate) || 0,
          discount_percent: Number(i.discount_percent) || 0,
        })),
      };
      try {
        sessionStorage.setItem("so_prefill_from_estimate", JSON.stringify(prefill));
      } catch (e) {
        console.warn("sessionStorage unavailable, prefill skipped", e);
      }
      window.location.href = "/sales-orders/new?from=estimate&estimate_id=" + encodeURIComponent(estimate.id);
    } catch (err: any) {
      console.error("convertToSO prepare error:", err);
      toast({ title: t("Could not prepare the data for conversion", "تعذر تحضير البيانات للتحويل"), variant: "destructive" });
      setLoading(false);
    }
  };

  // 🔐 Delete an estimate (with governance)
  //  - Cannot delete if already linked to a Sales Order
  //  - Privileged roles (owner/admin/general_manager): can delete any unlinked estimate
  //  - Other roles: can only delete estimates they themselves created
  const canDeleteEstimate = (e: Estimate): boolean => {
    if (e.converted_so_id) return false;
    const role = (userContext?.role || "").toLowerCase();
    if (["owner", "admin", "general_manager"].includes(role)) return true;
    return !!userContext?.user_id && e.created_by_user_id === userContext.user_id;
  };

  const deleteEstimate = async (estimate: Estimate) => {
    if (!canDeleteEstimate(estimate)) {
      toast({ title: t("You do not have permission to delete this estimate", "لا تملك صلاحية حذف هذا العرض"), variant: "destructive" });
      return;
    }
    if (estimate.converted_so_id) {
      toast({ title: t("An estimate converted to a sales order cannot be deleted", "لا يمكن حذف عرض مُحَوَّل لأمر بيع"), variant: "destructive" });
      return;
    }
    if (!window.confirm(appLang === 'en' ? ("Are you sure you want to delete estimate " + estimate.estimate_number + "?") : ("هل أنت متأكد من حذف عرض السعر " + estimate.estimate_number + "؟"))) return;
    setLoading(true);
    try {
      // First clear estimate_items (RLS allows this via parent join)
      await supabase.from("estimate_items").delete().eq("estimate_id", estimate.id);
      const { error } = await supabase.from("estimates").delete().eq("id", estimate.id);
      if (error) {
        console.error("Delete estimate error:", error);
        toastActionError(toast, t("Delete", "الحذف"), t("estimate", "العرض"), error.message || t("Could not delete", "تعذر الحذف"));
        setLoading(false);
        return;
      }
      toastActionSuccess(toast, t("Delete", "الحذف"), t("estimate", "العرض"));
      setEstimates((prev) => prev.filter((x) => x.id !== estimate.id));
    } catch (err: any) {
      console.error("Delete estimate exception:", err);
      toastActionError(toast, t("Delete", "الحذف"), t("estimate", "العرض"), err?.message || "");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        {/* رأس الصفحة — Migrated to ERPPageHeader (v3.55.0), governance v3.55.5 */}
        <ERPPageHeader
          title={t("Estimates", "العروض السعرية")}
          description={t("Manage customer price quotations", "إدارة عروض الأسعار للعملاء")}
          variant="list"
          lang={appLang}
          actions={<Button onClick={onOpenNew}>{t("New Estimate", "عرض جديد")}</Button>}
          extra={
            (userContext?.role === 'manager' || userContext?.role === 'accountant') ? (
              <p className="text-xs text-blue-600 dark:text-blue-400">
                {t("🏢 Showing estimates for your branch only", "🏢 تعرض العروض الخاصة بفرعك فقط")}
              </p>
            ) : (userContext?.role === 'staff' || userContext?.role === 'sales' || userContext?.role === 'employee') ? (
              <p className="text-xs text-blue-600 dark:text-blue-400">
                {t("👨‍💼 Showing only the estimates you created", "👨‍💼 تعرض العروض التي أنشأتها فقط")}
              </p>
            ) : (
              <p className="text-xs text-green-600 dark:text-green-400">
                {t("👑 All estimates are visible", "👑 جميع العروض السعرية مرئية")}
              </p>
            )
          }
        />

        {/* Filters Section — fully aligned with /sales-orders */}
        <FilterContainer
          title={t("Filters", "الفلاتر")}
          activeCount={activeFilterCount + (branchFilter.selectedBranchId ? 1 : 0)}
          onClear={() => { clearFilters(); branchFilter.resetFilter(); }}
          defaultOpen={false}
        >
          <div className="space-y-4">
            {/* BranchFilter (privileged only — auto-hides internally) */}
            <BranchFilter
              lang={appLang}
              externalHook={branchFilter}
              className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800"
            />

            {/* Employee filter row — privileged only */}
            {canViewAllEstimates && employees.length > 0 && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <UserCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">{t("Filter by employee:", "فلترة حسب الموظف:")}</span>
                <Select value={filterEmployeeId} onValueChange={(value) => setFilterEmployeeId(value)}>
                  <SelectTrigger className="w-[220px] h-9 bg-white dark:bg-slate-800">
                    <SelectValue placeholder={t("All employees", "جميع الموظفين")} />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="p-2 sticky top-0 bg-white dark:bg-slate-950 z-10 border-b">
                      <Input
                        value={employeeSearchQuery}
                        onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                        placeholder={t("Search employees...", "بحث في الموظفين...")}
                        className="text-sm h-8"
                        autoComplete="off"
                      />
                    </div>
                    <SelectItem value="all">{t("All employees", "جميع الموظفين")}</SelectItem>
                    {employees
                      .filter(emp => {
                        if (!employeeSearchQuery.trim()) return true;
                        const q = employeeSearchQuery.toLowerCase();
                        return (
                          emp.display_name.toLowerCase().includes(q) ||
                          (emp.email || "").toLowerCase().includes(q) ||
                          emp.role.toLowerCase().includes(q)
                        );
                      })
                      .map(emp => (
                        <SelectItem key={emp.user_id} value={emp.user_id}>
                          {emp.display_name} <span className="text-xs text-gray-400">({emp.role})</span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {filterEmployeeId !== "all" && (
                  <Button variant="ghost" size="sm" onClick={() => setFilterEmployeeId("all")} className="h-8 px-3 text-blue-600 hover:text-blue-800 hover:bg-blue-100">
                    <X className="w-4 h-4 mr-1" />
                    {t("Clear", "مسح")}
                  </Button>
                )}
              </div>
            )}

            {/* Search + advanced filters grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="sm:col-span-2 lg:col-span-2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder={t("Search by estimate number, customer name...", "بحث برقم العرض، اسم العميل...")}
                    value={searchQuery}
                    onChange={(e) => { const val = e.target.value; startTransition(() => setSearchQuery(val)); }}
                    className={"w-full h-10 px-4 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-700 text-sm " + (isPending ? "opacity-70" : "")}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => startTransition(() => setSearchQuery(""))}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                    >
                      X
                    </button>
                  )}
                </div>
              </div>

              <MultiSelect
                options={[
                  { value: "draft",     label: t("Draft", "مسودة") },
                  { value: "sent",      label: t("Sent", "مُرسَل") },
                  { value: "accepted",  label: t("Accepted", "مقبول") },
                  { value: "rejected",  label: t("Rejected", "مرفوض") },
                  { value: "expired",   label: t("Expired", "منتهي") },
                  { value: "converted", label: t("Converted to Sales Order", "محوَّل لأمر بيع") },
                ]}
                selected={filterStatuses}
                onChange={(val) => startTransition(() => setFilterStatuses(val))}
                placeholder={t("All statuses", "جميع الحالات")}
                searchPlaceholder={t("Search statuses...", "بحث في الحالات...")}
                emptyMessage={t("No statuses found", "لا توجد حالات")}
                className="h-10 text-sm"
              />

              <MultiSelect
                options={customers.map(c => ({ value: c.id, label: c.name }))}
                selected={filterCustomers}
                onChange={(val) => startTransition(() => setFilterCustomers(val))}
                placeholder={t("All customers", "جميع العملاء")}
                searchPlaceholder={t("Search customers...", "بحث في العملاء...")}
                emptyMessage={t("No customers found", "لا يوجد عملاء")}
                className="h-10 text-sm"
              />

              <MultiSelect
                options={products.map(p => ({ value: p.id, label: p.name }))}
                selected={filterProducts}
                onChange={(val) => startTransition(() => setFilterProducts(val))}
                placeholder={t("Filter by products", "فلترة بالمنتجات")}
                searchPlaceholder={t("Search products...", "بحث في المنتجات...")}
                emptyMessage={t("No products found", "لا توجد منتجات")}
                className="h-10 text-sm"
              />

              <div className="space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">{t("From date", "من تاريخ")}</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { const val = e.target.value; startTransition(() => setDateFrom(val)); }}
                  className="h-10 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">{t("To date", "إلى تاريخ")}</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { const val = e.target.value; startTransition(() => setDateTo(val)); }}
                  className="h-10 text-sm"
                />
              </div>
            </div>

            {activeFilterCount > 0 && (
              <div className="flex justify-start items-center pt-2 border-t">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {t("Showing", "عرض")} {filteredEstimates.length} {t("of", "من")} {estimates.length} {t("estimates", "عَرض سعرى")}
                </span>
              </div>
            )}
          </div>
        </FilterContainer>

        <Card className="p-3">
          {loading && <div className="text-sm">{t("Loading...", "جارٍ التحميل...")}</div>}
          {!loading && (
            <>
              <DataTable
                columns={estimateColumns}
                data={paginatedEstimates}
                keyField="id"
                lang={appLang}
                minWidth="min-w-[700px]"
                emptyMessage={t("No estimates found", "لا توجد عروض سعرية")}
              />
              {filteredEstimates.length > 0 && (
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

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{editing ? t("Edit Estimate", "تعديل العرض") : t("New Estimate", "عرض سعري جديد")}</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs">{t("Customer", "العميل")}</label>
                <CustomerSearchSelect
                  customers={customers}
                  value={customerId}
                  onValueChange={setCustomerId}
                  placeholder={t("Select a customer", "اختر العميل")}
                  searchPlaceholder={t("Search by name or phone...", "ابحث بالاسم أو الهاتف...")}
                />
              </div>
              <div>
                <label className="text-xs">{t("Estimate Number", "رقم العرض")}</label>
                <Input value={estimateNumber} onChange={(e) => setEstimateNumber(e.target.value)} />
              </div>
              <div>
                <label className="text-xs">{t("Estimate Date", "تاريخ العرض")}</label>
                <Input type="date" value={estimateDate} onChange={(e) => setEstimateDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs">{t("Expiry Date", "تاريخ الانتهاء")}</label>
                <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs">{t("Notes", "ملاحظات")}</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">{t("Estimate Items", "بنود العرض")}</h3>
                <Button variant="secondary" onClick={addItem}>{t("Add Item", "إضافة بند")}</Button>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th>{t("Product", "المنتج")}</th>
                      <th>{t("Description", "الوصف")}</th>
                      <th>{t("Quantity", "الكمية")}</th>
                      <th>{t("Unit Price", "سعر الوحدة")}</th>
                      <th>{t("Discount %", "خصم %")}</th>
                      <th>{t("Tax %", "ضريبة %")}</th>
                      <th>{t("Total", "الإجمالي")}</th>
                      <th>{t("Delete", "حذف")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={idx} className="border-t">
                        <td>
                          <Select
                            value={it.product_id || ""}
                            onValueChange={(v) => {
                              const prod = products.find((p) => p.id === v);
                              updateItem(idx, { product_id: v, unit_price: prod?.unit_price ?? it.unit_price });
                            }}
                          >
                            <SelectTrigger><SelectValue placeholder={t("Select an item", "اختر الصنف")} /></SelectTrigger>
                            <SelectContent>
                              {products.length === 0 ? (
                                <div className="p-2 text-xs text-gray-500 text-center">{t("No products available", "لا توجد منتجات متاحة")}</div>
                              ) : (
                                products.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>{p.item_type === 'service' ? '🔧 ' : '📦 '}{p.name}</SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </td>
                        <td>
                          <Input value={it.description || ""} onChange={(e) => updateItem(idx, { description: e.target.value })} />
                        </td>
                        <td>
                          <NumericInput value={it.quantity} onChange={(val) => updateItem(idx, { quantity: Math.round(val) })} />
                        </td>
                        <td>
                          <NumericInput value={it.unit_price} onChange={(val) => updateItem(idx, { unit_price: val })} decimalPlaces={2} />
                        </td>
                        <td>
                          <NumericInput value={it.discount_percent || 0} onChange={(val) => updateItem(idx, { discount_percent: val })} decimalPlaces={1} />
                        </td>
                        <td>
                          <NumericInput value={it.tax_rate || 0} onChange={(val) => updateItem(idx, { tax_rate: val })} decimalPlaces={1} />
                        </td>
                        <td>{it.line_total.toFixed(2)}</td>
                        <td>
                          <Button variant="destructive" onClick={() => removeItem(idx)}>{t("Delete", "حذف")}</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs">{t("Total Tax", "ضريبة إجمالية")}</label>
                  <NumericInput value={taxAmount} onChange={(val) => setTaxAmount(val)} decimalPlaces={2} />
                </div>
                <div className="flex items-end">{t("Subtotal:", "المجموع الفرعي:")} {totals.subtotal.toFixed(2)}</div>
                <div className="flex items-end">{t("Total:", "الإجمالي:")} {totals.total.toFixed(2)}</div>
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button onClick={saveEstimate} disabled={loading}>{editing ? t("Save", "حفظ") : t("Create", "إنشاء")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}


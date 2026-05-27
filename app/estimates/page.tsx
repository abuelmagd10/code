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
import { FileText } from "lucide-react";
import { ERPPageHeader } from "@/components/erp-page-header";
import { CustomerSearchSelect } from "@/components/CustomerSearchSelect";
import { getActiveCompanyId } from "@/lib/company";
import { buildDataVisibilityFilter, applyDataVisibilityFilter } from "@/lib/data-visibility-control";
import type { UserContext } from "@/lib/validation";

type Customer = { id: string; name: string; phone?: string | null };
type Member   = { user_id: string; full_name?: string | null; email?: string | null; role?: string };
type Product = { id: string; name: string; unit_price?: number; item_type?: 'product' | 'service'; branch_id?: string | null };

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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  // 🔐 Governance context (role + branch + creator scope)
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  // Members (only loaded for privileged roles, used for "filter by employee")
  const [members, setMembers] = useState<Member[]>([]);

  // Filter state — aligned with /sales-orders pattern (MultiSelect for status + customer, single select for employee)
  const [filterStatuses, setFilterStatuses]   = useState<string[]>([]);
  const [filterCustomers, setFilterCustomers] = useState<string[]>([]);
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

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
  }, [estimates, filterStatuses, filterCustomers, filterEmployeeId, dateFrom, dateTo, searchQuery, customers]);

  const activeFilterCount = [
    filterStatuses.length > 0,
    filterCustomers.length > 0,
    filterEmployeeId !== "all",
    !!dateFrom,
    !!dateTo,
    !!searchQuery,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setFilterStatuses([]);
    setFilterCustomers([]);
    setFilterEmployeeId("all");
    setDateFrom("");
    setDateTo("");
    setSearchQuery("");
  };

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
          toastActionError(toast, "خطأ في تحميل المنتجات", prodErr.message);
        }
        setProducts(prod || []);

        // 🔐 Estimates query — explicit governance (estimates has no warehouse_id,
        // so we can't use applyDataVisibilityFilter as-is). Mirrors /customers pattern.
        let estQuery: any = supabase
          .from("estimates")
          .select("id, company_id, customer_id, estimate_number, estimate_date, expiry_date, subtotal, tax_amount, total_amount, status, notes, branch_id, cost_center_id, created_by_user_id")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false });

        if (privileged) {
          // All company estimates — no extra filter
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
      } catch (err: any) {
        console.error("Estimates load error:", err);
        toastActionError(toast, "خطأ في التحميل", err?.message || "");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [supabase, toast]);

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
      sonnerToast.error("الرجاء اختيار العميل");
      return;
    }
    if (!estimateNumber) {
      sonnerToast.error("رقم العرض مطلوب");
      return;
    }
    setLoading(true);

    // 🔐 Required for RLS: company_id must be in payload (can_modify_data check)
    const companyId = await getActiveCompanyId(supabase);
    if (!companyId) {
      toastActionError(toast, "خطأ", "العرض", "تعذر تحديد الشركة");
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
        toastActionError(toast, "التحديث", "العرض", error.message || "تعذر تحديث العرض");
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
        toastActionError(toast, "الإنشاء", "العرض", error.message || "تعذر إنشاء العرض");
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
        toast({ title: "تم إنشاء العرض بدون البنود لخطأ ما", variant: "destructive" });
      }
    }

    toastActionSuccess(toast, editing ? "التحديث" : "الإنشاء", "العرض");
    setOpen(false);
    resetForm();
    // 🔐 Reload with visibility filter (same governance as initial load)
    let estReload: any = supabase
      .from("estimates")
      .select("id, company_id, customer_id, estimate_number, estimate_date, expiry_date, subtotal, tax_amount, total_amount, status, notes, branch_id, cost_center_id, created_by_user_id")
      .order("created_at", { ascending: false });
    if (userContext) {
      const rules = buildDataVisibilityFilter(userContext);
      estReload = applyDataVisibilityFilter(estReload, rules, "estimates");
    } else {
      estReload = estReload.eq("company_id", companyId);
    }
    const { data: est } = await estReload;
    setEstimates(est || []);
    setLoading(false);
  };

  const convertToSO = async (estimate: Estimate) => {
    setLoading(true);
    // 🔐 Required for RLS on sales_orders
    const companyId = estimate.company_id || (await getActiveCompanyId(supabase));
    if (!companyId) {
      toast({ title: "تعذر تحديد الشركة", variant: "destructive" });
      setLoading(false);
      return;
    }
    // 🔐 Inherit governance scoping from the source estimate
    const { data: { user } } = await supabase.auth.getUser();
    const soPayload = {
      company_id: companyId,
      customer_id: estimate.customer_id,
      so_number: `SO-${Date.now()}`,
      so_date: new Date().toISOString().slice(0, 10),
      due_date: null,
      subtotal: estimate.subtotal,
      tax_amount: estimate.tax_amount,
      total_amount: estimate.total_amount,
      status: "draft",
      notes: estimate.notes || null,
      branch_id: estimate.branch_id ?? userContext?.branch_id ?? null,
      cost_center_id: estimate.cost_center_id ?? userContext?.cost_center_id ?? null,
      created_by_user_id: user?.id ?? null,
    };
    const { data: so, error } = await supabase.from("sales_orders").insert(soPayload).select("id").single();
    if (error) {
      toast({ title: "تعذر التحويل لأمر بيع", variant: "destructive" });
      setLoading(false);
      return;
    }
    const { data: estItems } = await supabase
      .from("estimate_items")
      .select("product_id, description, quantity, unit_price, tax_rate, discount_percent, line_total")
      .eq("estimate_id", estimate.id);
    if (estItems && estItems.length) {
      const rows = estItems.map((i: any) => ({
        sales_order_id: so.id,
        product_id: i.product_id || null,
        description: i.description || null,
        quantity: i.quantity,
        unit_price: i.unit_price,
        tax_rate: i.tax_rate || 0,
        discount_percent: i.discount_percent || 0,
        line_total: i.line_total,
      }));
      await supabase.from("sales_order_items").insert(rows);
    }
    await supabase.from("estimates").update({ status: "converted" }).eq("id", estimate.id);
    toastActionSuccess(toast, "التحويل", "إلى أمر بيع");
    const { data: est } = await supabase
      .from("estimates")
      .select("id, company_id, customer_id, estimate_number, estimate_date, expiry_date, subtotal, tax_amount, total_amount, status, notes")
      .order("created_at", { ascending: false });
    setEstimates(est || []);
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        {/* رأس الصفحة — Migrated to ERPPageHeader (v3.55.0), governance v3.55.5 */}
        <ERPPageHeader
          title="العروض السعرية"
          description="إدارة عروض الأسعار للعملاء"
          variant="list"
          lang="ar"
          actions={<Button onClick={onOpenNew}>عرض جديد</Button>}
          extra={
            (userContext?.role === 'manager' || userContext?.role === 'accountant') ? (
              <p className="text-xs text-blue-600 dark:text-blue-400">
                🏢 تعرض العروض الخاصة بفرعك فقط
              </p>
            ) : (userContext?.role === 'staff' || userContext?.role === 'sales' || userContext?.role === 'employee') ? (
              <p className="text-xs text-blue-600 dark:text-blue-400">
                👨‍💼 تعرض العروض التي أنشأتها فقط
              </p>
            ) : (
              <p className="text-xs text-green-600 dark:text-green-400">
                👑 جميع العروض السعرية مرئية
              </p>
            )
          }
        />

        {/* Filters bar — aligned with /sales-orders pattern (MultiSelect status + customer, employee for privileged) */}
        <Card className="p-3 mb-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600 dark:text-gray-400">بحث</label>
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="رقم العرض أو اسم العميل"
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400">الحالة</label>
              <MultiSelect
                options={[
                  { value: "draft",     label: "مسودة" },
                  { value: "sent",      label: "مُرسَل" },
                  { value: "accepted",  label: "مقبول" },
                  { value: "rejected",  label: "مرفوض" },
                  { value: "expired",   label: "منتهي" },
                  { value: "converted", label: "محوَّل لأمر بيع" },
                ]}
                selected={filterStatuses}
                onChange={setFilterStatuses}
                placeholder="جميع الحالات"
                searchPlaceholder="بحث في الحالات..."
                emptyMessage="لا توجد حالات"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400">العميل</label>
              {/* 🔐 قائمة العملاء مَفلتَرة بالحوكمة (مُطابق لِنَمط /sales-orders) */}
              <MultiSelect
                options={customers.map((c) => ({ value: c.id, label: c.name }))}
                selected={filterCustomers}
                onChange={setFilterCustomers}
                placeholder="جميع العملاء"
                searchPlaceholder="بحث في العملاء..."
                emptyMessage="لا يوجد عملاء"
                className="h-9 text-sm"
              />
            </div>
            {/* 🔐 Employee filter — only for privileged roles */}
            {['owner', 'admin', 'general_manager'].includes((userContext?.role || '').toLowerCase()) && (
              <div>
                <label className="text-xs text-gray-600 dark:text-gray-400">الموظف المُنشئ</label>
                <Select value={filterEmployeeId} onValueChange={setFilterEmployeeId}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.full_name || m.email || m.user_id.slice(0, 8)} <span className="text-xs text-gray-400">({(m as any).role || ""})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400">من تاريخ</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400">إلى تاريخ</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
            </div>
          </div>
          {activeFilterCount > 0 && (
            <div className="flex items-center justify-between mt-3 pt-2 border-t">
              <span className="text-xs text-gray-500">
                {activeFilterCount} فلتر نشط — {filteredEstimates.length} من {estimates.length}
              </span>
              <Button variant="outline" size="sm" onClick={clearFilters}>مسح الفلاتر</Button>
            </div>
          )}
        </Card>

        <Card className="p-3">
          {loading && <div className="text-sm">جارٍ التحميل...</div>}
          {!loading && (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th>رقم العرض</th>
                    <th>العميل</th>
                    <th>التاريخ</th>
                    <th>المجموع</th>
                    <th>الحالة</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEstimates.map((e) => (
                    <tr key={e.id} className="border-t">
                      <td>{e.estimate_number}</td>
                      <td>{customers.find((c) => c.id === e.customer_id)?.name || ""}</td>
                      <td>{e.estimate_date}</td>
                      <td>{e.total_amount.toFixed(2)}</td>
                      <td>{e.status}</td>
                      <td className="space-x-2">
                        <Button variant="secondary" onClick={() => onEdit(e)}>
                          تعديل
                        </Button>
                        <Button variant="outline" onClick={() => convertToSO(e)} disabled={e.status === "converted"}>
                          تحويل لأمر بيع
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{editing ? "تعديل العرض" : "عرض سعري جديد"}</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs">العميل</label>
                <CustomerSearchSelect
                  customers={customers}
                  value={customerId}
                  onValueChange={setCustomerId}
                  placeholder="اختر العميل"
                  searchPlaceholder="ابحث بالاسم أو الهاتف..."
                />
              </div>
              <div>
                <label className="text-xs">رقم العرض</label>
                <Input value={estimateNumber} onChange={(e) => setEstimateNumber(e.target.value)} />
              </div>
              <div>
                <label className="text-xs">تاريخ العرض</label>
                <Input type="date" value={estimateDate} onChange={(e) => setEstimateDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs">تاريخ الانتهاء</label>
                <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs">ملاحظات</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">بنود العرض</h3>
                <Button variant="secondary" onClick={addItem}>إضافة بند</Button>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th>المنتج</th>
                      <th>الوصف</th>
                      <th>الكمية</th>
                      <th>سعر الوحدة</th>
                      <th>خصم %</th>
                      <th>ضريبة %</th>
                      <th>الإجمالي</th>
                      <th>حذف</th>
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
                            <SelectTrigger><SelectValue placeholder="اختر الصنف" /></SelectTrigger>
                            <SelectContent>
                              {products.length === 0 ? (
                                <div className="p-2 text-xs text-gray-500 text-center">لا توجد منتجات متاحة</div>
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
                          <Button variant="destructive" onClick={() => removeItem(idx)}>حذف</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs">ضريبة إجمالية</label>
                  <NumericInput value={taxAmount} onChange={(val) => setTaxAmount(val)} decimalPlaces={2} />
                </div>
                <div className="flex items-end">المجموع الفرعي: {totals.subtotal.toFixed(2)}</div>
                <div className="flex items-end">الإجمالي: {totals.total.toFixed(2)}</div>
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button onClick={saveEstimate} disabled={loading}>{editing ? "حفظ" : "إنشاء"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}


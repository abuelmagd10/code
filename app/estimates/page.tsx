"use client";

import { useEffect, useMemo, useState } from "react";
import { useSupabase } from "@/lib/supabase/hooks";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { toast as sonnerToast } from "sonner";
import { useToast } from "@/hooks/use-toast";
import { toastActionError, toastActionSuccess } from "@/lib/notifications";
import { FileText } from "lucide-react";
import { CustomerSearchSelect } from "@/components/CustomerSearchSelect";

type Customer = { id: string; name: string; phone?: string | null };
type Product = { id: string; name: string; sale_price?: number; item_type?: 'product' | 'service' };

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

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Estimate | null>(null);

  const [customerId, setCustomerId] = useState<string>("");
  const [estimateNumber, setEstimateNumber] = useState<string>("");
  const [estimateDate, setEstimateDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [items, setItems] = useState<EstimateItem[]>([]);
  const [taxAmount, setTaxAmount] = useState<number>(0);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, i) => sum + i.line_total, 0);
    const total = subtotal + taxAmount;
    return { subtotal, total };
  }, [items, taxAmount]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: cust } = await supabase.from("customers").select("id, name, phone").order("name");
      setCustomers(cust || []);
      const { data: prod } = await supabase.from("products").select("id, name, sale_price").order("name");
      setProducts(prod || []);
      const { data: est } = await supabase
        .from("estimates")
        .select("id, company_id, customer_id, estimate_number, estimate_date, expiry_date, subtotal, tax_amount, total_amount, status, notes")
        .order("created_at", { ascending: false });
      setEstimates(est || []);
      setLoading(false);
    };
    load();
  }, [supabase]);

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
    const payload = {
      customer_id: customerId,
      estimate_number: estimateNumber,
      estimate_date: estimateDate,
      expiry_date: expiryDate || null,
      subtotal: Number(totals.subtotal.toFixed(2)),
      tax_amount: Number(taxAmount.toFixed(2)),
      total_amount: Number(totals.total.toFixed(2)),
      status: editing ? editing.status : "draft",
      notes: notes || null,
    };
    let estimateId = editing?.id;
    if (editing) {
      const { error } = await supabase.from("estimates").update(payload).eq("id", editing.id);
      if (error) {
        toastActionError(toast, "التحديث", "العرض", "تعذر تحديث العرض");
        setLoading(false);
        return;
      }
      // replace items
      await supabase.from("estimate_items").delete().eq("estimate_id", editing.id);
      estimateId = editing.id;
    } else {
      const { data, error } = await supabase.from("estimates").insert(payload).select("id").single();
      if (error) {
        toastActionError(toast, "الإنشاء", "العرض", "تعذر إنشاء العرض");
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
    const { data: est } = await supabase
      .from("estimates")
      .select("id, company_id, customer_id, estimate_number, estimate_date, expiry_date, subtotal, tax_amount, total_amount, status, notes")
      .order("created_at", { ascending: false });
    setEstimates(est || []);
    setLoading(false);
  };

  const convertToSO = async (estimate: Estimate) => {
    setLoading(true);
    const soPayload = {
      customer_id: estimate.customer_id,
      so_number: `SO-${Date.now()}`,
      so_date: new Date().toISOString().slice(0, 10),
      due_date: null,
      subtotal: estimate.subtotal,
      tax_amount: estimate.tax_amount,
      total_amount: estimate.total_amount,
      status: "draft",
      notes: estimate.notes || null,
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
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 space-y-6">
        {/* رأس الصفحة */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
                <FileText className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">العروض السعرية</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">إدارة العروض السعرية للعملاء</p>
              </div>
            </div>
            <Button onClick={onOpenNew}>عرض جديد</Button>
          </div>
        </div>

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
                {estimates.map((e) => (
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
                            updateItem(idx, { product_id: v, unit_price: prod?.sale_price || it.unit_price });
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="اختر الصنف" /></SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.item_type === 'service' ? '🔧 ' : '📦 '}{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td>
                        <Input value={it.description || ""} onChange={(e) => updateItem(idx, { description: e.target.value })} />
                      </td>
                      <td>
                        <Input type="number" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                      </td>
                      <td>
                        <Input type="number" value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })} />
                      </td>
                      <td>
                        <Input type="number" value={it.discount_percent || 0} onChange={(e) => updateItem(idx, { discount_percent: Number(e.target.value) })} />
                      </td>
                      <td>
                        <Input type="number" value={it.tax_rate || 0} onChange={(e) => updateItem(idx, { tax_rate: Number(e.target.value) })} />
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
                <Input type="number" value={taxAmount} onChange={(e) => setTaxAmount(Number(e.target.value))} />
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


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
import { ShoppingCart } from "lucide-react";
import { CustomerSearchSelect } from "@/components/CustomerSearchSelect";

type Customer = { id: string; name: string; phone?: string | null };
type Product = { id: string; name: string; sale_price?: number; item_type?: 'product' | 'service' };

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
  status: string;
  notes?: string | null;
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

export default function SalesOrdersPage() {
  const supabase = useSupabase();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SalesOrder | null>(null);

  const [customerId, setCustomerId] = useState<string>("");
  const [soNumber, setSONumber] = useState<string>("");
  const [soDate, setSODate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [items, setItems] = useState<SOItem[]>([]);
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
      const { data: so } = await supabase
        .from("sales_orders")
        .select("id, company_id, customer_id, so_number, so_date, due_date, subtotal, tax_amount, total_amount, status, notes")
        .order("created_at", { ascending: false });
      setOrders(so || []);
      setLoading(false);
    };
    load();
  }, [supabase]);

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
    const payload = {
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
    setLoading(true);
    const invPayload = {
      customer_id: so.customer_id,
      invoice_number: `INV-${Date.now()}`,
      invoice_date: new Date().toISOString().slice(0, 10),
      due_date: null,
      subtotal: so.subtotal,
      tax_amount: so.tax_amount,
      total_amount: so.total_amount,
      status: "draft",
      notes: so.notes || null,
    } as any;
    // Attempt insertion aligned with existing invoices schema
    const { data: inv, error } = await supabase.from("invoices").insert(invPayload).select("id").single();
    if (error) {
      toast({ title: "تعذر التحويل لفاتورة", variant: "destructive" });
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
      }));
      await supabase.from("invoice_items").insert(rows);
    }
    await supabase.from("sales_orders").update({ status: "invoiced" }).eq("id", so.id);
    toastActionSuccess(toast, "التحويل", "إلى فاتورة");
    const { data: list } = await supabase
      .from("sales_orders")
      .select("id, company_id, customer_id, so_number, so_date, due_date, subtotal, tax_amount, total_amount, status, notes")
      .order("created_at", { ascending: false });
    setOrders(list || []);
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        {/* رأس الصفحة - تحسين للهاتف */}
        <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-green-100 dark:bg-green-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">أوامر البيع</h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">أوامر بيع العملاء</p>
              </div>
            </div>
            <Button onClick={onOpenNew} className="h-10 sm:h-11 text-sm sm:text-base">أمر بيع جديد</Button>
          </div>
        </div>

        <Card className="p-3">
        {loading && <div className="text-sm">جارٍ التحميل...</div>}
        {!loading && (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th>رقم أمر البيع</th>
                  <th>العميل</th>
                  <th>التاريخ</th>
                  <th>المجموع</th>
                  <th>الحالة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-t">
                    <td>{o.so_number}</td>
                    <td>{customers.find((c) => c.id === o.customer_id)?.name || ""}</td>
                    <td>{o.so_date}</td>
                    <td>{o.total_amount.toFixed(2)}</td>
                    <td>{o.status}</td>
                    <td className="space-x-2">
                      <Button variant="secondary" onClick={() => onEdit(o)}>
                        تعديل
                      </Button>
                      <Button variant="outline" onClick={() => convertToInvoice(o)} disabled={o.status === "invoiced"}>
                        تحويل لفاتورة
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
            <DialogTitle>{editing ? "تعديل أمر البيع" : "أمر بيع جديد"}</DialogTitle>
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
              <label className="text-xs">رقم أمر البيع</label>
              <Input value={soNumber} onChange={(e) => setSONumber(e.target.value)} />
            </div>
            <div>
              <label className="text-xs">تاريخ أمر البيع</label>
              <Input type="date" value={soDate} onChange={(e) => setSODate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs">تاريخ الاستحقاق</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs">ملاحظات</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">بنود أمر البيع</h3>
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
            <Button onClick={saveSO} disabled={loading}>{editing ? "حفظ" : "إنشاء"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </main>
    </div>
  );
}


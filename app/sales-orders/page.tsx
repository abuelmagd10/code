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
import { ShoppingCart, Plus, Eye, Pencil, Trash2, FileText, AlertCircle } from "lucide-react";
import { CustomerSearchSelect } from "@/components/CustomerSearchSelect";
import { canAction } from "@/lib/authz";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Customer = { id: string; name: string; phone?: string | null };
type Product = { id: string; name: string; unit_price?: number; item_type?: 'product' | 'service' };

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
};

type LinkedInvoice = {
  id: string;
  status: string;
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
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [permRead, setPermRead] = useState(false);
  const [permWrite, setPermWrite] = useState(false);
  const [permUpdate, setPermUpdate] = useState(false);
  const [permDelete, setPermDelete] = useState(false);
  const [appLang, setAppLang] = useState<'ar'|'en'>(() => {
    if (typeof window === 'undefined') return 'ar'
    try {
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      return (fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar'
    } catch { return 'ar' }
  });
  const [hydrated, setHydrated] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<SalesOrder | null>(null);
  const [linkedInvoices, setLinkedInvoices] = useState<Record<string, LinkedInvoice>>({});

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SalesOrder | null>(null);

  const [customerId, setCustomerId] = useState<string>("");
  const [soNumber, setSONumber] = useState<string>("");
  const [soDate, setSODate] = useState<string>(new Date().toISOString().slice(0, 10));
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
        canAction(supabase, "sales_orders", "read"),
        canAction(supabase, "sales_orders", "write"),
        canAction(supabase, "sales_orders", "update"),
        canAction(supabase, "sales_orders", "delete"),
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
      const { data: cust } = await supabase.from("customers").select("id, name, phone").order("name");
      setCustomers(cust || []);
      const { data: prod } = await supabase.from("products").select("id, name, unit_price, item_type").order("name");
      setProducts(prod || []);
      const { data: so } = await supabase
        .from("sales_orders")
        .select("id, company_id, customer_id, so_number, so_date, due_date, subtotal, tax_amount, total_amount, total, status, notes, currency, invoice_id")
        .order("created_at", { ascending: false });
      setOrders(so || []);

      // Load linked invoices status
      const invoiceIds = (so || []).filter(o => o.invoice_id).map(o => o.invoice_id);
      if (invoiceIds.length > 0) {
        const { data: invoices } = await supabase
          .from("invoices")
          .select("id, status")
          .in("id", invoiceIds);
        const invoiceMap: Record<string, LinkedInvoice> = {};
        (invoices || []).forEach((inv: any) => {
          invoiceMap[inv.id] = { id: inv.id, status: inv.status };
        });
        setLinkedInvoices(invoiceMap);
      }

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
      total_amount: so.total_amount || so.total,
      status: "draft",
      notes: so.notes || null,
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
      }));
      await supabase.from("invoice_items").insert(rows);
    }
    await supabase.from("sales_orders").update({ status: "invoiced" }).eq("id", so.id);
    toastActionSuccess(toast, appLang === 'en' ? "Converted" : "التحويل", appLang === 'en' ? "to invoice" : "إلى فاتورة");
    const { data: list } = await supabase
      .from("sales_orders")
      .select("id, company_id, customer_id, so_number, so_date, due_date, subtotal, tax_amount, total_amount, total, status, notes, currency")
      .order("created_at", { ascending: false });
    setOrders(list || []);
    setLoading(false);
  };

  const handleDeleteOrder = async () => {
    if (!orderToDelete) return;
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
        {/* Header */}
        <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-green-100 dark:bg-green-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                  {appLang === 'en' ? 'Sales Orders' : 'أوامر البيع'}
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                  {appLang === 'en' ? 'Manage customer sales orders' : 'إدارة أوامر بيع العملاء'}
                </p>
              </div>
            </div>
            {permWrite && (
              <Link href="/sales-orders/new">
                <Button className="h-10 sm:h-11 text-sm sm:text-base bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  {appLang === 'en' ? 'New Sales Order' : 'أمر بيع جديد'}
                </Button>
              </Link>
            )}
          </div>
        </div>

        <Card className="p-4 dark:bg-slate-900 dark:border-slate-800">
        {loading && (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        )}
        {!loading && orders.length === 0 && (
          <div className="text-center py-12">
            <ShoppingCart className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {appLang === 'en' ? 'No sales orders yet' : 'لا توجد أوامر بيع بعد'}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {appLang === 'en' ? 'Create your first sales order to get started' : 'أنشئ أمر البيع الأول للبدء'}
            </p>
            {permWrite && (
              <Link href="/sales-orders/new">
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  {appLang === 'en' ? 'Create Sales Order' : 'إنشاء أمر بيع'}
                </Button>
              </Link>
            )}
          </div>
        )}
        {!loading && orders.length > 0 && (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                  <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'SO Number' : 'رقم أمر البيع'}</th>
                  <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Customer' : 'العميل'}</th>
                  <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                  <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Total' : 'المجموع'}</th>
                  <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Status' : 'الحالة'}</th>
                  <th className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Actions' : 'إجراءات'}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const total = o.total || o.total_amount || 0;
                  const currency = o.currency || 'EGP';
                  // Check linked invoice status
                  const linkedInvoice = o.invoice_id ? linkedInvoices[o.invoice_id] : null;
                  const invoiceStatus = linkedInvoice?.status || 'draft';
                  // Can edit/delete only if invoice is still draft (not sent, paid, or partially_paid)
                  const canEditDelete = invoiceStatus === 'draft';
                  // Display status from linked invoice if exists, otherwise from sales order
                  const displayStatus = linkedInvoice ? invoiceStatus : o.status;
                  return (
                    <tr key={o.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="py-3 px-2 font-medium text-blue-600 dark:text-blue-400">{o.so_number}</td>
                      <td className="py-3 px-2 text-gray-700 dark:text-gray-300">{customers.find((c) => c.id === o.customer_id)?.name || "-"}</td>
                      <td className="py-3 px-2 text-gray-600 dark:text-gray-400">{o.so_date}</td>
                      <td className="py-3 px-2 font-medium text-gray-900 dark:text-white">{currencySymbols[currency] || currency}{total.toFixed(2)}</td>
                      <td className="py-3 px-2">{getStatusBadge(displayStatus)}</td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-1">
                          {/* View */}
                          <Link href={`/sales-orders/${o.id}`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title={appLang === 'en' ? 'View' : 'عرض'}>
                              <Eye className="h-4 w-4 text-gray-500" />
                            </Button>
                          </Link>
                          {/* Edit - only if linked invoice is draft */}
                          {canEditDelete && permUpdate && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(o)} title={appLang === 'en' ? 'Edit' : 'تعديل'}>
                              <Pencil className="h-4 w-4 text-blue-500" />
                            </Button>
                          )}
                          {/* Delete - only if linked invoice is draft */}
                          {canEditDelete && permDelete && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setOrderToDelete(o); setDeleteConfirmOpen(true); }} title={appLang === 'en' ? 'Delete' : 'حذف'}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                          {/* Convert to Invoice - only if no linked invoice yet */}
                          {!o.invoice_id && permWrite && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => convertToInvoice(o)} title={appLang === 'en' ? 'Convert to Invoice' : 'تحويل لفاتورة'}>
                              <FileText className="h-4 w-4 text-green-500" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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


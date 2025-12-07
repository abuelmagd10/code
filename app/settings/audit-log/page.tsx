"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";
import { CompanyHeader } from "@/components/company-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  History,
  Plus,
  Pencil,
  Trash2,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Calendar,
  User,
  FileText,
  Eye,
  Filter,
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Loader2,
  Undo2,
} from "lucide-react";
import Link from "next/link";

interface AuditLog {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  action: "INSERT" | "UPDATE" | "DELETE" | "REVERT";
  target_table: string;
  record_id: string;
  record_identifier: string;
  old_data: any;
  new_data: any;
  changed_fields: string[];
  created_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ActivitySummary {
  total: number;
  inserts: number;
  updates: number;
  deletes: number;
}

interface UserOption {
  user_id: string;
  user_email: string;
  user_name: string;
}

// ترجمة أسماء الجداول
const tableNameTranslations: Record<string, string> = {
  invoices: "الفواتير",
  bills: "المشتريات",
  products: "المنتجات",
  customers: "العملاء",
  suppliers: "الموردين",
  payments: "المدفوعات",
  journal_entries: "القيود اليومية",
  journal_entry_lines: "خطوط القيود",
  chart_of_accounts: "شجرة الحسابات",
  tax_codes: "رموز الضرائب",
  estimates: "عروض الأسعار",
  estimate_items: "عناصر عروض الأسعار",
  sales_orders: "أوامر البيع",
  sales_order_items: "عناصر أوامر البيع",
  purchase_orders: "أوامر الشراء",
  purchase_order_items: "عناصر أوامر الشراء",
  sales_returns: "مردودات المبيعات",
  shareholders: "المساهمين",
  inventory_transactions: "حركات المخزون",
  invoice_items: "عناصر الفواتير",
  bill_items: "عناصر المشتريات",
};

// دالة ترجمة أسماء الجداول (خارج المكون للاستخدام العام)
const translateTable = (table: string): string => {
  return tableNameTranslations[table] || table;
};

// ترجمة أسماء الحقول
const fieldTranslations: Record<string, string> = {
  id: "المعرف",
  name: "الاسم",
  email: "البريد الإلكتروني",
  phone: "الهاتف",
  address: "العنوان",
  total_amount: "المبلغ الإجمالي",
  subtotal: "المجموع الفرعي",
  status: "الحالة",
  invoice_number: "رقم الفاتورة",
  bill_number: "رقم فاتورة المشتريات",
  invoice_date: "تاريخ الفاتورة",
  due_date: "تاريخ الاستحقاق",
  paid_amount: "المبلغ المدفوع",
  price: "السعر",
  cost: "التكلفة",
  quantity: "الكمية",
  description: "الوصف",
  notes: "ملاحظات",
  account_name: "اسم الحساب",
  account_code: "رقم الحساب",
  account_id: "الحساب",
  debit: "مدين",
  credit: "دائن",
  rate: "النسبة",
  updated_at: "تاريخ التحديث",
  created_at: "تاريخ الإنشاء",
  company_id: "الشركة",
  customer_id: "العميل",
  supplier_id: "المورد",
  invoice_id: "الفاتورة",
  bill_id: "فاتورة المشتريات",
  payment_date: "تاريخ الدفع",
  payment_method: "طريقة الدفع",
  amount: "المبلغ",
  reference_number: "رقم المرجع",
  journal_entry_id: "القيد اليومي",
  is_deleted: "محذوف",
  deleted_at: "تاريخ الحذف",
  deleted_by: "حذف بواسطة",
  purchase_order_id: "أمر الشراء",
};

// ترجمة قيم الحقول
const valueTranslations: Record<string, Record<string, string>> = {
  payment_method: {
    cash: "نقدي",
    bank: "تحويل بنكي",
    check: "شيك",
    credit_card: "بطاقة ائتمان",
    refund: "استرداد",
    customer_credit: "رصيد عميل",
  },
  status: {
    draft: "مسودة",
    pending: "قيد الانتظار",
    paid: "مدفوعة",
    partially_paid: "مدفوعة جزئياً",
    overdue: "متأخرة",
    cancelled: "ملغاة",
    active: "نشط",
    inactive: "غير نشط",
  },
};

// الحقول التي يجب إخفاؤها
const hiddenFields = ["company_id", "deleted_at", "deleted_by", "is_deleted", "journal_entry_id"];

// تنسيق القيمة للعرض
const formatValue = (key: string, value: any): string => {
  if (value === null || value === undefined) return "-";
  if (value === true) return "نعم";
  if (value === false) return "لا";

  // ترجمة القيم المعروفة
  if (valueTranslations[key] && valueTranslations[key][value]) {
    return valueTranslations[key][value];
  }

  // تنسيق التواريخ
  if (key.includes("date") || key.includes("_at")) {
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString("ar-EG", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: key.includes("_at") ? "2-digit" : undefined,
          minute: key.includes("_at") ? "2-digit" : undefined,
        });
      }
    } catch {
      return String(value);
    }
  }

  // تنسيق المبالغ
  if (key.includes("amount") || key === "price" || key === "cost" || key === "subtotal" || key === "total") {
    const num = Number(value);
    if (!isNaN(num)) {
      return num.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ج.م";
    }
  }

  // اختصار UUIDs
  if (typeof value === "string" && value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    return value.slice(0, 8) + "...";
  }

  return String(value);
};

// استخراج معرف مفهوم من البيانات
const getReadableIdentifier = (log: AuditLog): string => {
  const data = log.new_data || log.old_data;
  if (!data) return log.record_identifier;

  // حسب نوع الجدول
  switch (log.target_table) {
    case "invoices":
      return data.invoice_number || `فاتورة ${log.record_identifier.slice(0, 8)}`;
    case "bills":
      return data.bill_number || `فاتورة مشتريات ${log.record_identifier.slice(0, 8)}`;
    case "payments":
      const amount = data.amount ? `${Math.abs(data.amount).toLocaleString("ar-EG")} ج.م` : "";
      const method = valueTranslations.payment_method?.[data.payment_method] || data.payment_method || "";
      if (data.notes) {
        // استخراج وصف مختصر من الملاحظات
        const shortNote = data.notes.length > 40 ? data.notes.slice(0, 40) + "..." : data.notes;
        return shortNote;
      }
      return `${method} ${amount}`.trim() || `دفعة ${log.record_identifier.slice(0, 8)}`;
    case "customers":
      return data.name || `عميل ${log.record_identifier.slice(0, 8)}`;
    case "suppliers":
      return data.name || `مورد ${log.record_identifier.slice(0, 8)}`;
    case "products":
      return data.name || `منتج ${log.record_identifier.slice(0, 8)}`;
    case "journal_entries":
      return data.reference_number || `قيد ${log.record_identifier.slice(0, 8)}`;
    case "chart_of_accounts":
      return data.account_name || data.name || `حساب ${log.record_identifier.slice(0, 8)}`;
    case "estimates":
      return data.estimate_number || `عرض سعر ${log.record_identifier.slice(0, 8)}`;
    case "sales_orders":
      return data.order_number || `أمر بيع ${log.record_identifier.slice(0, 8)}`;
    case "purchase_orders":
      return data.order_number || `أمر شراء ${log.record_identifier.slice(0, 8)}`;
    case "sales_returns":
      return data.return_number || `مرتجع ${log.record_identifier.slice(0, 8)}`;
    default:
      return data.name || data.number || log.record_identifier.slice(0, 8);
  }
};

// وصف العملية بشكل مفهوم
const getActionDescription = (log: AuditLog): string => {
  const tableName = translateTable(log.target_table);
  const identifier = getReadableIdentifier(log);

  switch (log.action) {
    case "INSERT":
      return `تم إضافة ${tableName}: ${identifier}`;
    case "UPDATE":
      const fieldsCount = log.changed_fields?.length || 0;
      return `تم تعديل ${tableName}: ${identifier} (${fieldsCount} ${fieldsCount === 1 ? "حقل" : "حقول"})`;
    case "DELETE":
      return `تم حذف ${tableName}: ${identifier}`;
    case "REVERT":
      return `تم التراجع عن عملية في ${tableName}`;
    default:
      return `${log.action} - ${tableName}`;
  }
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
  });
  const [summary, setSummary] = useState<ActivitySummary>({
    total: 0,
    inserts: 0,
    updates: 0,
    deletes: 0,
  });
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [relatedLogs, setRelatedLogs] = useState<any[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  // فلاتر
  const [filters, setFilters] = useState({
    action: "",
    table: "",
    userId: "",
    startDate: "",
    endDate: "",
    search: "",
  });
  const [showFilters, setShowFilters] = useState(false);

  const fetchLogs = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(),
      });

      if (filters.action) params.append("action", filters.action);
      if (filters.table) params.append("table", filters.table);
      if (filters.userId) params.append("user_id", filters.userId);
      if (filters.startDate) params.append("start_date", filters.startDate);
      if (filters.endDate) params.append("end_date", filters.endDate);
      if (filters.search) params.append("search", filters.search);

      const res = await fetch(`/api/audit-logs?${params}`);
      const data = await res.json();

      if (res.ok) {
        setLogs(data.logs || []);
        setPagination(data.pagination);
        setSummary(data.summary);
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleFilterChange = () => {
    fetchLogs(1);
  };

  const clearFilters = () => {
    setFilters({
      action: "",
      table: "",
      userId: "",
      startDate: "",
      endDate: "",
      search: "",
    });
    setTimeout(() => fetchLogs(1), 100);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case "INSERT":
        return <Plus className="h-4 w-4" />;
      case "UPDATE":
        return <Pencil className="h-4 w-4" />;
      case "DELETE":
        return <Trash2 className="h-4 w-4" />;
      case "REVERT":
        return <Undo2 className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case "INSERT":
        return "bg-green-100 text-green-700 border-green-200";
      case "UPDATE":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "DELETE":
        return "bg-red-100 text-red-700 border-red-200";
      case "REVERT":
        return "bg-purple-100 text-purple-700 border-purple-200";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getActionText = (action: string) => {
    switch (action) {
      case "INSERT":
        return "إضافة";
      case "UPDATE":
        return "تعديل";
      case "DELETE":
        return "حذف";
      case "REVERT":
        return "تراجع";
      default:
        return action;
    }
  };

  // دالة التراجع عن عملية
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: "revert" | "delete" | "revert_batch";
    log: AuditLog | null;
  }>({ open: false, type: "revert", log: null });

  // جلب السجلات المرتبطة
  const fetchRelatedLogs = async (logId: string) => {
    setLoadingRelated(true);
    try {
      const res = await fetch("/api/audit-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId, action: "get_related" }),
      });
      const data = await res.json();
      if (data.success && data.related) {
        setRelatedLogs(data.related);
      }
    } catch (error) {
      console.error("Error fetching related logs:", error);
    } finally {
      setLoadingRelated(false);
    }
  };

  // التراجع الشامل
  const handleBatchRevert = async (log: AuditLog) => {
    setActionLoading(log.id);
    try {
      const res = await fetch("/api/audit-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId: log.id, action: "revert_batch" }),
      });
      const data = await res.json();

      setConfirmDialog({ open: false, type: "revert_batch", log: null });
      setSelectedLog(null);
      setRelatedLogs([]);
      setActionLoading(null);

      if (data.success) {
        fetchLogs(pagination.page);
        alert(`✅ ${data.message}`);
      } else {
        alert(`❌ ${data.error}`);
      }
    } catch (error) {
      setConfirmDialog({ open: false, type: "revert_batch", log: null });
      setSelectedLog(null);
      setActionLoading(null);
      alert("❌ حدث خطأ أثناء التراجع الشامل");
    }
  };

  const handleRevert = async (log: AuditLog) => {
    setActionLoading(log.id);
    try {
      const res = await fetch("/api/audit-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId: log.id, action: "revert" }),
      });
      const data = await res.json();

      // إغلاق جميع النوافذ أولاً
      setConfirmDialog({ open: false, type: "revert", log: null });
      setSelectedLog(null);
      setActionLoading(null);

      if (data.success) {
        fetchLogs(pagination.page);
        alert(`✅ ${data.message}`);
      } else {
        alert(`❌ ${data.error}`);
      }
    } catch (error) {
      setConfirmDialog({ open: false, type: "revert", log: null });
      setSelectedLog(null);
      setActionLoading(null);
      alert("❌ حدث خطأ أثناء التراجع");
    }
  };

  const handleDelete = async (log: AuditLog) => {
    setActionLoading(log.id);
    try {
      const res = await fetch("/api/audit-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId: log.id, action: "delete" }),
      });
      const data = await res.json();

      // إغلاق جميع النوافذ أولاً
      setConfirmDialog({ open: false, type: "delete", log: null });
      setSelectedLog(null);
      setActionLoading(null);

      if (data.success) {
        fetchLogs(pagination.page);
        alert("✅ تم حذف السجل");
      } else {
        alert(`❌ ${data.error}`);
      }
    } catch (error) {
      setConfirmDialog({ open: false, type: "delete", log: null });
      setSelectedLog(null);
      setActionLoading(null);
      alert("❌ حدث خطأ أثناء الحذف");
    }
  };

  const translateField = (field: string) => {
    return fieldTranslations[field] || field;
  };

  // مكون عرض التفاصيل
  const DetailsDialog = () => {
    if (!selectedLog) return null;

    return (
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-purple-600" />
              تفاصيل العملية
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* معلومات أساسية */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">المستخدم</p>
                <p className="font-medium">{selectedLog.user_name || selectedLog.user_email}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">التاريخ</p>
                <p className="font-medium">{formatDate(selectedLog.created_at)}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">نوع العملية</p>
                <Badge className={getActionColor(selectedLog.action)}>
                  {getActionIcon(selectedLog.action)}
                  <span className="mr-1">{getActionText(selectedLog.action)}</span>
                </Badge>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">الجدول</p>
                <p className="font-medium">{translateTable(selectedLog.target_table)}</p>
              </div>
            </div>

            {/* السجل */}
            <div className="bg-purple-50 p-3 rounded-lg">
              <p className="text-xs text-gray-500">السجل</p>
              <p className="font-medium text-purple-700">{selectedLog.record_identifier}</p>
            </div>

            {/* الحقول المتغيرة */}
            {selectedLog.action === "UPDATE" && selectedLog.changed_fields?.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">الحقول المتغيرة:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedLog.changed_fields.map((field) => (
                    <Badge key={field} variant="outline" className="bg-yellow-50">
                      {translateField(field)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* البيانات القديمة والجديدة */}
            {selectedLog.action === "UPDATE" && selectedLog.changed_fields && (
              <div>
                <p className="text-sm font-medium mb-2">التغييرات:</p>
                <div className="bg-gray-50 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="py-2 px-3 text-right font-medium text-gray-600">الحقل</th>
                        <th className="py-2 px-3 text-right font-medium text-red-600">القيمة السابقة</th>
                        <th className="py-2 px-3 text-right font-medium text-green-600">القيمة الجديدة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedLog.changed_fields
                        .filter((field: string) => !hiddenFields.includes(field))
                        .map((field: string) => (
                          <tr key={field} className="border-t border-gray-200">
                            <td className="py-2 px-3 font-medium text-gray-700">
                              {translateField(field)}
                            </td>
                            <td className="py-2 px-3 bg-red-50 text-red-700">
                              {formatValue(field, selectedLog.old_data?.[field])}
                            </td>
                            <td className="py-2 px-3 bg-green-50 text-green-700">
                              {formatValue(field, selectedLog.new_data?.[field])}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedLog.action === "INSERT" && selectedLog.new_data && (
              <div>
                <p className="text-sm font-medium mb-2 text-green-600">البيانات المضافة:</p>
                <div className="bg-green-50 p-3 rounded-lg max-h-64 overflow-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {Object.entries(selectedLog.new_data)
                        .filter(([key]) => !hiddenFields.includes(key))
                        .map(([key, value]) => (
                          <tr key={key} className="border-b border-green-100 last:border-0">
                            <td className="py-2 px-2 font-medium text-gray-600 w-1/3">
                              {translateField(key)}
                            </td>
                            <td className="py-2 px-2 text-gray-800">
                              {formatValue(key, value)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedLog.action === "DELETE" && selectedLog.old_data && (
              <div>
                <p className="text-sm font-medium mb-2 text-red-600">البيانات المحذوفة:</p>
                <div className="bg-red-50 p-3 rounded-lg max-h-64 overflow-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {Object.entries(selectedLog.old_data)
                        .filter(([key]) => !hiddenFields.includes(key))
                        .map(([key, value]) => (
                          <tr key={key} className="border-b border-red-100 last:border-0">
                            <td className="py-2 px-2 font-medium text-gray-600 w-1/3">
                              {translateField(key)}
                            </td>
                            <td className="py-2 px-2 text-gray-800">
                              {formatValue(key, value)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* قسم إجراءات المالك */}
            {selectedLog.action !== "REVERT" && (
              <div className="border-t pt-4 space-y-4">
                {/* البحث عن العمليات المرتبطة */}
                <div className="bg-gradient-to-r from-slate-50 to-gray-50 p-4 rounded-xl border">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-purple-600" />
                      <p className="text-sm font-medium text-gray-700">العمليات المرتبطة</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fetchRelatedLogs(selectedLog.id)}
                      disabled={loadingRelated}
                      className="bg-white"
                    >
                      {loadingRelated ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                      <span className="mr-1">بحث عن المرتبطة</span>
                    </Button>
                  </div>

                  {relatedLogs.length > 0 ? (
                    <div className="bg-white rounded-lg border overflow-hidden">
                      <div className="max-h-32 overflow-auto divide-y">
                        {relatedLogs.map((rel, idx) => (
                          <div key={idx} className="flex items-center justify-between py-2 px-3 text-sm hover:bg-gray-50">
                            <div className="flex items-center gap-2">
                              <Badge className={`text-xs ${
                                rel.action === "INSERT" ? "bg-green-100 text-green-700" :
                                rel.action === "UPDATE" ? "bg-blue-100 text-blue-700" :
                                rel.action === "DELETE" ? "bg-red-100 text-red-700" : "bg-gray-100"
                              }`}>
                                {getActionText(rel.action)}
                              </Badge>
                              <span className="text-gray-700 font-medium">{translateTable(rel.target_table)}</span>
                            </div>
                            <span className="text-xs text-gray-400">{rel.record_identifier?.slice(0, 8)}...</span>
                          </div>
                        ))}
                      </div>
                      <div className="bg-amber-50 px-3 py-2 border-t">
                        <p className="text-xs text-amber-700 font-medium">
                          ⚠️ سيتم التراجع عن {relatedLogs.length} عملية عند استخدام التراجع الشامل
                        </p>
                      </div>
                    </div>
                  ) : !loadingRelated ? (
                    <p className="text-xs text-gray-500 text-center py-2">
                      اضغط "بحث عن المرتبطة" لعرض العمليات المرتبطة
                    </p>
                  ) : null}
                </div>

                {/* أزرار الإجراءات */}
                <div className="space-y-3">
                  {/* التراجع الشامل */}
                  <Button
                    onClick={() => {
                      fetchRelatedLogs(selectedLog.id);
                      setConfirmDialog({ open: true, type: "revert_batch", log: selectedLog });
                    }}
                    className="w-full h-12 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600 shadow-lg"
                    disabled={actionLoading === selectedLog.id}
                  >
                    {actionLoading === selectedLog.id ? (
                      <Loader2 className="h-5 w-5 ml-2 animate-spin" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 ml-2" />
                    )}
                    <span className="font-bold">التراجع الشامل</span>
                    <span className="text-xs opacity-80 mr-2">(إلغاء العملية + كل المرتبطة)</span>
                  </Button>

                  <div className="flex gap-3">
                    {/* التراجع الجزئي */}
                    <Button
                      onClick={() => setConfirmDialog({ open: true, type: "revert", log: selectedLog })}
                      className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                      disabled={actionLoading === selectedLog.id}
                    >
                      {actionLoading === selectedLog.id ? (
                        <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                      ) : (
                        <Undo2 className="h-4 w-4 ml-2" />
                      )}
                      تراجع جزئي
                    </Button>

                    {/* حذف السجل */}
                    <Button
                      variant="outline"
                      onClick={() => setConfirmDialog({ open: true, type: "delete", log: selectedLog })}
                      className="text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-red-600"
                      disabled={actionLoading === selectedLog.id}
                    >
                      <Trash2 className="h-4 w-4 ml-2" />
                      حذف السجل
                    </Button>
                  </div>

                  {/* تنويه */}
                  <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                    <p className="font-medium mb-1">💡 الفرق بين التراجع الشامل والجزئي:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-blue-600">
                      <li><strong>التراجع الشامل:</strong> يلغي العملية وكل العمليات المرتبطة بها (القيود، المخزون، العناصر...)</li>
                      <li><strong>التراجع الجزئي:</strong> يلغي هذه العملية فقط بدون المرتبطة</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* رسالة للعمليات التي تم التراجع عنها */}
            {selectedLog.action === "REVERT" && (
              <div className="border-t pt-4">
                <div className="bg-purple-50 rounded-lg p-4 text-center">
                  <Undo2 className="h-8 w-8 text-purple-400 mx-auto mb-2" />
                  <p className="text-purple-700 font-medium">تم التراجع عن هذه العملية مسبقاً</p>
                  <p className="text-xs text-purple-500 mt-1">لا يمكن إجراء المزيد من العمليات على هذا السجل</p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  // نافذة تأكيد الإجراء
  const ConfirmDialog = () => {
    if (!confirmDialog.open || !confirmDialog.log) return null;

    return (
      <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ ...confirmDialog, open: false })}>
        <DialogContent className={confirmDialog.type === "revert_batch" ? "max-w-xl" : "max-w-md"}>
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${
              confirmDialog.type === "revert_batch" ? "text-red-600" :
              confirmDialog.type === "revert" ? "text-purple-600" : "text-amber-600"
            }`}>
              {confirmDialog.type === "revert_batch" ? (
                <AlertTriangle className="h-5 w-5" />
              ) : confirmDialog.type === "revert" ? (
                <Undo2 className="h-5 w-5" />
              ) : (
                <Trash2 className="h-5 w-5" />
              )}
              {confirmDialog.type === "revert_batch" ? "⚠️ تأكيد التراجع الشامل" :
               confirmDialog.type === "revert" ? "تأكيد التراجع الجزئي" : "تأكيد حذف السجل"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* معلومات السجل */}
            <div className="bg-gray-50 p-3 rounded-lg border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">العملية المحددة</p>
                  <p className="font-medium text-gray-800">{getReadableIdentifier(confirmDialog.log)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={getActionColor(confirmDialog.log.action)}>
                    {getActionText(confirmDialog.log.action)}
                  </Badge>
                  <Badge variant="outline">{translateTable(confirmDialog.log.target_table)}</Badge>
                </div>
              </div>
            </div>

            {/* التراجع الشامل */}
            {confirmDialog.type === "revert_batch" && (
              <div className="space-y-3">
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <p className="font-bold text-red-800 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    تحذير: إجراء لا يمكن التراجع عنه!
                  </p>
                  <p className="text-sm text-red-600 mt-2">
                    سيتم إلغاء هذه العملية وجميع العمليات التي تمت معها:
                  </p>
                </div>

                {relatedLogs.length > 0 ? (
                  <div className="bg-white border rounded-lg overflow-hidden">
                    <div className="bg-amber-50 px-3 py-2 border-b">
                      <p className="text-sm font-medium text-amber-800">
                        📋 العمليات التي سيتم إلغاؤها ({relatedLogs.length} عملية):
                      </p>
                    </div>
                    <div className="max-h-40 overflow-auto divide-y">
                      {relatedLogs.map((rel, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2 px-3 text-sm">
                          <div className="flex items-center gap-2">
                            <Badge className={`text-xs ${
                              rel.action === "INSERT" ? "bg-green-100 text-green-700" :
                              rel.action === "UPDATE" ? "bg-blue-100 text-blue-700" :
                              rel.action === "DELETE" ? "bg-red-100 text-red-700" : "bg-gray-100"
                            }`}>
                              {getActionText(rel.action)}
                            </Badge>
                            <span className="text-gray-700">{translateTable(rel.target_table)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : loadingRelated ? (
                  <div className="flex items-center justify-center py-4 text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin ml-2" />
                    جاري البحث عن العمليات المرتبطة...
                  </div>
                ) : (
                  <div className="bg-green-50 p-3 rounded-lg border border-green-200 text-center">
                    <p className="text-sm text-green-700">✅ لم يتم العثور على عمليات مرتبطة</p>
                    <p className="text-xs text-green-600">سيتم التراجع عن هذه العملية فقط</p>
                  </div>
                )}
              </div>
            )}

            {/* التراجع الجزئي */}
            {confirmDialog.type === "revert" && (
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <p className="font-medium text-purple-800">التراجع الجزئي</p>
                <p className="text-sm text-purple-600 mt-2">
                  {confirmDialog.log.action === "INSERT" && "✓ سيتم حذف السجل الذي تمت إضافته فقط"}
                  {confirmDialog.log.action === "UPDATE" && "✓ سيتم استرجاع البيانات السابقة فقط"}
                  {confirmDialog.log.action === "DELETE" && "✓ سيتم استعادة السجل المحذوف فقط"}
                </p>
                <p className="text-xs text-purple-500 mt-2">
                  ⚠️ ملاحظة: لن يتم إلغاء العمليات المرتبطة (القيود، المخزون، إلخ)
                </p>
              </div>
            )}

            {/* حذف السجل */}
            {confirmDialog.type === "delete" && (
              <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                <p className="font-medium text-amber-800">حذف سجل المراجعة</p>
                <p className="text-sm text-amber-600 mt-2">
                  سيتم حذف سجل المراجعة فقط من قاعدة البيانات.
                </p>
                <p className="text-xs text-amber-500 mt-2">
                  ✓ البيانات الفعلية لن تتأثر
                </p>
              </div>
            )}

            {/* أزرار الإجراء */}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => {
                  if (confirmDialog.type === "revert") {
                    handleRevert(confirmDialog.log!);
                  } else if (confirmDialog.type === "revert_batch") {
                    handleBatchRevert(confirmDialog.log!);
                  } else {
                    handleDelete(confirmDialog.log!);
                  }
                }}
                className={`flex-1 ${
                  confirmDialog.type === "revert_batch"
                    ? "bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600"
                    : confirmDialog.type === "revert"
                    ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
                disabled={actionLoading === confirmDialog.log.id}
              >
                {actionLoading === confirmDialog.log.id ? (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                ) : confirmDialog.type === "revert_batch" ? (
                  <AlertTriangle className="h-4 w-4 ml-2" />
                ) : confirmDialog.type === "revert" ? (
                  <Undo2 className="h-4 w-4 ml-2" />
                ) : (
                  <Trash2 className="h-4 w-4 ml-2" />
                )}
                {confirmDialog.type === "revert_batch"
                  ? `تأكيد التراجع الشامل ${relatedLogs.length > 0 ? `(${relatedLogs.length} عملية)` : ''}`
                  : confirmDialog.type === "revert"
                  ? "تأكيد التراجع الجزئي"
                  : "تأكيد الحذف"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirmDialog({ ...confirmDialog, open: false })}
                disabled={actionLoading === confirmDialog.log.id}
              >
                إلغاء
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };


  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900" dir="rtl">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <CompanyHeader />
          {/* رأس الصفحة */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-4">
              <Link href="/settings">
                <Button variant="outline" size="icon" className="rounded-full flex-shrink-0">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg flex-shrink-0">
                  <History className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-800 dark:text-gray-100 truncate">سجل المراجعة</h1>
                  <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm truncate">تتبع العمليات</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className={showFilters ? "bg-purple-100 dark:bg-purple-900" : ""}
              >
                <Filter className="h-4 w-4 ml-2" />
                فلترة
              </Button>
              <Button
                variant="outline"
                onClick={() => fetchLogs(pagination.page)}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ml-2 ${loading ? "animate-spin" : ""}`} />
                تحديث
              </Button>
            </div>
          </div>

        {/* بطاقات الملخص */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm">إجمالي العمليات</p>
                  <p className="text-3xl font-bold">{summary.total}</p>
                  <p className="text-purple-200 text-xs">آخر 7 أيام</p>
                </div>
                <Activity className="h-10 w-10 text-purple-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm">إضافات</p>
                  <p className="text-3xl font-bold">{summary.inserts}</p>
                  <p className="text-green-200 text-xs">سجلات جديدة</p>
                </div>
                <TrendingUp className="h-10 w-10 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm">تعديلات</p>
                  <p className="text-3xl font-bold">{summary.updates}</p>
                  <p className="text-blue-200 text-xs">تحديثات</p>
                </div>
                <Pencil className="h-10 w-10 text-blue-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-red-100 text-sm">حذف</p>
                  <p className="text-3xl font-bold">{summary.deletes}</p>
                  <p className="text-red-200 text-xs">سجلات محذوفة</p>
                </div>
                <TrendingDown className="h-10 w-10 text-red-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* فلاتر */}
        {showFilters && (
          <Card className="shadow-lg border-0">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="بحث..."
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    className="pr-10"
                  />
                </div>

                <Select
                  value={filters.action}
                  onValueChange={(v) => setFilters({ ...filters, action: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="نوع العملية" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="INSERT">إضافة</SelectItem>
                    <SelectItem value="UPDATE">تعديل</SelectItem>
                    <SelectItem value="DELETE">حذف</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={filters.table}
                  onValueChange={(v) => setFilters({ ...filters, table: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="الجدول" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {Object.entries(tableNameTranslations).map(([key, value]) => (
                      <SelectItem key={key} value={key}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={filters.userId}
                  onValueChange={(v) => setFilters({ ...filters, userId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="المستخدم" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.user_id} value={user.user_id}>
                        {user.user_name || user.user_email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  placeholder="من تاريخ"
                />

                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                    placeholder="إلى تاريخ"
                  />
                  <Button onClick={handleFilterChange} className="bg-purple-600 hover:bg-purple-700">
                    تطبيق
                  </Button>
                  <Button variant="outline" onClick={clearFilters}>
                    مسح
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}


        {/* جدول السجلات */}
        <Card className="shadow-lg border-0">
          <CardHeader className="bg-gradient-to-l from-purple-600 to-indigo-600 text-white rounded-t-lg">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              سجلات النشاط
              <Badge className="bg-white/20 text-white mr-2">
                {pagination.total} سجل
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                <History className="h-16 w-16 mb-4 text-gray-300" />
                <p className="text-lg">لا توجد سجلات</p>
                <p className="text-sm">ستظهر هنا جميع العمليات التي يقوم بها المستخدمون</p>
              </div>
            ) : (
              <div className="divide-y">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedLog(log)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        {/* أيقونة العملية */}
                        <div className={`p-2 rounded-lg ${
                          log.action === "INSERT" ? "bg-green-100" :
                          log.action === "UPDATE" ? "bg-blue-100" :
                          "bg-red-100"
                        }`}>
                          {getActionIcon(log.action)}
                        </div>

                        {/* تفاصيل */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={getActionColor(log.action)}>
                              {getActionText(log.action)}
                            </Badge>
                            <span className="font-medium">{translateTable(log.target_table)}</span>
                          </div>
                          {/* الوصف المفهوم */}
                          <p className="text-gray-800 font-medium">
                            {getReadableIdentifier(log)}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <User className="h-3 w-3" />
                            <span>{log.user_name || log.user_email}</span>
                            <span>•</span>
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(log.created_at)}</span>
                          </div>
                          {log.action === "UPDATE" && log.changed_fields?.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap mt-1">
                              <span className="text-xs text-gray-400">تم تعديل:</span>
                              {log.changed_fields.slice(0, 3).map((field) => (
                                <Badge key={field} variant="outline" className="text-xs bg-yellow-50">
                                  {translateField(field)}
                                </Badge>
                              ))}
                              {log.changed_fields.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{log.changed_fields.length - 3}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* زر التفاصيل */}
                      <Button variant="ghost" size="sm" className="text-purple-600">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* التصفح */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t bg-gray-50">
                <div className="text-sm text-gray-500">
                  صفحة {pagination.page} من {pagination.totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchLogs(pagination.page - 1)}
                    disabled={pagination.page <= 1 || loading}
                  >
                    <ChevronRight className="h-4 w-4" />
                    السابق
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchLogs(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages || loading}
                  >
                    التالي
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        </div>{/* End of space-y-4 */}

        {/* نافذة التفاصيل */}
        <DetailsDialog />

        {/* نافذة التأكيد */}
        <ConfirmDialog />
      </main>
    </div>
  );
}

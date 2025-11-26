"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import Link from "next/link";

interface AuditLog {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  table_name: string;
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
  chart_of_accounts: "شجرة الحسابات",
  tax_codes: "رموز الضرائب",
  estimates: "عروض الأسعار",
  sales_orders: "أوامر البيع",
  purchase_orders: "أوامر الشراء",
  sales_returns: "مردودات المبيعات",
  shareholders: "المساهمين",
  inventory_transactions: "حركات المخزون",
};

// ترجمة أسماء الحقول
const fieldTranslations: Record<string, string> = {
  name: "الاسم",
  email: "البريد الإلكتروني",
  phone: "الهاتف",
  address: "العنوان",
  total_amount: "المبلغ الإجمالي",
  subtotal: "المجموع الفرعي",
  status: "الحالة",
  invoice_number: "رقم الفاتورة",
  bill_number: "رقم الفاتورة",
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
  debit: "مدين",
  credit: "دائن",
  rate: "النسبة",
  updated_at: "تاريخ التحديث",
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
      default:
        return action;
    }
  };

  const translateField = (field: string) => {
    return fieldTranslations[field] || field;
  };

  const translateTable = (table: string) => {
    return tableNameTranslations[table] || table;
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
                <p className="font-medium">{translateTable(selectedLog.table_name)}</p>
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
            {selectedLog.action === "UPDATE" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium mb-2 text-red-600">البيانات السابقة:</p>
                  <pre className="bg-red-50 p-3 rounded-lg text-xs overflow-auto max-h-48 text-right" dir="ltr">
                    {JSON.stringify(selectedLog.old_data, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2 text-green-600">البيانات الجديدة:</p>
                  <pre className="bg-green-50 p-3 rounded-lg text-xs overflow-auto max-h-48 text-right" dir="ltr">
                    {JSON.stringify(selectedLog.new_data, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {selectedLog.action === "INSERT" && selectedLog.new_data && (
              <div>
                <p className="text-sm font-medium mb-2 text-green-600">البيانات المضافة:</p>
                <pre className="bg-green-50 p-3 rounded-lg text-xs overflow-auto max-h-48 text-right" dir="ltr">
                  {JSON.stringify(selectedLog.new_data, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.action === "DELETE" && selectedLog.old_data && (
              <div>
                <p className="text-sm font-medium mb-2 text-red-600">البيانات المحذوفة:</p>
                <pre className="bg-red-50 p-3 rounded-lg text-xs overflow-auto max-h-48 text-right" dir="ltr">
                  {JSON.stringify(selectedLog.old_data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-indigo-50 p-4 md:p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* رأس الصفحة */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/settings">
              <Button variant="outline" size="icon" className="rounded-full">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg">
                <History className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">سجل المراجعة</h1>
                <p className="text-gray-500 text-sm">تتبع جميع العمليات التي يقوم بها المستخدمون</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={showFilters ? "bg-purple-100" : ""}
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
                            <span className="font-medium">{translateTable(log.table_name)}</span>
                            <span className="text-purple-600 font-medium">#{log.record_identifier}</span>
                          </div>
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
      </div>

      {/* نافذة التفاصيل */}
      <DetailsDialog />
    </div>
  );
}

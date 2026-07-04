"use client";

import { useState, useEffect, useCallback } from "react";
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
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Download,
  FileSpreadsheet,
  FileDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  LogIn,
  Settings,
  Shield,
  Clock,
  X,
  ChevronDown,
  Check,
  XCircle,
  Info,
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";

// أنواع العمليات (Phase 1 Enhanced)
type ActionType =
  | "INSERT"
  | "UPDATE"
  | "DELETE"
  | "REVERT"
  | "APPROVE"
  | "POST"
  | "CANCEL"
  | "REVERSE"
  | "CLOSE"
  | "LOGIN"
  | "LOGOUT"
  | "ACCESS_DENIED"
  | "SETTINGS"
  | "PERMISSIONS";

interface AuditLog {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  action: ActionType;
  target_table: string;
  record_id: string;
  record_identifier: string;
  old_data: any;
  new_data: any;
  changed_fields: string[];
  created_at: string;
  ip_address?: string;
  user_agent?: string;
  // v3.62.3 — generic metadata for non-CRUD actions (backup_*, LOGIN, etc.)
  metadata?: Record<string, any> | null;
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
  logins?: number;
  settings?: number;
}

interface UserOption {
  user_id: string;
  user_email: string;
  user_name: string;
}

interface Branch {
  id: string;
  name: string;
}

interface CostCenter {
  id: string;
  name: string;
  branch_id: string;
}

// ترتيب
type SortField = "created_at" | "user_name" | "action" | "target_table";
type SortOrder = "asc" | "desc";

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
  inventory_write_offs: "إهلاك المخزون",
  company_members: "أعضاء الفريق",
  company_role_permissions: "صلاحيات الأدوار",
  companies: "الشركات",
  user_sessions: "جلسات المستخدمين",
  settings: "الإعدادات",
  // v3.62.3 — backup-related
  backup_history: "سجل النسخ الاحتياطية",
  system: "النظام",
};

// English table name labels (display-only)
const tableNameTranslationsEn: Record<string, string> = {
  invoices: "Invoices",
  bills: "Purchases",
  products: "Products",
  customers: "Customers",
  suppliers: "Suppliers",
  payments: "Payments",
  journal_entries: "Journal Entries",
  journal_entry_lines: "Journal Entry Lines",
  chart_of_accounts: "Chart of Accounts",
  tax_codes: "Tax Codes",
  estimates: "Estimates",
  estimate_items: "Estimate Items",
  sales_orders: "Sales Orders",
  sales_order_items: "Sales Order Items",
  purchase_orders: "Purchase Orders",
  purchase_order_items: "Purchase Order Items",
  sales_returns: "Sales Returns",
  shareholders: "Shareholders",
  inventory_transactions: "Inventory Transactions",
  invoice_items: "Invoice Items",
  bill_items: "Bill Items",
  inventory_write_offs: "Inventory Write-offs",
  company_members: "Team Members",
  company_role_permissions: "Role Permissions",
  companies: "Companies",
  user_sessions: "User Sessions",
  settings: "Settings",
  // v3.62.3 — backup-related
  backup_history: "Backup History",
  system: "System",
};

// تصنيف الموارد
const resourceCategories: Record<string, { name: string; nameEn: string; icon: string; tables: string[] }> = {
  sales: {
    name: "المبيعات",
    nameEn: "Sales",
    icon: "📈",
    tables: ["invoices", "invoice_items", "customers", "estimates", "estimate_items", "sales_orders", "sales_order_items", "sales_returns"],
  },
  purchases: {
    name: "المشتريات",
    nameEn: "Purchases",
    icon: "📦",
    tables: ["bills", "bill_items", "suppliers", "purchase_orders", "purchase_order_items"],
  },
  inventory: {
    name: "المخزون",
    nameEn: "Inventory",
    icon: "🏭",
    tables: ["products", "inventory_transactions", "inventory_write_offs"],
  },
  accounting: {
    name: "المحاسبة",
    nameEn: "Accounting",
    icon: "📊",
    tables: ["journal_entries", "journal_entry_lines", "chart_of_accounts", "payments", "tax_codes"],
  },
  users: {
    name: "المستخدمين",
    nameEn: "Users",
    icon: "👥",
    tables: ["company_members", "company_role_permissions", "user_sessions"],
  },
  settings: {
    name: "الإعدادات",
    nameEn: "Settings",
    icon: "⚙️",
    tables: ["companies", "settings"],
  },
};

// دالة ترجمة أسماء الجداول (خارج المكون للاستخدام العام)
const translateTable = (table: string, lang: 'ar' | 'en' = 'ar'): string => {
  if (lang === 'en') return tableNameTranslationsEn[table] || tableNameTranslations[table] || table;
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
  // v3.62.3 — backup metadata fields
  total_records: "إجمالى السجلات",
  size_mb: "الحجم (ميجابايت)",
  size_bytes: "الحجم (بايت)",
  duration_seconds: "المدة (ثانية)",
  history_id: "رقم النسخة",
  storage_path: "مسار التخزين",
  records_restored: "السجلات المستعادة",
  success: "نجح",
  errors: "الأخطاء",
  warnings: "تحذيرات",
  error: "خطأ",
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

// English field name labels (display-only)
const fieldTranslationsEn: Record<string, string> = {
  id: "ID",
  name: "Name",
  email: "Email",
  phone: "Phone",
  address: "Address",
  total_amount: "Total Amount",
  subtotal: "Subtotal",
  status: "Status",
  invoice_number: "Invoice Number",
  bill_number: "Bill Number",
  invoice_date: "Invoice Date",
  due_date: "Due Date",
  paid_amount: "Paid Amount",
  price: "Price",
  cost: "Cost",
  quantity: "Quantity",
  description: "Description",
  notes: "Notes",
  // v3.62.3 — backup metadata fields
  total_records: "Total Records",
  size_mb: "Size (MB)",
  size_bytes: "Size (Bytes)",
  duration_seconds: "Duration (Seconds)",
  history_id: "Backup ID",
  storage_path: "Storage Path",
  records_restored: "Records Restored",
  success: "Success",
  errors: "Errors",
  warnings: "Warnings",
  error: "Error",
  account_name: "Account Name",
  account_code: "Account Code",
  account_id: "Account",
  debit: "Debit",
  credit: "Credit",
  rate: "Rate",
  updated_at: "Updated At",
  created_at: "Created At",
  company_id: "Company",
  customer_id: "Customer",
  supplier_id: "Supplier",
  invoice_id: "Invoice",
  bill_id: "Bill",
  payment_date: "Payment Date",
  payment_method: "Payment Method",
  amount: "Amount",
  reference_number: "Reference Number",
  journal_entry_id: "Journal Entry",
  is_deleted: "Deleted",
  deleted_at: "Deleted At",
  deleted_by: "Deleted By",
  purchase_order_id: "Purchase Order",
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

// English value labels (display-only)
const valueTranslationsEn: Record<string, Record<string, string>> = {
  payment_method: {
    cash: "Cash",
    bank: "Bank Transfer",
    check: "Check",
    credit_card: "Credit Card",
    refund: "Refund",
    customer_credit: "Customer Credit",
  },
  status: {
    draft: "Draft",
    pending: "Pending",
    paid: "Paid",
    partially_paid: "Partially Paid",
    overdue: "Overdue",
    cancelled: "Cancelled",
    active: "Active",
    inactive: "Inactive",
  },
};

// الحقول التي يجب إخفاؤها
const hiddenFields = ["company_id", "deleted_at", "deleted_by", "is_deleted", "journal_entry_id"];

// تنسيق القيمة للعرض
const formatValue = (key: string, value: any, lang: 'ar' | 'en' = 'ar'): string => {
  if (value === null || value === undefined) return "-";
  if (value === true) return lang === 'en' ? "Yes" : "نعم";
  if (value === false) return lang === 'en' ? "No" : "لا";

  // ترجمة القيم المعروفة
  const vmap = lang === 'en' ? valueTranslationsEn : valueTranslations;
  if (vmap[key] && vmap[key][value]) {
    return vmap[key][value];
  }

  // تنسيق التواريخ
  if (key.includes("date") || key.includes("_at")) {
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString(lang === 'en' ? "en-US" : "ar-EG", {
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
      return num.toLocaleString(lang === 'en' ? "en-US" : "ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (lang === 'en' ? " EGP" : " ج.م");
    }
  }

  // اختصار UUIDs
  if (typeof value === "string" && value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    return value.slice(0, 8) + "...";
  }

  return String(value);
};

// استخراج معرف مفهوم من البيانات
const getReadableIdentifier = (log: AuditLog, lang: 'ar' | 'en' = 'ar'): string => {
  const data = log.new_data || log.old_data;
  const shortId = log.record_identifier?.slice(0, 8) || "---";

  if (!data) return log.record_identifier || shortId;

  // حسب نوع الجدول
  switch (log.target_table) {
    case "invoices":
      return data.invoice_number || (lang === 'en' ? `Invoice ${shortId}` : `فاتورة ${shortId}`);
    case "bills":
      return data.bill_number || (lang === 'en' ? `Purchase Bill ${shortId}` : `فاتورة مشتريات ${shortId}`);
    case "payments":
      const amount = data.amount ? `${Math.abs(data.amount).toLocaleString(lang === 'en' ? "en-US" : "ar-EG")} ${lang === 'en' ? "EGP" : "ج.م"}` : "";
      const method = (lang === 'en' ? valueTranslationsEn : valueTranslations).payment_method?.[data.payment_method] || data.payment_method || "";
      if (data.notes) {
        // استخراج وصف مختصر من الملاحظات
        const shortNote = data.notes.length > 40 ? data.notes.slice(0, 40) + "..." : data.notes;
        return shortNote;
      }
      return `${method} ${amount}`.trim() || (lang === 'en' ? `Payment ${shortId}` : `دفعة ${shortId}`);
    case "customers":
      return data.name || (lang === 'en' ? `Customer ${shortId}` : `عميل ${shortId}`);
    case "suppliers":
      return data.name || (lang === 'en' ? `Supplier ${shortId}` : `مورد ${shortId}`);
    case "products":
      return data.name || (lang === 'en' ? `Product ${shortId}` : `منتج ${shortId}`);
    case "journal_entries":
      return data.reference_number || (lang === 'en' ? `Journal Entry ${shortId}` : `قيد ${shortId}`);
    case "chart_of_accounts":
      return data.account_name || data.name || (lang === 'en' ? `Account ${shortId}` : `حساب ${shortId}`);
    case "estimates":
      return data.estimate_number || (lang === 'en' ? `Estimate ${shortId}` : `عرض سعر ${shortId}`);
    case "sales_orders":
      return data.order_number || (lang === 'en' ? `Sales Order ${shortId}` : `أمر بيع ${shortId}`);
    case "purchase_orders":
      return data.order_number || (lang === 'en' ? `Purchase Order ${shortId}` : `أمر شراء ${shortId}`);
    case "sales_returns":
      return data.return_number || (lang === 'en' ? `Return ${shortId}` : `مرتجع ${shortId}`);
    default:
      return data.name || data.number || shortId;
  }
};

// وصف العملية بشكل مفهوم
const getActionDescription = (log: AuditLog, lang: 'ar' | 'en' = 'ar'): string => {
  const tableName = translateTable(log.target_table, lang);
  const identifier = log.record_identifier || log.record_id;
  const en = lang === 'en';

  switch (log.action) {
    case "INSERT":
      return en ? `Created new ${tableName}: ${identifier}` : `تم إنشاء ${tableName} جديد: ${identifier}`;
    case "UPDATE":
      if (log.changed_fields && log.changed_fields.length > 0) {
        const fields = log.changed_fields
          .map((f) => (en ? (fieldTranslationsEn[f] || f) : (fieldTranslations[f] || f)))
          .join(en ? ", " : "، ");
        return en ? `Updated ${tableName}: ${identifier} (${fields})` : `تم تحديث ${tableName}: ${identifier} (${fields})`;
      }
      return en ? `Updated ${tableName}: ${identifier}` : `تم تحديث ${tableName}: ${identifier}`;
    case "DELETE":
      return en ? `Deleted ${tableName}: ${identifier}` : `تم حذف ${tableName}: ${identifier}`;
    case "REVERT":
      return en ? `Reverted an operation in ${tableName}: ${identifier}` : `تم التراجع عن عملية في ${tableName}: ${identifier}`;
    case "APPROVE":
      return en ? `Approved ${tableName}: ${identifier}` : `تم اعتماد ${tableName}: ${identifier}`;
    case "POST":
      return en ? `Posted ${tableName}: ${identifier}` : `تم ترحيل ${tableName}: ${identifier}`;
    case "CANCEL":
      return en ? `Cancelled ${tableName}: ${identifier}` : `تم إلغاء ${tableName}: ${identifier}`;
    case "REVERSE":
      return en ? `Reversed ${tableName}: ${identifier}` : `تم عكس ${tableName}: ${identifier}`;
    case "CLOSE":
      return en ? `Closed ${tableName}: ${identifier}` : `تم إقفال ${tableName}: ${identifier}`;
    case "LOGIN":
      return en ? `Login: ${log.user_name || log.user_email}` : `تسجيل دخول: ${log.user_name || log.user_email}`;
    case "LOGOUT":
      return en ? `Logout: ${log.user_name || log.user_email}` : `تسجيل خروج: ${log.user_name || log.user_email}`;
    case "ACCESS_DENIED":
      return en ? `Unauthorized access attempt: ${tableName}` : `محاولة وصول غير مصرح: ${tableName}`;
    case "SETTINGS":
      return en ? `Settings changed: ${identifier}` : `تم تغيير إعدادات: ${identifier}`;
    case "PERMISSIONS":
      return en ? `Permissions changed: ${identifier}` : `تم تغيير صلاحيات: ${identifier}`;
    default:
      return en ? `${log.action} operation on ${tableName}: ${identifier}` : `عملية ${log.action} على ${tableName}: ${identifier}`;
  }
};

// ترجمة نوع العملية
const getActionText = (action: string, lang: 'ar' | 'en' = 'ar'): string => {
  const en = lang === 'en';
  switch (action) {
    case "INSERT": return en ? "Add" : "إضافة";
    case "UPDATE": return en ? "Edit" : "تعديل";
    case "DELETE": return en ? "Delete" : "حذف";
    case "REVERT": return en ? "Revert" : "تراجع";
    case "APPROVE": return en ? "Approve" : "اعتماد";
    case "POST": return en ? "Post" : "ترحيل";
    case "CANCEL": return en ? "Cancel" : "إلغاء";
    case "REVERSE": return en ? "Reverse" : "عكس";
    case "CLOSE": return en ? "Close" : "إقفال";
    case "LOGIN": return en ? "Login" : "تسجيل دخول";
    case "LOGOUT": return en ? "Logout" : "تسجيل خروج";
    case "ACCESS_DENIED": return en ? "Access Denied" : "وصول مرفوض";
    case "SETTINGS": return en ? "Settings" : "إعدادات";
    case "PERMISSIONS": return en ? "Permissions" : "صلاحيات";
    // v3.62.3 — backup lifecycle actions
    case "backup_export": return en ? "Backup Export" : "تصدير نسخة احتياطية";
    case "backup_delete": return en ? "Backup Deletion" : "حذف نسخة احتياطية";
    case "backup_restore": return en ? "Backup Restore" : "استعادة نسخة احتياطية";
    case "backup_restore_failed": return en ? "Restore Failed" : "فشل الاستعادة";
    default: return action;
  }
};

// دالة تصدير CSV
const exportToCSV = (logs: AuditLog[], lang: 'ar' | 'en' = 'ar') => {
  const headers = lang === 'en'
    ? ["Date", "User", "Action Type", "Table", "Record", "Changed Fields"]
    : ["التاريخ", "المستخدم", "نوع العملية", "الجدول", "السجل", "الحقول المتغيرة"];
  const rows = logs.map(log => [
    new Date(log.created_at).toLocaleString(lang === 'en' ? "en-US" : "ar-EG"),
    log.user_name || log.user_email,
    getActionText(log.action, lang),
    translateTable(log.target_table, lang),
    getReadableIdentifier(log, lang),
    log.changed_fields?.join(", ") || "-"
  ]);

  const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `audit_log_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
};

export default function AuditLogPage() {
  const { toast } = useToast();
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar');
  const t = (en: string, ar: string) => appLang === 'en' ? en : ar;

  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar';
        setAppLang(v === 'en' ? 'en' : 'ar');
      } catch {}
    };
    handler();
    window.addEventListener('app_language_changed', handler);
    return () => window.removeEventListener('app_language_changed', handler);
  }, []);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
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
  const [exporting, setExporting] = useState(false);

  // فلاتر
  const [filters, setFilters] = useState({
    action: "",
    table: "",
    category: "", // تصنيف المورد
    userId: "",
    startDate: "",
    endDate: "",
    search: "",
    branchId: "", // فلتر الفرع
    costCenterId: "", // فلتر مركز التكلفة
  });
  const [showFilters, setShowFilters] = useState(true); // إظهار الفلاتر افتراضياً

  // قوائم الفروع ومراكز التكلفة
  const [branches, setBranches] = useState<Branch[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [filteredCostCenters, setFilteredCostCenters] = useState<CostCenter[]>([]);

  // Sorting state - يجب تعريفه قبل fetchLogs
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // ✅ تتبع تغيير الشركة
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);

  // تصدير Excel
  const exportToExcel = async () => {
    setExporting(true);
    try {
      const headers = appLang === 'en'
        ? ["Date", "User", "Email", "Action Type", "Table", "Record", "Changed Fields"]
        : ["التاريخ", "المستخدم", "البريد", "نوع العملية", "الجدول", "السجل", "الحقول المتغيرة"];
      const rows = logs.map(log => [
        new Date(log.created_at).toLocaleString(appLang === 'en' ? "en-US" : "ar-EG"),
        log.user_name || "-",
        log.user_email || "-",
        getActionText(log.action, appLang),
        translateTable(log.target_table, appLang),
        getReadableIdentifier(log, appLang),
        log.changed_fields?.join(", ") || "-"
      ]);

      // استخدام Tab-separated values لـ Excel
      const tsvContent = [headers.join("\t"), ...rows.map(r => r.join("\t"))].join("\n");
      const blob = new Blob(["\ufeff" + tsvContent], { type: "application/vnd.ms-excel;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `audit_log_${new Date().toISOString().split("T")[0]}.xls`;
      link.click();
      toast({ title: t("Exported", "تم التصدير"), description: t("Logs exported successfully", "تم تصدير السجلات بنجاح") });
    } catch {
      toast({ title: t("Error", "خطأ"), description: t("Failed to export logs", "فشل تصدير السجلات"), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  // تصدير PDF (طباعة)
  const exportToPDF = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html dir="${appLang === 'en' ? 'ltr' : 'rtl'}" lang="${appLang === 'en' ? 'en' : 'ar'}">
      <head>
        <meta charset="UTF-8">
        <title>${t("Audit Log", "سجل المراجعة")}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 20px; }
          h1 { color: #6366f1; border-bottom: 2px solid #6366f1; padding-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: ${appLang === 'en' ? 'left' : 'right'}; }
          th { background: #6366f1; color: white; }
          tr:nth-child(even) { background: #f9fafb; }
          .insert { color: #16a34a; }
          .update { color: #2563eb; }
          .delete { color: #dc2626; }
          .meta { color: #6b7280; font-size: 12px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <h1>📋 ${t("Audit Log", "سجل المراجعة")}</h1>
        <p class="meta">${t("Export Date", "تاريخ التصدير")}: ${new Date().toLocaleString(appLang === 'en' ? "en-US" : "ar-EG")} | ${t("Number of Records", "عدد السجلات")}: ${logs.length}</p>
        <table>
          <thead>
            <tr>
              <th>${t("Date", "التاريخ")}</th>
              <th>${t("User", "المستخدم")}</th>
              <th>${t("Action", "العملية")}</th>
              <th>${t("Table", "الجدول")}</th>
              <th>${t("Record", "السجل")}</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(log => `
              <tr>
                <td>${new Date(log.created_at).toLocaleString(appLang === 'en' ? "en-US" : "ar-EG")}</td>
                <td>${log.user_name || log.user_email}</td>
                <td class="${log.action.toLowerCase()}">${getActionText(log.action, appLang)}</td>
                <td>${translateTable(log.target_table, appLang)}</td>
                <td>${getReadableIdentifier(log, appLang)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

  // تصدير CSV
  const handleExportCSV = () => {
    exportToCSV(logs, appLang);
    toast({ title: t("Exported", "تم التصدير"), description: t("Logs exported successfully", "تم تصدير السجلات بنجاح") });
  };

  // جلب الفروع ومراكز التكلفة
  const fetchBranchesAndCostCenters = useCallback(async () => {
    try {
      const [branchesRes, costCentersRes] = await Promise.all([
        fetch('/api/branches'),
        fetch('/api/cost-centers')
      ]);

      if (branchesRes.ok) {
        const branchesData = await branchesRes.json();
        setBranches(branchesData.branches || []);
      }

      if (costCentersRes.ok) {
        const costCentersData = await costCentersRes.json();
        // تحويل البيانات لتتوافق مع الواجهة
        const mappedCostCenters = (costCentersData.cost_centers || []).map((cc: any) => ({
          id: cc.id,
          name: cc.cost_center_name || cc.name,
          branch_id: cc.branch_id
        }));
        setCostCenters(mappedCostCenters);
        setFilteredCostCenters(mappedCostCenters);
      }
    } catch (error) {
      console.error("Error fetching branches/cost centers:", error);
    }
  }, []);

  // تحديث مراكز التكلفة عند تغيير الفرع
  useEffect(() => {
    if (filters.branchId && filters.branchId !== "all") {
      setFilteredCostCenters(costCenters.filter(cc => cc.branch_id === filters.branchId));
    } else {
      setFilteredCostCenters(costCenters);
    }
  }, [filters.branchId, costCenters]);

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      // ✅ جلب الشركة النشطة من localStorage
      const activeCompanyId = localStorage.getItem('active_company_id');
      if (!activeCompanyId) {
        console.warn('⚠️ [Audit Logs] No active company ID found');
        setLoading(false);
        return;
      }

      const params = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(),
        sort_field: sortField,
        sort_order: sortOrder,
        company_id: activeCompanyId, // ✅ إضافة company_id
      });

      if (filters.action && filters.action !== "all") params.append("action", filters.action);
      if (filters.table && filters.table !== "all") params.append("table", filters.table);
      if (filters.userId && filters.userId !== "all") params.append("user_id", filters.userId);
      if (filters.startDate) params.append("start_date", filters.startDate);
      if (filters.endDate) params.append("end_date", filters.endDate);
      if (filters.search) params.append("search", filters.search);
      if (filters.branchId && filters.branchId !== "all") params.append("branch_id", filters.branchId);
      if (filters.costCenterId && filters.costCenterId !== "all") params.append("cost_center_id", filters.costCenterId);

      console.log('📡 [Audit Logs] Fetching logs for company:', activeCompanyId);
      const res = await fetch(`/api/audit-logs?${params}`);
      const data = await res.json();

      if (res.ok) {
        console.log('✅ [Audit Logs] Received logs:', data.logs?.length || 0);
        setLogs(data.logs || []);
        setPagination(data.pagination);
        setSummary(data.summary);
        setUsers(data.users || []);
      } else {
        console.error('❌ [Audit Logs] Error:', data);
      }
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, sortField, sortOrder, filters]);

  useEffect(() => {
    fetchBranchesAndCostCenters();
  }, [fetchBranchesAndCostCenters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // إعادة الجلب عند تغيير الترتيب
  useEffect(() => {
    fetchLogs(1);
  }, [sortField, sortOrder]);

  // ✅ الاستماع لتغيير الشركة
  useEffect(() => {
    const handleCompanyChange = () => {
      const newCompanyId = localStorage.getItem('active_company_id');
      console.log('🔄 [Audit Logs] Company change detected:', {
        current: currentCompanyId,
        new: newCompanyId
      });

      if (newCompanyId && newCompanyId !== currentCompanyId) {
        console.log('🔄 [Audit Logs] Company changed, reloading logs...');
        setCurrentCompanyId(newCompanyId);
        // إعادة تحميل السجلات مباشرة
        setLoading(true);
        setTimeout(() => {
          fetchLogs(1);
        }, 100);
      }
    };

    // تحديد الشركة الحالية عند التحميل
    const initialCompanyId = localStorage.getItem('active_company_id');
    if (initialCompanyId && !currentCompanyId) {
      console.log('📌 [Audit Logs] Setting initial company:', initialCompanyId);
      setCurrentCompanyId(initialCompanyId);
    }

    // الاستماع لحدث تغيير الشركة
    window.addEventListener('company-changed', handleCompanyChange);

    return () => {
      window.removeEventListener('company-changed', handleCompanyChange);
    };
  }, [currentCompanyId]);

  const handleFilterChange = () => {
    fetchLogs(1);
  };

  const clearFilters = () => {
    setFilters({
      action: "",
      table: "",
      category: "",
      userId: "",
      startDate: "",
      endDate: "",
      search: "",
      branchId: "",
      costCenterId: "",
    });
    setTimeout(() => fetchLogs(1), 100);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString(appLang === 'en' ? "en-US" : "ar-EG", {
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
      case "APPROVE":
        return <Check className="h-4 w-4" />;
      case "POST":
        return <FileText className="h-4 w-4" />;
      case "CANCEL":
        return <XCircle className="h-4 w-4" />;
      case "REVERSE":
        return <RefreshCw className="h-4 w-4" />;
      case "CLOSE":
        return <Clock className="h-4 w-4" />;
      case "LOGIN":
        return <LogIn className="h-4 w-4" />;
      case "LOGOUT":
        return <LogIn className="h-4 w-4 rotate-180" />;
      case "ACCESS_DENIED":
        return <Shield className="h-4 w-4" />;
      case "SETTINGS":
        return <Settings className="h-4 w-4" />;
      case "PERMISSIONS":
        return <Shield className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
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
      case "APPROVE":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "POST":
        return "bg-sky-100 text-sky-700 border-sky-200";
      case "CANCEL":
        return "bg-rose-100 text-rose-700 border-rose-200";
      case "REVERSE":
        return "bg-violet-100 text-violet-700 border-violet-200";
      case "CLOSE":
        return "bg-slate-100 text-slate-700 border-slate-200";
      case "LOGIN":
        return "bg-cyan-100 text-cyan-700 border-cyan-200";
      case "LOGOUT":
        return "bg-orange-100 text-orange-700 border-orange-200";
      case "ACCESS_DENIED":
        return "bg-red-200 text-red-800 border-red-300";
      case "SETTINGS":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "PERMISSIONS":
        return "bg-indigo-100 text-indigo-700 border-indigo-200";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  // Handle sort change
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
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
      alert(t("❌ An error occurred during full revert", "❌ حدث خطأ أثناء التراجع الشامل"));
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
      alert(t("❌ An error occurred during revert", "❌ حدث خطأ أثناء التراجع"));
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
        alert(t("✅ Log entry deleted", "✅ تم حذف السجل"));
      } else {
        alert(`❌ ${data.error}`);
      }
    } catch (error) {
      setConfirmDialog({ open: false, type: "delete", log: null });
      setSelectedLog(null);
      setActionLoading(null);
      alert(t("❌ An error occurred during deletion", "❌ حدث خطأ أثناء الحذف"));
    }
  };

  const translateField = (field: string) => {
    if (appLang === 'en') return fieldTranslationsEn[field] || fieldTranslations[field] || field;
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
              {t("Operation Details", "تفاصيل العملية")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* معلومات أساسية */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">{t("User", "المستخدم")}</p>
                <p className="font-medium">{selectedLog.user_name || selectedLog.user_email}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">{t("Date", "التاريخ")}</p>
                <p className="font-medium">{formatDate(selectedLog.created_at)}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">{t("Action Type", "نوع العملية")}</p>
                <Badge className={getActionColor(selectedLog.action)}>
                  {getActionIcon(selectedLog.action)}
                  <span className="mr-1">{getActionText(selectedLog.action, appLang)}</span>
                </Badge>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">{t("Table", "الجدول")}</p>
                <p className="font-medium">{translateTable(selectedLog.target_table, appLang)}</p>
              </div>
            </div>

            {/* السجل */}
            <div className="bg-purple-50 p-3 rounded-lg">
              <p className="text-xs text-gray-500">{t("Record", "السجل")}</p>
              <p className="font-medium text-purple-700">{selectedLog.record_identifier}</p>
            </div>

            {/* الحقول المتغيرة */}
            {selectedLog.action === "UPDATE" && selectedLog.changed_fields?.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">{t("Changed Fields:", "الحقول المتغيرة:")}</p>
                <div className="flex flex-wrap gap-2">
                  {selectedLog.changed_fields.map((field) => (
                    <Badge key={field} variant="outline" className="bg-yellow-50">
                      {translateField(field)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* البيانات القديمة والجديدة - Diff View محسّن */}
            {selectedLog.action === "UPDATE" && selectedLog.changed_fields && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-100">
                    <ArrowUpDown className="h-4 w-4 text-blue-600" />
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{t("Change Comparison (Diff View)", "مقارنة التغييرات (Diff View)")}</p>
                  <Badge variant="outline" className="text-xs">
                    {selectedLog.changed_fields.filter((f: string) => !hiddenFields.includes(f)).length} {t("field(s)", "حقل")}
                  </Badge>
                </div>
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className="grid grid-cols-3 bg-gradient-to-l from-gray-100 to-gray-50 border-b">
                    <div className="py-2.5 px-4 font-semibold text-gray-700 text-sm">{t("Field", "الحقل")}</div>
                    <div className="py-2.5 px-4 font-semibold text-red-600 text-sm flex items-center gap-1.5 border-r border-l">
                      <XCircle className="h-3.5 w-3.5" />
                      {t("Previous Value", "القيمة السابقة")}
                    </div>
                    <div className="py-2.5 px-4 font-semibold text-green-600 text-sm flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5" />
                      {t("New Value", "القيمة الجديدة")}
                    </div>
                  </div>
                  <div className="divide-y">
                    {selectedLog.changed_fields
                      .filter((field: string) => !hiddenFields.includes(field))
                      .map((field: string, idx: number) => (
                        <div key={field} className={`grid grid-cols-3 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                          <div className="py-3 px-4 font-medium text-gray-700 text-sm flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-600 text-xs flex items-center justify-center font-bold">
                              {idx + 1}
                            </span>
                            {translateField(field)}
                          </div>
                          <div className="py-3 px-4 bg-red-50/70 text-red-700 text-sm border-r border-l border-red-100">
                            <div className="flex items-start gap-1.5">
                              <span className="text-red-400 mt-0.5">−</span>
                              <span className="line-through opacity-75">{formatValue(field, selectedLog.old_data?.[field], appLang)}</span>
                            </div>
                          </div>
                          <div className="py-3 px-4 bg-green-50/70 text-green-700 text-sm">
                            <div className="flex items-start gap-1.5">
                              <span className="text-green-500 mt-0.5">+</span>
                              <span className="font-medium">{formatValue(field, selectedLog.new_data?.[field], appLang)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {selectedLog.action === "INSERT" && selectedLog.new_data && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-green-100">
                    <Plus className="h-4 w-4 text-green-600" />
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{t("Added Data", "البيانات المضافة")}</p>
                  <Badge className="bg-green-100 text-green-700 text-xs">
                    {Object.entries(selectedLog.new_data).filter(([k]) => !hiddenFields.includes(k)).length} {t("field(s)", "حقل")}
                  </Badge>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-xl border border-green-200 max-h-64 overflow-auto">
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(selectedLog.new_data)
                      .filter(([key]) => !hiddenFields.includes(key))
                      .map(([key, value]) => (
                        <div key={key} className="bg-white/80 rounded-lg p-2.5 border border-green-100">
                          <p className="text-xs text-gray-500 mb-0.5">{translateField(key)}</p>
                          <p className="text-sm font-medium text-gray-800">{formatValue(key, value, appLang)}</p>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {selectedLog.action === "DELETE" && selectedLog.old_data && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-red-100">
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{t("Deleted Data", "البيانات المحذوفة")}</p>
                  <Badge className="bg-red-100 text-red-700 text-xs">
                    {Object.entries(selectedLog.old_data).filter(([k]) => !hiddenFields.includes(k)).length} {t("field(s)", "حقل")}
                  </Badge>
                </div>
                <div className="bg-gradient-to-br from-red-50 to-rose-50 p-4 rounded-xl border border-red-200 max-h-64 overflow-auto">
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(selectedLog.old_data)
                      .filter(([key]) => !hiddenFields.includes(key))
                      .map(([key, value]) => (
                        <div key={key} className="bg-white/80 rounded-lg p-2.5 border border-red-100">
                          <p className="text-xs text-gray-500 mb-0.5">{translateField(key)}</p>
                          <p className="text-sm font-medium text-gray-800 line-through opacity-75">{formatValue(key, value, appLang)}</p>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* v3.62.3 — Metadata block for non-CRUD actions (backup, LOGIN, etc.) */}
            {selectedLog.metadata &&
              typeof selectedLog.metadata === "object" &&
              !Array.isArray(selectedLog.metadata) &&
              Object.keys(selectedLog.metadata).length > 0 &&
              !["INSERT", "UPDATE", "DELETE"].includes(selectedLog.action) && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-blue-100">
                      <Info className="h-4 w-4 text-blue-600" />
                    </div>
                    <p className="text-sm font-semibold text-gray-800">{t("Additional Data", "بيانات إضافية")}</p>
                    <Badge className="bg-blue-100 text-blue-700 text-xs">
                      {Object.keys(selectedLog.metadata).filter((k) => !hiddenFields.includes(k)).length} {t("field(s)", "حقل")}
                    </Badge>
                  </div>
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200 max-h-64 overflow-auto">
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(selectedLog.metadata)
                        .filter(([key]) => !hiddenFields.includes(key))
                        .map(([key, value]) => (
                          <div key={key} className="bg-white/80 rounded-lg p-2.5 border border-blue-100">
                            <p className="text-xs text-gray-500 mb-0.5">{translateField(key)}</p>
                            <p className="text-sm font-medium text-gray-800 break-words">{formatValue(key, value, appLang)}</p>
                          </div>
                        ))}
                    </div>
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
                      <p className="text-sm font-medium text-gray-700">{t("Related Operations", "العمليات المرتبطة")}</p>
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
                      <span className="mr-1">{t("Find Related", "بحث عن المرتبطة")}</span>
                    </Button>
                  </div>

                  {relatedLogs.length > 0 ? (
                    <div className="bg-white rounded-lg border overflow-hidden">
                      <div className="max-h-32 overflow-auto divide-y">
                        {relatedLogs.map((rel, idx) => (
                          <div key={idx} className="flex items-center justify-between py-2 px-3 text-sm hover:bg-gray-50">
                            <div className="flex items-center gap-2">
                              <Badge className={`text-xs ${rel.action === "INSERT" ? "bg-green-100 text-green-700" :
                                rel.action === "UPDATE" ? "bg-blue-100 text-blue-700" :
                                  rel.action === "DELETE" ? "bg-red-100 text-red-700" : "bg-gray-100"
                                }`}>
                                {getActionText(rel.action, appLang)}
                              </Badge>
                              <span className="text-gray-700 font-medium">{translateTable(rel.target_table, appLang)}</span>
                            </div>
                            <span className="text-xs text-gray-400">{rel.record_identifier?.slice(0, 8) || "---"}...</span>
                          </div>
                        ))}
                      </div>
                      <div className="bg-amber-50 px-3 py-2 border-t">
                        <p className="text-xs text-amber-700 font-medium">
                          {t(`⚠️ ${relatedLogs.length} operation(s) will be reverted when using Full Revert`, `⚠️ سيتم التراجع عن ${relatedLogs.length} عملية عند استخدام التراجع الشامل`)}
                        </p>
                      </div>
                    </div>
                  ) : !loadingRelated ? (
                    <p className="text-xs text-gray-500 text-center py-2">
                      {t('Click "Find Related" to view related operations', 'اضغط "بحث عن المرتبطة" لعرض العمليات المرتبطة')}
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
                    <span className="font-bold">{t("Full Revert", "التراجع الشامل")}</span>
                    <span className="text-xs opacity-80 mr-2">{t("(cancels the operation + all related)", "(إلغاء العملية + كل المرتبطة)")}</span>
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
                      {t("Partial Revert", "تراجع جزئي")}
                    </Button>

                    {/* حذف السجل */}
                    <Button
                      variant="outline"
                      onClick={() => setConfirmDialog({ open: true, type: "delete", log: selectedLog })}
                      className="text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-red-600"
                      disabled={actionLoading === selectedLog.id}
                    >
                      <Trash2 className="h-4 w-4 ml-2" />
                      {t("Delete Log Entry", "حذف السجل")}
                    </Button>
                  </div>

                  {/* تنويه */}
                  <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                    <p className="font-medium mb-1">{t("💡 The difference between Full and Partial Revert:", "💡 الفرق بين التراجع الشامل والجزئي:")}</p>
                    <ul className="list-disc list-inside space-y-0.5 text-blue-600">
                      <li><strong>{t("Full Revert:", "التراجع الشامل:")}</strong> {t("cancels the operation and all related operations (journal entries, inventory, items...)", "يلغي العملية وكل العمليات المرتبطة بها (القيود، المخزون، العناصر...)")}</li>
                      <li><strong>{t("Partial Revert:", "التراجع الجزئي:")}</strong> {t("cancels this operation only, without related ones", "يلغي هذه العملية فقط بدون المرتبطة")}</li>
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
                  <p className="text-purple-700 font-medium">{t("This operation has already been reverted", "تم التراجع عن هذه العملية مسبقاً")}</p>
                  <p className="text-xs text-purple-500 mt-1">{t("No further actions can be performed on this log entry", "لا يمكن إجراء المزيد من العمليات على هذا السجل")}</p>
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
            <DialogTitle className={`flex items-center gap-2 ${confirmDialog.type === "revert_batch" ? "text-red-600" :
              confirmDialog.type === "revert" ? "text-purple-600" : "text-amber-600"
              }`}>
              {confirmDialog.type === "revert_batch" ? (
                <AlertTriangle className="h-5 w-5" />
              ) : confirmDialog.type === "revert" ? (
                <Undo2 className="h-5 w-5" />
              ) : (
                <Trash2 className="h-5 w-5" />
              )}
              {confirmDialog.type === "revert_batch" ? t("⚠️ Confirm Full Revert", "⚠️ تأكيد التراجع الشامل") :
                confirmDialog.type === "revert" ? t("Confirm Partial Revert", "تأكيد التراجع الجزئي") : t("Confirm Log Deletion", "تأكيد حذف السجل")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* معلومات السجل */}
            <div className="bg-gray-50 p-3 rounded-lg border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">{t("Selected Operation", "العملية المحددة")}</p>
                  <p className="font-medium text-gray-800">{getReadableIdentifier(confirmDialog.log, appLang)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={getActionColor(confirmDialog.log.action)}>
                    {getActionText(confirmDialog.log.action, appLang)}
                  </Badge>
                  <Badge variant="outline">{translateTable(confirmDialog.log.target_table, appLang)}</Badge>
                </div>
              </div>
            </div>

            {/* التراجع الشامل */}
            {confirmDialog.type === "revert_batch" && (
              <div className="space-y-3">
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <p className="font-bold text-red-800 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {t("Warning: This action cannot be undone!", "تحذير: إجراء لا يمكن التراجع عنه!")}
                  </p>
                  <p className="text-sm text-red-600 mt-2">
                    {t("This operation and all operations performed with it will be cancelled:", "سيتم إلغاء هذه العملية وجميع العمليات التي تمت معها:")}
                  </p>
                </div>

                {relatedLogs.length > 0 ? (
                  <div className="bg-white border rounded-lg overflow-hidden">
                    <div className="bg-amber-50 px-3 py-2 border-b">
                      <p className="text-sm font-medium text-amber-800">
                        {t(`📋 Operations to be cancelled (${relatedLogs.length}):`, `📋 العمليات التي سيتم إلغاؤها (${relatedLogs.length} عملية):`)}
                      </p>
                    </div>
                    <div className="max-h-40 overflow-auto divide-y">
                      {relatedLogs.map((rel, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2 px-3 text-sm">
                          <div className="flex items-center gap-2">
                            <Badge className={`text-xs ${rel.action === "INSERT" ? "bg-green-100 text-green-700" :
                              rel.action === "UPDATE" ? "bg-blue-100 text-blue-700" :
                                rel.action === "DELETE" ? "bg-red-100 text-red-700" : "bg-gray-100"
                              }`}>
                              {getActionText(rel.action, appLang)}
                            </Badge>
                            <span className="text-gray-700">{translateTable(rel.target_table, appLang)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : loadingRelated ? (
                  <div className="flex items-center justify-center py-4 text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin ml-2" />
                    {t("Searching for related operations...", "جاري البحث عن العمليات المرتبطة...")}
                  </div>
                ) : (
                  <div className="bg-green-50 p-3 rounded-lg border border-green-200 text-center">
                    <p className="text-sm text-green-700">{t("✅ No related operations found", "✅ لم يتم العثور على عمليات مرتبطة")}</p>
                    <p className="text-xs text-green-600">{t("Only this operation will be reverted", "سيتم التراجع عن هذه العملية فقط")}</p>
                  </div>
                )}
              </div>
            )}

            {/* التراجع الجزئي */}
            {confirmDialog.type === "revert" && (
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <p className="font-medium text-purple-800">{t("Partial Revert", "التراجع الجزئي")}</p>
                <p className="text-sm text-purple-600 mt-2">
                  {confirmDialog.log.action === "INSERT" && t("✓ Only the added record will be deleted", "✓ سيتم حذف السجل الذي تمت إضافته فقط")}
                  {confirmDialog.log.action === "UPDATE" && t("✓ Only the previous data will be restored", "✓ سيتم استرجاع البيانات السابقة فقط")}
                  {confirmDialog.log.action === "DELETE" && t("✓ Only the deleted record will be restored", "✓ سيتم استعادة السجل المحذوف فقط")}
                </p>
                <p className="text-xs text-purple-500 mt-2">
                  {t("⚠️ Note: related operations (journal entries, inventory, etc.) will not be cancelled", "⚠️ ملاحظة: لن يتم إلغاء العمليات المرتبطة (القيود، المخزون، إلخ)")}
                </p>
              </div>
            )}

            {/* حذف السجل */}
            {confirmDialog.type === "delete" && (
              <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                <p className="font-medium text-amber-800">{t("Delete Audit Log Entry", "حذف سجل المراجعة")}</p>
                <p className="text-sm text-amber-600 mt-2">
                  {t("Only the audit log entry will be deleted from the database.", "سيتم حذف سجل المراجعة فقط من قاعدة البيانات.")}
                </p>
                <p className="text-xs text-amber-500 mt-2">
                  {t("✓ The actual data will not be affected", "✓ البيانات الفعلية لن تتأثر")}
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
                className={`flex-1 ${confirmDialog.type === "revert_batch"
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
                  ? t(`Confirm Full Revert ${relatedLogs.length > 0 ? `(${relatedLogs.length} operations)` : ''}`, `تأكيد التراجع الشامل ${relatedLogs.length > 0 ? `(${relatedLogs.length} عملية)` : ''}`)
                  : confirmDialog.type === "revert"
                    ? t("Confirm Partial Revert", "تأكيد التراجع الجزئي")
                    : t("Confirm Deletion", "تأكيد الحذف")}
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirmDialog({ ...confirmDialog, open: false })}
                disabled={actionLoading === confirmDialog.log.id}
              >
                {t("Cancel", "إلغاء")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };


  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900" dir="rtl">
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
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-800 dark:text-gray-100 truncate">{t("Audit Log", "سجل المراجعة")}</h1>
                  <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm truncate">{t("Track operations", "تتبع العمليات")}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className={showFilters ? "bg-purple-100 dark:bg-purple-900" : ""}
              >
                <Filter className="h-4 w-4 ml-2" />
                {t("Filter", "فلترة")}
              </Button>

              {/* زر التصدير */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={exporting || logs.length === 0}>
                    {exporting ? (
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 ml-2" />
                    )}
                    {t("Export", "تصدير")}
                    <ChevronDown className="h-3 w-3 mr-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={handleExportCSV} className="cursor-pointer">
                    <FileText className="h-4 w-4 ml-2" />
                    {t("Export CSV", "تصدير CSV")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportToExcel} className="cursor-pointer">
                    <FileSpreadsheet className="h-4 w-4 ml-2" />
                    {t("Export Excel", "تصدير Excel")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={exportToPDF} className="cursor-pointer">
                    <FileDown className="h-4 w-4 ml-2" />
                    {t("Print / PDF", "طباعة / PDF")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                onClick={() => fetchLogs(pagination.page)}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ml-2 ${loading ? "animate-spin" : ""}`} />
                {t("Refresh", "تحديث")}
              </Button>
            </div>
          </div>

          {/* بطاقات الملخص */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-100 text-sm">{t("Total Operations", "إجمالي العمليات")}</p>
                    <p className="text-3xl font-bold">{summary.total}</p>
                    <p className="text-purple-200 text-xs">{t("Last 7 days", "آخر 7 أيام")}</p>
                  </div>
                  <Activity className="h-10 w-10 text-purple-200" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100 text-sm">{t("Additions", "إضافات")}</p>
                    <p className="text-3xl font-bold">{summary.inserts}</p>
                    <p className="text-green-200 text-xs">{t("New records", "سجلات جديدة")}</p>
                  </div>
                  <TrendingUp className="h-10 w-10 text-green-200" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-100 text-sm">{t("Edits", "تعديلات")}</p>
                    <p className="text-3xl font-bold">{summary.updates}</p>
                    <p className="text-blue-200 text-xs">{t("Updates", "تحديثات")}</p>
                  </div>
                  <Pencil className="h-10 w-10 text-blue-200" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-red-100 text-sm">{t("Deletions", "حذف")}</p>
                    <p className="text-3xl font-bold">{summary.deletes}</p>
                    <p className="text-red-200 text-xs">{t("Deleted records", "سجلات محذوفة")}</p>
                  </div>
                  <TrendingDown className="h-10 w-10 text-red-200" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* فلاتر متقدمة */}
          {showFilters && (
            <Card className="shadow-lg border-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Filter className="h-5 w-5 text-purple-600" />
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200">{t("Advanced Search Filters", "فلاتر البحث المتقدمة")}</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* بحث نصي */}
                  <div className="relative sm:col-span-2 lg:col-span-1">
                    <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder={t("Search logs...", "بحث في السجلات...")}
                      value={filters.search}
                      onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                      className="pr-10"
                    />
                  </div>

                  {/* نوع العملية */}
                  <Select
                    value={filters.action}
                    onValueChange={(v) => setFilters({ ...filters, action: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("Action Type", "نوع العملية")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("All Actions", "جميع العمليات")}</SelectItem>
                      <SelectItem value="INSERT">
                        <span className="flex items-center gap-2">
                          <Plus className="h-3 w-3 text-green-600" /> {t("Add", "إضافة")}
                        </span>
                      </SelectItem>
                      <SelectItem value="UPDATE">
                        <span className="flex items-center gap-2">
                          <Pencil className="h-3 w-3 text-blue-600" /> {t("Edit", "تعديل")}
                        </span>
                      </SelectItem>
                      <SelectItem value="DELETE">
                        <span className="flex items-center gap-2">
                          <Trash2 className="h-3 w-3 text-red-600" /> {t("Delete", "حذف")}
                        </span>
                      </SelectItem>
                      <SelectItem value="REVERT">
                        <span className="flex items-center gap-2">
                          <Undo2 className="h-3 w-3 text-purple-600" /> {t("Revert", "تراجع")}
                        </span>
                      </SelectItem>
                      <SelectItem value="APPROVE">
                        <span className="flex items-center gap-2">
                          <Check className="h-3 w-3 text-emerald-600" /> {t("Approve", "اعتماد")}
                        </span>
                      </SelectItem>
                      <SelectItem value="POST">
                        <span className="flex items-center gap-2">
                          <FileText className="h-3 w-3 text-sky-600" /> {t("Post", "ترحيل")}
                        </span>
                      </SelectItem>
                      <SelectItem value="CANCEL">
                        <span className="flex items-center gap-2">
                          <XCircle className="h-3 w-3 text-rose-600" /> {t("Cancel", "إلغاء")}
                        </span>
                      </SelectItem>
                      <SelectItem value="REVERSE">
                        <span className="flex items-center gap-2">
                          <RefreshCw className="h-3 w-3 text-violet-600" /> {t("Reverse", "عكس")}
                        </span>
                      </SelectItem>
                      <SelectItem value="CLOSE">
                        <span className="flex items-center gap-2">
                          <Clock className="h-3 w-3 text-slate-600" /> {t("Close", "إقفال")}
                        </span>
                      </SelectItem>
                      <SelectItem value="LOGIN">
                        <span className="flex items-center gap-2">
                          <LogIn className="h-3 w-3 text-cyan-600" /> {t("Login", "تسجيل دخول")}
                        </span>
                      </SelectItem>
                      <SelectItem value="LOGOUT">
                        <span className="flex items-center gap-2">
                          <LogIn className="h-3 w-3 rotate-180 text-orange-600" /> {t("Logout", "تسجيل خروج")}
                        </span>
                      </SelectItem>
                      <SelectItem value="ACCESS_DENIED">
                        <span className="flex items-center gap-2">
                          <Shield className="h-3 w-3 text-red-600" /> {t("Access Denied", "وصول مرفوض")}
                        </span>
                      </SelectItem>
                      <SelectItem value="SETTINGS">
                        <span className="flex items-center gap-2">
                          <Settings className="h-3 w-3 text-amber-600" /> {t("Settings", "إعدادات")}
                        </span>
                      </SelectItem>
                      <SelectItem value="PERMISSIONS">
                        <span className="flex items-center gap-2">
                          <Shield className="h-3 w-3 text-indigo-600" /> {t("Permissions", "صلاحيات")}
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {/* تصنيف المورد */}
                  <Select
                    value={filters.category}
                    onValueChange={(v) => {
                      setFilters({ ...filters, category: v, table: "" });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("Resource Category", "تصنيف المورد")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("All Categories", "جميع التصنيفات")}</SelectItem>
                      {Object.entries(resourceCategories).map(([key, cat]) => (
                        <SelectItem key={key} value={key}>
                          <span className="flex items-center gap-2">
                            <span>{cat.icon}</span> {appLang === 'en' ? cat.nameEn : cat.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* الجدول */}
                  <Select
                    value={filters.table}
                    onValueChange={(v) => setFilters({ ...filters, table: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("Resource Type", "نوع المورد")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("All Resources", "جميع الموارد")}</SelectItem>
                      {(filters.category && filters.category !== "all"
                        ? resourceCategories[filters.category]?.tables || []
                        : Object.keys(tableNameTranslations)
                      ).map((key) => (
                        <SelectItem key={key} value={key}>{translateTable(key, appLang)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* المستخدم */}
                  <Select
                    value={filters.userId}
                    onValueChange={(v) => setFilters({ ...filters, userId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("User", "المستخدم")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("All Users", "جميع المستخدمين")}</SelectItem>
                      {users.map((user) => (
                        <SelectItem key={user.user_id} value={user.user_id}>
                          <span className="flex items-center gap-2">
                            <User className="h-3 w-3" />
                            {user.user_name || user.user_email}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* الفرع */}
                  <Select
                    value={filters.branchId}
                    onValueChange={(v) => setFilters({ ...filters, branchId: v, costCenterId: "" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("Branch", "الفرع")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("All Branches", "جميع الفروع")}</SelectItem>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* مركز التكلفة */}
                  <Select
                    value={filters.costCenterId}
                    onValueChange={(v) => setFilters({ ...filters, costCenterId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("Cost Center", "مركز التكلفة")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("All Cost Centers", "جميع مراكز التكلفة")}</SelectItem>
                      {filteredCostCenters.map((cc) => (
                        <SelectItem key={cc.id} value={cc.id}>
                          {cc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* من تاريخ */}
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">{t("From Date", "من تاريخ")}</label>
                    <Input
                      type="date"
                      value={filters.startDate}
                      onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                    />
                  </div>

                  {/* إلى تاريخ */}
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">{t("To Date", "إلى تاريخ")}</label>
                    <Input
                      type="date"
                      value={filters.endDate}
                      onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                    />
                  </div>

                  {/* أزرار التطبيق */}
                  <div className="flex gap-2 items-end sm:col-span-2 lg:col-span-1">
                    <Button onClick={handleFilterChange} className="flex-1 bg-purple-600 hover:bg-purple-700">
                      <Check className="h-4 w-4 ml-1" />
                      {t("Apply", "تطبيق")}
                    </Button>
                    <Button variant="outline" onClick={clearFilters} className="flex-1">
                      <X className="h-4 w-4 ml-1" />
                      {t("Clear", "مسح")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}


          {/* جدول السجلات */}
          <Card className="shadow-lg border-0 overflow-hidden">
            <CardHeader className="bg-gradient-to-l from-purple-600 to-indigo-600 text-white rounded-t-lg py-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {t("Activity Logs", "سجلات النشاط")}
                  <Badge className="bg-white/20 text-white mr-2">
                    {pagination.total} {t("record(s)", "سجل")}
                  </Badge>
                </CardTitle>
                {/* أزرار الترتيب */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-purple-200">{t("Sort:", "ترتيب:")}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-white hover:bg-white/20">
                        <ArrowUpDown className="h-4 w-4 ml-1" />
                        {sortField === "created_at" ? t("Date", "التاريخ") :
                          sortField === "user_name" ? t("User", "المستخدم") :
                            sortField === "action" ? t("Action", "العملية") : t("Table", "الجدول")}
                        {sortOrder === "asc" ? <ArrowUp className="h-3 w-3 mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleSort("created_at")} className="cursor-pointer">
                        <Clock className="h-4 w-4 ml-2" />
                        {t("Date", "التاريخ")}
                        {sortField === "created_at" && (sortOrder === "asc" ? " ↑" : " ↓")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSort("user_name")} className="cursor-pointer">
                        <User className="h-4 w-4 ml-2" />
                        {t("User", "المستخدم")}
                        {sortField === "user_name" && (sortOrder === "asc" ? " ↑" : " ↓")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSort("action")} className="cursor-pointer">
                        <Activity className="h-4 w-4 ml-2" />
                        {t("Action Type", "نوع العملية")}
                        {sortField === "action" && (sortOrder === "asc" ? " ↑" : " ↓")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSort("target_table")} className="cursor-pointer">
                        <FileText className="h-4 w-4 ml-2" />
                        {t("Table", "الجدول")}
                        {sortField === "target_table" && (sortOrder === "asc" ? " ↑" : " ↓")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                </div>
              ) : logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                  <History className="h-16 w-16 mb-4 text-gray-300" />
                  <p className="text-lg">{t("No logs found", "لا توجد سجلات")}</p>
                  <p className="text-sm">{t("All operations performed by users will appear here", "ستظهر هنا جميع العمليات التي يقوم بها المستخدمون")}</p>
                </div>
              ) : (
                <TooltipProvider>
                  <div className="divide-y">
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className="p-4 hover:bg-purple-50/50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                        onClick={() => setSelectedLog(log)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            {/* أيقونة العملية مع Tooltip */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className={`p-2.5 rounded-xl shadow-sm ${getActionColor(log.action)}`}>
                                  {getActionIcon(log.action)}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                <p>{getActionDescription(log, appLang)}</p>
                              </TooltipContent>
                            </Tooltip>

                            {/* تفاصيل */}
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className={`${getActionColor(log.action)} font-medium`}>
                                  {getActionText(log.action, appLang)}
                                </Badge>
                                <Badge variant="outline" className="bg-gray-50">
                                  {translateTable(log.target_table, appLang)}
                                </Badge>
                              </div>
                              {/* الوصف المفهوم */}
                              <p className="text-gray-800 dark:text-gray-200 font-medium">
                                {getReadableIdentifier(log, appLang)}
                              </p>
                              <div className="flex items-center gap-3 text-sm text-gray-500">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="flex items-center gap-1 hover:text-purple-600 transition-colors">
                                      <User className="h-3.5 w-3.5" />
                                      {log.user_name || log.user_email?.split("@")[0]}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{log.user_email}</p>
                                  </TooltipContent>
                                </Tooltip>
                                <span className="text-gray-300">|</span>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3.5 w-3.5" />
                                      {formatDate(log.created_at)}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{new Date(log.created_at).toLocaleString(appLang === 'en' ? "en-US" : "ar-EG", { dateStyle: "full", timeStyle: "medium" })}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              {log.action === "UPDATE" && log.changed_fields?.length > 0 && (
                                <div className="flex items-center gap-1 flex-wrap mt-1">
                                  <span className="text-xs text-gray-400">{t("Modified:", "تم تعديل:")}</span>
                                  {log.changed_fields.slice(0, 3).map((field) => (
                                    <Badge key={field} variant="outline" className="text-xs bg-amber-50 border-amber-200 text-amber-700">
                                      {translateField(field)}
                                    </Badge>
                                  ))}
                                  {log.changed_fields.length > 3 && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge variant="outline" className="text-xs cursor-help">
                                          +{log.changed_fields.length - 3} {t("more fields", "حقول أخرى")}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>{log.changed_fields.slice(3).map(f => translateField(f)).join(t(", ", "، "))}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* زر التفاصيل */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Eye className="h-4 w-4 ml-1" />
                                {t("Details", "تفاصيل")}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t("View full details and changes", "عرض التفاصيل الكاملة والتغييرات")}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    ))}
                  </div>
                </TooltipProvider>
              )}

              {/* التصفح */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t bg-gray-50">
                  <div className="text-sm text-gray-500">
                    {t("Page", "صفحة")} {pagination.page} {t("of", "من")} {pagination.totalPages}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchLogs(pagination.page - 1)}
                      disabled={pagination.page <= 1 || loading}
                    >
                      <ChevronRight className="h-4 w-4" />
                      {t("Previous", "السابق")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchLogs(pagination.page + 1)}
                      disabled={pagination.page >= pagination.totalPages || loading}
                    >
                      {t("Next", "التالي")}
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

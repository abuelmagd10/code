/**
 * Human-readable Excel export of a company backup — bilingual (ar/en).
 *
 * Unlike the JSON backup (a faithful, machine-oriented dump meant for restore),
 * this produces a formatted .xlsx that an owner or accountant can actually read:
 * localized headers, one sheet per business entity, IDs resolved to names, money
 * columns formatted, totals rows, and a summary dashboard. Arabic renders RTL;
 * English renders LTR so non-Arabic clients get a native-looking file.
 *
 * It consumes the SAME in-memory `BackupData` the JSON export produces, so it
 * needs no extra DB round-trips and never diverges from the backup contents.
 */
import ExcelJS from "exceljs"
import type { BackupData } from "@/lib/backup/types"

export type ExcelLang = "ar" | "en"
type Row = Record<string, any>
type Dict = Record<string, any[]>

const BRAND = "FF0E9F6E" // emerald-600
const HEADER_FONT = "FFFFFFFF"
const TOTMONEY = "#,##0.00"

const num = (v: any): number => {
  const n = typeof v === "number" ? v : parseFloat(v)
  return Number.isFinite(n) ? n : 0
}
const dateOnly = (v: any): string => (typeof v === "string" ? v.split("T")[0] : v ?? "")

// ── Bilingual label sets ────────────────────────────────────────────────
interface Labels {
  yes: string
  no: string
  totals: string
  summaryTab: string
  summaryTitle: (co: string) => string
  exportDate: string
  systemVersion: string
  totalRecords: string
  kpi: string
  value: string
  accType: Record<string, string>
  normalBal: Record<string, string>
  payType: { customer: string; supplier: string; other: string }
  // sheet titles
  s: Record<string, string>
  // column headers keyed by a stable code
  h: Record<string, string>
  // KPI labels
  k: Record<string, string>
}

const AR: Labels = {
  yes: "نعم",
  no: "لا",
  totals: "الإجمالي",
  summaryTab: "ملخص",
  summaryTitle: (co) => `ملخص بيانات: ${co}`,
  exportDate: "تاريخ التصدير",
  systemVersion: "إصدار النظام",
  totalRecords: "إجمالي السجلات",
  kpi: "المؤشر",
  value: "القيمة",
  accType: { asset: "أصول", liability: "التزامات", equity: "حقوق ملكية", income: "إيرادات", expense: "مصروفات" },
  normalBal: { debit: "مدين", credit: "دائن" },
  payType: { customer: "تحصيل عميل", supplier: "دفع مورد", other: "أخرى" },
  s: {
    customers: "العملاء",
    suppliers: "الموردون",
    products: "المنتجات والمخزون",
    sales: "فواتير المبيعات",
    purchases: "فواتير المشتريات",
    payments: "المدفوعات",
    journal: "القيود اليومية",
    employees: "الموظفون",
    coa: "دليل الحسابات",
  },
  h: {
    name: "الاسم",
    phone: "الهاتف",
    email: "البريد الإلكتروني",
    address: "العنوان",
    governorate: "المحافظة",
    city: "المدينة",
    payTerms: "شروط الدفع",
    active: "نشط",
    created: "تاريخ الإضافة",
    sku: "الكود (SKU)",
    unit: "الوحدة",
    price: "سعر البيع",
    cost: "سعر التكلفة",
    qty: "الكمية المتاحة",
    reorder: "حد إعادة الطلب",
    type: "النوع",
    invNo: "رقم الفاتورة",
    date: "التاريخ",
    customer: "العميل",
    supplier: "المورد",
    subtotal: "الإجمالي قبل الضريبة",
    tax: "الضريبة",
    total: "الإجمالي",
    paid: "المدفوع",
    due: "المتبقي",
    status: "الحالة",
    party: "الطرف",
    amount: "المبلغ",
    currency: "العملة",
    base: "بالجنيه",
    method: "الطريقة",
    jeNo: "رقم القيد",
    desc: "البيان",
    debit: "إجمالي المدين",
    credit: "إجمالي الدائن",
    job: "الوظيفة",
    dept: "القسم",
    salary: "الراتب الأساسي",
    joined: "تاريخ التعيين",
    accCode: "رقم الحساب",
    accName: "اسم الحساب",
    normal: "طبيعة الرصيد",
  },
  k: {
    customers: "عدد العملاء",
    suppliers: "عدد الموردين",
    products: "عدد المنتجات",
    employees: "عدد الموظفين",
    salesCount: "عدد فواتير المبيعات",
    salesTotal: "إجمالي المبيعات",
    collected: "المُحصَّل من العملاء",
    ar: "مديونية العملاء (متبقٍ)",
    purchCount: "عدد فواتير المشتريات",
    purchTotal: "إجمالي المشتريات",
    paidOut: "المدفوع للموردين",
    ap: "المستحق للموردين (متبقٍ)",
    journal: "عدد القيود اليومية",
  },
}

const EN: Labels = {
  yes: "Yes",
  no: "No",
  totals: "Total",
  summaryTab: "Summary",
  summaryTitle: (co) => `Data summary: ${co}`,
  exportDate: "Export date",
  systemVersion: "System version",
  totalRecords: "Total records",
  kpi: "Indicator",
  value: "Value",
  accType: { asset: "Asset", liability: "Liability", equity: "Equity", income: "Income", expense: "Expense" },
  normalBal: { debit: "Debit", credit: "Credit" },
  payType: { customer: "Customer receipt", supplier: "Supplier payment", other: "Other" },
  s: {
    customers: "Customers",
    suppliers: "Suppliers",
    products: "Products & Inventory",
    sales: "Sales Invoices",
    purchases: "Purchase Bills",
    payments: "Payments",
    journal: "Journal Entries",
    employees: "Employees",
    coa: "Chart of Accounts",
  },
  h: {
    name: "Name",
    phone: "Phone",
    email: "Email",
    address: "Address",
    governorate: "Governorate",
    city: "City",
    payTerms: "Payment terms",
    active: "Active",
    created: "Created",
    sku: "SKU",
    unit: "Unit",
    price: "Sale price",
    cost: "Cost price",
    qty: "Qty on hand",
    reorder: "Reorder level",
    type: "Type",
    invNo: "Invoice #",
    date: "Date",
    customer: "Customer",
    supplier: "Supplier",
    subtotal: "Subtotal",
    tax: "Tax",
    total: "Total",
    paid: "Paid",
    due: "Due",
    status: "Status",
    party: "Party",
    amount: "Amount",
    currency: "Currency",
    base: "In EGP",
    method: "Method",
    jeNo: "Entry #",
    desc: "Description",
    debit: "Total debit",
    credit: "Total credit",
    job: "Job title",
    dept: "Department",
    salary: "Base salary",
    joined: "Joined date",
    accCode: "Account #",
    accName: "Account name",
    normal: "Normal balance",
  },
  k: {
    customers: "Customers",
    suppliers: "Suppliers",
    products: "Products",
    employees: "Employees",
    salesCount: "Sales invoices",
    salesTotal: "Total sales",
    collected: "Collected from customers",
    ar: "Customer receivables (due)",
    purchCount: "Purchase bills",
    purchTotal: "Total purchases",
    paidOut: "Paid to suppliers",
    ap: "Payables to suppliers (due)",
    journal: "Journal entries",
  },
}

interface Col {
  header: string
  key: string
  width?: number
  money?: boolean
  total?: boolean
}

function indexBy(rows: any[] | undefined, idField: string, nameField: string): Record<string, string> {
  const m: Record<string, string> = {}
  for (const r of rows || []) {
    if (r && r[idField]) m[r[idField]] = r[nameField] ?? ""
  }
  return m
}

function addSheet(wb: ExcelJS.Workbook, rtl: boolean, totalsLabel: string, title: string, cols: Col[], rows: Row[]): void {
  const ws = wb.addWorksheet(title)
  ws.views = [{ rightToLeft: rtl, state: "frozen", ySplit: 1 } as any]
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }))

  const head = ws.getRow(1)
  head.height = 22
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT }, size: 12 }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } }
    cell.alignment = { vertical: "middle", horizontal: "center" }
    cell.border = { bottom: { style: "thin", color: { argb: "FFB0B0B0" } } }
  })

  for (const r of rows) {
    const added = ws.addRow(r)
    added.eachCell((cell) => {
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false }
    })
    for (const c of cols) {
      if (c.money) added.getCell(c.key).numFmt = TOTMONEY
    }
  }

  const hasTotals = cols.some((c) => c.total)
  if (hasTotals && rows.length > 0) {
    const totalObj: Row = {}
    let labelPlaced = false
    for (const c of cols) {
      if (c.total) totalObj[c.key] = rows.reduce((s, r) => s + num(r[c.key]), 0)
      else if (!labelPlaced) {
        totalObj[c.key] = totalsLabel
        labelPlaced = true
      }
    }
    const tr = ws.addRow(totalObj)
    tr.eachCell((cell) => {
      cell.font = { bold: true }
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6F1" } }
      cell.alignment = { vertical: "middle", horizontal: "center" }
    })
    for (const c of cols) {
      if (c.money) tr.getCell(c.key).numFmt = TOTMONEY
    }
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } }
}

function addSummary(wb: ExcelJS.Workbook, backup: BackupData, d: Dict, L: Labels, rtl: boolean): void {
  const ws = wb.addWorksheet(L.summaryTab)
  ws.views = [{ rightToLeft: rtl } as any]
  ws.getColumn(1).width = 40
  ws.getColumn(2).width = 26

  const title = ws.addRow([L.summaryTitle(backup.metadata?.company_name ?? "")])
  ws.mergeCells(title.number, 1, title.number, 2)
  title.getCell(1).font = { bold: true, size: 16, color: { argb: HEADER_FONT } }
  title.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } }
  title.getCell(1).alignment = { horizontal: "center", vertical: "middle" }
  title.height = 28

  ws.addRow([L.exportDate, dateOnly(backup.metadata?.created_at) || new Date().toISOString().split("T")[0]])
  ws.addRow([L.systemVersion, backup.metadata?.system_version ?? ""])
  ws.addRow([L.totalRecords, num(backup.metadata?.total_records)])
  ws.addRow([])

  const invoices = (d.invoices || []).filter((r) => !r?.is_deleted)
  const bills = (d.bills || []).filter((r) => !r?.is_deleted)
  const payments = (d.payments || []).filter((r) => !r?.is_deleted && num(r?.amount) > 0 && r?.status !== "rejected")
  const custPay = payments.filter((p) => p?.customer_id)
  const suppPay = payments.filter((p) => p?.supplier_id)

  const totalSales = invoices.reduce((s, r) => s + num(r.total_amount), 0)
  const arOutstanding = invoices.reduce((s, r) => s + (num(r.total_amount) - num(r.paid_amount)), 0)
  const totalPurch = bills.reduce((s, r) => s + num(r.total_amount), 0)
  const apOutstanding = bills.reduce((s, r) => s + (num(r.total_amount) - num(r.paid_amount)), 0)
  const collected = custPay.reduce((s, r) => s + num(r.base_currency_amount ?? r.amount), 0)
  const paidOut = suppPay.reduce((s, r) => s + num(r.base_currency_amount ?? r.amount), 0)

  const kpis: Array<[string, number, boolean?]> = [
    [L.k.customers, (d.customers || []).length],
    [L.k.suppliers, (d.suppliers || []).length],
    [L.k.products, (d.products || []).length],
    [L.k.employees, (d.employees || []).length],
    [L.k.salesCount, invoices.length],
    [L.k.salesTotal, totalSales, true],
    [L.k.collected, collected, true],
    [L.k.ar, arOutstanding, true],
    [L.k.purchCount, bills.length],
    [L.k.purchTotal, totalPurch, true],
    [L.k.paidOut, paidOut, true],
    [L.k.ap, apOutstanding, true],
    [L.k.journal, (d.journal_entries || []).length],
  ]

  const hdr = ws.addRow([L.kpi, L.value])
  hdr.eachCell((c) => {
    c.font = { bold: true, color: { argb: HEADER_FONT } }
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } }
    c.alignment = { horizontal: "center" }
  })
  for (const [label, value, money] of kpis) {
    const r = ws.addRow([label, value])
    r.getCell(1).font = { bold: true }
    r.getCell(1).alignment = { horizontal: rtl ? "right" : "left" }
    r.getCell(2).alignment = { horizontal: "center" }
    if (money) r.getCell(2).numFmt = TOTMONEY
  }
}

/**
 * Build the full workbook and return it as a Node Buffer ready to stream.
 * @param lang "ar" (RTL, Arabic labels) or "en" (LTR, English labels).
 */
export async function buildBackupExcel(backup: BackupData, lang: ExcelLang = "ar"): Promise<Buffer> {
  const L = lang === "en" ? EN : AR
  const rtl = lang !== "en"
  const d: Dict = (backup?.data as Dict) || {}
  const wb = new ExcelJS.Workbook()
  wb.creator = "ERB"
  wb.created = new Date()

  const custName = indexBy(d.customers, "id", "name")
  const suppName = indexBy(d.suppliers, "id", "name")

  const jeDebit: Record<string, number> = {}
  const jeCredit: Record<string, number> = {}
  for (const l of d.journal_entry_lines || []) {
    const id = l?.journal_entry_id
    if (!id) continue
    jeDebit[id] = (jeDebit[id] || 0) + num(l.debit_amount)
    jeCredit[id] = (jeCredit[id] || 0) + num(l.credit_amount)
  }

  const yesNo = (v: any) => (v ? L.yes : L.no)
  const sheet = (title: string, cols: Col[], rows: Row[]) => addSheet(wb, rtl, L.totals, title, cols, rows)

  // 1) Summary
  addSummary(wb, backup, d, L, rtl)

  // 2) Customers
  sheet(
    L.s.customers,
    [
      { header: L.h.name, key: "name", width: 26 },
      { header: L.h.phone, key: "phone", width: 18 },
      { header: L.h.email, key: "email", width: 24 },
      { header: L.h.address, key: "detailed_address", width: 28 },
      { header: L.h.governorate, key: "governorate", width: 16 },
      { header: L.h.payTerms, key: "payment_terms", width: 14 },
      { header: L.h.active, key: "active", width: 8 },
      { header: L.h.created, key: "created", width: 14 },
    ],
    (d.customers || []).map((r) => ({
      name: r.name,
      phone: r.phone,
      email: r.email,
      detailed_address: r.detailed_address,
      governorate: r.governorate,
      payment_terms: r.payment_terms,
      active: yesNo(r.is_active),
      created: dateOnly(r.created_at),
    }))
  )

  // 3) Suppliers
  sheet(
    L.s.suppliers,
    [
      { header: L.h.name, key: "name", width: 26 },
      { header: L.h.phone, key: "phone", width: 18 },
      { header: L.h.email, key: "email", width: 24 },
      { header: L.h.city, key: "city", width: 16 },
      { header: L.h.payTerms, key: "payment_terms", width: 14 },
      { header: L.h.active, key: "active", width: 8 },
      { header: L.h.created, key: "created", width: 14 },
    ],
    (d.suppliers || []).map((r) => ({
      name: r.name,
      phone: r.phone,
      email: r.email,
      city: r.city,
      payment_terms: r.payment_terms,
      active: yesNo(r.is_active),
      created: dateOnly(r.created_at),
    }))
  )

  // 4) Products & inventory
  sheet(
    L.s.products,
    [
      { header: L.h.sku, key: "sku", width: 16 },
      { header: L.h.name, key: "name", width: 26 },
      { header: L.h.unit, key: "unit", width: 12 },
      { header: L.h.price, key: "price", width: 14, money: true },
      { header: L.h.cost, key: "cost", width: 14, money: true },
      { header: L.h.qty, key: "qty", width: 14, total: true },
      { header: L.h.reorder, key: "reorder", width: 14 },
      { header: L.h.type, key: "type", width: 14 },
      { header: L.h.active, key: "active", width: 8 },
    ],
    (d.products || []).map((r) => ({
      sku: r.sku,
      name: r.name,
      unit: r.unit,
      price: num(r.unit_price),
      cost: num(r.cost_price),
      qty: num(r.quantity_on_hand),
      reorder: num(r.reorder_level),
      type: r.product_type,
      active: yesNo(r.is_active),
    }))
  )

  // 5) Sales invoices
  sheet(
    L.s.sales,
    [
      { header: L.h.invNo, key: "no", width: 18 },
      { header: L.h.date, key: "date", width: 14 },
      { header: L.h.customer, key: "customer", width: 24 },
      { header: L.h.subtotal, key: "subtotal", width: 16, money: true, total: true },
      { header: L.h.tax, key: "tax", width: 12, money: true, total: true },
      { header: L.h.total, key: "total", width: 14, money: true, total: true },
      { header: L.h.paid, key: "paid", width: 12, money: true, total: true },
      { header: L.h.due, key: "due", width: 12, money: true, total: true },
      { header: L.h.status, key: "status", width: 12 },
    ],
    (d.invoices || [])
      .filter((r) => !r?.is_deleted)
      .map((r) => ({
        no: r.invoice_number,
        date: dateOnly(r.invoice_date),
        customer: r.customer_name_snapshot || custName[r.customer_id] || "",
        subtotal: num(r.subtotal),
        tax: num(r.tax_amount),
        total: num(r.total_amount),
        paid: num(r.paid_amount),
        due: num(r.total_amount) - num(r.paid_amount),
        status: r.status,
      }))
  )

  // 6) Purchase bills
  sheet(
    L.s.purchases,
    [
      { header: L.h.invNo, key: "no", width: 18 },
      { header: L.h.date, key: "date", width: 14 },
      { header: L.h.supplier, key: "supplier", width: 24 },
      { header: L.h.subtotal, key: "subtotal", width: 16, money: true, total: true },
      { header: L.h.tax, key: "tax", width: 12, money: true, total: true },
      { header: L.h.total, key: "total", width: 14, money: true, total: true },
      { header: L.h.paid, key: "paid", width: 12, money: true, total: true },
      { header: L.h.due, key: "due", width: 12, money: true, total: true },
      { header: L.h.status, key: "status", width: 14 },
    ],
    (d.bills || [])
      .filter((r) => !r?.is_deleted)
      .map((r) => ({
        no: r.bill_number,
        date: dateOnly(r.bill_date),
        supplier: suppName[r.supplier_id] || "",
        subtotal: num(r.subtotal),
        tax: num(r.tax_amount),
        total: num(r.total_amount),
        paid: num(r.paid_amount),
        due: num(r.total_amount) - num(r.paid_amount),
        status: r.status,
      }))
  )

  // 7) Payments
  sheet(
    L.s.payments,
    [
      { header: L.h.date, key: "date", width: 14 },
      { header: L.h.type, key: "type", width: 14 },
      { header: L.h.party, key: "party", width: 24 },
      { header: L.h.amount, key: "amount", width: 14, money: true },
      { header: L.h.currency, key: "currency", width: 10 },
      { header: L.h.base, key: "base", width: 14, money: true, total: true },
      { header: L.h.method, key: "method", width: 12 },
      { header: L.h.status, key: "status", width: 12 },
    ],
    (d.payments || [])
      .filter((r) => !r?.is_deleted)
      .map((r) => ({
        date: dateOnly(r.payment_date),
        type: r.customer_id ? L.payType.customer : r.supplier_id ? L.payType.supplier : L.payType.other,
        party: r.customer_id ? custName[r.customer_id] || "" : suppName[r.supplier_id] || "",
        amount: num(r.amount),
        currency: r.currency_code || "EGP",
        base: num(r.base_currency_amount ?? r.amount),
        method: r.payment_method,
        status: r.status,
      }))
  )

  // 8) Journal entries
  sheet(
    L.s.journal,
    [
      { header: L.h.jeNo, key: "no", width: 16 },
      { header: L.h.date, key: "date", width: 14 },
      { header: L.h.desc, key: "desc", width: 40 },
      { header: L.h.status, key: "status", width: 12 },
      { header: L.h.debit, key: "debit", width: 16, money: true, total: true },
      { header: L.h.credit, key: "credit", width: 16, money: true, total: true },
    ],
    (d.journal_entries || [])
      .filter((r) => !r?.is_deleted)
      .map((r) => ({
        no: r.entry_number,
        date: dateOnly(r.entry_date),
        desc: r.description,
        status: r.status,
        debit: jeDebit[r.id] || 0,
        credit: jeCredit[r.id] || 0,
      }))
  )

  // 9) Employees
  sheet(
    L.s.employees,
    [
      { header: L.h.name, key: "name", width: 26 },
      { header: L.h.job, key: "job", width: 20 },
      { header: L.h.dept, key: "dept", width: 18 },
      { header: L.h.salary, key: "salary", width: 16, money: true, total: true },
      { header: L.h.joined, key: "joined", width: 14 },
    ],
    (d.employees || []).map((r) => ({
      name: r.full_name,
      job: r.job_title,
      dept: r.department,
      salary: num(r.base_salary),
      joined: dateOnly(r.joined_date),
    }))
  )

  // 10) Chart of accounts
  sheet(
    L.s.coa,
    [
      { header: L.h.accCode, key: "code", width: 14 },
      { header: L.h.accName, key: "name", width: 34 },
      { header: L.h.type, key: "type", width: 16 },
      { header: L.h.normal, key: "normal", width: 14 },
    ],
    (d.chart_of_accounts || [])
      .slice()
      .sort((a, b) => String(a.account_code).localeCompare(String(b.account_code)))
      .map((r) => ({
        code: r.account_code,
        name: r.account_name,
        type: L.accType[r.account_type] || r.account_type,
        normal: L.normalBal[r.normal_balance] || r.normal_balance,
      }))
  )

  const arrayBuf = await wb.xlsx.writeBuffer()
  // exceljs types writeBuffer() as its own Buffer alias; normalize to Node Buffer.
  return Buffer.from(arrayBuf as any)
}

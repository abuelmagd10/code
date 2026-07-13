/**
 * Human-readable Excel export of a company backup.
 *
 * Unlike the JSON backup (which is a faithful, machine-oriented dump meant for
 * restore), this produces a formatted .xlsx that an owner or accountant can
 * actually read: Arabic headers, one sheet per business entity, IDs resolved to
 * names, money columns formatted, totals rows, and a summary dashboard.
 *
 * It consumes the SAME in-memory `BackupData` the JSON export produces, so it
 * needs no extra DB round-trips and never diverges from the backup contents.
 */
import ExcelJS from "exceljs"
import type { BackupData } from "@/lib/backup/types"

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
const yesNo = (v: any): string => (v ? "نعم" : "لا")

const ACCOUNT_TYPE_AR: Record<string, string> = {
  asset: "أصول",
  liability: "التزامات",
  equity: "حقوق ملكية",
  income: "إيرادات",
  expense: "مصروفات",
}
const NORMAL_BAL_AR: Record<string, string> = { debit: "مدين", credit: "دائن" }

interface Col {
  header: string
  key: string
  width?: number
  money?: boolean
  total?: boolean // include a sum in the totals row
}

/** Build a lookup map id -> chosen display field. */
function indexBy(rows: any[] | undefined, idField: string, nameField: string): Record<string, string> {
  const m: Record<string, string> = {}
  for (const r of rows || []) {
    if (r && r[idField]) m[r[idField]] = r[nameField] ?? ""
  }
  return m
}

/**
 * Add a styled data sheet. Returns the worksheet.
 *  - RTL, frozen bold header, thin borders, money formatting.
 *  - Optional totals row summing columns flagged `total`.
 */
function addSheet(wb: ExcelJS.Workbook, title: string, cols: Col[], rows: Row[]): void {
  const ws = wb.addWorksheet(title)
  // exceljs' WorksheetView typing is a discriminated union; assign directly.
  ws.views = [{ rightToLeft: true, state: "frozen", ySplit: 1 } as any]
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }))

  // Header styling
  const head = ws.getRow(1)
  head.height = 22
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT }, size: 12 }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } }
    cell.alignment = { vertical: "middle", horizontal: "center" }
    cell.border = { bottom: { style: "thin", color: { argb: "FFB0B0B0" } } }
  })

  // Data rows
  for (const r of rows) {
    const added = ws.addRow(r)
    added.eachCell((cell) => {
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false }
    })
    for (const c of cols) {
      if (c.money) added.getCell(c.key).numFmt = TOTMONEY
    }
  }

  // Totals row
  const hasTotals = cols.some((c) => c.total)
  if (hasTotals && rows.length > 0) {
    const totalObj: Row = {}
    let labelPlaced = false
    for (const c of cols) {
      if (c.total) {
        totalObj[c.key] = rows.reduce((s, r) => s + num(r[c.key]), 0)
      } else if (!labelPlaced) {
        totalObj[c.key] = "الإجمالي"
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

/** Summary / dashboard sheet placed first. */
function addSummary(wb: ExcelJS.Workbook, backup: BackupData, d: Dict): void {
  const ws = wb.addWorksheet("ملخص")
  ws.views = [{ rightToLeft: true } as any]
  ws.getColumn(1).width = 38
  ws.getColumn(2).width = 26

  const title = ws.addRow([`ملخص بيانات: ${backup.metadata?.company_name ?? ""}`])
  ws.mergeCells(title.number, 1, title.number, 2)
  title.getCell(1).font = { bold: true, size: 16, color: { argb: HEADER_FONT } }
  title.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } }
  title.getCell(1).alignment = { horizontal: "center", vertical: "middle" }
  title.height = 28

  ws.addRow([`تاريخ التصدير`, dateOnly(backup.metadata?.created_at) || new Date().toISOString().split("T")[0]])
  ws.addRow([`إصدار النظام`, backup.metadata?.system_version ?? ""])
  ws.addRow([`إجمالي السجلات`, num(backup.metadata?.total_records)])
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
    ["عدد العملاء", (d.customers || []).length],
    ["عدد الموردين", (d.suppliers || []).length],
    ["عدد المنتجات", (d.products || []).length],
    ["عدد الموظفين", (d.employees || []).length],
    ["عدد فواتير المبيعات", invoices.length],
    ["إجمالي المبيعات", totalSales, true],
    ["المُحصَّل من العملاء", collected, true],
    ["مديونية العملاء (متبقٍ)", arOutstanding, true],
    ["عدد فواتير المشتريات", bills.length],
    ["إجمالي المشتريات", totalPurch, true],
    ["المدفوع للموردين", paidOut, true],
    ["المستحق للموردين (متبقٍ)", apOutstanding, true],
    ["عدد القيود اليومية", (d.journal_entries || []).length],
  ]

  const hdr = ws.addRow(["المؤشر", "القيمة"])
  hdr.eachCell((c) => {
    c.font = { bold: true, color: { argb: HEADER_FONT } }
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } }
    c.alignment = { horizontal: "center" }
  })
  for (const [label, value, money] of kpis) {
    const r = ws.addRow([label, value])
    r.getCell(1).font = { bold: true }
    r.getCell(1).alignment = { horizontal: "right" }
    r.getCell(2).alignment = { horizontal: "center" }
    if (money) r.getCell(2).numFmt = TOTMONEY
  }
}

/**
 * Build the full workbook and return it as a Node Buffer ready to stream.
 */
export async function buildBackupExcel(backup: BackupData): Promise<Buffer> {
  const d: Dict = (backup?.data as Dict) || {}
  const wb = new ExcelJS.Workbook()
  wb.creator = "ERB"
  wb.created = new Date()

  // Lookups
  const custName = indexBy(d.customers, "id", "name")
  const suppName = indexBy(d.suppliers, "id", "name")

  // Journal debit/credit totals per entry (from lines)
  const jeDebit: Record<string, number> = {}
  const jeCredit: Record<string, number> = {}
  for (const l of d.journal_entry_lines || []) {
    const id = l?.journal_entry_id
    if (!id) continue
    jeDebit[id] = (jeDebit[id] || 0) + num(l.debit_amount)
    jeCredit[id] = (jeCredit[id] || 0) + num(l.credit_amount)
  }

  // 1) Summary
  addSummary(wb, backup, d)

  // 2) Customers
  addSheet(
    wb,
    "العملاء",
    [
      { header: "الاسم", key: "name", width: 26 },
      { header: "الهاتف", key: "phone", width: 18 },
      { header: "البريد الإلكتروني", key: "email", width: 24 },
      { header: "العنوان", key: "detailed_address", width: 28 },
      { header: "المحافظة", key: "governorate", width: 16 },
      { header: "شروط الدفع", key: "payment_terms", width: 14 },
      { header: "نشط", key: "active", width: 8 },
      { header: "تاريخ الإضافة", key: "created", width: 14 },
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
  addSheet(
    wb,
    "الموردون",
    [
      { header: "الاسم", key: "name", width: 26 },
      { header: "الهاتف", key: "phone", width: 18 },
      { header: "البريد الإلكتروني", key: "email", width: 24 },
      { header: "المدينة", key: "city", width: 16 },
      { header: "شروط الدفع", key: "payment_terms", width: 14 },
      { header: "نشط", key: "active", width: 8 },
      { header: "تاريخ الإضافة", key: "created", width: 14 },
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
  addSheet(
    wb,
    "المنتجات والمخزون",
    [
      { header: "الكود (SKU)", key: "sku", width: 16 },
      { header: "الاسم", key: "name", width: 26 },
      { header: "الوحدة", key: "unit", width: 12 },
      { header: "سعر البيع", key: "price", width: 14, money: true },
      { header: "سعر التكلفة", key: "cost", width: 14, money: true },
      { header: "الكمية المتاحة", key: "qty", width: 14, total: true },
      { header: "حد إعادة الطلب", key: "reorder", width: 14 },
      { header: "النوع", key: "type", width: 14 },
      { header: "نشط", key: "active", width: 8 },
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
  addSheet(
    wb,
    "فواتير المبيعات",
    [
      { header: "رقم الفاتورة", key: "no", width: 18 },
      { header: "التاريخ", key: "date", width: 14 },
      { header: "العميل", key: "customer", width: 24 },
      { header: "الإجمالي قبل الضريبة", key: "subtotal", width: 16, money: true, total: true },
      { header: "الضريبة", key: "tax", width: 12, money: true, total: true },
      { header: "الإجمالي", key: "total", width: 14, money: true, total: true },
      { header: "المدفوع", key: "paid", width: 12, money: true, total: true },
      { header: "المتبقي", key: "due", width: 12, money: true, total: true },
      { header: "الحالة", key: "status", width: 12 },
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
  addSheet(
    wb,
    "فواتير المشتريات",
    [
      { header: "رقم الفاتورة", key: "no", width: 18 },
      { header: "التاريخ", key: "date", width: 14 },
      { header: "المورد", key: "supplier", width: 24 },
      { header: "الإجمالي قبل الضريبة", key: "subtotal", width: 16, money: true, total: true },
      { header: "الضريبة", key: "tax", width: 12, money: true, total: true },
      { header: "الإجمالي", key: "total", width: 14, money: true, total: true },
      { header: "المدفوع", key: "paid", width: 12, money: true, total: true },
      { header: "المتبقي", key: "due", width: 12, money: true, total: true },
      { header: "الحالة", key: "status", width: 14 },
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
  addSheet(
    wb,
    "المدفوعات",
    [
      { header: "التاريخ", key: "date", width: 14 },
      { header: "النوع", key: "type", width: 12 },
      { header: "الطرف", key: "party", width: 24 },
      { header: "المبلغ", key: "amount", width: 14, money: true },
      { header: "العملة", key: "currency", width: 10 },
      { header: "بالجنيه", key: "base", width: 14, money: true, total: true },
      { header: "الطريقة", key: "method", width: 12 },
      { header: "الحالة", key: "status", width: 12 },
    ],
    (d.payments || [])
      .filter((r) => !r?.is_deleted)
      .map((r) => ({
        date: dateOnly(r.payment_date),
        type: r.customer_id ? "تحصيل عميل" : r.supplier_id ? "دفع مورد" : "أخرى",
        party: r.customer_id ? custName[r.customer_id] || "" : suppName[r.supplier_id] || "",
        amount: num(r.amount),
        currency: r.currency_code || "EGP",
        base: num(r.base_currency_amount ?? r.amount),
        method: r.payment_method,
        status: r.status,
      }))
  )

  // 8) Journal entries
  addSheet(
    wb,
    "القيود اليومية",
    [
      { header: "رقم القيد", key: "no", width: 16 },
      { header: "التاريخ", key: "date", width: 14 },
      { header: "البيان", key: "desc", width: 40 },
      { header: "الحالة", key: "status", width: 12 },
      { header: "إجمالي المدين", key: "debit", width: 16, money: true, total: true },
      { header: "إجمالي الدائن", key: "credit", width: 16, money: true, total: true },
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
  addSheet(
    wb,
    "الموظفون",
    [
      { header: "الاسم", key: "name", width: 26 },
      { header: "الوظيفة", key: "job", width: 20 },
      { header: "القسم", key: "dept", width: 18 },
      { header: "الراتب الأساسي", key: "salary", width: 16, money: true, total: true },
      { header: "تاريخ التعيين", key: "joined", width: 14 },
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
  addSheet(
    wb,
    "دليل الحسابات",
    [
      { header: "رقم الحساب", key: "code", width: 14 },
      { header: "اسم الحساب", key: "name", width: 34 },
      { header: "النوع", key: "type", width: 16 },
      { header: "طبيعة الرصيد", key: "normal", width: 14 },
    ],
    (d.chart_of_accounts || [])
      .slice()
      .sort((a, b) => String(a.account_code).localeCompare(String(b.account_code)))
      .map((r) => ({
        code: r.account_code,
        name: r.account_name,
        type: ACCOUNT_TYPE_AR[r.account_type] || r.account_type,
        normal: NORMAL_BAL_AR[r.normal_balance] || r.normal_balance,
      }))
  )

  const arrayBuf = await wb.xlsx.writeBuffer()
  // exceljs types writeBuffer() as its own Buffer alias; normalize to Node Buffer.
  return Buffer.from(arrayBuf as any)
}

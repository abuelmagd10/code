/**
 * Invoice PDF Generator - 7ESAB ERP v3.30.0
 *
 * Generates VAT-compliant PDF invoices using pdfkit (pure Node.js).
 * Bilingual layout: English labels (universal B2B standard) with company
 * name preserved as stored (Arabic/English/mixed).
 *
 * Invoice fields stored in `billing_invoices`:
 *   - invoice_number (INV-YYYY-NNNNNN via DB trigger)
 *   - subtotal / discount_amount / tax_amount / total
 *   - tax_rate / billing_period / seats_count
 *   - paymob_transaction_id
 *   - exchange_rate_used / total_usd
 *   - metadata (jsonb) — full pricing_snapshot from pricing-engine
 *
 * Output: Uploaded to Supabase Storage bucket `billing-invoices`
 * Path:   {company_id}/{invoice_number}.pdf
 */

import PDFDocument from 'pdfkit'

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export interface InvoiceData {
  // Header
  invoiceNumber: string
  invoiceDate: Date | string
  dueDate?: Date | string | null
  status: 'paid' | 'pending' | 'failed' | 'draft' | 'void'

  // Seller (7esab.com)
  seller: {
    name: string
    addressLines: string[]
    email: string
    website: string
    vatNumber?: string
  }

  // Buyer (customer company)
  buyer: {
    companyName: string
    countryCode: string
    email?: string
    vatNumber?: string
  }

  // Line items
  lineItems: Array<{
    description: string
    quantity: number
    unitPrice: number          // in display currency
    amount: number             // qty × unitPrice
  }>

  // Totals (in display currency)
  currency: string             // ISO code e.g. 'EGP', 'USD'
  subtotal: number
  volumeDiscountAmount: number
  volumeDiscountPercent: number
  annualDiscountAmount: number
  annualDiscountPercent: number
  couponDiscountAmount: number
  couponCode?: string | null
  totalDiscount: number
  taxableAmount: number        // subtotal - totalDiscount
  taxRate: number              // %
  taxAmount: number
  total: number                // final amount in display currency

  // EGP charge details (Paymob)
  chargeCurrency: string       // always 'EGP'
  chargeExchangeRate: number   // FX rate used at charge time
  chargeTotalEgp: number       // final amount in EGP

  // Payment metadata
  paymentMethod?: string       // 'Paymob'
  paymobTransactionId?: string | null
  paidAt?: Date | string | null

  // Period
  billingPeriod?: 'monthly' | 'annual' | null
  periodStart?: Date | string | null
  periodEnd?: Date | string | null

  // Notes
  notes?: string[]
}

// ─────────────────────────────────────────
// Constants - Layout
// ─────────────────────────────────────────

const PAGE_MARGIN = 50
const PRIMARY = '#0F4C81'      // 7esab brand-ish navy
const TEXT_DARK = '#1F2937'
const TEXT_MUTED = '#6B7280'
const BORDER = '#E5E7EB'
const ACCENT_BG = '#F9FAFB'
const SUCCESS = '#10B981'
const DANGER = '#EF4444'

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function fmtMoney(amount: number, currency: string): string {
  const safe = Number.isFinite(amount) ? amount : 0
  const formatted = safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${formatted} ${currency}`
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '-'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

function statusLabel(status: InvoiceData['status']): { text: string; color: string } {
  switch (status) {
    case 'paid':    return { text: 'PAID',    color: SUCCESS }
    case 'pending': return { text: 'PENDING', color: '#F59E0B' }
    case 'failed':  return { text: 'FAILED',  color: DANGER }
    case 'void':    return { text: 'VOID',    color: TEXT_MUTED }
    default:        return { text: 'DRAFT',   color: TEXT_MUTED }
  }
}

// ─────────────────────────────────────────
// Renderer
// ─────────────────────────────────────────

/**
 * Render an invoice PDF and return it as a Buffer.
 * Uses pdfkit's standard Helvetica font (Latin-only). Arabic/RTL text
 * is preserved as-is in the source string; characters not in the font
 * fall back gracefully. For full Arabic rendering, embed a TTF and call
 * doc.registerFont('Arabic', '/path/to/font.ttf').
 */
export async function renderInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: PAGE_MARGIN,
        info: {
          Title: `Invoice ${data.invoiceNumber}`,
          Author: data.seller.name,
          Subject: `Subscription invoice for ${data.buyer.companyName}`,
          Producer: '7esab ERP',
        },
      })

      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', (err: Error) => reject(err))

      // ── Header ──────────────────────────
      drawHeader(doc, data)

      // ── Invoice info & parties ──────────
      drawInfoAndParties(doc, data)

      // ── Line items table ────────────────
      drawLineItemsTable(doc, data)

      // ── Totals box ──────────────────────
      drawTotalsBox(doc, data)

      // ── EGP charge note ─────────────────
      if (data.currency.toUpperCase() !== 'EGP') {
        drawEgpChargeNote(doc, data)
      }

      // ── Payment details ─────────────────
      drawPaymentDetails(doc, data)

      // ── Footer ──────────────────────────
      drawFooter(doc, data)

      doc.end()
    } catch (err) {
      reject(err as Error)
    }
  })
}

// ─────────────────────────────────────────
// Section: Header
// ─────────────────────────────────────────

function drawHeader(doc: PDFKit.PDFDocument, data: InvoiceData): void {
  const pageWidth = doc.page.width

  // Brand name
  doc
    .fillColor(PRIMARY)
    .font('Helvetica-Bold')
    .fontSize(24)
    .text(data.seller.name, PAGE_MARGIN, PAGE_MARGIN)

  // Tagline
  doc
    .fillColor(TEXT_MUTED)
    .font('Helvetica')
    .fontSize(9)
    .text('Enterprise Resource Planning', PAGE_MARGIN, doc.y + 2)

  // INVOICE label (right side)
  doc
    .fillColor(TEXT_DARK)
    .font('Helvetica-Bold')
    .fontSize(28)
    .text('INVOICE', pageWidth / 2, PAGE_MARGIN, { width: pageWidth / 2 - PAGE_MARGIN, align: 'right' })

  // Status badge under INVOICE
  const status = statusLabel(data.status)
  const badgeY = doc.y + 4
  const badgeText = status.text
  doc.font('Helvetica-Bold').fontSize(10)
  const badgeWidth = doc.widthOfString(badgeText) + 16
  const badgeX = pageWidth - PAGE_MARGIN - badgeWidth

  doc
    .roundedRect(badgeX, badgeY, badgeWidth, 18, 3)
    .fillColor(status.color)
    .fill()
  doc
    .fillColor('#FFFFFF')
    .text(badgeText, badgeX, badgeY + 4, { width: badgeWidth, align: 'center' })

  // Separator line
  const sepY = badgeY + 30
  doc
    .strokeColor(BORDER)
    .lineWidth(1)
    .moveTo(PAGE_MARGIN, sepY)
    .lineTo(pageWidth - PAGE_MARGIN, sepY)
    .stroke()

  doc.y = sepY + 15
}

// ─────────────────────────────────────────
// Section: Info row + From/To parties
// ─────────────────────────────────────────

function drawInfoAndParties(doc: PDFKit.PDFDocument, data: InvoiceData): void {
  const startY = doc.y
  const colWidth = (doc.page.width - PAGE_MARGIN * 2 - 20) / 2

  // ── Left column: Invoice meta ──
  doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT_MUTED).text('INVOICE NUMBER', PAGE_MARGIN, startY)
  doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXT_DARK).text(data.invoiceNumber, PAGE_MARGIN, doc.y + 1)

  doc.moveDown(0.5)
  doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT_MUTED).text('ISSUE DATE', PAGE_MARGIN, doc.y)
  doc.font('Helvetica').fontSize(11).fillColor(TEXT_DARK).text(fmtDate(data.invoiceDate), PAGE_MARGIN, doc.y + 1)

  if (data.dueDate) {
    doc.moveDown(0.5)
    doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT_MUTED).text('DUE DATE', PAGE_MARGIN, doc.y)
    doc.font('Helvetica').fontSize(11).fillColor(TEXT_DARK).text(fmtDate(data.dueDate), PAGE_MARGIN, doc.y + 1)
  }

  if (data.billingPeriod) {
    doc.moveDown(0.5)
    doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT_MUTED).text('BILLING PERIOD', PAGE_MARGIN, doc.y)
    const periodText = data.billingPeriod === 'annual' ? 'Annual' : 'Monthly'
    const periodRange = data.periodStart && data.periodEnd
      ? `${periodText} (${fmtDate(data.periodStart)} → ${fmtDate(data.periodEnd)})`
      : periodText
    doc.font('Helvetica').fontSize(11).fillColor(TEXT_DARK).text(periodRange, PAGE_MARGIN, doc.y + 1)
  }

  const leftEndY = doc.y

  // ── Right column: From & To ──
  const rightX = PAGE_MARGIN + colWidth + 20
  doc.y = startY

  // FROM
  doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT_MUTED).text('FROM', rightX, doc.y)
  doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT_DARK).text(data.seller.name, rightX, doc.y + 1)
  doc.font('Helvetica').fontSize(9).fillColor(TEXT_MUTED)
  for (const line of data.seller.addressLines) {
    doc.text(line, rightX, doc.y + 1)
  }
  doc.text(data.seller.email, rightX, doc.y + 1)
  doc.text(data.seller.website, rightX, doc.y + 1)
  if (data.seller.vatNumber) {
    doc.text(`VAT/Tax ID: ${data.seller.vatNumber}`, rightX, doc.y + 1)
  }

  doc.moveDown(0.5)
  // BILL TO
  doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT_MUTED).text('BILL TO', rightX, doc.y)
  doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT_DARK).text(data.buyer.companyName, rightX, doc.y + 1)
  doc.font('Helvetica').fontSize(9).fillColor(TEXT_MUTED).text(`Country: ${data.buyer.countryCode}`, rightX, doc.y + 1)
  if (data.buyer.email) {
    doc.text(data.buyer.email, rightX, doc.y + 1)
  }
  if (data.buyer.vatNumber) {
    doc.text(`VAT/Tax ID: ${data.buyer.vatNumber}`, rightX, doc.y + 1)
  }

  doc.y = Math.max(leftEndY, doc.y) + 20
}

// ─────────────────────────────────────────
// Section: Line items table
// ─────────────────────────────────────────

function drawLineItemsTable(doc: PDFKit.PDFDocument, data: InvoiceData): void {
  const tableX = PAGE_MARGIN
  const tableWidth = doc.page.width - PAGE_MARGIN * 2
  const headerHeight = 24
  const rowHeight = 30

  // Column widths
  const cols = {
    description: { x: tableX + 10,                        width: tableWidth - 280 },
    quantity:    { x: tableX + tableWidth - 270,          width: 60,  align: 'right' as const },
    unitPrice:   { x: tableX + tableWidth - 200,          width: 90,  align: 'right' as const },
    amount:      { x: tableX + tableWidth - 100,          width: 90,  align: 'right' as const },
  }

  // ── Header ──
  doc
    .rect(tableX, doc.y, tableWidth, headerHeight)
    .fillColor(PRIMARY)
    .fill()
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF')
  const headerY = doc.y + 8
  doc.text('Description',  cols.description.x, headerY)
  doc.text('Qty',          cols.quantity.x,    headerY, { width: cols.quantity.width,  align: cols.quantity.align })
  doc.text('Unit Price',   cols.unitPrice.x,   headerY, { width: cols.unitPrice.width, align: cols.unitPrice.align })
  doc.text('Amount',       cols.amount.x,      headerY, { width: cols.amount.width,    align: cols.amount.align })

  doc.y = doc.y + headerHeight

  // ── Rows ──
  doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK)
  data.lineItems.forEach((item, idx) => {
    const rowY = doc.y
    if (idx % 2 === 1) {
      doc.rect(tableX, rowY, tableWidth, rowHeight).fillColor(ACCENT_BG).fill()
    }
    doc.fillColor(TEXT_DARK)
    const textY = rowY + 10
    doc.text(item.description, cols.description.x, textY, { width: cols.description.width })
    doc.text(String(item.quantity),                cols.quantity.x,  textY, { width: cols.quantity.width,  align: cols.quantity.align })
    doc.text(fmtMoney(item.unitPrice, data.currency), cols.unitPrice.x, textY, { width: cols.unitPrice.width, align: cols.unitPrice.align })
    doc.text(fmtMoney(item.amount,    data.currency), cols.amount.x,    textY, { width: cols.amount.width,    align: cols.amount.align })

    doc.y = rowY + rowHeight
  })

  // Bottom border of table
  doc
    .strokeColor(BORDER)
    .lineWidth(1)
    .moveTo(tableX, doc.y)
    .lineTo(tableX + tableWidth, doc.y)
    .stroke()

  doc.y += 10
}

// ─────────────────────────────────────────
// Section: Totals box (right-aligned)
// ─────────────────────────────────────────

function drawTotalsBox(doc: PDFKit.PDFDocument, data: InvoiceData): void {
  const boxX = doc.page.width - PAGE_MARGIN - 260
  const boxWidth = 260
  const labelX = boxX + 10
  const valueX = boxX + boxWidth - 10
  let y = doc.y + 4

  const row = (label: string, value: string, opts?: { bold?: boolean; color?: string; size?: number }) => {
    const size = opts?.size ?? 10
    const color = opts?.color ?? TEXT_DARK
    const font = opts?.bold ? 'Helvetica-Bold' : 'Helvetica'
    doc.font(font).fontSize(size).fillColor(color)
    doc.text(label, labelX, y, { width: 150 })
    doc.text(value, valueX - 120, y, { width: 120, align: 'right' })
    y += size + 6
  }

  row('Subtotal', fmtMoney(data.subtotal, data.currency))

  if (data.volumeDiscountAmount > 0) {
    row(`Volume discount (${data.volumeDiscountPercent}%)`, `- ${fmtMoney(data.volumeDiscountAmount, data.currency)}`, { color: SUCCESS })
  }
  if (data.annualDiscountAmount > 0) {
    row(`Annual prepay (${data.annualDiscountPercent}%)`, `- ${fmtMoney(data.annualDiscountAmount, data.currency)}`, { color: SUCCESS })
  }
  if (data.couponDiscountAmount > 0) {
    const couponLabel = data.couponCode ? `Coupon "${data.couponCode}"` : 'Coupon'
    row(couponLabel, `- ${fmtMoney(data.couponDiscountAmount, data.currency)}`, { color: SUCCESS })
  }

  if (data.taxRate > 0) {
    row(`Taxable amount`, fmtMoney(data.taxableAmount, data.currency))
    row(`VAT / Tax (${data.taxRate}%)`, fmtMoney(data.taxAmount, data.currency))
  }

  // Total separator
  y += 4
  doc
    .strokeColor(TEXT_DARK)
    .lineWidth(1)
    .moveTo(labelX, y)
    .lineTo(valueX, y)
    .stroke()
  y += 8

  row('TOTAL', fmtMoney(data.total, data.currency), { bold: true, size: 13 })

  doc.y = y + 10
}

// ─────────────────────────────────────────
// Section: EGP charge note (Paymob conversion)
// ─────────────────────────────────────────

function drawEgpChargeNote(doc: PDFKit.PDFDocument, data: InvoiceData): void {
  const boxX = PAGE_MARGIN
  const boxWidth = doc.page.width - PAGE_MARGIN * 2
  const boxY = doc.y
  const boxHeight = 50

  doc
    .roundedRect(boxX, boxY, boxWidth, boxHeight, 4)
    .fillColor('#FEF3C7')   // amber-50
    .fill()
  doc
    .roundedRect(boxX, boxY, boxWidth, boxHeight, 4)
    .strokeColor('#F59E0B')
    .lineWidth(1)
    .stroke()

  doc
    .fillColor('#92400E')
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('Charged in EGP via Paymob', boxX + 12, boxY + 8)

  doc
    .fillColor('#78350F')
    .font('Helvetica')
    .fontSize(9)
    .text(
      `This invoice is displayed in ${data.currency} for your reference. The actual charge ` +
      `was processed in EGP at the live exchange rate of 1 USD = ${data.chargeExchangeRate.toFixed(2)} EGP.`,
      boxX + 12, boxY + 22,
      { width: boxWidth - 240 }
    )

  doc
    .fillColor('#92400E')
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(
      `${data.chargeTotalEgp.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`,
      boxX + boxWidth - 200, boxY + 18,
      { width: 188, align: 'right' }
    )

  doc.y = boxY + boxHeight + 12
}

// ─────────────────────────────────────────
// Section: Payment details
// ─────────────────────────────────────────

function drawPaymentDetails(doc: PDFKit.PDFDocument, data: InvoiceData): void {
  doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT_DARK).text('Payment Details', PAGE_MARGIN, doc.y)
  doc.moveDown(0.3)

  const line = (label: string, value: string) => {
    doc.font('Helvetica').fontSize(9).fillColor(TEXT_MUTED).text(label, PAGE_MARGIN, doc.y, { continued: true })
    doc.font('Helvetica').fontSize(9).fillColor(TEXT_DARK).text(`  ${value}`)
  }

  line('Payment method:', data.paymentMethod || 'Paymob')
  if (data.paymobTransactionId) {
    line('Transaction ID:', data.paymobTransactionId)
  }
  if (data.paidAt) {
    line('Paid at:', fmtDate(data.paidAt))
  }

  doc.moveDown(0.5)
}

// ─────────────────────────────────────────
// Section: Footer
// ─────────────────────────────────────────

function drawFooter(doc: PDFKit.PDFDocument, data: InvoiceData): void {
  const pageHeight = doc.page.height
  const footerY = pageHeight - 80

  doc
    .strokeColor(BORDER)
    .lineWidth(1)
    .moveTo(PAGE_MARGIN, footerY)
    .lineTo(doc.page.width - PAGE_MARGIN, footerY)
    .stroke()

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(TEXT_MUTED)
    .text(
      `${data.seller.name} • ${data.seller.email} • ${data.seller.website}`,
      PAGE_MARGIN, footerY + 8,
      { width: doc.page.width - PAGE_MARGIN * 2, align: 'center' }
    )
  doc.text(
    'This is a computer-generated invoice and is valid without a signature.',
    PAGE_MARGIN, footerY + 22,
    { width: doc.page.width - PAGE_MARGIN * 2, align: 'center' }
  )

  if (data.notes && data.notes.length) {
    doc.text(
      data.notes.join(' • '),
      PAGE_MARGIN, footerY + 36,
      { width: doc.page.width - PAGE_MARGIN * 2, align: 'center' }
    )
  }
}

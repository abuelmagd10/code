/**
 * Print Utilities - Unified print/PDF generation
 * توحيد تنسيقات الطباعة وملفات PDF
 */

export interface PrintOptions {
  lang?: 'ar' | 'en'
  direction?: 'rtl' | 'ltr'
  fontSize?: number
  title?: string
  pageSize?: 'A4' | 'Letter'
  margin?: string
}

const defaultOptions: Required<PrintOptions> = {
  lang: 'ar',
  direction: 'rtl',
  fontSize: 11,
  title: 'Document',
  pageSize: 'A4',
  margin: '5mm'
}

export function generatePrintHTML(
  content: string,
  options: PrintOptions = {}
): string {
  const opts = { ...defaultOptions, ...options }
  const isRTL = opts.direction === 'rtl'
  const fontFamily = opts.lang === 'ar' 
    ? "'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif"
    : "'Segoe UI', Tahoma, Arial, sans-serif"

  return `
    <!DOCTYPE html>
    <html dir="${opts.direction}" lang="${opts.lang}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${opts.title}</title>
      ${opts.lang === 'ar' ? '<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet">' : ''}
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          font-family: ${fontFamily} !important;
        }
        html, body {
          direction: ${opts.direction};
          background: #fff;
          color: #1f2937;
          font-size: ${opts.fontSize}px;
          line-height: 1.3;
        }
        .print-content {
          max-width: ${opts.pageSize === 'A4' ? '210mm' : '216mm'};
          max-height: ${opts.pageSize === 'A4' ? '287mm' : '279mm'};
          margin: 0 auto;
          padding: 8px 15px;
          background: #fff;
        }
        /* إخفاء الأزرار */
        button, svg, .print\\:hidden { display: none !important; }
        /* اللوجو */
        img[alt="Company Logo"], img[alt*="Logo"] {
          width: 50px !important;
          height: 50px !important;
          object-fit: contain;
          border-radius: 6px;
        }
        /* العناوين */
        h1 { font-size: 18px; font-weight: 800; color: #1e40af; margin-bottom: 4px; }
        h2 { font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 3px; }
        h3 { font-size: 12px; font-weight: 600; color: #1e40af; border-bottom: 1px solid #3b82f6; padding-bottom: 3px; margin-bottom: 6px; }
        /* الجدول */
        table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 10px; page-break-inside: auto; }
        thead { display: table-header-group; }
        tbody { display: table-row-group; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        th { background: #1e40af; color: #fff; padding: 5px 4px; font-weight: 600; text-align: center; border: 1px solid #1e3a8a; font-size: 9px; }
        td { padding: 4px 3px; text-align: center; border: 1px solid #e5e7eb; color: #374151; font-size: 10px; }
        td:nth-child(2) { text-align: ${isRTL ? 'right' : 'left'}; font-weight: 500; color: #111827; }
        td:last-child { font-weight: 600; color: #1e40af; background: #f8fafc; }
        tr:nth-child(even) td { background: #f9fafb; }
        tr:nth-child(even) td:last-child { background: #f1f5f9; }
        /* الألوان */
        .text-blue-600, .text-blue-800 { color: #1e40af !important; }
        .text-green-600, .text-green-700 { color: #059669 !important; }
        .text-red-600, .text-red-700 { color: #dc2626 !important; }
        .text-gray-500 { color: #6b7280 !important; }
        .text-gray-600 { color: #4b5563 !important; }
        .text-gray-700 { color: #374151 !important; }
        /* الخلفيات */
        .bg-gray-50 { background: #f8fafc !important; }
        .bg-green-50 { background: #ecfdf5 !important; }
        .bg-blue-50 { background: #eff6ff !important; }
        .bg-green-100 { background: #d1fae5 !important; }
        .bg-blue-100 { background: #dbeafe !important; }
        /* الحدود */
        .rounded-lg { border-radius: 6px; }
        .border { border: 1px solid #e5e7eb; }
        .border-b { border-bottom: 1px solid #e5e7eb; }
        .border-t { border-top: 1px solid #e5e7eb; }
        /* المسافات - مضغوطة */
        .p-4 { padding: 8px; }
        .p-3 { padding: 6px; }
        .mt-4 { margin-top: 6px; }
        .mt-6 { margin-top: 8px; }
        .mb-2 { margin-bottom: 4px; }
        .mb-4 { margin-bottom: 6px; }
        .pt-4 { padding-top: 6px; }
        .pt-6 { padding-top: 8px; }
        .pb-4 { padding-bottom: 6px; }
        .pb-6 { padding-bottom: 8px; }
        .space-y-6 > * + * { margin-top: 6px; }
        .space-y-4 > * + * { margin-top: 4px; }
        .space-y-2 > * + * { margin-top: 3px; }
        .space-y-1 > * + * { margin-top: 2px; }
        /* أحجام النص - مضغوطة */
        .text-3xl { font-size: 18px; font-weight: 800; }
        .text-2xl { font-size: 16px; font-weight: 700; }
        .text-xl { font-size: 14px; font-weight: 700; }
        .text-lg { font-size: 12px; font-weight: 600; }
        .text-base { font-size: ${opts.fontSize}px; }
        .text-sm { font-size: 10px; }
        .text-xs { font-size: 9px; }
        .font-bold { font-weight: 700; }
        .font-semibold { font-weight: 600; }
        /* الفليكس */
        .flex { display: flex; }
        .justify-between { justify-content: space-between; }
        .items-center { align-items: center; }
        .items-start { align-items: flex-start; }
        .gap-6 { gap: 10px; }
        .gap-4 { gap: 8px; }
        .gap-2 { gap: 4px; }
        .grid { display: grid; }
        .grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
        .grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
        /* اتجاه الأرقام */
        .dir-ltr { direction: ltr; display: inline-block; }
        /* إعدادات الطباعة */
        @media print {
          html, body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            height: 100%;
          }
          @page {
            size: ${opts.pageSize};
            margin: ${opts.margin};
          }
          .print-content {
            page-break-inside: avoid;
            transform: scale(0.95);
            transform-origin: top center;
          }
        }
      </style>
    </head>
    <body>
      <div class="print-content">
        ${content}
      </div>
      <script>
        // انتظار تحميل الخطوط ثم الطباعة
        document.fonts.ready.then(() => {
          setTimeout(() => {
            window.print();
            window.onafterprint = () => window.close();
          }, 500);
        });
      </script>
    </body>
    </html>
  `
}

export function openPrintWindow(content: string, options: PrintOptions = {}): Window | null {
  const printWindow = window.open('', '_blank', 'width=800,height=600')
  if (!printWindow) {
    const appLang = typeof window !== 'undefined' 
      ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      : 'ar'
    const message = appLang === 'en' 
      ? 'Please allow popups to download PDF'
      : 'يرجى السماح بالنوافذ المنبثقة لتحميل PDF'
    alert(message)
    return null
  }

  const html = generatePrintHTML(content, options)
  printWindow.document.write(html)
  printWindow.document.close()

  return printWindow
}

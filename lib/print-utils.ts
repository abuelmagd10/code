/**
 * 🚨 CORE SYSTEM - STANDARD ERP PRINT ENGINE 🚨
 * ==============================================================================
 * This file controls the print output for the ENTIRE system.
 * DO NOT MODIFY margins, fonts, or base styles without system-wide regression testing.
 * 
 * Governance:
 * 1. Margins MUST be 18mm 15mm 18mm 15mm (A4 Standard).
 * 2. Header/Footer heights are fixed.
 * 3. All tables must use fixed layout and numeric alignment rules.
 * 
 * @see docs/PRINT_STANDARDS.md
 * ==============================================================================
 */

export interface PrintOptions {
  lang?: 'ar' | 'en'
  direction?: 'rtl' | 'ltr'
  fontSize?: number
  title?: string
  pageSize?: 'A4' | 'Letter'
  pageOrientation?: 'portrait' | 'landscape'
  margin?: string
  companyName?: string
  // Header details
  companyAddress?: string
  companyPhone?: string
  companyLogo?: string  // URL or base64 image
  showHeader?: boolean
  extraHeader?: string // HTML string to be injected below the main header but above content
  // Footer details
  printedBy?: string
  showFooter?: boolean
  showPageNumbers?: boolean
  // Advanced
  customCSS?: string  // Additional CSS to inject
}

const defaultOptions: Required<PrintOptions> = {
  lang: 'ar',
  direction: 'rtl',
  fontSize: 10,
  title: 'Document',
  pageSize: 'A4',
  pageOrientation: 'portrait',
  margin: '15mm',
  companyName: '',
  companyAddress: '',
  companyPhone: '',
  companyLogo: '',
  showHeader: true,
  extraHeader: '',
  printedBy: 'System User',
  showFooter: true,
  showPageNumbers: true,
  customCSS: ''
}

/**
 * Generates a full HTML document with a unified ERP Print Layout.
 * Supports:
 * - Fixed Headers/Footers (repeated on every page via CSS)
 * - Table Header repetition
 * - A4 Strict scaling with Portrait/Landscape support
 * - Company logo integration
 * - Professional page breaks
 */
export function generatePrintHTML(
  content: string,
  options: PrintOptions = {}
): string {
  const opts = { ...defaultOptions, ...options }
  const fontFamily = opts.lang === 'ar'
    ? "'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif"
    : "'Segoe UI', Tahoma, Arial, sans-serif"

  const currentDate = new Date().toLocaleString(opts.lang === 'en' ? 'en-GB' : 'ar-EG')
  const currentDateShort = new Date().toLocaleDateString(opts.lang === 'en' ? 'en' : 'ar')

  // Logo HTML
  const logoHTML = opts.companyLogo ? `
    <div style="width: 80px; height: 80px; display: flex; align-items: center; justify-content: center;">
      <img src="${opts.companyLogo}" alt="Logo" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
    </div>
  ` : ''

  // Header HTML - Professional layout with logo
  const headerHTML = opts.showHeader ? `
    <div class="print-header-fixed">
      <div class="flex justify-between items-center h-full px-4">
        ${opts.direction === 'rtl' ? `
          <!-- RTL: Company Info (Right) | Title (Center) | Logo (Left) -->
          <div class="flex-1 text-right">
             <h2 class="text-xl font-bold text-gray-900 m-0">${opts.companyName}</h2>
             ${opts.companyAddress ? `<p class="text-xs text-gray-600 mt-1 m-0">${opts.companyAddress}</p>` : ''}
             ${opts.companyPhone ? `<p class="text-xs text-gray-600 mt-1 m-0">${opts.companyPhone}</p>` : ''}
          </div>
          <div class="flex-1 text-center">
             <h1 class="text-2xl font-extrabold text-gray-900 inline-block px-6 py-2 border-2 border-gray-800 rounded-md bg-gray-50 m-0">
               ${opts.title}
             </h1>
          </div>
          <div class="flex-none text-left w-[100px] flex justify-end">
             ${logoHTML || `<p class="text-sm font-bold text-gray-600 m-0">التاريخ: ${currentDateShort}</p>`}
          </div>
        ` : `
          <!-- LTR: Logo (Left) | Title (Center) | Company Info (Right) -->
          <div class="flex-none text-left w-[100px] flex justify-start">
             ${logoHTML || `<p class="text-sm font-bold text-gray-600 m-0">Date: ${currentDateShort}</p>`}
          </div>
          <div class="flex-1 text-center">
             <h1 class="text-2xl font-extrabold text-gray-900 inline-block px-6 py-2 border-2 border-gray-800 rounded-md bg-gray-50 m-0">
               ${opts.title}
             </h1>
          </div>
          <div class="flex-1 text-right">
             <h2 class="text-xl font-bold text-gray-900 m-0">${opts.companyName}</h2>
             ${opts.companyAddress ? `<p class="text-xs text-gray-600 mt-1 m-0">${opts.companyAddress}</p>` : ''}
             ${opts.companyPhone ? `<p class="text-xs text-gray-600 mt-1 m-0">${opts.companyPhone}</p>` : ''}
          </div>
        `}
      </div>
    </div>
  ` : ''

  // Footer HTML - Professional with page numbers
  const footerHTML = opts.showFooter ? `
    <div class="print-footer-fixed">
       <div class="flex justify-between items-center px-4 text-xs text-gray-500 h-full">
         <span>${opts.lang === 'en' ? 'Printed By:' : 'طبع بواسطة:'} <strong>${opts.printedBy}</strong></span>
         <span>${currentDate}</span>
         ${opts.showPageNumbers ? `<span class="page-number"></span>` : ''}
       </div>
    </div>
  ` : ''

  // Page orientation
  const pageOrientation = opts.pageOrientation === 'landscape' ? 'landscape' : 'portrait'

  return `
    <!DOCTYPE html>
    <html dir="${opts.direction}" lang="${opts.lang}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${opts.title}</title>
      ${opts.lang === 'ar' ? '<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet">' : ''}
      <style>
        /* ==================== BASE RESET ==================== */
        *, *::before, *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        html, body {
          width: 100%;
          height: 100%;
          font-family: ${fontFamily};
          font-size: ${opts.fontSize}pt;
          line-height: 1.4;
          color: #111827; /* gray-900 */
          background: #fff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        /* ==================== PROFESSIONAL A4 SETUP ==================== */
        @page {
          size: ${opts.pageSize} ${pageOrientation};
          /* Strict A4 margins as requested: 18mm 15mm 18mm 15mm */
          margin: 18mm 15mm 18mm 15mm; 
        }

        /* ==================== UTILITY CLASSES (TAILWIND-LIKE) ==================== */
        /* Flexbox */
        .flex { display: flex !important; }
        .flex-col { flex-direction: column !important; }
        .flex-row { flex-direction: row !important; }
        .items-center { align-items: center !important; }
        .items-start { align-items: flex-start !important; }
        .items-end { align-items: flex-end !important; }
        .justify-between { justify-content: space-between !important; }
        .justify-center { justify-content: center !important; }
        .justify-end { justify-content: flex-end !important; }
        .justify-start { justify-content: flex-start !important; }
        .flex-1 { flex: 1 1 0% !important; }
        .flex-none { flex: none !important; }
        .gap-1 { gap: 0.25rem !important; }
        .gap-2 { gap: 0.5rem !important; }
        .gap-3 { gap: 0.75rem !important; }
        .gap-4 { gap: 1rem !important; }
        .gap-6 { gap: 1.5rem !important; }

        /* Grid */
        .grid { display: grid !important; }
        .grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)) !important; }
        .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
        .grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
        .gap-y-2 { row-gap: 0.5rem !important; }
        .gap-x-4 { column-gap: 1rem !important; }

        /* Spacing */
        .m-0 { margin: 0 !important; }
        .mt-1 { margin-top: 0.25rem !important; }
        .mt-2 { margin-top: 0.5rem !important; }
        .mt-4 { margin-top: 1rem !important; }
        .mt-6 { margin-top: 1.5rem !important; }
        .mb-1 { margin-bottom: 0.25rem !important; }
        .mb-2 { margin-bottom: 0.5rem !important; }
        .mb-3 { margin-bottom: 0.75rem !important; }
        .mb-4 { margin-bottom: 1rem !important; }
        .p-0 { padding: 0 !important; }
        .p-1 { padding: 0.25rem !important; }
        .p-2 { padding: 0.5rem !important; }
        .p-3 { padding: 0.75rem !important; }
        .p-4 { padding: 1rem !important; }
        .px-2 { padding-left: 0.5rem !important; padding-right: 0.5rem !important; }
        .px-4 { padding-left: 1rem !important; padding-right: 1rem !important; }
        .px-6 { padding-left: 1.5rem !important; padding-right: 1.5rem !important; }
        .py-1 { padding-top: 0.25rem !important; padding-bottom: 0.25rem !important; }
        .py-2 { padding-top: 0.5rem !important; padding-bottom: 0.5rem !important; }
        .pb-2 { padding-bottom: 0.5rem !important; }

        /* Typography */
        .text-xs { font-size: 0.75rem !important; line-height: 1rem !important; }
        .text-sm { font-size: 0.875rem !important; line-height: 1.25rem !important; }
        .text-base { font-size: 1rem !important; line-height: 1.5rem !important; }
        .text-lg { font-size: 1.125rem !important; line-height: 1.75rem !important; }
        .text-xl { font-size: 1.25rem !important; line-height: 1.75rem !important; }
        .text-2xl { font-size: 1.5rem !important; line-height: 2rem !important; }
        .text-3xl { font-size: 1.875rem !important; line-height: 2.25rem !important; }
        
        .font-normal { font-weight: 400 !important; }
        .font-medium { font-weight: 500 !important; }
        .font-semibold { font-weight: 600 !important; }
        .font-bold { font-weight: 700 !important; }
        .font-extrabold { font-weight: 800 !important; }
        
        .text-left { text-align: left !important; }
        .text-center { text-align: center !important; }
        .text-right { text-align: right !important; }
        
        .text-white { color: #ffffff !important; }
        .text-gray-50 { color: #f9fafb !important; }
        .text-gray-100 { color: #f3f4f6 !important; }
        .text-gray-200 { color: #e5e7eb !important; }
        .text-gray-300 { color: #d1d5db !important; }
        .text-gray-400 { color: #9ca3af !important; }
        .text-gray-500 { color: #6b7280 !important; }
        .text-gray-600 { color: #4b5563 !important; }
        .text-gray-700 { color: #374151 !important; }
        .text-gray-800 { color: #1f2937 !important; }
        .text-gray-900 { color: #111827 !important; }
        .text-blue-600 { color: #2563eb !important; }
        .text-blue-800 { color: #1e40af !important; }
        .text-red-600 { color: #dc2626 !important; }
        .text-green-600 { color: #16a34a !important; }

        .uppercase { text-transform: uppercase !important; }
        .capitalize { text-transform: capitalize !important; }

        /* Images */
        img { max-width: 100% !important; height: auto !important; }

        /* Backgrounds */
        .bg-white { background-color: #ffffff !important; }
        .bg-gray-50 { background-color: #f9fafb !important; }
        .bg-gray-100 { background-color: #f3f4f6 !important; }
        .bg-gray-200 { background-color: #e5e7eb !important; }
        .bg-blue-50 { background-color: #eff6ff !important; }
        .bg-transparent { background-color: transparent !important; }

        /* Borders */
        .border { border: 1px solid #e5e7eb !important; }
        .border-t { border-top: 1px solid #e5e7eb !important; }
        .border-b { border-bottom: 1px solid #e5e7eb !important; }
        .border-l { border-left: 1px solid #e5e7eb !important; }
        .border-r { border-right: 1px solid #e5e7eb !important; }
        .border-0 { border-width: 0 !important; }
        .border-2 { border-width: 2px !important; }
        
        .border-gray-200 { border-color: #e5e7eb !important; }
        .border-gray-300 { border-color: #d1d5db !important; }
        .border-gray-800 { border-color: #1f2937 !important; }
        .border-blue-500 { border-color: #3b82f6 !important; }
        
        .rounded { border-radius: 0.25rem !important; }
        .rounded-md { border-radius: 0.375rem !important; }
        .rounded-lg { border-radius: 0.5rem !important; }

        /* Sizing */
        .w-full { width: 100% !important; }
        .h-full { height: 100% !important; }
        .w-auto { width: auto !important; }
        .w-\[50px\] { width: 50px !important; }
        .w-\[70px\] { width: 70px !important; }
        .w-\[100px\] { width: 100px !important; }
        .w-\[15\%\] { width: 15% !important; }

        /* Visibility */
        .hidden { display: none !important; }
        .block { display: block !important; }
        .inline-block { display: inline-block !important; }

        /* ==================== LAYOUT STRUCTURING ==================== */
        .print-header-fixed {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 90px;
          background: #f9fafb; /* Light gray background as requested */
          border-bottom: 2px solid #1f2937;
          z-index: 1000;
        }

        .print-footer-fixed {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 30px;
          background: #fff;
          border-top: 1px solid #e5e7eb;
          z-index: 1000;
        }

        .page-number:before {
          content: counter(page);
        }

        /* Safe Content Area */
        body {
          margin: 0; /* Reset body margin as @page handles it */
          padding-top: 100px; /* Header 90px + 10px gap */
          padding-bottom: 40px; /* Footer 30px + 10px gap */
        }

        .print-content {
          width: 100%;
        }

        /* ==================== TABLE STYLES (STRICT ERP) ==================== */
        table {
          width: 100% !important;
          border-collapse: collapse !important;
          margin-bottom: 1rem !important;
          font-size: 9pt !important;
          table-layout: fixed; /* Strict column widths */
        }

        thead {
          display: table-header-group !important;
        }
        
        tfoot {
          display: table-footer-group !important;
        }

        tr {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }

        th {
          background-color: #f3f4f6 !important; /* gray-100 */
          color: #111827 !important; /* gray-900 */
          font-weight: 700 !important;
          padding: 8px 6px !important;
          border: 1px solid #d1d5db !important; /* gray-300 */
          vertical-align: middle !important;
          white-space: nowrap !important;
        }

        td {
          padding: 6px 6px !important;
          border: 1px solid #e5e7eb !important; /* gray-200 */
          vertical-align: middle !important;
          color: #374151 !important; /* gray-700 */
        }

        /* Zebra Striping */
        tbody tr:nth-child(even) {
          background-color: #f9fafb !important; /* gray-50 */
        }

        /* Number Alignment */
        th.text-right, td.text-right {
          text-align: right !important;
          font-family: 'Courier New', monospace, sans-serif !important; /* Monospace for numbers */
        }

        th.text-center, td.text-center {
          text-align: center !important;
        }

        /* ==================== CUSTOM OVERRIDES ==================== */
        .double-underline {
          border-bottom: 3px double #1f2937 !important;
        }

        /* Print Specific Visibility */
        @media print {
          .no-print, .print\:hidden { display: none !important; }
          .print\:block { display: block !important; }
          .print\:flex { display: flex !important; }
          .print\:grid { display: grid !important; }
          
          /* Force Backgrounds */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }

        ${opts.customCSS || ''}
      </style>
    </head>
    <body onload="window.print()">
      <!-- Header -->
      ${headerHTML}

      <!-- Main Content -->
      <div class="print-content">
        ${opts.extraHeader ? opts.extraHeader : ''}
        ${content}
      </div>

      <!-- Footer -->
      ${footerHTML}

      <script>
        window.onafterprint = function() {
           window.close();
        };
      </script>
    </body>
    </html>
  `
}

export function openPrintWindow(content: string, options: PrintOptions = {}): Window | null {
  // Center window
  const width = 1024;
  const height = 800;
  const left = (window.screen.width / 2) - (width / 2);
  const top = (window.screen.height / 2) - (height / 2);

  const printWindow = window.open('', '_blank', `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`);

  if (!printWindow) {
    const appLang = options.lang || 'ar';
    const message = appLang === 'en'
      ? 'Please allow popups to download PDF/Print'
      : 'يرجى السماح بالنوافذ المنبثقة للطباعة أو تحميل PDF';
    alert(message);
    return null;
  }

  const html = generatePrintHTML(content, options);
  printWindow.document.write(html);
  printWindow.document.close();

  // Note: onload in body tag handles printing
  return printWindow;
}

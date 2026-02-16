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
      <div style="display: flex; justify-content: space-between; align-items: center; height: 100%; padding: 0 15px;">
        ${opts.direction === 'rtl' ? `
          <!-- RTL: Company Info (Right) | Title (Center) | Logo (Left) -->
          <div style="flex: 1; text-align: right;">
             <h2 style="margin: 0; font-size: 16pt; font-weight: bold; color: #1f2937;">${opts.companyName}</h2>
             ${opts.companyAddress ? `<p style="margin: 4px 0 0; font-size: 9pt; color: #4b5563;">${opts.companyAddress}</p>` : ''}
             ${opts.companyPhone ? `<p style="margin: 2px 0 0; font-size: 9pt; color: #4b5563;">${opts.companyPhone}</p>` : ''}
          </div>
          <div style="flex: 1; text-align: center;">
             <h1 style="margin: 0; font-size: 18pt; font-weight: 800; color: #111827; border: 2px solid #1f2937; display: inline-block; padding: 8px 24px; border-radius: 6px; background: #f9fafb;">
               ${opts.title}
             </h1>
          </div>
          <div style="flex: 0 0 auto; text-align: left;">
             ${logoHTML || `<p style="margin: 0; font-size: 10pt; font-weight: bold; color: #4b5563;">التاريخ: ${currentDateShort}</p>`}
          </div>
        ` : `
          <!-- LTR: Logo (Left) | Title (Center) | Company Info (Right) -->
          <div style="flex: 0 0 auto; text-align: left;">
             ${logoHTML || `<p style="margin: 0; font-size: 10pt; font-weight: bold; color: #4b5563;">Date: ${currentDateShort}</p>`}
          </div>
          <div style="flex: 1; text-align: center;">
             <h1 style="margin: 0; font-size: 18pt; font-weight: 800; color: #111827; border: 2px solid #1f2937; display: inline-block; padding: 8px 24px; border-radius: 6px; background: #f9fafb;">
               ${opts.title}
             </h1>
          </div>
          <div style="flex: 1; text-align: right;">
             <h2 style="margin: 0; font-size: 16pt; font-weight: bold; color: #1f2937;">${opts.companyName}</h2>
             ${opts.companyAddress ? `<p style="margin: 4px 0 0; font-size: 9pt; color: #4b5563;">${opts.companyAddress}</p>` : ''}
             ${opts.companyPhone ? `<p style="margin: 2px 0 0; font-size: 9pt; color: #4b5563;">${opts.companyPhone}</p>` : ''}
          </div>
        `}
      </div>
    </div>
  ` : ''

  // Footer HTML - Professional with page numbers
  const footerHTML = opts.showFooter ? `
    <div class="print-footer-fixed">
       <div style="padding: 0 20px; font-size: 9pt; color: #6b7280;">
         <span>${opts.lang === 'en' ? 'Printed By:' : 'طبع بواسطة:'} <strong>${opts.printedBy}</strong></span>
       </div>
       <div style="padding: 0 20px; font-size: 9pt; color: #6b7280;">
         <span>${currentDate}</span>
       </div>
       ${opts.showPageNumbers ? `
       <div style="padding: 0 20px; font-size: 9pt; color: #6b7280;">
         <span class="page-number"></span>
       </div>
       ` : ''}
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
        * { 
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
          color: #000;
          background: #fff;
        }
        
        /* ==================== PROFESSIONAL A4 SETUP (ZOHO BOOKS STANDARD) ==================== */
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        @page {
          size: ${opts.pageSize} ${pageOrientation};
          /* Professional margins matching enterprise ERP standards */
          margin: 20mm 15mm 20mm 15mm; /* top right bottom left */
        }
        
        html, body {
          width: 100%;
          height: 100%;
          margin: 0 !important;
          padding: 0 !important;
        }

        /* ==================== HEADER (PROFESSIONAL SPACING) ==================== */
        .print-header-fixed {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 90px; /* Reduced for better balance */
          padding: 12px 0; /* Internal spacing only */
          border-bottom: 2px solid #1f2937;
          background: #ffffff;
          z-index: 999;
        }

        /* ==================== FOOTER (PROFESSIONAL SPACING) ==================== */
        .print-footer-fixed {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 40px; /* Slightly larger for balance */
          padding: 8px 0; /* Internal spacing only */
          border-top: 1px solid #d1d5db;
          background: #f9fafb;
          z-index: 999;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        /* Page number counter */
        .page-number:before {
          content: counter(page);
        }

        /* ==================== CONTENT AREA (SAFE PRINT ZONE) ==================== */
        body {
          /* Safe print area - balanced spacing */
          margin: 0;
          padding: 100px 0 50px 0; /* top right bottom left */
          /* Header (90px) + gap (10px) = 100px */
          /* Footer (40px) + gap (10px) = 50px */
        }
        
        /* Content wrapper for additional safety */
        .print-content,
        main {
          width: 100%;
          max-width: 100%;
          margin: 0 auto;
          padding: 0;
        }
        
        /* ==================== TABLE ENHANCEMENTS (PROFESSIONAL ERP) ==================== */
        table { 
          width: 100% !important;
          border-collapse: collapse !important;
          margin-bottom: 16px !important;
          page-break-inside: auto;
          table-layout: fixed; /* Prevent column width fluctuation */
          font-size: 9pt;
        }
        
        /* Table Header - Repeat on every page */
        thead { 
          display: table-header-group !important;
          background-color: #f3f4f6 !important;
        }
        
        /* Table Footer */
        tfoot { 
          display: table-footer-group;
          font-weight: 700;
          background-color: #f9fafb !important;
        }
        
        /* Row Management - Prevent splitting */
        tr { 
          page-break-inside: avoid !important;
          page-break-after: auto;
        }
        
        /* Header Cells - Professional Styling */
        th { 
          background-color: #f3f4f6 !important;
          color: #111827 !important;
          font-weight: 700 !important;
          font-size: 9pt !important;
          padding: 10px 8px !important;
          border: 1px solid #d1d5db !important;
          text-align: ${opts.direction === 'rtl' ? 'right' : 'left'} !important;
          vertical-align: middle !important;
          line-height: 1.3;
          white-space: nowrap; /* Prevent header wrapping */
        }
        
        /* Data Cells - Clean and Organized */
        td { 
          padding: 8px !important;
          border: 1px solid #e5e7eb !important;
          vertical-align: middle !important;
          color: #1f2937 !important;
          font-size: 9pt !important;
          line-height: 1.4;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        /* Zebra Striping for Better Readability */
        tbody tr:nth-child(even) {
          background-color: #f9fafb !important;
        }
        
        tbody tr:nth-child(odd) {
          background-color: #ffffff !important;
        }
        
        /* Number Alignment - Always Right */
        td.text-right,
        th.text-right,
        td[class*="amount"],
        td[class*="price"],
        td[class*="total"],
        td[class*="quantity"],
        td[class*="discount"],
        td[class*="tax"] {
          text-align: right !important;
          font-family: 'Courier New', monospace; /* Monospace for numbers */
          direction: ltr !important; /* Numbers always LTR */
        }
        
        /* Text Alignment - Respect Direction */
        td.text-left,
        th.text-left {
          text-align: ${opts.direction === 'rtl' ? 'right' : 'left'} !important;
        }
        
        td.text-center,
        th.text-center {
          text-align: center !important;
        }
        
        /* Column Width Management */
        /* Item/Description columns - flexible */
        th:first-child,
        td:first-child {
          width: auto;
          min-width: 100px;
        }
        
        /* Number columns - fixed width */
        th.w-20,
        td.w-20,
        th[class*="quantity"],
        td[class*="quantity"] {
          width: 80px !important;
          min-width: 80px;
        }
        
        th.w-24,
        td.w-24,
        th[class*="price"],
        td[class*="price"],
        th[class*="amount"],
        td[class*="amount"] {
          width: 100px !important;
          min-width: 100px;
        }
        
        /* Total Row Styling */
        tr.font-bold,
        tfoot tr {
          font-weight: 700 !important;
          background-color: #f3f4f6 !important;
          border-top: 2px solid #1f2937 !important;
        }
        
        /* Summary/Total Cells */
        td.font-bold {
          font-weight: 700 !important;
        }
        
        /* Prevent Text Wrapping in Critical Cells */
        td.whitespace-nowrap,
        th.whitespace-nowrap {
          white-space: nowrap !important;
        }
        
        /* ==================== TYPOGRAPHY ==================== */
        h1 { font-size: 18pt; font-weight: 800; color: #111827; margin-bottom: 8px; }
        h2 { font-size: 16pt; font-weight: 700; color: #1f2937; margin-bottom: 6px; }
        h3 { font-size: 14pt; font-weight: 600; color: #374151; margin-bottom: 5px; }
        h4 { font-size: 12pt; font-weight: 600; color: #4b5563; margin-bottom: 4px; }
        p { margin-bottom: 6px; color: #1f2937; }
        
        /* ==================== HELPER CLASSES ==================== */
        /* No padding on print-content - @page margins are sufficient */
        
        .text-right { text-align: right; }
        .text-left { text-align: left; }
        .text-center { text-align: center; }
        .font-bold { font-weight: 700; }
        .font-semibold { font-weight: 600; }
        .no-print { display: none; }
        
        .page-break-before { page-break-before: always; }
        .page-break-after { page-break-after: always; }
        .page-break-avoid { page-break-inside: avoid; }
        
        /* ==================== CUSTOM CSS ==================== */
        ${opts.customCSS || ''}
      </style>
    </head>
    <body onload="window.print();">
      <!-- Fixed Header/Footer -->
      ${headerHTML}
      ${footerHTML}

      <!-- Main Content -->
      <div class="print-content">
        ${opts.extraHeader ? opts.extraHeader : ''}
        ${content}
      </div>
      
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

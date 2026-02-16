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
        
        /* ==================== A4 PAGE SETUP ==================== */
        @page {
          size: ${opts.pageSize} ${pageOrientation};
          margin-top: 20mm;    /* Space for header */
          margin-bottom: 15mm; /* Space for footer */
          margin-left: 15mm;   /* Side margins */
          margin-right: 15mm;  /* Side margins */
        }

        /* ==================== HEADER/FOOTER ==================== */
        .print-header-fixed {
          position: fixed;
          top: 0; 
          left: 0; 
          right: 0;
          height: 100px;
          border-bottom: 2px solid #1f2937;
          background: #ffffff;
          z-index: 999;
          /* No padding - margins handled by @page */
        }

        .print-footer-fixed {
          position: fixed;
          bottom: 0; 
          left: 0; 
          right: 0;
          height: 35px;
          border-top: 1px solid #d1d5db;
          background: #f9fafb;
          z-index: 999;
          display: flex;
          justify-content: space-between;
          align-items: center;
          /* No padding - margins handled by @page */
        }

        /* Page number counter */
        .page-number:before {
          content: counter(page);
        }

        /* ==================== BODY PADDING ==================== */
        body {
          /* Only top/bottom padding for header/footer clearance */
          padding-top: 105px;   /* Header height + small gap */
          padding-bottom: 40px; /* Footer height + small gap */
          /* NO side padding - handled by @page margins */
        }
        
        /* ==================== TABLE ENHANCEMENTS ==================== */
        table { 
          width: 100%; 
          border-collapse: collapse; 
          margin-bottom: 12px;
          page-break-inside: auto;
        }
        
        thead { 
          display: table-header-group; /* Repeat on every page */
        }
        
        tfoot { 
          display: table-footer-group;
        }
        
        tr { 
          page-break-inside: avoid; 
          page-break-after: auto;
        }
        
        th { 
          background-color: #f3f4f6; 
          color: #111827; 
          font-weight: 700; 
          padding: 8px 6px; 
          border: 1px solid #d1d5db;
          text-align: ${opts.direction === 'rtl' ? 'right' : 'left'};
        }
        
        td { 
          padding: 6px; 
          border: 1px solid #e5e7eb; 
          vertical-align: top;
          color: #1f2937;
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

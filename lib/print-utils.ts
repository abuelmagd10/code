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
  companyName?: string
  // Header details
  companyAddress?: string
  companyPhone?: string
  showHeader?: boolean
  extraHeader?: string // HTML string to be injected below the main header but above content
  // Footer details
  printedBy?: string
  showFooter?: boolean
}

const defaultOptions: Required<PrintOptions> = {
  lang: 'ar',
  direction: 'rtl',
  fontSize: 10,
  title: 'Document',
  pageSize: 'A4',
  margin: '15mm',
  companyName: '',
  companyAddress: '',
  companyPhone: '',
  showHeader: true,
  extraHeader: '',
  printedBy: 'System User',
  showFooter: true
}

/**
 * Generates a full HTML document with a unified ERP Print Layout.
 * Supports:
 * - Fixed Headers/Footers (repeated on every page via CSS)
 * - Table Header repetition
 * - A4 Strict scaling
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

  // Header HTML - Using table layout usually ensures space reservation better than fixed
  // But for modern browsers, fixed + body margin is standard.
  // We will Use a standard HTML structure with fixed header/footer classes defined in global layout.

  // NOTE: In strict ERP systems, logos usually on left for EN, right for AR.
  // We will leverage the direction of the body 'rtl'/'ltr'.

  const headerHTML = opts.showHeader ? `
    <div class="print-header-fixed">
      <div style="display: flex; justify-content: space-between; align-items: center; height: 100%; padding: 0 10px;">
        <div style="width: 33%; text-align: ${opts.direction === 'rtl' ? 'right' : 'left'};">
           <h2 style="margin: 0; font-size: 16pt; font-weight: bold;">${opts.companyName}</h2>
           ${opts.companyAddress ? `<p style="margin: 4px 0 0; font-size: 9pt;">${opts.companyAddress}</p>` : ''}
           ${opts.companyPhone ? `<p style="margin: 2px 0 0; font-size: 9pt;">${opts.companyPhone}</p>` : ''}
        </div>
        <div style="width: 33%; text-align: center;">
           <h1 style="margin: 0; font-size: 18pt; font-weight: 800; border: 2px solid #000; display: inline-block; padding: 5px 20px; border-radius: 4px;">
             ${opts.title}
           </h1>
        </div>
        <div style="width: 33%; text-align: ${opts.direction === 'rtl' ? 'left' : 'right'};">
           <!-- Placeholder for Logo if image provided, usually handled by caller passing image in content, but here we can't easily access company logo URL globally without passing it in. -->
           <!-- For now, we rely on the caller to inject the logo, or we display Date/Ref -->
           <p style="margin: 0; font-size: 10pt; font-weight: bold;">Date: ${new Date().toLocaleDateString(opts.lang === 'en' ? 'en' : 'ar')}</p>
        </div>
      </div>
    </div>
  ` : ''

  const footerHTML = opts.showFooter ? `
    <div class="print-footer-fixed">
       <div style="padding: 0 20px;">
         <span>${opts.lang === 'en' ? 'Printed By:' : 'طبع بواسطة:'} ${opts.printedBy}</span>
       </div>
       <div style="padding: 0 20px;">
         <!-- Browser adds page numbers automatically in margin, but if we want custom ones we need CSS counters. Browsers often cut custom CSS counters in footer. We rely on browser default for "Page X of Y" or use simpler "Page" text -->
         <span>${currentDate}</span>
       </div>
    </div>
  ` : ''

  return `
    <!DOCTYPE html>
    <html dir="${opts.direction}" lang="${opts.lang}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${opts.title}</title>
      ${opts.lang === 'ar' ? '<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet">' : ''}
      <style>
        /* Base Reset */
        * { box-sizing: border-box; }
        html, body {
          width: 100%; height: 100%; margin: 0; padding: 0;
          font-family: ${fontFamily};
        }
        
        /* A4 Page Setup */
        @page {
          size: ${opts.pageSize};
          margin: ${opts.margin};
        }

        /* Fixed Header/Footer CSS */
        .print-header-fixed {
          position: fixed;
          top: 0; left: 0; right: 0;
          height: 100px; /* Space for Header */
          border-bottom: 2px solid #000;
          background: #fff;
          z-index: 999;
        }

        .print-footer-fixed {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          height: 30px;
          border-top: 1px solid #ccc;
          background: #fff;
          z-index: 999;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 9pt;
        }

        /* Body Padding to prevent overlap with fixed elements */
        body {
          padding-top: 110px; /* Header Height + Gap */
          padding-bottom: 40px; /* Footer Height + Gap */
        }
        
        /* Table enhancements */
        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        th { background-color: #f3f4f6; color: #000; font-weight: bold; padding: 5px; border: 1px solid #ccc; }
        td { padding: 5px; border: 1px solid #ccc; vertical-align: top; }
        
        /* Repeat Header */
        thead { display: table-header-group; }
        tr { break-inside: avoid; }

        /* Typography */
        h1, h2, h3, h4, h5, h6 { color: #000; margin-bottom: 5px; }
        p { margin-bottom: 5px; color: #000; }
        
        /* Helper Classes */
        .text-right { text-align: right; }
        .text-left { text-align: left; }
        .text-center { text-align: center; }
        .font-bold { font-weight: bold; }
        .no-print { display: none; }
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

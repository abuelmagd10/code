# ERPPageHeader - Usage Guide & Examples

## 📖 Overview

`ERPPageHeader` is the unified, professional page header component for all ERP pages. It provides consistent navigation, layout, and user experience across 146+ pages.

---

## 🎯 Key Features

- ✅ **Smart Back Button** - Shows only on detail/form/report pages
- ✅ **RTL/LTR Support** - Automatic arrow direction based on language
- ✅ **Mandatory backHref** - For financial pages (no router.back())
- ✅ **Multi-Company/Branch** - Badge support via `extra` prop
- ✅ **Responsive Design** - Mobile, tablet, desktop optimized
- ✅ **Accessibility** - ARIA labels, keyboard navigation
- ✅ **Consistent Spacing** - No layout breaks

---

## 📦 Installation

```tsx
import { ERPPageHeader, useERPLanguage } from "@/components/erp-page-header"
```

---

## 🔧 Basic Usage

### Example 1: List Page (No Back Button)

```tsx
import { ERPPageHeader, useERPLanguage } from "@/components/erp-page-header"
import { Plus, Download } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function SalesOrdersPage() {
  const lang = useERPLanguage()
  
  return (
    <div>
      <ERPPageHeader
        title={lang === "ar" ? "أوامر البيع" : "Sales Orders"}
        description={lang === "ar" ? "إدارة جميع أوامر البيع" : "Manage all sales orders"}
        variant="list"
        lang={lang}
        actions={
          <>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              {lang === "ar" ? "تصدير" : "Export"}
            </Button>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {lang === "ar" ? "أمر جديد" : "New Order"}
            </Button>
          </>
        }
      />
      
      {/* Page content */}
    </div>
  )
}
```

---

### Example 2: Detail Page (With Back Button)

```tsx
import { ERPPageHeader, useERPLanguage } from "@/components/erp-page-header"
import { Printer, Edit } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export default function SalesOrderDetailPage({ params }: { params: { id: string } }) {
  const lang = useERPLanguage()
  const order = // ... fetch order data
  
  return (
    <div>
      <ERPPageHeader
        title={`${lang === "ar" ? "أمر بيع" : "Sales Order"} #${order.so_number}`}
        description={`${lang === "ar" ? "العميل:" : "Customer:"} ${order.customer_name}`}
        variant="detail"
        backHref="/sales-orders" // ✅ Explicit path (recommended)
        lang={lang}
        actions={
          <>
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              {lang === "ar" ? "طباعة" : "Print"}
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/sales-orders/${order.id}/edit`}>
                <Edit className="h-4 w-4 mr-2" />
                {lang === "ar" ? "تعديل" : "Edit"}
              </Link>
            </Button>
          </>
        }
        extra={
          <>
            <Badge variant={order.status === 'approved' ? 'success' : 'warning'}>
              {order.status_label}
            </Badge>
            <Badge variant="outline">
              {order.branch_name}
            </Badge>
          </>
        }
      />
      
      {/* Page content */}
    </div>
  )
}
```

---

### Example 3: Form Page (Create/Edit)

```tsx
import { ERPPageHeader, useERPLanguage } from "@/components/erp-page-header"
import { Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function CreateSalesOrderPage() {
  const lang = useERPLanguage()
  
  return (
    <div>
      <ERPPageHeader
        title={lang === "ar" ? "أمر بيع جديد" : "New Sales Order"}
        description={lang === "ar" ? "إنشاء أمر بيع جديد" : "Create a new sales order"}
        variant="form"
        backHref="/sales-orders" // ✅ Always provide backHref for forms
        lang={lang}
        actions={
          <>
            <Button variant="outline" onClick={handleCancel}>
              <X className="h-4 w-4 mr-2" />
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={handleSave}>
              <Save className="h-4 w-4 mr-2" />
              {lang === "ar" ? "حفظ" : "Save"}
            </Button>
          </>
        }
      />
      
      {/* Form content */}
    </div>
  )
}
```

---

### Example 4: Report Page

```tsx
import { ERPPageHeader, useERPLanguage } from "@/components/erp-page-header"
import { Download, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function InventoryReportPage() {
  const lang = useERPLanguage()
  
  return (
    <div>
      <ERPPageHeader
        title={lang === "ar" ? "تقرير المخزون" : "Inventory Report"}
        description={lang === "ar" ? "تقرير شامل لحركة المخزون" : "Comprehensive inventory movement report"}
        variant="report"
        backHref="/reports" // ✅ Always provide backHref
        lang={lang}
        actions={
          <>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              {lang === "ar" ? "تصدير Excel" : "Export Excel"}
            </Button>
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              {lang === "ar" ? "طباعة" : "Print"}
            </Button>
          </>
        }
      />
      
      {/* Report content */}
    </div>
  )
}
```

---

### Example 5: Financial Page (⚠️ Mandatory backHref)

```tsx
import { ERPPageHeader, useERPLanguage } from "@/components/erp-page-header"
import { Printer, Edit, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const lang = useERPLanguage()
  const invoice = // ... fetch invoice data
  
  return (
    <div>
      <ERPPageHeader
        title={`${lang === "ar" ? "فاتورة" : "Invoice"} #${invoice.invoice_number}`}
        description={`${lang === "ar" ? "العميل:" : "Customer:"} ${invoice.customer_name}`}
        variant="detail"
        backHref="/invoices" // ⚠️ MANDATORY for financial pages
        lang={lang}
        actions={
          <>
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              {lang === "ar" ? "طباعة" : "Print"}
            </Button>
            {invoice.status === 'draft' && (
              <Button onClick={handleApprove}>
                <CheckCircle className="h-4 w-4 mr-2" />
                {lang === "ar" ? "اعتماد" : "Approve"}
              </Button>
            )}
          </>
        }
        extra={
          <>
            <Badge variant={invoice.status === 'posted' ? 'success' : invoice.status === 'approved' ? 'default' : 'secondary'}>
              {invoice.status_label}
            </Badge>
            {invoice.company_name && (
              <Badge variant="outline">
                {invoice.company_name}
              </Badge>
            )}
            {invoice.branch_name && (
              <Badge variant="outline">
                {invoice.branch_name}
              </Badge>
            )}
          </>
        }
      />
      
      {/* Invoice content */}
    </div>
  )
}
```

---

## 📋 Props Reference

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | **Required** | Page title |
| `description` | `string` | `undefined` | Brief page description |
| `variant` | `"list" \| "detail" \| "form" \| "report"` | `"list"` | Page type (determines back button) |
| `backHref` | `string` | `undefined` | Back navigation path (⚠️ mandatory for financial pages) |
| `backLabel` | `string` | `"رجوع" / "Back"` | Back button label |
| `hideBackButton` | `boolean` | `false` | Force hide back button |
| `actions` | `ReactNode` | `undefined` | Action buttons (Save, Print, etc.) |
| `extra` | `ReactNode` | `undefined` | Additional content (badges, breadcrumbs) |
| `lang` | `"ar" \| "en"` | `"ar"` | Current language |
| `className` | `string` | `""` | Additional CSS classes |

---

## 🚨 Important Rules

### 1. Financial Pages MUST Use backHref

```tsx
// ❌ BAD - Do NOT do this for financial pages
<ERPPageHeader
  title="Invoice #123"
  variant="detail"
  // Missing backHref - will use router.back()
/>

// ✅ GOOD - Always provide backHref for financial pages
<ERPPageHeader
  title="Invoice #123"
  variant="detail"
  backHref="/invoices" // ✅ Explicit path
/>
```

**Financial pages include:**
- Invoices (`/invoices/[id]`)
- Bills (`/bills/[id]`)
- Journal Entries (`/journal-entries/[id]`)
- Receipts (`/receipts/[id]`)
- Payments (`/payments/[id]`)
- Payroll (`/payroll/*`)
- Financial Reports

---

### 2. No Standalone Back Buttons

```tsx
// ❌ BAD - Do NOT create custom back buttons
<Button onClick={() => router.back()}>
  <ArrowLeft /> Back
</Button>

// ✅ GOOD - Use ERPPageHeader
<ERPPageHeader
  variant="detail"
  backHref="/parent-page"
/>
```

---

### 3. Use `extra` for Badges

```tsx
// ✅ GOOD - Use extra prop for badges
<ERPPageHeader
  title="Sales Order #123"
  variant="detail"
  extra={
    <>
      <Badge variant="success">Approved</Badge>
      <Badge variant="outline">Main Branch</Badge>
      <Badge variant="secondary">USD</Badge>
    </>
  }
/>
```

---

## 🎨 Styling Guidelines

### Consistent Spacing

The component uses `mb-6` by default. Do NOT add extra margins:

```tsx
// ❌ BAD
<ERPPageHeader className="mb-8" /> {/* Don't override spacing */}

// ✅ GOOD
<ERPPageHeader /> {/* Use default spacing */}
```

### Custom Classes

Only add classes for special cases:

```tsx
// ✅ OK - Special case
<ERPPageHeader className="print:hidden" />
```

---

## 🧪 Testing Checklist

Before deploying a page with ERPPageHeader:

- [ ] Back button shows/hides correctly based on variant
- [ ] Back button navigates to correct page
- [ ] RTL/LTR arrow direction is correct
- [ ] Actions render and work correctly
- [ ] Extra content (badges) displays properly
- [ ] Responsive on mobile/tablet/desktop
- [ ] No layout breaks or spacing issues
- [ ] Accessibility: keyboard navigation works
- [ ] Accessibility: screen reader announces correctly

---

## 🔄 Migration Guide

### From Old Pattern to ERPPageHeader

**Before:**
```tsx
<div className="flex items-center gap-4 mb-6">
  <Button onClick={() => router.back()}>
    {appLang === 'ar' ? <ArrowRight /> : <ArrowLeft />}
  </Button>
  <h1>{title}</h1>
  <div className="ml-auto">
    <Button>Action</Button>
  </div>
</div>
```

**After:**
```tsx
<ERPPageHeader
  title={title}
  variant="detail"
  backHref="/parent-page"
  lang={appLang}
  actions={<Button>Action</Button>}
/>
```

---

## 📞 Support

For questions or issues:
1. Check this guide
2. Review examples above
3. Check implementation plan
4. Contact ERP team

---

**Version:** 2.0.0  
**Last Updated:** 2026-02-15  
**Component:** `components/erp-page-header.tsx`
